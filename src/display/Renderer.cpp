#include "display/Renderer.h"

static const char* TAG = "RENDER";

static void renderText(const Frame& frame, DisplayDriver& display) {
    display.clear(frame.bg_color);

    const char* text = frame.value.c_str();
    size_t len = strlen(text);

    // Default Adafruit 5x7 font at size 1: ~6px wide, ~8px tall per char
    int16_t textW = (int16_t)(len * 6);
    int16_t textH = 8;

    // Center on (x_offset, y_offset)
    int16_t cx = frame.x_offset - textW / 2;
    int16_t cy = frame.y_offset - textH / 2;

    display.setTextColor(frame.color);
    display.setTextSize(1);
    display.setCursor(cx, cy);
    display.print(text);
}

static void renderSprite(const Frame& frame, DisplayDriver& display,
                         const std::map<String, Sprite>* sprites) {
    display.clear(frame.bg_color);

    if (!sprites) {
        Serial.printf("[%s] No sprite map available for '%s'\n",
                      TAG, frame.value.c_str());
        return;
    }

    auto it = sprites->find(frame.value);
    if (it == sprites->end()) {
        Serial.printf("[%s] Sprite '%s' not found\n",
                      TAG, frame.value.c_str());
        return;
    }

    const Sprite& sprite = it->second;
    display.drawBitmap(frame.x_offset, frame.y_offset,
                       sprite.rawData(), sprite.width, sprite.height,
                       frame.color);
}

void renderFrame(const Frame& frame, DisplayDriver& display,
                 const std::map<String, Sprite>* sprites) {
    switch (frame.type) {
        case FrameType::Clear:
            display.clear(frame.bg_color);
            break;

        case FrameType::Text:
            renderText(frame, display);
            break;

        case FrameType::Sprite:
            renderSprite(frame, display, sprites);
            break;

        case FrameType::Progress:
        case FrameType::Temp:
            Serial.printf("[%s] Skipped %s frame (not yet implemented)\n",
                          TAG, frameTypeToString(frame.type));
            break;
    }
}
