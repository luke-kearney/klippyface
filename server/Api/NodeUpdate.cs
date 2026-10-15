namespace Klippyface.Server.Api;

/// <summary>Body for PUT /api/nodes/{id}. A missing SleepAfterSeconds leaves it unchanged.</summary>
public record NodeUpdate(string FriendlyName, string Description, int? SleepAfterSeconds)
{
    public const int MaxSleepAfterSeconds = 86400;
}
