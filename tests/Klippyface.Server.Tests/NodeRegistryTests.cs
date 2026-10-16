using Klippyface.Server.Data;
using Klippyface.Server.Models;
using Klippyface.Server.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Klippyface.Server.Tests;

/// <summary>Unknown nodes are added as pending, get nothing, and start working once accepted.</summary>
public class NodeRegistryTests : IAsyncLifetime
{
    private const string Known = "AA:AA:AA:AA:AA:01";
    private const string Stranger = "BB:BB:BB:BB:BB:02";

    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly NodeStatusService _status = new(NullLogger<NodeStatusService>.Instance);
    private ServiceProvider _services = null!;

    public async ValueTask InitializeAsync()
    {
        await _connection.OpenAsync();
        _services = new ServiceCollection()
            .AddDbContext<KlippyfaceDbContext>(o => o.UseSqlite(_connection))
            .AddSingleton(_status)
            .AddScoped<NodePublisher>()
            .AddScoped<StarterPackService>()
            .AddScoped<ConfigExportService>()
            .AddScoped<NodeRegistry>()
            .AddSingleton(typeof(ILogger<>), typeof(NullLogger<>))
            .BuildServiceProvider();

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Nodes.Add(new Node { MacAddress = Known, FriendlyName = "Desk" });
        await db.SaveChangesAsync();
    }

    public async ValueTask DisposeAsync()
    {
        _status.Dispose();
        await _services.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Theory]
    [InlineData("aa:bb:cc:dd:ee:ff", "AA:BB:CC:DD:EE:FF")]
    [InlineData(" AA-BB-CC-DD-EE-FF ", "AA:BB:CC:DD:EE:FF")]
    [InlineData("AABBCCDDEEFF", null)]
    [InlineData("../../etc/passwd", null)]
    [InlineData("", null)]
    public void NormalizeMac_accepts_only_mac_addresses(string input, string? expected) =>
        Assert.Equal(expected, NodeRegistry.NormalizeMac(input));

    [Fact]
    public async Task Unknown_mac_is_added_as_pending()
    {
        var (node, created) = await Registry(r => r.ConnectAsync(Stranger));

        Assert.True(created);
        Assert.Equal(NodeStatus.Pending, node!.Status);
        Assert.Equal(Stranger, node.MacAddress);
    }

    [Fact]
    public async Task Known_mac_keeps_its_record()
    {
        var (node, created) = await Registry(r => r.ConnectAsync(Known));

        Assert.False(created);
        Assert.Equal(NodeStatus.Accepted, node!.Status);
        Assert.Equal("Desk", node.FriendlyName);
    }

    [Fact]
    public async Task New_macs_are_refused_once_the_pending_list_is_full()
    {
        for (var i = 0; i < NodeRegistry.MaxPending; i++)
            Assert.NotNull((await Registry(r => r.ConnectAsync($"CC:CC:CC:CC:CC:{i:X2}"))).Node);

        Assert.Null((await Registry(r => r.ConnectAsync(Stranger))).Node);
        // Nodes already waiting, and accepted ones, still connect
        Assert.NotNull((await Registry(r => r.ConnectAsync("CC:CC:CC:CC:CC:00"))).Node);
        Assert.NotNull((await Registry(r => r.ConnectAsync(Known))).Node);
    }

    [Fact]
    public async Task Hello_names_a_pending_node_but_not_an_accepted_one()
    {
        var (pending, _) = await Registry(r => r.ConnectAsync(Stranger));
        var known = await Registry(r => r.ConnectAsync(Known));

        var hello = await Registry(r => r.HelloAsync(pending!.Id, "esp32s3-ws-lcd128", "0.6.0", "Shelf"));
        Assert.Equal("Shelf", hello!.FriendlyName);
        Assert.Equal("esp32s3-ws-lcd128", hello.Board);
        Assert.Equal("0.6.0", hello.FirmwareVersion);

        hello = await Registry(r => r.HelloAsync(known.Node!.Id, "esp32dev", "0.6.0", "Renamed on the board"));
        Assert.Equal("Desk", hello!.FriendlyName);
    }

    [Fact]
    public void Pending_connections_get_no_broadcasts_until_accepted()
    {
        _status.Register(Known, new RecordingSocket(), 1);
        _status.Register(Stranger, new RecordingSocket(), 1, pending: true);

        Assert.Equal([Known], _status.GetConnectedNodeIds());
        Assert.True(_status.IsOnline(Stranger));

        _status.Accept(Stranger);
        Assert.Equal([Known, Stranger], _status.GetConnectedNodeIds().Order());
    }

    [Fact]
    public async Task Pending_node_gets_no_config()
    {
        await Registry(r => r.ConnectAsync(Stranger));

        using var scope = _services.CreateScope();
        var export = scope.ServiceProvider.GetRequiredService<ConfigExportService>();
        Assert.Null(await export.ExportNodeConfigAsync(Stranger));
        Assert.NotNull(await export.ExportNodeConfigAsync(Known));
    }

    [Fact]
    public async Task Accept_adds_the_display_and_asks_the_node_to_refresh()
    {
        var (pending, _) = await Registry(r => r.ConnectAsync(Stranger));
        await Registry(r => r.HelloAsync(pending!.Id, "esp32s3-ws-lcd128", "0.6.0", ""));
        var socket = new RecordingSocket();
        _status.Register(Stranger, socket, 1, pending: true);

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            var node = await db.Nodes.Include(n => n.Displays).SingleAsync(n => n.MacAddress == Stranger);
            await scope.ServiceProvider.GetRequiredService<NodeRegistry>()
                .AcceptAsync(node, "Shelf", BoardPresets.DefaultFor(node.Board));
        }

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            var node = await db.Nodes.Include(n => n.Displays).Include(n => n.Assignments)
                .SingleAsync(n => n.MacAddress == Stranger);
            Assert.Equal(NodeStatus.Accepted, node.Status);
            Assert.Equal("Shelf", node.FriendlyName);
            var display = Assert.Single(node.Displays);
            Assert.Equal("gc9a01", display.DriverType);
            Assert.Equal("Round face", display.Label);
            // Starts on the round starter faces
            Assert.EndsWith("_round240", Assert.Single(node.Assignments).DefaultGroup);
            Assert.Equal(2u, node.LastConfigVersion);
        }

        Assert.Contains(Stranger, _status.GetConnectedNodeIds());
        await WaitUntil(() => socket.Messages.Any(m => m["type"]!.GetValue<string>() == "refresh_config"));
    }

    [Fact]
    public async Task Remove_disconnects_the_node()
    {
        var (pending, _) = await Registry(r => r.ConnectAsync(Stranger));
        var socket = new RecordingSocket();
        _status.Register(Stranger, socket, 1, pending: true);

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
            await scope.ServiceProvider.GetRequiredService<NodeRegistry>()
                .RemoveAsync((await db.Nodes.FindAsync(pending!.Id))!);
            Assert.False(await db.Nodes.AnyAsync(n => n.MacAddress == Stranger));
        }

        Assert.Equal("Node removed", socket.ClosedWith);
        Assert.False(_status.IsOnline(Stranger));
    }

    [Fact]
    public async Task Clear_pending_keeps_accepted_nodes()
    {
        await Registry(r => r.ConnectAsync(Stranger));
        await Registry(r => r.ConnectAsync("CC:CC:CC:CC:CC:00"));

        Assert.Equal(2, await Registry(r => r.ClearPendingAsync()));

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
        Assert.Equal([Known], await db.Nodes.Select(n => n.MacAddress).ToListAsync());
    }

    [Theory]
    [InlineData("esp32s3-ws-lcd169", "esp32s3-ws-lcd169")]
    [InlineData("esp32s3-ws-lcd128", "esp32s3-ws-lcd128")]
    [InlineData("esp32dev", null)] // OLED or parallel TFT: the user picks
    [InlineData("", null)]
    public void Default_preset_only_for_boards_with_one_display(string board, string? expected) =>
        Assert.Equal(expected, BoardPresets.DefaultFor(board)?.Id);

    private async Task<T> Registry<T>(Func<NodeRegistry, Task<T>> action)
    {
        using var scope = _services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<NodeRegistry>());
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        for (var i = 0; i < 100 && !condition(); i++)
            await Task.Delay(10, TestContext.Current.CancellationToken);
        Assert.True(condition());
    }
}
