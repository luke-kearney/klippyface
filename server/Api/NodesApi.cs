using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services;

namespace Klippyface.Server.Api;

public static class NodesApi
{
    public static WebApplication MapNodesApi(this WebApplication app)
    {
        app.MapGet("/api/ws/node/{id}", async (HttpContext ctx, string id, NodeStatusService statusService, IServiceScopeFactory scopeFactory) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest)
                return Results.BadRequest("Expected a WebSocket request");

            var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            await HandleNodeWebSocket(ws, id, statusService, scopeFactory);
            return Results.Empty;
        });

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

        displays.MapPost("/", async (KlippyfaceDbContext db, string nodeId, NodeDisplay display, NodePublisher publisher, StarterPackService starterPack) =>
        {
            var node = await db.Nodes.FindAsync(nodeId);
            if (node is null) return Results.NotFound("Node not found");

            display.Id = Guid.NewGuid().ToString();
            display.NodeId = nodeId;
            db.NodeDisplays.Add(display);
            // New displays start with each printer state mapped to its starter face
            db.Assignments.Add(await starterPack.DefaultAssignmentAsync(nodeId, display.Id));
            await db.SaveChangesAsync();
            await publisher.RefreshNodeAsync(nodeId);
            return Results.Created($"/api/nodes/{nodeId}/displays/{display.Id}", display);
        });

        displays.MapPut("/{displayId}", async (KlippyfaceDbContext db, string nodeId, string displayId, NodeDisplay input, NodePublisher publisher) =>
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
            await publisher.RefreshNodeAsync(nodeId);
            return Results.Ok(display);
        });

        displays.MapDelete("/{displayId}", async (KlippyfaceDbContext db, string nodeId, string displayId, NodePublisher publisher) =>
        {
            var display = await db.NodeDisplays
                .FirstOrDefaultAsync(d => d.Id == displayId && d.NodeId == nodeId);
            if (display is null) return Results.NotFound();

            db.NodeDisplays.Remove(display);
            await db.SaveChangesAsync();
            await publisher.RefreshNodeAsync(nodeId);
            return Results.NoContent();
        });

        displays.MapPut("/{displayId}/assignment", async (KlippyfaceDbContext db, string nodeId, string displayId, Assignment input, NodePublisher publisher) =>
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
            await publisher.RefreshNodeAsync(nodeId);
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

    private static async Task HandleNodeWebSocket(WebSocket ws, string macAddress, NodeStatusService statusService, IServiceScopeFactory scopeFactory)
    {
        var buffer = new byte[4096];

        // Look up node by MAC to get the DB GUID Id
        string dbNodeId;
        uint serverVersion;
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            var nodeRecord = await db.Nodes.FirstOrDefaultAsync(n => n.MacAddress == macAddress);
            if (nodeRecord is null)
            {
                await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Unknown node", CancellationToken.None);
                return;
            }
            dbNodeId = nodeRecord.Id;
            serverVersion = nodeRecord.LastConfigVersion;
        }

        statusService.Register(macAddress, ws, serverVersion);

        try
        {
            while (ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    statusService.Unregister(macAddress, ws);
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                    return;
                }

                if (result.MessageType != WebSocketMessageType.Text)
                    continue;

                var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                var msg = JsonNode.Parse(json) as JsonObject;
                if (msg is null) continue;

                var type = msg["type"]?.GetValue<string>();
                switch (type)
                {
                    case "hello":
                    {
                        var configVersion = msg["config_version"]?.GetValue<uint>() ?? 0;
                        statusService.UpdateConfigVersion(macAddress, configVersion);

                        if (configVersion < serverVersion || configVersion == 0)
                        {
                            await statusService.SendToNodeAsync(macAddress, new JsonObject
                            {
                                ["type"] = "refresh_config",
                            });
                        }
                        else
                        {
                            await statusService.SendToNodeAsync(macAddress, new JsonObject
                            {
                                ["type"] = "config_status",
                                ["up_to_date"] = true,
                            });
                        }

                        await PersistHelloAsync(scopeFactory, dbNodeId,
                            msg["board"]?.GetValue<string>(), msg["fw_version"]?.GetValue<string>());
                        break;
                    }
                    case "heartbeat":
                    {
                        statusService.Heartbeat(macAddress);
                        await PersistLastSeenAsync(scopeFactory, dbNodeId);
                        break;
                    }
                }
            }
        }
        catch (WebSocketException)
        {
        }
        finally
        {
            statusService.Unregister(macAddress, ws);
        }
    }

    // Older firmware doesn't send `board`; keep what we have rather than blanking it.
    private static async Task PersistHelloAsync(IServiceScopeFactory scopeFactory, string dbNodeId,
                                                string? board, string? firmwareVersion)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            var node = await db.Nodes.FindAsync(dbNodeId);
            if (node is null) return;
            node.LastSeen = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(board)) node.Board = board;
            if (!string.IsNullOrEmpty(firmwareVersion)) node.FirmwareVersion = firmwareVersion;
            await db.SaveChangesAsync();
        }
        catch
        {
        }
    }

    private static async Task PersistLastSeenAsync(IServiceScopeFactory scopeFactory, string dbNodeId)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            var node = await db.Nodes.FindAsync(dbNodeId);
            if (node is not null)
            {
                node.LastSeen = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
        }
        catch
        {
        }
    }
}
