---
title: GCODE Macro Reference
type: reference
stable: true
---

# GCODE Macro Reference

Place these in your Klipper `printer.cfg`:

```gcode
[gcode_macro DISPLAY_FACE]
description: Set display face. Usage: DISPLAY_FACE GROUP=name SET=name
gcode:
  {% set group = params.GROUP|default('idle') %}
  {% set set_id = params.SET|default('default') %}
  {% set loop = params.LOOP|default('1') %}
  {% set speed = params.SPEED|default('1') %}
  RESPOND MSG="display:group={group} set={set_id} loop={loop} speed={speed}"

[gcode_macro DISPLAY_ALERT]
description: Show a temporary alert on the display
gcode:
  {% set text = params.TEXT|default('!') %}
  {% set duration = params.DURATION|default('5') %}
  RESPOND MSG="display:alert text={text} duration={duration}"

[gcode_macro PRINT_END]
description: Print end with display celebration
gcode:
  RESPOND MSG="display:group=celebration set=party loop=3"
  # ... rest of your PRINT_END ...

[gcode_macro _KLIPPYFACE_STATUS]
description: Status variables for display (like KNOMI's _KNOMI_STATUS)
gcode:
  # Set by other macros during homing, probing, heating, etc.
```

## Command Format

```
RESPOND MSG="display:node=printer_face display=face_oled group=celebration set=party loop=3"
```

Parameters:
- `node` — target node ID (optional, defaults to the receiving node)
- `display` — target display ID (optional, applies to all displays)
- `group` — group ID to switch to
- `set` — specific set ID within the group (optional)
- `loop` — loop count (optional, default 1)
