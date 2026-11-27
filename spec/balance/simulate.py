"""Balance test for Borealis Phase 1.

Runs 6 fiscal years for all 7 provinces under several strategies,
many seeds each, and prints a results table plus pass/fail checks.

Usage: python3 simulate.py [--seeds 40] [--md]
"""

import argparse
import os
import random
import statistics as st

from engine import Game, load, GOODS, CATS

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "game-data.json")
YEARS = 6
SHADOW_YEAR = 7  # one extra quiet year: shows the debt bill arriving (Year 7 runs in Phase 2)


def levels(tax=3, h=3, e=3, i=3, s=3):
    return {"tax": tax, "health": h, "education": e, "infrastructure": i, "social": s}


def balanced_levels(g, p, base_dec, year, allow_deficit_pct=0.0, up=True, up_floor=None):
    """Start from base_dec and step one level at a time until the year balances
    (deficit no bigger than allow_deficit_pct of GDP). With spare money, undo
    cuts first, then boost health and education."""
    d = dict(base_dec)
    floor = -allow_deficit_pct * p.gdp
    ufloor = floor if up_floor is None else up_floor
    tax_ok = year >= 3

    def bal(x):
        return g.finances(p, x)["balance"]

    for _ in range(20):
        b = bal(d)
        if b < floor:
            if tax_ok and d["tax"] < 4:
                d["tax"] += 1
                continue
            order = ["infrastructure", "social", "education", "health"]
            k = max(order, key=lambda c: (d[c], -order.index(c)))
            if d[k] > 1:
                d[k] -= 1
                continue
            if tax_ok and d["tax"] < 5:
                d["tax"] += 1
                continue
            break
        elif up and b > ufloor + 0.03 * p.gdp:
            low = [c for c in ["health", "education", "social", "infrastructure"] if d[c] < 3]
            trial = dict(d)
            if low:
                trial[low[0]] += 1
            elif tax_ok and d["tax"] > 3:
                trial["tax"] -= 1
            elif d["health"] < 4:
                trial["health"] = 4
            elif d["education"] < 4:
                trial["education"] = 4
            else:
                break
            if bal(trial) >= ufloor:
                d = trial
            else:
                break
        else:
            break
    return d


def force_balance(g, p, d, year):
    """Credit limit reached: cut the highest line (or raise tax) one level at a time."""
    d = dict(d)
    order = ["tax", "infrastructure", "social", "education", "health"]
    for _ in range(25):
        if g.finances(p, d)["balance"] >= 0:
            break
        if year >= 3 and d["tax"] < 4:
            d["tax"] += 1
            continue
        k = max(CATS, key=lambda c: (d[c], -order.index(c)))
        if d[k] <= 1:
            if year >= 3 and d["tax"] < 5:
                d["tax"] += 1
                continue
            break
        d[k] -= 1
    return d


def planner_moves(g, p):
    """Command planner heuristic: when a good the province lacks is expensive
    (price 1.2 or more), move units from a cheap good it has extra of."""
    bal = {x: p.prod[x] - g.need(p, x) for x in GOODS}
    dst = min(GOODS, key=lambda x: bal[x])
    src = max(GOODS, key=lambda x: bal[x])
    if bal[dst] < 0 and bal[src] > 3 and g.price[dst] >= 1.2 and g.price[src] <= 1.0:
        return [(src, dst, min(4, -bal[dst]))]
    return []


def decide(strategy, g, p, year, rng):
    sysnow = p.system
    if strategy == "max_spend":
        d = levels(2 if year >= 3 else 3, 5, 5, 5, 5)
    elif strategy == "austerity":
        d = levels(3, 2, 2, 2, 2)
    elif strategy == "random":
        d = {k: rng.randint(1, 5) for k in ["tax"] + CATS}
        if year < 3:
            d["tax"] = 3
    elif strategy == "flexible":
        ratio = p.debt / p.gdp if p.gdp else 0
        allow = 0.04 if ratio < 0.6 else 0.0
        d = balanced_levels(g, p, dict(p.prev), year, allow_deficit_pct=allow, up_floor=0.0)
    elif strategy == "invest":
        d = balanced_levels(g, p, levels(4 if year >= 3 else 3, 4, 4, 3, 3), year, allow_deficit_pct=0.03, up=False)
    else:
        d = balanced_levels(g, p, dict(p.prev), year)
    target = {"market": 1, "command": 5}.get(strategy)
    if target and year >= 2:
        d["system"] = sysnow + (1 if target > sysnow else -1 if target < sysnow else 0)
    elif strategy == "random" and year >= 2:
        d["system"] = max(1, min(5, sysnow + rng.choice([-1, 0, 0, 1])))
    else:
        d["system"] = sysnow
    d["policy"] = "buy"
    d["reasoning"] = rng.randint(0, 3) if strategy == "random" else 2
    d["planner"] = planner_moves(g, p) if strategy == "command" else []
    if strategy == "invest" and year == 4:
        d["project"] = "tech-college"
    return d


def run(strategy, seed, data, event_order=None):
    rng = random.Random(seed * 7919 + sum(map(ord, strategy)))
    g = Game(data, seed)
    deck = data["deck"]
    general = [c["id"] for c in data["cards"]["localIssues"] if c["province"] is None]
    pools = {pid: rng.sample(general, len(general)) for pid in g.provs}
    for y in range(1, SHADOW_YEAR + 1):
        ev = (event_order or deck["nationalByYear"]).get(str(y))
        g.begin_year(ev)
        g.income()
        # local issue and event response
        for pid, p in g.provs.items():
            kind = deck["localByYear"].get(str(y), "general")
            if kind == "general":
                card = pools[pid].pop()
            else:
                card = deck["provinceCardOrder"][pid][0 if kind == "province-1" else 1]
            ch = rng.choice(g.cards[card]["choices"])["id"]
            g.choose(pid, card, ch)
            if ev:
                ech = rng.choice(g.events[ev]["choices"])["id"]
                g.choose(pid, ev, ech, is_event=True)
        # trade first (students trade before the budget step), planned on last year's infrastructure level
        infra = {pid: p.prev["infrastructure"] for pid, p in g.provs.items()}
        if strategy == "no_trade":
            pass
        elif strategy == "random":
            parts = [pid for pid in g.provs if rng.random() < 0.6]
            g.trade_market(parts, infra)
        else:
            g.trade_market(None, infra)
        for pid, p in g.provs.items():
            dec = decide(strategy, g, p, y, rng)
            if g.must_balance(p):
                dec = force_balance(g, p, dec, y)
            g.set_budget(pid, dec)
        g.year_end()
    return g


def summarize(strategy, data, seeds, event_order=None):
    rows = {}
    for pid in [p["id"] for p in data["provinces"]]:
        rows[pid] = {"approval": [], "minAppr": [], "debtRatio": [], "gdpGrowth": [], "unemp": [], "cpi": [], "worldBuy": [], "y3": [], "y7": [], "interestShare": []}
    for sd in range(seeds):
        g = run(strategy, sd, data, event_order)
        for pid, p in g.provs.items():
            h7 = p.history
            h = h7[:YEARS]
            r = rows[pid]
            r["y7"].append(h7[-1]["approval"])
            r["interestShare"].append(100 * max(0, h[-1]["interest"]) / h[-1]["revenue"])
            r["approval"].append(h[-1]["approval"])
            r["minAppr"].append(min(x["approval"] for x in h))
            r["y3"].append(h[2]["approval"])
            r["debtRatio"].append(100 * h[-1]["debt"] / h[-1]["gdp"])
            r["gdpGrowth"].append(100 * (h[-1]["gdp"] / h[0]["gdp"] - 1))
            r["unemp"].append(h[-1]["unemployment"])
            r["cpi"].append(h[-1]["cpi"])
            r["worldBuy"].append(sum(x["worldBuy"] for x in h))
    out = {}
    for pid, r in rows.items():
        out[pid] = {k: (st.mean(v) if k != "minAppr" else min(v)) for k, v in r.items()}
    return out


STRATS = ["balanced", "flexible", "invest", "max_spend", "austerity", "market", "command", "random", "no_trade"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=40)
    ap.add_argument("--md", action="store_true")
    ap.add_argument("--shuffle-events", action="store_true")
    a = ap.parse_args()
    data = load(DATA)
    order = None
    if a.shuffle_events:
        evs = [e["id"] for e in data["cards"]["nationalEvents"]]
        r = random.Random(1)
        r.shuffle(evs)
        order = {"1": None, **{str(i): evs[i - 2] for i in range(2, 7)}}
        print("Event order:", order)
    res = {s: summarize(s, data, a.seeds, order) for s in STRATS}
    pids = [p["id"] for p in data["provinces"]]

    print("\nFinal approval after Year 6 (mean of %d seeds)" % a.seeds)
    print("| Strategy | " + " | ".join(p.capitalize() for p in pids) + " | Avg | Spread |")
    print("| --- |" + " --- |" * (len(pids) + 2))
    for s in STRATS:
        v = [res[s][p]["approval"] for p in pids]
        print("| %s | " % s + " | ".join("%.0f" % x for x in v) + " | %.0f | %.0f |" % (st.mean(v), max(v) - min(v)))

    print("\nLowest approval seen in any year, any seed")
    print("| Strategy | " + " | ".join(p.capitalize() for p in pids) + " |")
    print("| --- |" + " --- |" * len(pids))
    for s in STRATS:
        print("| %s | " % s + " | ".join("%.0f" % res[s][p]["minAppr"] for p in pids) + " |")

    print("\nNet debt as % of GDP after Year 6 (negative = savings)")
    print("| Strategy | " + " | ".join(p.capitalize() for p in pids) + " | Avg |")
    print("| --- |" + " --- |" * (len(pids) + 1))
    for s in STRATS:
        v = [res[s][p]["debtRatio"] for p in pids]
        print("| %s | " % s + " | ".join("%.0f" % x for x in v) + " | %.0f |" % st.mean(v))

    print("\nYear 7 shadow year (same habits, no event): approval, and interest as % of revenue at end of Year 6")
    print("| Strategy | " + " | ".join(p.capitalize() for p in pids) + " | Avg Y7 | Avg interest share |")
    print("| --- |" + " --- |" * (len(pids) + 2))
    for s in STRATS:
        v = [res[s][p]["y7"] for p in pids]
        print("| %s | " % s + " | ".join("%.0f" % x for x in v) + " | %.0f | %.0f%% |" % (st.mean(v), st.mean(res[s][p]["interestShare"] for p in pids)))

    print("\nGDP growth % over 6 years / final unemployment % / final CPI (national average)")
    print("| Strategy | GDP growth | Unemployment | CPI | World imports $B (6 yrs, avg province) | Approval after Year 3 |")
    print("| --- | --- | --- | --- | --- | --- |")
    for s in STRATS:
        print("| %s | %.0f | %.1f | %.0f | %.0f | %.0f |" % (
            s, st.mean(res[s][p]["gdpGrowth"] for p in pids), st.mean(res[s][p]["unemp"] for p in pids),
            st.mean(res[s][p]["cpi"] for p in pids), st.mean(res[s][p]["worldBuy"] for p in pids),
            st.mean(res[s][p]["y3"] for p in pids)))

    # checks
    print("\nChecks")
    allv = [res[s][p]["approval"] for s in STRATS for p in pids]
    smin = [res[s][p]["minAppr"] for s in ("balanced", "flexible", "invest", "austerity", "market", "command") for p in pids]
    sens = [res[s][p]["approval"] for s in ("balanced", "flexible", "invest", "austerity", "market", "command") for p in pids]
    mins = [res[s][p]["minAppr"] for s in STRATS for p in pids]
    bal = [res["balanced"][p]["approval"] for p in pids]
    nt = st.mean(res["no_trade"][p]["approval"] for p in pids)
    tr = st.mean(bal)
    ms = st.mean(res["max_spend"][p]["approval"] for p in pids)
    ms3 = st.mean(res["max_spend"][p]["y3"] for p in pids)
    b3 = st.mean(res["balanced"][p]["y3"] for p in pids)
    mk = st.mean(res["market"][p]["approval"] for p in pids)
    fx = st.mean(res["flexible"][p]["approval"] for p in pids)
    ms7 = st.mean(res["max_spend"][p]["y7"] for p in pids)
    msi = st.mean(res["max_spend"][p]["interestShare"] for p in pids)
    fxi = st.mean(res["flexible"][p]["interestShare"] for p in pids)
    fx7 = st.mean(res["flexible"][p]["y7"] for p in pids)
    cm = st.mean(res["command"][p]["approval"] for p in pids)
    checks = [
        ("No province doomed under sensible play: mean final approval >= 30", min(sens) >= 30, "%.0f" % min(sens)),
        ("Even careless play stays in the game: mean final approval >= 15", min(allv) >= 15, "%.0f" % min(allv)),
        ("No runaway: every mean final approval <= 80", max(allv) <= 80, "%.0f" % max(allv)),
        ("Sensible play never collapses: lowest single-year approval >= 15", min(smin) >= 15, "%.0f" % min(smin)),
        ("Debt follows you: max spending enters Phase 2 with 3x the interest burden of flexible", msi >= 3 * fxi, "%.0f%% vs %.0f%% of revenue" % (msi, fxi)),
        ("Balanced spread across provinces <= 20 points", max(bal) - min(bal) <= 20, "%.0f" % (max(bal) - min(bal))),
        ("Max spending feels good early (Year 3 >= balanced)", ms3 >= b3, "%.0f vs %.0f" % (ms3, b3)),
        ("Max spending ends worse than flexible", ms < fx, "%.0f vs %.0f" % (ms, fx)),
        ("Flexible (crisis deficits allowed) beats strict balance", fx > tr, "%.0f vs %.0f" % (fx, tr)),
        ("Trading matters: no-trade ends 4 to 15 points lower", 4 <= tr - nt <= 15, "%.1f" % (tr - nt)),
        ("Market vs command within 6 points (no dominant system)", abs(mk - cm) <= 6, "%.0f vs %.0f" % (mk, cm)),
        ("Market grows GDP faster than command", st.mean(res["market"][p]["gdpGrowth"] for p in pids) > st.mean(res["command"][p]["gdpGrowth"] for p in pids), ""),
        ("Command has lower unemployment than market", st.mean(res["command"][p]["unemp"] for p in pids) < st.mean(res["market"][p]["unemp"] for p in pids), ""),
    ]
    for name, ok, val in checks:
        print("- [%s] %s (%s)" % ("PASS" if ok else "FAIL", name, val))


if __name__ == "__main__":
    main()
