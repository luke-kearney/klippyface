using System.Text.Json.Nodes;

namespace FakeMoonraker.Simulation;

/// <summary>
/// Moonraker's [spoolman] component with a Spoolman behind it: a few spools, and
/// which one is active. Spools look like Spoolman's GET /v1/spool/{id}.
/// </summary>
public sealed class FakeSpoolman
{
    private readonly Lock _lock = new();
    private readonly Dictionary<int, JsonObject> _spools = new();
    private int? _active;

    public FakeSpoolman() => Reset();

    /// <summary>Off: Moonraker has no [spoolman] section, so its methods don't exist.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Spoolman itself is down: Moonraker still answers, but the proxy fails.</summary>
    public bool Reachable { get; set; } = true;

    /// <summary>Raised with the new id (null = none) when the active spool changes.</summary>
    public event Action<int?>? ActiveChanged;

    public int? ActiveId
    {
        get { lock (_lock) return _active; }
    }

    public IReadOnlyList<int> Ids
    {
        get { lock (_lock) return _spools.Keys.Order().ToList(); }
    }

    /// <summary>Four spools, the first active.</summary>
    public void Reset()
    {
        lock (_lock)
        {
            _spools.Clear();
            Add(1, "Galaxy Black", "PLA", "Prusament", "1B1B1B", 1000, 742.6);
            Add(2, "Arctic White", "PETG", "Polymaker", "F2F2F2", 1000, 318.2);
            Add(3, "Sunset Orange", "PLA", "eSun", "FF6A13", 1000, 905.0);
            Add(4, "Ocean Blue", "TPU", "Overture", "1565C0", 500, 121.9);
            _active = 1;
        }
    }

    /// <summary>What SET_ACTIVE_SPOOL / Moonraker's server.spoolman.post_spool_id does. False for an unknown id.</summary>
    public bool SetActive(int? id)
    {
        lock (_lock)
        {
            if (id is { } known && !_spools.ContainsKey(known)) return false;
            if (_active == id) return true;
            _active = id;
        }
        ActiveChanged?.Invoke(id);
        return true;
    }

    /// <summary>A copy of the spool as Spoolman returns it, or null.</summary>
    public JsonObject? Spool(int id)
    {
        lock (_lock) return _spools.TryGetValue(id, out var spool) ? (JsonObject)spool.DeepClone() : null;
    }

    /// <summary>Use up filament, as Moonraker reports it to Spoolman while printing. False for an unknown id.</summary>
    public bool Use(int id, double grams)
    {
        lock (_lock)
        {
            if (!_spools.TryGetValue(id, out var spool)) return false;
            var remaining = Math.Max(0, spool["remaining_weight"]!.GetValue<double>() - grams);
            spool["remaining_weight"] = Math.Round(remaining, 2);
            spool["used_weight"] = Math.Round(spool["filament"]!["weight"]!.GetValue<double>() - remaining, 2);
            return true;
        }
    }

    private void Add(int id, string name, string material, string vendor, string color, double weight, double remaining) =>
        _spools[id] = new JsonObject
        {
            ["id"] = id,
            ["registered"] = "2026-01-01T00:00:00Z",
            ["filament"] = new JsonObject
            {
                ["id"] = id,
                ["name"] = name,
                ["vendor"] = new JsonObject { ["id"] = id, ["name"] = vendor },
                ["material"] = material,
                ["density"] = 1.24,
                ["diameter"] = 1.75,
                ["weight"] = weight,
                ["color_hex"] = color,
            },
            ["remaining_weight"] = remaining,
            ["initial_weight"] = weight,
            ["used_weight"] = Math.Round(weight - remaining, 2),
            ["archived"] = false,
        };
}
