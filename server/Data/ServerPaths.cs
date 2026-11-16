namespace Klippyface.Server.Data;

/// <summary>
/// Where the server finds its files (<c>wwwroot</c>, <c>appsettings.json</c>) and keeps its database,
/// so it works from <c>dotnet run</c>, an extracted release started from any folder, and Docker.
/// </summary>
public static class ServerPaths
{
    public const string DataDirVariable = "KLIPPYFACE_DATA_DIR";
    public const string ConnectionStringName = "Klippyface";
    public const string DatabaseFile = "klippyface.db";

    /// <summary>
    /// The working directory if it holds <c>wwwroot</c> (<c>dotnet run</c> in <c>server/</c>, or a
    /// release started from inside its folder), else the app's own folder if that does (a release
    /// started from anywhere else), else the working directory as before.
    /// </summary>
    public static string ContentRoot(string workingDir, string appDir, Func<string, bool> directoryExists)
    {
        if (directoryExists(Path.Combine(workingDir, "wwwroot"))) return workingDir;
        if (directoryExists(Path.Combine(appDir, "wwwroot"))) return appDir;
        return workingDir;
    }

    /// <summary>
    /// The SQLite connection string: <c>ConnectionStrings:Klippyface</c> as is, else
    /// <c>klippyface.db</c> in <c>KLIPPYFACE_DATA_DIR</c>, else next to the app's files.
    /// </summary>
    public static string ConnectionString(string? configured, string? dataDir, string contentRoot) =>
        !string.IsNullOrWhiteSpace(configured)
            ? configured
            : $"Data Source={DatabasePath(dataDir, contentRoot)}";

    public static string DatabasePath(string? dataDir, string contentRoot) =>
        Path.Combine(string.IsNullOrWhiteSpace(dataDir) ? contentRoot : dataDir, DatabaseFile);
}
