#ifndef KLIPPYFACE_DISPLAY_MANAGER_H
#define KLIPPYFACE_DISPLAY_MANAGER_H

#include <Arduino.h>
#include <stdint.h>
#include <map>
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
    void directCommand(const String& groupId,
                       const String& setId = "",
                       int16_t loopCount = 0);

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

    void buildHardcodedConfig();
    void cleanup();
};

#endif
