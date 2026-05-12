using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Data;
using Klippyface.Server.Api;
using Klippyface.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<KlippyfaceDbContext>(options =>
    options.UseSqlite("Data Source=klippyface.db"));

builder.Services.AddScoped<ConfigExportService>();

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

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KlippyfaceDbContext>();
    db.Database.Migrate();
}

app.MapNodesApi();
app.MapLibraryApi();
app.MapSpritesApi();
app.MapPresetsApi();
app.MapConfigApi();

app.Run();
