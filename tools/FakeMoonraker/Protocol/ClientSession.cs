using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace FakeMoonraker.Protocol;

/// <summary>
/// One connected WebSocket client: its subscription, what it was last sent,
/// and a single writer so sends never overlap.
/// </summary>
public sealed class ClientSession(int id, WebSocket socket)
{
    private readonly Channel<string> _outbox = Channel.CreateUnbounded<string>(
        new UnboundedChannelOptions { SingleReader = true });

    public int Id { get; } = id;

    /// <summary>Subscribed object → field names. Guarded by the hub's lock.</summary>
    public Dictionary<string, List<string>> Subscription { get; set; } = new();

    /// <summary>Last value sent per object/field, to send only changes. Guarded by the hub's lock.</summary>
    public Dictionary<string, Dictionary<string, JsonNode?>> LastSent { get; set; } = new();

    public void Send(JsonObject message) => _outbox.Writer.TryWrite(message.ToJsonString());

    /// <summary>Drop the connection without a close handshake, like a network failure.</summary>
    public void Abort() => socket.Abort();

    /// <summary>Read messages until the client goes away, passing each one to <paramref name="onMessage"/>.</summary>
    public async Task RunAsync(Action<string> onMessage, CancellationToken ct)
    {
        var writer = WriteLoopAsync(ct);
        var buffer = new byte[16 * 1024];
        using var message = new MemoryStream();

        try
        {
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, ct);
                    break;
                }

                message.Write(buffer, 0, result.Count);
                if (!result.EndOfMessage) continue;

                if (result.MessageType == WebSocketMessageType.Text)
                    onMessage(Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length));
                message.SetLength(0);
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException)
        {
            // Client vanished or we aborted it
        }
        finally
        {
            _outbox.Writer.TryComplete();
            await writer;
        }
    }

    private async Task WriteLoopAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var text in _outbox.Reader.ReadAllAsync(ct))
            {
                if (socket.State != WebSocketState.Open) break;
                await socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException)
        {
            // Connection gone; the read loop ends too
        }
    }
}
