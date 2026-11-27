# Borealis playtest report

Reviewer: independent playtest, 2026-11-27. Build: `app/` as of today. Screenshots: `review/playtest-shots/`.

## Verdict

1. **Demo to the teacher: yes**, on one computer (board plus Demo mode tabs), if the presenter avoids double taps on Next and never opens the board in two tabs (M1, M2).
2. **Class: not yet.** Board-only Phase 1 can run, but fix M1 to M5 first. Device play needs real sync (B1) and the re-render fix (B2).
3. The engine, trade rules, Phase 2 flow and the words on screen are strong. The risks are in input handling, a few classroom-scale numbers, and one missing curriculum label.

## How I tested

- One Chromium profile, touch on. Board at 1920x1080. Seven province pages: Westhaven and Saltmarch 360x740, Ridgeland, Valcourt and Northreach 390x844, Goldplain iPad 820x1180, Lakemoor Chromebook 1366x768. Four party pages in Phase 2 (360, 390, 820, 1366).
- Class 8C: Years 1 and 2 played by hand (offers, a counter, a 2-counter limit, a decline, Trade Desk deal and undo, card swap, a group that never acted, system change). Years 3 to 6 partly by hand (Year 3 tax, Year 4 deficit with borrow reason and project), rest with sample fill. Bridge pledges on devices. All of Phase 2 on party devices to Royal Assent, Year 7, debrief and log.
- Class 8D: Year 1 in board-only mode, following only "What to do now". Then fast-forward and Back.
- Break tests: double taps, Back twice, board refresh mid-trade, group refresh mid-budget, two devices on one province, two board tabs, extreme overrides, export, bad import, re-import, 8C and 8D switching, over-giving, self-trade, ballot spam.
- 0 console errors except m11. No horizontal overflow on any phone screen. Text contrast 6.6:1 or better everywhere I measured.

## Issues

Most severe first. "Shot" = file in `playtest-shots/`.

| ID | Severity | Where | What happens | Steps to reproduce | Suggested fix |
| --- | --- | --- | --- | --- | --- |
| B1 | Blocker (known) | sync.js | Phones and Chromebooks cannot reach the board. Every device test here ran as tabs in one browser. A real class is board-only. | Open a group page on a second computer. | Ben's Escalation 1. Until then, plan every Feb-Mar period as board-only. |
| B2 | Blocker (device path) | board.js `onMessage` hello, group.js `render` | Every `hello` (each device, every 4 s) makes the board send the full state (about 175 KB) and every group page rebuilds its whole page. I counted 14 full redraws in 10 s with 7 idle devices. Open lists snap shut: the campaign riding list closes within 1.5 s, so door knocking, flyers and phone calls cannot be done on a device. Taps can land on a removed button. On a realtime service this is about 1.5 MB/s per class. | Phase 2 Campaign on a party page. Open a province's ridings. Wait 2 s. Shot 88a. | Reply to `hello` with state only to the new device and only when its version is old. Send a version number, not the whole state, on hello. Patch the DOM or keep `<details>` open state and scroll. |
| M1 | Major | Board Next | A double tap on Next runs two steps. At Year 1 results it started Year 2 and revealed the headline at once. A second double tap went headline, income, trade, skipping Income. Touch boards often fire double taps. | Results step, double tap Next. Shots 30, 31. | Ignore Next for 1 s after a press. Make "Reveal headline" its own button. |
| M2 | Major | board.js, store.js | Two board tabs on one class run two games. Tab 1 moved to Year 3. Tab 2 (still Year 2) pressed Back and overwrote the save. This silently undid my three repair overrides; Saltmarch stayed broken to Year 7. | Open board for 8C in two tabs. Next on one, Back on the other. Shot 106 (Saltmarch 5). | Board heartbeat lock on the room channel. A second tab shows "This class is open in another tab" with Take over / Read only. |
| M3 | Major | Change a number | No range checks. Debt 99999 and CPI -50 were accepted. Saltmarch fell to the approval floor and stayed there. Its "why" bar shows "Drift toward 50 +29004.9". A typo (1200 for 12.0) wrecks a province. | Province panel, Overview, Change a number, Debt 99999. Shots 44, 46-group-y2-results-saltmarch. | Per-field limits (debt -50% to 150% of GDP, CPI 80 to 150, goods 0 to 40). Show old and new values and ask to confirm big changes. |
| M4 | Major | castBallot, election.js | No ballot cap. One phone took 30 Cornerstone ballots in Saltmarch. Even 4 same-party ballots move Cornerstone from 24% to 28% and flip both Saltmarch seats from Common Good. The board says a ballot "cannot decide a riding alone". In small provinces it can. | Student Vote, Saltmarch page, Cornerstone and Cast 30 times. Shot 91b-board-vote-counts. | Cap ballots per province at that group's size (default 4, editable). Lower `studentVoteSwing` to 0.25 to 0.5. Lock the device after the cap. |
| M5 | Major | pledgeCap (30% of revenue) | The caps added up to $44B against a $60B bridge, so the bridge could not be built even if every province gave the most. The open round lost its tension (I reached $41B). | Play to Pledge round 2, sum the "You can give up to" lines. Shots 72, 75. | Set the cost from the caps (for example 80% of their total), or raise the cap to 50%. Show "Most Borealis can raise this year" on the board. |
| M6 | Major | Curriculum section 9, row 2 | The three economic questions (what, how, for whom) appear nowhere on screen. `economicSystems[].threeQuestions` exists in the data but no code uses it. P2's goal and exit ticket depend on it. | Search the board and group pages in Years 1 and 2. | Under the system picker and in the results panel, show "What? How? For whom?" with the three lines for the chosen system. Label card choices with the question they answer. |
| M7 | Major | Teacher menu | There is no way to end Phase 1 early or jump to the bridge. Fast-forward plays the bridge itself with sample pledges and lands in Phase 2. The "Cut to 12" plan (crisis in P6) cannot be run. | Teacher, Fast-forward from Year 1. Shot 132. Back goes to Outcome, not Pledge 1. | Add "End Phase 1 now (go to review)" and "Fast-forward to the bridge". |
| M8 | Major | Trade, 360 px phones | The minus and plus buttons are 24 px wide (the "has 7" note takes their room). Trade is the most tapped phone screen. | Westhaven at 360x740, Trade, pick Goldplain. Shot 08. | Put "has 7" under the row or in the label. Keep steppers at least 44x44. |
| M9 | Major | Duplicate devices | Two phones can join as one province. Both send offers. The second phone silently changed Westhaven's local issue choice. The device count shows 6, not 7, so the teacher cannot see it. | Join Westhaven on two pages. Shot 33. | First device claims the province. A second one sees "Westhaven is open on another device. Take over?". Show duplicates on the board. |
| M10 | Major | Group buttons that send | Double tap sends twice: two identical offers from Valcourt (Lakemoor could accept both), and one member's ranking counted twice (Evergreen got 5 rankings from 4 taps). | Trade, double tap Send offer. Caucus, double tap Add my ranking. Shot 15. | Disable the button until the ack comes back. Ignore an identical offer within 2 s. |
| m1 | Minor | Trade | The proposer gets no word when an offer is declined. The offer just disappears. | Ridgeland offers Lakemoor; Lakemoor declines. Shot 13. | Toast and a line under "Offers": "Lakemoor said no." |
| m2 | Minor | Budget on phone | If a group edits after confirming, the board keeps the old budget. The phone shows "Confirm budget" again but no warning. | Confirm, then change Education. Shot 23. | Show "Not confirmed. The board still has your last budget." |
| m3 | Minor | Group refresh | A refresh loses an unconfirmed budget and trade draft. | Saltmarch: change Social, reload. | Keep drafts in `sessionStorage`. |
| m4 | Minor | Group pages | When the board switches class or closes, groups keep a stale screen with no warning until they tap something. | Switch board to 8D. Shot 49. | Show "Lost the board" after 10 s without state. |
| m5 | Minor | Board, pledge steps | Tapping a province opens Overview, not the Pledge slip. | Pledge round 2, tap Northreach. Shot 73-board-pledge-slip-northreach-default-tab. | `defaultTab()` returns "pledge" in pledge steps. |
| m6 | Minor | Phase 2 devices | Party pages have no way back to a province page for the Student Vote. On the polling page, party buttons sit under the ballot, so a voter can turn the polling device into a party page. | Vote step on a party page; on Valcourt, scroll below Cast. Shots 92, 93. | Add "Back to my province" on party pages. Hide party buttons during the Vote step. |
| m7 | Minor | Board at 1366x768 | Labels overlap, "What to do now" is cut, tracker spills. Known in README. | Resize board. Shot 141. | Compact layout below 1600 px. |
| m8 | Minor | Switch class | The class picker cannot be closed. A tap outside opens it again. | Teacher, Switch class, tap outside. Shot 48. | Add Cancel. |
| m9 | Minor | Year-end results on board | The key reveal uses 18 px table text and small map badges ("51▼1", and "▼0" for a 0.2 drop). Hard to read from the back. | Year 1 results. Shot 25. | Full-screen results view with 40 px+ numbers. No arrow under 0.5. |
| m10 | Minor | Economic systems strip | Crests only, 32x36 px targets. Students cannot tell which crest is theirs from the back. | Launch. Shot 03. | Short names under crests, or a single row per province. |
| m11 | Minor | group.js `placeMap` | Console error on all party pages: "Cannot read properties of null (reading 'highlight')". `mapHost` is set before `mapApi` loads. | Open a party page at Election results. | Set `mapHost` after `loadMap` resolves, or await one shared promise. |
| m12 | Minor | content.js `nowLine` | Income says "Point out the red rings" (the map shows red tags, not rings). A calm-year headline says "who does this help, who does it hurt?" with no event. | Year 1 headline and income. Shots 05, 06. | Fix both lines. |
| m13 | Minor | game.js `fmtSigned` | News reads "Lakemoor approval 0.0", which sounds like approval is zero. | Any year with a 0 change. | "Lakemoor approval no change". |
| m14 | Minor | Timers | Trade timer starts by itself. Local, Budget, Campaign do not. Nothing happens at 0:00. | Any Phase 1 year. | Same rule for all steps. Flash and chime at 0. |
| p1 | Polish | Regional promise | "Expand the Pacific port" names a real ocean. The map says "Western Sea". | Platform step. Shot 85. | "Expand the Western Sea port". |
| p2 | Polish | log.html | "Year 1 Year 1 begins." | Shot 109. | Drop the repeat. |
| p3 | Polish | Campaign list | "1 seats". | Shot 88a. | Plural rule. |
| p4 | Polish | Colours | Forward teal is close to Saltmarch; Common Good purple is close to Valcourt. After the election, province colours change meaning. | Shot 95. | Shift party hues or add pattern labels. |
| p5 | Polish | Board map | The strip hides "REPUBLIC" and part of the south coast. | Shot 03. | Move or shrink the strip. |
| p6 | Polish | Words | "Drift toward 50" is unclear for Grade 8. Results table shows savings as "Debt -$15B". | Shots 25, 26. | "Pull back toward 50". Show "Savings $15B". |
| p7 | Polish | GOTV | Costs 0 and can be pressed without limit (15 times). It changes nothing. | Shot 88. | Once per party, or cost 1. |
| p8 | Polish | Phone small text | Kicker and party identity lines are 12.8 px on phones. | Shot 81. | 14 px minimum. |
| p9 | Polish | Party data | Common Good plank appeal totals 22; the other parties 20. | `data/game-data.json`. | Re-check in the election balance test. |

**Counts:** Blocker 2 (1 known), Major 10, Minor 14, Polish 9.

## Section 9 coverage (Musts)

| Mechanic | Status | Where I saw it |
| --- | --- | --- |
| Every province starts short of something | Present | Income, red "short" tags on map (15), group Income box |
| Choices map to what, how, for whom; board labels them | **Missing** | Data has `threeQuestions`; no screen shows it (M6) |
| Economic system setting, market to command, visible effects | Present | Budget, Year 2+: picker, planner, market note (41); "Economic system" why bar |
| Board spectrum with all 7 provinces | Present (weak) | Strip under map; crests only (m10) |
| Tax rate changes revenue | Present | Year 3+, live preview (61) |
| Four spending lines named correctly | Present | Budget editor (22) |
| Surplus or deficit; debt adds up | Present | Preview "Debt now → after", results table, log |
| Interest reduces later room | Present | "Interest on debt" line; Rates Rise event |
| Borrowing with two reasons | Partial | Year 4+ required (62). Reason is a label only; payback comes from the project |
| GDP, CPI, unemployment per province, comparable | Present | Results table, Year 5 compare (64, 65), log |
| Events hit provinces differently | Present | 11 events, Years 2 to 6 headlines (60-*) |
| Local issue winners and losers | Present | "Happier / Unhappy" chips (17) |
| Approval with "why it changed" | Present | Board and phone (26, 27) |
| Printable history log per class save | Present | log.html (109) |
| Bridge crisis no province can solve alone | Present, flawed | Pledges on devices and board (69-75). Caps make $60B impossible (M5) |
| Four parties on left-right spectrum, editable platform with costs | Present | Strip (80), platform levers and price tag (85) |
| Party join by counts, leader vote, priority vote, candidate per riding | Present | Board parties (82, 83), caucus ranking on device (81), candidate toggles (85) |
| Unequal ridings, results by riding, seats, majority or minority | Present | 34 seats, reveal, seat bar, majority line (95) |
| Seats not equal to roster size | Present, at risk | Members do not add appeal. Ballots can dominate small provinces (M4) |
| Campaign actions named for civic engagement; some open to non-members | Partial | Board dialog works (89). Device riding picker collapses (B2) |
| Government formation: PM, Cabinet, LoO, shadow cabinet | Present | Role cards, confidence vote (98, 99) |
| Federal bill, same tax and 4 lines; Cabinet, House, Senate, Royal Assent | Present | C-1 stages 0-6 (102-*), amendments (104), House and class tally (105) |
| Party caucus as a group unit | Present | `party:` pages |
| Every step runnable from the board alone | Present | 8D Year 1 with no devices (122-131); Phase 2 all on board |

Shoulds: voter eligibility step partial (text only); class vs House tally present; riding association partial (toggles); vote share vs seat share present (96). Could: coalition missing (confidence-vote partner support covers part).

## Classroom flow risks (top 5)

1. **Board-only queue.** One board-only Year 1 took 85 board taps. Local slips: 3 taps each. Budget slips: 4 or more each, and Confirm sits 750 px below the panel top, so every slip needs a scroll (127). Seven Premiers queue at the board inside an 8-minute budget window that also holds Budget Speeches. Fix: one "slip grid" screen with all 7 provinces, and a student Clerk role.
2. **Phase 2 Parties (P10, 20 min).** The teacher counts secret slips and taps 28 member steppers, 4 leaders and every member's 4-plank ranking at the board while caucuses wait. Fix: one "count" field per party per province, and let party devices enter their own counts.
3. **Device handover in Phase 2.** Seven province devices become four party devices. Three groups have none. For the Student Vote, devices must be back on the province page, which needs a re-join with the code (m6). Budget 5 minutes for this in P13 or the 12-minute vote slips.
4. **P9 and P15 are tight.** P9: crisis, two pledge rounds and outcome need about 14 minutes against 12, and "Four Ways to Decide" has no board support. P15: debate, 7 bill stages, amendment votes, class vote, Senate and Royal Assent in 22 minutes is only possible if the teacher presses Next without discussion.
5. **Idle groups sink quietly.** A group that does nothing gets no card effect and last year's budget, logged but not flagged. My idle Northreach fell 50 → 21 by Year 7. The board shows "Waiting" per row but never says who to visit. Fix: a "Who needs help" chip listing groups with no action this step.

Teacher unknowns I hit: what to do at Outcome ("Run Four Ways to Decide" with no materials), no reminder to rotate roles after Years 2 and 4, no explanation of what Back undoes, and no "end Phase 1 now" (M7).

## Content and neutrality

- **No em dashes** in any app, HTML or data string. **No AI flair words.** Sentences are short and active. Reading level fits Grade 8, apart from "Drift toward 50", "Equalization" and "Throne Speech" (the last two are taught vocabulary).
- **Parties are even-handed.** Each has a positive one-line identity, four planks with real costs, and its own trade-offs (Cornerstone's low tax plus balance promise forces cuts; Forward and Evergreen borrow; Common Good raises taxes). Rhetoric is symmetric ("We will not leave a bill for your kids" against "Big companies pay their share"). Party colours avoid real party colours, which is good. Appeal totals: Common Good 22, others 20 (p9).
- **Real names:** no real provinces or parties. One slip: "Pacific" in the Westhaven regional promise (p1). Valcourt riding names are French-sounding but invented. "Republic" to the south is unnamed.
- **Northreach:** no Indigenous imagery, cultures or stereotypes. Crest is a star and peaks. Cards treat it as a high-cost, remote province (food shipping, mine road). Risk: it is the province that falls hardest without trade (balance test -25), so a weak group there may read as "the north fails". Debrief this as geography and costs, not people.
- **Valcourt:** "its people share their own language and culture" and a culture-funding card with a fair counter-view. No caricature. The regional promise "Protect Valcourt's language and culture" is respectful.
- Local issue and event cards give each choice a plausible upside. "Let the market sort it out" and "Fund retraining" both carry a cost. Good balance.

## What works well

- The budget editor teaches: live preview, debt line, lenders' limit and borrow-reason gate (62). The "why it changed" bars are clear on board and phone (26).
- Trade rules hold: no self-trade, no over-giving ("Saltmarch only has 6 energy"), fair band, aid cap, two counters max, undo replays cleanly.
- Saves are solid: board refresh mid-trade resumed with open offers and phones reconnected (35). 8C and 8D stay separate. Export works; a bad file is rejected with a plain message.
- Phase 2 runs end to end and teaches first past the post well: Cornerstone and Forward both took 27% of the vote, yet got 7 and 12 seats; the proportional view makes the point (95, 96). Minority, confidence vote, amendments and the class-vs-House tally all worked.
- Phone layouts held at 360 px with no sideways scroll on any step, and text contrast was 6.6:1 or better.
