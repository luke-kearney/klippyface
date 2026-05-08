# Phase 1: Implementation Notes

## 2026-05-09: Settings + NVS module (1.1)

Serial log format used:
```
[SETTINGS] Initialized — NVS namespace "klippyface"
[SETTINGS] Provisioned: yes
[SETTINGS] WiFi: MyNetwork (********)
[SETTINGS] Moonraker: 192.168.2.21:7125
[SETTINGS] Node MAC: AA:BB:CC:DD:EE:01
```

### Gotchas
- NVS `open` with `NVS_READWRITE` must happen *after* `nvs_flash_init()` or it silently fails
- Strings in NVS have a max size of ~4000 bytes (way more than we need, but good to know)
- `nvs_commit()` is not automatic — must call explicitly after writes
- If `nvs_flash_init()` returns `ESP_ERR_NVS_NO_FREE_PAGES` or `ESP_ERR_NVS_NEW_VERSION_FOUND`, need to call `nvs_flash_erase()` then retry
