# Phase 1: Design Decisions

## 2026-05-09: Sh1106Driver — heap-allocated Adafruit_SH1106G

- **Context:** Adafruit_SH1106G does not have a default constructor (requires width/height in ctor). The driver instance must be created in `init()`, not the outer constructor.
- **Solution:** Store `Adafruit_SH1106G*` as a pointer, `new` it in `init()`, `delete` in destructor. The Sh1106Driver constructor is lightweight (stores config only).
- **Color mapping:** `uint32_t color → uint8_t`: any non-zero → 1 (white), zero → 0 (black). Simple and matches the DisplayDriver contract (RGB888 → 1-bit).

## 2026-05-09: WifiManager — EventGroup + static event handler

- **Context:** WiFi events arrive via static callback. Need to route to a class instance.
- **Option A:** Singleton pattern with `getInstance()` — more boilerplate
- **Option B:** Global `gInstance` pointer — simple, works because there's only one WifiManager ← **Chosen**
- **Rationale:** There will never be multiple WifiManager instances (one WiFi radio). The global pointer is trivially correct and avoids singleton ceremony.
- **EventGroup vs callback poll:** EventGroup lets moonrakerTask, displayTask, etc. block until WiFi is ready without busy-waiting. Much cleaner than polling `WiFi.status()`.

## 2026-05-09: Settings module — standalone class with static methods
- **Context:** NVS access is needed by WiFi, MoonrakerClient, and ConfigFetcher before any objects are constructed (in `setup()`). A singleton/static approach avoids ordering issues.
- **Option A:** Singleton instance with `Settings::getInstance()` — more OOP, extra boilerplate
- **Option B:** Static methods on a class — simpler, no init ordering problems ← **Chosen**
- **Rationale:** NVS is effectively global state anyway. Static methods map directly to the underlying NVS key-value API. No reason to add instance indirection.
