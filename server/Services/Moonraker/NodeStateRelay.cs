using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;

namespace Klippyface.Server.Services.Moonraker;

/// <summary>
/// Passes printer state from <see cref="MoonrakerService"/> to nodes over their
/// WebSocket. Each node gets only the keys its faces bind to (plus the print
/// state that drives triggers): a full snapshot on hello, then changes.
/// </summary>
public sealed class NodeStateRelay(
    NodeStatusService nodes,
    PrinterStateStore store,
    IServiceScopeFactory scopes,
    ILogger<NodeStateRelay> log) : IPrinterStateListener
{
    /// <summary>Drives the node's state:* triggers, so every node gets it.</summary>
    public const string PrintStateKey = "print_stats.state";

    // Keys each node binds to, by MAC; reloaded on every hello (nodes re-announce after applying a config)
    private readonly ConcurrentDictionary<string, IReadOnlySet<string>> _keys = new();
    // One publish at a time, so a hello's full snapshot can't overtake (or be overtaken by) a change
    private readonly SemaphoreSlim _publish = new(1, 1);
    private volatile bool _connected;

    public async Task OnNodeHelloAsync(string mac)
    {
        var keys = await LoadBoundKeysAsync(mac);
        _keys[mac] = keys;

        await _publish.WaitAsync();
        try
        {
            await nodes.SendToNodeAsync(mac, StatusMessage(_connected));
            await nodes.SendToNodeAsync(mac, StateMessage(full: true, store.Snapshot(keys)));
        }
        finally
        {
            _publish.Release();
        }
    }

    public async Task OnStatusChangedAsync(MoonrakerStatus status)
    {
        if (_connected == status.Connected) return;
        _connected = status.Connected;

        await _publish.WaitAsync();
        try
        {
            await Task.WhenAll(ConnectedNodes().Select(mac => nodes.SendToNodeAsync(mac, StatusMessage(status.Connected))));
        }
        finally
        {
            _publish.Release();
        }
    }

    public async Task OnStateChangedAsync(IReadOnlyDictionary<string, JsonNode?> changes)
    {
        await _publish.WaitAsync();
        try
        {
            var sends = new List<Task>();
            foreach (var mac in ConnectedNodes())
            {
                if (!_keys.TryGetValue(mac, out var keys)) continue;
                var values = changes.Where(c => keys.Contains(c.Key)).ToDictionary(c => c.Key, c => c.Value);
                if (values.Count > 0)
                    sends.Add(nodes.SendToNodeAsync(mac, StateMessage(full: false, values)));
            }
            await Task.WhenAll(sends);
        }
        finally
        {
            _publish.Release();
        }
    }

    public async Task OnGcodeResponseAsync(string line)
    {
        if (DisplayCommand.TryParse(line) is not { } command) return;

        var targets = command.Node is null ? ConnectedNodes().ToList() : await FindNodesAsync(command.Node);
        log.LogInformation("Display command group={Group} set={Set} for {Targets}",
            command.Group, command.Set, targets.Count == 0 ? "no connected node" : string.Join(", ", targets));

        var message = new JsonObject { ["type"] = "display_cmd", ["group"] = command.Group };
        if (command.Set is not null) message["set"] = command.Set;
        if (command.Loop is not null) message["loop"] = command.Loop;

        await Task.WhenAll(targets.Select(mac => nodes.SendToNodeAsync(mac, (JsonObject)message.DeepClone())));
    }

    private IEnumerable<string> ConnectedNodes() => nodes.GetConnectedNodeIds();

    /// <summary>Connected nodes whose name, MAC or id matches <c>node=</c>.</summary>
    private async Task<List<string>> FindNodesAsync(string name)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
        var all = await db.Nodes.Select(n => new { n.Id, n.MacAddress, n.FriendlyName }).ToListAsync();
        var connected = ConnectedNodes().ToHashSet();
        return all
            .Where(n => connected.Contains(n.MacAddress)
                        && (string.Equals(n.FriendlyName, name, StringComparison.OrdinalIgnoreCase)
                            || string.Equals(n.MacAddress, name, StringComparison.OrdinalIgnoreCase)
                            || n.Id == name))
            .Select(n => n.MacAddress)
            .ToList();
    }

    /// <summary>Data keys bound by datavalue elements in any group the node's displays can show.</summary>
    private async Task<IReadOnlySet<string>> LoadBoundKeysAsync(string mac)
    {
        var keys = new HashSet<string> { PrintStateKey };
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            var assignments = await db.Assignments
                .Where(a => a.Node.MacAddress == mac)
                .Select(a => new { a.DefaultGroup, a.TriggersJson })
                .ToListAsync();

            var groupIds = new HashSet<string>();
            foreach (var a in assignments)
            {
                if (!string.IsNullOrEmpty(a.DefaultGroup)) groupIds.Add(a.DefaultGroup);
                if (JsonNode.Parse(string.IsNullOrEmpty(a.TriggersJson) ? "{}" : a.TriggersJson) is JsonObject triggers)
                {
                    foreach (var (_, group) in triggers)
                    {
                        if (group is JsonValue v && v.TryGetValue<string>(out var id) && id.Length > 0)
                            groupIds.Add(id);
                    }
                }
            }

            keys.UnionWith(await db.FrameElements
                .Where(e => e.Type == "datavalue" && groupIds.Contains(e.Frame.Set.GroupId))
                .Select(e => e.Value)
                .Distinct()
                .ToListAsync());
        }
        catch (Exception e)
        {
            log.LogWarning(e, "Couldn't work out data keys for {Node}; sending print state only", mac);
        }
        return keys;
    }

    private static JsonObject StatusMessage(bool connected) =>
        new() { ["type"] = "moonraker_status", ["connected"] = connected };

    private static JsonObject StateMessage(bool full, IReadOnlyDictionary<string, JsonNode?> values) => new()
    {
        ["type"] = "state",
        ["full"] = full,
        ["values"] = new JsonObject(values.Select(v => KeyValuePair.Create(v.Key, v.Value?.DeepClone()))),
    };
}
