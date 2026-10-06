#!/usr/bin/env python3
"""Generate per-display-size starter faces from the 128x64 base pack.

server/Data/starter-pack.json holds the base art (1-bit sprites) and the base
groups drawn for a 128x64 OLED. This script lays the same faces out for the
larger colour panels and writes them back into the same file:

  - one copy of each base group per profile, id "<group>_<profile>"
  - faces scaled by the largest whole factor that fits (element `size`),
    centred, tinted in the state's colour
  - state label and data value as large centred text below the face
  - the error state on a dark red background instead of the red strip

Sprites are shared: larger profiles scale them on the device rather than
storing bigger copies. Re-running replaces the generated groups, so edit the
base groups or the PROFILES table and run:

    python3 scripts/starter_pack.py
"""

import json
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent / "server" / "Data" / "starter-pack.json"

# Ids match DISPLAY_PROFILES in ui/src/components/DisplayPreview.tsx and the
# server's StarterPackService profile matching.
PROFILES = {
    "tft320x240": {
        "label": "320×240",
        "width": 320,
        "height": 240,
        "face_box": (10, 6, 300, 160),  # x, y, w, h the face is centred in
        "max_scale": 3,
        "label_y": 188,
        "value_y": 218,
        "label_size": 3,
        "value_size": 2,
    },
    # Portrait TFTs, e.g. the HX8347D at rotation 0
    "tft240x320": {
        "label": "240×320",
        "width": 240,
        "height": 320,
        "face_box": (10, 30, 220, 190),
        "max_scale": 3,
        "label_y": 254,
        "value_y": 288,
        "label_size": 3,
        "value_size": 2,
    },
    "tft240x280": {
        "label": "240×280",
        "width": 240,
        "height": 280,
        "face_box": (10, 16, 220, 170),
        "max_scale": 3,
        "label_y": 214,
        "value_y": 246,
        "label_size": 3,
        "value_size": 2,
    },
    # Only the inscribed circle is visible: keep everything well inside it
    "round240": {
        "label": "Round 240",
        "width": 240,
        "height": 240,
        "face_box": (32, 26, 176, 116),
        "max_scale": 2,
        "label_y": 166,
        "value_y": 194,
        "label_size": 2,
        "value_size": 2,
    },
}

# Face / label colour per base group (the base pack's label colours)
STATE_COLORS = {
    "idle": "#60A5FA",
    "printing": "#FF6900",
    "paused": "#FACC15",
    "error": "#FB7185",
    "complete": "#4ADE80",
    "sleep": "#A1A1AA",
}
ERROR_BG = "#450A0A"


def scale_for(sprites, ids, box, max_scale):
    """Largest whole scale at which every face in the group fits the box."""
    w = max(sprites[i]["width"] for i in ids)
    h = max(sprites[i]["height"] for i in ids)
    return max(1, min(max_scale, box[2] // w, box[3] // h))


def element(type_, value, color, x, y, size):
    return {"type": type_, "value": value, "label": "", "color": color, "x": x, "y": y, "size": size}


def layout_frame(frame, group_id, prof, sprites, scale):
    color = STATE_COLORS.get(group_id, "#FFFFFF")
    is_error = group_id == "error"
    bx, by, bw, bh = prof["face_box"]
    out = []

    for el in frame["elements"]:
        if el["type"] == "sprite" and el["value"].startswith("face_"):
            s = sprites[el["value"]]
            x = bx + (bw - s["width"] * scale) // 2
            y = by + (bh - s["height"] * scale) // 2
            out.append(element("sprite", el["value"], color, x, y, scale))

    center = prof["width"] // 2
    for el in frame["elements"]:
        if el["type"] == "text":
            out.append(element("text", el["value"], "#FFFFFF" if is_error else color,
                               center, prof["label_y"], prof["label_size"]))
        elif el["type"] == "datavalue":
            out.append(element("datavalue", el["value"], "#FFFFFF",
                               center, prof["value_y"], prof["value_size"]))
        # strip_rule / strip_fill / icon_pause are 128px OLED furniture: dropped

    return {
        "duration_ms": frame["duration_ms"],
        "bg_color": ERROR_BG if is_error else frame["bg_color"],
        "elements": out,
    }


def generate_group(base, profile_id, prof, sprites, order_offset):
    faces = {
        el["value"]
        for s in base["sets"]
        for f in s["frames"]
        for el in f["elements"]
        if el["type"] == "sprite" and el["value"].startswith("face_")
    }
    scale = scale_for(sprites, faces, prof["face_box"], prof["max_scale"])
    return {
        "id": f"{base['id']}_{profile_id}",
        "label": f"{base['label']} · {prof['label']}",
        "profile": profile_id,
        "sort_order": order_offset + base["sort_order"],
        "sets": [
            {
                "label": s["label"],
                "loop_count": s["loop_count"],
                "frame_time": s["frame_time"],
                "frames": [layout_frame(f, base["id"], prof, sprites, scale) for f in s["frames"]],
            }
            for s in base["sets"]
        ],
    }


def main():
    pack = json.loads(PACK.read_text())
    sprites = {s["id"]: s for s in pack["sprites"]}
    base_groups = [g for g in pack["groups"] if not g.get("profile")]

    groups = list(base_groups)
    profiles = {}
    for i, (pid, prof) in enumerate(PROFILES.items(), start=1):
        generated = [generate_group(g, pid, prof, sprites, i * 10) for g in base_groups]
        groups.extend(generated)
        profiles[pid] = {
            "label": prof["label"],
            "triggers": {t: f"{gid}_{pid}" for t, gid in pack["triggers"].items()},
            "default_group": f"{pack['default_group']}_{pid}",
        }
        print(f"{pid}: {len(generated)} groups")

    pack["groups"] = groups
    pack["profiles"] = profiles
    PACK.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
