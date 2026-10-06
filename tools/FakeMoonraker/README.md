# Fake Moonraker

A stand-in for Moonraker + Klipper, for developing and testing without a printer. It speaks Moonraker's JSON-RPC over WebSocket, so the Klippyface server connects to it exactly as it would to a real Moonraker.

## Run

```bash
dotnet run --project tools/FakeMoonraker -- --profile quad --scenario toolchange-cycle
# → ws://0.0.0.0:7125/websocket
```

| Option | Default | |
|--------|---------|-|
| `--profile` | `single` | `single`, `quad`, or a path to a profile `.json` |
| `--extruders` | | override the profile's extruder count, e.g. `--extruders 3` |
| `--console` | on in a terminal | read typed commands (see below) |
| `--idle-timeout` | `600` | seconds until Klipper's idle timeout fires after the last G-code |
| `--scenario` | `idle` | see below |
| `--port` | `7125` | Moonraker's default port |
| `--host` | `0.0.0.0` | listens on the LAN so a server on another machine can reach it — allow the port through your firewall |
| `--replay` | | play back a capture instead of a profile and scenario (see below) |
| `--speed` | `1` | replay speed multiplier |
| `--loop` | `true` | start the replay again when it ends |

To use it, set the Moonraker host on the server's **Printer** page to this machine (`127.0.0.1` if the server runs here too) and port `7125`.

## Profiles

`profiles/*.json` sets which printer the fake pretends to be:

```json
{ "name": "quad", "extruders": 4 }
```

Every profile has `print_stats`, `virtual_sdcard`, `display_status`, `toolhead`, `idle_timeout`, `webhooks` and `heater_bed`, plus `extruder`, `extruder1`… up to the extruder count. `idle_timeout` behaves like Klipper's: `Printing` while a print or `busy` G-code runs, `Ready` after, `Idle` (heaters and motors off) once the idle timeout passes.

## Scenarios

| Name | What happens |
|------|--------------|
| `idle` | Nothing; type commands or use `/_sim/*` |
| `print-loop` | Idle 10 s, heat up, 90 s print, repeat |
| `toolchange-cycle` | 3 min prints that switch tool every 15 s |
| `flaky` | `print-loop` plus random dropped connections and Klipper restarts |

## Replaying a real printer

`scripts/capture-moonraker.sh` records a real Moonraker session (needs only [websocat](https://github.com/vi/websocat)):

```bash
scripts/capture-moonraker.sh 192.168.1.50 900 quad-toolchanger.jsonl
dotnet run --project tools/FakeMoonraker -- --replay quad-toolchanger.jsonl --speed 4
```

The printer's objects come from the capture's subscribe reply (missing ones, answered `{}`, are left out), and each `notify_status_update` is applied at its recorded `eventtime`. The simulation is off during a replay, so only recorded values change; `/_sim/*` still works on top. Console output and host stats are not recorded, but file names are — check a capture before sharing it. Captures can be committed under `captures/`.

## Typed commands

While it runs, type into its terminal:

```
status                    printer, tools and clients at a glance
extruders <n>             become an n-extruder printer (Klipper restarts)
profile <name|file.json>  become a profile from profiles/ (Klipper restarts)
print [seconds] [file]    start a print (default 120 s); heats up first
pause | resume | cancel | complete
tool <n>                  switch to tool n (T0 = extruder)
temp <heater> <°C>        set a target: bed, extruder, extruder1, t2, ...
set <object.field> <value>  set any field, e.g. set print_stats.message hello
respond <text>            console line, e.g. respond display:group=win
busy [seconds]            run non-print G-code, e.g. homing (default 10 s)
idle                      fire the idle timeout now (heaters, motors off)
shutdown [message]        Klipper shuts down, like a thermal runaway
restart [seconds]         restart Klipper (also recovers from shutdown)
disconnect                drop every client
```

`extruders` and `profile` restart Klipper the way editing `printer.cfg` would: clients get `notify_klippy_disconnected`, then `notify_klippy_ready`, and must subscribe again — the Klippyface server does this and picks up the new extruders.

## Control endpoints

```bash
curl localhost:7125/_sim                                   # list endpoints and scenarios
curl localhost:7125/_sim/state                             # every object, plus klippy/client status
curl -XPOST localhost:7125/_sim/state -H 'content-type: application/json' -d '{"extruder1":{"target":240}}'
curl -XPOST localhost:7125/_sim/print/start -H 'content-type: application/json' -d '{"duration_s":60}'
curl -XPOST localhost:7125/_sim/print/pause                # also resume, cancel, complete
curl -XPOST localhost:7125/_sim/toolchange/1
curl -XPOST localhost:7125/_sim/respond -H 'content-type: application/json' -d '{"msg":"display:node=desk group=win"}'
curl -XPOST 'localhost:7125/_sim/klippy/restart?seconds=5'
curl -XPOST 'localhost:7125/_sim/klippy/shutdown?message=Heater%20extruder%20not%20heating'
curl -XPOST 'localhost:7125/_sim/busy?seconds=10'          # idle_timeout Printing without a print
curl -XPOST localhost:7125/_sim/idle                        # fire the idle timeout now
curl -XPOST localhost:7125/_sim/disconnect                 # drop every client, no close handshake
```

## How faithful is it?

It follows Klipper's `webhooks.py` (`QueryStatusHelper`) and the `get_status()` of each object:

- `printer.objects.subscribe` replies with every requested field, then sends `notify_status_update` every 250 ms with **only the fields that changed** — nothing if nothing changed. A new subscribe replaces the client's previous one.
- Objects the printer doesn't have are not an error: `null` fields → `{}`, named fields → each `null`, and never in later updates.
- Print progress lives in `virtual_sdcard.progress` and `display_status.progress` (0–1). **`print_stats` has no `progress` field.**
- A Klipper shutdown sends `notify_klippy_shutdown`, sets `webhooks.state` to `shutdown` and keeps subscriptions (Klipper still answers); only a restart recovers.
- A Klipper restart sends `notify_klippy_disconnected`, drops every subscription and resets all objects, then sends `notify_klippy_ready`. Clients must subscribe again.
- `RESPOND` lines arrive as `notify_gcode_response`, prefixed `echo: `, `// ` or `!! ` like Klipper's `RESPOND TYPE=`.

Also answered: `printer.objects.list`, `printer.objects.query`, `printer.info`, `server.info`, `server.connection.identify`. Anything else gets JSON-RPC error `-32601`. There is no auth, and the `Origin` header is ignored.
