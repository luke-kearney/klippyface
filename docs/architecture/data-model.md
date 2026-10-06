---
title: Data Model
type: reference
stable: true
---

# Data Model (SQLite)

## Entity Relationship Diagram

```
nodes ──→ node_displays ──→ assignments
  │                            │
  └── node_presets ────── presets

groups ──→ sets ──→ frames ──→ frame_elements
                                   │
                                   └── (references sprites by ID)
```

## Schema

### Nodes

```sql
CREATE TABLE nodes (
    id                  TEXT PRIMARY KEY,
    mac_address         TEXT NOT NULL UNIQUE,
    friendly_name       TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    last_seen           TEXT,                            -- set by WS heartbeat
    last_config_version INTEGER NOT NULL DEFAULT 0,      -- bumped on admin edits
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Displays

```sql
CREATE TABLE node_displays (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label           TEXT NOT NULL DEFAULT '',
    driver_type     TEXT NOT NULL,               -- "sh1106", "hx8347", "st7789", "gc9a01" (+ "ssd1306", "ili9341": no firmware driver yet)
    bus_type        TEXT NOT NULL DEFAULT 'i2c',
    bus_config      TEXT NOT NULL DEFAULT '{}',
    width           INTEGER NOT NULL DEFAULT 128,
    height          INTEGER NOT NULL DEFAULT 64,
    rotation        INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0
);
```

### Assignments

```sql
CREATE TABLE assignments (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    display_id      TEXT NOT NULL REFERENCES node_displays(id) ON DELETE CASCADE,
    default_group   TEXT NOT NULL DEFAULT 'idle',
    triggers_json   TEXT NOT NULL DEFAULT '{}',
    active_preset   TEXT REFERENCES presets(id),
    UNIQUE(node_id, display_id)
);
```

### Groups

```sql
CREATE TABLE groups (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),  -- also bumped by edits to its sets/frames/elements
    pending_publish INTEGER NOT NULL DEFAULT 0          -- edited since nodes were last refreshed
);
```

### Sets

```sql
CREATE TABLE sets (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    loop_count  INTEGER NOT NULL DEFAULT 1,      -- 0 = loop forever
    frame_time  INTEGER NOT NULL DEFAULT 1000    -- default ms for new frames; firmware fallback when a frame has no duration_ms
);
```

### Frames

```sql
CREATE TABLE frames (
    id          TEXT PRIMARY KEY,
    set_id      TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 1000,
    bg_color    TEXT NOT NULL DEFAULT '#000000'
);
```

### Frame Elements

```sql
CREATE TABLE frame_elements (
    id          TEXT PRIMARY KEY,
    frame_id    TEXT NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    type        TEXT NOT NULL CHECK(type IN ('text','sprite','datavalue')),
    value       TEXT NOT NULL DEFAULT '',
    label       TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#FFFFFF',
    x           INTEGER NOT NULL DEFAULT 0,
    y           INTEGER NOT NULL DEFAULT 0
);
```

### Sprites

```sql
CREATE TABLE sprites (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    folder      TEXT NOT NULL DEFAULT '',          -- free-text; '' = unfiled
    description TEXT NOT NULL DEFAULT '',
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    data_base64 TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Presets

```sql
CREATE TABLE presets (
    id              TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    conditions_json TEXT NOT NULL DEFAULT '{}',
    overrides_json  TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE node_presets (
    node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    preset_id   TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    enabled     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (node_id, preset_id)
);
```
