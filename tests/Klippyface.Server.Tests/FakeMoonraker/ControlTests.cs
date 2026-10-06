using System.Net;
using System.Text.Json.Nodes;
using FakeMoonraker.Simulation;

namespace Klippyface.Server.Tests.FakeMoonraker;

/// <summary>/_sim/* endpoints and the simulation turn into the right Moonraker messages.</summary>
public class ControlTests : IAsyncLifetime
{
    private FakeMoonrakerHost _host = null!;
    private MoonrakerTestClient _client = null!;

    public async ValueTask InitializeAsync()
    {
        _host = await FakeMoonrakerHost.StartAsync("quad");
        _client = await _host.ConnectAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _client.DisposeAsync();
        await _host.DisposeAsync();
    }

    [Fact]
    public async Task Respond_sends_a_gcode_response_like_klipper()
    {
        var response = await _host.PostAsync("/_sim/respond", new { msg = "display:node=desk group=win" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var notification = await _client.NextNotificationAsync("notify_gcode_response");
        Assert.Equal("echo: display:node=desk group=win", notification!["params"]![0]!.GetValue<string>());
    }

    [Fact]
    public async Task Toolchange_during_a_print_moves_heat_to_the_new_tool()
    {
        await _host.PostAsync("/_sim/print/start");
        await _client.SubscribeAsync(new JsonObject
        {
            ["toolhead"] = new JsonArray("extruder"),
            ["extruder"] = new JsonArray("target"),
            ["extruder2"] = new JsonArray("target"),
        });

        var response = await _host.PostAsync("/_sim/toolchange/2");
        _host.Tick();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var changes = (await _client.NextNotificationAsync("notify_status_update"))!["params"]![0]!;
        Assert.Equal("extruder2", changes["toolhead"]!["extruder"]!.GetValue<string>());
        Assert.Equal(175.0, changes["extruder"]!["target"]!.GetValue<double>());
        Assert.Equal(215.0, changes["extruder2"]!["target"]!.GetValue<double>());
    }

    [Fact]
    public async Task Toolchange_to_a_missing_tool_is_not_found()
    {
        var response = await _host.PostAsync("/_sim/toolchange/4");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Print_heats_up_then_reports_progress_in_virtual_sdcard()
    {
        await _host.PostAsync("/_sim/print/start", new { duration_s = 60 });

        // A minute of simulated time, a tick at a time: enough to heat up and start printing.
        // Stepped directly because the timer merges ticks when fake time jumps ahead.
        for (var i = 0; i < 4 * 60; i++)
            _host.Sim.Advance(SimulationTicker.Interval);
        var status = (await _client.CallAsync("printer.objects.query", new JsonObject
        {
            ["objects"] = new JsonObject { ["print_stats"] = null, ["virtual_sdcard"] = null },
        }))["result"]!["status"]!;

        Assert.Equal("printing", status["print_stats"]!["state"]!.GetValue<string>());
        Assert.InRange(status["virtual_sdcard"]!["progress"]!.GetValue<double>(), 0.01, 0.99);
        Assert.False(status["print_stats"]!.AsObject().ContainsKey("progress"));   // Klipper has none
    }

    [Fact]
    public async Task Starting_a_second_print_is_a_conflict()
    {
        await _host.PostAsync("/_sim/print/start");

        var response = await _host.PostAsync("/_sim/print/start");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Setting_an_unknown_object_is_rejected()
    {
        var response = await _host.PostAsync("/_sim/state", new JsonObject { ["extruder9"] = new JsonObject { ["target"] = 1 } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Klippy_restart_drops_subscriptions_until_ready()
    {
        await _client.SubscribeAsync(new JsonObject { ["print_stats"] = null });

        await _host.PostAsync("/_sim/klippy/restart?seconds=5");

        Assert.NotNull(await _client.NextNotificationAsync("notify_klippy_disconnected"));
        var whileDown = await _client.CallAsync("printer.objects.subscribe",
            new JsonObject { ["objects"] = new JsonObject { ["print_stats"] = null } });
        Assert.Equal(503, whileDown["error"]!["code"]!.GetValue<int>());

        _host.Time.Advance(TimeSpan.FromSeconds(5));

        Assert.NotNull(await _client.NextNotificationAsync("notify_klippy_ready"));
        var after = await _client.SubscribeAsync(new JsonObject { ["print_stats"] = null });
        Assert.Equal("standby", after["result"]!["status"]!["print_stats"]!["state"]!.GetValue<string>());
    }

    [Fact]
    public async Task Disconnect_drops_every_client()
    {
        var response = await _host.PostAsync("/_sim/disconnect");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await _client.WaitForCloseAsync();
        Assert.True(_client.Closed);
    }
}
