namespace Klippyface.Server.Models;

/// <summary>
/// A known board + display combination. <see cref="Board"/> matches the firmware
/// build env a node reports in its hello (src/config/Board.h). <see cref="BusConfig"/>
/// is JSON, as on <see cref="NodeDisplay"/>, so its keys reach the Web UI unconverted.
/// </summary>
public record BoardPreset(
    string Id,
    string Label,
    string Board,
    string DriverType,
    string BusType,
    int Width,
    int Height,
    int Rotation,
    string BusConfig)
{
    public NodeDisplay ToDisplay(string nodeId, int sortOrder) => new()
    {
        NodeId = nodeId,
        Label = DriverType == "gc9a01" ? "Round face" : "Face",
        DriverType = DriverType,
        BusType = BusType,
        BusConfig = BusConfig,
        Width = Width,
        Height = Height,
        Rotation = Rotation,
        SortOrder = sortOrder,
    };
}
