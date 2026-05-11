using Klippyface.Server.Services;

namespace Klippyface.Server.Api;

public static class ConfigApi
{
    public static WebApplication MapConfigApi(this WebApplication app)
    {
        var config = app.MapGroup("/api/config");

        config.MapGet("/node", async (ConfigExportService service, string mac) =>
        {
            if (string.IsNullOrWhiteSpace(mac))
                return Results.BadRequest("MAC address is required");

            var result = await service.ExportNodeConfigAsync(mac.Trim().ToUpperInvariant());
            return result is null ? Results.NotFound($"Node with MAC {mac} not found") : Results.Json(result);
        });

        config.MapGet("/library", async (ConfigExportService service) =>
        {
            var result = await service.ExportLibraryAsync();
            return Results.Json(result);
        });

        return app;
    }
}
