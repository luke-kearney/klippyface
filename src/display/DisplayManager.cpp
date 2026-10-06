#include "display/DisplayManager.h"
#include "display/Renderer.h"
#include "display/Sprite.h"
#include "display/DisplayFactory.h"
#include "config/Board.h"
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>

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

// Arduino_GFX panels set up their own SPI host and pins; a shared SPI.begin()
// would only fight them for the same peripheral.
static bool driverOwnsBus(const String& driverType) {
    return driverType == "st7789" || driverType == "gc9a01";
}

// Everything that decides how a driver is built; content (groups, sprites) is not part of it.
static String hardwareKey(const DisplaySlotConfig& d) {
    return d.driver_type + "|" + String(d.width) + "x" + String(d.height) + "@" + String(d.rotation)
         + "|" + d.bus.type + "|" + d.bus.address + "|" + String(d.bus.cs) + "," + String(d.bus.dc)
         + "," + String(d.bus.rst) + "|" + d.rawBusJson;
}

bool DisplayManager::sameHardware(const NodeConfig& config) const {
    if (_slots.empty() || _slots.size() != config.displays.size()) return false;
    for (size_t i = 0; i < _slots.size(); i++) {
        if (!_slots[i].driver || _slots[i].id != config.displays[i].id
            || _slots[i].hardwareKey != hardwareKey(config.displays[i]))
            return false;
    }
    return true;
}

void DisplayManager::decodeSprites(const NodeConfig& config) {
    _sprites.clear();
    for (const auto& kv : config.sprites) {
        _sprites[kv.first] = decodeSpriteFromInfo(kv.second);
    }
    if (!config.sprites.empty()) {
        Serial.printf("[%s] Decoded %u sprites\n", TAG, (unsigned)config.sprites.size());
    }
}

void DisplayManager::logHeap() const {
    Serial.printf("[%s] Heap free %u, largest block %u\n",
                  TAG, (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());
}

// Same displays, new groups/sprites: keep the drivers (no bus or panel re-init,
// no flicker) and keep each display on the group it was showing if it still exists.
void DisplayManager::applyContent(const NodeConfig& config) {
    decodeSprites(config);
    for (size_t i = 0; i < _slots.size(); i++) {
        DisplaySlot& slot = _slots[i];
        String current = slot.engine.currentGroupId();
        configureEngine(slot, config.displays[i], config);
        if (!_screenSaverActive && !current.isEmpty() && current != slot.engine.currentGroupId()
            && config.library_groups.count(current))
            slot.engine.switchToGroup(current);
        slot.lastRenderedFrame = nullptr;
        if (_screenSaverActive) slot.driver->powerSave(false);
    }
}

void DisplayManager::configureEngine(DisplaySlot& slot, const DisplaySlotConfig& dispConfig,
                                     const NodeConfig& config) {
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

    String defaultGroup = dispConfig.default_group;
    if (defaultGroup.isEmpty() && !usedGroups.empty()) {
        defaultGroup = usedGroups.begin()->first;
    }

    slot.engine.configure(usedGroups, defaultGroup, dispConfig.triggers);

    Serial.printf("[%s] Display '%s': %s %dx%d, %u groups\n",
                  TAG, slot.id.c_str(),
                  dispConfig.driver_type.c_str(),
                  dispConfig.width, dispConfig.height,
                  (unsigned)usedGroups.size());
}

bool DisplayManager::applyConfig(const NodeConfig& config) {
    Serial.printf("[%s] Applying config version %u...\n", TAG, config.config_version);

    if (sameHardware(config)) {
        Serial.printf("[%s] Displays unchanged — updating content only\n", TAG);
        applyContent(config);
        _configVersion = config.config_version;
        _lastActivity = millis();
        _screenSaverActive = false;
        logHeap();
        return true;
    }

    cleanup();
    decodeSprites(config);

    // Initialize display buses from config before creating drivers
    int8_t i2cSda = -1, i2cScl = -1;
    int8_t spiMosi = -1, spiMiso = -1, spiSclk = -1;
    for (const auto& dispConfig : config.displays) {
        JsonDocument busDoc;
        if (!dispConfig.rawBusJson.isEmpty()) {
            deserializeJson(busDoc, dispConfig.rawBusJson);
        }
        JsonObject busObj = busDoc.as<JsonObject>();

        if (dispConfig.bus.type == "i2c") {
            int8_t sda = DEFAULT_I2C_SDA, scl = DEFAULT_I2C_SCL;
            if (busObj["sda"].is<int>()) sda = busObj["sda"].as<int>();
            if (busObj["scl"].is<int>()) scl = busObj["scl"].as<int>();
            if (i2cSda < 0) {
                i2cSda = sda;
                i2cScl = scl;
            } else if (sda != i2cSda || scl != i2cScl) {
                Serial.printf("[%s] Warning: I2C display '%s' uses different pins (%d/%d) than first (%d/%d)\n",
                              TAG, dispConfig.id.c_str(), sda, scl, i2cSda, i2cScl);
            }
        } else if (dispConfig.bus.type == "spi" && !driverOwnsBus(dispConfig.driver_type)) {
            int8_t mosi = DEFAULT_SPI_MOSI, miso = DEFAULT_SPI_MISO, sclk = DEFAULT_SPI_SCLK;
            if (busObj["mosi"].is<int>()) mosi = busObj["mosi"].as<int>();
            if (busObj["miso"].is<int>()) miso = busObj["miso"].as<int>();
            if (busObj["sclk"].is<int>()) sclk = busObj["sclk"].as<int>();
            if (spiMosi < 0) {
                spiMosi = mosi;
                spiMiso = miso;
                spiSclk = sclk;
            } else if (mosi != spiMosi || miso != spiMiso || sclk != spiSclk) {
                Serial.printf("[%s] Warning: SPI display '%s' uses different pins than first\n",
                              TAG, dispConfig.id.c_str());
            }
        }
    }

    if (i2cSda >= 0) {
        Wire.begin(i2cSda, i2cScl);
        Serial.printf("[%s] I2C: pins %d/%d\n", TAG, i2cSda, i2cScl);
    }
    if (spiMosi >= 0) {
        SPI.begin(spiSclk, spiMiso, spiMosi);
        Serial.printf("[%s] SPI: pins MOSI:%d MISO:%d SCLK:%d\n", TAG, spiMosi, spiMiso, spiSclk);
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

        slot.hardwareKey = hardwareKey(dispConfig);
        configureEngine(slot, dispConfig, config);
        _slots.push_back(slot);
    }

    _configVersion = config.config_version;
    _lastActivity = millis();
    _screenSaverActive = false;

    bool ok = !_slots.empty();
    Serial.printf("[%s] Config applied: %u displays, %u sprites (%s)\n",
                  TAG, (unsigned)_slots.size(), (unsigned)_sprites.size(),
                  ok ? "OK" : "NO DISPLAYS");
    logHeap();
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
        if (!frame) continue;

        // Redraw on a new frame, or when a value this frame shows reads differently
        // (a single-frame face would otherwise never update its data values)
        bool redraw = frame != slot.lastRenderedFrame;
        uint32_t version = _printerState.version();
        std::vector<String> values;
        if (redraw || version != slot.stateVersion) {
            slot.stateVersion = version;
            values = dataValues(*frame);
            redraw = redraw || values != slot.lastValues;
        }

        if (redraw) {
            for (uint8_t band = 0; band < slot.driver->bandCount(); band++) {
                slot.driver->beginBand(band);
                renderFrame(*frame, *slot.driver, &_sprites, &_printerState);
                slot.driver->show();
            }
            slot.lastRenderedFrame = frame;
            slot.lastValues = std::move(values);
        }
    }
}

std::vector<String> DisplayManager::dataValues(const Frame& frame) const {
    std::vector<String> values;
    for (const auto& element : frame.elements) {
        if (element.type == FrameElement::DataValue) {
            values.push_back(_printerState.resolve(element.value));
        }
    }
    return values;
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
