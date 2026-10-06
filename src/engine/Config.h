#ifndef KLIPPYFACE_CONFIG_H
#define KLIPPYFACE_CONFIG_H

#include <Arduino.h>
#include <stdint.h>
#include <atomic>
#include <map>
#include <vector>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <ArduinoJson.h>

// -------------------------------------------------------------------
// FrameElement — a single positioned element within a Frame
// -------------------------------------------------------------------
struct FrameElement {
    enum Type : uint8_t {
        Text,
        Sprite,
        DataValue
    };

    Type        type    = Type::Text;
    String      value;       // text content, sprite name, or binding key
    String      label;       // optional display label
    uint32_t    color   = 0xFFFFFF;
    int16_t     x       = 0;
    int16_t     y       = 0;
    uint8_t     size    = 1;   // font scale for text/data values, pixel scale for sprites
};

// -------------------------------------------------------------------
// Frame — a container of elements rendered on one screen
// -------------------------------------------------------------------
struct Frame {
    uint32_t                    duration_ms = 0;     // 0 = use set frame_time
    uint32_t                    bg_color    = 0x000000;
    std::vector<FrameElement>   elements;
};

// -------------------------------------------------------------------
// PrinterState — live printer values relayed by the server, by data key
// ("extruder.temperature"). Written from the server task (core 0), read
// by the renderer (core 1), so every access takes the mutex.
// -------------------------------------------------------------------
class PrinterState {
public:
    PrinterState();
    ~PrinterState();

    // Apply a "state" message's values; full replaces everything, null removes a key
    void apply(JsonObjectConst values, bool full);
    void setMoonrakerConnected(bool connected) {
        if (_moonrakerConnected != connected) {
            _moonrakerConnected = connected;
            _version++;
        }
    }

    // Display string for a binding key: "210°C", "42.0%", "--" when unknown
    String resolve(const String& key) const;

    // Bumped on every change, so the renderer only re-resolves values when it moves
    uint32_t version() const { return _version.load(); }

private:
    struct Value {
        bool    isNumber = false;
        float   number   = 0.0f;
        String  text;
    };

    SemaphoreHandle_t       _mutex = nullptr;
    std::map<String, Value> _values;
    volatile bool           _moonrakerConnected = false;
    std::atomic<uint32_t>   _version{0};

    PrinterState(const PrinterState&) = delete;
    PrinterState& operator=(const PrinterState&) = delete;
};

// -------------------------------------------------------------------
// Utility: hex color "#RRGGBB" → uint32_t 0xRRGGBB
// Returns 0x000000 on parse failure.
// -------------------------------------------------------------------
uint32_t hexColorToUint32(const char* hex);

// -------------------------------------------------------------------
// Set — a sequence of frames with loop control
// -------------------------------------------------------------------
struct Set {
    String                  id;
    String                  label;
    int32_t                 loop_count    = 1;   // 0 = loop forever
    bool                    loop_forever  = false;
    uint32_t                frame_time    = 0;   // fallback for frames with no duration_ms (0 = 1000ms)
    std::vector<Frame>      frames;
};

// -------------------------------------------------------------------
// Group — a named collection of sets
// -------------------------------------------------------------------
struct Group {
    String              id;
    String              label;
    std::vector<Set>    sets;
};

// -------------------------------------------------------------------
// DisplayBusConfig — I2C or SPI bus parameters for a physical display
// -------------------------------------------------------------------
struct DisplayBusConfig {
    String      type;       // "i2c" or "spi"
    String      address;    // I2C address e.g. "0x3C" (I2C only)
    int8_t      cs  = -1;  // SPI chip select   (SPI only, -1 = unused)
    int8_t      dc  = -1;  // SPI data/command  (SPI only, -1 = unused)
    int8_t      rst = -1;  // SPI reset         (SPI only, -1 = unused)
};

// -------------------------------------------------------------------
// DisplaySlotConfig — configures one physical display on a node
// -------------------------------------------------------------------
struct DisplaySlotConfig {
    String                          id;
    String                          label;
    String                          driver_type;   // "sh1106", "ssd1306", etc.
    DisplayBusConfig                bus;
    String                          rawBusJson;  // full bus config JSON for driver
    int16_t                         width       = 128;
    int16_t                         height      = 64;
    uint8_t                         rotation    = 0;
    String                          default_group;
    std::map<String, String>        triggers;   // "state:printing" → "printing_faces"
};

// -------------------------------------------------------------------
// SpriteInfo — metadata + base64-encoded bitmap
// -------------------------------------------------------------------
struct SpriteInfo {
    uint16_t    width   = 16;
    uint16_t    height  = 16;
    String      data;       // base64-encoded bitmap bytes
};

// -------------------------------------------------------------------
// NodeConfig — top-level per-node configuration
// -------------------------------------------------------------------
struct NodeConfig {
    uint32_t                                config_version  = 1;
    String                                  node_id;
    String                                  friendly_name;
    std::vector<DisplaySlotConfig>          displays;
    std::map<String, Group>                 library_groups;
    std::map<String, SpriteInfo>            sprites;
};

#endif
