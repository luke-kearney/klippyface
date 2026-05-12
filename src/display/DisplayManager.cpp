#include "display/DisplayManager.h"
#include "display/Renderer.h"
#include "display/Sprite.h"
#include "display/DisplayFactory.h"
#include "comms/MoonrakerClient.h"
#include <ArduinoJson.h>

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

void DisplayManager::buildBootDisplay() {
    Serial.printf("[%s] No boot display — waiting for server config\n", TAG);
}

bool DisplayManager::begin() {
    cleanup();
    _cmdQueue = xQueueCreate(10, sizeof(CmdMessage));
    if (!_cmdQueue) {
        Serial.printf("[%s] Failed to create command queue\n", TAG);
    }
    buildBootDisplay();
    _lastActivity = millis();
    _screenSaverActive = false;
    return !_slots.empty();
}

bool DisplayManager::applyConfig(const NodeConfig& config) {
    Serial.printf("[%s] Applying config version %u...\n", TAG, config.config_version);

    cleanup();

    // Decode sprites
    for (const auto& kv : config.sprites) {
        _sprites[kv.first] = decodeSpriteFromInfo(kv.second);
    }
    if (!config.sprites.empty()) {
        Serial.printf("[%s] Decoded %u sprites\n", TAG, (unsigned)config.sprites.size());
    }

    // Create display slots
    for (const auto& dispConfig : config.displays) {
        DisplaySlot slot;
        slot.id = dispConfig.id;

        // Build bus config JsonObject for the factory
        JsonDocument busDoc;
        JsonObject busObj = busDoc.to<JsonObject>();
        if (!dispConfig.rawBusJson.isEmpty()) {
            deserializeJson(busDoc, dispConfig.rawBusJson);
            busObj = busDoc.as<JsonObject>();
        } else {
            busObj["type"] = dispConfig.bus.type;
            if (dispConfig.bus.type == "i2c") {
                busObj["address"] = dispConfig.bus.address;
            } else {
                if (dispConfig.bus.cs >= 0)  busObj["cs"] = dispConfig.bus.cs;
                if (dispConfig.bus.dc >= 0)  busObj["dc"] = dispConfig.bus.dc;
                if (dispConfig.bus.rst >= 0) busObj["rst"] = dispConfig.bus.rst;
            }
        }

        slot.driver = createDriver(
            dispConfig.driver_type.c_str(),
            busObj,
            dispConfig.width,
            dispConfig.height,
            dispConfig.rotation
        );

        if (!slot.driver) {
            Serial.printf("[%s] Failed to create driver for '%s' (type=%s)\n",
                          TAG, dispConfig.id.c_str(), dispConfig.driver_type.c_str());
            continue;
        }

        if (!slot.driver->init()) {
            Serial.printf("[%s] Failed to init driver for '%s'\n",
                          TAG, dispConfig.id.c_str());
            delete slot.driver;
            continue;
        }

        // Collect groups referenced by this display
        std::set<String> refGroupIds;
        if (!dispConfig.default_group.isEmpty()) {
            refGroupIds.insert(dispConfig.default_group);
        }
        for (const auto& trig : dispConfig.triggers) {
            if (!trig.second.isEmpty()) {
                refGroupIds.insert(trig.second);
            }
        }

        std::map<String, Group> usedGroups;
        for (const auto& gid : refGroupIds) {
            auto it = config.library_groups.find(gid);
            if (it != config.library_groups.end()) {
                usedGroups[gid] = it->second;
            } else {
                Serial.printf("[%s] Group '%s' referenced but not found\n", TAG, gid.c_str());
            }
        }

        // Determine default group
        String defaultGroup = dispConfig.default_group;
        if (defaultGroup.isEmpty() && !usedGroups.empty()) {
            defaultGroup = usedGroups.begin()->first;
        }

        slot.engine.configure(usedGroups, defaultGroup, dispConfig.triggers);
        _slots.push_back(slot);

        Serial.printf("[%s] Display '%s': %s %dx%d, %u groups\n",
                      TAG, slot.id.c_str(),
                      dispConfig.driver_type.c_str(),
                      dispConfig.width, dispConfig.height,
                      (unsigned)usedGroups.size());
    }

    _configVersion = config.config_version;
    _lastActivity = millis();
    _screenSaverActive = false;

    bool ok = !_slots.empty();
    Serial.printf("[%s] Config applied: %u displays, %u sprites (%s)\n",
                  TAG, (unsigned)_slots.size(), (unsigned)_sprites.size(),
                  ok ? "OK" : "NO DISPLAYS");
    return ok;
}

void DisplayManager::tickAll(uint32_t now) {
    // Phase A — Process CmdMessage queue (wake if sleeping)
    if (_cmdQueue) {
        CmdMessage cmd;
        while (xQueueReceive(_cmdQueue, &cmd, 0) == pdTRUE) {
            if (_screenSaverActive) {
                for (auto& slot : _slots) {
                    if (slot.driver) {
                        slot.driver->powerSave(false);
                    }
                    slot.engine.resetToDefault();
                }
                _screenSaverActive = false;
                Serial.printf("[%s] Woken from screen sleep\n", TAG);
            }

            switch (cmd.type) {
                case CmdMessage::TriggerChange:
                    for (auto& slot : _slots) {
                        slot.engine.onTrigger(String(cmd.data));
                    }
                    break;
                case CmdMessage::GroupSwitch:
                    for (auto& slot : _slots) {
                        if (cmd.extra[0] != '\0') {
                            slot.engine.switchToGroupAndSet(
                                String(cmd.data), String(cmd.extra));
                        } else {
                            slot.engine.switchToGroup(String(cmd.data));
                        }
                    }
                    break;
            }
            _lastActivity = now;
        }
    }

    // Phase B — Check sleep timeout
    if (!_screenSaverActive && (now - _lastActivity >= SCREEN_SAVER_TIMEOUT)) {
        for (auto& slot : _slots) {
            slot.engine.switchToGroup("screen_sleep");
            if (slot.driver) {
                slot.driver->powerSave(true);
            }
        }
        _screenSaverActive = true;
        Serial.printf("[%s] Screen sleep after %lums inactivity\n",
                      TAG, (unsigned long)SCREEN_SAVER_TIMEOUT);
    }

    // Phase C — Render (skip if sleeping)
    if (_screenSaverActive) return;

    for (auto& slot : _slots) {
        if (!slot.driver) continue;

        const Frame* frame = slot.engine.tick(now);
        if (frame && frame != slot.lastRenderedFrame) {
            renderFrame(*frame, *slot.driver, &_sprites, &_printerState);
            slot.driver->show();
            slot.lastRenderedFrame = frame;
        }
    }
}

void DisplayManager::updateState(const StateEvent& event) {
    _printerState.progress = event.progress;
    _printerState.nozzleTemp = event.nozzleTemp;
    _printerState.bedTemp = event.bedTemp;
    _printerState.nozzleTarget = event.nozzleTarget;
    _printerState.bedTarget = event.bedTarget;
    _printerState.moonrakerConnected = event.connected;
}

void DisplayManager::setMoonrakerConnected(bool connected) {
    _printerState.moonrakerConnected = connected;
}

void DisplayManager::onStateChange(const String& trigger) {
    if (!_cmdQueue) return;

    CmdMessage msg;
    msg.type = CmdMessage::TriggerChange;
    strncpy(msg.data, trigger.c_str(), sizeof(msg.data) - 1);
    msg.data[sizeof(msg.data) - 1] = '\0';
    msg.extra[0] = '\0';
    msg.loopCount = 0;

    if (xQueueSend(_cmdQueue, &msg, 0) != pdTRUE) {
        Serial.printf("[%s] Cmd queue full — dropping state change\n", TAG);
    }
}

void DisplayManager::directCommand(const String& groupId,
                                   const String& setId,
                                   int16_t loopCount) {
    if (!_cmdQueue) return;

    CmdMessage msg;
    msg.type = CmdMessage::GroupSwitch;
    strncpy(msg.data, groupId.c_str(), sizeof(msg.data) - 1);
    msg.data[sizeof(msg.data) - 1] = '\0';
    strncpy(msg.extra, setId.c_str(), sizeof(msg.extra) - 1);
    msg.extra[sizeof(msg.extra) - 1] = '\0';
    msg.loopCount = loopCount;

    if (xQueueSend(_cmdQueue, &msg, 0) != pdTRUE) {
        Serial.printf("[%s] Cmd queue full — dropping direct command\n", TAG);
    }
}
