using System.Text.Json.Nodes;
using System.Threading.Channels;
using Klippyface.Server.Models;
using Klippyface.Server.Services.Moonraker;
using Klippyface.Server.Tests.FakeMoonraker;
using Microsoft.Extensions.Logging.Abstractions;

namespace Klippyface.Server.Tests.Moonraker;

/// <summary>The server's Moonraker connection, against the fake Moonraker.</summary>
public class MoonrakerServiceTests : IAsyncLifetime
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(5);

    private readonly RecordingListener _listener = new();
    private readonly TestSettings _settings = new();
    private readonly PrinterStateStore _store = new();
    private FakeMoonrakerHost _fake = null!;
    private MoonrakerService _service = null!;

    public async ValueTask InitializeAsync()
    {
        _fake = await FakeMoonrakerHost.StartAsync("quad");
        _settings.Current = new MoonrakerSettings { Host = _fake.WebSocketUrl.Host, Port = _fake.WebSocketUrl.Port };
        _service = new MoonrakerService(_settings, _store, _listener,
            new MoonrakerServiceOptions
            {
                RetryDelays = [TimeSpan.FromMilliseconds(100)],
                KlippyRetry = TimeSpan.FromMilliseconds(200),
                SpoolmanRefresh = TimeSpan.FromMilliseconds(300),
            },
            NullLogger<MoonrakerService>.Instance);
    }

    public async ValueTask DisposeAsync()
    {
        await _service.StopAsync(CancellationToken.None);
        _service.Dispose();
        await _fake.DisposeAsync();
    }

    private Task StartAsync() => _service.StartAsync(CancellationToken.None);

    [Fact]
    public async Task Subscribes_to_the_objects_displays_use()
    {
        await StartAsync();

        var status = await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        Assert.Equal(
            ["print_stats", "virtual_sdcard", "display_status", "toolhead", "idle_timeout", "webhooks",
             "heater_bed", "extruder", "extruder1", "extruder2", "extruder3"],
            status.Objects);
        Assert.Equal("standby", _store.Snapshot(["print_stats.state"])["print_stats.state"]!.GetValue<string>());
        Assert.True(_store.Snapshot(["extruder3.temperature"]).ContainsKey("extruder3.temperature"));
    }

    [Fact]
    public async Task Changes_reach_the_listener()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/state", new JsonObject { ["extruder2"] = new JsonObject { ["target"] = 240 } });
        _fake.Tick();

        var changes = await _listener.WaitForChangeAsync("extruder2.target", v => v?.GetValue<double>() == 240);
        Assert.DoesNotContain("extruder.target", changes.Keys);   // unchanged fields stay out
    }

    [Fact]
    public async Task Print_progress_is_relayed_as_print_stats_progress()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/print/start", new { duration_s = 60 });
        for (var i = 0; i < 4 * 60; i++)
            _fake.Sim.Advance(global::FakeMoonraker.Simulation.SimulationTicker.Interval);
        _fake.Tick();

        var changes = await _listener.WaitForChangeAsync("print_stats.progress", v => v?.GetValue<double>() > 0);
        Assert.InRange(changes["print_stats.progress"]!.GetValue<double>(), 0.01, 0.99);
    }

    [Fact]
    public async Task Resubscribes_after_a_klipper_restart()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/klippy/restart?seconds=2");
        await _listener.WaitForStatusAsync(MoonrakerState.KlippyNotReady);
        _fake.Time.Advance(TimeSpan.FromSeconds(2));
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/state", new JsonObject { ["heater_bed"] = new JsonObject { ["target"] = 70 } });
        _fake.Tick();
        Assert.NotNull(await _listener.WaitForChangeAsync("heater_bed.target", v => v?.GetValue<double>() == 70));
    }

    [Fact]
    public async Task Nozzle_keys_follow_a_tool_change()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/state", new JsonObject { ["extruder2"] = new JsonObject { ["target"] = 230 } });
        await _fake.PostAsync("/_sim/toolchange/2");
        _fake.Tick();

        var changes = await _listener.WaitForChangeAsync(PrinterStateStore.ToolKey, v => v?.GetValue<string>() == "T2");
        Assert.Equal(230, changes[PrinterStateStore.NozzleTargetKey]!.GetValue<double>());
    }

    [Fact]
    public async Task Active_spool_becomes_filament_keys()
    {
        await StartAsync();

        var changes = await _listener.WaitForChangeAsync("spool.name", v => v?.GetValue<string>() == "Galaxy Black");
        Assert.Equal("PLA", changes["spool.material"]!.GetValue<string>());
        Assert.Equal("Prusament", changes["spool.vendor"]!.GetValue<string>());
        Assert.Equal("#1B1B1B", changes["spool.color"]!.GetValue<string>());
        Assert.Equal(743, changes["spool.remaining_weight"]!.GetValue<double>());
        Assert.Equal(1, changes["spool.id"]!.GetValue<int>());
        Assert.True(_service.SpoolmanAvailable);
    }

    [Fact]
    public async Task Changing_the_active_spool_updates_the_keys()
    {
        await StartAsync();
        await _listener.WaitForChangeAsync("spool.id", v => v?.GetValue<int>() == 1);

        await _fake.PostAsync("/_sim/spool/3");
        var changes = await _listener.WaitForChangeAsync("spool.id", v => v?.GetValue<int>() == 3);
        Assert.Equal("Sunset Orange", changes["spool.name"]!.GetValue<string>());

        // No spool: the keys go away, so faces show --
        await _fake.PostAsync("/_sim/spool/0");
        changes = await _listener.WaitForChangeAsync("spool.id", v => v is null);
        Assert.Contains("spool.name", changes.Keys);
        Assert.Empty(_store.Snapshot(["spool.name"]));
    }

    [Fact]
    public async Task Remaining_weight_is_refreshed_while_it_prints()
    {
        await StartAsync();
        await _listener.WaitForChangeAsync("spool.id", v => v?.GetValue<int>() == 1);

        await _fake.PostAsync("/_sim/spool/1/use?grams=100.4");

        await _listener.WaitForChangeAsync("spool.remaining_weight", v => v?.GetValue<double>() == 642);
    }

    [Fact]
    public async Task Spoolman_down_keeps_the_last_known_filament()
    {
        await StartAsync();
        await _listener.WaitForChangeAsync("spool.name", v => v?.GetValue<string>() == "Galaxy Black");

        _fake.Spoolman.Reachable = false;
        await _fake.PostAsync("/_sim/spool/1/use?grams=50");
        await Task.Delay(800, TestContext.Current.CancellationToken);   // a couple of refreshes

        Assert.Equal("Galaxy Black", _store.Snapshot(["spool.name"])["spool.name"]!.GetValue<string>());
        Assert.Equal(743, _store.Snapshot(["spool.remaining_weight"])["spool.remaining_weight"]!.GetValue<double>());
    }

    [Fact]
    public async Task Filament_keys_survive_a_klipper_restart()
    {
        await StartAsync();
        await _listener.WaitForChangeAsync("spool.name", v => v?.GetValue<string>() == "Galaxy Black");

        await _fake.PostAsync("/_sim/klippy/restart?seconds=1");
        await _listener.WaitForStatusAsync(MoonrakerState.KlippyNotReady);
        _fake.Time.Advance(TimeSpan.FromSeconds(1));
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        Assert.Equal("Galaxy Black", _store.Snapshot(["spool.name"])["spool.name"]!.GetValue<string>());
    }

    [Fact]
    public async Task Without_spoolman_there_are_no_filament_keys()
    {
        _fake.Spoolman.Enabled = false;
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);
        await Task.Delay(500, TestContext.Current.CancellationToken);

        Assert.False(_service.SpoolmanAvailable);
        Assert.DoesNotContain(_store.All().Keys, k => k.StartsWith("spool."));
    }

    [Fact]
    public async Task Klipper_shutdown_is_an_error_not_offline()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/klippy/shutdown?message=Heater%20extruder%20not%20heating");
        _fake.Tick();

        var status = await _listener.WaitForStatusAsync(MoonrakerState.KlippyShutdown);
        Assert.True(status.Connected);
        Assert.Equal("error", _store.Snapshot([PrinterStateStore.DisplayStateKey])[PrinterStateStore.DisplayStateKey]!.GetValue<string>());

        // FIRMWARE_RESTART brings it back
        await _fake.PostAsync("/_sim/klippy/restart?seconds=1");
        _fake.Time.Advance(TimeSpan.FromSeconds(1));
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);
        Assert.Equal("idle", _store.Snapshot([PrinterStateStore.DisplayStateKey])[PrinterStateStore.DisplayStateKey]!.GetValue<string>());
    }

    [Fact]
    public async Task Reconnects_after_the_connection_drops()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/disconnect");

        await _listener.WaitForStatusAsync(MoonrakerState.Disconnected);
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);
    }

    [Fact]
    public async Task Console_lines_are_passed_on()
    {
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.Ready);

        await _fake.PostAsync("/_sim/respond", new { msg = "display:group=win" });

        Assert.Equal("echo: display:group=win", await _listener.WaitForGcodeAsync());
    }

    [Fact]
    public async Task Waits_for_settings_then_connects()
    {
        var target = _settings.Current;
        _settings.Current = new MoonrakerSettings();
        await StartAsync();
        await _listener.WaitForStatusAsync(MoonrakerState.NotConfigured);

        _settings.Current = target;
        _service.Reconnect();

        await _listener.WaitForStatusAsync(MoonrakerState.Ready);
    }

    [Fact]
    public async Task Unreachable_moonraker_is_reported_and_retried()
    {
        _settings.Current = new MoonrakerSettings { Host = "127.0.0.1", Port = 1 };
        await StartAsync();

        var status = await _listener.WaitForStatusAsync(MoonrakerState.Disconnected);
        Assert.False(status.Connected);
        Assert.False(string.IsNullOrEmpty(status.Detail));
    }

    private sealed class TestSettings : IMoonrakerSettingsProvider
    {
        public MoonrakerSettings Current { get; set; } = new();

        public Task<MoonrakerSettings> GetAsync(CancellationToken ct) => Task.FromResult(Current);
    }

    /// <summary>Everything the service reports, to wait on in order.</summary>
    private sealed class RecordingListener : IPrinterStateListener
    {
        private readonly Channel<object> _events = Channel.CreateUnbounded<object>();

        public Task OnStatusChangedAsync(MoonrakerStatus status) => Write(status);
        public Task OnStateChangedAsync(IReadOnlyDictionary<string, JsonNode?> changes) => Write(changes);
        public Task OnGcodeResponseAsync(string line) => Write(line);

        private Task Write(object e)
        {
            _events.Writer.TryWrite(e);
            return Task.CompletedTask;
        }

        public async Task<MoonrakerStatus> WaitForStatusAsync(MoonrakerState state) =>
            await WaitForAsync<MoonrakerStatus>(s => s.State == state, $"status {state}");

        public async Task<IReadOnlyDictionary<string, JsonNode?>> WaitForChangeAsync(string key, Func<JsonNode?, bool> value) =>
            await WaitForAsync<IReadOnlyDictionary<string, JsonNode?>>(
                c => c.TryGetValue(key, out var v) && value(v), $"a change to {key}");

        public async Task<string> WaitForGcodeAsync() => await WaitForAsync<string>(_ => true, "a console line");

        private async Task<T> WaitForAsync<T>(Func<T, bool> match, string what)
        {
            using var timeout = new CancellationTokenSource(Wait);
            try
            {
                while (true)
                {
                    if (await _events.Reader.ReadAsync(timeout.Token) is T item && match(item))
                        return item;
                }
            }
            catch (OperationCanceledException)
            {
                throw new TimeoutException($"Timed out waiting for {what}");
            }
        }
    }
}
