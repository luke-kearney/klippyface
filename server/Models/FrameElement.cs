using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class FrameElement
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FrameId { get; set; } = string.Empty;
    public int SortOrder { get; set; } = 0;
    public string Type { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Color { get; set; } = "#FFFFFF";
    public int X { get; set; } = 0;
    public int Y { get; set; } = 0;
    /// <summary>Scale: font size for text/data values, pixel scale for sprites (1–8).</summary>
    public int Size { get; set; } = 1;

    [JsonIgnore]
    public Frame Frame { get; set; } = null!;
}
