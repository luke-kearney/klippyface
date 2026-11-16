using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Services;

/// <summary>
/// Node records over their lifetime: an unknown MAC that connects is added as
/// pending, gets nothing until accepted, and comes back as pending if removed
/// while it's still powered.
/// </summary>
public partial class NodeRegistry
{
    /// <summary>New MACs are refused once this many nodes are waiting to be accepted.</summary>
    public const int MaxPending = 10;

    private readonly KlippyfaceDbContext _db;
    private readonly NodeStatusService _status;
    private readonly NodePublisher _publisher;
    private readonly StarterPackService _starterPack;
    private readonly ILogger<NodeRegistry> _logger;

    public NodeRegistry(KlippyfaceDbContext db, NodeStatusService status, NodePublisher publisher,
                        StarterPackService starterPack, ILogger<NodeRegistry> logger)
    {
        _db = db;
        _status = status;
        _publisher = publisher;
        _starterPack = starterPack;
        _logger = logger;
    }

    [GeneratedRegex("^([0-9A-F]{2}:){5}[0-9A-F]{2}$")]
    private static partial Regex MacPattern();

    /// <summary>The MAC as AA:BB:CC:DD:EE:FF, or null if it isn't one.</summary>
    public static string? NormalizeMac(string mac)
    {
        var normalized = mac.Trim().ToUpperInvariant().Replace('-', ':');
        return MacPattern().IsMatch(normalized) ? normalized : null;
    }

    /// <summary>
    /// The node for a connecting MAC, added as pending if it's new. Node is null
    /// when the MAC is new and <see cref="MaxPending"/> nodes are already waiting.
    /// </summary>
    public async Task<(Node? Node, bool Created)> ConnectAsync(string mac)
    {
        var node = await _db.Nodes.AsNoTracking().FirstOrDefaultAsync(n => n.MacAddress == mac);
        if (node is not null) return (node, false);

        if (await _db.Nodes.CountAsync(n => n.Status == NodeStatus.Pending) >= MaxPending)
            return (null, false);

        node = new Node { MacAddress = mac, Status = NodeStatus.Pending };
        _db.Nodes.Add(node);
        try
        {
            await _db.SaveChangesAsync();
            return (node, true);
        }
        catch (DbUpdateException)
        {
            // Another connection from the same MAC added it first
            _db.ChangeTracker.Clear();
            return (await _db.Nodes.AsNoTracking().FirstOrDefaultAsync(n => n.MacAddress == mac), false);
        }
    }

    /// <summary>Saves what a node reports in its hello. Null if its record has been deleted.</summary>
    public async Task<Node?> HelloAsync(string id, string? board, string? firmwareVersion, string? friendlyName)
    {
        var node = await _db.Nodes.FindAsync(id);
        if (node is null) return null;

        node.LastSeen = DateTime.UtcNow;
        // Older firmware doesn't send `board`; keep what we have rather than blanking it.
        if (!string.IsNullOrEmpty(board)) node.Board = board;
        if (!string.IsNullOrEmpty(firmwareVersion)) node.FirmwareVersion = firmwareVersion;
        // Until accepted, the name is the one set in the node's setup portal
        if (node.Status == NodeStatus.Pending && !string.IsNullOrWhiteSpace(friendlyName))
            node.FriendlyName = friendlyName.Trim();
        await _db.SaveChangesAsync();
        return node;
    }

    /// <summary>
    /// Accepts a pending node, optionally adding a display from <paramref name="preset"/>,
    /// and asks it to fetch its config. <paramref name="node"/> must be tracked with its displays loaded.
    /// </summary>
    public async Task AcceptAsync(Node node, string? friendlyName, BoardPreset? preset)
    {
        node.Status = NodeStatus.Accepted;
        if (!string.IsNullOrWhiteSpace(friendlyName)) node.FriendlyName = friendlyName.Trim();
        node.UpdatedAt = DateTime.UtcNow;
        if (preset is not null)
            await AddDisplayAsync(preset.ToDisplay(node.Id, node.Displays.Count));
        await _db.SaveChangesAsync();

        _status.Accept(node.MacAddress);
        await _publisher.RefreshNodeAsync(node.Id);
        _logger.LogInformation("Accepted node {Mac} as \"{Name}\"{Display}", node.MacAddress, node.FriendlyName,
            preset is null ? "" : $" with display {preset.Id}");
    }

    /// <summary>Adds a display with each printer state mapped to its starter face. Not saved.</summary>
    public async Task AddDisplayAsync(NodeDisplay display)
    {
        display.Id = Guid.NewGuid().ToString();
        _db.NodeDisplays.Add(display);
        _db.Assignments.Add(await _starterPack.DefaultAssignmentAsync(display.NodeId, display));
    }

    /// <summary>Deletes the node and closes its connection. A node still powered on comes back as pending.</summary>
    public async Task RemoveAsync(Node node)
    {
        _db.Nodes.Remove(node);
        await _db.SaveChangesAsync();
        await _status.DisconnectAsync(node.MacAddress, "Node removed");
    }

    /// <summary>Removes every pending node. Returns how many.</summary>
    public async Task<int> ClearPendingAsync()
    {
        var pending = await _db.Nodes.Where(n => n.Status == NodeStatus.Pending).ToListAsync();
        _db.Nodes.RemoveRange(pending);
        await _db.SaveChangesAsync();
        foreach (var node in pending)
            await _status.DisconnectAsync(node.MacAddress, "Node removed");
        return pending.Count;
    }
}
