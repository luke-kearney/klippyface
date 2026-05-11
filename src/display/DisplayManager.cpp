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
    Frame idleFrame;
    idleFrame.type = FrameType::Text;
    idleFrame.value = "(-_-) zzz";
    idleFrame.x_offset = 64;
    idleFrame.y_offset = 32;
    idleFrame.duration_ms = 3000;

    Set idleSet;
    idleSet.id = "sleepy";
    idleSet.label = "Sleepy";
    idleSet.loop_forever = true;
    idleSet.frames.push_back(idleFrame);

    Group idleGroup;
    idleGroup.id = "idle_faces";
    idleGroup.label = "Idle Faces";
    idleGroup.sets.push_back(idleSet);

    Frame printA;
    printA.type = FrameType::Text;
    printA.value = ":-D";
    printA.x_offset = 64;
    printA.y_offset = 32;
    printA.duration_ms = 600;

    Frame printB;
    printB.type = FrameType::Text;
    printB.value = "8-D";
    printB.x_offset = 64;
    printB.y_offset = 32;
    printB.duration_ms = 600;

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

    Frame celebFrame;
    celebFrame.type = FrameType::Text;
    celebFrame.value = "\\o/";
    celebFrame.x_offset = 64;
    celebFrame.y_offset = 32;
    celebFrame.duration_ms = 500;

    Set celebSet;
    celebSet.id = "party";
    celebSet.label = "Party";
    celebSet.loop_count = 5;
    celebSet.frames.push_back(celebFrame);

    Group celebGroup;
    celebGroup.id = "celebration_faces";
    celebGroup.label = "Celebration Faces";
    celebGroup.sets.push_back(celebSet);

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

    std::map<String, String> triggers;
    triggers["state:idle"] = "idle_faces";
    triggers["state:printing"] = "printing_faces";
    triggers["state:complete"] = "celebration_faces";
    triggers["state:error"] = "idle_faces";
    triggers["state:paused"] = "idle_faces";

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
    return !_slots.empty();
}

void DisplayManager::tickAll(uint32_t now) {
    if (_cmdQueue) {
        CmdMessage cmd;
        while (xQueueReceive(_cmdQueue, &cmd, 0) == pdTRUE) {
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
        }
    }

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
