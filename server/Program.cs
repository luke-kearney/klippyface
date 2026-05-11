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
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
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
