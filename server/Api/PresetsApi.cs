using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Api;

public static class PresetsApi
{
    public static WebApplication MapPresetsApi(this WebApplication app)
    {
        var presets = app.MapGroup("/api/presets");

        presets.MapGet("/", async (KlippyfaceDbContext db) =>
            await db.Presets.OrderBy(p => p.Label).ToListAsync());

        presets.MapPost("/", async (KlippyfaceDbContext db, Preset preset) =>
        {
            if (string.IsNullOrWhiteSpace(preset.Id))
                return Results.BadRequest("Preset ID is required");

            preset.CreatedAt = DateTime.UtcNow;
            db.Presets.Add(preset);
            await db.SaveChangesAsync();
            return Results.Created($"/api/presets/{preset.Id}", preset);
        });

        presets.MapGet("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var preset = await db.Presets.FindAsync(id);
            return preset is null ? Results.NotFound() : Results.Ok(preset);
        });

        presets.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Preset input) =>
        {
            var preset = await db.Presets.FindAsync(id);
            if (preset is null) return Results.NotFound();

            preset.Label = input.Label;
            preset.ConditionsJson = input.ConditionsJson;
            preset.OverridesJson = input.OverridesJson;
            await db.SaveChangesAsync();
            return Results.Ok(preset);
        });

        presets.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var preset = await db.Presets.FindAsync(id);
            if (preset is null) return Results.NotFound();

            db.Presets.Remove(preset);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return app;
    }
}
