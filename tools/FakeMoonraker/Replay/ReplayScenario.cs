using FakeMoonraker.Simulation;

namespace FakeMoonraker.Replay;

/// <summary>
/// Plays a capture back: the model starts from the subscribe reply, then each
/// update is applied at its recorded time (scaled by speed). The simulation's
/// own physics is off, so the recorded values are what clients see.
/// </summary>
public sealed class ReplayScenario(Capture capture, double speed, bool loop) : Scenario
{
    public override string Name => "replay";
    public override string Description =>
        $"{capture.Updates.Count} recorded updates at {speed}x{(loop ? ", looping" : "")}";

    public override async Task RunAsync(ScenarioContext ctx, CancellationToken ct)
    {
        if (capture.Updates.Count == 0) return;

        do
        {
            ctx.Sim.Model.Reset();   // back to the capture's starting state
            var previous = capture.StartTime;

            foreach (var update in capture.Updates)
            {
                var gap = Math.Max(0, update.EventTime - previous) / speed;
                previous = update.EventTime;
                if (gap > 0)
                    await ctx.Wait(TimeSpan.FromSeconds(gap), ct);

                ctx.Sim.Model.Merge(update.Changes);
            }
        } while (loop && !ct.IsCancellationRequested);
    }
}
