using FakeMoonraker.Protocol;

namespace FakeMoonraker.Simulation;

/// <summary>
/// Every 250 ms (Klipper's subscription refresh time) advance the simulation
/// and send subscribers what changed.
/// </summary>
public sealed class SimulationTicker(PrinterSimulation sim, MoonrakerHub hub, TimeProvider time) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(250);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Interval, time);
        var last = time.GetTimestamp();

        while (await timer.WaitForNextTickAsync(ct))
        {
            var now = time.GetTimestamp();
            sim.Advance(time.GetElapsedTime(last, now));
            last = now;
            hub.BroadcastChanges();
        }
    }
}

/// <summary>Runs the scenario chosen with --scenario.</summary>
public sealed class ScenarioRunner(
    Scenario scenario, PrinterSimulation sim, MoonrakerHub hub, TimeProvider time, ILogger<ScenarioRunner> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("Scenario '{Name}': {Description}", scenario.Name, scenario.Description);
        try
        {
            await scenario.RunAsync(new ScenarioContext(sim, hub, time), ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
    }
}
