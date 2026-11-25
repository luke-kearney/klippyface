# Getting Started

From nothing to a display showing your printer, in five steps. No compiling, and no IP or MAC addresses to copy around.

**You need:**

- **A display board.** Supported: Waveshare ESP32-S3-Touch-LCD-1.69, Waveshare ESP32-S3-LCD-1.28, or a classic ESP32 DevKit with an SH1106 OLED or HX8347D TFT. See [Hardware](hardware/index.md)
- **An always-on computer on the same network as the printer** for the Klippyface server: the Klipper Pi itself, a NUC, a NAS or a home server
- **Chrome or Edge and a USB data cable**, to flash the board once

## 1. Start the server

**With Docker (Linux x86-64 or ARM64):**

```bash
mkdir klippyface && cd klippyface
curl -LO https://github.com/luke-kearney/klippyface/releases/latest/download/docker-compose.yml
docker compose up -d
docker compose logs     # should include "Now listening on: http://0.0.0.0:5000"
```

`docker ps` shows nothing under **PORTS**. That's normal: the server uses host networking (so displays can find it), and listens on the computer's own port 5000.

**Without Docker:** download the server for your system from the [latest release](https://github.com/luke-kearney/klippyface/releases/latest), extract it and run it:

| System | File | Run |
|--------|------|-----|
| Linux x86-64 | `klippyface-server-<version>-linux-x64.tar.gz` | `./Klippyface.Server` |
| Linux ARM64 (e.g. Raspberry Pi) | `klippyface-server-<version>-linux-arm64.tar.gz` | `./Klippyface.Server` |
| Windows x64 | `klippyface-server-<version>-win-x64.zip` | `Klippyface.Server.exe` — allow it on **private networks** when Windows Firewall asks |

Nothing else needs installing (no .NET). Closing the terminal or console window stops the server.

Then open **`http://<that computer's IP>:5000`** in a browser. It's `http`, not `https`.

## 2. Connect it to your printer

In the web UI, open **Printer**. Enter Moonraker's **Host** (usually the Klipper Pi's IP, or `printer.local`) and **Port** (`7125`), and click **Save**. The status should change to **Connected**.

If Moonraker refuses the connection, add the server computer's IP to `trusted_clients` in `moonraker.conf`, or create an API key in Moonraker and enter it under **API key**.

## 3. Flash the display and connect it to WiFi

1. Plug the board in over USB and open the **[Klippyface Flasher](https://luke-kearney.github.io/klippyface/)** in Chrome or Edge on a desktop or laptop
2. Pick your board, click **Install**, choose the board's serial port, and choose **erase** when asked
3. When it's done, the flasher offers to connect the board to WiFi: pick your network, enter its password, and wait for it to connect

The board then finds the server on its own. Go to step 5.

The screen stays black until you accept it in step 5. That's expected.

### Without the flasher

Use this on Firefox or Safari, or if the flasher can't open the port.

1. From the [latest release](https://github.com/luke-kearney/klippyface/releases/latest), download the **`-full.bin`** for your board:

   | Board | File |
   |-------|------|
   | Waveshare ESP32-S3-Touch-LCD-1.69 | `klippyface-firmware-<version>-esp32s3-ws-lcd169-full.bin` |
   | Waveshare ESP32-S3-LCD-1.28 (round) | `klippyface-firmware-<version>-esp32s3-ws-lcd128-full.bin` |
   | Classic ESP32 DevKit | `klippyface-firmware-<version>-esp32dev-full.bin` |

2. Plug the board in over USB and open **https://esptool.spacehuhn.com** in Chrome or Edge
3. Click **Connect** and pick the board's serial port
4. Click **Erase** and wait for it to finish
5. Set the address to **`0x0`**, choose the `-full.bin`, and click **Program**
6. When it's done, unplug the board and plug it back in, then set up WiFi as in step 4

To update a board that already runs Klippyface later, either use the flasher again (it resets the board's settings, so enter WiFi again when it asks; the server still knows the board, so there's nothing to accept) or flash the plain `.bin` (no `-full`) by hand at `0x10000`, which keeps the settings.

## 4. Connect the display to WiFi (if the flasher didn't)

Only needed if you skipped the flasher's WiFi step or flashed by hand.

1. On your phone, join the WiFi network **`Klippyface-Setup`** (no password). The setup page usually opens by itself; otherwise go to `http://192.168.4.1`
2. Pick your WiFi network and enter its password
3. **Leave "Server address" blank.** The display finds the server on your network by itself
4. Optionally give it a name, then tap **Save & Reboot**

The screen stays black for now. That's expected: it has nothing to show until it's accepted.

## 5. Accept the display

In the web UI, open **Nodes**. Within a few seconds the board appears under **Pending**.

Click **Accept**. Check the name and the display: Waveshare boards get theirs filled in; on a DevKit, pick the screen you wired up. Confirm, and the display gets its faces and starts showing your printer's state.

That's it. For each extra display, repeat steps 3 and 5.

## Troubleshooting

| Problem | Try |
|---------|-----|
| The board never shows up under **Pending** | The display and the server must be on the **same network**: not the guest WiFi, and not a separate VLAN or subnet. Check the server's firewall allows **TCP 5000** (and **UDP 5353** for discovery). On **Docker Desktop** (Mac/Windows) discovery can't work: redo the WiFi setup and type the server's IP as **Server address** |
| I need to redo the WiFi setup | Hold **BOOT** on the board for 3 seconds. It resets and `Klippyface-Setup` comes back |
| The screen stays black after accepting | Get the serial log (below) and look for lines starting with `[GFX]`. Report it with a photo: [open an issue](https://github.com/luke-kearney/klippyface/issues/new) (1.69"), [#29](https://github.com/luke-kearney/klippyface/issues/29) (1.28") |
| **Printer** never shows Connected | Check Moonraker's IP and port, and `trusted_clients` or the API key |
| The server moved to a new IP | Nothing to do: displays look for it again after 30 seconds offline |
| Getting a serial log | In esptool.spacehuhn.com click **Connect**, open the console and press the board's reset button. Or with PlatformIO: `pio device monitor` (115200 baud) |
| Starting over with Docker | `docker compose down -v` deletes the server's data (displays, faces, settings), then `docker compose up -d` |

Upgrading the server: `docker compose pull && docker compose up -d`, or extract the new release over the old folder. Each release's notes say what else changed.
