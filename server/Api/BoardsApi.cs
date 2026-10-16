using Klippyface.Server.Data;

namespace Klippyface.Server.Api;

public static class BoardsApi
{
    public static WebApplication MapBoardsApi(this WebApplication app)
    {
        app.MapGet("/api/boards/presets", () => BoardPresets.All);
        return app;
    }
}
