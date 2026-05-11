#include "display/DisplayManager.h"
#include "display/Renderer.h"
#include "display/Sh1106Driver.h"
#include "comms/MoonrakerClient.h"

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
    // Idle group — alternates between "printer idle" and system info
    FrameElement statusEl;
    statusEl.type = FrameElement::Text;
    statusEl.value = "printer idle";
    statusEl.x = 64;
    statusEl.y = 24;

    FrameElement mrStatus;
    mrStatus.type = FrameElement::DataValue;
    mrStatus.value = "moonraker.connected";
    mrStatus.x = 64;
    mrStatus.y = 48;

    Frame statusFrame;
    statusFrame.duration_ms = 3000;
    statusFrame.elements.push_back(statusEl);
    statusFrame.elements.push_back(mrStatus);

    FrameElement infoLine1;
    infoLine1.type = FrameElement::Text;
    infoLine1.value = "Klippyface v0.2";
    infoLine1.x = 64;
    infoLine1.y = 12;

    FrameElement infoLine2;
    infoLine2.type = FrameElement::Text;
    infoLine2.value = "Built: 2026-05-11";
    infoLine2.x = 64;
    infoLine2.y = 30;

    FrameElement infoLine3;
    infoLine3.type = FrameElement::Text;
    infoLine3.value = "ESP32 Dev Board";
    infoLine3.x = 64;
    infoLine3.y = 48;

    Frame infoFrame;
    infoFrame.duration_ms = 3000;
    infoFrame.elements.push_back(infoLine1);
    infoFrame.elements.push_back(infoLine2);
    infoFrame.elements.push_back(infoLine3);

    Set idleSet;
    idleSet.id = "sleepy";
    idleSet.label = "Sleepy";
    idleSet.loop_forever = true;
    idleSet.frames.push_back(statusFrame);
    idleSet.frames.push_back(infoFrame);

    Group idleGroup;
    idleGroup.id = "idle_faces";
    idleGroup.label = "Idle Faces";
    idleGroup.sets.push_back(idleSet);

    // Printing group — face + live progress + temperature
    FrameElement printFaceA;
    printFaceA.type = FrameElement::Text;
    printFaceA.value = ":-D";
    printFaceA.x = 64;
    printFaceA.y = 18;

    FrameElement printProgressA;
    printProgressA.type = FrameElement::DataValue;
    printProgressA.value = "print_stats.progress";
    printProgressA.x = 64;
    printProgressA.y = 38;

    FrameElement printTempA;
    printTempA.type = FrameElement::DataValue;
    printTempA.value = "extruder.temperature";
    printTempA.x = 64;
    printTempA.y = 54;

    Frame printA;
    printA.duration_ms = 600;
    printA.elements.push_back(printFaceA);
    printA.elements.push_back(printProgressA);
    printA.elements.push_back(printTempA);

    FrameElement printFaceB;
    printFaceB.type = FrameElement::Text;
    printFaceB.value = "8-D";
    printFaceB.x = 64;
    printFaceB.y = 18;

    FrameElement printProgressB;
    printProgressB.type = FrameElement::DataValue;
    printProgressB.value = "print_stats.progress";
    printProgressB.x = 64;
    printProgressB.y = 38;

    FrameElement printTempB;
    printTempB.type = FrameElement::DataValue;
    printTempB.value = "extruder.temperature";
    printTempB.x = 64;
    printTempB.y = 54;

    Frame printB;
    printB.duration_ms = 600;
    printB.elements.push_back(printFaceB);
    printB.elements.push_back(printProgressB);
    printB.elements.push_back(printTempB);

    Set printSet;
    printSet.id = "excited";
    printSet.label = "Excited";
    printSet.loop_forever = true;
    printSet.frames.push_back(printA);
    printSet.frames.push_back(printB);

    Group printGroup;
    printGroup.id = "printing_faces";
    printGroup.label = "Printing Faces";
    printGroup.sets.push_back(printSet);

    // Celebration group — single text face
    FrameElement celebEl;
    celebEl.type = FrameElement::Text;
    celebEl.value = "\\o/";
    celebEl.x = 64;
    celebEl.y = 32;

    Frame celebFrame;
    celebFrame.duration_ms = 500;
    celebFrame.elements.push_back(celebEl);

    Set celebSet;
    celebSet.id = "party";
    celebSet.label = "Party";
    celebSet.loop_count = 5;
    celebSet.frames.push_back(celebFrame);

    Group celebGroup;
    celebGroup.id = "celebration_faces";
    celebGroup.label = "Celebration Faces";
    celebGroup.sets.push_back(celebSet);

    // WiFi offline group
    FrameElement wifiLine1;
    wifiLine1.type = FrameElement::Text;
    wifiLine1.value = "WiFi Offline";
    wifiLine1.x = 64;
    wifiLine1.y = 24;

    FrameElement wifiLine2;
    wifiLine2.type = FrameElement::Text;
    wifiLine2.value = "Check network";
    wifiLine2.x = 64;
    wifiLine2.y = 44;

    Frame wifiFrame;
    wifiFrame.duration_ms = 2000;
    wifiFrame.elements.push_back(wifiLine1);
    wifiFrame.elements.push_back(wifiLine2);

    Set wifiSet;
    wifiSet.id = "default";
    wifiSet.loop_forever = true;
    wifiSet.frames.push_back(wifiFrame);

    Group wifiOfflineGroup;
    wifiOfflineGroup.id = "wifi_offline";
    wifiOfflineGroup.label = "WiFi Offline";
    wifiOfflineGroup.sets.push_back(wifiSet);

    // Moonraker offline group
    FrameElement mrLine1;
    mrLine1.type = FrameElement::Text;
    mrLine1.value = "Moonraker Down";
    mrLine1.x = 64;
    mrLine1.y = 24;

    FrameElement mrLine2;
    mrLine2.type = FrameElement::Text;
    mrLine2.value = "Reconnecting...";
    mrLine2.x = 64;
    mrLine2.y = 44;

    Frame mrFrame;
    mrFrame.duration_ms = 2000;
    mrFrame.elements.push_back(mrLine1);
    mrFrame.elements.push_back(mrLine2);

    Set mrSet;
    mrSet.id = "default";
    mrSet.loop_forever = true;
    mrSet.frames.push_back(mrFrame);

    Group mrOfflineGroup;
    mrOfflineGroup.id = "moonraker_offline";
    mrOfflineGroup.label = "Moonraker Offline";
    mrOfflineGroup.sets.push_back(mrSet);

    // Screen sleep group — blank frame, no elements
    Frame sleepFrame;
    sleepFrame.duration_ms = 1000;

    Set sleepSet;
    sleepSet.id = "default";
    sleepSet.loop_forever = true;
    sleepSet.frames.push_back(sleepFrame);

    Group sleepGroup;
    sleepGroup.id = "screen_sleep";
    sleepGroup.label = "Screen Sleep";
    sleepGroup.sets.push_back(sleepSet);

    DisplayDriver* driver = new Sh1106Driver(128, 64, 0x3C, 0);
    if (!driver->init()) {
        Serial.printf("[%s] Hardcoded SH1106 init failed\n", TAG);
        delete driver;
        return;
    }

    std::map<String, Group> groups;
    groups[idleGroup.id] = idleGroup;
    groups[printGroup.id] = printGroup;
    groups[celebGroup.id] = celebGroup;
    groups[wifiOfflineGroup.id] = wifiOfflineGroup;
    groups[mrOfflineGroup.id] = mrOfflineGroup;
    groups[sleepGroup.id] = sleepGroup;

    std::map<String, String> triggers;
    triggers["state:idle"] = "idle_faces";
    triggers["state:printing"] = "printing_faces";
    triggers["state:complete"] = "celebration_faces";
    triggers["state:error"] = "idle_faces";
    triggers["state:paused"] = "idle_faces";
    triggers["wifi:disconnected"] = "wifi_offline";
    triggers["moonraker:disconnected"] = "moonraker_offline";

    DisplaySlot slot;
    slot.id = "face_oled";
    slot.driver = driver;
    slot.engine.configure(groups, "idle_faces", triggers);
    _slots.push_back(slot);

    Serial.printf("[%s] Hardcoded config: 1 display, %u groups (%u triggers)\n",
                  TAG, (unsigned)groups.size(), (unsigned)triggers.size());
}

bool DisplayManager::begin() {
    cleanup();
    _cmdQueue = xQueueCreate(10, sizeof(CmdMessage));
    if (!_cmdQueue) {
        Serial.printf("[%s] Failed to create command queue\n", TAG);
    }
    buildHardcodedConfig();
    _lastActivity = millis();
    _screenSaverActive = false;
    return !_slots.empty();
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
        if (frame) {
            renderFrame(*frame, *slot.driver, &_sprites, &_printerState);
            slot.driver->show();
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
