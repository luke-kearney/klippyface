using Klippyface.Server.Data;

namespace Klippyface.Server.Tests;

/// <summary>Content root and database location for dotnet run, releases started anywhere, and Docker.</summary>
public class ServerPathsTests
{
    private const string Work = "/home/user";
    private const string App = "/opt/klippyface";

    private static Func<string, bool> Existing(params string[] dirs) => d => dirs.Contains(d);

    [Fact]
    public void Working_dir_with_wwwroot_is_the_content_root()
    {
        Assert.Equal(Work, ServerPaths.ContentRoot(Work, App, Existing("/home/user/wwwroot", "/opt/klippyface/wwwroot")));
    }

    [Fact]
    public void App_dir_is_used_when_started_from_elsewhere()
    {
        Assert.Equal(App, ServerPaths.ContentRoot(Work, App, Existing("/opt/klippyface/wwwroot")));
    }

    [Fact]
    public void Working_dir_is_kept_when_neither_has_wwwroot()
    {
        // dotnet run in a fresh clone before the Web UI is built: bin/ has no wwwroot either
        Assert.Equal(Work, ServerPaths.ContentRoot(Work, App, Existing()));
    }

    [Fact]
    public void Database_sits_next_to_the_app_by_default()
    {
        Assert.Equal("Data Source=/opt/klippyface/klippyface.db", ServerPaths.ConnectionString(null, null, App));
        Assert.Equal("Data Source=/opt/klippyface/klippyface.db", ServerPaths.ConnectionString(" ", "", App));
    }

    [Fact]
    public void Data_dir_moves_the_database()
    {
        Assert.Equal("Data Source=/data/klippyface.db", ServerPaths.ConnectionString(null, "/data", App));
    }

    [Fact]
    public void Connection_string_wins_over_data_dir()
    {
        Assert.Equal("Data Source=/srv/kf.db", ServerPaths.ConnectionString("Data Source=/srv/kf.db", "/data", App));
    }
}
