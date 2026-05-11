#include "engine/AnimationEngine.h"

static const char* TAG = "ENGINE";

AnimationEngine::AnimationEngine() {}

void AnimationEngine::configure(
    const std::map<String, Group>& groups,
    const String& defaultGroupId,
    const std::map<String, String>& triggers)
{
    _groups = groups;
    _defaultGroupId = defaultGroupId;
    _triggers = triggers;
    _configured = true;

    startGroup(_defaultGroupId);
}

const Group* AnimationEngine::findGroup(const String& groupId) const {
    auto it = _groups.find(groupId);
    if (it != _groups.end()) {
        return &it->second;
    }
    return nullptr;
}

const Set* AnimationEngine::findCurrentSet() const {
    const Group* group = findGroup(_currentGroupId);
    if (!group) return nullptr;

    for (const auto& set : group->sets) {
        if (set.id == _currentSetId) {
            return &set;
        }
    }
    return nullptr;
}

uint32_t AnimationEngine::currentFrameDuration() const {
    const Set* set = findCurrentSet();
    if (!set) return 1000;

    if (set->frame_time > 0) {
        return set->frame_time;
    }

    if (_frameIndex < set->frames.size()) {
        return set->frames[_frameIndex].duration_ms;
    }

    return 1000;
}

void AnimationEngine::startGroup(const String& groupId) {
    _currentGroupId = groupId;
    _frameIndex = 0;
    _lastFrameTime = 0;
    _loopCountRemaining = 1;

    const Group* group = findGroup(groupId);
    if (!group) {
        Serial.printf("[%s] Group not found: %s\n", TAG, groupId.c_str());
        _currentSetId = "";
        return;
    }

    if (group->sets.empty()) {
        Serial.printf("[%s] Group '%s' has no sets\n", TAG, groupId.c_str());
        _currentSetId = "";
        return;
    }

    _currentSetId = group->sets[0].id;
    const Set* set = findCurrentSet();
    if (set) {
        _loopCountRemaining = set->loop_forever ? 0 : set->loop_count;
    }

    Serial.printf("[%s] Started group: %s, set: %s, frames: %u, loop: %s\n",
                  TAG, groupId.c_str(), _currentSetId.c_str(),
                  (unsigned)group->sets[0].frames.size(),
                  set && (set->loop_forever || _loopCountRemaining == 0) ? "forever" : String(_loopCountRemaining).c_str());
}

bool AnimationEngine::onTrigger(const String& trigger) {
    if (!_configured) return false;

    auto it = _triggers.find(trigger);
    if (it == _triggers.end()) return false;

    const String& targetGroup = it->second;
    if (targetGroup.isEmpty()) return false;
    if (targetGroup == _currentGroupId) return false;

    Serial.printf("[%s] Trigger: %s → group: %s\n", TAG, trigger.c_str(), targetGroup.c_str());
    startGroup(targetGroup);
    return true;
}

void AnimationEngine::switchToGroup(const String& groupId) {
    if (!_configured) return;
    if (groupId.isEmpty() || groupId == _currentGroupId) return;

    if (!findGroup(groupId)) {
        Serial.printf("[%s] Cannot switch to unknown group: %s\n", TAG, groupId.c_str());
        return;
    }

    Serial.printf("[%s] Switch to group: %s\n", TAG, groupId.c_str());
    startGroup(groupId);
}

void AnimationEngine::resetToDefault() {
    if (!_configured) return;
    startGroup(_defaultGroupId);
}

const Frame* AnimationEngine::tick(uint32_t now) {
    if (!_configured) return nullptr;

    const Set* set = findCurrentSet();
    if (!set || set->frames.empty()) {
        return nullptr;
    }

    if (_lastFrameTime == 0) {
        _lastFrameTime = now;
        return &set->frames[0];
    }

    uint32_t elapsed = now - _lastFrameTime;
    if (elapsed >= currentFrameDuration()) {
        _lastFrameTime = now;
        advanceFrame();

        set = findCurrentSet();
        if (!set || _frameIndex >= set->frames.size()) {
            return nullptr;
        }
    }

    return &set->frames[_frameIndex];
}

void AnimationEngine::advanceFrame() {
    const Set* set = findCurrentSet();
    if (!set || set->frames.empty()) return;

    _frameIndex++;

    if (_frameIndex >= set->frames.size()) {
        if (set->loop_forever || _loopCountRemaining == 0) {
            _frameIndex = 0;
        } else if (_loopCountRemaining > 1) {
            _loopCountRemaining--;
            _frameIndex = 0;
        } else {
            _frameIndex = set->frames.size() - 1;
        }
    }
}
