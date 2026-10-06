using System.Text.Json.Nodes;
using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Tests.Moonraker;

public class PrinterStateStoreTests
{
    private readonly PrinterStateStore _store = new();

    [Fact]
    public void Replace_flattens_objects_to_data_keys()
    {
        var changes = _store.Replace(Json("""
            {"extruder": {"temperature": 210.5, "target": 215},
             "print_stats": {"state": "printing", "info": {"current_layer": 3}},
             "toolhead": {"position": [1, 2, 3, 4]},
             "extruder3": {}}
            """));

        Assert.Equal(210.5, changes["extruder.temperature"]!.GetValue<double>());
        Assert.Equal(3, changes["print_stats.info.current_layer"]!.GetValue<int>());
        Assert.Equal(4, changes["toolhead.position"]!.AsArray().Count);
        Assert.DoesNotContain(changes.Keys, k => k.StartsWith("extruder3"));
    }

    [Fact]
    public void Apply_returns_only_what_changed()
    {
        _store.Replace(Json("""{"extruder": {"temperature": 210.0, "target": 215}}"""));

        var changes = _store.Apply(Json("""{"extruder": {"temperature": 211.0, "target": 215}}"""));

        Assert.Equal(["extruder.temperature"], changes.Keys);
    }

    [Fact]
    public void Missing_fields_keep_their_last_value()
    {
        _store.Replace(Json("""{"extruder": {"temperature": 210.0}, "heater_bed": {"temperature": 60.0}}"""));

        _store.Apply(Json("""{"heater_bed": {"temperature": 61.0}}"""));

        Assert.Equal(210.0, _store.Snapshot(["extruder.temperature"])["extruder.temperature"]!.GetValue<double>());
    }

    [Fact]
    public void Replace_reports_keys_that_went_away()
    {
        _store.Replace(Json("""{"extruder1": {"temperature": 20.0}}"""));

        var changes = _store.Replace(Json("""{"extruder": {"temperature": 20.0}}"""));

        Assert.True(changes.ContainsKey("extruder1.temperature"));
        Assert.Null(changes["extruder1.temperature"]);
        Assert.Empty(_store.Snapshot(["extruder1.temperature"]));
    }

    [Fact]
    public void Print_progress_comes_from_display_status()
    {
        var changes = _store.Replace(Json("""
            {"display_status": {"progress": 0.42}, "virtual_sdcard": {"progress": 0.40}}
            """));

        Assert.Equal(0.42, changes["print_stats.progress"]!.GetValue<double>());
    }

    [Fact]
    public void Print_progress_falls_back_to_virtual_sdcard()
    {
        _store.Replace(Json("""{"virtual_sdcard": {"progress": 0.1}}"""));

        var changes = _store.Apply(Json("""{"virtual_sdcard": {"progress": 0.2}}"""));

        Assert.Equal(0.2, changes["print_stats.progress"]!.GetValue<double>());
    }

    private static JsonObject Json(string text) => JsonNode.Parse(text)!.AsObject();
}
