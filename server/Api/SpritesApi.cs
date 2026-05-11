using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Api;

public static class SpritesApi
{
    public static WebApplication MapSpritesApi(this WebApplication app)
    {
        var sprites = app.MapGroup("/api/sprites");

        sprites.MapGet("/", async (KlippyfaceDbContext db) =>
            await db.Sprites
                .OrderBy(s => s.Label)
                .Select(s => new { s.Id, s.Label, s.Width, s.Height, s.CreatedAt })
                .ToListAsync());

        sprites.MapPost("/", async (KlippyfaceDbContext db, Sprite sprite) =>
        {
            if (string.IsNullOrWhiteSpace(sprite.Id))
                return Results.BadRequest("Sprite ID is required");

            sprite.CreatedAt = DateTime.UtcNow;
            db.Sprites.Add(sprite);
            await db.SaveChangesAsync();
            return Results.Created($"/api/sprites/{sprite.Id}", sprite);
        });

        sprites.MapGet("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var sprite = await db.Sprites.FindAsync(id);
            return sprite is null ? Results.NotFound() : Results.Ok(sprite);
        });

        sprites.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Sprite input) =>
        {
            var sprite = await db.Sprites.FindAsync(id);
            if (sprite is null) return Results.NotFound();

            sprite.Label = input.Label;
            sprite.Width = input.Width;
            sprite.Height = input.Height;
            sprite.DataBase64 = input.DataBase64;
            await db.SaveChangesAsync();
            return Results.Ok(sprite);
        });

        sprites.MapDelete("/{id}", async (KlippyfaceDbContext db, string id) =>
        {
            var sprite = await db.Sprites.FindAsync(id);
            if (sprite is null) return Results.NotFound();

            db.Sprites.Remove(sprite);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return app;
    }
}
