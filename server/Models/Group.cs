using System.Text.Json.Serialization;

namespace Klippyface.Server.Models;

public class Group
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    /// <summary>Display profile the faces are drawn for (Web UI previews), e.g. "round240"; '' = default OLED.</summary>
    public string Profile { get; set; } = string.Empty;
    public int SortOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Edited since nodes were last told to refresh; see NodePublisher.</summary>
    public bool PendingPublish { get; set; }

    public ICollection<Set> Sets { get; set; } = new List<Set>();
}
