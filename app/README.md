# Borealis prototype (app)

A classroom simulation for Grade 8 Social Studies. Phase 1: seven provinces run their economies for six years. Phase 2: four parties, an election, Parliament and a federal budget bill. Plain HTML, CSS and JavaScript. No framework, no build step, no outside requests.

## Run it

| Where | How |
| --- | --- |
| Your computer | `cd app` then `python3 -m http.server 8000`. Open `http://localhost:8000/`. |
| GitHub Pages | Copy the contents of `app/` into a repo in the stem-ia org (root or `/docs`). Settings > Pages > deploy from the branch. All paths are relative, so any sub-path works. |

Opening `index.html` straight from the file system does not work: browsers block ES modules and `fetch` on `file://`.

## Pages

| Page | Who | What |
| --- | --- | --- |
| `index.html` | Everyone | "I am the teacher" opens the board. "Join my group" asks for the room code and a province or party. Nothing else. |
| `board.html` | Teacher | 1920x1080 touch board. Map, province panel, step panel, news ticker, controls. Holds the game. |
| `group.html` | Groups | Mobile-first dashboard, 360 px phone to laptop. `?room=ABCD&as=province:goldplain` or `as=party:forward`. Add `&demo=1` for the switcher. |
| `log.html` | Teacher | Printable history log for a class save. One page per province when printed. |

## Running a class (short version)

1. Open the board. Pick a class save (for example `8C`) or make a new one. Each class has its own save and room code.
2. Groups join with the code. If a device fails, the group fills a paper slip and the teacher taps it into the province panel. Every step works from the board alone.
3. Press the big **Next** button. The line beside it always says what to do now. **Back** undoes the last step.
4. Tap any province on the map for its panel: overview, Trade Desk, local issue slip, budget slip, "why it changed", and **Change a number** (logged).
5. **Teacher** menu: Demo mode, Fill this step with sample choices, Fast-forward to Phase 2, history log, export and import a save, switch class.

## Files

```
app/
  index.html  board.html  group.html  log.html
  css/   tokens.css (copy of map/tokens.css, font paths fixed)  app.css  board.css  group.css  log.css
  js/    engine.js    port of spec/balance/engine.py (Phase 1 formulas)
         election.js  province issues, platform levers, riding vote model, seats, federal Year 7
         game.js      board controller: steps, intents, trades, undo, sample fill, fast-forward
         sync.js      the only networking module (BroadcastChannel)
         store.js     class saves in localStorage, export and import
         map.js       inlines map/borealis-map.svg and drives selection, routes, badges, seats
         widgets.js   views shared by board and phones (budget editor, cards, why bars)
         content.js   on-screen words: atlas lines, job cards, "what to do now", "Your job now"
         board.js  group.js  index.js  log.js
  data/  game-data.json (copy of spec/game-data.json)
  map/   borealis-map.svg (copy of map/borealis-map.svg)
  fonts/ icons/   copied from map/
  tests/ parity.mjs parity.py parity-script.json make_script.py controller-smoke.mjs e2e.py
```

If `spec/game-data.json` or `map/` changes, copy the files again (`data/`, `map/`, `css/tokens.css` with `url('../fonts/...')`).

## Architecture

- **The board is the single source of truth.** `Controller` (game.js) holds the state, runs the engine and applies every change. It saves after each change and broadcasts a full snapshot.
- **Groups send intents and render snapshots.** A phone never changes state. It previews its own budget with the same engine code (`Game.fromJSON(snapshot.engine).finances(...)`), so the preview matches the result.
- **Board-only mode uses the same intents.** The board calls `controller.intent("board", type, payload)` with a `pid` or `party`. Paper slips and device taps go through one path.
- **Phase 1 year order** follows game-systems.md section 13: headline, income, trade, local issue, budget, year end. Card choices and budgets commit when the teacher presses Next, so Back can restore the step exactly.

## Sync adapter

`js/sync.js` exports one function:

```js
connect(room, role, id) -> { send(msg), onMessage(cb), onStatus(cb), status, close() }
// room: 4-letter code. role: "board" | "group". id: "board", "province:<id>" or "party:<id>".
// send() adds { from, role, room, t } to every message.
```

Today it uses `BroadcastChannel("borealis:<ROOM>")`, which links tabs in **one browser on one computer**. To use a realtime service, write `sync-<service>.js` with the same `connect()` and change the import line in `board.js` and `group.js`. The service only needs a room-scoped broadcast (every message to every other client in the room). A websocket relay, a Firebase Realtime Database path per room, or a Supabase Realtime channel all fit.

## Message protocol

Every group page has a `devId` (one per browser tab, kept across reloads). Messages with `toDev` are for one device; other pages ignore them, and a realtime relay can route them.

| type | From | Fields | Meaning |
| --- | --- | --- | --- |
| `hello` | group | `devId`, `rev`, `demo` | "I am here." Every 4 s, about 140 bytes. The board answers with `state` only if `rev` is not its current version. |
| `resync` | group | `devId` | "I missed something." The board sends `state` to that device. |
| `state` | board | `toDev`, `rev`, `state` | Full public state for one device: join, resync, or an old `rev`. No history log or undo data. |
| `patch` | board | `base`, `rev`, `ops` | After each change: only the parts that changed, as `[path, value]` (paths like `offers`, `p2.ballots`, `engine.provs.goldplain`). A page whose `rev` is not `base` asks for a resync. |
| `beat` | board | `rev` | Every 5 s, about 90 bytes. Pages that are behind resync. No beat for 12 s shows "Lost the board". |
| `intent` | group | `intent`, `payload`, `reqId`, `devId` | A request. The actor is the sender's `from` (province or party). |
| `ack` | board | `toDev`, `reqId`, `ok`, `msg` | Result of an intent. The sending button stays locked until the ack. |
| `dup` / `owner` | board | `toDev`, `actor` | The first device claims a province or party. Another device on the same group can watch but not act, and sees "Use this device instead". |
| `takeover` | group | `devId` | Move control of the group to this device. |

Measured (`tests/traffic.py`, board plus 7 phones): idle for 10 s sends 23 messages and about 3 KB in total (hellos and beats), with 0 full re-renders on a phone. One trade offer sends one 300-byte patch. Before the fix, the same idle class sent a 175 KB state every few hundred milliseconds.

Group pages update the DOM in place (`js/morph.js`): open lists, typed values and scroll positions survive every update.

Intents (payload fields). Actor `province:<id>` acts for its province, `party:<id>` for its caucus. The board may send any intent with `pid` or `party` in the payload.

| Intent | Step | Payload |
| --- | --- | --- |
| `proposeTrade` | trade | `to`, `give`, `get` (goods and `money`, from the proposer's side) |
| `respondTrade` | trade | `id`, `action` = accept, decline or counter, and `give`, `get` for a counter |
| `cancelOffer` | trade | `id` |
| `deskTrade` (board) | trade | `a`, `b`, `give`, `get`. Trade Desk: both ministers accepted at the board |
| `undoTrade` (board) | any | `id` |
| `chooseCard`, `chooseEvent` | local | `card`, `choice` / `choice` |
| `confirmBudget` | budget | `decision` = tax, health, education, infrastructure, social (1 to 5), system, policy, project, planner, borrowReason |
| `reasoning` (board) | budget, results | `pid`, `points` 0 to 3. At results it recomputes the year end |
| `swapEvent`, `reveal`, `swapLocal`, `override` (board) | headline, local, any | `event` / none / `pid`, `card` / `pid`, `field`, `value`, `reason` |
| `pledge` | pledge rounds | `amount` ($B, capped at 60% of last revenue) |
| `setMembers`, `setVoters`, `ballots`, `debate`, `qp`, `classVote`, `senate`, `holdConfidence` (board) | Phase 2 | counts, orders and scores |
| `addRanking`, `resetRankings`, `setLeader`, `setPromise`, `setLevers`, `setCandidate` | parties, platform | `order` (4 plank ids) / `province` / `levers` |
| `campaign`, `undoCampaign` | campaign | `action`, `riding` or `ridings` or `province` |
| `castBallot` | vote | `party`. One tap on the riding's device adds one to a count, up to that riding's voters |
| `govVote`, `billLevers`, `amend`, `amendVote`, `billVote` | government, bill | `vote` / `levers` / `lever`, `dir` / `amendParty`, `vote` |

## Saves and student data

- No names, ever. Groups are provinces (Phase 1) and party caucuses (Phase 2). Phase 2 stores member counts, Borda points, ballot counts and the leader's home province. The Budget Speech is spoken aloud and never typed in.
- Saves live in the board browser's `localStorage`: `borealis.saves` (index), `borealis.save.<class>` (state plus one undo step), `borealis.last`. All storage calls are wrapped in try/catch. The top bar shows "Not saved" if storage fails.
- **Export** writes `borealis-<class>-<date>.json`. **Import** reads it back on any computer.

## Tests

| Test | Command | Result (2026-11-27) |
| --- | --- | --- |
| Engine parity: scripted 6-year game, same inputs in Python and Node | `node app/tests/parity.mjs` | 2,436 values, 0 mismatches (tolerance 0.11) |
| Whole unit headless with sample choices | `node app/tests/controller-smoke.mjs` | Launch to debrief, no dead ends |
| Browser end to end (Playwright, Chromium) | serve `app/` on port 8765, then `python3 app/tests/e2e.py` | 28 of 28 checks, 0 console errors |
| Playtest fixes (double taps, two phones, two boards, limits, caps, three questions, end Phase 1) | `python3 app/tests/robustness.py` | 15 of 15 checks, 0 page errors |
| Sync traffic and open lists (B2) | `python3 app/tests/traffic.py` | Idle: about 3 KB in 10 s, 0 re-renders; riding list stays open; door knocking works on a phone |

`e2e.py` part A: board at 1920x1080 and two phones at 390x844 in one browser context. Two provinces join, play Year 1 (income, a phone-to-phone trade, local issue, budget, year end), state sync is checked, then fast-forward to Phase 2: caucus ranking and leader on a phone, platform, campaign, a secret ballot on a riding device, election reveal, government, bill C-1 to Royal Assent, Year 7, debrief and the history log. Part B: board only, no phones: swap the headline, Trade Desk deal, 7 card slips, 7 budget slips, Back, reload and resume, change a number, Demo mode. Screenshots go to `review/build-shots/`.

## Real and stubbed

| Real | Not built or stubbed |
| --- | --- |
| Phase 1 engine, parity-tested against engine.py | Device sync between different devices (needs a realtime service, see Escalate) |
| Trades on devices (offer, counter x2, accept, decline) and the Trade Desk, fair price band, aid cap, undo | Open Trade Pact (optional Phase 1 flavour) |
| Headline cards with swap, local cards with underdog draw and swap, event responses | Bills C-2 and C-3 (optional). C-1 carries the bridge lever |
| Budget with locks by year, credit limit, borrow reason, projects, planner moves, live preview | Coalition option after a minority (curriculum "Could") |
| Year-end "why it changed", indicators, compare view (Year 5+), awards, class goal | Sharpest Question award: QP scores are stored but no award is shown |
| Bridge crisis pledges (secret, reveal, open, outcome) | Riding association step beyond "candidate confirmed" toggles |
| Parties, Borda priorities, leader, platform levers with price tag, regional promise, candidates, campaign actions, debate momentum, Student Vote, riding results reveal, proportional view, confidence vote, C-1 stages with amendments, House and class votes, Senate, Royal Assent, Year 7 | Names for PM, ministers, senators (by design: role cards only) |
| Class saves, export, import, resume, undo, printable log, demo, sample fill, fast-forward | |

## Known issues

- BroadcastChannel only links tabs in one browser. Phones and Chromebooks cannot reach the board until a realtime adapter exists. Demo mode and board-only mode work today.
- Group timers read the board's clock. Fine in one browser; a realtime adapter should send time left instead.
- A full state (join or resync) is still about 100 to 200 KB late in the unit. Patches are small.
- Year 7 runs trades automatically at fair prices with the normal 10% fee. The east-west bridge fee is not applied in that one automatic year.
- In sample play, Year 7 approval often falls 1 to 4 points (bridge unemployment, no new choices). The federal part itself is small and positive. Watch this in the playtest.
- The board is laid out for 1920x1080. Below 1600 px a compact layout applies; at 1366x768 the economic systems strip still covers part of the south coast.
- Tested in Chromium only. Not yet tested on iPad Safari or a real touch board.
- The economic system strip shows crests only when 3 or more provinces share a step (names show on tap and in the panel).

## Decisions made

1. **Two bars, both always visible.** Status (phase, year and step tracker, timer, room code, class save, saved state, device count) sits on top. Controls (Back, Pause, timer, "what to do now", Teacher, Next) sit at the bottom, within reach on a wall touch board. Brief item 6 asked for a top bar; the visual system put controls at the bottom. This keeps both.
2. Board root font is 125% (20 px), not 150%, so the 560 px side panel holds a budget slip. Map labels and big numbers stay large.
3. Steppers (big minus and plus) instead of sliders. Levels are 1 to 5, and steppers are easier to hit on phones and a touch board.
4. The first press of Next on a headline reveals the card; the second moves on. One obvious button.
5. A province that has not chosen a local card gets no card effect that year. One that has not confirmed a budget keeps last year's settings (game-systems.md section 12). Both are logged.
6. Lenders' credit limit: if an unconfirmed or over-limit budget runs a deficit, the board balances it with the balance test rule (from Year 3 raise tax to 35%, then cut the highest line).
7. Budget Speech points can be entered at Budget or at Year-end. Changing them at Year-end recomputes the year from a saved pre-year-end state, so the numbers stay exact.
8. A province cannot trade goods it does not have. One-sided gifts are aid, capped at 5 units or $5B a year, and marked "(aid)" in the log.
9. Bridge pledges are capped at 60% of a province's last revenue (`cards.bridgeCrisis.pledgeCapPctRevenue`) and are paid in the first federal year only if the bridge gets built. Full cooperation reaches $60B even after a 1-year Phase 1. game-systems.md section 9 and decision 16 are updated to match.
10. Year 7: provinces keep Year 6 levels and Year 6 Budget Speech points; trade resolves at fair prices; federal lines become effects (approval, growth, skill, infrastructure stock, unemployment, money) as in game-systems.md section 10. Health transfer splits by population; equalization splits by the gap at Standard spending.
11. Phase 2 stores only the leader's home province, Borda points from member rankings entered one at a time, and ballot counts.
12. The Student Vote can run on the riding's device (one secret tap per voter) or on paper with counts entered at the board. Ballots per riding are capped at its voters (party members from that province, or 4; the teacher can change it). `election.studentVoteSwing` is now 0.5 (was 1). A whole riding voting one way changed the winner in 18% of riding tests (largest gain 2.7 points of share): it can tip a close race, not win a riding alone. The election balance test was re-run: results in game-systems.md section 14.
13. House, confidence and amendment votes are party blocs weighted by seats. The class show of hands is tallied next to the House vote.
14. Left-right strip: parties placed by their spectrum step; Forward and Evergreen share a step and sit side by side with a caption.
15. The app draws the Great Narrows Bridge marker on the Goldplain and Lakemoor border at the lake narrows. The map has no bridge layer.
16. Scarcity alerts are red tags under each approval badge, not red rings. Every province starts short of something, so rings on all seven were noise.
17. Underdog draw: the lowest province's second card comes from its general pool.
18. Undo keeps 25 steps in memory and 1 in the save.
19. Chief of staff fixes applied: ridings "Port Corran" and "Pontarel"; `meta.capital` "Corvell (Capital District)"; "Great Slate Lake" renamed "Greywater Lake" in the map SVG, `map/tools/build_map.py` and the reference PNG (re-rendered).
20. One board per class: a heartbeat lock in localStorage. A second tab opens read only with "Take over in this tab". A reload releases the lock.
21. Next and Back ignore presses for 1.2 s; other board buttons ignore a repeat within 0.4 s. Group buttons that send stay locked until the board answers.
22. Every timed step starts its timer on its own. At zero the timer reads "Time", turns red and plays one soft tone. No flashing.
23. "Change a number" ranges: approval 5 to 95, debt -50% to 150% of GDP, unemployment 2 to 20, CPI 80 to 150, goods 0 to 40. The teacher confirms old and new values.
24. The teacher can end Phase 1 after any finished year (Teacher menu), or fast-forward only to the bridge. The federal year is labelled with its real year number.

## Escalate to Ben

**1. Real device sync.** Phones and Chromebooks need a realtime service to reach the board. The adapter is ready: one new file.

| Option | Effect |
| --- | --- |
| A | Run Feb-Mar 2027 board-only (paper slips) plus Demo mode. No cost, no data leaves the teacher's computer. |
| B | Approve a realtime service (Firebase, Supabase or a small websocket relay). Room-scoped messages, no names, counts only. Adds a cost or account and a privacy review. |

Recommendation: **A** for the first run, then B after the playtest if devices add enough.

**2. Where saves live.** Saves sit in one browser on one computer. Clearing browser data or switching computers loses them unless exported.

| Option | Effect |
| --- | --- |
| A | The teacher exports the class save at the end of each period to OneDrive (one button). |
| B | Cloud saves, which need the same service as 1B. |

Recommendation: **A**.

**3. Hosting approval.** The app is a static site with no tracking and no outside requests (fonts are self-hosted). It needs the usual approval to publish under the stem-ia GitHub org. Recommendation: approve as a static site.

## Fix log (playtest 2026-11-27)

| ID | Status | What changed |
| --- | --- | --- |
| B1 | Not fixed | Needs a realtime service (Escalate 1). The adapter and protocol are ready for it. |
| B2 | Fixed | Versioned patches instead of full state; hello carries `rev`; full state only on join or resync; 5 s beat; group pages patch the DOM in place (`morph.js`). Idle class: 0 re-renders, about 3 KB per 10 s. Reviewer `rerender.py`: 0 renders in 10 s (was 14). |
| M1 | Fixed | Next and Back locked for 1.2 s and while a question is open; panel buttons ignore repeats within 0.4 s. A double tap runs one step. |
| M2 | Fixed | Single-board lock per class. A second tab is read only with a Take over button; a stale tab cannot save over the class. |
| M3 | Fixed | Per-field ranges checked in the dialog and in the controller, with a confirm showing old and new values. Debt 99999 and CPI -50 are refused. |
| M4 | Fixed | Ballots capped at the riding's voters on devices and at the board; the polling page closes at the cap. Swing lowered to 0.5 in game-data.json and game-systems.md; election test re-run; the board's claim now says "can tip a close race". |
| M5 | Fixed | Pledge cap 60% of last revenue (data field), so cooperation can reach $60B (about $67B to $90B in tests). Board shows "Most Borealis can raise". game-systems.md updated. |
| M6 | Fixed | "What to produce? How? For whom?" for the province's system on the phone budget (every year, Year 1 included) and results, the board province panel, and the board results (every system in use). The fishing card shows "Way of deciding" on each choice. |
| M7 | Fixed | Teacher menu: "End Phase 1 now" (after any finished year) and "Fast-forward to the bridge crisis". |
| M8 | Fixed | Trade rows put "has N" under the resource name; steppers are 48 px at 360 px. |
| M9 | Fixed | First device claims a group; a second device can watch but not act, sees "Use this device instead"; the board shows "extra on one group" and "2 devices" on the launch list. |
| M10 | Fixed | Sending buttons lock until the ack; the board refuses an identical offer within 2 s. |
| m1 | Fixed | The proposer gets "Lakemoor said no to your offer." |
| m2 | Fixed | Budget shows "Not confirmed. The board still has your last confirmed budget." |
| m3 | Fixed | Budget and trade drafts kept in sessionStorage for the tab. |
| m4 | Fixed | "Lost the board" banner after 12 s without a beat. |
| m5 | Fixed | Pledge steps open the Pledge slip. |
| m6 | Fixed | Party pages link back to province pages (Roles tab, and on the Vote step); polling pages show no party buttons. |
| m7 | Partly | Compact layout below 1600 px; no overflow at 1366x768. The strip still covers part of the south coast there. |
| m8 | Fixed | The class picker has Cancel; a tap outside closes it. |
| m9 | Partly | No arrow for changes under 0.5. A full-screen results view is not built. |
| m10 | Not fixed | Names under every crest do not fit the strip over the Southern Republic. Names show when 1 or 2 provinces share a step, on tap, and in the panel. |
| m11 | Fixed | The map loads once through a shared promise. |
| m12 | Fixed | Income line says "red Short tags"; calm-year headline says there is no event. |
| m13 | Fixed | News says "approval no change", "up 2.0", "down 1.5". |
| m14 | Fixed | All timed steps start their timer; "Time" and one tone at zero, no flashing. |
| p1 | Fixed | "Expand the Western Sea port" (spec and app data). |
| p2 | Fixed | Log reads "Year 1: A new fiscal year begins." |
| p3 | Fixed | Plural rule for seats, deals, rankings, members, sample trades. |
| p4 | Not fixed | Party colours are the map designer's; needs their review. |
| p5 | Partly | Strip moved off Lakemoor earlier; at 1366 it still covers part of the south. |
| p6 | Fixed | "Pull back toward 50"; results table shows "Savings $15B". |
| p7 | Fixed | Get out the vote: 3 times per party. |
| p8 | Fixed | Small text on phones is at least 14 px. |
| p9 | Not fixed | Plank appeal totals are the game designer's call; flagged for the next balance pass. |
