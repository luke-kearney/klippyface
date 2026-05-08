#include <Arduino.h>
#include <WiFi.h>
#include "config/Settings.h"
#include "wifi/WifiManager.h"
#include "display/Sh1106Driver.h"

// -------------------------------------------------------------------
// Global instances
// -------------------------------------------------------------------
WifiManager wifiManager;
Sh1106Driver* display = nullptr;

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
    uint32_t counter = 0;

    for (;;) {
        if (!display) {
            vTaskDelay(pdMS_TO_TICKS(500));
            continue;
        }

        display->clear();
        display->setTextSize(2);
        display->setTextColor(1);
        display->setCursor(10, 0);
        display->print("Hello!");
        display->setCursor(10, 20);
        display->setTextSize(1);
        display->print("Klippyface");
        display->setCursor(10, 40);
        display->print("Count: ");
        display->print(String(counter).c_str());
        counter++;
        display->show();

        vTaskDelay(pdMS_TO_TICKS(1000));
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

    // Init persistent settings (NVS)
    Settings::begin();

    // TEMP: Hardware test — init OLED directly (remove when DisplayManager is built)
    display = new Sh1106Driver(128, 64, 0x3C, 0);
    if (display->init()) {
        Serial.println("[TEST] OLED init OK");
    } else {
        Serial.println("[TEST] OLED init FAILED — check wiring and address (0x3C or 0x3D?)");
    }

    // Create tasks
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
