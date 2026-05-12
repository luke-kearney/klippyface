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

struct StateEvent;

class DisplayManager {
public:
    DisplayManager();
    ~DisplayManager();

    bool begin();
    void tickAll(uint32_t now);
    void onStateChange(const String& trigger);
    void updateState(const StateEvent& event);
    void setMoonrakerConnected(bool connected);
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
        DisplayDriver*      driver = nullptr;
        AnimationEngine     engine;
    };

    std::vector<DisplaySlot> _slots;
    std::map<String, Sprite> _sprites;
    QueueHandle_t _cmdQueue = nullptr;
    PrinterState _printerState;

    unsigned long _lastActivity = 0;
    bool _screenSaverActive = false;
    uint32_t _configVersion = 0;
    static const unsigned long SCREEN_SAVER_TIMEOUT = 30000;

    void buildBootDisplay();
    void cleanup();
};

#endif
