using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Api;

public static class MoonrakerApi
{
    /// <param name="ApiKey">null keeps the saved key, "" clears it.</param>
    public record MoonrakerSettingsInput(string Host, int Port, bool UseTls, string? ApiKey);

    public static WebApplication MapMoonrakerApi(this WebApplication app)
    {
        var moonraker = app.MapGroup("/api/moonraker");

        moonraker.MapGet("/", async (KlippyfaceDbContext db, MoonrakerService service) =>
        {
            var settings = await db.MoonrakerSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == MoonrakerSettings.SingletonId) ?? new MoonrakerSettings();
            return Results.Ok(Describe(settings, service.Status));
        });

        moonraker.MapPut("/", async (KlippyfaceDbContext db, MoonrakerService service, MoonrakerSettingsInput input) =>
        {
            var host = input.Host.Trim();
            if (host.Contains("://") || host.Contains('/'))
                return Results.BadRequest("Host is a name or IP address, without ws:// or a path");
            if (input.Port is < 1 or > 65535)
                return Results.BadRequest("Port must be 1–65535");

            var settings = await db.MoonrakerSettings.FirstOrDefaultAsync(s => s.Id == MoonrakerSettings.SingletonId);
            if (settings is null)
            {
                settings = new MoonrakerSettings();
                db.MoonrakerSettings.Add(settings);
            }
            settings.Host = host;
            settings.Port = input.Port;
            settings.UseTls = input.UseTls;
            if (input.ApiKey is not null) settings.ApiKey = input.ApiKey.Trim();
            settings.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            service.Reconnect();
            return Results.Ok(Describe(settings, service.Status));
        });

        // Every value the server currently has, flattened to data keys
        moonraker.MapGet("/state", (PrinterStateStore store) =>
            Results.Ok(new System.Text.Json.Nodes.JsonObject(store.All()
                .OrderBy(kv => kv.Key, StringComparer.Ordinal)
                .Select(kv => KeyValuePair.Create(kv.Key, kv.Value)))));

        return app;
    }

    private static object Describe(MoonrakerSettings settings, MoonrakerStatus status) => new
    {
        settings.Host,
        settings.Port,
        settings.UseTls,
        HasApiKey = settings.ApiKey.Length > 0,
        Status = new
        {
            State = status.State.ToString(),
            status.Detail,
            status.Connected,
            status.Objects,
        },
    };
}
