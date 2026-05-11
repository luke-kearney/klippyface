using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class Set
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string GroupId { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int SortOrder { get; set; } = 0;
    public int LoopCount { get; set; } = 1;
    public int FrameTime { get; set; } = 1000;

    [JsonIgnore]
    public Group Group { get; set; } = null!;

    [JsonIgnore]
    public ICollection<Frame> Frames { get; set; } = new List<Frame>();
}
