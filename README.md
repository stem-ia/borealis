# Borealis

A Grade 8 Social Studies class simulation. Seven provinces of a fictional country run an economy (Phase 1), then elect a federal government and pass a budget (Phase 2). The teacher board runs on the classroom touch screen; groups use their own devices.

Status: working prototype, November 2026. See `index.html` for the plain-language status page.

## Run it

```
cd app
python3 -m http.server 8000
```

Open `http://localhost:8000/demo.html` for the board and a phone side by side, or `board.html` and `group.html` in separate tabs of the same browser.

## Folders

| Folder | What it holds |
| --- | --- |
| `app/` | The web app. Plain HTML, CSS and JavaScript, no build step. `app/README.md` covers the sync protocol, tests and the fix log |
| `spec/` | Curriculum plan, game systems design, `game-data.json`, and the balance model in Python (`spec/balance/`) |
| `map/` | Map source (`borealis-map.svg`, `tools/build_map.py`), tokens, icons, fonts, visual system |
| `review/` | Independent playtest report and key screenshots |

## Tests

```
node app/tests/parity.mjs          # JS engine matches the Python balance model
python3 app/tests/e2e.py           # full browser run (needs Playwright and a server on port 8765)
python3 app/tests/robustness.py
```

## Known gaps

- Devices only sync inside one browser (`BroadcastChannel`). Cross-device play needs a realtime service behind `app/js/sync.js`.
- Not yet tested on a real touch board or iPad.

No student names are collected or stored.
