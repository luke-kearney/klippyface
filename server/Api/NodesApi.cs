using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services;
using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Api;

public static class NodesApi
{
    public static WebApplication MapNodesApi(this WebApplication app)
    {
        app.MapGet("/api/ws/node/{id}", async (HttpContext ctx, string id, NodeStatusService statusService,
            NodeStateRelay relay, IServiceScopeFactory scopeFactory, ILogger<NodeRegistry> log) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest)
                return Results.BadRequest("Expected a WebSocket request");

            var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            await HandleNodeWebSocket(ws, id, statusService, relay, scopeFactory, log);
            return Results.Empty;
        });

        var nodes = app.MapGroup("/api/nodes");

        nodes.MapGet("/", async (KlippyfaceDbContext db) =>
            await db.Nodes.OrderBy(n => n.FriendlyName).ToListAsync());

        nodes.MapPost("/", async (KlippyfaceDbContext db, NodeRegistry registry, Node node) =>
        {
            if (NodeRegistry.NormalizeMac(node.MacAddress) is not { } mac)
                return Results.BadRequest("Expected a MAC address like AA:BB:CC:DD:EE:FF");
            node.MacAddress = mac;

            var existing = await db.Nodes.Include(n => n.Displays).FirstOrDefaultAsync(n => n.MacAddress == mac);
            if (existing is { Status: NodeStatus.Pending })
            {
                // Adding a node that's already waiting accepts it
                if (!string.IsNullOrWhiteSpace(node.Description)) existing.Description = node.Description;
                await registry.AcceptAsync(existing, node.FriendlyName, DefaultPresetFor(existing));
                return Results.Ok(existing);
            }
            if (existing is not null)
                return Results.Conflict($"Node with MAC {mac} already exists");

            node.Id = Guid.NewGuid().ToString();
            node.Status = NodeStatus.Accepted;
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

        nodes.MapPut("/{id}", async (KlippyfaceDbContext db, string id, NodeUpdate input, NodePublisher publisher) =>
        {
            var node = await db.Nodes.FindAsync(id);
            if (node is null) return Results.NotFound();
            if (input.SleepAfterSeconds is < 0 or > NodeUpdate.MaxSleepAfterSeconds)
                return Results.BadRequest($"sleep_after_seconds must be 0 (never) to {NodeUpdate.MaxSleepAfterSeconds}");

            node.FriendlyName = input.FriendlyName;
            node.Description = input.Description;
            node.UpdatedAt = DateTime.UtcNow;
            var sleepChanged = input.SleepAfterSeconds is { } sleep && sleep != node.SleepAfterSeconds;
            if (sleepChanged) node.SleepAfterSeconds = input.SleepAfterSeconds!.Value;
            await db.SaveChangesAsync();
            // The timeout is part of the node's config; names aren't
            if (sleepChanged) await publisher.RefreshNodeAsync(id);
            return Results.Ok(node);
        });

        nodes.MapPost("/{id}/accept", async (KlippyfaceDbContext db, NodeRegistry registry, string id, NodeAccept input) =>
        {
            var node = await db.Nodes.Include(n => n.Displays).FirstOrDefaultAsync(n => n.Id == id);
            if (node is null) return Results.NotFound();
            if (node.Status != NodeStatus.Pending) return Results.Conflict("Node is already accepted");

            BoardPreset? preset;
            if (input.PresetId is null) preset = DefaultPresetFor(node);
            else if (input.PresetId == "") preset = null;
            else if (BoardPresets.Find(input.PresetId) is { } p) preset = p;
            else return Results.BadRequest($"Unknown board preset {input.PresetId}");

            await registry.AcceptAsync(node, input.FriendlyName, preset);
            return Results.Ok(node);
        });

        // Rejecting a pending node is deleting it; one still powered on comes back as pending
        nodes.MapDelete("/{id}", async (KlippyfaceDbContext db, NodeRegistry registry, string id) =>
        {
            var node = await db.Nodes.FindAsync(id);
            if (node is null) return Results.NotFound();

            await registry.RemoveAsync(node);
            return Results.NoContent();
        });

        nodes.MapDelete("/pending", async (NodeRegistry registry) =>
            Results.Ok(new { Removed = await registry.ClearPendingAsync() }));

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

        displays.MapPost("/", async (KlippyfaceDbContext db, string nodeId, NodeDisplay display, NodePublisher publisher, NodeRegistry registry) =>
        {
            var node = await db.Nodes.FindAsync(nodeId);
            if (node is null) return Results.NotFound("Node not found");

            display.NodeId = nodeId;
            await registry.AddDisplayAsync(display);
            await db.SaveChangesAsync();
            await publisher.RefreshNodeAsync(nodeId);
            return Results.Created($"/api/nodes/{nodeId}/displays/{display.Id}", display);
        });

        // Re-point a display at the starter faces sized for it (importing them if
        // needed). Replaces default group and triggers; keeps the active preset.
        displays.MapPost("/{displayId}/starter-faces", async (KlippyfaceDbContext db, string nodeId, string displayId,
            NodePublisher publisher, StarterPackService starterPack) =>
        {
            var display = await db.NodeDisplays.FirstOrDefaultAsync(d => d.Id == displayId && d.NodeId == nodeId);
            if (display is null) return Results.NotFound();

            var template = await starterPack.DefaultAssignmentAsync(nodeId, display);
            var assignment = await db.Assignments.FirstOrDefaultAsync(a => a.NodeId == nodeId && a.DisplayId == displayId);
            if (assignment is null)
            {
                db.Assignments.Add(template);
                assignment = template;
            }
            else
            {
                assignment.DefaultGroup = template.DefaultGroup;
                assignment.TriggersJson = template.TriggersJson;
            }
            await db.SaveChangesAsync();
            await publisher.RefreshNodeAsync(nodeId);
            return Results.Ok(assignment);
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

    /// <summary>A board with one display option starts with it, unless the node already has displays.</summary>
    private static BoardPreset? DefaultPresetFor(Node node) =>
        node.Displays.Count == 0 ? BoardPresets.DefaultFor(node.Board) : null;

    // Refusals repeat every few seconds while a node retries; warn at most this often
    private static readonly TimeSpan RefusalLogInterval = TimeSpan.FromMinutes(1);
    private static long _lastRefusalLogTicks;

    private static async Task HandleNodeWebSocket(WebSocket ws, string path, NodeStatusService statusService,
                                                  NodeStateRelay relay, IServiceScopeFactory scopeFactory, ILogger log)
    {
        var buffer = new byte[4096];

        if (NodeRegistry.NormalizeMac(path) is not { } macAddress)
        {
            await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Invalid MAC address", CancellationToken.None);
            return;
        }

        // Look up node by MAC to get the DB GUID Id; an unknown MAC is added as pending
        string dbNodeId;
        bool pending, created;
        using (var scope = scopeFactory.CreateScope())
        {
            var registry = scope.ServiceProvider.GetRequiredService<NodeRegistry>();
            var (nodeRecord, isNew) = await registry.ConnectAsync(macAddress);
            if (nodeRecord is null)
            {
                WarnRefused(log, macAddress);
                await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Too many pending nodes", CancellationToken.None);
                return;
            }
            dbNodeId = nodeRecord.Id;
            pending = nodeRecord.Status == NodeStatus.Pending;
            created = isNew;
            statusService.Register(macAddress, ws, nodeRecord.LastConfigVersion, pending);
        }

        try
        {
            while (ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    statusService.Unregister(macAddress, ws);
                    // Already closed if the server started it (node deleted)
                    if (ws.State == WebSocketState.CloseReceived)
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
                        // Read fresh: the node may have been accepted or reconfigured since it connected
                        var node = await PersistHelloAsync(scopeFactory, dbNodeId, msg, log);
                        if (node is null) break;

                        if (node.Status == NodeStatus.Pending)
                        {
                            if (created)
                            {
                                log.LogInformation("New node {Mac} ({Board}, firmware {Firmware}) is waiting to be accepted on the Nodes page",
                                    macAddress, node.Board is "" ? "unknown board" : node.Board,
                                    node.FirmwareVersion is "" ? "unknown" : node.FirmwareVersion);
                                created = false;
                            }
                            // Pending nodes get no config, refresh or printer state
                            break;
                        }
                        if (pending)
                        {
                            statusService.Accept(macAddress);
                            pending = false;
                        }

                        var configVersion = msg["config_version"]?.GetValue<uint>() ?? 0;
                        statusService.UpdateConfigVersion(macAddress, configVersion);

                        if (configVersion < node.LastConfigVersion || configVersion == 0)
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

                        // Printer state for the faces this node shows; nodes re-announce
                        // after applying a config, so the key set follows config changes
                        await relay.OnNodeHelloAsync(macAddress);
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

    private static void WarnRefused(ILogger log, string mac)
    {
        var now = DateTime.UtcNow.Ticks;
        var last = Interlocked.Read(ref _lastRefusalLogTicks);
        if (now - last < RefusalLogInterval.Ticks || Interlocked.CompareExchange(ref _lastRefusalLogTicks, now, last) != last)
            return;
        log.LogWarning("Refused new node {Mac}: {Max} nodes are already waiting to be accepted. Accept or clear them on the Nodes page",
            mac, NodeRegistry.MaxPending);
    }

    private static async Task<Node?> PersistHelloAsync(IServiceScopeFactory scopeFactory, string dbNodeId,
                                                       JsonObject hello, ILogger log)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var registry = scope.ServiceProvider.GetRequiredService<NodeRegistry>();
            return await registry.HelloAsync(dbNodeId, hello["board"]?.GetValue<string>(),
                hello["fw_version"]?.GetValue<string>(), hello["friendly_name"]?.GetValue<string>());
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Saving hello from node {Node} failed", dbNodeId);
            return null;
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
