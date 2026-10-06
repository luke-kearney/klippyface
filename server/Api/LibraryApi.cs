using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services;

namespace Klippyface.Server.Api;

public static class LibraryApi
{
    public static WebApplication MapLibraryApi(this WebApplication app)
    {
        // Base faces plus the sized packs for every display in the system
        app.MapPost("/api/starter-pack", async (StarterPackService starterPack) =>
            Results.Ok(await starterPack.ImportForDisplaysAsync()));

        var groups = app.MapGroup("/api/groups");

        groups.MapGet("/", async (KlippyfaceDbContext db) =>
            await db.Groups.OrderBy(g => g.SortOrder).ToListAsync());

        groups.MapPost("/", async (KlippyfaceDbContext db, Group group) =>
        {
            if (string.IsNullOrWhiteSpace(group.Id))
                return Results.BadRequest("Group ID is required");

            group.CreatedAt = DateTime.UtcNow;
            group.UpdatedAt = DateTime.UtcNow;
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            return Results.Created($"/api/groups/{group.Id}", group);
        });

        groups.MapGet("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var group = await db.Groups
                .Include(g => g.Sets.OrderBy(s => s.SortOrder))
                    .ThenInclude(s => s.Frames.OrderBy(f => f.SortOrder))
                        .ThenInclude(f => f.Elements.OrderBy(e => e.SortOrder))
                .FirstOrDefaultAsync(g => g.Id == id);
            return group is null ? Results.NotFound() : Results.Ok(group);
        });

        groups.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Group input, NodePublisher publisher) =>
        {
            var group = await db.Groups.FindAsync(id);
            if (group is null) return Results.NotFound();

            group.Label = input.Label;
            group.Description = input.Description;
            group.Profile = input.Profile;
            group.SortOrder = input.SortOrder;
            group.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await publisher.MarkGroupPendingAsync(id);
            return Results.Ok(group);
        });

        // Re-creates the group under the new id and repoints everything that refers
        // to it by value: sets, assignment defaults and triggers, preset group swaps.
        // GCODE macros on the printer can't be reached from here; the UI warns.
        groups.MapPost("/{id}/rename", async (KlippyfaceDbContext db, string id, RenameRequest input, NodePublisher publisher) =>
        {
            var newId = input.Id?.Trim() ?? string.Empty;
            if (!RenameRequest.IsValidId(newId))
                return Results.BadRequest("ID may only contain lowercase letters, digits and underscores");

            var group = await db.Groups.FindAsync(id);
            if (group is null) return Results.NotFound();
            if (newId == id) return Results.Ok(group);
            if (await db.Groups.AnyAsync(g => g.Id == newId))
                return Results.Conflict($"A group with ID '{newId}' already exists");

            await using var tx = await db.Database.BeginTransactionAsync();
            var renamed = new Group
            {
                Id = newId,
                Label = group.Label,
                Description = group.Description,
                Profile = group.Profile,
                SortOrder = group.SortOrder,
                CreatedAt = group.CreatedAt,
                UpdatedAt = DateTime.UtcNow,
            };
            db.Groups.Add(renamed);
            await db.SaveChangesAsync();

            await db.Sets
                .Where(s => s.GroupId == id)
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.GroupId, newId));
            await db.Assignments
                .Where(a => a.DefaultGroup == id)
                .ExecuteUpdateAsync(u => u.SetProperty(a => a.DefaultGroup, newId));

            var quoted = $"\"{id}\"";
            var assignments = await db.Assignments.Where(a => a.TriggersJson.Contains(quoted)).ToListAsync();
            foreach (var a in assignments)
                a.TriggersJson = RenameGroupInTriggers(a.TriggersJson, id, newId);
            var presets = await db.Presets.Where(p => p.OverridesJson.Contains(quoted)).ToListAsync();
            foreach (var p in presets)
                p.OverridesJson = RenameGroupInOverrides(p.OverridesJson, id, newId);

            // Sets were moved off it already, so the cascade deletes nothing.
            db.Entry(group).State = EntityState.Detached;
            await db.Groups.Where(g => g.Id == id).ExecuteDeleteAsync();
            await db.SaveChangesAsync();
            await tx.CommitAsync();

            await publisher.RefreshNodesShowingGroupAsync(newId);
            return Results.Ok(renamed);
        });

        // Pushes pending edits to nodes now (the Web UI's Sync). Editor writes only
        // mark the group pending; PendingPublishSweeper publishes once they go quiet.
        groups.MapPost("/{id}/publish", async (KlippyfaceDbContext db, string id, NodePublisher publisher) =>
        {
            if (!await db.Groups.AnyAsync(g => g.Id == id)) return Results.NotFound();
            var nodes = await publisher.PublishGroupAsync(id);
            return Results.Ok(new { Nodes = nodes });
        });

        groups.MapDelete("/{id}", async (KlippyfaceDbContext db, string id, NodePublisher publisher) =>
        {
            var group = await db.Groups.FindAsync(id);
            if (group is null) return Results.NotFound();

            db.Groups.Remove(group);
            await db.SaveChangesAsync();
            await publisher.RefreshNodesShowingGroupAsync(id);
            return Results.NoContent();
        });

        var sets = groups.MapGroup("/{groupId}/sets");

        sets.MapGet("/", async (KlippyfaceDbContext db, string groupId) =>
        {
            var group = await db.Groups.FindAsync(groupId);
            if (group is null) return Results.NotFound("Group not found");

            var result = await db.Sets
                .Where(s => s.GroupId == groupId)
                .Include(s => s.Frames.OrderBy(f => f.SortOrder))
                .OrderBy(s => s.SortOrder)
                .ToListAsync();
            return Results.Ok(result);
        });

        sets.MapPost("/", async (KlippyfaceDbContext db, string groupId, Set set, NodePublisher publisher) =>
        {
            var group = await db.Groups.FindAsync(groupId);
            if (group is null) return Results.NotFound("Group not found");

            set.Id = Guid.NewGuid().ToString();
            set.GroupId = groupId;
            db.Sets.Add(set);
            await db.SaveChangesAsync();
            await publisher.MarkGroupPendingAsync(groupId);
            return Results.Created($"/api/groups/{groupId}/sets/{set.Id}", set);
        });

        var singleSet = app.MapGroup("/api/sets");

        singleSet.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Set input, NodePublisher publisher) =>
        {
            var set = await db.Sets.FindAsync(id);
            if (set is null) return Results.NotFound();

            set.Label = input.Label;
            set.Description = input.Description;
            set.SortOrder = input.SortOrder;
            set.LoopCount = input.LoopCount;
            set.FrameTime = input.FrameTime;
            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForSetAsync(db, id);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Ok(set);
        });

        singleSet.MapDelete("/{id}", async (KlippyfaceDbContext db, string id, NodePublisher publisher) =>
        {
            var set = await db.Sets.FindAsync(id);
            if (set is null) return Results.NotFound();

            var groupId = await GetGroupIdForSetAsync(db, id);
            db.Sets.Remove(set);
            await db.SaveChangesAsync();
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.NoContent();
        });

        singleSet.MapPut("/{id}/frames/reorder", async (KlippyfaceDbContext db, string id, List<string> frameIds, NodePublisher publisher) =>
        {
            var set = await db.Sets.Include(s => s.Frames).FirstOrDefaultAsync(s => s.Id == id);
            if (set is null) return Results.NotFound("Set not found");

            var frames = set.Frames.ToDictionary(f => f.Id);
            for (int i = 0; i < frameIds.Count; i++)
            {
                if (frames.TryGetValue(frameIds[i], out var frame))
                    frame.SortOrder = i;
            }

            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForSetAsync(db, id);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Ok(set.Frames.OrderBy(f => f.SortOrder).ToList());
        });

        var frames = singleSet.MapGroup("/{setId}/frames");

        frames.MapGet("/", async (KlippyfaceDbContext db, string setId) =>
        {
            var set = await db.Sets.FindAsync(setId);
            if (set is null) return Results.NotFound("Set not found");

            var result = await db.Frames
                .Where(f => f.SetId == setId)
                .Include(f => f.Elements.OrderBy(e => e.SortOrder))
                .OrderBy(f => f.SortOrder)
                .ToListAsync();
            return Results.Ok(result);
        });

        frames.MapPost("/", async (KlippyfaceDbContext db, string setId, Frame frame, NodePublisher publisher) =>
        {
            var set = await db.Sets.FindAsync(setId);
            if (set is null) return Results.NotFound("Set not found");

            frame.Id = Guid.NewGuid().ToString();
            frame.SetId = setId;
            db.Frames.Add(frame);
            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForSetAsync(db, setId);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Created($"/api/sets/{setId}/frames/{frame.Id}", frame);
        });

        var singleFrame = app.MapGroup("/api/frames");

        singleFrame.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Frame input, NodePublisher publisher) =>
        {
            var frame = await db.Frames.FindAsync(id);
            if (frame is null) return Results.NotFound();

            frame.DurationMs = input.DurationMs;
            frame.BgColor = input.BgColor;
            frame.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForFrameAsync(db, id);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Ok(frame);
        });

        singleFrame.MapDelete("/{id}", async (KlippyfaceDbContext db, string id, NodePublisher publisher) =>
        {
            var frame = await db.Frames.FindAsync(id);
            if (frame is null) return Results.NotFound();

            var groupId = await GetGroupIdForFrameAsync(db, id);
            db.Frames.Remove(frame);
            await db.SaveChangesAsync();
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.NoContent();
        });

        var elements = singleFrame.MapGroup("/{frameId}/elements");

        elements.MapGet("/", async (KlippyfaceDbContext db, string frameId) =>
        {
            var frame = await db.Frames.FindAsync(frameId);
            if (frame is null) return Results.NotFound("Frame not found");

            var result = await db.FrameElements
                .Where(e => e.FrameId == frameId)
                .OrderBy(e => e.SortOrder)
                .ToListAsync();
            return Results.Ok(result);
        });

        elements.MapPost("/", async (KlippyfaceDbContext db, string frameId, FrameElement element, NodePublisher publisher) =>
        {
            var frame = await db.Frames.FindAsync(frameId);
            if (frame is null) return Results.NotFound("Frame not found");

            element.Id = Guid.NewGuid().ToString();
            element.FrameId = frameId;
            element.Size = Math.Clamp(element.Size, 1, 8);
            db.FrameElements.Add(element);
            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForFrameAsync(db, frameId);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Created($"/api/frames/{frameId}/elements/{element.Id}", element);
        });

        elements.MapPut("/reorder", async (KlippyfaceDbContext db, string frameId, List<string> elementIds, NodePublisher publisher) =>
        {
            var frame = await db.Frames.Include(f => f.Elements).FirstOrDefaultAsync(f => f.Id == frameId);
            if (frame is null) return Results.NotFound("Frame not found");

            var elems = frame.Elements.ToDictionary(e => e.Id);
            for (int i = 0; i < elementIds.Count; i++)
            {
                if (elems.TryGetValue(elementIds[i], out var element))
                    element.SortOrder = i;
            }

            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForFrameAsync(db, frameId);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Ok(frame.Elements.OrderBy(e => e.SortOrder).ToList());
        });

        var singleElement = app.MapGroup("/api/elements");

        singleElement.MapPut("/{id}", async (KlippyfaceDbContext db, string id, FrameElement input, NodePublisher publisher) =>
        {
            var element = await db.FrameElements.FindAsync(id);
            if (element is null) return Results.NotFound();

            element.Type = input.Type;
            element.Value = input.Value;
            element.Label = input.Label;
            element.Color = input.Color;
            element.X = input.X;
            element.Y = input.Y;
            element.Size = Math.Clamp(input.Size, 1, 8);
            element.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            var groupId = await GetGroupIdForElementAsync(db, id);
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.Ok(element);
        });

        singleElement.MapDelete("/{id}", async (KlippyfaceDbContext db, string id, NodePublisher publisher) =>
        {
            var element = await db.FrameElements.FindAsync(id);
            if (element is null) return Results.NotFound();

            var groupId = await GetGroupIdForElementAsync(db, id);
            db.FrameElements.Remove(element);
            await db.SaveChangesAsync();
            if (groupId is not null)
                await publisher.MarkGroupPendingAsync(groupId);
            return Results.NoContent();
        });

        return app;
    }

    // triggers_json: { "<trigger>": "<group id>" | null }
    private static string RenameGroupInTriggers(string json, string oldId, string newId)
    {
        if (JsonNode.Parse(json) is not JsonObject triggers) return json;
        foreach (var key in triggers.Select(kv => kv.Key).ToList())
        {
            if (triggers[key] is JsonValue v && v.TryGetValue<string>(out var groupId) && groupId == oldId)
                triggers[key] = newId;
        }
        return triggers.ToJsonString();
    }

    // overrides_json: { "groupSwaps": { "<from group>": "<to group>" }, ... }
    private static string RenameGroupInOverrides(string json, string oldId, string newId)
    {
        if (JsonNode.Parse(json) is not JsonObject overrides ||
            overrides["groupSwaps"] is not JsonObject swaps)
            return json;

        var renamed = new JsonObject();
        foreach (var (from, to) in swaps.ToList())
        {
            var target = to is JsonValue v && v.TryGetValue<string>(out var toId) && toId == oldId
                ? JsonValue.Create(newId)
                : to?.DeepClone();
            renamed[from == oldId ? newId : from] = target;
        }
        overrides["groupSwaps"] = renamed;
        return overrides.ToJsonString();
    }

    private static async Task<string?> GetGroupIdForSetAsync(KlippyfaceDbContext db, string setId)
    {
        return await db.Sets
            .Where(s => s.Id == setId)
            .Select(s => s.GroupId)
            .FirstOrDefaultAsync();
    }

    private static async Task<string?> GetGroupIdForFrameAsync(KlippyfaceDbContext db, string frameId)
    {
        return await db.Frames
            .Where(f => f.Id == frameId)
            .Select(f => f.Set.GroupId)
            .FirstOrDefaultAsync();
    }

    private static async Task<string?> GetGroupIdForElementAsync(KlippyfaceDbContext db, string elementId)
    {
        return await db.FrameElements
            .Where(e => e.Id == elementId)
            .Select(e => e.Frame.Set.GroupId)
            .FirstOrDefaultAsync();
    }
}
