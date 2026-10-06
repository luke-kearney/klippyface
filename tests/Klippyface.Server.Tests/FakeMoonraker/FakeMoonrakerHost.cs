using System.Net.Http.Json;
using FakeMoonraker;
using FakeMoonraker.Protocol;
using FakeMoonraker.Simulation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace Klippyface.Server.Tests.FakeMoonraker;

/// <summary>
/// A fake Moonraker on a random local port, with time under the test's control
/// and no heater noise, so every update is predictable.
/// </summary>
public sealed class FakeMoonrakerHost : IAsyncDisposable
{
    private readonly WebApplication _app;

    private FakeMoonrakerHost(WebApplication app, FakeTimeProvider time, Uri baseUrl)
    {
        _app = app;
        Time = time;
        Http = new HttpClient { BaseAddress = baseUrl };
        WebSocketUrl = new UriBuilder(baseUrl) { Scheme = "ws", Path = "/websocket" }.Uri;
    }

    public FakeTimeProvider Time { get; }
    public HttpClient Http { get; }
    public Uri WebSocketUrl { get; }

    public PrinterSimulation Sim => _app.Services.GetRequiredService<PrinterSimulation>();
    public MoonrakerHub Hub => _app.Services.GetRequiredService<MoonrakerHub>();

    public static Task<FakeMoonrakerHost> StartAsync(string profile = "single", string scenario = "idle") =>
        StartWithArgsAsync(["--profile", profile, "--scenario", scenario]);

    /// <summary>Replay a capture once (no looping), driven by the fake clock.</summary>
    public static Task<FakeMoonrakerHost> StartReplayAsync(string capturePath) =>
        StartWithArgsAsync(["--replay", capturePath, "--loop", "false"]);

    private static async Task<FakeMoonrakerHost> StartWithArgsAsync(string[] args)
    {
        var time = new FakeTimeProvider();
        var app = FakeMoonrakerApp.Build(
            [.. args, "--host", "127.0.0.1", "--port", "0"],
            services => services.AddSingleton<TimeProvider>(time));

        app.Services.GetRequiredService<PrinterSimulation>().Noise = 0;
        await app.StartAsync();

        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        return new FakeMoonrakerHost(app, time, new Uri(address));
    }

    public async Task<MoonrakerTestClient> ConnectAsync() => await MoonrakerTestClient.ConnectAsync(WebSocketUrl);

    /// <summary>Move time on by one tick, so the simulation advances and changes are sent.</summary>
    public void Tick(int ticks = 1)
    {
        for (var i = 0; i < ticks; i++)
            Time.Advance(SimulationTicker.Interval);
    }

    public Task<HttpResponseMessage> PostAsync(string path, object? body = null) =>
        body is null ? Http.PostAsync(path, null) : Http.PostAsJsonAsync(path, body);

    public async ValueTask DisposeAsync()
    {
        Http.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
