namespace Klippyface.Server.Models;

/// <summary>Where the server finds Moonraker. A single row (Id 1); empty Host means not set up yet.</summary>
public class MoonrakerSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 7125;
    public bool UseTls { get; set; }

    /// <summary>Moonraker API key, for instances that don't trust the server's address.</summary>
    public string ApiKey { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host);

    public Uri WebSocketUri => new UriBuilder(UseTls ? "wss" : "ws", Host.Trim(), Port, "/websocket").Uri;
}
