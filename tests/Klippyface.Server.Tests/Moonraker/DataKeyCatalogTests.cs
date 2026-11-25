using System.Text.Json.Nodes;
using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Tests.Moonraker;

public class DataKeyCatalogTests
{
    private static readonly Dictionary<string, JsonNode?> NoValues = new();

    [Fact]
    public void Single_extruder_printer_gets_no_per_tool_keys()
    {
        var keys = DataKeyCatalog.Build(["toolhead", "extruder", "heater_bed"], NoValues, spoolman: false).Select(k => k.Key).ToList();

        Assert.Contains(PrinterStateStore.NozzleTemperatureKey, keys);
        Assert.DoesNotContain(PrinterStateStore.ToolKey, keys);
        Assert.DoesNotContain("extruder.temperature", keys);
    }

    [Fact]
    public void Multi_tool_printer_gets_a_key_per_tool()
    {
        var keys = DataKeyCatalog.Build(["extruder", "extruder1", "extruder2", "extruder3", "heater_bed"], NoValues, spoolman: false);

        Assert.Contains(keys, k => k.Key == PrinterStateStore.ToolKey);
        Assert.Equal(
            ["extruder.temperature", "extruder1.temperature", "extruder2.temperature", "extruder3.temperature"],
            keys.Where(k => k.Group == "Tools" && k.Key.EndsWith(".temperature")).Select(k => k.Key));
        Assert.Contains(keys, k => k.Key == "extruder3.target" && k.Label == "T3 nozzle target");
    }

    [Fact]
    public void Without_moonraker_the_common_keys_are_still_offered()
    {
        var keys = DataKeyCatalog.Build([], NoValues, spoolman: false).Select(k => k.Key).ToList();

        Assert.Contains("print_stats.progress", keys);
        Assert.Contains(PrinterStateStore.NozzleTemperatureKey, keys);
        Assert.Contains("heater_bed.temperature", keys);
    }

    [Fact]
    public void Filament_keys_only_with_spoolman()
    {
        Assert.DoesNotContain(DataKeyCatalog.Build(["extruder"], NoValues, spoolman: false), k => k.Group == "Filament");

        var filament = DataKeyCatalog.Build(["extruder"], NoValues, spoolman: true).Where(k => k.Group == "Filament").ToList();
        Assert.Contains(filament, k => k.Key == "spool.name");
        Assert.Contains(filament, k => k.Key == "spool.color");
        Assert.Contains(filament, k => k.Key == "spool.remaining_weight");
    }

    [Fact]
    public void Tools_with_a_spool_get_filament_keys()
    {
        var values = new Dictionary<string, JsonNode?>
        {
            ["gcode_macro T0.spool_id"] = 1,
            ["gcode_macro T1.spool_id"] = 2,
            ["gcode_macro T2.spool_id"] = null,   // nothing loaded
        };

        var keys = DataKeyCatalog.Build(["extruder", "extruder1", "extruder2"], values, spoolman: true);

        var tools = keys.Where(k => k.Group == "Tool filament").Select(k => k.Key).ToList();
        Assert.Contains("spool.tool0.name", tools);
        Assert.Contains("spool.tool1.color", tools);
        Assert.DoesNotContain(tools, k => k.StartsWith("spool.tool2."));
        Assert.Contains(keys, k => k.Key == "spool.tool1.name" && k.Label == "T1 filament");
    }
}
