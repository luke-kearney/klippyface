using System.Text.RegularExpressions;

namespace Klippyface.Server.Api;

/// <summary>Body for the sprite and group rename endpoints.</summary>
public partial record RenameRequest(string? Id)
{
    // Matches the Web UI's sanitizeId(): ids end up in GCODE macro params and JSON keys.
    public static bool IsValidId(string id) => IdPattern().IsMatch(id);

    [GeneratedRegex("^[a-z0-9_]+$")]
    private static partial Regex IdPattern();
}
