using System.Text.Json.Nodes;
using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Tests.Moonraker;

public class SpoolmanTrackerTests
{
    [Fact]
    public void Spool_becomes_data_keys()
    {
        var keys = SpoolmanTracker.Keys(20, Spool("""
            {"filament": {"name": "High Speed Artic White", "material": "PLA", "color_hex": "ffffff",
                          "vendor": {"name": "Filament Factory"}},
             "remaining_weight": 276.457}
            """));

        Assert.Equal(20, keys["id"]!.GetValue<int>());
        Assert.Equal("High Speed Artic White", keys["name"]!.GetValue<string>());
        Assert.Equal("PLA", keys["material"]!.GetValue<string>());
        Assert.Equal("Filament Factory", keys["vendor"]!.GetValue<string>());
        Assert.Equal("#FFFFFF", keys["color"]!.GetValue<string>());
        Assert.Equal(276, keys["remaining_weight"]!.GetValue<double>());
    }

    [Theory]
    [InlineData("""{"color_hex": "FF6A1380"}""", "#FF6A13")]                           // alpha dropped
    [InlineData("""{"multi_color_hexes": "00FF00,0000FF"}""", "#00FF00")]             // first of several
    [InlineData("""{"color_hex": "nope"}""", null)]
    [InlineData("""{}""", null)]
    public void Colour_is_a_panel_colour(string filament, string? expected)
    {
        var keys = SpoolmanTracker.Keys(1, new JsonObject { ["filament"] = JsonNode.Parse(filament) });

        Assert.Equal(expected, keys["color"]?.GetValue<string>());
    }

    [Fact]
    public void Unnamed_filament_falls_back_to_its_material_then_the_spool()
    {
        Assert.Equal("PETG", SpoolmanTracker.Keys(1, Spool("""{"filament": {"material": "PETG"}}"""))["name"]!.GetValue<string>());
        Assert.Equal("Spool 7", SpoolmanTracker.Keys(7, Spool("""{"filament": {}}"""))["name"]!.GetValue<string>());
    }

    [Fact]
    public void Unknown_details_leave_just_the_id() =>
        Assert.Equal(["id"], SpoolmanTracker.Keys(5, null).Select(k => k.Key));

    [Fact]
    public void Replacing_a_source_removes_its_old_keys_and_survives_a_resubscribe()
    {
        var store = new PrinterStateStore();
        store.Replace(new JsonObject { ["extruder"] = new JsonObject { ["temperature"] = 20.0 } });
        store.ReplaceSource("spool", new JsonObject { ["id"] = 1, ["vendor"] = "eSun" });

        var changes = store.ReplaceSource("spool", new JsonObject { ["id"] = 2 });
        Assert.Equal(2, changes["spool.id"]!.GetValue<int>());
        Assert.Null(changes["spool.vendor"]);

        store.Replace(new JsonObject { ["extruder"] = new JsonObject { ["temperature"] = 21.0 } });
        Assert.Equal(2, store.Snapshot(["spool.id"])["spool.id"]!.GetValue<int>());
    }

    private static JsonObject Spool(string json) => JsonNode.Parse(json)!.AsObject();
}
