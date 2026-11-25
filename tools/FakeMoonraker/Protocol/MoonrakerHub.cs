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
public sealed class MoonrakerHub
{
    private const int MethodNotFound = -32601;
    private const int ParseError = -32700;
    private const int InvalidArgument = 400;
    private const int KlippyNotReady = 503;

    private readonly PrinterSimulation _sim;
    private readonly FakeSpoolman _spoolman;
    private readonly TimeProvider _time;
    private readonly ILogger<MoonrakerHub> _log;
    private readonly ConcurrentDictionary<int, ClientSession> _sessions = new();
    private readonly long _started;
    // Keeps subscribe replies and status updates in order for each client
    private readonly Lock _gate = new();
    private int _nextId;
    private volatile bool _klippyReady = true;

    public MoonrakerHub(PrinterSimulation sim, FakeSpoolman spoolman, TimeProvider time, ILogger<MoonrakerHub> log)
    {
        _sim = sim;
        _spoolman = spoolman;
        _time = time;
        _log = log;
        _started = time.GetTimestamp();
        // What Moonraker sends when SET_ACTIVE_SPOOL (or a tool change macro) picks a spool
        spoolman.ActiveChanged += id =>
        {
            foreach (var session in _sessions.Values)
                session.Send(Notification("notify_active_spool_set", new JsonObject { ["spool_id"] = id }));
        };
    }

    private PrinterModel Model => _sim.Model;

    public bool KlippyReady => _klippyReady;

    public int ClientCount => _sessions.Count;

    /// <summary>Klipper's eventtime: a monotonic clock in seconds.</summary>
    public double EventTime => Math.Round(1000 + _time.GetElapsedTime(_started).TotalSeconds, 6);

    public async Task HandleAsync(WebSocket socket, CancellationToken ct)
    {
        var session = new ClientSession(Interlocked.Increment(ref _nextId), socket);
        _sessions[session.Id] = session;
        _log.LogInformation("Client {Id} connected", session.Id);

        try
        {
            await session.RunAsync(text => OnMessage(session, text), ct);
        }
        finally
        {
            _sessions.TryRemove(session.Id, out _);
            _log.LogInformation("Client {Id} disconnected", session.Id);
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
        _log.LogDebug("Client {Id} → {Method}", session.Id, method);

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
            "server.spoolman.get_spool_id" when _spoolman.Enabled =>
                Result(new JsonObject { ["spool_id"] = _spoolman.ActiveId }),
            "server.spoolman.post_spool_id" when _spoolman.Enabled => SetSpool(parameters),
            "server.spoolman.status" when _spoolman.Enabled => Result(new JsonObject
            {
                ["spoolman_connected"] = _spoolman.Reachable,
                ["pending_reports"] = new JsonArray(),
                ["spool_id"] = _spoolman.ActiveId,
            }),
            "server.spoolman.proxy" when _spoolman.Enabled => SpoolmanProxy(parameters),
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

    private Outcome SetSpool(JsonObject parameters)
    {
        int? id = parameters["spool_id"] is JsonValue v && v.TryGetValue<int>(out var n) ? n : null;
        return _spoolman.SetActive(id)
            ? Result(new JsonObject { ["spool_id"] = id })
            : Failure(InvalidArgument, $"Spool {id} not found");
    }

    /// <summary>
    /// Moonraker's pass-through to Spoolman. Only GET /v1/spool/{id} is faked. With
    /// use_v2_response the reply is { response, error }; Spoolman being down is an error, not a failure.
    /// </summary>
    private Outcome SpoolmanProxy(JsonObject parameters)
    {
        var v2 = parameters["use_v2_response"]?.GetValue<bool>() ?? false;
        var path = parameters["path"]?.GetValue<string>() ?? "";
        var method = parameters["request_method"]?.GetValue<string>() ?? "";

        JsonObject? spool = null;
        (int Status, string Message)? error = null;
        if (!_spoolman.Reachable)
            error = (503, "Spoolman server not available");
        else if (method != "GET" || !path.StartsWith("/v1/spool/") || !int.TryParse(path["/v1/spool/".Length..], out var id))
            error = (404, $"Not faked: {method} {path}");
        else if ((spool = _spoolman.Spool(id)) is null)
            error = (404, $"No spool with ID {id} found.");

        if (!v2)
            return error is { } e ? Failure(e.Status, e.Message) : Result(spool!);
        return Result(new JsonObject
        {
            ["response"] = spool,
            ["response_headers"] = new JsonObject(),
            ["error"] = error is { } err
                ? new JsonObject { ["status_code"] = err.Status, ["message"] = err.Message }
                : null,
        });
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
        ["klippy_state"] = KlippyState,
        ["components"] = _spoolman.Enabled
            ? new JsonArray("websockets", "klippy_apis", "spoolman")
            : new JsonArray("websockets", "klippy_apis"),
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
        ["state"] = KlippyState,
        ["state_message"] = _klippyReady ? Model.GetString("webhooks", "state_message") ?? "" : "Printer is not ready",
        ["hostname"] = "fake-moonraker",
        ["software_version"] = "v0.12.0-fake",
        ["cpu_info"] = "",
        ["klipper_path"] = "",
        ["python_path"] = "",
        ["log_file"] = "",
        ["config_file"] = "",
    };

    private string KlippyState => _klippyReady ? Model.GetString("webhooks", "state") ?? "ready" : "startup";

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
        _sim.Reset(profile);
        _log.LogInformation("Klippy restarting ({Seconds}s) as '{Profile}' ({Extruders} extruder(s))",
            downtime.TotalSeconds, Model.Profile.Name, Model.Profile.Extruders);

        await Task.Delay(downtime, _time, ct);

        _klippyReady = true;
        foreach (var session in _sessions.Values)
            session.Send(Notification("notify_klippy_ready"));
        _log.LogInformation("Klippy ready");
    }

    /// <summary>
    /// Klipper shuts down: clients get notify_klippy_shutdown and keep their
    /// subscriptions (Klipper still answers), which carry webhooks.state = shutdown.
    /// Only a restart brings it back.
    /// </summary>
    public void ShutdownKlippy(string message)
    {
        _sim.Shutdown(message);
        foreach (var session in _sessions.Values)
            session.Send(Notification("notify_klippy_shutdown"));
        _log.LogWarning("Klippy shut down: {Message}", message);
    }

    /// <summary>Drop every connection without a close handshake.</summary>
    public int DisconnectAll()
    {
        var sessions = _sessions.Values.ToList();
        foreach (var session in sessions)
            session.Abort();
        _log.LogInformation("Dropped {Count} client(s)", sessions.Count);
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
