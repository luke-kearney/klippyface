#ifndef KLIPPYFACE_DISPLAY_MANAGER_H
#define KLIPPYFACE_DISPLAY_MANAGER_H

#include <Arduino.h>
#include <stdint.h>
#include <map>
#include <set>
#include <vector>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "engine/Config.h"
#include "engine/AnimationEngine.h"
#include "display/DisplayDriver.h"
#include "display/Sprite.h"

class DisplayManager {
public:
    DisplayManager();
    ~DisplayManager();

    bool begin();
    void tickAll(uint32_t now);
    void onStateChange(const String& trigger);
    // Printer values from the server's "state" message (called on core 0)
    void applyState(JsonObjectConst values, bool full) { _printerState.apply(values, full); }
    void setMoonrakerConnected(bool connected) { _printerState.setMoonrakerConnected(connected); }
    void directCommand(const String& groupId,
                       const String& setId = "",
                       int16_t loopCount = 0);

    bool applyConfig(const struct NodeConfig& config);

    const std::map<String, Sprite>* sprites() const { return &_sprites; }
    bool isReady() const { return !_slots.empty(); }

private:
    struct CmdMessage {
        enum Type : uint8_t {
            TriggerChange = 0,
            GroupSwitch   = 1,
        };
        Type    type;
        char    data[48];
        char    extra[32];
        int16_t loopCount;
    };

    struct DisplaySlot {
        String              id;
        String              hardwareKey;   // see hardwareKey(); equal keys reuse the driver
        DisplayDriver*      driver = nullptr;
        AnimationEngine     engine;
        const Frame*        lastRenderedFrame = nullptr;
        // Data values as last drawn, so a still frame redraws when one changes
        uint32_t            stateVersion = 0;
        std::vector<String> lastValues;
    };

    std::vector<DisplaySlot> _slots;
    std::map<String, Sprite> _sprites;
    QueueHandle_t _cmdQueue = nullptr;
    PrinterState _printerState;

    unsigned long _lastActivity = 0;
    bool _screenSaverActive = false;
    uint32_t _configVersion = 0;
    static const unsigned long SCREEN_SAVER_TIMEOUT = 300000;

    void buildBootDisplay();
    void cleanup();
    bool sameHardware(const struct NodeConfig& config) const;
    void applyContent(const struct NodeConfig& config);
    void decodeSprites(const struct NodeConfig& config);
    void configureEngine(DisplaySlot& slot, const struct DisplaySlotConfig& dispConfig,
                         const struct NodeConfig& config);
    void logHeap() const;
    std::vector<String> dataValues(const Frame& frame) const;
};

#endif
