using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class Frame
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string SetId { get; set; } = string.Empty;
    public int SortOrder { get; set; } = 0;
    public int DurationMs { get; set; } = 1000;
    public string BgColor { get; set; } = "#000000";

    [JsonIgnore]
    public Set Set { get; set; } = null!;

    public ICollection<FrameElement> Elements { get; set; } = new List<FrameElement>();
}
