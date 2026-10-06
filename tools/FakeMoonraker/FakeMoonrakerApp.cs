using System.Text.Json;
using FakeMoonraker.Control;
using FakeMoonraker.Protocol;
using FakeMoonraker.Replay;
using FakeMoonraker.Simulation;

namespace FakeMoonraker;

/// <summary>
/// Builds the fake Moonraker. Program.cs runs it from the command line; tests
/// call Build() directly with --port 0 and their own TimeProvider.
/// </summary>
public static class FakeMoonrakerApp
{
    public const int DefaultPort = 7125;

    /// <param name="args">
    /// --profile single|quad|path.json, --extruders n, --scenario name, --port n, --host addr,
    /// --console true|false (typed commands; on when stdin is a terminal),
    /// or --replay capture.jsonl [--speed 1] [--loop true] instead of a profile and scenario
    /// </param>
    /// <param name="configure">Extra service setup, e.g. a fake TimeProvider in tests.</param>
    public static WebApplication Build(string[] args, Action<IServiceCollection>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(args);
        var config = builder.Configuration;

        var capture = config["replay"] is { } replayPath ? Capture.Load(replayPath) : null;
        var profile = capture is null
            ? PrinterProfile.Load(config["profile"] ?? "single")
            : new PrinterProfile { Name = $"replay of {Path.GetFileName(config["replay"])}", Extruders = capture.ExtruderCount };
        if (capture is null && config.GetValue<int?>("extruders") is { } extruders)
            profile = profile with { Name = $"{extruders} extruders", Extruders = Math.Clamp(extruders, 1, 16) };
        var scenario = capture is null
            ? Scenario.Find(config["scenario"] ?? "idle")
            : new ReplayScenario(capture, config.GetValue("speed", 1.0), config.GetValue("loop", true));
        var host = config["host"] ?? "0.0.0.0";
        var port = config.GetValue("port", DefaultPort);

        builder.WebHost.UseUrls($"http://{host}:{port}");

        builder.Services.ConfigureHttpJsonOptions(o =>
            o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton(profile);
        builder.Services.AddSingleton(scenario);
        builder.Services.AddSingleton(_ =>
        {
            var model = new PrinterModel(profile) { Baseline = capture?.Initial };
            model.Reset();
            return model;
        });
        builder.Services.AddSingleton<PrinterSimulation>();
        builder.Services.AddSingleton<MoonrakerHub>();
        builder.Services.AddHostedService<SimulationTicker>();
        builder.Services.AddHostedService<ScenarioRunner>();
        builder.Services.AddSingleton<ConsoleCommands>();
        if (config.GetValue("console", !Console.IsInputRedirected))
            builder.Services.AddHostedService(sp => sp.GetRequiredService<ConsoleCommands>());
        configure?.Invoke(builder.Services);

        var app = builder.Build();

        if (capture is not null)
            app.Services.GetRequiredService<PrinterSimulation>().Physics = false;

        app.UseWebSockets();

        // Moonraker's WebSocket endpoint. No auth, and the Origin header is ignored.
        app.Map("/websocket", async (HttpContext ctx, MoonrakerHub hub) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest)
                return Results.BadRequest("Expected a WebSocket request");

            using var socket = await ctx.WebSockets.AcceptWebSocketAsync();
            await hub.HandleAsync(socket, ctx.RequestAborted);
            return Results.Empty;
        });

        app.MapSimEndpoints();

        app.Logger.LogInformation("Fake Moonraker: profile '{Profile}' ({Extruders} extruder(s)), ws://{Host}:{Port}/websocket",
            profile.Name, profile.Extruders, host, port);

        return app;
    }
}
