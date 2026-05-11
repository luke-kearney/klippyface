using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class NodePreset
{
    public string NodeId { get; set; } = string.Empty;
    public string PresetId { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;

    [JsonIgnore]
    public Node Node { get; set; } = null!;

    [JsonIgnore]
    public Preset Preset { get; set; } = null!;
}
