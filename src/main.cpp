#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include "config/Settings.h"
#include "wifi/WifiManager.h"
#include "display/DisplayManager.h"
#include "comms/MoonrakerClient.h"
#include "comms/GcodeHandler.h"
#include "wifi/CaptivePortal.h"

// -------------------------------------------------------------------
// Global instances
// -------------------------------------------------------------------
WifiManager wifiManager;
DisplayManager displayManager;
MoonrakerClient moonrakerClient;
GcodeHandler gcodeHandler;

// -------------------------------------------------------------------
// Task handles
// -------------------------------------------------------------------
TaskHandle_t wifiTaskHandle = nullptr;
TaskHandle_t displayTaskHandle = nullptr;
TaskHandle_t moonrakerTaskHandle = nullptr;
TaskHandle_t gcodeHandlerTaskHandle = nullptr;
TaskHandle_t captivePortalTaskHandle = nullptr;

// -------------------------------------------------------------------
// Inter-task queues
// -------------------------------------------------------------------
QueueHandle_t stateQueue = nullptr;
QueueHandle_t gcodeQueue = nullptr;

// -------------------------------------------------------------------
// WiFi Task (Core 0)
// -------------------------------------------------------------------
void wifiTask(void *pvParameters) {
    String ssid = Settings::getWifiSsid();
    String pass = Settings::getWifiPassword();

    if (ssid.length() > 0) {
        wifiManager.begin(ssid, pass);
    } else {
        Serial.println("[WIFI] No credentials saved — skipping WiFi");
    }

    for (;;) {
        wifiManager.tick();
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

// -------------------------------------------------------------------
// Moonraker Task (Core 0) — WebSocket I/O + state dispatch
// -------------------------------------------------------------------
void moonrakerTask(void *pvParameters) {
    // Wait for WiFi before connecting to Moonraker
    wifiManager.waitForConnection();

    String host = Settings::getMoonrakerHost();
    uint16_t port = Settings::getMoonrakerPort();
    moonrakerClient.setStateQueue(stateQueue);
    moonrakerClient.setGcodeQueue(gcodeQueue);
    moonrakerClient.begin(host, port);

    enum ConnMonitor : uint8_t {
        CONN_ONLINE,
        CONN_WIFI_OFFLINE,
        CONN_MOONRAKER_OFFLINE
    };
    ConnMonitor lastConn = CONN_ONLINE;

    StateEvent event;
    for (;;) {
        moonrakerClient.tick();

        while (xQueueReceive(stateQueue, &event, 0) == pdTRUE) {
            Serial.printf("[MAIN] State: %s (progress: %.1f%%)\n",
                          event.trigger, event.progress);
            displayManager.updateState(event);
            if (event.trigger[0] != '\0') {
                displayManager.onStateChange(String(event.trigger));
            }
        }

        // Connection state monitor — priority: WiFi > Moonraker > Online
        bool wifiOk = WiFi.isConnected();
        bool mrOk = moonrakerClient.isConnected();

        ConnMonitor newConn;
        if (!wifiOk)                     newConn = CONN_WIFI_OFFLINE;
        else if (!mrOk)                  newConn = CONN_MOONRAKER_OFFLINE;
        else                             newConn = CONN_ONLINE;

        if (newConn != lastConn) {
            lastConn = newConn;
            switch (newConn) {
                case CONN_WIFI_OFFLINE:
                    Serial.println("[MAIN] Connection: WIFI_OFFLINE");
                    displayManager.setMoonrakerConnected(false);
                    displayManager.onStateChange("wifi:disconnected");
                    break;
                case CONN_MOONRAKER_OFFLINE:
                    Serial.println("[MAIN] Connection: MOONRAKER_OFFLINE");
                    displayManager.setMoonrakerConnected(false);
                    displayManager.onStateChange("moonraker:disconnected");
                    break;
                case CONN_ONLINE:
                    Serial.println("[MAIN] Connection: ONLINE");
                    displayManager.setMoonrakerConnected(true);
                    break;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// -------------------------------------------------------------------
// GCODE Handler Task (Core 0) — parse display:... commands
// -------------------------------------------------------------------
void gcodeHandlerTask(void *pvParameters) {
    GcodeMessage rawMsg;
    DisplayCommand cmd;

    for (;;) {
        if (xQueueReceive(gcodeQueue, &rawMsg, portMAX_DELAY) == pdTRUE) {
            String msg(rawMsg.text);

            if (gcodeHandler.parseDisplayCommand(msg, cmd)) {
                if (!cmd.group.isEmpty()) {
                    displayManager.directCommand(cmd.group, cmd.set, cmd.loop);
                }
            }
        }
    }
}

// -------------------------------------------------------------------
// Captive Portal Task (Core 0) — only active when not provisioned
// -------------------------------------------------------------------
void captivePortalTask(void *pvParameters) {
    CaptivePortal portal;
    if (!portal.begin()) {
        Serial.println("[PORTAL] Failed to start — rebooting");
        vTaskDelay(pdMS_TO_TICKS(1000));
        ESP.restart();
    }

    for (;;) {
        portal.tick();
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// -------------------------------------------------------------------
// Display Task (Core 1) — ~30fps tick
// -------------------------------------------------------------------
void displayTask(void *pvParameters) {
    TickType_t lastWake = xTaskGetTickCount();
    for (;;) {
        displayManager.tickAll(millis());
        vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(33));
    }
}

// -------------------------------------------------------------------
// Setup
// -------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println();
    Serial.println("[BOOT] Klippyface Display System v0.2");
    Serial.printf("[BOOT] ESP32 chip rev %d, %d cores, %d MB flash\n",
                  ESP.getChipRevision(),
                  ESP.getChipCores(),
                  ESP.getFlashChipSize() / (1024 * 1024));

    Settings::begin();

    // Factory reset: hold GPIO0 (BOOT button) for 3s after boot
    pinMode(0, INPUT_PULLUP);
    if (digitalRead(0) == LOW) {
        Serial.println("[BOOT] GPIO0 held — hold 3s for factory reset or release to continue");
        unsigned long pressStart = millis();
        while (digitalRead(0) == LOW) {
            if (millis() - pressStart > 3000) {
                Serial.println("[BOOT] GPIO0 held 3s — factory reset");
                Settings::clear();
                ESP.restart();
            }
            delay(10);
        }
        Serial.println("[BOOT] GPIO0 released — continuing normal boot");
    }

    // Provisioning check: if not configured, start captive portal
    if (!Settings::isProvisioned()) {
        Serial.println("[BOOT] Not provisioned — starting captive portal");
        xTaskCreatePinnedToCore(
            captivePortalTask, "captivePortalTask", 4096, nullptr, 5,
            &captivePortalTaskHandle, 0);
        return;
    }

    // Create inter-task queues
    stateQueue = xQueueCreate(5, sizeof(StateEvent));
    gcodeQueue = xQueueCreate(5, sizeof(GcodeMessage));

    Wire.begin(21, 22);
    Serial.println("[BOOT] I2C: pins 21/22");

    displayManager.begin();

    xTaskCreatePinnedToCore(
        wifiTask, "wifiTask", 4096, nullptr, 8, &wifiTaskHandle, 0);

    xTaskCreatePinnedToCore(
        moonrakerTask, "moonrakerTask", 8192, nullptr, 9, &moonrakerTaskHandle, 0);

    xTaskCreatePinnedToCore(
        gcodeHandlerTask, "gcodeHandlerTask", 4096, nullptr, 7, &gcodeHandlerTaskHandle, 0);

    xTaskCreatePinnedToCore(
        displayTask, "displayTask", 8192, nullptr, 10, &displayTaskHandle, 1);
}

// -------------------------------------------------------------------
// Loop — unused (FreeRTOS owns the cores)
// -------------------------------------------------------------------
void loop() {
    vTaskDelay(portMAX_DELAY);
}
