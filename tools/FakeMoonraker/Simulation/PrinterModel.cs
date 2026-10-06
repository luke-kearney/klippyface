using System.Text.Json.Nodes;

namespace FakeMoonraker.Simulation;

/// <summary>
/// The printer's Klipper objects, as object → field → value. This is all a client
/// can see; the simulation, control endpoints and scenarios only change it here,
/// and the hub works out what to send by comparing snapshots.
/// </summary>
public sealed class PrinterModel
{
    private readonly Lock _lock = new();
    private readonly JsonObject _objects = new();

    public PrinterModel(PrinterProfile profile)
    {
        Profile = profile;
        Reset();
    }

    /// <summary>Changed only through <see cref="Reset"/>, so objects always match it.</summary>
    public PrinterProfile Profile { get; private set; }

    /// <summary>
    /// Objects to start from instead of the built-in defaults (a replayed capture).
    /// Reset() goes back to these.
    /// </summary>
    public JsonObject? Baseline { get; set; }

    public IReadOnlyList<string> ObjectNames
    {
        get { lock (_lock) return _objects.Select(o => o.Key).ToList(); }
    }

    /// <summary>
    /// Put every object back to how Klipper reports it right after start-up,
    /// optionally as a different printer.
    /// </summary>
    public void Reset(PrinterProfile? profile = null)
    {
        lock (_lock)
        {
            if (profile is not null) Profile = profile;
            _objects.Clear();

            if (Baseline is not null)
            {
                foreach (var (name, fields) in Baseline)
                    _objects[name] = fields?.DeepClone();
                return;
            }

            _objects["print_stats"] = new JsonObject
            {
                ["filename"] = "",
                ["total_duration"] = 0.0,
                ["print_duration"] = 0.0,
                ["filament_used"] = 0.0,
                ["state"] = "standby",
                ["message"] = "",
                ["info"] = new JsonObject { ["total_layer"] = null, ["current_layer"] = null },
            };
            _objects["virtual_sdcard"] = new JsonObject
            {
                ["file_path"] = null,
                ["progress"] = 0.0,
                ["is_active"] = false,
                ["file_position"] = 0,
                ["file_size"] = 0,
            };
            _objects["display_status"] = new JsonObject
            {
                ["progress"] = 0.0,
                ["message"] = null,
            };
            _objects["toolhead"] = new JsonObject
            {
                ["homed_axes"] = "",
                ["position"] = new JsonArray(0.0, 0.0, 0.0, 0.0),
                ["extruder"] = "extruder",
                ["print_time"] = 0.0,
                ["estimated_print_time"] = 0.0,
                ["max_velocity"] = 300.0,
                ["max_accel"] = 3000.0,
            };
            _objects["heater_bed"] = Heater();
            foreach (var name in Profile.ExtruderNames)
            {
                var extruder = Heater();
                extruder["can_extrude"] = false;
                extruder["pressure_advance"] = 0.04;
                extruder["smooth_time"] = 0.04;
                _objects[name] = extruder;
            }
        }
    }

    private static JsonObject Heater() => new()
    {
        ["temperature"] = PrinterSimulation.Ambient,
        ["target"] = 0.0,
        ["power"] = 0.0,
    };

    public bool Has(string obj)
    {
        lock (_lock) return _objects.ContainsKey(obj);
    }

    public JsonNode? Get(string obj, string field)
    {
        lock (_lock) return _objects[obj]?[field]?.DeepClone();
    }

    public double GetDouble(string obj, string field) => Get(obj, field)?.GetValue<double>() ?? 0;

    public string? GetString(string obj, string field) => Get(obj, field)?.GetValue<string>();

    /// <summary>Set one field. Ignored if the object doesn't exist on this printer.</summary>
    public void Set(string obj, string field, JsonNode? value)
    {
        lock (_lock)
        {
            if (_objects[obj] is JsonObject o)
                o[field] = value?.DeepClone();
        }
    }

    /// <summary>
    /// Merge {"obj": {"field": value}} into the model. Unknown objects are rejected
    /// so a typo in a control request doesn't silently do nothing.
    /// </summary>
    public IReadOnlyList<string> Merge(JsonObject changes)
    {
        var unknown = new List<string>();
        lock (_lock)
        {
            foreach (var (obj, fields) in changes)
            {
                if (_objects[obj] is not JsonObject target || fields is not JsonObject values)
                {
                    unknown.Add(obj);
                    continue;
                }
                foreach (var (field, value) in values)
                    target[field] = value?.DeepClone();
            }
        }
        return unknown;
    }

    /// <summary>A deep copy of every object, safe to read without the lock.</summary>
    public JsonObject Snapshot()
    {
        lock (_lock) return (JsonObject)_objects.DeepClone();
    }
}
