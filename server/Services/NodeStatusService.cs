using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Klippyface.Server.Services;

public class NodeStatusService : IDisposable
{
    private readonly ConcurrentDictionary<string, NodeConnection> _connections = new();
    private readonly ConcurrentDictionary<string, RefreshState> _refreshes = new();
    private readonly ILogger<NodeStatusService> _logger;
    private readonly Timer _cleanupTimer;
    private static readonly TimeSpan HeartbeatTimeout = TimeSpan.FromSeconds(90);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromSeconds(30);

    // Each refresh_config makes the node download and apply its whole config, so
    // requests closer together than this collapse into one trailing send.
    private static readonly TimeSpan MinRefreshInterval = TimeSpan.FromSeconds(5);

    public NodeStatusService(ILogger<NodeStatusService> logger)
    {
        _logger = logger;
        _cleanupTimer = new Timer(_ => CleanupStaleConnections(), null, CleanupInterval, CleanupInterval);
    }

    public void Register(string nodeId, WebSocket ws, uint configVersion)
    {
        var conn = new NodeConnection(nodeId, ws, new SemaphoreSlim(1, 1), configVersion, DateTime.UtcNow, DateTime.UtcNow);
        _connections[nodeId] = conn;
    }

    public void UpdateConfigVersion(string nodeId, uint configVersion)
    {
        if (_connections.TryGetValue(nodeId, out var conn))
        {
            conn = conn with { ConfigVersion = configVersion };
            _connections[nodeId] = conn;
        }
    }

    /// <summary>
    /// Removes the node's entry only if it still belongs to <paramref name="ws"/>. A
    /// rebooted node reconnects before the server notices its old socket is dead;
    /// when that old socket finally errors, it must not unregister the new one.
    /// </summary>
    public void Unregister(string nodeId, WebSocket ws)
    {
        if (_connections.TryGetValue(nodeId, out var conn) && ReferenceEquals(conn.Socket, ws))
            _connections.TryRemove(new KeyValuePair<string, NodeConnection>(nodeId, conn));
    }

    public bool Heartbeat(string nodeId)
    {
        if (_connections.TryGetValue(nodeId, out var conn))
        {
            conn = conn with { LastHeartbeat = DateTime.UtcNow };
            _connections[nodeId] = conn;
            return true;
        }
        return false;
    }

    public bool IsOnline(string nodeId)
    {
        return _connections.TryGetValue(nodeId, out var conn)
            && (DateTime.UtcNow - conn.LastHeartbeat) < HeartbeatTimeout;
    }

    public IEnumerable<string> GetConnectedNodeIds()
    {
        return _connections.Keys;
    }

    public bool TryGetSocket(string nodeId, out WebSocket? ws)
    {
        if (_connections.TryGetValue(nodeId, out var conn))
        {
            ws = conn.Socket;
            return true;
        }
        ws = null;
        return false;
    }

    public async Task SendToNodeAsync(string nodeId, JsonObject message)
    {
        if (!_connections.TryGetValue(nodeId, out var conn) || conn.Socket.State != WebSocketState.Open)
        {
            _logger.LogDebug("Not sending {Type} to {Node}: {State}", message["type"], nodeId,
                conn is null ? "not connected" : conn.Socket.State);
            return;
        }

        // WebSocket allows only one outstanding SendAsync; saves and the hello reply can overlap.
        await conn.SendLock.WaitAsync();
        try
        {
            await SendToSocketAsync(conn.Socket, message);
            _logger.LogDebug("Sent {Type} to {Node}", message["type"], nodeId);
        }
        finally
        {
            conn.SendLock.Release();
        }
    }

    /// <summary>
    /// Asks the node to re-fetch its config, at most once per <see cref="MinRefreshInterval"/>.
    /// Never throws and never blocks the caller on the socket; the config version must
    /// already be saved, so a node that misses this still catches up on its next hello.
    /// </summary>
    public void RequestRefresh(string nodeId)
    {
        var state = _refreshes.GetOrAdd(nodeId, _ => new RefreshState());
        TimeSpan delay;
        lock (state)
        {
            if (state.Scheduled)
            {
                _logger.LogDebug("Refresh for {Node} already scheduled", nodeId);
                return;
            }
            state.Scheduled = true;
            var since = DateTime.UtcNow - state.LastSent;
            delay = since >= MinRefreshInterval ? TimeSpan.Zero : MinRefreshInterval - since;
        }

        _ = Task.Run(async () =>
        {
            if (delay > TimeSpan.Zero) await Task.Delay(delay);
            lock (state)
            {
                state.Scheduled = false;
                state.LastSent = DateTime.UtcNow;
            }
            try
            {
                await SendToNodeAsync(nodeId, new JsonObject { ["type"] = "refresh_config" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "refresh_config to {Node} failed", nodeId);
            }
        });
    }

    private void CleanupStaleConnections()
    {
        var cutoff = DateTime.UtcNow - HeartbeatTimeout;
        foreach (var kvp in _connections)
        {
            if (kvp.Value.LastHeartbeat < cutoff)
            {
                _connections.TryRemove(kvp.Key, out _);
            }
        }
    }

    private static async Task SendToSocketAsync(WebSocket ws, JsonObject message)
    {
        if (ws.State != WebSocketState.Open) return;
        var json = message.ToJsonString();
        var bytes = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public void Dispose()
    {
        _cleanupTimer.Dispose();
    }

    private class RefreshState
    {
        public bool Scheduled;
        public DateTime LastSent = DateTime.MinValue;
    }

    private record NodeConnection(
        string NodeId,
        WebSocket Socket,
        SemaphoreSlim SendLock,
        uint ConfigVersion,
        DateTime ConnectedAt,
        DateTime LastHeartbeat
    );
}
