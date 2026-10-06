using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services;
using Klippyface.Server.Services.Moonraker;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Klippyface.Server.Tests.Moonraker;

/// <summary>What nodes are sent: only the keys their faces bind to, and display commands by name.</summary>
public class NodeStateRelayTests : IAsyncLifetime
{
    private const string Desk = "AA:AA:AA:AA:AA:01";
    private const string Shelf = "AA:AA:AA:AA:AA:02";

    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly PrinterStateStore _store = new();
    private readonly NodeStatusService _nodes = new(NullLogger<NodeStatusService>.Instance);
    private readonly Dictionary<string, RecordingSocket> _sockets = new();
    private ServiceProvider _services = null!;
    private NodeStateRelay _relay = null!;

    public async ValueTask InitializeAsync()
    {
        await _connection.OpenAsync();
        _services = new ServiceCollection()
            .AddDbContext<KlippyfaceDbContext>(o => o.UseSqlite(_connection))
            .BuildServiceProvider();

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            await db.Database.EnsureCreatedAsync();
            AddGroup(db, "idle", "heater_bed.temperature");
            AddGroup(db, "printing", "extruder.temperature", "print_stats.progress");
            AddGroup(db, "unused", "extruder1.target");
            AddNode(db, Desk, "Desk", defaultGroup: "idle", triggers: """{"state:printing":"printing"}""");
            AddNode(db, Shelf, "Shelf", defaultGroup: "idle", triggers: "{}");
            await db.SaveChangesAsync();
        }

        _relay = new NodeStateRelay(_nodes, _store, _services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<NodeStateRelay>.Instance);

        _store.Replace(JsonNode.Parse("""
            {"print_stats": {"state": "printing"}, "display_status": {"progress": 0.5},
             "extruder": {"temperature": 210.0}, "extruder1": {"target": 0.0},
             "heater_bed": {"temperature": 60.0}}
            """)!.AsObject());

        foreach (var mac in new[] { Desk, Shelf })
        {
            _sockets[mac] = new RecordingSocket();
            _nodes.Register(mac, _sockets[mac], 1);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _nodes.Dispose();
        await _services.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Hello_sends_status_and_a_snapshot_of_bound_keys()
    {
        await _relay.OnNodeHelloAsync(Desk);

        var sent = _sockets[Desk].Messages;
        Assert.Equal("moonraker_status", sent[0]["type"]!.GetValue<string>());
        Assert.False(sent[0]["connected"]!.GetValue<bool>());

        Assert.Equal("state", sent[1]["type"]!.GetValue<string>());
        Assert.True(sent[1]["full"]!.GetValue<bool>());
        Assert.Equal(
            ["extruder.temperature", "heater_bed.temperature", "klippyface.state", "print_stats.progress"],
            sent[1]["values"]!.AsObject().Select(v => v.Key).Order());
    }

    [Fact]
    public async Task Changes_go_only_to_nodes_that_bind_them()
    {
        await _relay.OnNodeHelloAsync(Desk);
        await _relay.OnNodeHelloAsync(Shelf);
        _sockets[Desk].Messages.Clear();
        _sockets[Shelf].Messages.Clear();

        await _relay.OnStateChangedAsync(_store.Apply(JsonNode.Parse("""{"extruder1": {"target": 200.0}}""")!.AsObject()));
        await _relay.OnStateChangedAsync(_store.Apply(JsonNode.Parse("""{"extruder": {"temperature": 211.0}}""")!.AsObject()));

        var desk = Assert.Single(_sockets[Desk].Messages);
        Assert.False(desk["full"]!.GetValue<bool>());
        Assert.Equal(211.0, desk["values"]!["extruder.temperature"]!.GetValue<double>());
        Assert.Empty(_sockets[Shelf].Messages);
    }

    [Fact]
    public async Task Connection_changes_go_to_every_node()
    {
        await _relay.OnStatusChangedAsync(new MoonrakerStatus(MoonrakerState.Ready, null, []));

        foreach (var socket in _sockets.Values)
        {
            var message = Assert.Single(socket.Messages);
            Assert.Equal("moonraker_status", message["type"]!.GetValue<string>());
            Assert.True(message["connected"]!.GetValue<bool>());
        }
    }

    [Fact]
    public async Task Display_command_with_a_node_name_goes_to_that_node()
    {
        await _relay.OnGcodeResponseAsync("echo: display:node=shelf group=win set=party loop=2");

        Assert.Empty(_sockets[Desk].Messages);
        var message = Assert.Single(_sockets[Shelf].Messages);
        Assert.Equal("display_cmd", message["type"]!.GetValue<string>());
        Assert.Equal("win", message["group"]!.GetValue<string>());
        Assert.Equal("party", message["set"]!.GetValue<string>());
        Assert.Equal(2, message["loop"]!.GetValue<int>());
    }

    [Fact]
    public async Task Display_command_without_a_node_goes_to_every_node()
    {
        await _relay.OnGcodeResponseAsync("echo: display:group=win");

        Assert.All(_sockets.Values, s => Assert.Single(s.Messages));
    }

    [Fact]
    public async Task Other_console_lines_are_ignored()
    {
        await _relay.OnGcodeResponseAsync("echo: Homing done");

        Assert.All(_sockets.Values, s => Assert.Empty(s.Messages));
    }

    private static void AddGroup(KlippyfaceDbContext db, string id, params string[] keys)
    {
        var frame = new Frame();
        foreach (var key in keys)
            frame.Elements.Add(new FrameElement { Type = "datavalue", Value = key });
        frame.Elements.Add(new FrameElement { Type = "text", Value = "not a key" });

        var set = new Set { GroupId = id };
        set.Frames.Add(frame);
        var group = new Group { Id = id, Label = id };
        group.Sets.Add(set);
        db.Groups.Add(group);
    }

    private static void AddNode(KlippyfaceDbContext db, string mac, string name, string defaultGroup, string triggers)
    {
        var node = new Node { MacAddress = mac, FriendlyName = name };
        var display = new NodeDisplay { NodeId = node.Id, Label = "main", DriverType = "sh1106" };
        node.Displays.Add(display);
        node.Assignments.Add(new Assignment
        {
            NodeId = node.Id, DisplayId = display.Id, DefaultGroup = defaultGroup, TriggersJson = triggers,
        });
        db.Nodes.Add(node);
    }

    /// <summary>An open WebSocket that keeps every message the server sends.</summary>
    private sealed class RecordingSocket : WebSocket
    {
        public List<JsonObject> Messages { get; } = [];

        public override WebSocketState State => WebSocketState.Open;
        public override WebSocketCloseStatus? CloseStatus => null;
        public override string? CloseStatusDescription => null;
        public override string? SubProtocol => null;

        public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType,
            bool endOfMessage, CancellationToken cancellationToken)
        {
            lock (Messages)
                Messages.Add(JsonNode.Parse(Encoding.UTF8.GetString(buffer))!.AsObject());
            return Task.CompletedTask;
        }

        public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken) =>
            Task.Delay(Timeout.Infinite, cancellationToken).ContinueWith(_ => new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));

        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public override void Abort() { }
        public override void Dispose() { }
    }
}
