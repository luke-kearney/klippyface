using System.Text.Json.Nodes;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>
/// The printer's latest state, flattened to data keys ("extruder.temperature",
/// "print_stats.info.current_layer"). Moonraker sends only changed fields, so
/// updates are merged here and nodes are sent what actually changed.
/// </summary>
public sealed class PrinterStateStore
{
    /// <summary>What nodes fire state:* triggers from; see <see cref="DisplayState"/>.</summary>
    public const string DisplayStateKey = "klippyface.state";

    /// <summary>True while the printer is working (see <see cref="IsActive"/>); nodes don't sleep their screens then.</summary>
    public const string ActiveKey = "klippyface.active";

    /// <summary>The active tool, "T0" for extruder, "T1" for extruder1…; from toolhead.extruder.</summary>
    public const string ToolKey = "klippyface.tool";

    /// <summary>The active tool's nozzle, so faces follow tool changes on multi-tool printers.</summary>
    public const string NozzleTemperatureKey = "klippyface.nozzle.temperature";
    public const string NozzleTargetKey = "klippyface.nozzle.target";

    /// <summary>
    /// Keys the server works out itself. print_stats has no progress field in
    /// Klipper, but faces have always bound to "print_stats.progress"; it follows
    /// display_status (M73, falling back to the file position).
    /// </summary>
    private static readonly (string Key, Func<IReadOnlyDictionary<string, JsonNode?>, bool, JsonNode?> Compute)[] Derived =
    [
        ("print_stats.progress", (v, _) =>
            v.GetValueOrDefault("display_status.progress") ?? v.GetValueOrDefault("virtual_sdcard.progress")),
        (DisplayStateKey, (v, resultDismissed) => DisplayState(v, resultDismissed)),
        (ActiveKey, (v, resultDismissed) =>
            DisplayState(v, resultDismissed) is { } state ? JsonValue.Create(IsActive(state)) : null),
        (ToolKey, (v, _) => ToolIndex(ActiveExtruder(v)) is { } tool ? JsonValue.Create($"T{tool}") : null),
        (NozzleTemperatureKey, (v, _) => v.GetValueOrDefault($"{ActiveExtruder(v)}.temperature")),
        (NozzleTargetKey, (v, _) => v.GetValueOrDefault($"{ActiveExtruder(v)}.target")),
    ];

    /// <summary>
    /// The extruder in use. Single-extruder printers always report "extruder"; a
    /// toolchanger with no tool picked up reports "".
    /// </summary>
    private static string ActiveExtruder(IReadOnlyDictionary<string, JsonNode?> v) =>
        Text(v, "toolhead.extruder") ?? "extruder";

    /// <summary>0 for "extruder", n for "extruder&lt;n&gt;", null for anything else.</summary>
    public static int? ToolIndex(string extruder) =>
        extruder == "extruder" ? 0
        : extruder.StartsWith("extruder") && int.TryParse(extruder["extruder".Length..], out var n) && n > 0 ? n
        : null;

    /// <summary>Printing, paused, heating, busy or error; idle, complete and cancelled are resting.</summary>
    public static bool IsActive(string state) => state is "printing" or "paused" or "heating" or "busy" or "error";

    /// <summary>
    /// One state for faces, from several Klipper objects (first match wins):
    /// error (Klipper shut down, or the print failed), heating (printing, nothing
    /// extruded yet), printing, paused, heating (no print, but a heater is still
    /// warming up), complete/cancelled (until dismissed, see <see cref="TrackResultLocked"/>),
    /// busy (no print, but running G-code), idle.
    /// Null until Klipper has reported a print state.
    /// </summary>
    public static string? DisplayState(IReadOnlyDictionary<string, JsonNode?> v, bool resultDismissed = false)
    {
        var klippy = Text(v, "webhooks.state");
        var print = Text(v, "print_stats.state");
        var idle = Text(v, "idle_timeout.state");

        if (klippy is "shutdown" or "error" || print == "error") return "error";
        if (print is null) return null;

        return print switch
        {
            "printing" when Number(v, "print_stats.filament_used") <= 0 => "heating",
            "printing" => "printing",
            "paused" => "paused",
            _ when HeaterWarmingUp(v) => "heating",
            "complete" or "cancelled" when !resultDismissed && idle != "Idle" => print,
            _ when idle == "Printing" => "busy",
            _ => "idle",
        };
    }

    /// <summary>How far below its target a heater must be to count as warming up; Klipper's M109/M190 wait to within 1°C.</summary>
    private const double HeatingMargin = 2;

    /// <summary>The bed or an extruder has a target and is more than <see cref="HeatingMargin"/> below it.</summary>
    private static bool HeaterWarmingUp(IReadOnlyDictionary<string, JsonNode?> v)
    {
        foreach (var key in v.Keys)
        {
            if (!key.EndsWith(".target")) continue;
            var heater = key[..^".target".Length];
            if (heater != "heater_bed" && !heater.StartsWith("extruder")) continue;

            var target = Number(v, key);
            if (target > 0 && Number(v, $"{heater}.temperature") < target - HeatingMargin) return true;
        }
        return false;
    }

    private static string? Text(IReadOnlyDictionary<string, JsonNode?> v, string key) =>
        v.GetValueOrDefault(key) is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;

    private static double Number(IReadOnlyDictionary<string, JsonNode?> v, string key) =>
        v.GetValueOrDefault(key) is JsonValue value && value.TryGetValue<double>(out var n) ? n : 0;

    private readonly Lock _lock = new();
    private readonly Dictionary<string, JsonNode?> _values = new();

    // The print_stats.state the dismissed flag belongs to; a new state starts undismissed
    private string? _resultState;
    private bool _resultDismissed;

    /// <summary>
    /// Replace everything with a full status (a subscribe reply). Returns every
    /// key whose value differs from before, including keys that went away (null).
    /// </summary>
    public IReadOnlyDictionary<string, JsonNode?> Replace(JsonObject status)
    {
        var incoming = new Dictionary<string, JsonNode?>();
        Flatten(status, null, incoming);

        lock (_lock)
        {
            var changes = new Dictionary<string, JsonNode?>();
            foreach (var key in _values.Keys.Except(incoming.Keys).ToList())
            {
                if (IsDerived(key) || IsOtherSource(key)) continue;
                _values.Remove(key);
                changes[key] = null;
            }
            foreach (var (key, value) in incoming)
                SetLocked(key, value, changes);
            UpdateDerivedLocked(changes);
            return changes;
        }
    }

    /// <summary>
    /// Set every key under <paramref name="root"/> ("spool" → "spool.name", ...) from
    /// somewhere other than Klipper's objects, e.g. Spoolman. Keys under it that
    /// aren't in <paramref name="values"/> go away; a Klipper resubscribe leaves them be.
    /// </summary>
    public IReadOnlyDictionary<string, JsonNode?> ReplaceSource(string root, JsonObject? values)
    {
        var incoming = new Dictionary<string, JsonNode?>();
        Flatten(new JsonObject { [root] = values?.DeepClone() ?? new JsonObject() }, null, incoming);
        var prefix = root + ".";

        lock (_lock)
        {
            _otherSources.Add(prefix);
            var changes = new Dictionary<string, JsonNode?>();
            foreach (var key in _values.Keys.Where(k => k.StartsWith(prefix) && !incoming.ContainsKey(k)).ToList())
            {
                _values.Remove(key);
                changes[key] = null;
            }
            foreach (var (key, value) in incoming)
                SetLocked(key, value, changes);
            UpdateDerivedLocked(changes);
            return changes;
        }
    }

    /// <summary>Merge a notify_status_update. Returns the keys that changed.</summary>
    public IReadOnlyDictionary<string, JsonNode?> Apply(JsonObject update)
    {
        var incoming = new Dictionary<string, JsonNode?>();
        Flatten(update, null, incoming);

        lock (_lock)
        {
            var changes = new Dictionary<string, JsonNode?>();
            foreach (var (key, value) in incoming)
                SetLocked(key, value, changes);
            UpdateDerivedLocked(changes);
            return changes;
        }
    }

    /// <summary>Current values for these keys; keys the printer doesn't have are left out.</summary>
    public Dictionary<string, JsonNode?> Snapshot(IEnumerable<string> keys)
    {
        lock (_lock)
        {
            var result = new Dictionary<string, JsonNode?>();
            foreach (var key in keys)
            {
                if (_values.TryGetValue(key, out var value))
                    result[key] = value?.DeepClone();
            }
            return result;
        }
    }

    public Dictionary<string, JsonNode?> All()
    {
        lock (_lock) return _values.ToDictionary(kv => kv.Key, kv => kv.Value?.DeepClone());
    }

    public void Clear()
    {
        lock (_lock) _values.Clear();
    }

    private void SetLocked(string key, JsonNode? value, Dictionary<string, JsonNode?> changes)
    {
        if (_values.TryGetValue(key, out var old) && JsonNode.DeepEquals(old, value)) return;
        _values[key] = value?.DeepClone();
        changes[key] = value?.DeepClone();
    }

    /// <summary>
    /// Klipper keeps complete/cancelled until the next print or "clear file". The
    /// result is dismissed when idle_timeout goes Idle or the motors are turned off
    /// afterwards, and stays dismissed through later homing or moves.
    /// </summary>
    private void TrackResultLocked(Dictionary<string, JsonNode?> changes)
    {
        var print = Text(_values, "print_stats.state");
        var newResult = print != _resultState;
        if (newResult)
        {
            _resultState = print;
            _resultDismissed = false;
        }
        if (print is not ("complete" or "cancelled")) return;

        // An M84 in the end G-code can arrive with the result; that isn't a dismissal
        var motorsOff = !newResult && changes.TryGetValue("toolhead.homed_axes", out var homed)
            && homed is JsonValue axes && axes.TryGetValue<string>(out var text) && text == "";
        if (motorsOff || Text(_values, "idle_timeout.state") == "Idle") _resultDismissed = true;
    }

    private void UpdateDerivedLocked(Dictionary<string, JsonNode?> changes)
    {
        TrackResultLocked(changes);
        foreach (var (key, compute) in Derived)
        {
            var value = compute(_values, _resultDismissed);
            if (value is null)
            {
                if (_values.Remove(key)) changes[key] = null;
                continue;
            }
            SetLocked(key, value, changes);
        }
    }

    private static bool IsDerived(string key) => Derived.Any(d => d.Key == key);

    // Key prefixes set through ReplaceSource ("spool.")
    private readonly HashSet<string> _otherSources = [];

    private bool IsOtherSource(string key) => _otherSources.Any(key.StartsWith);

    /// <summary>{"print_stats": {"info": {"current_layer": 3}}} → "print_stats.info.current_layer": 3. Arrays stay whole.</summary>
    private static void Flatten(JsonObject obj, string? prefix, Dictionary<string, JsonNode?> into)
    {
        foreach (var (name, value) in obj)
        {
            var key = prefix is null ? name : $"{prefix}.{name}";
            if (value is JsonObject child)
                Flatten(child, key, into);
            else
                into[key] = value;
        }
    }
}
