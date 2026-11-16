using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Api;
using Klippyface.Server.Services;
using Klippyface.Server.Services.Discovery;
using Klippyface.Server.Services.Moonraker;

// An explicit --contentRoot wins; otherwise find wwwroot so a release runs from any folder
var webOptions = new WebApplicationOptions { Args = args };
if (!args.Any(a => a.StartsWith("--contentRoot", StringComparison.OrdinalIgnoreCase)))
{
    webOptions = new WebApplicationOptions
    {
        Args = args,
        ContentRootPath = ServerPaths.ContentRoot(Directory.GetCurrentDirectory(), AppContext.BaseDirectory, Directory.Exists),
    };
}
var builder = WebApplication.CreateBuilder(webOptions);

var dataDir = builder.Configuration[ServerPaths.DataDirVariable];
if (!string.IsNullOrWhiteSpace(dataDir)) Directory.CreateDirectory(dataDir);
var connectionString = ServerPaths.ConnectionString(
    builder.Configuration.GetConnectionString(ServerPaths.ConnectionStringName), dataDir, builder.Environment.ContentRootPath);

builder.Services.AddDbContext<KlippyfaceDbContext>(db => db.UseSqlite(connectionString));

builder.Services.AddScoped<ConfigExportService>();
builder.Services.AddScoped<StarterPackService>();
builder.Services.AddScoped<NodePublisher>();
builder.Services.AddScoped<NodeRegistry>();
builder.Services.AddSingleton<NodeStatusService>();
builder.Services.AddHostedService<PendingPublishSweeper>();

// mDNS advertisement so nodes find the server without a typed-in address
builder.Services.Configure<DiscoveryOptions>(builder.Configuration.GetSection("Klippyface:Discovery"));
builder.Services.AddHostedService<DiscoveryAdvertiser>();

// One Moonraker connection for the whole server; nodes get printer state through it
builder.Services.AddSingleton<PrinterStateStore>();
builder.Services.AddSingleton<NodeStateRelay>();
builder.Services.AddSingleton<IPrinterStateListener>(sp => sp.GetRequiredService<NodeStateRelay>());
builder.Services.AddSingleton<IMoonrakerSettingsProvider, DbMoonrakerSettingsProvider>();
builder.Services.AddSingleton(new MoonrakerServiceOptions());
builder.Services.AddSingleton<MoonrakerService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<MoonrakerService>());

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var cors = builder.Configuration.GetSection("Klippyface:Cors");
        var origins = cors.GetSection("AllowedOrigins").Get<string[]>();
        var methods = cors.GetSection("AllowedMethods").Get<string[]>();
        var headers = cors.GetSection("AllowedHeaders").Get<string[]>();

        if (origins is { Length: 1 } && origins[0] == "*")
            policy.AllowAnyOrigin();
        else if (origins is { Length: > 0 })
            policy.WithOrigins(origins);

        if (methods is { Length: 1 } && methods[0] == "*")
            policy.AllowAnyMethod();
        else if (methods is { Length: > 0 })
            policy.WithMethods(methods);

        if (headers is { Length: 1 } && headers[0] == "*")
            policy.AllowAnyHeader();
        else if (headers is { Length: > 0 })
            policy.WithHeaders(headers);
    });
});

var app = builder.Build();

app.UseWebSockets();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
    app.Logger.LogInformation("Database: {ConnectionString}", connectionString);
    db.Database.Migrate();

    // First run: give an empty library the built-in faces
    var starterPack = scope.ServiceProvider.GetRequiredService<StarterPackService>();
    if (await starterPack.IsLibraryEmptyAsync())
    {
        var imported = await starterPack.ImportAsync();
        app.Logger.LogInformation("Imported starter pack: {Groups} groups, {Sprites} sprites",
            imported.GroupsAdded, imported.SpritesAdded);
    }
}

app.MapNodesApi();
app.MapBoardsApi();
app.MapLibraryApi();
app.MapSpritesApi();
app.MapPresetsApi();
app.MapConfigApi();
app.MapMoonrakerApi();

app.Run();
