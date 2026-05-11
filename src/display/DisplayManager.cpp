#include "display/DisplayManager.h"
#include "display/Renderer.h"
#include "display/Sh1106Driver.h"

static const char* TAG = "DISPLAY";

DisplayManager::DisplayManager() {}

DisplayManager::~DisplayManager() {
    cleanup();
}

void DisplayManager::cleanup() {
    for (auto& slot : _slots) {
        delete slot.driver;
        slot.driver = nullptr;
    }
    _slots.clear();
    _sprites.clear();
}

void DisplayManager::buildHardcodedConfig() {
    DisplayDriver* driver = new Sh1106Driver(128, 64, 0x3C, 0);
    if (!driver->init()) {
        Serial.printf("[%s] Hardcoded SH1106 init failed\n", TAG);
        delete driver;
        return;
    }

    Frame frameA;
    frameA.type = FrameType::Text;
    frameA.value = ":-)";
    frameA.x_offset = 64;
    frameA.y_offset = 32;
    frameA.duration_ms = 2000;

    Frame frameB;
    frameB.type = FrameType::Text;
    frameB.value = ":D";
    frameB.x_offset = 64;
    frameB.y_offset = 32;
    frameB.duration_ms = 2000;

    Set moods;
    moods.id = "moods";
    moods.label = "Moods";
    moods.loop_forever = true;
    moods.loop_count = 0;
    moods.frames.push_back(frameA);
    moods.frames.push_back(frameB);

    Group faces;
    faces.id = "faces";
    faces.label = "Faces";
    faces.sets.push_back(moods);

    std::map<String, Group> groups;
    groups[faces.id] = faces;

    std::map<String, String> triggers;

    DisplaySlot slot;
    slot.id = "face_oled";
    slot.driver = driver;
    slot.engine.configure(groups, "faces", triggers);
    _slots.push_back(slot);

    Serial.printf("[%s] Hardcoded config: 1 display, group '%s', %u frames\n",
                  TAG, faces.id.c_str(), (unsigned)moods.frames.size());
}

bool DisplayManager::begin() {
    cleanup();
    buildHardcodedConfig();
    return !_slots.empty();
}

void DisplayManager::tickAll(uint32_t now) {
    for (auto& slot : _slots) {
        if (!slot.driver) continue;

        const Frame* frame = slot.engine.tick(now);
        if (frame) {
            renderFrame(*frame, *slot.driver, &_sprites);
            slot.driver->show();
        }
    }
}

void DisplayManager::onStateChange(const String& trigger) {
    for (auto& slot : _slots) {
        slot.engine.onTrigger(trigger);
    }
}
