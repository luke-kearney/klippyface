using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Services;

/// <summary>
/// Built-in library of faces (one group per printer state) shipped as the
/// embedded Data/starter-pack.json. Imported on first run into an empty
/// library, or on demand; existing sprite/group ids are never overwritten.
/// </summary>
public class StarterPackService
{
    private static readonly Lazy<StarterPack> Pack = new(Load);

    private readonly KlippyfaceDbContext _db;

    public StarterPackService(KlippyfaceDbContext db)
    {
        _db = db;
    }

    public async Task<bool> IsLibraryEmptyAsync() =>
        !await _db.Groups.AnyAsync() && !await _db.Sprites.AnyAsync();

    /// <summary>Adds pack sprites and groups whose ids aren't taken yet.</summary>
    public async Task<StarterPackResult> ImportAsync()
    {
        var pack = Pack.Value;

        var spriteIds = await _db.Sprites.Select(s => s.Id).ToListAsync();
        var groupIds = await _db.Groups.Select(g => g.Id).ToListAsync();

        var sprites = pack.Sprites.Where(s => !spriteIds.Contains(s.Id)).ToList();
        foreach (var s in sprites)
        {
            _db.Sprites.Add(new Sprite
            {
                Id = s.Id,
                Label = s.Label,
                Width = s.Width,
                Height = s.Height,
                DataBase64 = s.DataBase64,
            });
        }

        // Imported groups go after any the user already has
        var orderBase = await _db.Groups.MaxAsync(g => (int?)g.SortOrder + 1) ?? 0;
        var groups = pack.Groups.Where(g => !groupIds.Contains(g.Id)).ToList();
        foreach (var g in groups)
        {
            var group = new Group { Id = g.Id, Label = g.Label, SortOrder = orderBase + g.SortOrder };
            for (var si = 0; si < g.Sets.Count; si++)
            {
                var s = g.Sets[si];
                var set = new Set { Label = s.Label, SortOrder = si, LoopCount = s.LoopCount, FrameTime = s.FrameTime };
                for (var fi = 0; fi < s.Frames.Count; fi++)
                {
                    var f = s.Frames[fi];
                    var frame = new Frame { SortOrder = fi, DurationMs = f.DurationMs, BgColor = f.BgColor };
                    for (var ei = 0; ei < f.Elements.Count; ei++)
                    {
                        var e = f.Elements[ei];
                        frame.Elements.Add(new FrameElement
                        {
                            SortOrder = ei,
                            Type = e.Type,
                            Value = e.Value,
                            Label = e.Label,
                            Color = e.Color,
                            X = e.X,
                            Y = e.Y,
                        });
                    }
                    set.Frames.Add(frame);
                }
                group.Sets.Add(set);
            }
            _db.Groups.Add(group);
        }

        await _db.SaveChangesAsync();
        return new StarterPackResult(sprites.Count, groups.Count);
    }

    /// <summary>
    /// Default assignment for a new display: each printer state mapped to its
    /// starter group, limited to groups that exist in the library.
    /// </summary>
    public async Task<Assignment> DefaultAssignmentAsync(string nodeId, string displayId)
    {
        var pack = Pack.Value;
        var wanted = pack.Triggers.Values.Append(pack.DefaultGroup).ToList();
        var existing = await _db.Groups.Where(g => wanted.Contains(g.Id)).Select(g => g.Id).ToListAsync();

        var triggers = new JsonObject();
        foreach (var (trigger, groupId) in pack.Triggers)
        {
            if (existing.Contains(groupId)) triggers[trigger] = groupId;
        }

        return new Assignment
        {
            NodeId = nodeId,
            DisplayId = displayId,
            DefaultGroup = existing.Contains(pack.DefaultGroup) ? pack.DefaultGroup : string.Empty,
            TriggersJson = triggers.ToJsonString(),
        };
    }

    private static StarterPack Load()
    {
        using var stream = typeof(StarterPackService).Assembly
            .GetManifestResourceStream("Klippyface.Server.Data.starter-pack.json")
            ?? throw new InvalidOperationException("Embedded starter-pack.json not found");
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
        return JsonSerializer.Deserialize<StarterPack>(stream, options)
            ?? throw new InvalidOperationException("starter-pack.json is empty");
    }

    private record StarterPack(
        List<PackSprite> Sprites,
        List<PackGroup> Groups,
        Dictionary<string, string> Triggers,
        string DefaultGroup);

    private record PackSprite(string Id, string Label, int Width, int Height, string DataBase64);

    private record PackGroup(string Id, string Label, int SortOrder, List<PackSet> Sets);

    private record PackSet(string Label, int LoopCount, int FrameTime, List<PackFrame> Frames);

    private record PackFrame(int DurationMs, string BgColor, List<PackElement> Elements);

    private record PackElement(string Type, string Value, string Label, string Color, int X, int Y);
}

public record StarterPackResult(int SpritesAdded, int GroupsAdded);
