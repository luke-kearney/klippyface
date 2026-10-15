using System.Text.Json.Nodes;
using FakeMoonraker.Protocol;
using FakeMoonraker.Simulation;

namespace FakeMoonraker.Control;

/// <summary>/_sim/* — drive the fake printer by hand, from curl or from tests.</summary>
public static class SimEndpoints
{
    public record PrintRequest(string? Filename, double? DurationS);

    public record RespondRequest(string Msg, string? Type);

    public static void MapSimEndpoints(this WebApplication app)
    {
        var sim = app.MapGroup("/_sim");

        sim.MapGet("/", () => new
        {
            endpoints = new[]
            {
                "GET  /_sim/state",
                "POST /_sim/state                {\"extruder1\":{\"target\":240}}",
                "POST /_sim/print/start          {\"filename\":\"x.gcode\",\"duration_s\":120}",
                "POST /_sim/print/pause | resume | cancel | complete",
                "POST /_sim/toolchange/{n}",
                "POST /_sim/respond              {\"msg\":\"display:node=x group=y\",\"type\":\"echo|command|error\"}",
                "POST /_sim/klippy/restart?seconds=5",
                "POST /_sim/klippy/shutdown?message=...",
                "POST /_sim/busy?seconds=10            run non-print G-code (idle_timeout Printing)",
                "POST /_sim/idle                       fire the idle timeout now",
                "POST /_sim/disconnect",
            },
            scenarios = Scenario.All.Select(s => new { s.Name, s.Description }),
        });

        sim.MapGet("/state", (PrinterSimulation s, MoonrakerHub hub) => Results.Json(new JsonObject
        {
            ["profile"] = s.Model.Profile.Name,
            ["klippy_ready"] = hub.KlippyReady,
            ["clients"] = hub.ClientCount,
            ["printing"] = s.IsPrinting,
            ["objects"] = s.Model.Snapshot(),
        }));

        sim.MapPost("/state", (JsonObject changes, PrinterSimulation s) =>
        {
            var unknown = s.Model.Merge(changes);
            return unknown.Count == 0
                ? Results.NoContent()
                : Results.BadRequest(new { error = "Unknown objects", objects = unknown });
        });

        sim.MapPost("/print/start", (PrintRequest? body, PrinterSimulation s) =>
            Done(s.StartPrint(
                body?.Filename ?? "benchy.gcode",
                body?.DurationS is { } secs ? TimeSpan.FromSeconds(secs) : null),
                "Already printing"));
        sim.MapPost("/print/pause", (PrinterSimulation s) => Done(s.Pause(), "Not printing"));
        sim.MapPost("/print/resume", (PrinterSimulation s) => Done(s.Resume(), "Not paused"));
        sim.MapPost("/print/cancel", (PrinterSimulation s) => Done(s.Cancel(), "Not printing"));
        sim.MapPost("/print/complete", (PrinterSimulation s) => Done(s.Complete(), "Not printing"));

        sim.MapPost("/toolchange/{n:int}", (int n, PrinterSimulation s) =>
            s.SelectTool(n)
                ? Results.NoContent()
                : Results.NotFound(new { error = $"No tool T{n} (printer has {s.Model.Profile.Extruders})" }));

        // Formats the line the way Klipper's RESPOND command does
        sim.MapPost("/respond", (RespondRequest body, MoonrakerHub hub) =>
        {
            var prefix = (body.Type ?? "echo") switch
            {
                "echo" => "echo: ",
                "command" => "// ",
                "error" => "!! ",
                _ => null,
            };
            if (prefix is null)
                return Results.BadRequest(new { error = "type must be echo, command or error" });

            hub.SendGcodeResponse(prefix + body.Msg);
            return Results.NoContent();
        });

        sim.MapPost("/klippy/restart", (MoonrakerHub hub, double? seconds) =>
        {
            _ = hub.RestartKlippyAsync(TimeSpan.FromSeconds(seconds ?? 5));
            return Results.Accepted();
        });

        sim.MapPost("/klippy/shutdown", (MoonrakerHub hub, string? message) =>
        {
            hub.ShutdownKlippy(message ?? "Shutdown requested");
            return Results.NoContent();
        });

        sim.MapPost("/busy", (PrinterSimulation s, double? seconds) =>
        {
            s.Busy(TimeSpan.FromSeconds(seconds ?? 10));
            return Results.NoContent();
        });
        sim.MapPost("/idle", (PrinterSimulation s) => Done(s.ForceIdle(), "Printing"));

        sim.MapPost("/disconnect", (MoonrakerHub hub) => Results.Ok(new { dropped = hub.DisconnectAll() }));
    }

    private static IResult Done(bool ok, string conflict) =>
        ok ? Results.NoContent() : Results.Conflict(new { error = conflict });
}
