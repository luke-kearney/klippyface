using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Api;

public static class NodesApi
{
    public static WebApplication MapNodesApi(this WebApplication app)
    {
        var nodes = app.MapGroup("/api/nodes");

        nodes.MapGet("/", async (KlippyfaceDbContext db) =>
            await db.Nodes.OrderBy(n => n.FriendlyName).ToListAsync());

        nodes.MapPost("/", async (KlippyfaceDbContext db, Node node) =>
        {
            if (await db.Nodes.AnyAsync(n => n.MacAddress == node.MacAddress))
                return Results.Conflict($"Node with MAC {node.MacAddress} already exists");

            node.Id = Guid.NewGuid().ToString();
            node.CreatedAt = DateTime.UtcNow;
            node.UpdatedAt = DateTime.UtcNow;
            db.Nodes.Add(node);
            await db.SaveChangesAsync();
            return Results.Created($"/api/nodes/{node.Id}", node);
        });

        nodes.MapGet("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var node = await db.Nodes
                .Include(n => n.Displays.OrderBy(d => d.SortOrder))
                .Include(n => n.Assignments)
                .FirstOrDefaultAsync(n => n.Id == id);
            return node is null ? Results.NotFound() : Results.Ok(node);
        });

        nodes.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Node input) =>
        {
            var node = await db.Nodes.FindAsync(id);
            if (node is null) return Results.NotFound();

            node.FriendlyName = input.FriendlyName;
            node.Description = input.Description;
            node.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(node);
        });

        nodes.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var node = await db.Nodes.FindAsync(id);
            if (node is null) return Results.NotFound();

            db.Nodes.Remove(node);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        var displays = nodes.MapGroup("/{nodeId}/displays");

        displays.MapGet("/", async (KlippyfaceDbContext db, string nodeId) =>
        {
            var node = await db.Nodes.FindAsync(nodeId);
            if (node is null) return Results.NotFound("Node not found");

            var result = await db.NodeDisplays
                .Where(d => d.NodeId == nodeId)
                .OrderBy(d => d.SortOrder)
                .ToListAsync();
            return Results.Ok(result);
        });

        displays.MapPost("/", async (KlippyfaceDbContext db, string nodeId, NodeDisplay display) =>
        {
            var node = await db.Nodes.FindAsync(nodeId);
            if (node is null) return Results.NotFound("Node not found");

            display.Id = Guid.NewGuid().ToString();
            display.NodeId = nodeId;
            db.NodeDisplays.Add(display);
            await db.SaveChangesAsync();
            return Results.Created($"/api/nodes/{nodeId}/displays/{display.Id}", display);
        });

        displays.MapPut("/{displayId}", async (KlippyfaceDbContext db, string nodeId, string displayId, NodeDisplay input) =>
        {
            var display = await db.NodeDisplays
                .FirstOrDefaultAsync(d => d.Id == displayId && d.NodeId == nodeId);
            if (display is null) return Results.NotFound();

            display.Label = input.Label;
            display.DriverType = input.DriverType;
            display.BusType = input.BusType;
            display.BusConfig = input.BusConfig;
            display.Width = input.Width;
            display.Height = input.Height;
            display.Rotation = input.Rotation;
            display.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(display);
        });

        displays.MapDelete("/{displayId}", async (KlippyfaceDbContext db, string nodeId, string displayId) =>
        {
            var display = await db.NodeDisplays
                .FirstOrDefaultAsync(d => d.Id == displayId && d.NodeId == nodeId);
            if (display is null) return Results.NotFound();

            db.NodeDisplays.Remove(display);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        displays.MapPut("/{displayId}/assignment", async (KlippyfaceDbContext db, string nodeId, string displayId, Assignment input) =>
        {
            var display = await db.NodeDisplays
                .FirstOrDefaultAsync(d => d.Id == displayId && d.NodeId == nodeId);
            if (display is null) return Results.NotFound("Display not found");

            var existing = await db.Assignments
                .FirstOrDefaultAsync(a => a.NodeId == nodeId && a.DisplayId == displayId);

            if (existing is null)
            {
                input.Id = Guid.NewGuid().ToString();
                input.NodeId = nodeId;
                input.DisplayId = displayId;
                db.Assignments.Add(input);
            }
            else
            {
                existing.DefaultGroup = input.DefaultGroup;
                existing.TriggersJson = input.TriggersJson;
                existing.ActivePreset = input.ActivePreset;
            }

            await db.SaveChangesAsync();
            var result = await db.Assignments
                .FirstOrDefaultAsync(a => a.NodeId == nodeId && a.DisplayId == displayId);
            return Results.Ok(result);
        });

        displays.MapGet("/{displayId}/assignment", async (KlippyfaceDbContext db, string nodeId, string displayId) =>
        {
            var assignment = await db.Assignments
                .FirstOrDefaultAsync(a => a.NodeId == nodeId && a.DisplayId == displayId);
            return assignment is null ? Results.NotFound() : Results.Ok(assignment);
        });

        return app;
    }
}
