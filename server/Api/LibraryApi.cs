using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Api;

public static class LibraryApi
{
    public static WebApplication MapLibraryApi(this WebApplication app)
    {
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

        groups.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Group input) =>
        {
            var group = await db.Groups.FindAsync(id);
            if (group is null) return Results.NotFound();

            group.Label = input.Label;
            group.SortOrder = input.SortOrder;
            group.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(group);
        });

        groups.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var group = await db.Groups.FindAsync(id);
            if (group is null) return Results.NotFound();

            db.Groups.Remove(group);
            await db.SaveChangesAsync();
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

        sets.MapPost("/", async (KlippyfaceDbContext db, string groupId, Set set) =>
        {
            var group = await db.Groups.FindAsync(groupId);
            if (group is null) return Results.NotFound("Group not found");

            set.Id = Guid.NewGuid().ToString();
            set.GroupId = groupId;
            db.Sets.Add(set);
            await db.SaveChangesAsync();
            return Results.Created($"/api/groups/{groupId}/sets/{set.Id}", set);
        });

        var singleSet = app.MapGroup("/api/sets");

        singleSet.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Set input) =>
        {
            var set = await db.Sets.FindAsync(id);
            if (set is null) return Results.NotFound();

            set.Label = input.Label;
            set.SortOrder = input.SortOrder;
            set.LoopCount = input.LoopCount;
            set.FrameTime = input.FrameTime;
            await db.SaveChangesAsync();
            return Results.Ok(set);
        });

        singleSet.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var set = await db.Sets.FindAsync(id);
            if (set is null) return Results.NotFound();

            db.Sets.Remove(set);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        singleSet.MapPut("/{id}/frames/reorder", async (KlippyfaceDbContext db, string id, List<string> frameIds) =>
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

        frames.MapPost("/", async (KlippyfaceDbContext db, string setId, Frame frame) =>
        {
            var set = await db.Sets.FindAsync(setId);
            if (set is null) return Results.NotFound("Set not found");

            frame.Id = Guid.NewGuid().ToString();
            frame.SetId = setId;
            db.Frames.Add(frame);
            await db.SaveChangesAsync();
            return Results.Created($"/api/sets/{setId}/frames/{frame.Id}", frame);
        });

        var singleFrame = app.MapGroup("/api/frames");

        singleFrame.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Frame input) =>
        {
            var frame = await db.Frames.FindAsync(id);
            if (frame is null) return Results.NotFound();

            frame.DurationMs = input.DurationMs;
            frame.BgColor = input.BgColor;
            frame.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(frame);
        });

        singleFrame.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var frame = await db.Frames.FindAsync(id);
            if (frame is null) return Results.NotFound();

            db.Frames.Remove(frame);
            await db.SaveChangesAsync();
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

        elements.MapPost("/", async (KlippyfaceDbContext db, string frameId, FrameElement element) =>
        {
            var frame = await db.Frames.FindAsync(frameId);
            if (frame is null) return Results.NotFound("Frame not found");

            element.Id = Guid.NewGuid().ToString();
            element.FrameId = frameId;
            db.FrameElements.Add(element);
            await db.SaveChangesAsync();
            return Results.Created($"/api/frames/{frameId}/elements/{element.Id}", element);
        });

        elements.MapPut("/reorder", async (KlippyfaceDbContext db, string frameId, List<string> elementIds) =>
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
            return Results.Ok(frame.Elements.OrderBy(e => e.SortOrder).ToList());
        });

        var singleElement = app.MapGroup("/api/elements");

        singleElement.MapPut("/{id}", async (KlippyfaceDbContext db, string id, FrameElement input) =>
        {
            var element = await db.FrameElements.FindAsync(id);
            if (element is null) return Results.NotFound();

            element.Type = input.Type;
            element.Value = input.Value;
            element.Label = input.Label;
            element.Color = input.Color;
            element.X = input.X;
            element.Y = input.Y;
            element.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(element);
        });

        singleElement.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var element = await db.FrameElements.FindAsync(id);
            if (element is null) return Results.NotFound();

            db.FrameElements.Remove(element);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return app;
    }
}
