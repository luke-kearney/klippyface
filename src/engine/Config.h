#ifndef KLIPPYFACE_CONFIG_H
#define KLIPPYFACE_CONFIG_H

#include <Arduino.h>
#include <stdint.h>
#include <map>
#include <vector>

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
};

// -------------------------------------------------------------------
// Frame — a container of elements rendered on one screen
// -------------------------------------------------------------------
struct Frame {
    uint32_t                    duration_ms = 1000;
    uint32_t                    bg_color    = 0x000000;
    std::vector<FrameElement>   elements;
};

// -------------------------------------------------------------------
// PrinterState — live runtime values from Moonraker
// -------------------------------------------------------------------
struct PrinterState {
    float progress      = 0.0f;
    float nozzleTemp    = 0.0f;
    float bedTemp       = 0.0f;
    float nozzleTarget  = 0.0f;
    float bedTarget     = 0.0f;

    String resolve(const String& key) const;
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
    uint32_t                frame_time    = 0;   // 0 = use per-frame duration_ms
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
    std::map<String, SpriteInfo>            sprites;
};

#endif
