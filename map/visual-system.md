# Borealis visual system

Map and visual design for the board (teacher touch screen, 1920x1080) and the group dashboards (BYOD). The look is an old school atlas: parchment, ink, water lining, hachured mountains. The data stays honest: real projection logic, rivers that flow downhill, borders on survey lines and rivers.

## Files

| File | What it is |
| --- | --- |
| `borealis-map.svg` | The map. viewBox 1600x1000. Inline it into the page (fetch the text, insert it). Do not use `<img>`: taps and CSS tokens do not reach inside an image. |
| `borealis-map.png` | Reference render at 1920 px wide. |
| `tokens.css` | All colours, fonts, type scale, spacing, motion, and map state classes. |
| `icons/*.svg` | Energy, Food, Materials, Money. 24x24, single colour (`currentColor`). |
| `fonts/` | Self-hosted WOFF2 files (Latin subset) and their OFL licences. |
| `tools/build_map.py` | Rebuilds the SVG. Seeded, so the same input gives the same map. Reads riding ids from `spec/game-data.json`. |
| `tools/check_colours.py` | Checks WCAG contrast and colour-blind separation for every token. |

## Palette

Base

| Token | Hex | Use |
| --- | --- | --- |
| `--paper` | #F4ECD8 | Background |
| `--paper-raised` | #FBF7EC | Cards, panels |
| `--paper-sunk` | #E9DFC7 | Wells, inactive tabs |
| `--ink` | #2B2520 | Body text (12.8:1 on paper) |
| `--ink-soft` | #5B5045 | Secondary text (6.7:1) |
| `--sea` / `--sea-ink` | #D3E3E1 / #3C6670 | Water, sea names |
| `--lake` / `--river` | #C3DCDD / #4D86A0 | Inland water |
| `--neighbour` | #DEDAD0 | The Southern Republic |

Provinces. `fill` is the map tint. `strong` is for chips, outlines and text on paper.

| Province | Fill | Strong | Ink on fill |
| --- | --- | --- | --- |
| Westhaven | #8FD0B2 | #005235 | 8.5:1 |
| Ridgeland | #EDA77F | #975228 | 7.5:1 |
| Goldplain | #ECD47D | #644D00 | 10.3:1 |
| Lakemoor | #D593A9 | #954E69 | 6.2:1 |
| Valcourt | #AE9FD6 | #614D91 | 6.3:1 |
| Saltmarch | #73C5C3 | #00706F | 7.6:1 |
| Northreach | #E4E6F2 | #2C3447 | 12.2:1 |

Colour-blind check (CAM02-UCS distance after full protanopia, deuteranopia, tritanopia simulation): neighbouring provinces stay 10.2 or more apart under every type. Any two provinces stay 6.3 or more apart.

Resources (always icon plus word)

| Resource | Colour | Icon |
| --- | --- | --- |
| Energy | #B8740A | `icons/energy.svg` (bolt) |
| Food | #3E6B1F | `icons/food.svg` (wheat) |
| Materials | #5F6874 | `icons/materials.svg` (stacked ingots) |
| Money | #2B66A3 | `icons/money.svg` (coin with the Borealis star) |

Parties. No red, blue, orange or green. The slot for each party is deliberately scrambled against its real-world cousin.

| Slot | Colour | Map tint | Text on paper | Hatch | Party (game-data id) |
| --- | --- | --- | --- | --- | --- |
| Saffron | #D6A21E (ink text on it) | #EBD08A | #74560A | dots `#bm-hatch-2` | Cornerstone (`cornerstone`) |
| Teal | #13727A | #86C6C6 | #13727A | cross `#bm-hatch-3` | Forward (`forward`) |
| Plum | #5B3C8C | #BBA8D8 | #5B3C8C | diagonal `#bm-hatch-1` | Common Good (`commongood`) |
| Umber | #7A4A2A | #D3AC8E | #7A4A2A | lines `#bm-hatch-4` | Evergreen (`evergreen`) |

Use `--party-cornerstone`, `--party-forward`, `--party-commongood`, `--party-evergreen` in code, so a swap is one line.

Status: good #2E7246, warn #8F5A05, bad #9E2B22. Each has a `-tint` for backgrounds. Always pair with an icon or word.

## Fonts

| Role | Font | Fallback |
| --- | --- | --- |
| Display, map labels, province names | Crimson Text 400, 600, 700, italic | Georgia, serif |
| UI, body, numbers | Source Sans 3 (variable 200 to 900) | system-ui, sans-serif |

Both are on Google Fonts under the SIL Open Font License. Serve them from `fonts/` instead of linking Google, so student devices make no third-party requests. Use `font-variant-numeric: tabular-nums` for all scores and money.

Province names use spaced capitals (`--tracking-caps`). Crimson Text has no true small caps, so use uppercase with letter spacing. Keep caps to short labels only.

## Type scale

Set `html { font-size: 150% }` on the board and `100%` on dashboards. Tokens are in rem.

| Token | Board | Phone | Use |
| --- | --- | --- | --- |
| `--fs-xs` | 19 px | 13 px | Captions, legends |
| `--fs-sm` | 22 px | 14 px | Secondary text |
| `--fs-base` | 24 px | 16 px | Body |
| `--fs-md` | 30 px | 20 px | Card titles |
| `--fs-lg` | 38 px | 25 px | Section heads |
| `--fs-xl` | 47 px | 31 px | Province name in panel |
| `--fs-2xl` | 59 px | 39 px | Phase banner |
| `--fs-3xl` | 73 px | 49 px | Big numbers (approval, seat totals) |

## The map

Layers, bottom to top. Only `provinces` takes taps. Every other layer has `pointer-events="none"`, so a tap on a label, lake, mountain or city lands on the province under it (tested in Chromium).

| Layer id | Contents |
| --- | --- |
| `ocean` | Sea, water lining |
| `neighbour` | `#southern-republic`, greyed |
| `provinces` | `#prov-<id>`, `data-province="<id>"`, class `bm-prov`. One path each, islands included. Borders share exact vertices. |
| `terrain` | Ice, tundra, grass, fields, forest, rainforest, mountains |
| `lakes`, `rivers` | Great lakes, shield lakes, rivers (`data-river`) |
| `borders` | `#coastline`, `#border-provincial`, `#border-national` |
| `graticule` | Faint parallels and meridians |
| `overlay` | Empty. Draw selection outlines and trade routes here. |
| `capitals` | One city per province, plus the federal capital star (Corvell, Capital District) |
| `labels` | Provinces, seas, features |
| `ridings` | Hidden. One square per riding (`data-riding` from game-data), grouped by province. |
| `anchors` | `<circle class="anchor" data-province cx cy r="0">` for badges and route ends |
| `badges` | Empty. Draw approval badges and alerts here. |
| `decoration` | Cartouche with scale bar, compass rose, frame |

Scale: 1 map unit = 3.5 km. Mock Lambert conic: parallels are arcs, meridians meet at a pole above the sheet.

### States

| State | What changes |
| --- | --- |
| Idle | Province tints from tokens. All labels on. |
| Pressed (finger down) | Add `is-pressed` to the path: fill-opacity 0.8. Remove on release. |
| Selected | Add `has-selection` to the `<svg>` and `is-selected` to the path. Others fade to 55 percent. In `#overlay`, add two `<use href="#prov-id">`: `bm-select-halo` then `bm-select` (ink, 4 px). Open the province panel. Tap the sea to clear. |
| Trade route | Quadratic curve between two anchors, bowed 18 percent of its length to the north. Draw `bm-route-halo` then `bm-route` with `--route` set to the resource colour. Pending offer: add `is-pending` (grey, still). Accepted: dashes move toward the buyer for 3 cycles, then stop. Place a resource chip at the midpoint. |
| Election results | Show `#ridings`. Fill each `.seat` with its winner's party colour as results arrive, one riding every 250 ms. When a province is done, fill the province with the tint of the party that won most of its seats. Tie: `--party-none`. Add a hatch overlay (`<use>` with `fill="url(#bm-hatch-N)"`) so party is readable without colour. |
| Scarcity alert | Badge at the anchor: resource icon, short word ("Food short"), `--status-bad`. Add `bm-alert-ring` around the province in `#overlay`. It fades in once over 700 ms and then stays still until solved. |
| Thumbnail (phones) | Add `bm-thumb` to the `<svg>`. Hides terrain, graticule, minor labels, sea names, city names, decoration. Shapes and province names stay. |

## Board layout (1920x1080)

```
+----------------------------------------------------------------------------------------------+
| PHASE 1: ECONOMY   Year 3 of 6   1 Income > [2 Trade] > 3 Local issue        Class 8C  Saved |  72
+----------------------------------------------------------------------+-----------------------+
|                                                                      | PROVINCE PANEL        |
|                                                                      | [crest] VALCOURT      |
|                         MAP  1382 x 864                              | atlas line            |
|                                                                      | Approval 61%  +2      |
|           approval badges at anchors, routes in overlay              | Energy 12  Food 7     |
|                                                                      | Materials 9  $B 40    |
|                                                                      | This year's choices   |
|                                                                      |               538 px  |
+----------------------------------------------------------------------+-----------------------+
| NEWS   Drought in Goldplain: food down 3   |   Valcourt sells power to Lakemoor   |   ...     |  56
+----------------------------------------------------------------------------------------------+
| [ < Back ]   [ Pause timer 04:12 ]   [ Reveal ]   [ Next step > ]                [ Teacher ] |  88
+----------------------------------------------------------------------------------------------+
```

- Teacher control bar: buttons at least 72 px tall, labels in words, primary action ("Next step") on the right and largest.
- News strip: one item at a time, swaps every 8 seconds with a fade. It never scrolls sideways.
- If devices fail, the province panel shows everything a group needs, so the board runs alone.

## Phone dashboard (360 to 430 px wide)

```
+--------------------------------+
| [crest] VALCOURT          61%  |  sticky header, province strong colour bar
| Approval  ########----   +2    |
+--------------------------------+
| Energy | Food  | Mater. | $B   |  icon, number, word
|   12   |   7   |   9    |  40  |
+--------------------------------+
| YEAR 3   STEP 2 OF 3: TRADE    |
| Task card, 2 to 3 short lines  |
| [      Big main button      ]  |  48 px minimum
+--------------------------------+
| ! Food short by 2              |  status-bad tint
+--------------------------------+
| Mini map (bm-thumb)            |
+--------------------------------+
| Home | Budget | Trade | News   |  bottom tabs, 56 px
+--------------------------------+
```

On tablets and laptops (768 px and up), put the task card and mini map side by side.

## Motion

- Subtle and slow. No flashing, no blinking, no shaking. Nothing repeats more than once a second.
- Durations: 150 ms (press), 300 ms (panels), 700 ms (recolour, alert fade), 1800 ms (one route cycle).
- One easing curve: `--ease`.
- Animate only for a reason: a change of state, a trade, a result.
- `prefers-reduced-motion`: all durations drop to 0 and routes draw as still solid lines.

## Accessibility

- Colour is never the only cue: province names on the map, party names plus hatch patterns, resource icons plus words, status icons plus words.
- Body text meets WCAG AA on paper and raised paper. Energy (#B8740A, 3.2:1) is for icons only. Write the number next to it in ink.
- Touch targets: 48 px minimum on phones, 72 px on the board control bar. Provinces are large. The smallest tappable part of a province is a whole region, not an islet.
- The SVG has a title and description. Each province has a `<title>`. For keyboard use, the app adds `tabindex="0"`, `role="button"` and `aria-label` to each province path.
- Projectors wash out colour. Province names carry a paper halo, and borders are drawn in ink, so shapes survive a dim projector.

## Province crests

Flat, two or three colours, buildable as simple SVG. No real flags, coats of arms, maple leaves or fleurs-de-lis. No Indigenous imagery anywhere.

| Province | Crest |
| --- | --- |
| Westhaven | A single cedar between two snow peaks, over three wave lines. |
| Ridgeland | A half sun rising behind a three-step foothill ridge. |
| Goldplain | Three wheat stalks in a fan above a long, low horizon line. |
| Lakemoor | A gear wheel resting on two lake waves. |
| Valcourt | Three river arches of a dam under one star. |
| Saltmarch | An anchor with a fish curled around its shaft. |
| Northreach | An eight-point north star above a jagged ridge line. |

## Province panel lines

| Province | Atlas entry |
| --- | --- |
| Westhaven | Rain falls on cedar forests west of the Spine Mountains, and ships from across the Western Sea crowd the harbour at Port Corran. |
| Ridgeland | East of the mountains the land turns dry and wide, and oil wells and cattle ranches share the foothills around Northgate. |
| Goldplain | Wheat and canola roll to the edge of the sky, and grain trains rumble out of Prairie Junction toward both coasts. |
| Lakemoor | Factories, banks and busy streets crowd the shores of the great lakes, home to the most people in Borealis and to the capital, Corvell. |
| Valcourt | The great Valcourt River runs past dams and aluminum plants to the gulf, and its people share their own language and culture. |
| Saltmarch | Fishing boats and shipyards fill the rocky coves and islands of the Eastern Sea, where families have lived for generations. |
| Northreach | Rock, lakes and tundra stretch to the Northern Sea, with rich mines and small towns spread across the largest province by far. |

## Decisions made

1. No province names changed. I added invented names for cities, water and land features (list below).
2. Cities: Port Corran (Westhaven), Northgate (Ridgeland), Prairie Junction (Goldplain), Port Vale (Lakemoor), Pontarel (Valcourt), Saltmarch Harbour (Saltmarch), Ironmere (Northreach). The federal capital is Corvell, labelled "Capital District". Northgate, Prairie Junction, Port Vale and Saltmarch Harbour come from riding names in `game-data.json`, so map and ridings match.
3. Water and land names: The Western Sea, The Northern Sea, The Eastern Sea (added), Frost Bay, Gulf of Valcourt, Kell Strait; Valcourt, Tamber, Sedge and Long rivers; Lakes Halden, Ostrel, Wren, Osier, Avenell, Great Slate Lake, Lake Sedgewater; Kell, Hallam, Corran and Greyhold islands; the Spine Mountains, the Coast Range, The Barrens, The Old Shield.
4. Saltmarch holds the Atlantic mainland in the north-east (a Labrador analog), the southern Atlantic peninsula, and the islands. Valcourt reaches north to Kell Strait.
5. Borders follow real Canadian logic: the southern border runs on a parallel, then through the middle of the great lakes and down the Valcourt River. Interior borders use parallels, meridians, the continental divide, the Tamber River and a watershed.
6. Ridings show as seat blocks (one square each), not as drawn sub-boundaries. 34 squares, ids from `game-data.json`. Rerun `tools/build_map.py` if ridings change.
7. Party colour slots are Saffron, Teal, Plum and Umber, assigned so none points to its real-world cousin.
8. Fonts are self-hosted, not linked from Google, so student devices contact no third party.
9. Crests avoid real symbols and any Indigenous imagery. Northreach art shows land and sky only.

Flag for the chief of staff (no change made in other files):

- `game-data.json` riding names `Westhaven Port` and `Valcourt Centre` could become `Port Corran` and `Pontarel` to match the map.
- `meta.capital` reads "Capital District (inside Lakemoor)". The map names the city Corvell. Suggest "Corvell (Capital District)".

## Escalate to Ben

No map or visual decision needs Ben. One optional review:

- Ben draws accurate fantasy maps himself. Options: (a) ship this map as is; (b) Ben reviews coastlines and names in one 15-minute pass; (c) Ben redraws the terrain layer by hand and we drop it into `#terrain`. Recommendation: (b). The layer structure supports (c) later without code changes.
