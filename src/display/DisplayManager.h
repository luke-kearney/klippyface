#ifndef KLIPPYFACE_DISPLAY_MANAGER_H
#define KLIPPYFACE_DISPLAY_MANAGER_H

#include <Arduino.h>
#include <stdint.h>
#include <map>
#include <vector>
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

    const std::map<String, Sprite>* sprites() const { return &_sprites; }
    bool isReady() const { return !_slots.empty(); }

private:
    struct DisplaySlot {
        String              id;
        DisplayDriver*      driver = nullptr;
        AnimationEngine     engine;
    };

    std::vector<DisplaySlot> _slots;
    std::map<String, Sprite> _sprites;

    void buildHardcodedConfig();
    void cleanup();
};

#endif
