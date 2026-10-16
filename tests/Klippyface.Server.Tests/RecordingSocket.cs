using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;

namespace Klippyface.Server.Tests;

/// <summary>An open WebSocket that keeps every message the server sends.</summary>
internal sealed class RecordingSocket : WebSocket
{
    public List<JsonObject> Messages { get; } = [];

    /// <summary>The reason the server gave for closing, if it did.</summary>
    public string? ClosedWith { get; private set; }

    public override WebSocketState State => WebSocketState.Open;
    public override WebSocketCloseStatus? CloseStatus => null;
    public override string? CloseStatusDescription => null;
    public override string? SubProtocol => null;

    public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType,
        bool endOfMessage, CancellationToken cancellationToken)
    {
        lock (Messages)
            Messages.Add(JsonNode.Parse(Encoding.UTF8.GetString(buffer))!.AsObject());
        return Task.CompletedTask;
    }

    public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken) =>
        Task.Delay(Timeout.Infinite, cancellationToken).ContinueWith(_ => new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));

    public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
    {
        ClosedWith = statusDescription;
        return Task.CompletedTask;
    }

    public override void Abort() { }
    public override void Dispose() { }
}
