using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Klippyface.Server.Services;

public class NodeStatusService : IDisposable
{
    private readonly ConcurrentDictionary<string, NodeConnection> _connections = new();
    private readonly Timer _cleanupTimer;
    private static readonly TimeSpan HeartbeatTimeout = TimeSpan.FromSeconds(90);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromSeconds(30);

    public NodeStatusService()
    {
        _cleanupTimer = new Timer(_ => CleanupStaleConnections(), null, CleanupInterval, CleanupInterval);
    }

    public void Register(string nodeId, WebSocket ws, uint configVersion)
    {
        var conn = new NodeConnection(nodeId, ws, configVersion, DateTime.UtcNow, DateTime.UtcNow);
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

    public void Unregister(string nodeId)
    {
        _connections.TryRemove(nodeId, out _);
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
        if (_connections.TryGetValue(nodeId, out var conn) && conn.Socket.State == WebSocketState.Open)
        {
            await SendToSocketAsync(conn.Socket, message);
        }
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

    private record NodeConnection(
        string NodeId,
        WebSocket Socket,
        uint ConfigVersion,
        DateTime ConnectedAt,
        DateTime LastHeartbeat
    );
}
