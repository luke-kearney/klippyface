using System.Net.NetworkInformation;
using System.Text;
using Klippyface.Server.Services.Discovery;

namespace Klippyface.Server.Tests;

/// <summary>The advertised endpoint, name, interfaces and TXT records nodes rely on.</summary>
public class DiscoveryProfileTests
{
    [Theory]
    [InlineData("http://0.0.0.0:5000")]
    [InlineData("http://[::]:5000")]
    [InlineData("http://+:5000")]
    [InlineData("http://*:5000")]
    [InlineData("http://192.168.1.50:5000")]
    public void Wildcard_and_lan_bindings_are_advertised(string address)
    {
        Assert.Equal(new DiscoveryEndpoint(5000, false), DiscoveryProfile.SelectEndpoint([address]));
    }

    [Fact]
    public void Http_wins_over_https()
    {
        var endpoint = DiscoveryProfile.SelectEndpoint(["https://0.0.0.0:5001", "http://0.0.0.0:5000"]);
        Assert.Equal(new DiscoveryEndpoint(5000, false), endpoint);
    }

    [Fact]
    public void Https_only_is_advertised_with_tls()
    {
        Assert.Equal(new DiscoveryEndpoint(5443, true), DiscoveryProfile.SelectEndpoint(["https://0.0.0.0:5443"]));
    }

    [Fact]
    public void Custom_port_is_advertised()
    {
        Assert.Equal(new DiscoveryEndpoint(8080, false), DiscoveryProfile.SelectEndpoint(["http://0.0.0.0:8080"]));
    }

    [Theory]
    [InlineData("http://localhost:5000")]
    [InlineData("http://127.0.0.1:5000")]
    [InlineData("http://[::1]:5000")]
    public void Loopback_only_is_not_advertised(string address)
    {
        Assert.Null(DiscoveryProfile.SelectEndpoint([address]));
    }

    [Fact]
    public void Loopback_is_skipped_when_a_lan_binding_exists()
    {
        var endpoint = DiscoveryProfile.SelectEndpoint(["http://localhost:5000", "http://0.0.0.0:5001"]);
        Assert.Equal(new DiscoveryEndpoint(5001, false), endpoint);
    }

    [Fact]
    public void Name_defaults_to_the_host()
    {
        Assert.Equal("Klippyface-cachyos-5700x", DiscoveryProfile.BuildInstanceName(null, "cachyos-5700x"));
        Assert.Equal("Klippyface-nuc", DiscoveryProfile.BuildInstanceName("  ", "nuc"));
    }

    [Fact]
    public void Configured_name_wins()
    {
        Assert.Equal("Garage printer", DiscoveryProfile.BuildInstanceName(" Garage printer ", "nuc"));
    }

    [Fact]
    public void Long_names_are_cut_to_a_dns_label()
    {
        var name = DiscoveryProfile.BuildInstanceName(null, new string('a', 100));
        Assert.Equal(63, name.Length);
        Assert.StartsWith(DiscoveryProfile.InstancePrefix, name);
    }

    [Fact]
    public void Cutting_never_splits_a_multibyte_character()
    {
        var name = DiscoveryProfile.BuildInstanceName(new string('é', 40), "nuc");
        Assert.True(Encoding.UTF8.GetByteCount(name) <= 63);
        Assert.Equal(new string('é', 31), name);
    }

    [Theory]
    [InlineData("wlan0", NetworkInterfaceType.Wireless80211, true)]
    [InlineData("eth0", NetworkInterfaceType.Ethernet, true)]
    [InlineData("enp5s0", NetworkInterfaceType.Ethernet, true)]
    [InlineData("lo", NetworkInterfaceType.Loopback, false)]
    [InlineData("docker0", NetworkInterfaceType.Ethernet, false)]
    [InlineData("br-bee7c5970adb", NetworkInterfaceType.Ethernet, false)]
    [InlineData("veth1a2b3c", NetworkInterfaceType.Ethernet, false)]
    [InlineData("virbr0", NetworkInterfaceType.Ethernet, false)]
    [InlineData("tailscale0", NetworkInterfaceType.Unknown, false)]
    [InlineData("wg0", NetworkInterfaceType.Unknown, false)]
    public void Physical_interfaces_are_advertised_by_default(string name, NetworkInterfaceType type, bool expected)
    {
        Assert.Equal(expected, DiscoveryProfile.IsAdvertisedInterface(name, type, OperationalStatus.Up, []));
    }

    [Fact]
    public void Down_interfaces_are_skipped()
    {
        Assert.False(DiscoveryProfile.IsAdvertisedInterface("eth0", NetworkInterfaceType.Ethernet, OperationalStatus.Down, []));
    }

    [Fact]
    public void Configured_interfaces_replace_the_default_filter()
    {
        string[] configured = ["docker0"];
        Assert.True(DiscoveryProfile.IsAdvertisedInterface("docker0", NetworkInterfaceType.Ethernet, OperationalStatus.Up, configured));
        Assert.False(DiscoveryProfile.IsAdvertisedInterface("wlan0", NetworkInterfaceType.Wireless80211, OperationalStatus.Up, configured));
    }

    [Fact]
    public void Txt_records_carry_version_tls_and_path()
    {
        var records = DiscoveryProfile.BuildTxtRecords("0.7.0", new DiscoveryEndpoint(5443, true));
        Assert.Equal(
            [new("ver", "0.7.0"), new("tls", "1"), new("path", "/api/ws/node")],
            records);
    }
}
