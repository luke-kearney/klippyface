namespace Klippyface.Server.Api;

/// <summary>
/// Body for POST /api/nodes/{id}/accept. A missing FriendlyName keeps the reported one.
/// PresetId adds a display from that board preset; "" adds none; missing picks the
/// preset for the node's board if it has exactly one and the node has no displays yet.
/// </summary>
public record NodeAccept(string? FriendlyName, string? PresetId);
