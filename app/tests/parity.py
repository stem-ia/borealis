"""Run the scripted game with the reference engine (spec/balance/engine.py). Prints JSON."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "spec", "balance"))
from engine import Game, load

def run():
    data = load(os.path.join(HERE, "..", "data", "game-data.json"))
    script = json.load(open(os.path.join(HERE, "parity-script.json")))
    g = Game(data, script["seed"])
    for yr in script["years"]:
        g.begin_year(yr["event"])
        g.income()
        if yr["market"]:
            g.trade_market(None, {pid: p.prev["infrastructure"] for pid, p in g.provs.items()})
        for a, b, give, get in yr["deals"]:
            g.trade_deal(a, b, give, get)
        for pid, card, ch, is_ev in yr["choices"]:
            g.choose(pid, card, ch, is_ev)
        for pid, b in yr["budgets"].items():
            p = g.provs[pid]
            dec = dict(b)
            dec["system"] = {"up": p.system + 1, "down": p.system - 1}.get(b["system"], p.system)
            dec["system"] = max(1, min(5, dec["system"]))
            dec["planner"] = [tuple(x) for x in b["planner"]]
            g.set_budget(pid, dec)
        g.year_end()
    return {pid: p.history for pid, p in g.provs.items()}

if __name__ == "__main__":
    print(json.dumps(run()))
