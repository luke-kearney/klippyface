using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>A JSON-RPC error reply from Moonraker, e.g. 503 while Klipper isn't ready.</summary>
public sealed class MoonrakerRpcException(string method, int code, string message)
    : Exception($"{method}: {message} ({code})")
{
    public int Code { get; } = code;
}

/// <summary>
/// One WebSocket connection to Moonraker: send requests and await their replies,
/// and read notifications in the order they arrived.
/// </summary>
public sealed class MoonrakerRpcClient : IAsyncDisposable
{
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);

    private readonly ClientWebSocket _socket = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonNode?>> _pending = new();
    private readonly Channel<JsonObject> _notifications = Channel.CreateUnbounded<JsonObject>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = true });
    private Task _reader = Task.CompletedTask;
    private int _nextId;

    private MoonrakerRpcClient() { }

    /// <summary>Notifications (notify_*) in arrival order. Completes when the connection drops.</summary>
    public ChannelReader<JsonObject> Notifications => _notifications.Reader;

    public static async Task<MoonrakerRpcClient> ConnectAsync(Uri uri, string? apiKey, CancellationToken ct)
    {
        var client = new MoonrakerRpcClient();
        if (!string.IsNullOrEmpty(apiKey))
            client._socket.Options.SetRequestHeader("X-Api-Key", apiKey);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(RequestTimeout);
        try
        {
            await client._socket.ConnectAsync(uri, timeout.Token);
        }
        catch
        {
            client._socket.Dispose();
            throw;
        }

        client._reader = client.ReadLoopAsync();
        return client;
    }

    /// <summary>Send a request and wait for its result. Throws <see cref="MoonrakerRpcException"/> on an error reply.</summary>
    public async Task<JsonNode?> CallAsync(string method, JsonObject? parameters, CancellationToken ct)
    {
        var id = Interlocked.Increment(ref _nextId);
        var reply = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = reply;

        var request = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = method, ["id"] = id };
        if (parameters is not null)
            request["params"] = parameters;

        try
        {
            await _sendLock.WaitAsync(ct);
            try
            {
                await _socket.SendAsync(Encoding.UTF8.GetBytes(request.ToJsonString()),
                    WebSocketMessageType.Text, true, ct);
            }
            finally
            {
                _sendLock.Release();
            }

            var message = await reply.Task.WaitAsync(RequestTimeout, ct)
                ?? throw new WebSocketException("Connection closed before a reply");
            if (message["error"] is JsonObject error)
                throw new MoonrakerRpcException(method,
                    error["code"]?.GetValue<int>() ?? 0, error["message"]?.GetValue<string>() ?? "error");
            return message["result"];
        }
        finally
        {
            _pending.TryRemove(id, out _);
        }
    }

    private async Task ReadLoopAsync()
    {
        var buffer = new byte[16 * 1024];
        using var text = new MemoryStream();
        try
        {
            while (_socket.State == WebSocketState.Open)
            {
                var result = await _socket.ReceiveAsync(buffer, CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) break;

                text.Write(buffer, 0, result.Count);
                if (!result.EndOfMessage) continue;

                JsonObject? message = null;
                try
                {
                    message = JsonNode.Parse(text.GetBuffer().AsSpan(0, (int)text.Length)) as JsonObject;
                }
                catch (JsonException)
                {
                }
                text.SetLength(0);

                if (message is null) continue;
                if (message["id"] is JsonValue idValue && idValue.TryGetValue<int>(out var id))
                {
                    if (_pending.TryGetValue(id, out var waiter))
                        waiter.TrySetResult(message);
                }
                else if (message["method"] is not null)
                {
                    _notifications.Writer.TryWrite(message);
                }
            }
        }
        catch (Exception e) when (e is WebSocketException or ObjectDisposedException or OperationCanceledException)
        {
            // Dropped; the notification channel completing tells the owner
        }
        finally
        {
            _notifications.Writer.TryComplete();
            foreach (var waiter in _pending.Values)
                waiter.TrySetResult(null);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_socket.State == WebSocketState.Open)
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, timeout.Token);
            }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException)
            {
            }
        }
        _socket.Abort();
        await _reader.ContinueWith(_ => { }, TaskScheduler.Default);
        _socket.Dispose();
        _sendLock.Dispose();
    }
}
