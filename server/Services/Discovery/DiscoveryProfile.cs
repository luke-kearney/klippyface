using System.Net.NetworkInformation;
using System.Text;

namespace Klippyface.Server.Services.Discovery;

/// <summary>Where nodes should connect, taken from the addresses Kestrel is listening on.</summary>
public record DiscoveryEndpoint(ushort Port, bool UseTls);

/// <summary>
/// The pure parts of the mDNS advertisement: which endpoint, which name, which
/// interfaces and which TXT records. Kept apart from the socket code so they can be tested.
/// </summary>
public static class DiscoveryProfile
{
    public const string ServiceType = "_klippyface._tcp";
    public const string NodeSocketPath = "/api/ws/node";
    public const string InstancePrefix = "Klippyface-";

    // DNS labels are limited to 63 bytes
    private const int MaxInstanceBytes = 63;

    // Container, VM and VPN interfaces: advertising their addresses would send
    // nodes to an address they cannot reach.
    private static readonly string[] VirtualPrefixes =
    [
        "docker", "br-", "veth", "virbr", "vmnet", "vboxnet", "lxc", "lxd", "cni",
        "flannel", "cali", "podman", "tun", "tap", "wg", "zt", "tailscale", "utun",
    ];

    /// <summary>
    /// Picks the endpoint to advertise from Kestrel's listen addresses. Plain HTTP wins
    /// over HTTPS, since that is what nodes use by default. Returns null when the server
    /// only listens on loopback, where no node could reach it anyway.
    /// </summary>
    public static DiscoveryEndpoint? SelectEndpoint(IEnumerable<string> listenAddresses)
    {
        DiscoveryEndpoint? https = null;
        foreach (var address in listenAddresses)
        {
            if (!TryParse(address, out var uri) || IsLoopbackHost(uri.Host)) continue;
            var useTls = uri.Scheme == Uri.UriSchemeHttps;
            var endpoint = new DiscoveryEndpoint((ushort)uri.Port, useTls);
            if (!useTls) return endpoint;
            https ??= endpoint;
        }
        return https;
    }

    /// <summary>The configured instance name, or <c>Klippyface-&lt;host&gt;</c>, cut to fit a DNS label.</summary>
    public static string BuildInstanceName(string? configured, string machineName)
    {
        var name = string.IsNullOrWhiteSpace(configured) ? InstancePrefix + machineName : configured.Trim();
        if (Encoding.UTF8.GetByteCount(name) <= MaxInstanceBytes) return name;

        var builder = new StringBuilder();
        foreach (var rune in name.EnumerateRunes())
        {
            if (Encoding.UTF8.GetByteCount(builder.ToString() + rune) > MaxInstanceBytes) break;
            builder.Append(rune.ToString());
        }
        return builder.ToString();
    }

    /// <summary>
    /// Whether to advertise on an interface. A configured list is used as is; otherwise
    /// any interface that is up, except loopback, tunnels and container/VM bridges.
    /// </summary>
    public static bool IsAdvertisedInterface(string name, NetworkInterfaceType type,
        OperationalStatus status, IReadOnlyCollection<string> configured)
    {
        if (configured.Count > 0)
            return configured.Contains(name, StringComparer.OrdinalIgnoreCase);

        if (status != OperationalStatus.Up) return false;
        if (type is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) return false;
        return !VirtualPrefixes.Any(p => name.StartsWith(p, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>TXT records nodes read alongside the SRV record.</summary>
    public static IReadOnlyList<KeyValuePair<string, string>> BuildTxtRecords(string version, DiscoveryEndpoint endpoint) =>
    [
        new("ver", version),
        new("tls", endpoint.UseTls ? "1" : "0"),
        new("path", NodeSocketPath),
    ];

    private static bool TryParse(string address, out Uri uri)
    {
        // Kestrel reports wildcard bindings as http://0.0.0.0:5000, http://[::]:5000 or
        // http://+:5000 / http://*:5000; the last two are not valid URIs.
        var normalized = address.Replace("://+:", "://0.0.0.0:").Replace("://*:", "://0.0.0.0:");
        return Uri.TryCreate(normalized, UriKind.Absolute, out uri!)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    private static bool IsLoopbackHost(string host) =>
        host is "localhost" or "127.0.0.1" or "[::1]" or "::1";
}
