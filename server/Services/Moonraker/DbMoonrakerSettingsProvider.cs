using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Models;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>Reads the saved Moonraker settings; a fresh database has none (not configured).</summary>
public sealed class DbMoonrakerSettingsProvider(IServiceScopeFactory scopes) : IMoonrakerSettingsProvider
{
    public async Task<MoonrakerSettings> GetAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
        return await db.MoonrakerSettings.AsNoTracking().FirstOrDefaultAsync(ct) ?? new MoonrakerSettings();
    }
}
