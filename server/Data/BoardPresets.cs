using Klippyface.Server.Models;

namespace Klippyface.Server.Data;

/// <summary>Displays for the boards the firmware is built for. Pins mirror docs/hardware/.</summary>
public static class BoardPresets
{
    public static readonly IReadOnlyList<BoardPreset> All =
    [
        new("esp32dev-sh1106", "ESP32 DevKit + SH1106 OLED 128×64", "esp32dev",
            "sh1106", "i2c", 128, 64, 0,
            """{"address":"0x3C","sda":21,"scl":22}"""),
        new("esp32dev-hx8347d", "ESP32 DevKit + 2.8\" HX8347D shield (parallel)", "esp32dev",
            "hx8347", "parallel8", 320, 240, 0,
            """{"dc":32,"cs":5,"wr":26,"rd":-1,"rst":33,"d0":4,"d1":13,"d2":18,"d3":19,"d4":14,"d5":12,"d6":23,"d7":25,"ips":true}"""),
        new("esp32s3-ws-lcd169", "Waveshare ESP32-S3-Touch-LCD-1.69 (ST7789V2 240×280)", "esp32s3-ws-lcd169",
            "st7789", "spi", 240, 280, 0,
            """{"sclk":6,"mosi":7,"dc":4,"cs":5,"rst":8,"bl":15,"row_offset":20,"ips":true}"""),
        new("esp32s3-ws-lcd128", "Waveshare ESP32-S3-LCD-1.28 (GC9A01 240×240 round)", "esp32s3-ws-lcd128",
            "gc9a01", "spi", 240, 240, 0,
            """{"sclk":10,"mosi":11,"dc":8,"cs":9,"rst":12,"bl":40,"ips":true}"""),
    ];

    public static BoardPreset? Find(string id) => All.FirstOrDefault(p => p.Id == id);

    /// <summary>The preset for a board with exactly one display option, e.g. a board with a built-in screen.</summary>
    public static BoardPreset? DefaultFor(string? board)
    {
        var matches = All.Where(p => p.Board == board).Take(2).ToList();
        return matches.Count == 1 ? matches[0] : null;
    }
}
