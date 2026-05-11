#ifndef KLIPPYFACE_ANIMATION_ENGINE_H
#define KLIPPYFACE_ANIMATION_ENGINE_H

#include <Arduino.h>
#include <stdint.h>
#include <map>
#include "engine/Config.h"

class AnimationEngine {
public:
    AnimationEngine();

    void configure(
        const std::map<String, Group>& groups,
        const String& defaultGroupId,
        const std::map<String, String>& triggers);

    bool onTrigger(const String& trigger);
    void switchToGroup(const String& groupId);
    const Frame* tick(uint32_t now);
    void resetToDefault();

    const String& currentGroupId() const { return _currentGroupId; }
    const String& currentSetId() const { return _currentSetId; }
    size_t currentFrameIndex() const { return _frameIndex; }
    bool isConfigured() const { return _configured; }

private:
    bool _configured = false;
    std::map<String, Group> _groups;
    std::map<String, String> _triggers;
    String _defaultGroupId;

    String _currentGroupId;
    String _currentSetId;
    size_t _frameIndex = 0;
    uint32_t _lastFrameTime = 0;
    int32_t _loopCountRemaining = 1;

    void startGroup(const String& groupId);
    void advanceFrame();
    uint32_t currentFrameDuration() const;
    const Group* findGroup(const String& groupId) const;
    const Set* findCurrentSet() const;
};

#endif
