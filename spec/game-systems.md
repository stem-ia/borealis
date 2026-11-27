# Borealis: game systems

Design for the build engineer, the map designer and the teacher. Every number lives in `spec/game-data.json`. Every Phase 1 formula is implemented in `spec/balance/engine.py`, the reference engine to port to plain JS. Status: draft 1, balanced (section 14).

Aligned with `spec/curriculum.md` (round order, roles, period plan, party slip, 3 senators, Student Vote). Outcome codes (EK1, PK9, ...) are the curriculum designer's.

## Contents

1. Core loop and phase flow
2. Phase 1 economy
3. Provincial budget
4. Indicators
5. Economic system spectrum
6. Trade
7. Local issue and national event cards
8. Approval rating
9. Bridge crisis (P9)
10. Phase 2 politics
11. Win, fairness and catch-up
12. Teacher controls
13. Formula reference
14. Balance test and results
15. Notes for the team
16. Decisions made
17. Escalate to Ben

---

## 1. Core loop and phase flow

### The whole unit

| Period | Stage | What happens in the game | Whiteboard link |
| --- | --- | --- | --- |
| 1 | Launch | Board tour. Join province. Year 0 practice round, no score. | "7 territories (4)", "Each group plays as the provincial gov." |
| 2-7 | Phase 1: Years 1-6 | One fiscal year per period. New controls appear one lesson at a time (table below). | "1. Income 2. Free trade 3. Local issue", "Approval rating", "Energy, Food, Materials, Money" |
| 8 | Phase 1 review | Board read-only. State of the Province reports. Awards. | Approval rating |
| 9 | Bridge crisis | Great Narrows Bridge falls. Pledge rounds. Provinces fall short. Federal Parliament forms. | Bridge to Phase 2 |
| 10 | Parties | 4 party cards. Secret choice slip. Caucus votes leader and ranks planks. | "Presented with 4? Federal parties", "Vote themselves into a party" |
| 11 | Platforms and ridings | Top 3 planks become the platform. Set budget levers. Regional promise. Riding candidates. | |
| 12 | Campaign | Campaign actions by riding. All-candidates debate. Endorsements. | |
| 13 | Election and government | Student Vote. Results riding by riding. Confidence vote if minority. Cabinet, shadow cabinet, senators. | |
| 14 | Parliament | Cabinet drafts the budget bill (C-1). Question Period. | "Bills + issues" |
| 15 | Budget vote | Debate, amendments, House vote, Senate, Royal Assent. Year 7 resolves on every province dashboard. | "Bills + issues" |
| 16 | Debrief | History log replay. Budget Defence (curriculum). | |

### One fiscal year (one period, Phase 1)

| # | Step | Board | Group device | Minutes | Whiteboard |
| --- | --- | --- | --- | --- | --- |
| 0 | Headline | Teacher flips the national event card. Auto effects apply. | Event text | 2 | |
| 1 | Income | Production, prices, GDP for all 7. | My goods, my GDP, expected revenue | 2-3 | **1. Income** |
| 2 | Trade | Trade window timer. Routes draw on the map as deals close. | Propose, accept, counter, decline | 7-8 | **2. Free trade** |
| 3 | Local issue | Each province's card title shown. Teacher can read one aloud. | Read card, pick 1 of 2-3 choices. Pick the event response too. | 5-6 | **3. Local issue** |
| 4 | Budget | Who has confirmed. | Tax, 4 spending lines, system, shortage policy, Budget Speech | 7-8 | (Money) |
| 5 | Year-end results | Approval bars move. "Why it changed" per province. Headlines. | My results and the why breakdown | 2-3 | **Approval rating** |
| | Discussion and ledger | Teacher prompt from the card's debrief line | | rest of period | |

Total game time 25 to 30 minutes, leaving 25 for warm-up, mini-lesson, debrief and exit ticket, as `curriculum.md` plans.

### New controls by year (matches the lesson sequence)

| Year (period) | New on the dashboard | Lesson |
| --- | --- | --- |
| 1 (P2) | Income, trade, local issue, 4 spending lines (tax fixed at 30%) | Three economic questions |
| 2 (P3) | Economic system setting | Spectrum |
| 3 (P4) | Tax rate | Taxes and spending |
| 4 (P5) | Investment projects, borrow reason tag | Surplus, deficit, debt |
| 5 (P6) | Indicator compare view (two provinces side by side) | GDP, CPI, unemployment |
| 6 (P7) | Nothing new. Debt history chart is prominent. | Trade-offs and the long run |

---

## 2. Phase 1 economy

### Resources

| Resource | Kind | What it does |
| --- | --- | --- |
| Energy | Good | Needed each year. Shortage cuts next year's production and raises unemployment. |
| Food | Good | Needed each year. Shortage hits approval hardest and raises CPI. |
| Materials | Good | Needed each year. Infrastructure boosts use extra. Shortage slows production. |
| Money | Treasury | Taxes in, spending out. Pays for trades and world imports. Deficits become debt. |

Goods do not carry over. Anything not used or sold by year end is sold to the world at a low price. This stops hoarding.

### Starting provinces

Population is in millions and sets seats in Phase 2. Production, needs and services are game-scale. Spending baseline is the cost of each line at Standard.

| Province | Pop | Produce F / E / M | Need F / E / M | Services $B | GDP Y1 | Baseline H / Ed / In / So | Debt $B | Short on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Westhaven | 5 | 7 / 13 / 9 | 10 / 10 / 8 | 22 | 48 | 4.5 / 3.5 / 2.5 / 3.0 | 10 | Food |
| Ridgeland | 4 | 12 / 22 / 4 | 9 / 11 / 8 | 16 | 50 | 6.5 / 5.5 / 4.0 / 4.5 | -15 (savings) | Materials, price swings |
| Goldplain | 3 | 19 / 4 / 8 | 8 / 10 / 6 | 8 | 36 | 4.5 / 3.5 / 3.0 / 3.0 | 8 | Energy, Money |
| Lakemoor | 12 | 10 / 10 / 11 | 15 / 15 / 14 | 100 | 128 | 7.5 / 6.0 / 4.5 / 5.0 | 30 | Food, Energy, Materials |
| Valcourt | 7 | 11 / 18 / 9 | 12 / 12 / 8 | 26 | 60 | 7.0 / 5.5 / 4.5 / 5.0 | 25 | Food |
| Saltmarch | 2 | 12 / 6 / 3 | 8 / 7 / 5 | 10 | 29 | 3.0 / 1.5 / 1.5 / 2.0 | 10 | Energy, Materials, Money |
| Northreach | 1 | 1 / 3 / 12 | 5 / 6 / 4 | 10 | 24 | 1.5 / 1.0 / 1.0 / 1.0 (x1.3 cost) | 5 | Food, Energy, Money |

Every province is short on at least one resource (curriculum mechanic EK1). Every province starts within about $1B of balance at Standard settings with fair trade, except Ridgeland (+$3B, energy boom) and Goldplain (+$2B).

Citizen group shares (workers / families / businesses / seniors) are in the JSON. Notable: Saltmarch seniors 35%, Northreach workers 45%, Ridgeland businesses 25%.

### Production

```
production[good] = round( (base + shift) x systemProdMult x (1 + 0.02 x infraStock)
                          x (1 - 0.5 x lastYearEnergyUnmet) x (1 - 0.3 x lastYearMaterialsUnmet)
                          x event and card multipliers )
services = round( baseServices x growthIndex x (1 - 0.02 x max(0, unemployment - 5)) x card multipliers )
```

National event production hits are scaled by the system's shock multiplier (market 1.2, command 0.8).

### Prices (one national price per good)

```
price = clamp( totalNeed / totalProduction, 0.5, 2.0 ) x eventMultiplier, rounded to 0.1
```

Normal year: all three goods sit at 0.9. A drought pushes food toward 1.2 or more. The energy crash halves energy.

### Needs, consumption and scarcity

At year end each province uses its needs from what it produced plus what it traded for.

| If you are short | Shortage policy "Buy from the world" (default) | Shortage policy "Go without" |
| --- | --- | --- |
| Any good | Buy the gap at 1.3 x price. Costs Money. | Nothing bought. Unmet share recorded. |
| Food unmet | | Approval falls (20 x unmet share x group weight). CPI rises. |
| Energy unmet | | Approval falls (15 x). Next year: production down, unemployment up. |
| Materials unmet | | Approval falls (5 x). Next year: production down, unemployment up. |

Extra goods are sold to the world at 0.8 x price. Interprovincial trade beats both world prices.

### Worked example: Goldplain, Year 1, all Standard

| Line | Math | Result |
| --- | --- | --- |
| Production | Food 19, Energy 4, Materials 8 (mixed system, x1.0) | 31 units |
| Prices | All goods 0.9 | |
| GDP | 31 x 0.9 + 8 services | **$36B** |
| Revenue | 36 x 30% | **$11B** |
| Needs | Food 8, Energy 10, Materials 6 | Extra food 11, extra materials 2, short energy 6 |
| Trade | Sells 8.8 food + 1.7 materials (+$9.4B). Buys 6.7 energy, receives 6 after the 10% fee (-$6.0B) | **+$3.4B** |
| World | Leftover food sold at 0.72 | **+$1.8B** |
| Spending | 4.5 + 3.5 + 3.0 + 3.0 | **-$14.0B** |
| Interest | 8 x 6% | **-$0.5B** |
| Balance | 11 + 3.4 + 1.8 - 14.0 - 0.5 | **+$1.8B surplus**. Debt falls from 8 to 6.2. |

---

## 3. Provincial budget

### Levers (Budget step)

| Lever | Levels | Effect |
| --- | --- | --- |
| Tax rate | 20, 25, **30**, 35, 40 % of GDP | Revenue. Higher tax: approval down (businesses most), growth -0.5 per level, unemployment +0.5 per level. |
| Healthcare | Deep cut, Cut, **Standard**, Boost, Big boost (x0.6 to x1.4 of baseline) | Seniors, families. Softens flu events. |
| Education | same | Families. Skill +1 per level above Standard each year. Skill adds growth and cuts unemployment later. |
| Infrastructure | same | Businesses, workers. Infra stock raises goods production. Uses extra materials. Jobs now. |
| Social programs | same | Workers, families, seniors. Cost rises with unemployment: x(0.5 + 0.1 x unemployment). |
| Economic system | Move 1 step per year | Section 5 |
| Shortage policy | Buy from world / Go without | Section 2 |
| Investment project (Year 4+) | Optional, one per year | Power plant, Modern farms, Tech college, Highway. Cost 40% of revenue. Permanent gain. |
| Borrow reason (Year 4+) | Crisis / Investment | Required tag when the preview shows a deficit. Logged for the ledger and debrief (ES6, EK18). |
| Budget Speech | 1-2 sentences, read aloud | Teacher awards 0-3 reasoning points (section 11). |

The device shows a live preview: revenue, each cost, interest, surplus or deficit, and the new debt. Students see cause and effect before they confirm.

### Surplus, deficit, debt, interest

```
balance = revenue + tradeMoney + worldSales - worldBuys - spending - interest - project + cardMoney
debt    = debt - balance            (a deficit adds to debt, a surplus pays it down)
interest = debt x 6%   (9% when debt is above 80% of GDP; savings earn 2%)
```

| Debt rule | Trigger | What students feel |
| --- | --- | --- |
| Debt worry | Debt above 40% of GDP | Approval drifts down, businesses and seniors most |
| Interest squeeze | Interest above 10% of revenue | Extra approval loss. The interest line grows on the dashboard. |
| High interest | Debt above 80% of GDP | Rate jumps from 6% to 9%. "Lenders are nervous." |
| Credit limit | Debt above 90% of GDP, or last year's interest above 15% of revenue | Lenders say no. The Confirm button stays grey until the budget balances. The game never ends; the province must cut or tax. |
| Deficit worry | This year's deficit above 10% of revenue | Small approval loss. Deficits also add inflation (+1% per 10% of revenue, max +4). |

### Worked example: a crisis deficit

Westhaven, revenue $14B, spending $13.5B, interest $0.6B. The drought cuts its farms and it pays $1.9B more for food than last year. Balance = 14 - 13.5 - 0.6 - 1.9 = **-$2.0B deficit**. Debt goes from 10 to 12. Next year interest is 12 x 6% = $0.72B. The device asks: "Borrow reason: Crisis or Investment?" The ledger line writes itself: "We ran a $2B deficit because of the drought."

---

## 4. Indicators

| Indicator | Formula | Shown as | Moves when |
| --- | --- | --- | --- |
| GDP | Goods x price + services | $B and % change from last year | Production, prices, unemployment, growth |
| CPI | Starts 100. CPI x (1 + inflation / 100) each year | Number and yearly inflation % | Food or energy scarce, food or energy price high, big deficits |
| Unemployment | System base + shortage effects + tax and infra effects - skill + events, clamped 2 to 20% | % | Energy shortage, system, tax, infrastructure, education over time |
| Approval | Weighted average of 4 citizen groups | 0-100 with 4 group bars | Section 8 |

```
inflation = 2 + 10 x (foodPrice - 1) + 8 x (energyPrice - 1) + 20 x foodUnmet + 15 x energyUnmet
            + deficit effect + card effects, clamped -1 to 15
unemployment = systemBase + 10 x energyUnmet + 5 x materialsUnmet - 0.5 x (infraLevel - 3)
               + 0.5 x (taxLevel - 3) - 0.25 x skill + event and card effects
growth % (next year's services) = systemGrowth + 0.5 x (infraLevel - 3) - 0.5 x (taxLevel - 3) + 0.3 x skill + card effects
```

Worked example. Year 4 drought. Food price rises to 1.2, energy price is 1.0. A province goes without 10% of its food. Inflation = 2 + 10 x 0.2 + 8 x 0 + 20 x 0.1 = **6%**. CPI goes from 103 to 109. Seniors lose 1 approval per point above 3%: -3.

Board view: all 7 provinces in one table, sortable, with arrows. Year 5 adds a two-province compare card (SC4 exit ticket).

---

## 5. Economic system spectrum

The heart of the Grade 8 economics outcome. Every province picks a position from Year 2. The board shows all 7 on one strip (EK5).

| Step | System | Goods output | Growth / yr | Base unemployment | Shock hit | Who answers "what to produce?" | Approval per year |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Market | x1.08 | 3.5% | 6.5% | x1.2 | Prices. The market moves 3 units a year toward the highest-priced good. | Businesses +4, workers -2, seniors -1 |
| 2 | Market-leaning mixed | x1.04 | 2.75% | 5.5% | x1.1 | Mostly prices (2 units). You may move 1. | Businesses +2, workers -1 |
| 3 | Mixed (start) | x1.00 | 2% | 5% | x1.0 | Shared (market 1, you 2) | Seniors +1 |
| 4 | Command-leaning mixed | x0.97 | 1.25% | 4% | x0.9 | Mostly the plan. You move 3. | Workers +1, businesses -2 |
| 5 | Command | x0.94 | 0.5% | 3.5% | x0.8 | The plan. You move 4. | Workers +2, seniors +1, businesses -4 |

### The three questions on the dashboard

| Question | Market end | Command end |
| --- | --- | --- |
| What to produce? | Prices decide. The app moves production on its own and says why: "The market moved 2 Food to Energy because Energy sells for more." | Your planner arrows move production by hand. |
| How to produce? | Private businesses compete. More output (x1.08). | Government-owned farms and factories. Less output (x0.94). |
| For whom? | Those who can pay. Shortages hit workers, families and seniors 1.3x, businesses 0.5x. | Shared by plan. Shortages hit everyone 0.8x. Less personal choice. |

Moving production converts at 4 to 3 (moving 4 Food makes 3 Energy). Switching what you make is costly, so specialising and trading usually beats self-sufficiency. Shifts are capped at 40% of base output.

### Trade-offs students feel

| Market side | Command side |
| --- | --- |
| Higher GDP and growth | Lower unemployment, softer shocks |
| Businesses happy, workers and seniors less so | Workers happy, businesses unhappy |
| Shortages fall on people with less | Shortages shared, but less output overall |
| Production follows prices automatically | Production follows your plan, at a conversion cost |

Changing a step costs -1 approval with every group that year ("people are unsure what comes next"). Max one step per year.

**Traditional economy.** Not a step on the spectrum. A provincial government cannot switch a modern economy to custom. It appears on the Saltmarch card "The Fishing Grounds": keep the custom (traditional), sell licences (market) or set a catch limit (command). One card, three systems, a real non-Indigenous historical example from fishing villages. Matches curriculum decision 5.

---

## 6. Trade

### Flow on devices

1. **Propose.** Pick a partner province. Choose what you give and what you want (any goods and Money). A fair price meter shows the deal's value ratio at national prices (green inside 0.5 to 2.0, red outside).
2. **Partner inbox.** Accept, Counter (edit the amounts, back to sender) or Decline.
3. **Counters.** Up to 2 counters per offer. Then it expires.
4. **Accepted.** Goods and Money move at once. A route line animates on the board between the two provinces, thicker for bigger deals. The trade log on the board lists every deal.
5. **Window closes.** Teacher closes the window. Open offers expire.

Every interprovincial deal loses a 10% paperwork fee on the goods received ("each province has its own rules"). Even with the fee, a fair deal beats the world prices (buy 1.3x, sell 0.8x).

### Board-only and low-device mode: the Trade Desk

Two Trade Ministers walk up to the board, tap both provinces, enter the deal together and both tap Accept. Same rules, same log. This is also the default if BYOD sync is not approved (Escalation 1).

### Exploit guards

| Exploit | Guard |
| --- | --- |
| Hoarding to squeeze others | Goods do not carry over. Unsold goods go to the world at 0.8x. The world sells at 1.3x, so nobody can be held hostage. |
| Giving everything away to a friend | Every deal must send something back worth at least half (fair price band 0.5 to 2.0). Pure gifts are "Aid": max $5B or 5 units a year, logged on the board. |
| Two friendly groups trading in circles | The fee loses 10% on every pass, so circles lose value. All deals are public in the log. |
| Spamming offers | Max 3 open offers per province. |
| A deal that breaks a group | Teacher can undo any trade during the window (section 12). |
| Ganging up on one province | Allowed. It is politics. The world market sets a floor, so nobody is doomed. Discuss it. |

### Optional "Open Trade Pact" (Grade 9 flavour, not assessed)

Any 2 or more provinces may sign a pact on the board. Members skip the 10% fee with each other. No other effect. It previews the Phase 2 Open Trade Act (C-3) and the whiteboard's "Free trade".

---

## 7. Local issue and national event cards

All card text, choices and effects are in `game-data.json` under `cards`. Student text is short, second person, Grade 8 level. Each choice has a hint ("Businesses like this. Families do not.") but no numbers. Numbers show at Year-end in the why breakdown.

### Local issue cards: 24 (2 per province + 10 general)

| Province | Card 1 (Year 2) | Card 2 (Year 4) |
| --- | --- | --- |
| Westhaven | A Bigger Port? (public, private, no) | The Old Forest (log, protect, limited) |
| Ridgeland | A Pipeline to the Coast (yes, rules, no; touches Westhaven approval) | Save It or Spend It? (rainy-day fund, spend, tax cut) |
| Goldplain | The Potash Mine Offer (low tax, part public, no) | Small Towns Fading (invest, market, grants) |
| Lakemoor | Robots in the Factories (allow, retrain, ban) | Traffic Jam City (subway, fee, wait) |
| Valcourt | Sell the Hydro Power? (export, factories, lower bills) | Keep Our Culture Strong (fund, compete, partner) |
| Saltmarch | The Fishing Grounds (traditional, market, command) | The Shipyard Contract (borrow, private, close) |
| Northreach | New Mine, New Town (province builds, company builds, study) | The Cost of Living (subsidy, greenhouses, wait) |

General deck (Years 1, 3, 5, 6, drawn without repeats per province): Long Hospital Waits, Teachers Want a Raise, No Place to Live, A Tech Company Wants a Deal, The Old Town Bridge, Raise the Minimum Wage?, An Old Power Plant, Grocery Prices Are Up, A New Sports Arena, Not Enough Care Homes.

Card costs are a percent of the province's revenue, so a choice costs Saltmarch and Lakemoor the same share of their budget.

**Underdog draw.** From Year 2, the province with the lowest approval draws two local cards and picks one.

### National events: 11

| Default year | Event | Category (CK3 list) | Auto effect | Choices for every province |
| --- | --- | --- | --- | --- |
| 1 | none (calm tutorial year) | | | |
| 2 | New Technology Arrives | new technology | Services +5% (+8% if education was Standard or higher), unemployment +1 | Train, cut taxes for tech, protect old jobs |
| 3 | World Recession | recession | Services -8%, unemployment +2, energy and materials prices x0.85 | Stimulus, tighten, wait |
| 4 | Prairie Drought | drought | Food -30% Goldplain, -20% Ridgeland, -15% Westhaven | Aid farmers, waste less, let market handle it |
| 5 | Energy Prices Crash | price swing | Energy price x0.5. Ridgeland unemployment +2, services -10% | Sell cheap, cut and wait, grow factories |
| 6 | Interest Rates Rise | economic disruption | Interest +2 points for everyone | Pay down debt, keep going, sell a building |
| spare | Wildfire Season | disaster | Materials -30% and 15% of revenue in the west and north | Send firefighters, protect home, buy bombers |
| spare | Flu Season | health | Health cost +20%, unemployment +1, seniors -3 (only -1 if healthcare is Boost or more) | Free shots, close schools, personal choice |
| spare | Car Plants Close | economic disruption | Lakemoor and Valcourt unemployment and services hit | Retrain, Buy Borealis, let market sort it |
| spare | Newcomers Arrive | human migration | Food need +1, costs +5% for 2 years, services +3% from next year | Language and job help, basics, charities |
| spare | World Food Prices Jump | price swing | Food price x1.5 | Help families, push exports, nothing |
| spare | Conflict Overseas | war | Energy x1.3, materials x1.2, inflation +1 | Humanitarian aid, build own energy, nothing |

The default order follows the lesson plan: recession in the taxes lesson (revenue falls at the same tax rate), drought in the deficit lesson (a costly event tempts a deficit), the energy crash in the indicators lesson (hits provinces differently), rate rise in the long-run lesson (debt pressure). The teacher can swap any card before revealing it.

---

## 8. Approval rating

Approval is the score. It is the weighted average of 4 citizen groups. Each group wants different things, so no choice pleases everyone.

| Group | Wants | Dislikes |
| --- | --- | --- |
| Workers | Jobs, social programs, infrastructure | Unemployment, market systems, tax hikes |
| Families | Education, healthcare, steady prices | Inflation, cuts to schools |
| Businesses | Low taxes, infrastructure, market systems | Tax hikes, command systems, debt |
| Seniors | Healthcare, steady prices, stability | Inflation, debt, risky change |

### What moves a group each year

| Driver | Formula (per group) |
| --- | --- |
| Tax | taxLevelEffect [+1.2, +0.8, 0, -1.2, -2.5] x group tax weight (businesses 1.5, workers 1.0, families and seniors 0.7) |
| Spending | spendingLevelEffect [-2.5, -1.2, 0, +0.8, +0.9] x line weight for the group. Cuts hurt more than boosts help. |
| Change from last year | -0.7 per level cut or per tax level raised, x weights. People notice cuts. |
| System | approvalPerYear for the step, -1 extra in a year you change step |
| Shortages | -(20 x foodUnmet + 15 x energyUnmet + 5 x materialsUnmet) x system scarcity share |
| Jobs | Above 7%: workers -1 per point, families -0.5, businesses -0.3. Below 5%: workers +0.5 per point |
| Prices | Inflation above 3%: seniors -1, families -0.7, workers -0.5, businesses -0.3 per point |
| Debt | Section 3 table |
| Cards | Card and event approval effects |
| Reasoning | +0.5 per reasoning point (0-3) from the Budget Speech, all groups |

Then: `approval = approval + total; approval = approval + 0.15 x (50 - approval); clamp 5 to 95`. Approval drifts 15% of the way back to 50 each year. Gains need repeating; losses heal.

The Year-end screen shows a "why it changed" bar for each group, one segment per driver (ES4 Must).

### Worked example

Goldplain boosts healthcare to Boost and cuts infrastructure to Cut. Budget Speech earns 2 points.

| | Seniors (start 52) | Businesses (start 50) |
| --- | --- | --- |
| Healthcare Boost | +0.8 x 1.5 = +1.2 | 0 |
| Infrastructure Cut | 0 | -1.2 x 1.5 = -1.8 |
| Cut from last year | 0 | -0.7 x 1.5 = -1.05 |
| Mixed system | +1 | 0 |
| Reasoning 2 points | +1 | +1 |
| Total | +3.2 → 55.2 | -1.85 → 48.15 |
| Drift to 50 | 55.2 - 0.78 = **54** | 48.15 + 0.28 = **48** |

---

## 9. Bridge crisis (P9)

**The Great Narrows Bridge Falls.** It carries the national highway, railway and main power line between Goldplain and Lakemoor. It closes.

| Step | Minutes | What happens |
| --- | --- | --- |
| Headline | 3 | Board shows the fallen bridge. East-west trade fee rises by 25 points from now on. Goldplain and Lakemoor unemployment +1. |
| Pledge round 1 (secret) | 4 | Each province enters a pledge on its device or a slip. Rebuild cost: $60B. A province can pledge up to 60% of its last year's revenue (`pledgeCapPctRevenue`). All seven at the cap raise about $88B after six years, or about $70B if Phase 1 ends after Year 1 (12-period plan), so the bridge is buildable only if most provinces give a lot. Pledges are paid in Year 7 if the bridge gets built. |
| Reveal | 1 | Board shows the total against $60B. It almost always falls short. Provinces far from the bridge (Saltmarch, Northreach) pledge little but still use it. |
| Pledge round 2 (open) | 6 | Live pledges on the board. Groups argue. |
| Outcome | 1 | Short: pledges returned, bridge stays closed. Enough: a temporary bridge for 2 years that then needs $20B a year with nobody in charge of paying. |

Either way, the class sees the free-rider problem and the lack of anyone with power to tax nationally. This flows into "Four Ways to Decide" (curriculum P9) and the founding of a federal Parliament.

West region: Westhaven, Ridgeland, Goldplain, Northreach. East: Lakemoor, Valcourt, Saltmarch.

---

## 10. Phase 2 politics

### The four parties

Suggested short names. Colours belong to the visual designer. No party is a caricature: each has a real case and a real cost.

| Short name | Identity (one line) | Echoes | Spectrum |
| --- | --- | --- | --- |
| **Cornerstone** | Keep taxes low, keep government small, and build on what already works. | Conservative | 2 (market-leaning mixed), centre-right |
| **Forward** | Fair chances for everyone, with a government that steps in to help and keeps the books in check. | Centre-left liberal | 3 (mixed), centre-left |
| **Common Good** | Working people first. Share the wealth so nobody gets left behind. | Social democratic | 4 (command-leaning mixed), left |
| **Evergreen** | Protect the land, water and air, and build an economy that lasts for our grandchildren. | Green | 3 (mixed), centre-left |

Pure market (1) and pure command (5) have no party. Mainstream parties in a multiparty democracy sit near the middle; the extremes stay as Phase 1 settings for comparison.

### Platform planks (4 each)

| Party | Plank 1 | Plank 2 | Plank 3 | Plank 4 |
| --- | --- | --- | --- | --- |
| Cornerstone | Lower taxes for everyone (tax 2) | Balance the budget (deficit 0%) | Provinces know best (transfers, no strings; health 3) | Build with business (bridge by private partner with tolls) |
| Forward | Health care you can count on (health 4) | Skills for good jobs (education 4) | Fair, steady taxes (tax 3) | Rebuild the bridge now (borrow, fast; infrastructure 4) |
| Common Good | Support for seniors and families (social 5) | Food for every student (education 4) | Big companies pay their share (tax 4) | Share fairly across Borealis (equalization on) |
| Evergreen | A clean power grid (infrastructure 4, clean grid program) | Protect land, water and fish | Invest now for the future (deficit up to 20%) | Strong local communities (rural and northern connection program) |

Each plank has an appeal score per citizen group and some per province (for example "A clean power grid" is +2 in Valcourt and Westhaven, -2 in Ridgeland; "Share fairly" is +3 in Saltmarch and Northreach, -1 in Lakemoor and Ridgeland). All in the JSON.

### Joining a party and shaping it (P10-P11)

| Step | How | Data stored |
| --- | --- | --- |
| Join | Secret slip, 1st and 2nd choice (curriculum decision 8). The teacher balances parties to 6-8 members. When moving someone to a 2nd choice, spread members across provinces. Any student may ask for random assignment. | Member count per party per province. No names. |
| Caucus | Students sit with their party for party work. Province stays their riding. One device per caucus. | |
| Leader | Secret caucus vote. Majority wins. Tie: run-off between top two, then coin flip on the board. | Leader's home province only |
| Priorities | Every member ranks the 4 planks. Borda count. Top 3 are the platform. The 4th is left out of this campaign. | Ranking |
| Promises with a price tag | Top 3 planks set budget levers. The caucus sets the rest and sees the platform's deficit. A platform deficit above 15% of federal revenue costs credibility with businesses and seniors (-2 appeal). | Levers |
| Regional promise | Pick 1 of 7 (one per province, for example "Protect Valcourt's language and culture", "Lower northern living costs"). +3 appeal in that province. | Promise id |
| Riding association | Members from each province confirm that province's candidate. If a party has no member there, the caucus names a volunteer candidate. | "Candidate confirmed" per province |

### Ridings: the House of Commons

34 seats, 1 per million people. Majority: 18. Each riding has a type that sets its citizen group mix.

| Province | Seats | Riding types |
| --- | --- | --- |
| Lakemoor | 12 | 5 city, 4 suburb, 2 town, 1 rural (includes Capital District) |
| Valcourt | 7 | 2 city, 2 suburb, 2 town, 1 rural |
| Westhaven | 5 | 2 city, 1 suburb, 1 coastal, 1 resource |
| Ridgeland | 4 | 2 city, 1 rural, 1 resource |
| Goldplain | 3 | 1 city, 2 rural |
| Saltmarch | 2 | 1 town, 1 coastal |
| Northreach | 1 | 1 resource |

Lakemoor alone has 12 of 18 needed. Students discover why parties campaign hard in big provinces, and why Valcourt's regional promise and the Senate matter to smaller regions.

### Campaign (P12)

Each party has 12 campaign actions, named after real civic engagement (CK5).

| Action | Cost | Effect |
| --- | --- | --- |
| Door knocking | 1 | +2 appeal in one riding |
| Flyers | 1 | +1 in two ridings of one province |
| Phone calls | 1 | +1 in any one riding |
| Rally | 2 | +1 in every riding of one province (members only) |
| Get out the vote | 0 | +3% turnout in your home riding. No party gains. Anyone can do it (CS4). |

Campaign appeal is capped at +4 per party per riding.

**All-candidates debate.** 60-second pitch per party, one question from each rival. Every student then endorses the best pitch from a party that is not their own. Endorsement rank gives +2 / +1 / 0 / 0 appeal everywhere. The teacher may add +1 for the clearest reasoning.

### Election model (P13)

For each riding, for each party, for each citizen group:

```
appeal = 10
       + sum over the top 3 planks: rankWeight x plank appeal for the group x 1.5 if the plank addresses one of the province's 2 issues
       + sum over the top 3 planks: rankWeight x plank appeal for the province
       + 3 if the party's regional promise is this province
       + campaign appeal in this riding (max 4)
       + 2 if the party leader's home province
       + debate momentum (0 to 3)
       + 0.5 per Student Vote ballot for the party in this province (studentVoteSwing)
       - credibility penalty (businesses and seniors -2 if platform deficit > 15%)
       minimum 1
rankWeight = [2, 1.5, 1, 0]
riding share for a party = sum over groups: riding mix[group] x appeal / (sum of all parties' appeal for that group)
winner = highest share (first past the post)
```

**Province issues tie seats to Phase 1** (curriculum fairness Must). Each province gets its 2 top issues from its Phase 1 end state: debt above 60% of GDP, unemployment 7% or more, CPI up 12 or more, healthcare at Standard or below for 3+ years, food or energy short in 2+ years, GDP growth under 8%, plus "bridge" for Goldplain and Lakemoor and "regional" for Valcourt, Saltmarch and Northreach. Planks that address a province's issues count 1.5x there. A province that ran up debt rewards "Balance the budget"; one with long hospital waits rewards "Health care you can count on".

**Student Vote.** Each student votes by secret ballot in their home province, after a riding card check at the polling table (CK2). Ballots are counted per province (counts only) and add +0.5 appeal each to that party in that province. Ballots per province are capped at that province's voters (its party members, default 4). A whole riding voting one way moves a party about 2 to 3 points of vote share: enough to tip a close race, not enough to win a riding without a platform and campaign. (App check, 20 games: 4 same-party ballots changed the winner in 18% of riding tests, largest gain 2.7 points.)

**Results reveal.** The board lights ridings province by province, smallest first, Lakemoor last. Seat count bar fills toward 18.

**Debrief extension: a different system.** The board can show the same votes under proportional representation: national vote share x 34 seats, largest remainder. In testing, a party's seat share and vote share differ by about 13 points on average under first past the post.

### Forming government

| Result | What happens |
| --- | --- |
| Majority (18+) | Governor General (the teacher) invites the leader to form government. |
| Minority | Governor General invites the party most likely to win a confidence vote, usually the largest. Its Throne Speech must pass a House vote. A partner party can support it in exchange for one of its planks added to the budget. If it fails, the next party is invited. |
| Government falls | A minority that loses the budget vote (C-1) falls. For time, the teacher explains what happens next (an election) and the class debriefs instead of running one. |

Votes in the House are seat-weighted. Each party votes as a bloc unless it allows a free vote. The whip counts votes beforehand. The board also tallies a class show-of-hands vote on the same bill (direct vs representative democracy, PK4).

**Roles.** Government: Prime Minister, ministers of Finance, Health, Education, Infrastructure, Social Programs, then backbenchers. Opposition: Leader of the Opposition (largest non-government party), shadow critics for each minister. Third and fourth parties: critics. Senate: 3 students recommended by the PM, sitting as independents. Governor General: the teacher.

**Question Period (12 minutes).** Each opposition party asks 2 questions. A minister answers in 60 seconds. The teacher awards 0-3 to each question and each answer: Claim, Evidence (a dashboard number), Trade-off named.

### Bills

| Bill | Required | Content | Confidence vote |
| --- | --- | --- | --- |
| C-1 Borealis Founding Budget Act | Yes | Federal tax, 4 national spending lines, bridge plan, equalization, programs. Starts from the governing party's platform levers. Each opposition party may move one amendment (one lever, one level). | Yes |
| C-2 Great Narrows Bridge Act | Optional | Fast (borrow, $30B for 2 years), steady ($12B for 5 years), partnership with tolls ($8B a year, toll fee on trade), or not yet. Use as a 10-minute warm-up bill, or fold it into C-1. | No |
| C-3 Open Trade Act | Optional (18-period plan) | Removes the 10% interprovincial fee. Grade 9 flavour, not assessed. Private member's bill. | No |

Stages shown on the board tracker: Cabinet drafts, first reading, debate and Question Period, amendments, House vote, Senate review (can send back one lever change once), Royal Assent. Grade 9 bill-stage detail is shown, not assessed.

### Federal budget (C-1)

Same shape as a province budget, so students transfer what they learned.

| Lever | Levels (cost $B per year) | Effect on provinces in Year 7 |
| --- | --- | --- |
| Federal tax | 4, 6, **8**, 10, 12% of national GDP (about $415B) | Approval (businesses most) and growth, both small |
| Health transfer | 0, 3, **5**, 7, 9 | Money to provinces by population. Seniors and families approval. |
| Skills and school food | 0, 2, **3**, 4, 5 | Skill, families approval, unemployment |
| National infrastructure | 0, 2, **4**, 6, 8 | Infra stock, growth, businesses approval |
| Seniors and families benefit | 0, 2, **4**, 6, 8 | Seniors, families, workers approval |
| Bridge | fast 30, steady 12, partnership 8, none 0 | Reopens the bridge (fee back to 10%) or approval loss in Goldplain and Lakemoor |
| Equalization | off, or $6B pool | Paid to provinces whose revenue at 30% tax cannot cover Standard spending, split by the size of the gap |
| Programs | Clean power grid $4B, Rural and northern connection $3B | Energy production in Valcourt, Westhaven, Lakemoor; growth in Goldplain, Saltmarch, Northreach |

At Standard levels with the steady bridge, revenue ($33B) and spending (about $34B with equalization) are close, so every party's choices show up as a clear surplus or deficit. Federal debt starts at 0 (or $10B savings if the class goal was met).

**Year 7 (P15, 5 minutes).** After Royal Assent the board runs one fast fiscal year. Provinces keep their Year 6 budgets (provinces at the credit limit are auto-balanced). Transfers arrive as Money. Federal effects apply. Each dashboard shows the approval change with a "federal" segment in the why bar. This closes the loop from Parliament back to the provinces.

---

## 11. Win, fairness and catch-up

**No single winner.** Approval is the score, shown live. The board never shows a ranked leaderboard.

| Award (end of Phase 1) | Rule |
| --- | --- |
| Most Trusted | Highest approval |
| Comeback | Biggest gain from the lowest point to the end of Year 6 |
| Best Explained | Most reasoning points |
| Fair Dealer | Most trades inside the fair price band |
| Steady Hands | Smallest rise in debt compared with GDP, approval above 45 |
| Sharpest Question (Phase 2) | Highest Question Period score |

**Class goal: Strong Borealis.** If national average approval is 55 or more after Year 6, the new federal government starts with $10B in the bank. Everyone wins or loses this together.

**Reasoning points.** Each year the Citizens' Advocate reads a 1-2 sentence Budget Speech. The teacher taps 0-3: 1 = says what you chose; 2 = plus why, using a number; 3 = plus who pays or loses. Each point adds 0.5 approval to every group. Any group can earn these, whatever its resources.

**Catch-up mechanics.**

| Mechanic | Effect |
| --- | --- |
| Drift to 50 | Approval moves 15% back toward 50 every year. Low provinces climb back; high ones must keep earning. |
| Underdog draw | Lowest approval picks from 2 local cards. |
| World price floor and ceiling | No province can be starved or held hostage by others. |
| Credit limit, not bankruptcy | Debt forces a balanced budget. It never ends the game. |
| Comeback award | Rewards recovery, not just level. |
| Reasoning points | Earned by explaining, not by having oil or farmland. |
| Phase 2 equalization | A party can promise transfers to the provinces that fell behind. |

---

## 12. Teacher controls

Designed for a teacher with mixed tech confidence. Big buttons, one obvious next action, every action undoable.

### Always on the board (top bar)

| Control | What it does |
| --- | --- |
| Class switcher | 8C or 8D. Each class has its own saved game. Auto-save after every step. Resume on any day. |
| Step tracker | Shows Year, step and what is next. |
| **Next step** | Big button. Advances the round in order. Asks "Two provinces have not confirmed. Continue?" when needed; unconfirmed provinces keep last year's settings. |
| Back | Undo the last step (returns to the previous step with state restored). |
| Timer | Start, pause, +1 minute. Visible to the room. |
| Pause | Freezes all devices and shows "Eyes up" on the board. |
| History log | Year-by-year log for each province. Printable. |

### Step controls

| Step | Teacher controls |
| --- | --- |
| Headline | Reveal event (card flip). Swap card (before reveal). Skip event. |
| Trade | Open window, close window. Undo any trade from the log. Trade Desk for board entry. |
| Local issue | Read card aloud (enlarge). Enter a choice for a province (board-only mode). |
| Budget | See who has confirmed. Open any province's budget panel to enter a Decision Slip. |
| Year-end | Award reasoning points (0-3 per province). Show "why it changed". Show indicator table. |
| Any time | Override: tap any number on a province panel, type a new value and a reason. Logged in the history. |

### Phase 2 board screens

Party setup (member counts per province), leader vote tally, platform builder per caucus, campaign map (actions per riding), endorsements tally, Student Vote tally by province, results reveal, seat count and vote-share vs seat-share view, Parliament seating chart, bill stage tracker, seat-weighted vote tally next to the class show-of-hands tally, Year 7 run.

### Board-only mode

Every step works from the board. Groups fill paper Decision Slips (trade offers, card choice, tax and spending levels). The Premier brings the slip up; the teacher or a student Clerk taps it in using the same province panel. Trades go through the Trade Desk.

---

## 13. Formula reference

Order of a fiscal year in the engine (`spec/balance/engine.py`):

1. **begin_year.** Year +1. Register national event auto effects. Apply permanent production changes and interest rate changes that start this year.
2. **income.** Production and services per province (section 2). National prices. GDP.
3. **trade.** Deals move goods (receiver loses the fee) and Money.
4. **choose.** Local issue and event response choices register their effects. Production and services effects from choices start next year.
5. **set_budget.** Store levels. System moves max 1 step. If the credit limit applies, the budget must balance.
6. **year_end**, in this order: needs (with infrastructure materials), world buys and sells, spending costs, interest, project, card money, balance and debt, inflation and CPI, skill and infra stock, unemployment, approval (all drivers, then drift and clamp), growth index, market shift and planner shift for next year, history record.

Key constants (all in `constants`):

| Constant | Value | Constant | Value |
| --- | --- | --- | --- |
| Tax rates | 20-40% | Interest | 6%, 9% above 80% debt/GDP |
| Spending multipliers | 0.6, 0.8, 1.0, 1.2, 1.4 | Credit limit | 90% debt/GDP or 15% interest/revenue |
| Spending approval | -2.5, -1.2, 0, +0.8, +0.9 | Savings rate | 2% |
| Tax approval | +1.2, +0.8, 0, -1.2, -2.5 | World buy / sell | 1.3x / 0.8x price |
| Cut / tax hike penalty | -0.7 per level | Trade fee | 10% |
| Drift | 15% toward 50 | Fair price band | 0.5 to 2.0 |
| Reasoning | +0.5 per point | Shift conversion | 4 units become 3 |
| Infra materials | +15% of base need per level above 3 | Social cost | x(0.5 + 0.1 x unemployment) |

Effect schema, card schema and every other field are documented under `_schema` at the top of the JSON.

---

## 14. Balance test and results

`spec/balance/simulate.py` runs 6 fiscal years (plus a quiet Year 7) for all 7 provinces, 40 seeds per strategy, with random local card and event choices. `calibrate.py` sets Standard spending so each province starts near balance. `election.py` runs 2,000 random elections. Raw output: `results.txt`, `results-shuffled.txt`, `election-results.txt`.

### Strategies

| Strategy | Rule |
| --- | --- |
| balanced | Balance every year. Raise tax, then cut lines, until balance is 0 or better. Restore cuts with spare money. |
| flexible | Allow a deficit up to 4% of GDP to avoid cuts in a bad year, while debt is under 60% of GDP. Restore and boost only from a surplus. |
| invest | Tax 35%, healthcare and education Boost, deficit up to 3% of GDP, Tech college in Year 4. |
| max_spend | Every line Big boost, tax 25%. Forced to balance only at the credit limit. |
| austerity | Every line Cut, tax 30%. |
| market | Balanced, moving to Market (step 1) one step a year. |
| command | Balanced, moving to Command (step 5), planner moves goods when a needed good is expensive. |
| random | Random levels, random system walk, joins trade 60% of the time. |
| no_trade | Balanced, never trades with other provinces (world market only). |

### Final approval after Year 6 (mean of 40 seeds)

| Strategy | Westhaven | Ridgeland | Goldplain | Lakemoor | Valcourt | Saltmarch | Northreach | Avg | Spread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| balanced | 44 | 53 | 48 | 47 | 43 | 50 | 50 | 48 | 9 |
| flexible | 52 | 55 | 51 | 54 | 50 | 54 | 54 | 53 | 5 |
| invest | 52 | 53 | 48 | 53 | 47 | 52 | 52 | 51 | 5 |
| max_spend | 48 | 60 | 38 | 58 | 32 | 37 | 56 | 47 | 28 |
| austerity | 41 | 41 | 40 | 40 | 41 | 40 | 40 | 40 | 2 |
| market | 46 | 53 | 43 | 46 | 41 | 46 | 49 | 46 | 12 |
| command | 36 | 53 | 49 | 43 | 36 | 51 | 49 | 45 | 16 |
| random | 35 | 37 | 33 | 37 | 31 | 34 | 34 | 34 | 6 |
| no_trade | 35 | 43 | 32 | 31 | 38 | 40 | 25 | 35 | 19 |

### Debt and money (national averages)

| Strategy | Net debt % of GDP, Year 6 | Interest % of revenue, Year 6 | GDP growth over 6 yrs | Unemployment Y6 | CPI Y6 | Approval after Year 3 |
| --- | --- | --- | --- | --- | --- | --- |
| balanced | 4 | 3% | 7% | 5.4% | 103 | 50 |
| flexible | 9 | 4% | 8% | 4.8% | 103 | 53 |
| invest | 17 | 6% | 9% | 4.0% | 106 | 53 |
| max_spend | 73 | 21% | 15% | 2.7% | 111 | 52 |
| austerity | -10 | 3% | 4% | 6.9% | 107 | 44 |
| market | 1 | 3% | 8% | 6.8% | 101 | 49 |
| command | 2 | 3% | 6% | 4.1% | 106 | 48 |
| no_trade | 12 | 4% | 4% | 7.1% | 106 | 42 |

### Checks (all pass with the default event order)

| Check | Result |
| --- | --- |
| No province doomed under sensible play (mean final approval 30+) | Lowest 36 |
| Careless play stays in the game (mean 15+) | Lowest 25 (Northreach, no trade) |
| No runaway (mean 80 or less) | Highest 60 |
| Sensible play never collapses (single-year low 15+) | Lowest 17 |
| Balanced spread across provinces 20 or less | 9 |
| Max spending feels good early, ends worse | Year 3: 52 vs 50 balanced. Year 6: 47 vs 53 flexible. |
| Debt follows you into Phase 2 | Max spending carries 21% of revenue in interest vs 4% for flexible |
| Crisis deficits beat a strict balance rule | Flexible 53 vs balanced 48 |
| Trading matters | No trade ends 13 points lower than balanced. Northreach loses most (-25), then Goldplain and Lakemoor (-16) |
| No dominant economic system | Market 46, command 45 |
| Market grows faster; command has fewer unemployed | GDP +8% vs +6%; unemployment 6.8% vs 4.1% |

**Shuffled event order** (recession, rate rise, conflict, newcomers, tech boom): 12 of 13 checks pass. One bad-luck seed drops a province to 13 in one year under sensible play before recovering.

### What this means for play

- **Deficits matter but do not end the game.** Borrowing through a bad year is the best plan. Borrowing every year feels good until Year 3, then interest and lenders take over.
- **Max spending is not equal everywhere.** It still edges ahead in Ridgeland (starts with savings), Lakemoor and Northreach by Year 6, but each enters Phase 2 with debt at 49-65% of GDP, and across all provinces max spending sends about a fifth of revenue to interest. In Valcourt, Goldplain and Saltmarch it is clearly worse. This is a strong debrief question: who can afford to borrow, and for how long?
- **Systems suit provinces differently.** Command does well in Goldplain and Saltmarch (stability, jobs) and badly in Westhaven and Valcourt (they live on growth and exports). Market is the reverse. No setting wins everywhere.
- **Trade is a lifeline for the small and the remote.** Northreach and Goldplain need it most.

### Election check (2,000 random elections on a Phase 1 end state)

| Party | Avg seats | Most seats (share of elections) | Shut out | Platform within credibility line |
| --- | --- | --- | --- | --- |
| Cornerstone | 9.3 | 28% | 2% | 100% |
| Forward | 9.0 | 34% | 5% | 26% (only if it drops "Rebuild the bridge now") |
| Common Good | 7.4 | 19% | 1% | 74% |
| Evergreen | 8.2 | 19% | 2% | 100% |

Majority governments: 31%. Minority: 69%. (Re-run 2026-11-27 with the Student Vote swing at 0.5.) Every party can win, every party can be shut out, and minorities are common enough to teach confidence votes.

### Re-running

```
cd spec/balance
python3 calibrate.py            # prints Year 1 money at Standard; --write updates baselines
python3 simulate.py --seeds 40  # Phase 1 strategies and checks
python3 simulate.py --seeds 40 --shuffle-events
python3 election.py --runs 2000
```

Python 3 standard library only. Any number change in the JSON should be followed by these runs.

---

## 15. Notes for the team

| For | Note |
| --- | --- |
| Map designer | Place the **Great Narrows Bridge** on the narrowest lake crossing between Goldplain and Lakemoor. The Capital District riding sits inside Lakemoor. 34 riding names and types are in `ridings`; Valcourt names are invented French-style names, not real places. Trade routes need anchor points per province. |
| Build engineer | Port `engine.py` function by function. Keep the year order in section 13. Store per class: game state, history log, member counts, ballots as counts. Never store names. Round goods to whole units and money to 1 decimal on screen. |
| Curriculum designer | Round order, control timing and event order follow your period plan. Traditional economy is on one Saltmarch card, as you decided. Student Vote adds a small swing (+0.5 appeal per ballot, capped at the province's voters), so it can tip a close riding but not win one alone. |
| Playtest reviewer | Watch for: Lakemoor max-spending, the Year 4 drought in Goldplain, Northreach groups that skip trading, Forward's bridge plank credibility trade-off. |

---

## 16. Decisions made

1. Six fiscal years (P2-P7), as in `curriculum.md`. The brief allowed 5 or 6.
2. Round order: Headline, Income, Trade, Local issue, Budget, Year-end. Matches the whiteboard (Income, Free trade, Local issue) and the curriculum plan.
3. New controls appear one lesson at a time. Tax is fixed at 30% in Years 1-2.
4. Money is in $B. Goods are game-scale units, not real quantities. Needs do not scale exactly with population so every province has real choices.
5. One national price per good, set by total need over total production.
6. Goods do not carry over. Leftovers sell to the world at 0.8x. The world sells at 1.3x. This blocks hoarding and sets a safety floor.
7. A 10% interprovincial paperwork fee, removable by an Open Trade Pact (Phase 1 flavour) or the Open Trade Act (Phase 2, optional).
8. Five-step spectrum. Traditional economy appears only on the Saltmarch fishing card.
9. Market moves production by price on its own; command and mixed let students move production by hand. Moving production converts 4 to 3.
10. Approval drifts 15% toward 50 each year, so no lead or deficit in approval is permanent.
11. Cuts hurt more than boosts help, and cutting from last year costs extra.
12. Credit limit replaces bankruptcy: lenders force a balanced budget. The game never ends for a province.
13. Card and project costs are a percent of revenue, so choices weigh the same in big and small provinces.
14. Reasoning points (0-3 per Budget Speech) add a little approval, so explaining well matters in the score.
15. Default event order matches the lesson plan. Wildfire, flu, plant closures, newcomers, food spike and conflict are spares.
16. Bridge crisis is a two-round pledge game for $60B. It usually falls short, but full cooperation can build it: each province may pledge up to 60% of its last year's revenue (about $88B in total after six years, $70B after one), paid in the first federal year if the bridge is built. (Changed 2026-11-27 after the playtest: a 30% cap made $60B impossible.)
17. Party join by secret slip with balancing, per curriculum decision 8. Leader by caucus vote. Platform = top 3 of 4 ranked planks.
18. Election by a citizen-group appeal model, first past the post. Seats are tied to Phase 1 through province issues. Student Vote counts as a small swing.
19. 34 seats (1 per million), majority 18. Senate of 3 students, Governor General is the teacher.
20. Federal budget uses the same tax rate and 4 lines as a province, plus bridge, equalization and 2 programs. Year 7 shows its effects on every province.
21. Three bills: C-1 budget (required, confidence), C-2 bridge (optional or folded into C-1), C-3 Open Trade (optional, Grade 9 flavour).
22. Party short names: Cornerstone, Forward, Common Good, Evergreen. Colours left to the visual designer.
23. Riding names avoid real municipalities.

---

## 17. Escalate to Ben

**1. Trading on devices depends on real sync.** (Same root issue as curriculum Escalation 2.) The trade flow in section 6 assumes group devices see each other's offers. `BroadcastChannel` only links tabs in one browser.

| Option | Effect |
| --- | --- |
| A | Default to the Trade Desk on the board: two Trade Ministers enter deals together. Devices show results only. No cost. |
| B | Approve a realtime service so offers flow device to device. Adds cost and a privacy review. |

**Recommendation: A for February-March 2027.** It is fully designed and also builds face-to-face negotiation. Revisit B after the playtest.

**2. Phase 2 group unit is the party caucus.** (Same as curriculum Escalation 3.) The election model, platform builder and campaign map need the app to treat a party as a group in P10-P15, with member counts only.

| Option | Effect |
| --- | --- |
| A | App supports party caucuses as groups. Province stays the riding. No names. |
| B | Parties work on paper; only votes and results go into the app. |

**Recommendation: A**, with B as the board-only fallback.

**3. Real-world sensitive cards in a Calgary classroom.** Ridgeland echoes Alberta. Some cards and planks touch live debates: the pipeline card, Evergreen's clean grid plank (-2 appeal in Ridgeland), Valcourt's language and culture card and regional promise. Each is written so every choice has a real case, but parents may read them as current politics.

| Option | Effect |
| --- | --- |
| A | Keep them. The teacher previews the deck. The teacher can swap any card before revealing it. |
| B | Replace the pipeline and culture cards with general cards for this run. |

**Recommendation: A.** They are strong Grade 8 trade-off cards and the swap control already exists. Ben's call because he knows the school community.
