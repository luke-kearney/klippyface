#include <Arduino.h>
#include <WiFi.h>
#include "config/Settings.h"
#include "wifi/WifiManager.h"

// -------------------------------------------------------------------
// Global instances
// -------------------------------------------------------------------
WifiManager wifiManager;

// -------------------------------------------------------------------
// Task handles
// -------------------------------------------------------------------
TaskHandle_t wifiTaskHandle = nullptr;
TaskHandle_t displayTaskHandle = nullptr;

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
// Display Task (Core 1)
// -------------------------------------------------------------------
void displayTask(void *pvParameters) {
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(33));
    }
}

// -------------------------------------------------------------------
// Setup
// -------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println();
    Serial.println("[BOOT] Klippyface Display System v0.1");
    Serial.printf("[BOOT] ESP32 chip rev %d, %d cores, %d MB flash\n",
                  ESP.getChipRevision(),
                  ESP.getChipCores(),
                  ESP.getFlashChipSize() / (1024 * 1024));

    Settings::begin();

    xTaskCreatePinnedToCore(
        wifiTask, "wifiTask", 4096, nullptr, 8, &wifiTaskHandle, 0);

    xTaskCreatePinnedToCore(
        displayTask, "displayTask", 8192, nullptr, 10, &displayTaskHandle, 1);
}

// -------------------------------------------------------------------
// Loop — unused (FreeRTOS owns the cores)
// -------------------------------------------------------------------
void loop() {
    vTaskDelay(portMAX_DELAY);
}
