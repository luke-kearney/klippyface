#include "ConfigDeserializer.h"

static const char* TAG = "CONFIG";

bool ConfigDeserializer::deserialize(char* json, NodeConfig& outConfig) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, json);

    if (error) {
        Serial.printf("[%s] JSON parse error: %s\n", TAG, error.c_str());
        return false;
    }

    JsonObject root = doc.as<JsonObject>();
    if (root.isNull()) {
        Serial.printf("[%s] Root is not an object\n", TAG);
        return false;
    }

    outConfig.config_version = root["config_version"] | 1;

    JsonObject nodeObj = root["node"];
    if (nodeObj.isNull()) {
        Serial.printf("[%s] Missing 'node' key\n", TAG);
        return false;
    }

    outConfig.node_id = nodeObj["id"] | "";
    outConfig.friendly_name = nodeObj["friendly_name"] | "";

    // Parse displays
    JsonArray displays = nodeObj["displays"];
    if (!displays.isNull()) {
        for (JsonVariant dispV : displays) {
            JsonObject dispJson = dispV.as<JsonObject>();
            if (dispJson.isNull()) continue;

            DisplaySlotConfig slot;
            parseDisplay(dispJson, slot);
            outConfig.displays.push_back(slot);
        }
    }

    // Parse assignments and merge into displays
    JsonArray assignments = nodeObj["assignments"];
    if (!assignments.isNull()) {
        for (JsonVariant assV : assignments) {
            JsonObject assJson = assV.as<JsonObject>();
            if (assJson.isNull()) continue;

            String displayId = assJson["display_id"] | "";
            String defaultGroup = assJson["default_group"] | "";

            // Find matching display and set its default group + triggers
            for (auto& slot : outConfig.displays) {
                if (slot.id == displayId) {
                    slot.default_group = defaultGroup;

                    JsonObject triggers = assJson["triggers"];
                    if (!triggers.isNull()) {
                        for (JsonPair kv : triggers) {
                            slot.triggers[String(kv.key().c_str())] = kv.value() | "";
                        }
                    }
                    break;
                }
            }
        }
    }

    // Parse library groups
    JsonObject libraryObj = root["library"];
    if (!libraryObj.isNull()) {
        JsonObject groupsObj = libraryObj["groups"];
        if (!groupsObj.isNull()) {
            for (JsonPair kv : groupsObj) {
                String groupId = String(kv.key().c_str());
                JsonObject groupJson = kv.value().as<JsonObject>();
                if (groupJson.isNull()) continue;

                Group group;
                parseGroup(groupJson, group, groupId);
                outConfig.library_groups[groupId] = group;
            }
        }

        // Parse library sprites
        JsonObject spritesObj = libraryObj["sprites"];
        if (!spritesObj.isNull()) {
            for (JsonPair kv : spritesObj) {
                String spriteId = String(kv.key().c_str());
                JsonObject spriteJson = kv.value().as<JsonObject>();
                if (spriteJson.isNull()) continue;

                SpriteInfo info;
                parseSprite(spriteJson, info, spriteId);
                outConfig.sprites[spriteId] = info;
            }
        }
    }

    Serial.printf("[%s] Parsed config: node=%s, %u displays, %u groups, %u sprites\n",
                  TAG,
                  outConfig.node_id.c_str(),
                  (unsigned)outConfig.displays.size(),
                  (unsigned)outConfig.library_groups.size(),
                  (unsigned)outConfig.sprites.size());

    return true;
}

void ConfigDeserializer::parseDisplay(JsonObject& dispJson, DisplaySlotConfig& outSlot) {
    outSlot.id = dispJson["id"] | "";
    outSlot.label = dispJson["label"] | "";
    outSlot.driver_type = dispJson["driver_type"] | "";
    outSlot.width = dispJson["width"] | 128;
    outSlot.height = dispJson["height"] | 64;
    outSlot.rotation = dispJson["rotation"] | 0;

    JsonObject busJson = dispJson["bus"];
    if (!busJson.isNull()) {
        parseBusConfig(busJson, outSlot.bus);

        // Serialize full bus JSON for drivers that need raw pin config
        JsonDocument rawDoc;
        rawDoc.set(busJson);
        outSlot.rawBusJson = rawDoc.as<String>();
    }

    Serial.printf("[%s]   Display: %s (%s, %dx%d)\n",
                  TAG, outSlot.id.c_str(), outSlot.driver_type.c_str(),
                  outSlot.width, outSlot.height);
}

void ConfigDeserializer::parseBusConfig(JsonObject& busJson, DisplayBusConfig& outBus) {
    outBus.type = busJson["type"] | "";
    outBus.address = busJson["address"] | "";
    outBus.cs = busJson["cs"] | -1;
    outBus.dc = busJson["dc"] | -1;
    outBus.rst = busJson["rst"] | -1;
}

void ConfigDeserializer::parseGroup(JsonObject& groupJson, Group& outGroup, const String& groupId) {
    outGroup.id = groupId;
    outGroup.label = groupJson["label"] | groupId;

    JsonArray sets = groupJson["sets"];
    if (!sets.isNull()) {
        for (JsonVariant setV : sets) {
            JsonObject setJson = setV.as<JsonObject>();
            if (setJson.isNull()) continue;

            Set set;
            parseSet(setJson, set);
            outGroup.sets.push_back(set);
        }
    }

    Serial.printf("[%s]   Group: %s (%u sets, %s)\n",
                  TAG, groupId.c_str(), (unsigned)outGroup.sets.size(),
                  outGroup.label.c_str());
}

void ConfigDeserializer::parseSet(JsonObject& setJson, Set& outSet) {
    outSet.id = setJson["id"] | "";
    outSet.label = setJson["label"] | outSet.id;
    outSet.frame_time = setJson["frame_time"] | 0;

    int loopCount = setJson["loop_count"] | 1;
    if (loopCount <= 0) {
        outSet.loop_forever = true;
        outSet.loop_count = 0;
    } else {
        outSet.loop_forever = false;
        outSet.loop_count = loopCount;
    }

    JsonArray frames = setJson["frames"];
    if (!frames.isNull()) {
        for (JsonVariant frameV : frames) {
            JsonObject frameJson = frameV.as<JsonObject>();
            if (frameJson.isNull()) continue;

            Frame frame;
            parseFrame(frameJson, frame);
            outSet.frames.push_back(frame);
        }
    }
}

void ConfigDeserializer::parseFrame(JsonObject& frameJson, Frame& outFrame) {
    outFrame.duration_ms = frameJson["duration_ms"] | 0;  // 0 = fall back to set frame_time

    String bgColorStr = frameJson["bg_color"] | "";
    if (bgColorStr.length() > 0) {
        outFrame.bg_color = hexColorToUint32(bgColorStr.c_str());
    } else {
        outFrame.bg_color = 0x000000;
    }

    JsonArray elements = frameJson["elements"];
    if (!elements.isNull()) {
        for (JsonVariant elV : elements) {
            JsonObject elJson = elV.as<JsonObject>();
            if (elJson.isNull()) continue;

            FrameElement el;
            parseElement(elJson, el);
            outFrame.elements.push_back(el);
        }
    }
}

void ConfigDeserializer::parseElement(JsonObject& elJson, FrameElement& outEl) {
    String typeStr = elJson["type"] | "";
    if (typeStr == "sprite") {
        outEl.type = FrameElement::Sprite;
    } else if (typeStr == "datavalue") {
        outEl.type = FrameElement::DataValue;
    } else {
        outEl.type = FrameElement::Text;
    }

    outEl.value = elJson["value"] | "";
    outEl.label = elJson["label"] | "";
    outEl.x = elJson["x"] | 0;
    outEl.y = elJson["y"] | 0;

    String colorStr = elJson["color"] | "";
    if (colorStr.length() > 0) {
        outEl.color = hexColorToUint32(colorStr.c_str());
    } else {
        outEl.color = 0xFFFFFF;
    }
}

void ConfigDeserializer::parseSprite(JsonObject& spriteJson, SpriteInfo& outSprite, const String& spriteId) {
    outSprite.width = spriteJson["width"] | 0;
    outSprite.height = spriteJson["height"] | 0;
    outSprite.data = spriteJson["data"] | "";

    Serial.printf("[%s]   Sprite: %s (%dx%d, %u bytes base64)\n",
                  TAG, spriteId.c_str(), outSprite.width, outSprite.height,
                  (unsigned)outSprite.data.length());
}
