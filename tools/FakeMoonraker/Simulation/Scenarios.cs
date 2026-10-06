using FakeMoonraker.Protocol;

namespace FakeMoonraker.Simulation;

/// <summary>
/// A scripted run of the printer, picked with --scenario. Scenarios only use the
/// same actions as the /_sim endpoints, so anything they do can also be done by hand.
/// </summary>
public abstract class Scenario
{
    public abstract string Name { get; }
    public abstract string Description { get; }

    public abstract Task RunAsync(ScenarioContext ctx, CancellationToken ct);

    public static IReadOnlyList<Scenario> All { get; } =
        [new IdleScenario(), new PrintLoopScenario(), new ToolchangeCycleScenario(), new FlakyScenario()];

    public static Scenario Find(string name) =>
        All.FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
        ?? throw new ArgumentException(
            $"No scenario '{name}'. Choose from: {string.Join(", ", All.Select(s => s.Name))}");
}

public sealed record ScenarioContext(PrinterSimulation Sim, MoonrakerHub Hub, TimeProvider Time)
{
    public Task Wait(TimeSpan delay, CancellationToken ct) => Task.Delay(delay, Time, ct);

    public async Task WaitForPrintToEnd(CancellationToken ct)
    {
        while (Sim.IsPrinting)
            await Wait(TimeSpan.FromSeconds(1), ct);
    }
}

/// <summary>Nothing happens unless you use the /_sim endpoints.</summary>
public sealed class IdleScenario : Scenario
{
    public override string Name => "idle";
    public override string Description => "Printer sits idle; type commands or use /_sim/*";

    public override Task RunAsync(ScenarioContext ctx, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>Idle → heat → print → complete, forever.</summary>
public sealed class PrintLoopScenario : Scenario
{
    public override string Name => "print-loop";
    public override string Description => "Idle 10 s, then a 90 s print (after heating), repeat";

    public override async Task RunAsync(ScenarioContext ctx, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await ctx.Wait(TimeSpan.FromSeconds(10), ct);
            ctx.Sim.StartPrint(duration: TimeSpan.FromSeconds(90));
            await ctx.WaitForPrintToEnd(ct);
        }
    }
}

/// <summary>Prints that switch tool every 15 s, cycling through every extruder.</summary>
public sealed class ToolchangeCycleScenario : Scenario
{
    public override string Name => "toolchange-cycle";
    public override string Description => "3 min prints that change tool every 15 s";

    public override async Task RunAsync(ScenarioContext ctx, CancellationToken ct)
    {
        var tool = 0;
        while (!ct.IsCancellationRequested)
        {
            await ctx.Wait(TimeSpan.FromSeconds(10), ct);
            ctx.Sim.StartPrint("multicolour.gcode", TimeSpan.FromMinutes(3));

            while (ctx.Sim.IsPrinting)
            {
                await ctx.Wait(TimeSpan.FromSeconds(15), ct);
                tool = (tool + 1) % ctx.Sim.Model.Profile.Extruders;
                ctx.Sim.SelectTool(tool);
            }
        }
    }
}

/// <summary>The print loop, with dropped connections and Klipper restarts at random.</summary>
public sealed class FlakyScenario : Scenario
{
    public override string Name => "flaky";
    public override string Description => "print-loop plus random disconnects and Klipper restarts";

    public override async Task RunAsync(ScenarioContext ctx, CancellationToken ct)
    {
        var printing = new PrintLoopScenario().RunAsync(ctx, ct);

        while (!ct.IsCancellationRequested)
        {
            await ctx.Wait(TimeSpan.FromSeconds(Random.Shared.Next(30, 90)), ct);
            if (Random.Shared.NextDouble() < 0.8)
                ctx.Hub.DisconnectAll();
            else
                await ctx.Hub.RestartKlippyAsync(TimeSpan.FromSeconds(5), ct: ct);
        }

        await printing;
    }
}
