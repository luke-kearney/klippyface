using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;

namespace Klippyface.Server.Services;

/// <summary>
/// Publishes groups whose edits have gone quiet, so changes still reach nodes when
/// the editor tab closes before its own auto-sync fires.
/// </summary>
public class PendingPublishSweeper : BackgroundService
{
    // Longer than the Web UI's 30 s auto-sync so an open editor normally wins.
    public static readonly TimeSpan QuietPeriod = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PendingPublishSweeper> _logger;

    public PendingPublishSweeper(IServiceScopeFactory scopes, ILogger<PendingPublishSweeper> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
                var publisher = scope.ServiceProvider.GetRequiredService<NodePublisher>();
                var cutoff = DateTime.UtcNow - QuietPeriod;
                var due = await db.Groups
                    .Where(g => g.PendingPublish && g.UpdatedAt < cutoff)
                    .Select(g => g.Id)
                    .ToListAsync(stoppingToken);
                foreach (var id in due)
                {
                    var nodes = await publisher.PublishGroupAsync(id);
                    _logger.LogInformation("Auto-published group {Group} to {Nodes} node(s)", id, nodes);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Pending publish sweep failed");
            }
        }
    }
}
