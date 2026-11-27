"""Election model check for Borealis Phase 2.

Implements the riding vote model in game-systems.md section 9 and runs many
random elections (random priority rankings, regional promises, campaign
spending, leaders, debate results and Student Vote ballots) on top of a
Phase 1 end state. Reports how often each party wins seats, how often the
result is a majority, and how far seat share drifts from vote share.

Usage: python3 election.py [--runs 2000]
"""
import argparse
import random
import statistics as st
from collections import Counter

from engine import load, GROUPS
from simulate import run, DATA


def province_issues(d, g):
    """Top issues per province from the Phase 1 end state (rules in game-data election.issueRules)."""
    out = {}
    for pid, p in g.provs.items():
        h = p.history[:6]
        last = h[-1]
        hits = []
        if last["debt"] / last["gdp"] > 0.6: hits.append("debt")
        if last["unemployment"] >= 7: hits.append("unemployment")
        if last["cpi"] >= 112: hits.append("cost")
        if sum(1 for x in h if x["levels"]["health"] <= 3) >= 3 and "health" not in hits: hits.append("health")
        if sum(1 for x in h if "food" in x["short"]) >= 2: hits.append("food")
        if sum(1 for x in h if "energy" in x["short"]) >= 2: hits.append("energy")
        if last["gdp"] / h[0]["gdp"] - 1 < 0.08: hits.append("growth")
        if pid in ("goldplain", "lakemoor"): hits.append("bridge")
        if pid in ("valcourt", "northreach", "saltmarch"): hits.append("regional")
        for f in d["election"]["issueFallbackOrder"]:
            if len(hits) >= 2: break
            if f not in hits: hits.append(f)
        out[pid] = hits[:2]
    return out


def platform_levers(d, party, ranking, national_gdp):
    """Resolve a party's federal budget from its ranked planks. Top priority wins conflicts."""
    fb = d["federalBudget"]
    lv = dict(fb["defaults"])
    lv["programs"] = []
    max_def = None
    planks = {pl["id"]: pl for pl in party["planks"]}
    ranking = ranking[:d["election"]["platformSize"]]   # the 4th-ranked plank is left out of the campaign
    for pid in reversed(ranking):          # lowest priority first, top priority last
        for k, v in planks[pid]["budgetLevers"].items():
            if k == "program": lv["programs"].append(v)
            elif k == "maxDeficit": max_def = v if max_def is None else min(max_def, v)
            else: lv[k] = v
    set_by_plank = {k for pid in ranking for k in planks[pid]["budgetLevers"]}

    def money(l):
        rev = national_gdp * fb["taxRates"][l["tax"] - 1] / 100
        spend = sum(fb["lines"][c]["cost"][l[c] - 1] for c in ("health", "education", "infrastructure", "social"))
        spend += fb["bridge"][l["bridge"]]["costPerYear"]
        spend += fb["equalization"]["pool"] if l["equalization"] else 0
        spend += sum(fb["programs"][x]["cost"] for x in l["programs"])
        return rev, spend
    if max_def is not None:          # the caucus trims lines it did not promise until the rule holds
        for _ in range(12):
            rev, sp = money(lv)
            if 100 * (sp - rev) / rev <= max_def: break
            free = [c for c in ("infrastructure", "social", "education", "health") if c not in set_by_plank and lv[c] > 1]
            if not free: break
            lv[free[0]] -= 1
    rev, sp = money(lv)
    lv["deficitPct"] = 100 * (sp - rev) / rev
    return lv


def appeal_table(d, parties, rankings, promises, campaign, leaders, momentum, ballots, issues, levers):
    E = d["election"]
    types = d["ridingTypes"]
    res = {}
    for r in d["ridings"]:
        prov = r["province"]
        mix = types[r["type"]]["mix"]
        ap = {}
        for party in parties:
            pid = party["id"]
            planks = {pl["id"]: pl for pl in party["planks"]}
            a = {gname: E["baseAppeal"] for gname in GROUPS}
            for rank, plid in enumerate(rankings[pid]):
                pl = planks[plid]
                w = E["rankWeight"][rank]
                mult = E["issueMultiplier"] if set(pl["addresses"]) & set(issues[prov]) else 1.0
                for gname in GROUPS:
                    a[gname] += w * mult * pl["appeal"][gname] + w * pl.get("provinceAppeal", {}).get(prov, 0)
            if promises[pid] == prov:
                for gname in GROUPS: a[gname] += E["regionalPromiseBonus"]
            camp = min(E["maxAppealFromCampaignPerRiding"], campaign[pid].get(r["id"], 0))
            for gname in GROUPS:
                a[gname] += camp + momentum[pid] + E["studentVoteSwing"] * ballots[pid].get(prov, 0)
                if leaders[pid] == prov: a[gname] += E["leaderHomeBonus"]
            if levers[pid]["deficitPct"] > E["fiscalCredibility"]["deficitAboveSharePct"]:
                for gname, v in E["fiscalCredibility"]["penalty"].items(): a[gname] += v
            ap[pid] = {gname: max(E["minAppeal"], v) for gname, v in a.items()}
        share = {pid: 0.0 for pid in ap}
        for gname in GROUPS:
            tot = sum(ap[pid][gname] for pid in ap)
            for pid in ap:
                share[pid] += mix[gname] * ap[pid][gname] / tot
        res[r["id"]] = share
    return res


def random_election(d, issues, rng, gdp):
    parties = d["parties"]
    provs = [p["id"] for p in d["provinces"]]
    E = d["election"]
    rankings = {p["id"]: rng.sample([pl["id"] for pl in p["planks"]], 4) for p in parties}
    promises = {p["id"]: rng.choice(provs) for p in parties}
    leaders = {p["id"]: rng.choice(provs) for p in parties}
    order = rng.sample([p["id"] for p in parties], 4)
    momentum = {pid: E["debateMomentum"]["endorsementRankBonus"][i] + rng.choice([0, 0, 1]) for i, pid in enumerate(order)}
    campaign = {}
    for p in parties:
        c = Counter()
        for _ in range(E["campaignActionsPerParty"]):
            c[rng.choice(d["ridings"])["id"]] += 2      # door knocking: +2 in one riding
        campaign[p["id"]] = c
    ballots = {p["id"]: Counter() for p in parties}
    for prov in provs:                                    # about 4 students per province vote
        for _ in range(4):
            ballots[rng.choice(parties)["id"]][prov] += 1
    levers = {p["id"]: platform_levers(d, p, rankings[p["id"]], gdp) for p in parties}
    shares = appeal_table(d, parties, rankings, promises, campaign, leaders, momentum, ballots, issues, levers)
    seats = Counter(max(s, key=s.get) for s in shares.values())
    votes = {pid: st.mean(s[pid] for s in shares.values()) for pid in shares[next(iter(shares))]}
    return seats, votes, levers


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=2000)
    a = ap.parse_args()
    d = load(DATA)
    g = run("flexible", 0, d)
    issues = province_issues(d, g)
    gdp = sum(p.history[5]["gdp"] for p in g.provs.values())
    rng = random.Random(42)
    seat_tot = Counter(); wins = Counter(); maj = 0; zero = Counter(); gaps = []; credible = Counter()
    for _ in range(a.runs):
        seats, votes, levers = random_election(d, issues, rng, gdp)
        top = max(seats, key=seats.get)
        wins[top] += 1
        if seats[top] >= d["election"]["majority"]: maj += 1
        for p in d["parties"]:
            seat_tot[p["id"]] += seats.get(p["id"], 0)
            if seats.get(p["id"], 0) == 0: zero[p["id"]] += 1
            gaps.append(abs(100 * seats.get(p["id"], 0) / 34 - 100 * votes[p["id"]]))
            if levers[p["id"]]["deficitPct"] <= d["election"]["fiscalCredibility"]["deficitAboveSharePct"]:
                credible[p["id"]] += 1
    print("National GDP after Year 6 (flexible run): $%.0fB" % gdp)
    print("Province issues:", issues)
    print("\n| Party | Avg seats | Most seats (share of elections) | Shut out (0 seats) | Platform within credibility line |")
    print("| --- | --- | --- | --- | --- |")
    for p in d["parties"]:
        pid = p["id"]
        print("| %s | %.1f | %.0f%% | %.0f%% | %.0f%% |" % (p["shortName"], seat_tot[pid] / a.runs, 100 * wins[pid] / a.runs, 100 * zero[pid] / a.runs, 100 * credible[pid] / a.runs))
    print("\nMajority governments: %.0f%% of elections. Minority: %.0f%%." % (100 * maj / a.runs, 100 - 100 * maj / a.runs))
    print("Average gap between a party's seat share and vote share: %.1f points (first past the post distortion)." % st.mean(gaps))


if __name__ == "__main__":
    main()
