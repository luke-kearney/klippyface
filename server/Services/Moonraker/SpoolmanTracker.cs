using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>Sends a JSON-RPC request to Moonraker (<see cref="MoonrakerRpcClient.CallAsync"/>, or a test).</summary>
public delegate Task<JsonNode?> MoonrakerCall(string method, JsonObject? parameters, CancellationToken ct);

/// <summary>
/// The filament loaded, from Moonraker's Spoolman integration: the active spool's
/// details as "spool.*" data keys, and each tool's as "spool.tool&lt;n&gt;.*". Moonraker
/// only knows the active spool id; a tool's spool id is the spool_id variable of its
/// T&lt;n&gt; macro (Moonraker's documented multi-tool setup). The details come from
/// Spoolman through Moonraker's proxy, cached by id.
/// </summary>
public sealed partial class SpoolmanTracker(PrinterStateStore store, ILogger log)
{
    /// <summary>Data keys are "spool.name", "spool.material", ...</summary>
    public const string Root = "spool";

    // Moonraker's JSON-RPC "Method not found": the spoolman component isn't configured
    private const int MethodNotFound = -32601;

    private readonly Dictionary<int, JsonObject> _spools = new();

    [GeneratedRegex(@"^gcode_macro T(\d+)$")]
    private static partial Regex ToolMacro();

    /// <summary>A T&lt;n&gt; tool change macro, whose spool_id variable says which spool that tool holds.</summary>
    public static bool IsToolMacro(string obj) => ToolMacro().IsMatch(obj);

    /// <summary>"gcode_macro T1.spool_id": a tool's spool, as a data key.</summary>
    public static bool IsToolSpoolKey(string key) =>
        key.EndsWith(".spool_id") && IsToolMacro(key[..^".spool_id".Length]);

    /// <summary>Tool number → spool id, from the T&lt;n&gt; macros' spool_id variables.</summary>
    public static SortedDictionary<int, int> ToolSpools(IReadOnlyDictionary<string, JsonNode?> values)
    {
        var tools = new SortedDictionary<int, int>();
        foreach (var (key, value) in values)
        {
            if (!IsToolSpoolKey(key)) continue;
            var tool = int.Parse(ToolMacro().Match(key[..^".spool_id".Length]).Groups[1].Value);
            if (SpoolId(value) is { } id) tools[tool] = id;
        }
        return tools;
    }

    /// <summary>Moonraker has the spoolman component. Assumed until it says otherwise.</summary>
    public bool Enabled { get; private set; } = true;

    /// <summary>Moonraker has answered for Spoolman at least once, so filament keys are worth offering.</summary>
    public bool Available { get; private set; }

    /// <summary>
    /// Read the active spool and each tool's, and update the "spool.*" keys.
    /// <paramref name="refresh"/> re-fetches spool details (remaining weight changes
    /// as it prints); otherwise cached details are reused. Returns the keys that changed.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, JsonNode?>> SyncAsync(MoonrakerCall call, bool refresh, CancellationToken ct)
    {
        if (!Enabled) return new Dictionary<string, JsonNode?>();

        int? active;
        try
        {
            active = SpoolId((await call("server.spoolman.get_spool_id", null, ct))?["spool_id"]);
            Available = true;
        }
        catch (MoonrakerRpcException e) when (e.Code == MethodNotFound)
        {
            Enabled = false;
            Available = false;
            log.LogInformation("Moonraker has no Spoolman integration; filament keys are off");
            return store.ReplaceSource(Root, null);
        }
        catch (Exception e) when (e is MoonrakerRpcException or TimeoutException)
        {
            log.LogWarning("Couldn't read the active spool: {Message}", e.Message);
            return new Dictionary<string, JsonNode?>();
        }

        // Each spool is fetched at most once per sync, even if it's both active and in a tool
        var fetched = new Dictionary<int, JsonObject?>();
        async Task<JsonObject> KeysFor(int id)
        {
            if (!fetched.TryGetValue(id, out var spool))
                fetched[id] = spool = await SpoolAsync(call, id, refresh, ct);
            return Keys(id, spool);
        }

        var keys = active is { } activeId ? await KeysFor(activeId) : new JsonObject();
        foreach (var (tool, id) in ToolSpools(store.All()))
            keys[$"tool{tool}"] = await KeysFor(id);
        return store.ReplaceSource(Root, keys.Count > 0 ? keys : null);
    }

    /// <summary>Spool details, from the cache unless missing or <paramref name="refresh"/>. Null if Spoolman can't be reached.</summary>
    private async Task<JsonObject?> SpoolAsync(MoonrakerCall call, int id, bool refresh, CancellationToken ct)
    {
        if (!refresh && _spools.TryGetValue(id, out var cached)) return cached;

        try
        {
            var reply = await call("server.spoolman.proxy", new JsonObject
            {
                ["request_method"] = "GET",
                ["path"] = $"/v1/spool/{id}",
                ["use_v2_response"] = true,
            }, ct);

            if (reply?["response"] is JsonObject spool)
            {
                _spools[id] = spool;
                return spool;
            }
            log.LogWarning("Spoolman didn't return spool {Id}: {Error}", id, reply?["error"]?.ToJsonString() ?? "no response");
        }
        catch (Exception e) when (e is MoonrakerRpcException or TimeoutException)
        {
            log.LogWarning("Couldn't fetch spool {Id} from Spoolman: {Message}", id, e.Message);
        }
        // Spoolman unreachable: keep showing what we last knew
        return _spools.GetValueOrDefault(id);
    }

    /// <summary>The data keys for one spool; just its id if the details aren't known.</summary>
    public static JsonObject Keys(int id, JsonObject? spool)
    {
        var keys = new JsonObject { ["id"] = id };
        if (spool is null) return keys;

        var filament = spool["filament"] as JsonObject;
        var material = Text(filament?["material"]);
        keys["name"] = Text(filament?["name"]) ?? material ?? $"Spool {id}";
        if (material is not null) keys["material"] = material;
        if (Text(filament?["vendor"]?["name"]) is { } vendor) keys["vendor"] = vendor;
        if (Color(filament) is { } color) keys["color"] = color;
        if (spool["remaining_weight"] is JsonValue remaining && remaining.TryGetValue<double>(out var grams))
            keys["remaining_weight"] = Math.Round(Math.Max(grams, 0));
        return keys;
    }

    /// <summary>"#RRGGBB" from color_hex, or the first of a multi-colour filament's colours.</summary>
    private static string? Color(JsonObject? filament)
    {
        var hex = Text(filament?["color_hex"])
                  ?? Text(filament?["multi_color_hexes"])?.Split(',', StringSplitOptions.TrimEntries)[0];
        if (hex is null) return null;
        hex = hex.TrimStart('#');
        // Spoolman allows RRGGBBAA; the panel has no alpha
        if (hex.Length == 8) hex = hex[..6];
        return hex.Length == 6 && int.TryParse(hex, NumberStyles.HexNumber, null, out _)
            ? "#" + hex.ToUpperInvariant()
            : null;
    }

    private static int? SpoolId(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<int>(out var id) && id > 0 ? id : null;

    private static string? Text(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s) ? s.Trim() : null;
}
