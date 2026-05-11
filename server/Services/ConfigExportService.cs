using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;

namespace Klippyface.Server.Services;

public class ConfigExportService
{
    private readonly KlippyfaceDbContext _db;

    public ConfigExportService(KlippyfaceDbContext db)
    {
        _db = db;
    }

    public async Task<JsonObject?> ExportNodeConfigAsync(string macAddress)
    {
        var node = await _db.Nodes
            .Include(n => n.Displays.OrderBy(d => d.SortOrder))
            .Include(n => n.Assignments)
            .FirstOrDefaultAsync(n => n.MacAddress == macAddress);

        if (node is null) return null;

        var groupIds = new HashSet<string>();
        foreach (var assignment in node.Assignments)
        {
            if (!string.IsNullOrEmpty(assignment.DefaultGroup))
                groupIds.Add(assignment.DefaultGroup);

            if (!string.IsNullOrEmpty(assignment.TriggersJson))
            {
                var triggers = JsonNode.Parse(assignment.TriggersJson) as JsonObject;
                if (triggers is not null)
                {
                    foreach (var kvp in triggers)
                    {
                        if (kvp.Value is not null)
                            groupIds.Add(kvp.Value.GetValue<string>());
                    }
                }
            }
        }

        var groups = await _db.Groups
            .Where(g => groupIds.Contains(g.Id))
            .Include(g => g.Sets.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.Frames.OrderBy(f => f.SortOrder))
                    .ThenInclude(f => f.Elements.OrderBy(e => e.SortOrder))
            .ToListAsync();

        var spriteIds = new HashSet<string>();
        foreach (var group in groups)
        {
            foreach (var set in group.Sets)
            {
                foreach (var frame in set.Frames)
                {
                    foreach (var element in frame.Elements)
                    {
                        if (element.Type == "sprite" && !string.IsNullOrEmpty(element.Value))
                            spriteIds.Add(element.Value);
                    }
                }
            }
        }

        var sprites = await _db.Sprites
            .Where(s => spriteIds.Contains(s.Id))
            .ToListAsync();

        var groupsJson = new JsonObject();
        foreach (var group in groups)
        {
            var setsJson = new JsonArray();
            foreach (var set in group.Sets)
            {
                var framesJson = new JsonArray();
                foreach (var frame in set.Frames)
                {
                    var elementsJson = new JsonArray();
                    foreach (var element in frame.Elements)
                    {
                        elementsJson.Add(new JsonObject
                        {
                            ["type"] = element.Type,
                            ["value"] = element.Value,
                            ["label"] = element.Label,
                            ["color"] = element.Color,
                            ["x"] = element.X,
                            ["y"] = element.Y,
                        });
                    }

                    framesJson.Add(new JsonObject
                    {
                        ["duration_ms"] = frame.DurationMs,
                        ["bg_color"] = frame.BgColor,
                        ["elements"] = elementsJson,
                    });
                }

                setsJson.Add(new JsonObject
                {
                    ["id"] = set.Id,
                    ["label"] = set.Label,
                    ["loop_count"] = set.LoopCount,
                    ["frame_time"] = set.FrameTime,
                    ["frames"] = framesJson,
                });
            }

            groupsJson[group.Id] = new JsonObject
            {
                ["label"] = group.Label,
                ["sets"] = setsJson,
            };
        }

        var spritesJson = new JsonObject();
        foreach (var sprite in sprites)
        {
            spritesJson[sprite.Id] = new JsonObject
            {
                ["width"] = sprite.Width,
                ["height"] = sprite.Height,
                ["data"] = sprite.DataBase64,
            };
        }

        var displaysJson = new JsonArray();
        foreach (var display in node.Displays)
        {
            var busConfig = JsonNode.Parse(display.BusConfig) as JsonObject ?? new JsonObject();
            busConfig["type"] = display.BusType;
            displaysJson.Add(new JsonObject
            {
                ["id"] = display.Id,
                ["label"] = display.Label,
                ["driver_type"] = display.DriverType,
                ["bus"] = busConfig,
                ["width"] = display.Width,
                ["height"] = display.Height,
                ["rotation"] = display.Rotation,
            });
        }

        var assignmentsJson = new JsonArray();
        foreach (var assignment in node.Assignments)
        {
            var triggers = JsonNode.Parse(assignment.TriggersJson) as JsonObject;
            assignmentsJson.Add(new JsonObject
            {
                ["display_id"] = assignment.DisplayId,
                ["default_group"] = assignment.DefaultGroup,
                ["triggers"] = triggers ?? new JsonObject(),
            });
        }

        return new JsonObject
        {
            ["config_version"] = 1,
            ["node"] = new JsonObject
            {
                ["id"] = node.Id,
                ["friendly_name"] = node.FriendlyName,
                ["displays"] = displaysJson,
                ["assignments"] = assignmentsJson,
            },
            ["library"] = new JsonObject
            {
                ["groups"] = groupsJson,
                ["sprites"] = spritesJson,
            },
        };
    }

    public async Task<JsonObject> ExportLibraryAsync()
    {
        var groups = await _db.Groups
            .Include(g => g.Sets.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.Frames.OrderBy(f => f.SortOrder))
                    .ThenInclude(f => f.Elements.OrderBy(e => e.SortOrder))
            .OrderBy(g => g.SortOrder)
            .ToListAsync();

        var sprites = await _db.Sprites.OrderBy(s => s.Label).ToListAsync();

        var groupsJson = new JsonObject();
        foreach (var group in groups)
        {
            var setsJson = new JsonArray();
            foreach (var set in group.Sets)
            {
                var framesJson = new JsonArray();
                foreach (var frame in set.Frames)
                {
                    var elementsJson = new JsonArray();
                    foreach (var element in frame.Elements)
                    {
                        elementsJson.Add(new JsonObject
                        {
                            ["type"] = element.Type,
                            ["value"] = element.Value,
                            ["label"] = element.Label,
                            ["color"] = element.Color,
                            ["x"] = element.X,
                            ["y"] = element.Y,
                        });
                    }

                    framesJson.Add(new JsonObject
                    {
                        ["duration_ms"] = frame.DurationMs,
                        ["bg_color"] = frame.BgColor,
                        ["elements"] = elementsJson,
                    });
                }

                setsJson.Add(new JsonObject
                {
                    ["id"] = set.Id,
                    ["label"] = set.Label,
                    ["loop_count"] = set.LoopCount,
                    ["frame_time"] = set.FrameTime,
                    ["frames"] = framesJson,
                });
            }

            groupsJson[group.Id] = new JsonObject
            {
                ["label"] = group.Label,
                ["sets"] = setsJson,
            };
        }

        var spritesJson = new JsonObject();
        foreach (var sprite in sprites)
        {
            spritesJson[sprite.Id] = new JsonObject
            {
                ["width"] = sprite.Width,
                ["height"] = sprite.Height,
                ["data"] = sprite.DataBase64,
            };
        }

        return new JsonObject
        {
            ["groups"] = groupsJson,
            ["sprites"] = spritesJson,
        };
    }
}
