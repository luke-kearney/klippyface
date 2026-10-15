using System.Text.Json;
using System.Text.Json.Nodes;

namespace FakeMoonraker.Replay;

/// <summary>
/// A recorded Moonraker session (scripts/capture-moonraker.sh): one JSON message
/// per line. Only the subscribe reply and notify_status_update lines are used.
/// </summary>
public sealed class Capture
{
    private Capture(JsonObject initial, double startTime, IReadOnlyList<CapturedUpdate> updates)
    {
        Initial = initial;
        StartTime = startTime;
        Updates = updates;
    }

    /// <summary>The subscribe reply's status, minus objects the printer didn't have.</summary>
    public JsonObject Initial { get; }

    /// <summary>Klipper eventtime of the subscribe reply.</summary>
    public double StartTime { get; }

    public IReadOnlyList<CapturedUpdate> Updates { get; }

    /// <summary>extruder, extruder1, ... present in the capture.</summary>
    public int ExtruderCount =>
        Initial.Count(o => o.Key == "extruder" || (o.Key.StartsWith("extruder") && int.TryParse(o.Key[8..], out _)));

    public static Capture Load(string path)
    {
        JsonObject? initial = null;
        var startTime = 0.0;
        var updates = new List<CapturedUpdate>();

        foreach (var (line, number) in File.ReadLines(path).Select((l, i) => (l, i + 1)))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            JsonObject message;
            try
            {
                message = JsonNode.Parse(line)?.AsObject() ?? throw new JsonException("not an object");
            }
            catch (Exception e) when (e is JsonException or InvalidOperationException)
            {
                throw new InvalidDataException($"{path}:{number}: not a JSON object ({e.Message})");
            }

            if (initial is null && message["result"]?["status"] is JsonObject status)
            {
                // Unknown objects come back as {}; leave them out like a real printer would
                initial = new JsonObject(status
                    .Where(o => o.Value is JsonObject { Count: > 0 })
                    .Select(o => KeyValuePair.Create(o.Key, (JsonNode?)o.Value!.DeepClone())));
                startTime = message["result"]!["eventtime"]?.GetValue<double>() ?? 0;
            }
            else if (initial is not null
                     && message["method"]?.GetValue<string>() == "notify_status_update"
                     && message["params"] is JsonArray { Count: >= 2 } p
                     && p[0] is JsonObject changes)
            {
                updates.Add(new CapturedUpdate(p[1]!.GetValue<double>(), (JsonObject)changes.DeepClone()));
            }
        }

        if (initial is null)
            throw new InvalidDataException($"{path}: no printer.objects.subscribe reply (result.status) found");

        return new Capture(initial, startTime, updates);
    }
}

public sealed record CapturedUpdate(double EventTime, JsonObject Changes);
