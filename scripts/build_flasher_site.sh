#!/usr/bin/env bash
# Builds the browser flasher site: flasher/index.html, one ESP Web Tools
# manifest per board, and the boards' -full.bin images.
#   scripts/build_flasher_site.sh <version> <dir with -full.bin files> <out dir>
# Used by .github/workflows/pages.yml; run it locally and serve <out dir> on
# http://localhost to test (Web Serial needs https or localhost).
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $0 <version> <firmware dir> <out dir>" >&2
  exit 2
fi
version=$1
firmware_dir=$2
out=$3
root=$(cd "$(dirname "$0")/.." && pwd)

# env | ESP Web Tools chip family | name (keep in step with flasher/index.html)
boards=(
  "esp32dev|ESP32|ESP32 DevKit"
  "esp32s3-ws-lcd169|ESP32-S3|Waveshare ESP32-S3-Touch-LCD-1.69"
  "esp32s3-ws-lcd128|ESP32-S3|Waveshare ESP32-S3-LCD-1.28"
)

rm -rf "$out"
mkdir -p "$out/firmware"
cp "$root/flasher/index.html" "$out/"

for entry in "${boards[@]}"; do
  IFS='|' read -r env chip name <<< "$entry"
  bin="klippyface-firmware-$version-$env-full.bin"
  if [ ! -f "$firmware_dir/$bin" ]; then
    echo "missing $firmware_dir/$bin" >&2
    exit 1
  fi
  cp "$firmware_dir/$bin" "$out/firmware/"

  # The image is a merged one (bootloader, partitions, app), so it goes at 0.
  # No Improv support yet (#53), so don't wait for it after flashing.
  jq -n --arg name "Klippyface ($name)" --arg version "$version" --arg chip "$chip" --arg path "firmware/$bin" '{
    name: $name,
    version: $version,
    new_install_prompt_erase: true,
    new_install_improv_wait_time: 0,
    builds: [{ chipFamily: $chip, parts: [{ path: $path, offset: 0 }] }]
  }' > "$out/manifest-$env.json"
  echo "$env: $bin ($chip)"
done
