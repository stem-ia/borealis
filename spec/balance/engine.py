"""Borealis reference engine (Phase 1 economy).

This file is the source of truth for the Phase 1 formulas in
spec/game-systems.md section 13. The build engineer ports it to plain JS.
It loads every number from spec/game-data.json. No student data.

Order of a fiscal year:
  begin_year(event)  -> event auto effects registered, prices set
  income()           -> production, services, GDP
  trade_*()          -> goods and money move between provinces
  choose_card()      -> local issue and event response effects registered
  set_budget()       -> tax, spending, system, project, shortage policy
  year_end()         -> needs, world market, budget balance, debt,
                        inflation, CPI, unemployment, approval, growth
"""

import json
import random
from copy import deepcopy

GROUPS = ["workers", "families", "businesses", "seniors"]
GOODS = ["food", "energy", "materials"]
CATS = ["health", "education", "infrastructure", "social"]


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def load(path):
    with open(path) as f:
        return json.load(f)


class Province:
    def __init__(self, pd, data):
        C = data["constants"]
        self.id = pd["id"]
        self.pd = pd
        self.pop = pd["population"]
        self.base_prod = dict(pd["production"])     # permanent base, changes with baseProduction effects
        self.shift = {g: 0.0 for g in GOODS}         # production moved by market or planner
        self.base_need = dict(pd["needs"])
        self.base_services = pd["services"]
        self.services_index = 1.0
        self.baseline = dict(pd["spendingBaseline"])
        self.cost_factor = pd["costFactor"]
        self.debt = float(pd["debt"])
        self.system = pd["startSystem"]
        self.share = dict(pd["groupShare"])
        self.approval = {g: float(pd["startApproval"][g]) for g in GROUPS}
        self.skill = 0.0
        self.infra_stock = 0.0
        self.cpi = 100.0
        self.inflation = 2.0
        self.unemployment = float(data["economicSystems"][self.system - 1]["baseUnemployment"])
        self.last_unmet = {g: 0.0 for g in GOODS}
        self.interest_add = 0.0
        # per-year working values
        self.prod = {}
        self.services = 0
        self.gdp = 0
        self.received = {g: 0.0 for g in GOODS}
        self.shipped = {g: 0.0 for g in GOODS}
        self.trade_money = 0.0
        self.decision = None
        self.prev = {"tax": 3, "health": 3, "education": 3, "infrastructure": 3, "social": 3}
        self.history = []

    def approval_total(self):
        return sum(self.share[g] * self.approval[g] for g in GROUPS)


class Game:
    def __init__(self, data, seed=0):
        self.d = data
        self.C = data["constants"]
        self.sys = {s["step"]: s for s in data["economicSystems"]}
        self.provs = {p["id"]: Province(p, data) for p in data["provinces"]}
        self.year = 0
        self.rng = random.Random(seed)
        self.effects = []   # dicts: pid, eff, start, end, source, applied
        self.price = {g: 1.0 for g in GOODS}
        self.price_mult = {g: 1.0 for g in GOODS}
        self.trade_fee = self.C["tradeFee"]
        self.cards = {c["id"]: c for c in data["cards"]["localIssues"]}
        self.events = {e["id"]: e for e in data["cards"]["nationalEvents"]}
        self.projects = {p["id"]: p for p in data["investmentProjects"]}

    # ---------- effects ----------
    def _targets(self, eff, self_pid):
        t = eff.get("target", "self")
        if t == "self":
            return [self_pid] if self_pid else list(self.provs)
        if t == "all":
            return list(self.provs)
        if t == "others":
            return [p for p in self.provs if p != self_pid]
        if isinstance(t, list):
            return t
        return [t]

    def register(self, eff, self_pid, source):
        """Register an effect. source is 'event' (auto) or 'choice'."""
        start = eff.get("start", "now")
        if source == "choice" and eff["type"] in ("production", "services"):
            start = "next"
        if eff["type"] == "baseProduction":
            start = "next"
        y0 = self.year + (1 if start == "next" else 0)
        years = eff.get("years", 1)
        for pid in self._targets(eff, self_pid):
            self.effects.append({"pid": pid, "eff": eff, "start": y0,
                                 "end": y0 + years - 1, "source": source,
                                 "applied": False})

    def active(self, pid, types):
        out = []
        for e in self.effects:
            if e["pid"] == pid and e["start"] <= self.year <= e["end"] and e["eff"]["type"] in types:
                out.append(e)
        return out

    def scale(self, e, p):
        cond = e["eff"].get("ifSpending")
        if cond and p.decision:
            lvl = p.decision[cond["category"]]
            if lvl >= cond["atLeast"]:
                return cond["scale"]
        return 1.0

    # ---------- year steps ----------
    def begin_year(self, event_id=None):
        self.year += 1
        self.price_mult = {g: 1.0 for g in GOODS}
        self.event_id = event_id
        if event_id:
            for eff in self.events[event_id]["auto"]:
                if eff["type"] == "price":
                    self.price_mult[eff["resource"]] *= eff["mult"]
                else:
                    self.register(eff, None, "event")
        # one-off permanent changes that start this year
        for p in self.provs.values():
            for e in self.active(p.id, ["baseProduction"]):
                if not e["applied"]:
                    p.base_prod[e["eff"]["resource"]] += e["eff"]["amount"]
                    e["applied"] = True
            for e in self.active(p.id, ["interestRate"]):
                if not e["applied"]:
                    p.interest_add += e["eff"]["amount"]
                    e["applied"] = True

    def need(self, p, g, infra_level=3):
        n = p.base_need[g]
        for e in self.active(p.id, ["need"]):
            if e["eff"]["resource"] == g:
                if "pct" in e["eff"]:
                    n *= 1 + e["eff"]["pct"] / 100
                else:
                    n += e["eff"]["amount"]
        if g == "materials" and infra_level > 3:
            per = max(1, round(p.base_need["materials"] * self.C["infraMaterialsPctPerLevel"] / 100))
            n += per * (infra_level - 3)
        return max(0.0, n)

    def income(self):
        C = self.C
        for p in self.provs.values():
            s = self.sys[p.system]
            mult = s["prodMult"] * (1 + C["infraStockProdBonus"] * p.infra_stock)
            mult *= (1 - C["energyShortProdLoss"] * p.last_unmet["energy"])
            mult *= (1 - C["materialsShortProdLoss"] * p.last_unmet["materials"])
            p.prod = {}
            for g in GOODS:
                base = max(0.0, p.base_prod[g] + p.shift[g])
                m = mult
                for e in self.active(p.id, ["production"]):
                    if e["eff"]["resource"] == g:
                        pct = e["eff"]["pct"]
                        if e["source"] == "event" and pct < 0:
                            pct *= s["shockMult"]
                        m *= 1 + pct / 100
                p.prod[g] = max(0, round(base * m))
            sv = p.base_services * p.services_index
            sv *= 1 - C["unemploymentServicesLoss"] * max(0.0, p.unemployment - C["unemploymentNeutral"])
            for e in self.active(p.id, ["services"]):
                sv *= 1 + e["eff"]["pct"] * self.scale(e, p) / 100
            p.services = round(sv)
            p.received = {g: 0.0 for g in GOODS}
            p.shipped = {g: 0.0 for g in GOODS}
            p.trade_money = 0.0
        # national prices
        for g in GOODS:
            tn = sum(self.need(p, g) for p in self.provs.values())
            tp = sum(p.prod[g] for p in self.provs.values()) or 1
            pr = clamp(tn / tp, C["priceMin"], C["priceMax"])
            pr = clamp(pr * self.price_mult[g], C["priceMin"], C["priceMax"])
            self.price[g] = round(pr, 1)
        for p in self.provs.values():
            p.gdp = round(sum(p.prod[g] * self.price[g] for g in GOODS) + p.services)

    # ---------- trade ----------
    def trade_market(self, participants=None, infra_plan=None):
        """Sim stand-in for student trading: fair deals at the national price.
        Every shortfall is matched to surpluses pro rata. Buyer loses the fee."""
        fee = self.trade_fee
        parts = [self.provs[i] for i in (participants or self.provs)]
        for g in GOODS:
            sup, dem = {}, {}
            for p in parts:
                il = (infra_plan or {}).get(p.id, 3)
                bal = p.prod[g] - self.need(p, g, il)
                if bal > 0:
                    sup[p.id] = bal
                elif bal < 0:
                    dem[p.id] = -bal / (1 - fee)
            S, D = sum(sup.values()), sum(dem.values())
            T = min(S, D)
            if T <= 0:
                continue
            for pid, s in sup.items():
                q = s * T / S
                self.provs[pid].shipped[g] += q
                self.provs[pid].trade_money += q * self.price[g]
            for pid, dd in dem.items():
                q = dd * T / D
                self.provs[pid].received[g] += q * (1 - fee)
                self.provs[pid].trade_money -= q * self.price[g]

    def trade_deal(self, a, b, give, get):
        """One accepted student deal. give/get are dicts of goods and 'money'
        from a's point of view. Returns (ok, reason)."""
        C = self.C
        pa, pb = self.provs[a], self.provs[b]
        va = sum(q * (self.price[g] if g != "money" else 1) for g, q in give.items())
        vb = sum(q * (self.price[g] if g != "money" else 1) for g, q in get.items())
        if va == 0 or vb == 0:
            return False, "Both sides must send something."
        lo, hi = C["fairPriceBand"]
        if not (lo <= vb / va <= hi):
            return False, "Outside the fair price band."
        for side, src, dst in ((give, pa, pb), (get, pb, pa)):
            for g, q in side.items():
                if g == "money":
                    src.trade_money -= q
                    dst.trade_money += q
                else:
                    src.shipped[g] += q
                    dst.received[g] += q * (1 - self.trade_fee)
        return True, "ok"

    # ---------- decisions ----------
    def choose(self, pid, card, choice_id, is_event=False):
        c = (self.events if is_event else self.cards)[card]
        ch = next(x for x in c["choices"] if x["id"] == choice_id)
        for eff in ch["effects"]:
            self.register(eff, pid, "choice")

    def set_budget(self, pid, decision):
        """decision keys: tax, health, education, infrastructure, social (1-5),
        system (1-5), policy ('buy' or 'without'), reasoning (0-3),
        project (id or None), planner (list of (from, to, units))."""
        p = self.provs[pid]
        d = dict(decision)
        cur = p.system
        d["system"] = clamp(d.get("system", cur), cur - self.C["maxSystemStepsPerYear"], cur + self.C["maxSystemStepsPerYear"])
        p.decision = d

    def interest_share(self, p, f):
        """Interest as a percent of revenue (0 if the province has savings)."""
        return 100 * f["interest"] / f["revenue"] if f["revenue"] > 0 and f["interest"] > 0 else 0.0

    def must_balance(self, p):
        """Credit limit: lenders refuse new debt when net debt is above
        creditLimitRatio of GDP, or last year's interest took more than
        creditLimitInterestShare percent of revenue. The budget step must
        then show a balance of zero or better."""
        if p.gdp <= 0 or p.debt <= 0:
            return False
        if p.debt / p.gdp > self.C["creditLimitRatio"]:
            return True
        h = p.history[-1] if p.history else None
        return bool(h and h["revenue"] > 0 and 100 * h["interest"] / h["revenue"] > self.C["creditLimitInterestShare"])

    # ---------- year end ----------
    def finances(self, p, d):
        """Money side of the year. Pure: does not change state."""
        C = self.C
        rev = round(p.gdp * C["taxRates"][d["tax"] - 1] / 100)
        out = {"revenue": rev, "trade": p.trade_money}
        buys = sells = 0.0
        unmet = {}
        have = {}
        for g in GOODS:
            need = self.need(p, g, d["infrastructure"])
            h = p.prod[g] + p.received[g] - p.shipped[g]
            have[g] = h
            short = max(0.0, need - h)
            if short > 0.5:
                out.setdefault("shortGoods", []).append(g)
            if short > 0 and d.get("policy", "buy") == "buy":
                buys += short * self.price[g] * C["worldBuyMult"]
                short = 0.0
            unmet[g] = short / need if need else 0.0
            sells += max(0.0, h - need) * self.price[g] * C["worldSellMult"]
        out["worldBuy"], out["worldSell"], out["unmet"] = buys, sells, unmet
        spend = {}
        for c in CATS:
            cost = p.baseline[c] * C["spendingLevelMult"][d[c] - 1] * p.cost_factor
            for e in self.active(p.id, ["cost"]):
                if e["eff"]["category"] in (c, "all"):
                    cost *= 1 + e["eff"]["pct"] / 100
            if c == "social":
                cost *= C["socialCostBase"] + C["socialCostPerUnemployment"] * p.unemployment
            spend[c] = cost
        out["spending"] = spend
        ratio = p.debt / p.gdp if p.gdp else 0
        rate = (C["highDebtInterestRate"] if ratio > C["highDebtRatio"] else C["interestRate"]) + p.interest_add
        out["interest"] = p.debt * rate / 100 if p.debt > 0 else p.debt * C["savingsRate"] / 100
        proj = 0.0
        if d.get("project"):
            proj = rev * self.projects[d["project"]]["costPctRevenue"] / 100
        out["project"] = proj
        cm = 0.0
        for e in self.active(p.id, ["money"]):
            amt = e["eff"].get("amount")
            if amt is None:
                amt = rev * e["eff"]["pctRevenue"] / 100
            cm += amt * self.scale(e, p)
        out["cardMoney"] = cm
        out["balance"] = (rev + out["trade"] + sells - buys - sum(spend.values())
                          - out["interest"] - proj + cm)
        return out

    def year_end(self):
        C = self.C
        for p in self.provs.values():
            d = p.decision
            s = self.sys[p.system]
            f = self.finances(p, d)
            if d.get("project"):
                for eff in self.projects[d["project"]]["effects"]:
                    self.register(eff, p.id, "choice")
            p.debt -= f["balance"]
            un = f["unmet"]
            # inflation and CPI
            infl = (C["baseInflation"] + C["inflationFromFoodPrice"] * (self.price["food"] - 1)
                    + C["inflationFromEnergyPrice"] * (self.price["energy"] - 1)
                    + C["inflationFromFoodUnmet"] * un["food"]
                    + C["inflationFromEnergyUnmet"] * un["energy"])
            if f["balance"] < 0 and f["revenue"] > 0:
                infl += min(C["inflationFromDeficitMax"],
                            C["inflationPerDeficitPctRevenue"] * 100 * -f["balance"] / f["revenue"])
            for e in self.active(p.id, ["inflation"]):
                infl += e["eff"]["amount"]
            infl = clamp(infl, C["inflationMin"], C["inflationMax"])
            p.inflation = infl
            p.cpi *= 1 + infl / 100
            # skill and infrastructure stock (before growth and unemployment)
            sk_old = p.skill
            p.skill += d["education"] - 3
            for e in self.active(p.id, ["skill"]):
                if not e["applied"]:
                    p.skill += e["eff"]["amount"]; e["applied"] = True
            p.skill = clamp(p.skill, C["skillMin"], C["skillMax"])
            p.infra_stock += d["infrastructure"] - 3
            for e in self.active(p.id, ["infrastructure"]):
                if not e["applied"]:
                    p.infra_stock += e["eff"]["amount"]; e["applied"] = True
            p.infra_stock = clamp(p.infra_stock, C["infraStockMin"], C["infraStockMax"])
            # unemployment
            u = (s["baseUnemployment"] + C["unemploymentFromEnergyShort"] * un["energy"]
                 + C["unemploymentFromMaterialsShort"] * un["materials"]
                 + C["unemploymentFromInfraLevel"] * (d["infrastructure"] - 3)
                 + C["unemploymentFromTaxLevel"] * (d["tax"] - 3)
                 + C["unemploymentFromSkill"] * p.skill)
            for e in self.active(p.id, ["unemployment"]):
                u += e["eff"]["amount"] * self.scale(e, p)
            p.unemployment = round(clamp(u, C["unemploymentMin"], C["unemploymentMax"]), 1)
            # approval
            why = {g: {} for g in GROUPS}
            for g in GROUPS:
                gw = next(x for x in self.d["citizenGroups"] if x["id"] == g)
                parts = why[g]
                parts["tax"] = C["taxLevelEffect"][d["tax"] - 1] * gw["taxWeight"]
                sp = 0.0
                for c in CATS:
                    cw = next(x for x in self.d["spendingCategories"] if x["id"] == c)["groupWeight"][g]
                    sp += C["spendingLevelEffect"][d[c] - 1] * cw
                parts["spending"] = sp
                # people notice cuts and tax hikes compared with last year
                cut = 0.0
                for c in CATS:
                    cw = next(x for x in self.d["spendingCategories"] if x["id"] == c)["groupWeight"][g]
                    cut += max(0, p.prev[c] - d[c]) * cw
                parts["change"] = (C["cutPenalty"] * cut
                                   + C["taxHikePenalty"] * max(0, d["tax"] - p.prev["tax"]) * gw["taxWeight"])
                parts["system"] = s["approvalPerYear"][g] + (C["systemChangeApproval"] if d["system"] != p.system else 0)
                sc = C["scarcityApproval"]
                parts["shortages"] = -(sc["food"] * un["food"] + sc["energy"] * un["energy"]
                                       + sc["materials"] * un["materials"]) * s["scarcityShare"][g]
                ua = C["unemploymentApproval"]
                if p.unemployment > ua["painAbove"]:
                    parts["jobs"] = ua["pain"][g] * (p.unemployment - ua["painAbove"])
                elif p.unemployment < ua["gainBelow"]:
                    parts["jobs"] = ua["gain"][g] * (ua["gainBelow"] - p.unemployment)
                else:
                    parts["jobs"] = 0.0
                ia = C["inflationApproval"]
                parts["prices"] = ia["perPoint"][g] * (infl - ia["above"]) if infl > ia["above"] else 0.0
                da = C["debtApproval"]
                r = p.debt / p.gdp if p.gdp else 0
                dv = 0.0
                if r > da["above"]:
                    dv = da["perRatio"][g] * (r - da["above"])
                if r > C["highDebtRatio"]:
                    dv += da["downgradeAll"]
                ish = self.interest_share(p, f)
                if ish > da["interestShareAbove"]:
                    dv += da["perInterestPoint"][g] * (ish - da["interestShareAbove"])
                dfa = C["deficitApproval"]
                if f["balance"] < 0 and f["revenue"] > 0:
                    dpct = 100 * -f["balance"] / f["revenue"]
                    if dpct > dfa["abovePctRevenue"]:
                        dv += max(dfa["maxPerGroup"], dfa["perPct"][g] * (dpct - dfa["abovePctRevenue"]))
                parts["debt"] = dv
                cv = 0.0
                for e in self.active(p.id, ["approval"]):
                    if e["eff"]["group"] in (g, "all"):
                        cv += e["eff"]["amount"] * self.scale(e, p)
                parts["cards"] = cv
                parts["reasoning"] = C["reasoningApprovalPerPoint"] * d.get("reasoning", 0)
                delta = sum(parts.values())
                a = p.approval[g] + delta
                a += C["approvalDrift"] * (C["approvalCenter"] - a)
                p.approval[g] = clamp(a, C["approvalMin"], C["approvalMax"])
            # growth for next year
            gr = (s["growth"] + C["infraLevelGrowth"] * (d["infrastructure"] - 3)
                  + C["taxLevelGrowth"] * (d["tax"] - 3) + C["skillGrowth"] * sk_old)
            for e in self.active(p.id, ["growth"]):
                gr += e["eff"]["amount"]
            p.services_index *= 1 + gr / 100
            # production shift for next year (market moves on its own)
            ms = s["marketShift"]
            if ms:
                hi = max(GOODS, key=lambda g: self.price[g])
                lo = min(GOODS, key=lambda g: self.price[g])
                if self.price[hi] - self.price[lo] >= C["marketShiftPriceGap"]:
                    self._shift(p, lo, hi, ms)
            for (a, b, k) in d.get("planner", []):
                self._shift(p, a, b, min(k, s["plannerShift"]))
            p.last_unmet = un
            p.prev = {k: d[k] for k in ["tax"] + CATS}
            p.system = d["system"]
            p.history.append({
                "year": self.year, "gdp": p.gdp, "revenue": f["revenue"],
                "balance": round(f["balance"], 1), "debt": round(p.debt, 1),
                "cpi": round(p.cpi, 1), "inflation": round(infl, 1),
                "unemployment": p.unemployment, "approval": round(p.approval_total(), 1),
                "groups": {g: round(p.approval[g], 1) for g in GROUPS},
                "worldBuy": round(f["worldBuy"], 1), "trade": round(f["trade"], 1),
                "interest": round(f["interest"], 1), "system": p.system,
                "levels": {k: d[k] for k in ["tax"] + CATS}, "short": f.get("shortGoods", []),
                "why": {g: {k: round(v, 1) for k, v in why[g].items()} for g in GROUPS},
            })

    def _shift(self, p, frm, to, k):
        C = self.C
        cap_from = C["shiftCapPct"] / 100 * self.d_base(p, frm)
        cap_to = C["shiftCapPct"] / 100 * self.d_base(p, to)
        k = min(k, p.shift[frm] + cap_from, cap_to - p.shift[to] if p.shift[to] < cap_to else 0)
        k = min(k, p.base_prod[frm] + p.shift[frm])
        if k <= 0:
            return
        p.shift[frm] -= k
        p.shift[to] += k * C["shiftConversion"]

    def d_base(self, p, g):
        return next(x for x in self.d["provinces"] if x["id"] == p.id)["production"][g]
