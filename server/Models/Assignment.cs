using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class Assignment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string NodeId { get; set; } = string.Empty;
    public string DisplayId { get; set; } = string.Empty;
    public string DefaultGroup { get; set; } = string.Empty;
    public string TriggersJson { get; set; } = "{}";
    public string? ActivePreset { get; set; }

    [JsonIgnore]
    public Node Node { get; set; } = null!;

    [JsonIgnore]
    public NodeDisplay Display { get; set; } = null!;

    [JsonIgnore]
    public Preset? Preset { get; set; }
}
