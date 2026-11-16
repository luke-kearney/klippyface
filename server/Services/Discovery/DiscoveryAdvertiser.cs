using System.Net.NetworkInformation;
using System.Net.Sockets;
using Makaretu.Dns;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Options;

namespace Klippyface.Server.Services.Discovery;

/// <summary>
/// Advertises the server over mDNS as <c>_klippyface._tcp</c> so nodes can find it
/// without a typed-in address. Waits for Kestrel to start so the advertised port and
/// TLS setting are the ones actually being listened on.
/// </summary>
public sealed class DiscoveryAdvertiser : IHostedService, IDisposable
{
    private readonly IServer _server;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly DiscoveryOptions _options;
    private readonly ILogger<DiscoveryAdvertiser> _logger;

    private MulticastService? _mdns;
    private ServiceDiscovery? _discovery;

    public DiscoveryAdvertiser(IServer server, IHostApplicationLifetime lifetime,
        IOptions<DiscoveryOptions> options, ILogger<DiscoveryAdvertiser> logger)
    {
        _server = server;
        _lifetime = lifetime;
        _options = options.Value;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("Discovery disabled; nodes need the server address entered by hand");
            return Task.CompletedTask;
        }

        _lifetime.ApplicationStarted.Register(Advertise);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            // Goodbye packets, so browsers drop the service now rather than at TTL expiry
            _discovery?.Unadvertise();
            _mdns?.Stop();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Discovery shutdown failed");
        }
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _discovery?.Dispose();
        _mdns?.Dispose();
    }

    private void Advertise()
    {
        try
        {
            var listening = _server.Features.Get<IServerAddressesFeature>()?.Addresses ?? [];
            var endpoint = DiscoveryProfile.SelectEndpoint(listening);
            if (endpoint is null)
            {
                _logger.LogWarning("Discovery off: the server only listens on loopback ({Addresses}), so nodes cannot reach it",
                    string.Join(", ", listening));
                return;
            }

            var interfaces = NetworkInterface.GetAllNetworkInterfaces().Where(IsAdvertised).ToList();
            var addresses = interfaces
                .SelectMany(n => n.GetIPProperties().UnicastAddresses)
                .Select(a => a.Address)
                .Where(a => a.AddressFamily == AddressFamily.InterNetwork && !System.Net.IPAddress.IsLoopback(a))
                .ToList();
            if (addresses.Count == 0)
            {
                _logger.LogWarning("Discovery off: no usable network interface (looked at {Interfaces})",
                    string.Join(", ", NetworkInterface.GetAllNetworkInterfaces().Select(n => n.Name)));
                return;
            }

            var instance = DiscoveryProfile.BuildInstanceName(_options.InstanceName, Environment.MachineName);
            var version = typeof(DiscoveryAdvertiser).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";

            // Nodes only speak IPv4; leaving IPv6 out keeps answers small and unambiguous
            _mdns = new MulticastService(all => all.Where(IsAdvertised)) { UseIpv6 = false };
            _discovery = new ServiceDiscovery(_mdns);

            var profile = new ServiceProfile(new DomainName([instance]), DiscoveryProfile.ServiceType, endpoint.Port, addresses);
            foreach (var (key, value) in DiscoveryProfile.BuildTxtRecords(version, endpoint))
                profile.AddProperty(key, value);

            _discovery.Advertise(profile);
            _mdns.Start();
            _discovery.Announce(profile);

            _logger.LogInformation("Advertising {Instance} as {Service} on port {Port} ({Scheme}) at {Addresses} via {Interfaces}",
                instance, DiscoveryProfile.ServiceType, endpoint.Port, endpoint.UseTls ? "https" : "http",
                string.Join(", ", addresses), string.Join(", ", interfaces.Select(n => n.Name)));
        }
        catch (Exception ex)
        {
            // Discovery is a convenience; a node with a typed-in address still works without it
            _logger.LogWarning(ex, "Discovery could not start; nodes need the server address entered by hand");
        }
    }

    private bool IsAdvertised(NetworkInterface nic) =>
        DiscoveryProfile.IsAdvertisedInterface(nic.Name, nic.NetworkInterfaceType, nic.OperationalStatus, _options.Interfaces);
}
