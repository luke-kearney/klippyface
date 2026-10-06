using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class Node
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string MacAddress { get; set; } = string.Empty;
    public string FriendlyName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeen { get; set; }
    public uint LastConfigVersion { get; set; } = 1;

    /// <summary>Firmware build env the node reported in its last hello, e.g. "esp32s3-ws-lcd169".</summary>
    public string Board { get; set; } = string.Empty;
    public string FirmwareVersion { get; set; } = string.Empty;

    public bool IsOnline => LastSeen.HasValue && (DateTime.UtcNow - LastSeen.Value).TotalSeconds < 90;

    public ICollection<NodeDisplay> Displays { get; set; } = new List<NodeDisplay>();

    public ICollection<Assignment> Assignments { get; set; } = new List<Assignment>();

    [JsonIgnore]
    public ICollection<NodePreset> NodePresets { get; set; } = new List<NodePreset>();
}
