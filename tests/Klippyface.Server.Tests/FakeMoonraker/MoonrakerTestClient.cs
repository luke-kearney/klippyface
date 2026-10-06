using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace Klippyface.Server.Tests.FakeMoonraker;

/// <summary>A bare JSON-RPC WebSocket client for poking at a (fake) Moonraker.</summary>
public sealed class MoonrakerTestClient : IAsyncDisposable
{
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(5);

    private readonly ClientWebSocket _socket = new();
    // A background reader fills this: cancelling a WebSocket receive would abort the socket
    private readonly Channel<JsonObject> _inbox = Channel.CreateUnbounded<JsonObject>();
    private Task _reader = Task.CompletedTask;
    private int _nextId;

    private MoonrakerTestClient() { }

    /// <summary>True once the server has closed or dropped the connection.</summary>
    public bool Closed => _reader.IsCompleted;

    public static async Task<MoonrakerTestClient> ConnectAsync(Uri url)
    {
        var client = new MoonrakerTestClient();
        await client._socket.ConnectAsync(url, CancellationToken.None);
        client._reader = client.ReadLoopAsync();
        return client;
    }

    private async Task ReadLoopAsync()
    {
        var buffer = new byte[64 * 1024];
        using var text = new MemoryStream();
        try
        {
            while (true)
            {
                var result = await _socket.ReceiveAsync(buffer, CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) break;

                text.Write(buffer, 0, result.Count);
                if (!result.EndOfMessage) continue;

                _inbox.Writer.TryWrite(JsonNode.Parse(text.ToArray())!.AsObject());
                text.SetLength(0);
            }
        }
        catch (WebSocketException)
        {
            // Dropped by the server
        }
        finally
        {
            _inbox.Writer.TryComplete();
        }
    }

    /// <summary>Send a request and wait for its reply, skipping any notifications in between.</summary>
    public async Task<JsonObject> CallAsync(string method, JsonObject? parameters = null)
    {
        var id = ++_nextId;
        var request = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = method, ["id"] = id };
        if (parameters is not null)
            request["params"] = parameters;

        await SendRawAsync(request.ToJsonString());

        while (true)
        {
            var message = await ReceiveAsync() ?? throw new TimeoutException($"No reply to {method}");
            if (message["id"]?.GetValue<int>() == id)
                return message;
        }
    }

    public Task SendRawAsync(string text) =>
        _socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, CancellationToken.None);

    public Task<JsonObject> SubscribeAsync(JsonObject objects) =>
        CallAsync("printer.objects.subscribe", new JsonObject { ["objects"] = objects });

    /// <summary>Wait for the next notification with this method; null if none arrives in time.</summary>
    public async Task<JsonObject?> NextNotificationAsync(string method, TimeSpan? timeout = null)
    {
        while (await ReceiveAsync(timeout) is { } message)
        {
            if (message["method"]?.GetValue<string>() == method)
                return message;
        }
        return null;
    }

    /// <summary>The next message of any kind; null on timeout or once the connection has gone.</summary>
    public async Task<JsonObject?> ReceiveAsync(TimeSpan? timeout = null)
    {
        using var cts = new CancellationTokenSource(timeout ?? DefaultTimeout);
        try
        {
            return await _inbox.Reader.ReadAsync(cts.Token);
        }
        catch (Exception e) when (e is OperationCanceledException or ChannelClosedException)
        {
            return null;
        }
    }

    /// <summary>Wait until the server drops the connection.</summary>
    public Task WaitForCloseAsync() => _reader.WaitAsync(DefaultTimeout);

    public async ValueTask DisposeAsync()
    {
        if (_socket.State == WebSocketState.Open)
        {
            try
            {
                // Only send our close; the read loop is still receiving the server's reply
                await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            }
            catch (WebSocketException)
            {
            }
        }
        await _reader.WaitAsync(DefaultTimeout).ContinueWith(_ => { });
        _socket.Dispose();
    }
}
