using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FakeMoonraker.Protocol;
using FakeMoonraker.Simulation;

namespace FakeMoonraker.Control;

/// <summary>
/// Commands typed into the fake's terminal: the same actions as /_sim/*, without curl.
/// Off when stdin isn't a terminal (or with --console false).
/// </summary>
public sealed class ConsoleCommands(PrinterSimulation sim, MoonrakerHub hub, ILogger<ConsoleCommands> log)
    : BackgroundService
{
    private static readonly TimeSpan RestartTime = TimeSpan.FromSeconds(2);

    public const string Help = """
        Commands:
          status                    printer, tools and clients at a glance
          extruders <n>             become an n-extruder printer (Klipper restarts)
          profile <name|file.json>  become a profile from profiles/ (Klipper restarts)
          print [seconds] [file]    start a print (default 120 s); heats up first
          pause | resume | cancel | complete
          tool <n>                  switch to tool n (T0 = extruder)
          temp <heater> <°C>        set a target: bed, extruder, extruder1, t2, ...
          set <object.field> <value>  set any field, e.g. set print_stats.message hello
          respond <text>            console line, e.g. respond display:group=win
          busy [seconds]            run non-print G-code, e.g. homing (default 10 s)
          idle                      fire the idle timeout now (heaters, motors off)
          shutdown [message]        Klipper shuts down, like a thermal runaway
          restart [seconds]         restart Klipper (also recovers from shutdown)
          disconnect                drop every client
          help
        """;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // Let the startup log finish first
        await Task.Delay(300, ct);
        Console.WriteLine("Type 'help' for commands.");

        while (!ct.IsCancellationRequested)
        {
            var line = await Console.In.ReadLineAsync(ct);
            if (line is null) return;   // stdin closed
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                Console.WriteLine(await ExecuteAsync(line, ct));
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogWarning(e, "Command failed: {Line}", line);
            }
        }
    }

    /// <summary>Run one command line and return what to print.</summary>
    public async Task<string> ExecuteAsync(string line, CancellationToken ct = default)
    {
        var parts = line.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var command = parts[0].ToLowerInvariant();
        var rest = parts.Length > 1 ? parts[1].Trim() : "";
        var args = rest.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        switch (command)
        {
            case "help" or "?":
                return Help;

            case "status" or "s":
                return Status();

            case "extruders":
                if (args.Length != 1 || !int.TryParse(args[0], out var count) || count is < 1 or > 16)
                    return "Usage: extruders <1-16>";
                return await BecomeAsync(sim.Model.Profile with { Name = $"{count} extruders", Extruders = count }, ct);

            case "profile":
                if (args.Length != 1) return "Usage: profile <name|file.json>";
                PrinterProfile profile;
                try
                {
                    profile = PrinterProfile.Load(args[0]);
                }
                catch (Exception e) when (e is FileNotFoundException or InvalidDataException or JsonException)
                {
                    return e.Message;
                }
                return await BecomeAsync(profile, ct);

            case "print":
            {
                var seconds = args.Length > 0 && double.TryParse(args[0], CultureInfo.InvariantCulture, out var s) ? s : 120;
                var file = args.Length > 1 ? args[1] : "benchy.gcode";
                return sim.StartPrint(file, TimeSpan.FromSeconds(seconds))
                    ? $"Printing {file} for {seconds:0} s (after heating)"
                    : "Already printing";
            }

            case "pause":
                return sim.Pause() ? "Paused" : "Not printing (or already paused)";
            case "resume":
                return sim.Resume() ? "Resumed" : "Not paused";
            case "cancel":
                return sim.Cancel() ? "Cancelled" : "Not printing";
            case "complete":
                return sim.Complete() ? "Completed" : "Not printing";

            case "tool" or "t":
                if (args.Length != 1 || !int.TryParse(args[0].TrimStart('t', 'T'), out var tool))
                    return "Usage: tool <n>";
                return sim.SelectTool(tool)
                    ? $"Active tool T{tool} ({PrinterProfile.ExtruderName(tool)})"
                    : $"No T{tool}: this printer has {sim.Model.Profile.Extruders} extruder(s)";

            case "temp":
            {
                if (args.Length != 2 || HeaterName(args[0]) is not { } heater
                    || !double.TryParse(args[1], CultureInfo.InvariantCulture, out var target))
                    return "Usage: temp <bed|extruder|extruderN|tN> <°C>";
                if (!sim.Model.Has(heater)) return $"No {heater} on this printer";
                sim.Model.Set(heater, "target", target);
                return $"{heater} target {target:0} °C";
            }

            case "set":
            {
                var space = rest.IndexOf(' ');
                var dot = rest.IndexOf('.');
                if (space < 0 || dot < 0 || dot > space) return "Usage: set <object.field> <value>";
                var obj = rest[..dot];
                var field = rest[(dot + 1)..space];
                var value = ParseValue(rest[(space + 1)..].Trim());
                var unknown = sim.Model.Merge(new JsonObject { [obj] = new JsonObject { [field] = value } });
                return unknown.Count > 0 ? $"No object {obj}" : $"{obj}.{field} = {value?.ToJsonString() ?? "null"}";
            }

            case "respond":
                if (rest.Length == 0) return "Usage: respond <text>";
                hub.SendGcodeResponse("echo: " + rest);
                return $"Sent \"echo: {rest}\" to {hub.ClientCount} client(s)";

            case "restart":
            {
                var seconds = args.Length > 0 && double.TryParse(args[0], CultureInfo.InvariantCulture, out var s) ? s : RestartTime.TotalSeconds;
                _ = hub.RestartKlippyAsync(TimeSpan.FromSeconds(seconds), ct: ct);
                return $"Klipper restarting for {seconds:0.#} s";
            }

            case "busy":
            {
                var seconds = args.Length > 0 && double.TryParse(args[0], CultureInfo.InvariantCulture, out var s) ? s : 10;
                sim.Busy(TimeSpan.FromSeconds(seconds));
                return $"Running G-code for {seconds:0} s";
            }

            case "idle":
                return sim.ForceIdle() ? "Idle timeout fired: heaters and motors off" : "Not while printing";

            case "shutdown":
                hub.ShutdownKlippy(rest.Length > 0 ? rest : "Shutdown requested");
                return "Klipper shut down — 'restart' to recover";

            case "disconnect":
                return $"Dropped {hub.DisconnectAll()} client(s)";

            default:
                return $"Unknown command '{command}'. Type 'help'.";
        }
    }

    private async Task<string> BecomeAsync(PrinterProfile profile, CancellationToken ct)
    {
        if (!sim.Physics) return "Not while replaying a capture";
        await hub.RestartKlippyAsync(RestartTime, profile, ct);
        return $"Klipper back as '{profile.Name}' with {profile.Extruders} extruder(s)";
    }

    private string Status()
    {
        var m = sim.Model;
        var text = new StringBuilder();
        var klippy = !hub.KlippyReady ? "restarting" : sim.IsShutdown ? "SHUT DOWN" : "ready";
        text.AppendLine($"{m.Profile.Name}: {m.Profile.Extruders} extruder(s), klippy {klippy}, {hub.ClientCount} client(s)");

        var state = m.GetString("print_stats", "state");
        var progress = m.GetDouble("virtual_sdcard", "progress") * 100;
        text.AppendLine(state == "printing" || state == "paused"
            ? $"print: {state} {m.GetString("print_stats", "filename")} {progress:0.0}%"
            : $"print: {state}");
        text.AppendLine($"idle_timeout: {m.GetString("idle_timeout", "state")}");

        var active = PrinterProfile.ExtruderName(sim.ActiveTool);
        foreach (var name in m.Profile.ExtruderNames.Append("heater_bed"))
        {
            var marker = name == active ? " ← active" : "";
            text.AppendLine($"  {name,-11} {m.GetDouble(name, "temperature"),6:0.0} / {m.GetDouble(name, "target"),3:0} °C{marker}");
        }
        return text.ToString().TrimEnd();
    }

    private static string? HeaterName(string name)
    {
        name = name.ToLowerInvariant();
        if (name is "bed" or "heater_bed") return "heater_bed";
        if (name is "extruder" or "e" or "t0") return "extruder";
        if (name.StartsWith('t') && int.TryParse(name[1..], out var t)) return PrinterProfile.ExtruderName(t);
        if (name.StartsWith("extruder")) return name;
        return null;
    }

    /// <summary>JSON if it parses (numbers, true, null, "text"), otherwise the text itself.</summary>
    private static JsonNode? ParseValue(string text)
    {
        try
        {
            return JsonNode.Parse(text);
        }
        catch (JsonException)
        {
            return JsonValue.Create(text);
        }
    }
}
