using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class Preset
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string ConditionsJson { get; set; } = "{}";
    public string OverridesJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore]
    public ICollection<NodePreset> NodePresets { get; set; } = new List<NodePreset>();
}
