using System.Text.Json.Nodes;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>
/// The printer's latest state, flattened to data keys ("extruder.temperature",
/// "print_stats.info.current_layer"). Moonraker sends only changed fields, so
/// updates are merged here and nodes are sent what actually changed.
/// </summary>
public sealed class PrinterStateStore
{
    /// <summary>
    /// Keys the server works out itself. print_stats has no progress field in
    /// Klipper, but faces have always bound to "print_stats.progress"; it follows
    /// display_status (M73, falling back to the file position).
    /// </summary>
    private static readonly (string Key, Func<IReadOnlyDictionary<string, JsonNode?>, JsonNode?> Compute)[] Derived =
    [
        ("print_stats.progress", v =>
            v.GetValueOrDefault("display_status.progress") ?? v.GetValueOrDefault("virtual_sdcard.progress")),
    ];

    private readonly Lock _lock = new();
    private readonly Dictionary<string, JsonNode?> _values = new();

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
                if (IsDerived(key)) continue;
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

    private void UpdateDerivedLocked(Dictionary<string, JsonNode?> changes)
    {
        foreach (var (key, compute) in Derived)
        {
            var value = compute(_values);
            if (value is null)
            {
                if (_values.Remove(key)) changes[key] = null;
                continue;
            }
            SetLocked(key, value, changes);
        }
    }

    private static bool IsDerived(string key) => Derived.Any(d => d.Key == key);

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
