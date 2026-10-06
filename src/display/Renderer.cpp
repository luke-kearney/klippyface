#include "display/Renderer.h"

static const char* TAG = "RENDER";

static void renderTextElement(const FrameElement& element, DisplayDriver& display) {
    const char* text = element.value.c_str();
    size_t len = strlen(text);

    // GFX 5x7 font: 6x8 cells, scaled by the element size
    int16_t textW = (int16_t)(len * 6 * element.size);
    int16_t textH = 8 * element.size;

    int16_t cx = element.x - textW / 2;
    int16_t cy = element.y - textH / 2;

    display.setTextColor(element.color);
    display.setTextSize(element.size);
    display.setCursor(cx, cy);
    display.print(text);
}

static void renderDataValueElement(const FrameElement& element, DisplayDriver& display,
                                    const PrinterState* state) {
    if (!state) {
        Serial.printf("[%s] No PrinterState for DataValue '%s'\n",
                      TAG, element.value.c_str());
        return;
    }

    String resolved = state->resolve(element.value);
    const char* text = resolved.c_str();
    size_t len = strlen(text);

    int16_t textW = (int16_t)(len * 6 * element.size);
    int16_t textH = 8 * element.size;

    int16_t cx = element.x - textW / 2;
    int16_t cy = element.y - textH / 2;

    display.setTextColor(element.color);
    display.setTextSize(element.size);
    display.setCursor(cx, cy);
    display.print(text);
}

static void renderSpriteElement(const FrameElement& element, DisplayDriver& display,
                                 const std::map<String, Sprite>* sprites) {
    if (!sprites) {
        Serial.printf("[%s] No sprite map available for '%s'\n",
                      TAG, element.value.c_str());
        return;
    }

    auto it = sprites->find(element.value);
    if (it == sprites->end()) {
        Serial.printf("[%s] Sprite '%s' not found\n",
                      TAG, element.value.c_str());
        return;
    }

    const Sprite& sprite = it->second;
    size_t stride = (sprite.width + 7) / 8;
    bool oneBit = sprite.byteSize() == stride * sprite.height;
    if (element.size > 1 && oneBit) {
        // 1-bit rows, MSB = leftmost pixel; each lit pixel becomes a size x size block
        const uint8_t* data = sprite.rawData();
        int16_t s = element.size;
        for (int16_t py = 0; py < sprite.height; py++) {
            for (int16_t px = 0; px < sprite.width; px++) {
                if (data[py * stride + px / 8] & (0x80 >> (px % 8)))
                    display.fillRect(element.x + px * s, element.y + py * s, s, s, element.color);
            }
        }
        return;
    }
    display.drawBitmap(element.x, element.y,
                       sprite.rawData(), sprite.byteSize(),
                       sprite.width, sprite.height,
                       element.color);
}

void renderFrame(const Frame& frame, DisplayDriver& display,
                 const std::map<String, Sprite>* sprites,
                 const PrinterState* state) {
    display.clear(frame.bg_color);

    for (const auto& element : frame.elements) {
        switch (element.type) {
            case FrameElement::Text:
                renderTextElement(element, display);
                break;

            case FrameElement::Sprite:
                renderSpriteElement(element, display, sprites);
                break;

            case FrameElement::DataValue:
                renderDataValueElement(element, display, state);
                break;
        }
    }
}
