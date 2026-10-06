using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using System.Text.Json.Nodes;
using FakeMoonraker.Simulation;

namespace FakeMoonraker.Protocol;

/// <summary>
/// Speaks Moonraker's JSON-RPC to every connected client: answers requests,
/// sends each subscriber only the fields that changed, and pushes notifications.
/// </summary>
public sealed class MoonrakerHub(PrinterSimulation sim, TimeProvider time, ILogger<MoonrakerHub> log)
{
    private const int MethodNotFound = -32601;
    private const int ParseError = -32700;
    private const int InvalidArgument = 400;
    private const int KlippyNotReady = 503;

    private readonly ConcurrentDictionary<int, ClientSession> _sessions = new();
    private readonly long _started = time.GetTimestamp();
    // Keeps subscribe replies and status updates in order for each client
    private readonly Lock _gate = new();
    private int _nextId;
    private volatile bool _klippyReady = true;

    private PrinterModel Model => sim.Model;

    public bool KlippyReady => _klippyReady;

    public int ClientCount => _sessions.Count;

    /// <summary>Klipper's eventtime: a monotonic clock in seconds.</summary>
    public double EventTime => Math.Round(1000 + time.GetElapsedTime(_started).TotalSeconds, 6);

    public async Task HandleAsync(WebSocket socket, CancellationToken ct)
    {
        var session = new ClientSession(Interlocked.Increment(ref _nextId), socket);
        _sessions[session.Id] = session;
        log.LogInformation("Client {Id} connected", session.Id);

        try
        {
            await session.RunAsync(text => OnMessage(session, text), ct);
        }
        finally
        {
            _sessions.TryRemove(session.Id, out _);
            log.LogInformation("Client {Id} disconnected", session.Id);
        }
    }

    private void OnMessage(ClientSession session, string text)
    {
        JsonObject? request;
        try
        {
            request = JsonNode.Parse(text) as JsonObject;
        }
        catch (JsonException)
        {
            request = null;
        }

        if (request is null)
        {
            session.Send(Error(null, ParseError, "Parse error"));
            return;
        }

        var id = request["id"]?.DeepClone();
        var method = request["method"]?.GetValue<string>() ?? "";
        var parameters = request["params"] as JsonObject ?? new JsonObject();
        log.LogDebug("Client {Id} → {Method}", session.Id, method);

        // Subscribe is answered inside the lock so no update can overtake the reply
        if (method == "printer.objects.subscribe")
        {
            lock (_gate)
                Reply(session, id, Subscribe(session, parameters));
            return;
        }

        Reply(session, id, method switch
        {
            "server.info" => Result(ServerInfo()),
            "server.connection.identify" => Result(new JsonObject { ["connection_id"] = session.Id }),
            "printer.info" => Result(PrinterInfo()),
            "printer.objects.list" => RequireKlippy() ?? Result(new JsonObject
            {
                ["objects"] = new JsonArray(Model.ObjectNames.Select(n => (JsonNode)n).ToArray()),
            }),
            "printer.objects.query" => Query(parameters),
            _ => Failure(MethodNotFound, "Method not found"),
        });
    }

    // ---------------------------------------------------------------
    // Methods
    // ---------------------------------------------------------------

    private Outcome Subscribe(ClientSession session, JsonObject parameters)
    {
        if (RequireKlippy() is { } notReady) return notReady;
        if (ParseObjects(parameters) is not { } requested)
            return Failure(InvalidArgument, "Invalid argument");

        var snapshot = Model.Snapshot();
        var resolved = Resolve(requested, snapshot);
        var status = Status(requested, resolved, snapshot);

        // A new subscribe replaces the client's previous one
        session.Subscription = resolved;
        session.LastSent = resolved.ToDictionary(
            o => o.Key,
            o => o.Value.ToDictionary(f => f, f => snapshot[o.Key]?[f]?.DeepClone()));

        return Result(new JsonObject { ["eventtime"] = EventTime, ["status"] = status });
    }

    private Outcome Query(JsonObject parameters)
    {
        if (RequireKlippy() is { } notReady) return notReady;
        if (ParseObjects(parameters) is not { } requested)
            return Failure(InvalidArgument, "Invalid argument");

        var snapshot = Model.Snapshot();
        var status = Status(requested, Resolve(requested, snapshot), snapshot);
        return Result(new JsonObject { ["eventtime"] = EventTime, ["status"] = status });
    }

    /// <summary>params.objects as object → requested fields (null = all).</summary>
    private static Dictionary<string, List<string>?>? ParseObjects(JsonObject parameters)
    {
        if (parameters["objects"] is not JsonObject objects) return null;

        var requested = new Dictionary<string, List<string>?>();
        foreach (var (name, fields) in objects)
        {
            switch (fields)
            {
                case null:
                    requested[name] = null;
                    break;
                case JsonArray list when list.All(f => f?.GetValueKind() == JsonValueKind.String):
                    requested[name] = list.Select(f => f!.GetValue<string>()).ToList();
                    break;
                default:
                    return null;
            }
        }
        return requested;
    }

    /// <summary>
    /// Fix the field list for each object, as Klipper does: "all fields" becomes the
    /// object's current fields, and an object the printer doesn't have has none.
    /// </summary>
    private static Dictionary<string, List<string>> Resolve(
        Dictionary<string, List<string>?> requested, JsonObject snapshot) =>
        requested.ToDictionary(
            r => r.Key,
            r => r.Value ?? (snapshot[r.Key] as JsonObject)?.Select(f => f.Key).ToList() ?? []);

    /// <summary>
    /// Full status for a query or subscribe reply. Matches Klipper's QueryStatusHelper:
    /// unknown objects come back as {} or with each named field null — never an error.
    /// </summary>
    private static JsonObject Status(
        Dictionary<string, List<string>?> requested, Dictionary<string, List<string>> resolved, JsonObject snapshot)
    {
        var status = new JsonObject();
        foreach (var name in requested.Keys)
            status[name] = new JsonObject(resolved[name].Select(f =>
                KeyValuePair.Create(f, snapshot[name]?[f]?.DeepClone())));
        return status;
    }

    private JsonObject ServerInfo() => new()
    {
        ["klippy_connected"] = true,
        ["klippy_state"] = _klippyReady ? "ready" : "startup",
        ["components"] = new JsonArray("websockets", "klippy_apis"),
        ["failed_components"] = new JsonArray(),
        ["registered_directories"] = new JsonArray("gcodes", "config"),
        ["warnings"] = new JsonArray(),
        ["websocket_count"] = _sessions.Count,
        ["moonraker_version"] = "v0.9.3-fake",
        ["api_version"] = new JsonArray(1, 5, 0),
        ["api_version_string"] = "1.5.0",
    };

    private JsonObject PrinterInfo() => new()
    {
        ["state"] = _klippyReady ? "ready" : "startup",
        ["state_message"] = _klippyReady ? "Printer is ready" : "Printer is not ready",
        ["hostname"] = "fake-moonraker",
        ["software_version"] = "v0.12.0-fake",
        ["cpu_info"] = "",
        ["klipper_path"] = "",
        ["python_path"] = "",
        ["log_file"] = "",
        ["config_file"] = "",
    };

    private Outcome? RequireKlippy() =>
        _klippyReady ? null : Failure(KlippyNotReady, "Klippy Host not connected");

    // ---------------------------------------------------------------
    // Pushes
    // ---------------------------------------------------------------

    /// <summary>Send each subscriber the fields that changed since it was last sent them.</summary>
    public void BroadcastChanges()
    {
        if (!_klippyReady) return;

        var snapshot = Model.Snapshot();
        var eventTime = EventTime;

        lock (_gate)
        {
            foreach (var session in _sessions.Values)
            {
                var changes = new JsonObject();
                foreach (var (name, fields) in session.Subscription)
                {
                    var last = session.LastSent[name];
                    var changed = new JsonObject();
                    foreach (var field in fields)
                    {
                        var value = snapshot[name]?[field];
                        if (JsonNode.DeepEquals(value, last.GetValueOrDefault(field))) continue;
                        changed[field] = value?.DeepClone();
                        last[field] = value?.DeepClone();
                    }
                    if (changed.Count > 0)
                        changes[name] = changed;
                }

                if (changes.Count > 0)
                    session.Send(Notification("notify_status_update", changes, eventTime));
            }
        }
    }

    /// <summary>What Klipper's RESPOND sends, e.g. "echo: display:node=x group=y".</summary>
    public void SendGcodeResponse(string line)
    {
        foreach (var session in _sessions.Values)
            session.Send(Notification("notify_gcode_response", line));
    }

    /// <summary>
    /// Klipper restart: clients get notify_klippy_disconnected, lose their
    /// subscriptions, and get notify_klippy_ready once it is back. With a
    /// profile, it comes back as that printer (like editing printer.cfg).
    /// </summary>
    public async Task RestartKlippyAsync(TimeSpan downtime, PrinterProfile? profile = null, CancellationToken ct = default)
    {
        lock (_gate)
        {
            _klippyReady = false;
            foreach (var session in _sessions.Values)
            {
                session.Subscription = new();
                session.LastSent = new();
                session.Send(Notification("notify_klippy_disconnected"));
            }
        }
        sim.Reset(profile);
        log.LogInformation("Klippy restarting ({Seconds}s) as '{Profile}' ({Extruders} extruder(s))",
            downtime.TotalSeconds, Model.Profile.Name, Model.Profile.Extruders);

        await Task.Delay(downtime, time, ct);

        _klippyReady = true;
        foreach (var session in _sessions.Values)
            session.Send(Notification("notify_klippy_ready"));
        log.LogInformation("Klippy ready");
    }

    /// <summary>Drop every connection without a close handshake.</summary>
    public int DisconnectAll()
    {
        var sessions = _sessions.Values.ToList();
        foreach (var session in sessions)
            session.Abort();
        log.LogInformation("Dropped {Count} client(s)", sessions.Count);
        return sessions.Count;
    }

    // ---------------------------------------------------------------
    // JSON-RPC framing
    // ---------------------------------------------------------------

    private readonly record struct Outcome(JsonNode? Result, int Code = 0, string? Message = null);

    private static Outcome Result(JsonNode result) => new(result);

    private static Outcome Failure(int code, string message) => new(null, code, message);

    private static void Reply(ClientSession session, JsonNode? id, Outcome outcome)
    {
        if (id is null) return;   // a JSON-RPC notification gets no reply
        session.Send(outcome.Message is null
            ? new JsonObject { ["jsonrpc"] = "2.0", ["result"] = outcome.Result, ["id"] = id }
            : Error(id, outcome.Code, outcome.Message));
    }

    private static JsonObject Error(JsonNode? id, int code, string message) => new()
    {
        ["jsonrpc"] = "2.0",
        ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
        ["id"] = id,
    };

    private static JsonObject Notification(string method, params JsonNode?[] parameters)
    {
        var message = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = method };
        if (parameters.Length > 0)
            message["params"] = new JsonArray(parameters);
        return message;
    }
}
