using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;

namespace Klippyface.Server.Services;

/// <summary>
/// Decides when library edits reach nodes. Editor writes only mark their group
/// pending; a publish (the Web UI's Sync, or <see cref="PendingPublishSweeper"/>
/// once edits go quiet) bumps the config version of nodes showing the group and
/// asks them to refresh. Nodes that fetch for other reasons (boot, reconnect)
/// still get the latest saved content.
/// </summary>
public class NodePublisher
{
    private readonly KlippyfaceDbContext _db;
    private readonly NodeStatusService _status;

    public NodePublisher(KlippyfaceDbContext db, NodeStatusService status)
    {
        _db = db;
        _status = status;
    }

    public async Task MarkGroupPendingAsync(string groupId)
    {
        await _db.Groups
            .Where(g => g.Id == groupId)
            .ExecuteUpdateAsync(u => u
                .SetProperty(g => g.PendingPublish, true)
                .SetProperty(g => g.UpdatedAt, DateTime.UtcNow));
    }

    /// <summary>Marks every group with a frame that draws this sprite.</summary>
    public async Task MarkGroupsUsingSpritePendingAsync(string spriteId)
    {
        var groupIds = await _db.FrameElements
            .Where(e => e.Type == "sprite" && e.Value == spriteId)
            .Select(e => e.Frame.Set.GroupId)
            .Distinct()
            .ToListAsync();
        foreach (var id in groupIds)
            await MarkGroupPendingAsync(id);
    }

    /// <summary>Clears the pending flag and refreshes nodes showing the group. Returns how many.</summary>
    public async Task<int> PublishGroupAsync(string groupId)
    {
        await _db.Groups
            .Where(g => g.Id == groupId)
            .ExecuteUpdateAsync(u => u.SetProperty(g => g.PendingPublish, false));
        return await RefreshNodesShowingGroupAsync(groupId);
    }

    /// <summary>Refreshes nodes whose assignments reference the group, now.</summary>
    public async Task<int> RefreshNodesShowingGroupAsync(string groupId)
    {
        var nodeIds = await _db.Assignments
            .Where(a => a.DefaultGroup == groupId || a.TriggersJson.Contains($"\"{groupId}\""))
            .Select(a => a.NodeId)
            .Distinct()
            .ToListAsync();
        foreach (var nodeId in nodeIds)
            await RefreshNodeAsync(nodeId);
        return nodeIds.Count;
    }

    public async Task RefreshNodeAsync(string nodeId)
    {
        var node = await _db.Nodes.FindAsync(nodeId);
        if (node is null) return;

        // Save the bump before notifying: a node that misses the message still
        // sees the newer version on its next hello.
        node.LastConfigVersion++;
        node.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _status.RequestRefresh(node.MacAddress);
    }
}
