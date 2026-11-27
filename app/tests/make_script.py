"""Writes parity-script.json: a fixed 6-year game (cards, trades, budgets) used by
parity.py and parity.mjs. Run once; the JSON is committed. No randomness at play time."""
import json, random
d = json.load(open("../data/game-data.json"))
r = random.Random(2027)
pids = [p["id"] for p in d["provinces"]]
general = [c["id"] for c in d["cards"]["localIssues"] if c["province"] is None]
cards = {c["id"]: c for c in d["cards"]["localIssues"]}
events = {e["id"]: e for e in d["cards"]["nationalEvents"]}
pools = {p: r.sample(general, len(general)) for p in pids}
years = []
for y in range(1, 7):
    ev = d["deck"]["nationalByYear"][str(y)]
    kind = d["deck"]["localByYear"][str(y)]
    yr = {"event": ev, "choices": [], "deals": [], "market": y % 2 == 1, "budgets": {}}
    for p in pids:
        card = pools[p].pop() if kind == "general" else d["deck"]["provinceCardOrder"][p][0 if kind == "province-1" else 1]
        yr["choices"].append([p, card, r.choice(cards[card]["choices"])["id"], False])
        if ev:
            yr["choices"].append([p, ev, r.choice(events[ev]["choices"])["id"], True])
    yr["deals"] = [["goldplain", "lakemoor", {"food": 4}, {"money": 3.5}],
                   ["ridgeland", "goldplain", {"energy": 3}, {"food": 3}],
                   ["northreach", "westhaven", {"materials": 3}, {"food": 1, "money": 1}]]
    for i, p in enumerate(pids):
        lv = lambda: r.choice([2, 3, 3, 4])
        b = {"tax": 3 if y < 3 else r.choice([2, 3, 4]), "health": lv(), "education": lv(), "infrastructure": lv(), "social": lv(),
             "system": None, "policy": "without" if (p == "saltmarch" and y == 3) else "buy", "reasoning": r.randint(0, 3), "project": None, "planner": []}
        if y >= 2:
            b["system"] = {"westhaven": "down", "valcourt": "down", "goldplain": "up", "saltmarch": "up"}.get(p, "stay")
        if y == 4 and p in ("northreach", "lakemoor"):
            b["project"] = "tech-college" if p == "lakemoor" else "power-line"
        if y >= 3 and p == "goldplain":
            b["planner"] = [["food", "energy", 2]]
        yr["budgets"][p] = b
    years.append(yr)
json.dump({"seed": 7, "years": years}, open("parity-script.json", "w"), indent=1)
print("ok")
