using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class NodeDisplay
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string NodeId { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string DriverType { get; set; } = string.Empty;
    public string BusType { get; set; } = "i2c";
    public string BusConfig { get; set; } = "{}";
    public int Width { get; set; } = 128;
    public int Height { get; set; } = 64;
    public int Rotation { get; set; } = 0;
    public int SortOrder { get; set; } = 0;

    [JsonIgnore]
    public Node Node { get; set; } = null!;

    [JsonIgnore]
    public Assignment? Assignment { get; set; }
}
