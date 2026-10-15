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

    [Theory]
    [InlineData("standby", 0, "Idle", "ready", "idle")]
    [InlineData("standby", 0, "Ready", "ready", "idle")]
    [InlineData("standby", 0, "Printing", "ready", "busy")]
    [InlineData("printing", 0, "Printing", "ready", "heating")]
    [InlineData("printing", 12.5, "Printing", "ready", "printing")]
    [InlineData("paused", 12.5, "Ready", "ready", "paused")]
    [InlineData("complete", 900, "Ready", "ready", "complete")]
    [InlineData("complete", 900, "Printing", "ready", "complete")]
    [InlineData("complete", 900, "Idle", "ready", "idle")]
    [InlineData("cancelled", 40, "Ready", "ready", "cancelled")]
    [InlineData("cancelled", 40, "Idle", "ready", "idle")]
    [InlineData("error", 40, "Ready", "ready", "error")]
    [InlineData("printing", 40, "Printing", "shutdown", "error")]
    [InlineData("standby", 0, "Idle", "error", "error")]
    public void Display_state_follows_klipper(string print, double filament, string idle, string klippy, string expected)
    {
        var status = new JsonObject
        {
            ["print_stats"] = new JsonObject { ["state"] = print, ["filament_used"] = filament },
            ["idle_timeout"] = new JsonObject { ["state"] = idle },
            ["webhooks"] = new JsonObject { ["state"] = klippy },
        };

        var changes = _store.Replace(status);

        Assert.Equal(expected, changes[PrinterStateStore.DisplayStateKey]!.GetValue<string>());
    }

    [Theory]
    [InlineData("standby", "Ready", 46.8, 60, 121, 120, "heating")]   // preheat: bed still warming, nozzle holding
    [InlineData("standby", "Ready", 60.8, 60, 120, 120, "idle")]      // preheat reached temperature
    [InlineData("standby", "Ready", 58.5, 60, 120, 120, "idle")]      // settling just under target
    [InlineData("standby", "Printing", 30, 60, 25, 0, "heating")]     // M190 waiting
    [InlineData("standby", "Ready", 175, 0, 58, 0, "idle")]           // cooling down, no targets
    [InlineData("complete", "Ready", 40, 60, 25, 0, "heating")]       // preheat for the next print
    [InlineData("complete", "Ready", 60, 60, 200, 200, "complete")]   // heaters held after a print
    [InlineData("complete", "Idle", 25, 0, 210, 200, "idle")]         // lowering a target isn't heating
    [InlineData("paused", "Ready", 40, 60, 150, 200, "paused")]       // reheating on resume
    public void Display_state_shows_heaters_warming_up(
        string print, string idle, double bed, double bedTarget, double nozzle, double nozzleTarget, string expected)
    {
        var status = new JsonObject
        {
            ["print_stats"] = new JsonObject { ["state"] = print, ["filament_used"] = 0 },
            ["idle_timeout"] = new JsonObject { ["state"] = idle },
            ["webhooks"] = new JsonObject { ["state"] = "ready" },
            ["heater_bed"] = new JsonObject { ["temperature"] = bed, ["target"] = bedTarget },
            ["extruder"] = new JsonObject { ["temperature"] = nozzle, ["target"] = nozzleTarget },
        };

        var changes = _store.Replace(status);

        Assert.Equal(expected, changes[PrinterStateStore.DisplayStateKey]!.GetValue<string>());
    }

    [Fact]
    public void Display_state_counts_any_extruder()
    {
        _store.Replace(Json("""
            {"print_stats": {"state": "standby"}, "idle_timeout": {"state": "Ready"}, "webhooks": {"state": "ready"},
             "extruder": {"temperature": 25, "target": 0}, "extruder1": {"temperature": 25, "target": 0}}
            """));

        var changes = _store.Apply(Json("""{"extruder1": {"target": 210}}"""));

        Assert.Equal("heating", changes[PrinterStateStore.DisplayStateKey]!.GetValue<string>());
    }

    [Fact]
    public void Turning_the_motors_off_dismisses_a_finished_print()
    {
        _store.Replace(Json("""
            {"print_stats": {"state": "printing", "filament_used": 10524}, "idle_timeout": {"state": "Printing"},
             "webhooks": {"state": "ready"}, "toolhead": {"homed_axes": "xyz"}}
            """));
        Assert.Equal("complete", State(_store.Apply(Json("""{"print_stats": {"state": "complete"}, "idle_timeout": {"state": "Ready"}}"""))));

        Assert.Equal("idle", State(_store.Apply(Json("""{"toolhead": {"homed_axes": ""}}"""))));

        // Homing afterwards doesn't bring the result back
        _store.Apply(Json("""{"idle_timeout": {"state": "Printing"}, "toolhead": {"homed_axes": "xyz"}}"""));
        Assert.Equal("idle", State(_store.Apply(Json("""{"idle_timeout": {"state": "Ready"}}"""))));

        Assert.Equal("heating", State(_store.Apply(Json("""{"print_stats": {"state": "printing", "filament_used": 0}}"""))));
    }

    [Fact]
    public void Motors_turned_off_by_the_end_gcode_keep_the_result()
    {
        _store.Replace(Json("""
            {"print_stats": {"state": "printing", "filament_used": 900}, "idle_timeout": {"state": "Printing"},
             "webhooks": {"state": "ready"}, "toolhead": {"homed_axes": "xyz"}}
            """));

        var changes = _store.Apply(Json("""
            {"print_stats": {"state": "complete"}, "idle_timeout": {"state": "Ready"}, "toolhead": {"homed_axes": ""}}
            """));

        Assert.Equal("complete", State(changes));
    }

    [Fact]
    public void Idle_timeout_dismisses_a_finished_print_for_good()
    {
        _store.Replace(Json("""
            {"print_stats": {"state": "cancelled"}, "idle_timeout": {"state": "Ready"},
             "webhooks": {"state": "ready"}, "toolhead": {"homed_axes": "xyz"}}
            """));

        Assert.Equal("idle", State(_store.Apply(Json("""{"idle_timeout": {"state": "Idle"}}"""))));

        Assert.Equal("busy", State(_store.Apply(Json("""{"idle_timeout": {"state": "Printing"}}"""))));
        Assert.Equal("idle", State(_store.Apply(Json("""{"idle_timeout": {"state": "Ready"}}"""))));
    }

    [Theory]
    [InlineData("printing", 12.5, "Printing", "ready", true)]   // printing
    [InlineData("printing", 0, "Printing", "ready", true)]      // heating
    [InlineData("paused", 12.5, "Ready", "ready", true)]
    [InlineData("standby", 0, "Printing", "ready", true)]       // busy
    [InlineData("standby", 0, "Idle", "shutdown", true)]        // error
    [InlineData("standby", 0, "Ready", "ready", false)]         // idle
    [InlineData("complete", 900, "Ready", "ready", false)]
    [InlineData("cancelled", 40, "Ready", "ready", false)]
    public void Active_follows_the_display_state(string print, double filament, string idle, string klippy, bool expected)
    {
        var status = new JsonObject
        {
            ["print_stats"] = new JsonObject { ["state"] = print, ["filament_used"] = filament },
            ["idle_timeout"] = new JsonObject { ["state"] = idle },
            ["webhooks"] = new JsonObject { ["state"] = klippy },
        };

        var changes = _store.Replace(status);

        Assert.Equal(expected, changes[PrinterStateStore.ActiveKey]!.GetValue<bool>());
    }

    [Fact]
    public void Display_state_waits_for_a_print_state()
    {
        var changes = _store.Replace(Json("""{"idle_timeout": {"state": "Idle"}}"""));

        Assert.False(changes.ContainsKey(PrinterStateStore.DisplayStateKey));
        Assert.False(changes.ContainsKey(PrinterStateStore.ActiveKey));
    }

    private static JsonObject Json(string text) => JsonNode.Parse(text)!.AsObject();

    private static string? State(IReadOnlyDictionary<string, JsonNode?> changes) =>
        changes.GetValueOrDefault(PrinterStateStore.DisplayStateKey)?.GetValue<string>();
}
