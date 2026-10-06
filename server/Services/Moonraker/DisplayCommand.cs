namespace Klippyface.Server.Services.Moonraker;

/// <summary>
/// A <c>RESPOND MSG="display:node=desk group=celebration set=party loop=3"</c> line
/// from a Klipper macro. See docs/reference/gcode-macros.md.
/// </summary>
public sealed record DisplayCommand(string? Node, string Group, string? Set, int? Loop)
{
    /// <summary>Find "display:" anywhere in a console line (RESPOND prefixes "echo: " or "// ").</summary>
    public static DisplayCommand? TryParse(string line)
    {
        var start = line.IndexOf("display:", StringComparison.Ordinal);
        if (start < 0) return null;

        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in line[(start + "display:".Length)..].Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = pair.IndexOf('=');
            if (eq > 0)
                values[pair[..eq]] = pair[(eq + 1)..];
        }

        if (!values.TryGetValue("group", out var group) || group.Length == 0) return null;

        return new DisplayCommand(
            values.GetValueOrDefault("node"),
            group,
            values.GetValueOrDefault("set"),
            values.TryGetValue("loop", out var loop) && int.TryParse(loop, out var n) ? n : null);
    }
}
