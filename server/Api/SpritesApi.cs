using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services;

namespace Klippyface.Server.Api;

public static class SpritesApi
{
    public static WebApplication MapSpritesApi(this WebApplication app)
    {
        var sprites = app.MapGroup("/api/sprites");

        sprites.MapGet("/", async (KlippyfaceDbContext db) =>
            await db.Sprites
                .OrderBy(s => s.Label)
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

        sprites.MapPut("/{id}", async (KlippyfaceDbContext db, string id, Sprite input, NodePublisher publisher) =>
        {
            var sprite = await db.Sprites.FindAsync(id);
            if (sprite is null) return Results.NotFound();

            sprite.Label = input.Label;
            sprite.Folder = input.Folder.Trim();
            sprite.Description = input.Description;
            sprite.Width = input.Width;
            sprite.Height = input.Height;
            sprite.DataBase64 = input.DataBase64;
            await db.SaveChangesAsync();
            await publisher.MarkGroupsUsingSpritePendingAsync(id);
            return Results.Ok(sprite);
        });

        // The id is the primary key and frame elements reference it by value, so a
        // rename re-creates the row and repoints those elements in one transaction.
        // Node configs embed sprites under their id, so nodes keep rendering the
        // same pixels until their next refresh; no bump needed.
        sprites.MapPost("/{id}/rename", async (KlippyfaceDbContext db, string id, RenameRequest input) =>
        {
            var newId = input.Id?.Trim() ?? string.Empty;
            if (!RenameRequest.IsValidId(newId))
                return Results.BadRequest("ID may only contain lowercase letters, digits and underscores");

            var sprite = await db.Sprites.FindAsync(id);
            if (sprite is null) return Results.NotFound();
            if (newId == id) return Results.Ok(new { sprite, ElementsUpdated = 0 });
            if (await db.Sprites.AnyAsync(s => s.Id == newId))
                return Results.Conflict($"A sprite with ID '{newId}' already exists");

            await using var tx = await db.Database.BeginTransactionAsync();
            var renamed = new Sprite
            {
                Id = newId,
                Label = sprite.Label,
                Folder = sprite.Folder,
                Description = sprite.Description,
                Width = sprite.Width,
                Height = sprite.Height,
                DataBase64 = sprite.DataBase64,
                CreatedAt = sprite.CreatedAt,
            };
            db.Sprites.Remove(sprite);
            db.Sprites.Add(renamed);
            await db.SaveChangesAsync();

            var updated = await db.FrameElements
                .Where(e => e.Type == "sprite" && e.Value == id)
                .ExecuteUpdateAsync(u => u.SetProperty(e => e.Value, newId));
            await tx.CommitAsync();

            return Results.Ok(new { sprite = renamed, ElementsUpdated = updated });
        });

        sprites.MapDelete("/{id}", async (KlippyfaceDbContext db, string id, NodePublisher publisher) =>
        {
            var sprite = await db.Sprites.FindAsync(id);
            if (sprite is null) return Results.NotFound();

            // Frames that drew it now draw nothing there.
            await publisher.MarkGroupsUsingSpritePendingAsync(id);

            db.Sprites.Remove(sprite);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return app;
    }
}
