namespace Klippyface.Server.Services.Discovery;

/// <summary>The <c>Klippyface:Discovery</c> config section.</summary>
public class DiscoveryOptions
{
    public bool Enabled { get; set; } = true;

    /// <summary>Name shown when browsing; empty means <c>Klippyface-&lt;host&gt;</c>.</summary>
    public string? InstanceName { get; set; }

    /// <summary>Interfaces to advertise on by name; empty means every physical interface that is up.</summary>
    public string[] Interfaces { get; set; } = [];
}
