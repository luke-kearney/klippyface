# Phase 1: Design Decisions

## 2026-05-09: Settings module — standalone class with static methods
- **Context:** NVS access is needed by WiFi, MoonrakerClient, and ConfigFetcher before any objects are constructed (in `setup()`). A singleton/static approach avoids ordering issues.
- **Option A:** Singleton instance with `Settings::getInstance()` — more OOP, extra boilerplate
- **Option B:** Static methods on a class — simpler, no init ordering problems ← **Chosen**
- **Rationale:** NVS is effectively global state anyway. Static methods map directly to the underlying NVS key-value API. No reason to add instance indirection.
