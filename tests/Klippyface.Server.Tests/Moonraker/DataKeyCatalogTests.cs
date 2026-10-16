using System.Text.Json.Nodes;
using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Tests.Moonraker;

public class DataKeyCatalogTests
{
    private static readonly Dictionary<string, JsonNode?> NoValues = new();

    [Fact]
    public void Single_extruder_printer_gets_no_per_tool_keys()
    {
        var keys = DataKeyCatalog.Build(["toolhead", "extruder", "heater_bed"], NoValues).Select(k => k.Key).ToList();

        Assert.Contains(PrinterStateStore.NozzleTemperatureKey, keys);
        Assert.DoesNotContain(PrinterStateStore.ToolKey, keys);
        Assert.DoesNotContain("extruder.temperature", keys);
    }

    [Fact]
    public void Multi_tool_printer_gets_a_key_per_tool()
    {
        var keys = DataKeyCatalog.Build(["extruder", "extruder1", "extruder2", "extruder3", "heater_bed"], NoValues);

        Assert.Contains(keys, k => k.Key == PrinterStateStore.ToolKey);
        Assert.Equal(
            ["extruder.temperature", "extruder1.temperature", "extruder2.temperature", "extruder3.temperature"],
            keys.Where(k => k.Group == "Tools" && k.Key.EndsWith(".temperature")).Select(k => k.Key));
        Assert.Contains(keys, k => k.Key == "extruder3.target" && k.Label == "T3 nozzle target");
    }

    [Fact]
    public void Without_moonraker_the_common_keys_are_still_offered()
    {
        var keys = DataKeyCatalog.Build([], NoValues).Select(k => k.Key).ToList();

        Assert.Contains("print_stats.progress", keys);
        Assert.Contains(PrinterStateStore.NozzleTemperatureKey, keys);
        Assert.Contains("heater_bed.temperature", keys);
    }
}
