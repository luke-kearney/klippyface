using System.Text.Json.Nodes;

namespace Klippyface.Server.Tests.FakeMoonraker;

/// <summary>A capture plays back as recorded: starting state first, then each update on time.</summary>
public class ReplayTests : IAsyncLifetime
{
    // Shaped like scripts/capture-moonraker.sh output from a two-extruder printer:
    // subscribe reply (extruder2 missing → {}), then updates, with noise to skip
    private static readonly string[] CaptureLines =
    [
        """{"jsonrpc":"2.0","method":"notify_proc_stat_update","params":[{"cpu_temp":45.2}]}""",
        """{"jsonrpc":"2.0","result":{"eventtime":500.0,"status":{"print_stats":{"state":"printing","filename":"cube.gcode"},"toolhead":{"extruder":"extruder"},"extruder":{"temperature":214.8,"target":215.0},"extruder1":{"temperature":175.1,"target":175.0},"extruder2":{}}},"id":1}""",
        """{"jsonrpc":"2.0","method":"notify_status_update","params":[{"extruder":{"temperature":215.1}},501.0]}""",
        """{"jsonrpc":"2.0","method":"notify_status_update","params":[{"toolhead":{"extruder":"extruder1"},"extruder1":{"target":215.0}},503.0]}""",
    ];

    private string _path = null!;
    private FakeMoonrakerHost _host = null!;
    private MoonrakerTestClient _client = null!;

    public async ValueTask InitializeAsync()
    {
        _path = Path.GetTempFileName();
        await File.WriteAllLinesAsync(_path, CaptureLines);
        _host = await FakeMoonrakerHost.StartReplayAsync(_path);
        _client = await _host.ConnectAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _client.DisposeAsync();
        await _host.DisposeAsync();
        File.Delete(_path);
    }

    [Fact]
    public async Task Objects_come_from_the_capture()
    {
        var reply = await _client.CallAsync("printer.objects.list");

        var objects = reply["result"]!["objects"]!.AsArray().Select(o => o!.GetValue<string>());
        Assert.Equal(["print_stats", "toolhead", "extruder", "extruder1"], objects);
    }

    [Fact]
    public async Task Starts_from_the_recorded_state()
    {
        var reply = await _client.SubscribeAsync(new JsonObject { ["extruder1"] = null, ["extruder2"] = null });

        var status = reply["result"]!["status"]!;
        Assert.Equal(175.1, status["extruder1"]!["temperature"]!.GetValue<double>());
        Assert.Empty(status["extruder2"]!.AsObject());
    }

    [Fact]
    public async Task Updates_play_back_at_their_recorded_times()
    {
        await _client.SubscribeAsync(new JsonObject { ["toolhead"] = new JsonArray("extruder") });

        // Before the tool change at +3 s nothing the client watches has changed
        _host.Time.Advance(TimeSpan.FromSeconds(2));
        _host.Tick();
        Assert.Null(await _client.NextNotificationAsync("notify_status_update", TimeSpan.FromMilliseconds(300)));

        _host.Time.Advance(TimeSpan.FromSeconds(1));
        var changes = await NextChangeAsync();
        Assert.Equal("extruder1", changes["toolhead"]!["extruder"]!.GetValue<string>());
    }

    [Fact]
    public async Task Physics_is_off_so_only_recorded_values_change()
    {
        await _client.SubscribeAsync(new JsonObject { ["extruder1"] = new JsonArray("temperature") });

        _host.Tick(8);   // two seconds: the capture never changes extruder1's temperature

        Assert.Null(await _client.NextNotificationAsync("notify_status_update", TimeSpan.FromMilliseconds(300)));
    }

    /// <summary>
    /// The replay and the broadcast tick run on separate timers, so the change
    /// can land just after a tick; tick until it arrives.
    /// </summary>
    private async Task<JsonNode> NextChangeAsync()
    {
        for (var i = 0; i < 8; i++)
        {
            _host.Tick();
            if (await _client.NextNotificationAsync("notify_status_update", TimeSpan.FromMilliseconds(250)) is { } update)
                return update["params"]![0]!;
        }
        throw new TimeoutException("No status update");
    }
}
