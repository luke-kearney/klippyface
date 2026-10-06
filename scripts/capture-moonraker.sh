#!/usr/bin/env bash
# Record a Moonraker session for the fake Moonraker's replay mode.
#
#   scripts/capture-moonraker.sh <printer-host[:port]> [seconds] [out.jsonl]
#
# Needs only websocat (https://github.com/vi/websocat). Subscribes to the
# objects Klippyface uses — including extruder1..3, so a printer with fewer
# extruders shows how Klipper answers for missing ones — and writes every
# message, one per line. Console output (notify_gcode_response) and host stats
# are dropped; set KEEP_GCODE=1 to keep console output.
#
# The capture still contains the names of files you print (print_stats.filename,
# virtual_sdcard.file_path). Check it before sharing.
#
# Replay it with:
#   dotnet run --project tools/FakeMoonraker -- --replay capture.jsonl

set -euo pipefail

if [[ $# -lt 1 ]]; then
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
fi

host=$1
seconds=${2:-900}
out=${3:-capture-$(date +%Y%m%d-%H%M%S).jsonl}

[[ $host == *:* ]] || host="$host:7125"

if ! command -v websocat > /dev/null; then
    echo "websocat not found: https://github.com/vi/websocat/releases" >&2
    exit 1
fi

subscribe='{"jsonrpc":"2.0","id":1,"method":"printer.objects.subscribe","params":{"objects":{"print_stats":null,"virtual_sdcard":null,"display_status":null,"toolhead":null,"heater_bed":null,"extruder":null,"extruder1":null,"extruder2":null,"extruder3":null}}}'

drop='"notify_proc_stat_update"'
[[ ${KEEP_GCODE:-0} == 1 ]] || drop="$drop|\"notify_gcode_response\""

echo "Recording ws://$host/websocket for ${seconds}s → $out" >&2

{ echo "$subscribe"; sleep "$seconds"; } \
    | websocat --text "ws://$host/websocket" \
    | grep --line-buffered -Ev "$drop" > "$out" || true

lines=$(wc -l < "$out")
if [[ $lines -eq 0 ]]; then
    echo "Nothing recorded — is Moonraker reachable at $host?" >&2
    exit 1
fi
echo "Recorded $lines messages to $out" >&2
