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

    [JsonIgnore]
    public ICollection<NodeDisplay> Displays { get; set; } = new List<NodeDisplay>();

    [JsonIgnore]
    public ICollection<Assignment> Assignments { get; set; } = new List<Assignment>();

    [JsonIgnore]
    public ICollection<NodePreset> NodePresets { get; set; } = new List<NodePreset>();
}
