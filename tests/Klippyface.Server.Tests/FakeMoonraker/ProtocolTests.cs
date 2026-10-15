using System.Text.Json.Nodes;

namespace Klippyface.Server.Tests.FakeMoonraker;

/// <summary>The fake answers the way Klipper's QueryStatusHelper and Moonraker do.</summary>
public class ProtocolTests : IAsyncLifetime
{
    private static readonly TimeSpan Quiet = TimeSpan.FromMilliseconds(300);

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
    public async Task List_returns_every_object_in_the_profile()
    {
        var reply = await _client.CallAsync("printer.objects.list");

        var objects = reply["result"]!["objects"]!.AsArray().Select(o => o!.GetValue<string>());
        Assert.Equal(
            ["print_stats", "virtual_sdcard", "display_status", "toolhead", "idle_timeout", "webhooks",
             "heater_bed", "extruder", "extruder1", "extruder2", "extruder3"],
            objects);
    }

    [Fact]
    public async Task Subscribe_reply_has_every_requested_field()
    {
        var reply = await _client.SubscribeAsync(new JsonObject
        {
            ["heater_bed"] = null,
            ["extruder1"] = new JsonArray("temperature", "target"),
        });

        var status = reply["result"]!["status"]!;
        Assert.Equal(["temperature", "target", "power"], Keys(status["heater_bed"]));
        Assert.Equal(["temperature", "target"], Keys(status["extruder1"]));
        Assert.Equal(22.0, status["extruder1"]!["temperature"]!.GetValue<double>());
        Assert.NotNull(reply["result"]!["eventtime"]);
    }

    [Fact]
    public async Task Unknown_objects_are_empty_or_null_not_an_error()
    {
        var reply = await _client.SubscribeAsync(new JsonObject
        {
            ["extruder5"] = null,
            ["extruder6"] = new JsonArray("temperature"),
        });

        var status = reply["result"]!["status"]!;
        Assert.Null(reply["error"]);
        Assert.Empty(status["extruder5"]!.AsObject());
        Assert.True(status["extruder6"]!.AsObject().ContainsKey("temperature"));
        Assert.Null(status["extruder6"]!["temperature"]);
    }

    [Fact]
    public async Task Updates_carry_only_changed_fields()
    {
        await _client.SubscribeAsync(new JsonObject { ["print_stats"] = null, ["heater_bed"] = null });

        await _host.PostAsync("/_sim/state", new JsonObject { ["print_stats"] = new JsonObject { ["message"] = "hello" } });
        _host.Tick();

        var update = await _client.NextNotificationAsync("notify_status_update");
        Assert.NotNull(update);
        var changes = update["params"]![0]!;
        Assert.Equal(["print_stats"], Keys(changes));
        Assert.Equal(["message"], Keys(changes["print_stats"]));
        Assert.Equal("hello", changes["print_stats"]!["message"]!.GetValue<string>());
        Assert.NotNull(update["params"]![1]);   // eventtime
    }

    [Fact]
    public async Task Nothing_is_sent_when_nothing_changed()
    {
        await _client.SubscribeAsync(new JsonObject { ["print_stats"] = null, ["extruder"] = null });

        _host.Tick(3);

        Assert.Null(await _client.NextNotificationAsync("notify_status_update", Quiet));
    }

    [Fact]
    public async Task Unknown_objects_never_appear_in_updates()
    {
        await _client.SubscribeAsync(new JsonObject { ["extruder5"] = null, ["print_stats"] = new JsonArray("message") });

        await _host.PostAsync("/_sim/state", new JsonObject { ["print_stats"] = new JsonObject { ["message"] = "x" } });
        _host.Tick();

        var update = await _client.NextNotificationAsync("notify_status_update");
        Assert.Equal(["print_stats"], Keys(update!["params"]![0]));
    }

    [Fact]
    public async Task A_new_subscribe_replaces_the_old_one()
    {
        await _client.SubscribeAsync(new JsonObject { ["print_stats"] = null });
        await _client.SubscribeAsync(new JsonObject { ["heater_bed"] = null });

        await _host.PostAsync("/_sim/state", new JsonObject { ["print_stats"] = new JsonObject { ["message"] = "x" } });
        _host.Tick();

        Assert.Null(await _client.NextNotificationAsync("notify_status_update", Quiet));
    }

    [Fact]
    public async Task Unknown_method_is_a_json_rpc_error()
    {
        var reply = await _client.CallAsync("printer.gcode.nonsense");

        Assert.Equal(-32601, reply["error"]!["code"]!.GetValue<int>());
    }

    [Fact]
    public async Task Malformed_objects_are_rejected()
    {
        var reply = await _client.CallAsync("printer.objects.subscribe",
            new JsonObject { ["objects"] = new JsonObject { ["extruder"] = "temperature" } });

        Assert.Equal(400, reply["error"]!["code"]!.GetValue<int>());
    }

    [Fact]
    public async Task Invalid_json_gets_a_parse_error()
    {
        await _client.SendRawAsync("{not json");

        var reply = await _client.ReceiveAsync();
        Assert.Equal(-32700, reply!["error"]!["code"]!.GetValue<int>());
    }

    private static IEnumerable<string> Keys(JsonNode? node) => node!.AsObject().Select(p => p.Key);
}
