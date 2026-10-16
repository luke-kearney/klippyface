using System.Text.Json.Nodes;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>A data key a face can show, as offered in the editor.</summary>
public sealed record DataKey(string Key, string Label, string Group);

/// <summary>
/// The data keys worth offering for this printer: the common ones, a key per tool
/// when it has more than one extruder, and the loaded filament when Moonraker has
/// Spoolman. Faces can bind any key; this is only what the editor lists.
/// </summary>
public static class DataKeyCatalog
{
    /// <summary>The fields of a spool's data keys ("spool.name", ...), with labels.</summary>
    public static readonly (string Field, string Label)[] SpoolFields =
    [
        ("name", "Filament"),
        ("material", "Material"),
        ("vendor", "Vendor"),
        ("color", "Colour"),
        ("remaining_weight", "Remaining"),
        ("id", "Spool ID"),
    ];

    public static IReadOnlyList<DataKey> Build(IReadOnlyList<string> objects, IReadOnlyDictionary<string, JsonNode?> values,
                                               bool spoolman)
    {
        var tools = objects
            .Select(PrinterStateStore.ToolIndex)
            .OfType<int>()
            .Order()
            .ToList();
        var multiTool = tools.Count > 1;

        var keys = new List<DataKey>
        {
            new("print_stats.progress", "Print progress", "Print"),
            new(PrinterStateStore.DisplayStateKey, "Printer state", "Print"),
            new(PrinterStateStore.NozzleTemperatureKey, multiTool ? "Nozzle temp (active tool)" : "Nozzle temp", "Nozzle"),
            new(PrinterStateStore.NozzleTargetKey, multiTool ? "Nozzle target (active tool)" : "Nozzle target", "Nozzle"),
        };

        if (multiTool)
        {
            keys.Add(new(PrinterStateStore.ToolKey, "Active tool", "Nozzle"));
            foreach (var tool in tools)
            {
                var extruder = tool == 0 ? "extruder" : $"extruder{tool}";
                keys.Add(new($"{extruder}.temperature", $"T{tool} nozzle temp", "Tools"));
                keys.Add(new($"{extruder}.target", $"T{tool} nozzle target", "Tools"));
            }
        }

        if (spoolman)
        {
            foreach (var (field, label) in SpoolFields)
                keys.Add(new($"{SpoolmanTracker.Root}.{field}", label, "Filament"));
        }

        keys.Add(new("heater_bed.temperature", "Bed temp", "Bed"));
        keys.Add(new("heater_bed.target", "Bed target", "Bed"));
        keys.Add(new("moonraker.connected", "Moonraker status", "Status"));
        return keys;
    }
}
