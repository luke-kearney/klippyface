#ifndef KLIPPYFACE_CONFIG_DESERIALIZER_H
#define KLIPPYFACE_CONFIG_DESERIALIZER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "engine/Config.h"

class ConfigDeserializer {
public:
    static bool deserialize(const String& json, NodeConfig& outConfig);

private:
    static void parseDisplay(JsonObject& dispJson, DisplaySlotConfig& outSlot);
    static void parseBusConfig(JsonObject& busJson, DisplayBusConfig& outBus);
    static void parseGroup(JsonObject& groupJson, Group& outGroup, const String& groupId);
    static void parseSet(JsonObject& setJson, Set& outSet);
    static void parseFrame(JsonObject& frameJson, Frame& outFrame);
    static void parseElement(JsonObject& elJson, FrameElement& outEl);
    static void parseSprite(JsonObject& spriteJson, SpriteInfo& outSprite, const String& spriteId);
};

#endif
