"""Calibrate Standard spending baselines so each province starts near balance.
Prints Year 1 money at Standard settings with fair trade. Run with --write to
update spendingBaseline values in game-data.json."""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from engine import Game, load
from simulate import levels
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "game-data.json")
SPLIT = {"health": 0.32, "education": 0.26, "infrastructure": 0.20, "social": 0.22}
SPLIT_BY_PROVINCE = {"saltmarch": {"health": 0.37, "education": 0.19, "infrastructure": 0.19, "social": 0.25}}  # older population
MARGIN = {"ridgeland": 2.5, "goldplain": 2.0, "saltmarch": 0.8, "northreach": 0.6, "westhaven": 0.5}

def available(d):
    g = Game(d, 0); g.begin_year(None); g.income()
    g.trade_market(None, {p: 3 for p in g.provs})
    out = {}
    for pid, p in g.provs.items():
        dec = levels(); dec.update(system=3, policy="buy"); p.decision = dec
        f = g.finances(p, dec)
        avail = f["revenue"] + f["trade"] + f["worldSell"] - f["worldBuy"] - f["interest"]
        out[pid] = (p.gdp, f["revenue"], round(f["trade"], 1), round(avail, 1), round(f["balance"], 1), round(sum(f["spending"].values()), 1))
    return out, g.price

d = load(DATA)
av, price = available(d)
print("prices", price)
new = {}
for pid, (gdp, rev, tr, a, bal, sp) in av.items():
    pd = next(x for x in d["provinces"] if x["id"] == pid)
    target = (a - MARGIN.get(pid, 0)) / pd["costFactor"]
    # social cost is scaled by (0.5 + 0.1*unemployment) = 1.0 at 5%
    split = SPLIT_BY_PROVINCE.get(pid, SPLIT)
    b = {c: max(1.0, round(target * s * 2) / 2) for c, s in split.items()}
    new[pid] = b
    print(f"{pid:10} GDP {gdp:4} rev {rev:3} trade {tr:6} avail {a:6} now-spend {sp:5} bal {bal:6} -> baseline {b} sum {sum(b.values())}")
if "--write" in sys.argv:
    s = open(DATA).read()
    for pid, b in new.items():
        pat = re.compile(r'("id": "%s".*?"spendingBaseline": )\{[^}]*\}' % pid, re.S)
        s = pat.sub(lambda m: m.group(1) + json.dumps(b), s, count=1)
    open(DATA, "w").write(s)
    av2, _ = available(load(DATA))
    for pid, v in av2.items():
        print("after", pid, "balance at Standard:", v[4])
