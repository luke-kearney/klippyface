using System.Text.Json.Nodes;

namespace Klippyface.Server.Tests.FakeMoonraker;

/// <summary>Commands typed into the fake's terminal.</summary>
public class ConsoleCommandTests : IAsyncLifetime
{
    private FakeMoonrakerHost _host = null!;
    private MoonrakerTestClient _client = null!;

    public async ValueTask InitializeAsync()
    {
        _host = await FakeMoonrakerHost.StartAsync("single");
        _client = await _host.ConnectAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _client.DisposeAsync();
        await _host.DisposeAsync();
    }

    [Fact]
    public async Task Extruders_restarts_klipper_as_a_different_printer()
    {
        var command = _host.Console.ExecuteAsync("extruders 3");

        Assert.NotNull(await _client.NextNotificationAsync("notify_klippy_disconnected"));
        _host.Time.Advance(TimeSpan.FromSeconds(2));
        Assert.Contains("3 extruder(s)", await command);
        Assert.NotNull(await _client.NextNotificationAsync("notify_klippy_ready"));

        var objects = (await _client.CallAsync("printer.objects.list"))["result"]!["objects"]!.AsArray()
            .Select(o => o!.GetValue<string>());
        Assert.Contains("extruder2", objects);
        Assert.DoesNotContain("extruder3", objects);
    }

    [Fact]
    public async Task Profile_loads_a_profile_by_name()
    {
        var command = _host.Console.ExecuteAsync("profile quad");
        await _client.NextNotificationAsync("notify_klippy_disconnected");
        _host.Time.Advance(TimeSpan.FromSeconds(2));

        Assert.Contains("4 extruder(s)", await command);
        Assert.Equal(4, _host.Sim.Model.Profile.Extruders);
    }

    [Fact]
    public async Task Temp_sets_a_heater_target()
    {
        var result = await _host.Console.ExecuteAsync("temp bed 65");

        Assert.Equal("heater_bed target 65 °C", result);
        Assert.Equal(65, _host.Sim.Model.GetDouble("heater_bed", "target"));
    }

    [Fact]
    public async Task Set_takes_json_or_plain_text()
    {
        await _host.Console.ExecuteAsync("set print_stats.message hello there");
        await _host.Console.ExecuteAsync("set display_status.progress 0.5");

        Assert.Equal("hello there", _host.Sim.Model.GetString("print_stats", "message"));
        Assert.Equal(0.5, _host.Sim.Model.GetDouble("display_status", "progress"));
    }

    [Fact]
    public async Task Tool_rejects_a_tool_the_printer_lacks()
    {
        Assert.StartsWith("No T2", await _host.Console.ExecuteAsync("tool 2"));
    }

    [Fact]
    public async Task Respond_sends_a_console_line()
    {
        await _host.Console.ExecuteAsync("respond display:group=win");

        var line = await _client.NextNotificationAsync("notify_gcode_response");
        Assert.Equal("echo: display:group=win", line!["params"]![0]!.GetValue<string>());
    }

    [Fact]
    public async Task Status_lists_every_heater()
    {
        await _host.Console.ExecuteAsync("print 60");

        var status = await _host.Console.ExecuteAsync("status");

        Assert.Contains("print: printing benchy.gcode", status);
        Assert.Contains("extruder", status);
        Assert.Contains("← active", status);
        Assert.Contains("heater_bed", status);
    }

    [Fact]
    public async Task Unknown_commands_point_to_help()
    {
        Assert.Contains("Type 'help'", await _host.Console.ExecuteAsync("frobnicate"));
    }
}
