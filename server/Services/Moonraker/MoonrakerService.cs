using System.Net.WebSockets;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Klippyface.Server.Models;

namespace Klippyface.Server.Services.Moonraker;

public enum MoonrakerState
{
    /// <summary>No Moonraker host saved yet.</summary>
    NotConfigured,
    Connecting,
    /// <summary>Moonraker is up but Klipper isn't (starting or restarting).</summary>
    KlippyNotReady,
    Ready,
    /// <summary>
    /// Klipper has shut down (thermal runaway, lost MCU…) and waits for a restart.
    /// Still connected: nodes show the error state rather than offline.
    /// </summary>
    KlippyShutdown,
    /// <summary>Last attempt failed; retrying after a delay.</summary>
    Disconnected,
}

public sealed record MoonrakerStatus(MoonrakerState State, string? Detail, IReadOnlyList<string> Objects)
{
    public bool Connected => State is MoonrakerState.Ready or MoonrakerState.KlippyShutdown;
}

/// <summary>Told about everything the printer does. Calls arrive one at a time, in order.</summary>
public interface IPrinterStateListener
{
    Task OnStatusChangedAsync(MoonrakerStatus status);
    Task OnStateChangedAsync(IReadOnlyDictionary<string, JsonNode?> changes);
    Task OnGcodeResponseAsync(string line);
}

/// <summary>Where the Moonraker connection settings come from (the database, or a test).</summary>
public interface IMoonrakerSettingsProvider
{
    Task<MoonrakerSettings> GetAsync(CancellationToken ct);
}

public sealed class MoonrakerServiceOptions
{
    /// <summary>Delays between failed connection attempts; the last one repeats.</summary>
    public TimeSpan[] RetryDelays { get; set; } =
        [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(30)];

    /// <summary>How often to retry setup while Klipper isn't ready, in case notify_klippy_ready was missed.</summary>
    public TimeSpan KlippyRetry { get; set; } = TimeSpan.FromSeconds(5);
}

/// <summary>
/// Holds the server's one connection to Moonraker. Subscribes to the objects
/// displays use, keeps <see cref="PrinterStateStore"/> current, and passes every
/// change, connection change and console line to the listener (the node relay).
/// </summary>
public sealed partial class MoonrakerService(
    IMoonrakerSettingsProvider settings,
    PrinterStateStore store,
    IPrinterStateListener listener,
    MoonrakerServiceOptions options,
    ILogger<MoonrakerService> log) : BackgroundService
{
    private readonly Lock _lock = new();
    private CancellationTokenSource _reconnect = new();
    private MoonrakerStatus _status = new(MoonrakerState.NotConfigured, null, []);
    private bool _statusReported;

    public MoonrakerStatus Status
    {
        get { lock (_lock) return _status; }
    }

    /// <summary>Drop the current connection and start again with fresh settings.</summary>
    public void Reconnect()
    {
        lock (_lock) _reconnect.Cancel();
    }

    /// <summary>Klipper objects displays can bind to.</summary>
    public static bool IsWanted(string obj) =>
        obj is "print_stats" or "virtual_sdcard" or "display_status" or "toolhead" or "heater_bed"
            or "idle_timeout" or "webhooks"
        || ExtruderName().IsMatch(obj);

    [GeneratedRegex(@"^extruder\d*$")]
    private static partial Regex ExtruderName();

    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        var failures = 0;
        while (!stopping.IsCancellationRequested)
        {
            CancellationTokenSource reconnect;
            lock (_lock)
            {
                if (_reconnect.IsCancellationRequested)
                {
                    _reconnect.Dispose();
                    _reconnect = new CancellationTokenSource();
                }
                reconnect = _reconnect;
            }
            using var session = CancellationTokenSource.CreateLinkedTokenSource(stopping, reconnect.Token);

            try
            {
                var current = await settings.GetAsync(session.Token);
                if (!current.IsConfigured)
                {
                    await SetStatusAsync(MoonrakerState.NotConfigured, null, []);
                    await Task.Delay(Timeout.Infinite, session.Token);
                }

                await RunSessionAsync(current, session.Token);
                failures = 0;
                await SetStatusAsync(MoonrakerState.Disconnected, "Connection closed", []);
            }
            catch (OperationCanceledException) when (stopping.IsCancellationRequested)
            {
                break;
            }
            catch (OperationCanceledException) when (reconnect.IsCancellationRequested)
            {
                log.LogInformation("Moonraker settings changed; reconnecting");
                continue;
            }
            catch (Exception e) when (e is WebSocketException or MoonrakerRpcException or TimeoutException
                                          or HttpRequestException or UriFormatException or OperationCanceledException)
            {
                failures++;
                log.LogWarning("Moonraker connection failed: {Message}", e.Message);
                await SetStatusAsync(MoonrakerState.Disconnected, e.Message, []);
            }

            var delay = options.RetryDelays[Math.Min(Math.Max(failures - 1, 0), options.RetryDelays.Length - 1)];
            try
            {
                await Task.Delay(delay, session.Token);
            }
            catch (OperationCanceledException) when (!stopping.IsCancellationRequested)
            {
                // Settings changed while waiting: try again straight away
            }
        }
    }

    private async Task RunSessionAsync(MoonrakerSettings current, CancellationToken ct)
    {
        var uri = current.WebSocketUri;
        await SetStatusAsync(MoonrakerState.Connecting, uri.ToString(), []);
        log.LogInformation("Connecting to Moonraker at {Uri}", uri);

        await using var rpc = await MoonrakerRpcClient.ConnectAsync(uri, current.ApiKey, ct);
        var ready = await TrySubscribeAsync(rpc, ct);

        while (true)
        {
            JsonObject message;
            try
            {
                // While Klipper is down, check back now and then in case its ready notice was missed
                message = ready
                    ? await rpc.Notifications.ReadAsync(ct)
                    : await rpc.Notifications.ReadAsync(ct).AsTask().WaitAsync(options.KlippyRetry, ct);
            }
            catch (TimeoutException)
            {
                ready = await TrySubscribeAsync(rpc, ct);
                continue;
            }
            catch (ChannelClosedException)
            {
                return;   // Moonraker went away
            }

            switch (message["method"]?.GetValue<string>())
            {
                case "notify_status_update" when ready && (message["params"]?[0]) is JsonObject update:
                    var changes = store.Apply(update);
                    if (changes.Count > 0)
                        await NotifyAsync(() => listener.OnStateChangedAsync(changes));
                    if (changes.ContainsKey("webhooks.state"))
                        await SetReadyStatusAsync(Status.Objects);
                    break;

                case "notify_klippy_ready":
                    ready = await TrySubscribeAsync(rpc, ct);
                    break;

                case "notify_klippy_disconnected":
                    ready = false;
                    await SetStatusAsync(MoonrakerState.KlippyNotReady, "notify_klippy_disconnected", []);
                    break;

                case "notify_klippy_shutdown":
                    // Klipper keeps answering while shut down, so the subscription carries on;
                    // webhooks.state usually arrives with it, but don't depend on that
                    await ApplyKlippyStateAsync("shutdown");
                    await SetReadyStatusAsync(Status.Objects);
                    break;

                case "notify_gcode_response" when (message["params"]?[0]) is JsonValue line:
                    await NotifyAsync(() => listener.OnGcodeResponseAsync(line.GetValue<string>()));
                    break;
            }
        }
    }

    /// <summary>List Klipper's objects and subscribe to the ones displays use. False while Klipper isn't ready.</summary>
    private async Task<bool> TrySubscribeAsync(MoonrakerRpcClient rpc, CancellationToken ct)
    {
        JsonNode? list;
        try
        {
            list = await rpc.CallAsync("printer.objects.list", null, ct);
        }
        catch (MoonrakerRpcException e)
        {
            await ReportNotReadyAsync(rpc, e, ct);
            return false;
        }

        var objects = (list?["objects"] as JsonArray ?? [])
            .Select(o => o?.GetValue<string>())
            .OfType<string>()
            .Where(IsWanted)
            .ToList();

        var subscription = new JsonObject();
        foreach (var obj in objects)
            subscription[obj] = null;

        JsonNode? reply;
        try
        {
            reply = await rpc.CallAsync("printer.objects.subscribe",
                new JsonObject { ["objects"] = subscription }, ct);
        }
        catch (MoonrakerRpcException e)
        {
            await ReportNotReadyAsync(rpc, e, ct);
            return false;
        }

        var changes = store.Replace(reply?["status"] as JsonObject ?? new JsonObject());
        log.LogInformation("Subscribed to {Count} Moonraker objects: {Objects}", objects.Count, string.Join(", ", objects));

        await SetReadyStatusAsync(objects);
        if (changes.Count > 0)
            await NotifyAsync(() => listener.OnStateChangedAsync(changes));
        return true;
    }

    /// <summary>Ready, or KlippyShutdown while webhooks.state says Klipper has shut down.</summary>
    private Task SetReadyStatusAsync(IReadOnlyList<string> objects)
    {
        var klippy = store.Snapshot(["webhooks.state"]).GetValueOrDefault("webhooks.state") is JsonValue v
                     && v.TryGetValue<string>(out var text) ? text : null;
        return klippy is "shutdown" or "error"
            ? SetStatusAsync(MoonrakerState.KlippyShutdown, $"Klipper {klippy}", objects)
            : SetStatusAsync(MoonrakerState.Ready, null, objects);
    }

    /// <summary>
    /// Objects can't be read. If Klipper is shut down (rather than starting), say
    /// so through webhooks.state, so nodes show the error state instead of offline.
    /// </summary>
    private async Task ReportNotReadyAsync(MoonrakerRpcClient rpc, MoonrakerRpcException e, CancellationToken ct)
    {
        string? klippy = null;
        try
        {
            klippy = (await rpc.CallAsync("server.info", null, ct))?["klippy_state"]?.GetValue<string>();
        }
        catch (MoonrakerRpcException)
        {
        }

        if (klippy is "shutdown" or "error")
        {
            await ApplyKlippyStateAsync(klippy);
            await SetStatusAsync(MoonrakerState.KlippyShutdown, $"Klipper {klippy}", []);
        }
        else
        {
            await SetStatusAsync(MoonrakerState.KlippyNotReady, e.Message, []);
        }
    }

    private async Task ApplyKlippyStateAsync(string state)
    {
        var changes = store.Apply(new JsonObject { ["webhooks"] = new JsonObject { ["state"] = state } });
        if (changes.Count > 0)
            await NotifyAsync(() => listener.OnStateChangedAsync(changes));
    }

    private async Task SetStatusAsync(MoonrakerState state, string? detail, IReadOnlyList<string> objects)
    {
        MoonrakerStatus previous;
        var next = new MoonrakerStatus(state, detail, objects);
        bool first;
        lock (_lock)
        {
            previous = _status;
            _status = next;
            first = !_statusReported;
            _statusReported = true;
        }
        if (first || previous.State != next.State || previous.Detail != next.Detail)
            await NotifyAsync(() => listener.OnStatusChangedAsync(next));
    }

    /// <summary>A failing listener must not take the connection (or the host) down with it.</summary>
    private async Task NotifyAsync(Func<Task> call)
    {
        try
        {
            await call();
        }
        catch (Exception e)
        {
            log.LogError(e, "Printer state listener failed");
        }
    }

    public override void Dispose()
    {
        _reconnect.Dispose();
        base.Dispose();
    }
}
