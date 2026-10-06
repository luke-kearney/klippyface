using System.Text.Json;

namespace FakeMoonraker.Simulation;

/// <summary>Which printer the fake pretends to be. Loaded from profiles/*.json.</summary>
public sealed record PrinterProfile
{
    public string Name { get; init; } = "single";
    public int Extruders { get; init; } = 1;

    /// <summary>Klipper object names: "extruder", then "extruder1".."extruderN-1".</summary>
    public IEnumerable<string> ExtruderNames =>
        Enumerable.Range(0, Extruders).Select(ExtruderName);

    public static string ExtruderName(int index) => index == 0 ? "extruder" : $"extruder{index}";

    /// <summary>Load by name from the profiles folder, or from a path to a .json file.</summary>
    public static PrinterProfile Load(string nameOrPath)
    {
        var path = File.Exists(nameOrPath)
            ? nameOrPath
            : Path.Combine(AppContext.BaseDirectory, "profiles", $"{nameOrPath}.json");

        if (!File.Exists(path))
            throw new FileNotFoundException($"No profile '{nameOrPath}' (looked for {path})");

        var profile = JsonSerializer.Deserialize<PrinterProfile>(File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException($"Empty profile {path}");

        if (profile.Extruders < 1)
            throw new InvalidDataException($"Profile {path} needs at least one extruder");

        return profile;
    }
}
