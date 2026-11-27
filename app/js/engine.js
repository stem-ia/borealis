// Borealis engine (Phase 1 economy). Port of spec/balance/engine.py, function by function.
// Keep the year order: beginYear, income, trade, choose, setBudget, yearEnd.
// State is plain data so it can be saved as JSON (toJSON / Game.fromJSON).
// No student data lives here.

export const GROUPS = ["workers", "families", "businesses", "seniors"];
export const GOODS = ["food", "energy", "materials"];
export const CATS = ["health", "education", "infrastructure", "social"];

export function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// Python round(): half to even. nd digits after the point.
export function pyRound(x, nd = 0) {
  const m = Math.pow(10, nd);
  const y = x * m;
  let r = Math.round(y);
  if (Math.abs(y % 1) === 0.5) r = 2 * Math.round(y / 2);
  return nd ? r / m : r;
}

function sum(arr) { let s = 0; for (const v of arr) s += v; return s; }
function argmax(keys, f) { let best = keys[0]; for (const k of keys) if (f(k) > f(best)) best = k; return best; }
function argmin(keys, f) { let best = keys[0]; for (const k of keys) if (f(k) < f(best)) best = k; return best; }
const copy = (o) => JSON.parse(JSON.stringify(o));

export function makeProvince(pd, data) {
  return {
    id: pd.id,
    pop: pd.population,
    base_prod: { ...pd.production },
    shift: { food: 0, energy: 0, materials: 0 },
    base_need: { ...pd.needs },
    base_services: pd.services,
    services_index: 1.0,
    baseline: { ...pd.spendingBaseline },
    cost_factor: pd.costFactor,
    debt: Number(pd.debt),
    system: pd.startSystem,
    share: { ...pd.groupShare },
    approval: Object.fromEntries(GROUPS.map((g) => [g, Number(pd.startApproval[g])])),
    skill: 0.0,
    infra_stock: 0.0,
    cpi: 100.0,
    inflation: 2.0,
    unemployment: Number(data.economicSystems[pd.startSystem - 1].baseUnemployment),
    last_unmet: { food: 0, energy: 0, materials: 0 },
    interest_add: 0.0,
    prod: {},
    services: 0,
    gdp: 0,
    received: { food: 0, energy: 0, materials: 0 },
    shipped: { food: 0, energy: 0, materials: 0 },
    trade_money: 0.0,
    decision: null,
    prev: { tax: 3, health: 3, education: 3, infrastructure: 3, social: 3 },
    history: [],
  };
}

export function approvalTotal(p) { return sum(GROUPS.map((g) => p.share[g] * p.approval[g])); }

export class Game {
  constructor(data, seed = 0) {
    this.d = data;
    this.C = data.constants;
    this.sys = {};
    for (const s of data.economicSystems) this.sys[s.step] = s;
    this.provs = {};
    for (const p of data.provinces) this.provs[p.id] = makeProvince(p, data);
    this.year = 0;
    this.seed = seed;
    this.effects = [];
    this.price = { food: 1.0, energy: 1.0, materials: 1.0 };
    this.price_mult = { food: 1.0, energy: 1.0, materials: 1.0 };
    this.trade_fee = this.C.tradeFee;
    this.event_id = null;
    this.cards = {};
    for (const c of data.cards.localIssues) this.cards[c.id] = c;
    this.events = {};
    for (const e of data.cards.nationalEvents) this.events[e.id] = e;
    this.projects = {};
    for (const p of data.investmentProjects) this.projects[p.id] = p;
  }

  toJSON() {
    return copy({ year: this.year, seed: this.seed, provs: this.provs, effects: this.effects,
      price: this.price, price_mult: this.price_mult, trade_fee: this.trade_fee, event_id: this.event_id });
  }

  static fromJSON(data, s) {
    const g = new Game(data, s.seed);
    Object.assign(g, copy(s));
    return g;
  }

  // ---------- effects ----------
  _targets(eff, selfPid) {
    const t = eff.target ?? "self";
    if (t === "self") return selfPid ? [selfPid] : Object.keys(this.provs);
    if (t === "all") return Object.keys(this.provs);
    if (t === "others") return Object.keys(this.provs).filter((p) => p !== selfPid);
    if (Array.isArray(t)) return t;
    return [t];
  }

  register(eff, selfPid, source) {
    let start = eff.start ?? "now";
    if (source === "choice" && (eff.type === "production" || eff.type === "services")) start = "next";
    if (eff.type === "baseProduction") start = "next";
    const y0 = this.year + (start === "next" ? 1 : 0);
    const years = eff.years ?? 1;
    for (const pid of this._targets(eff, selfPid)) {
      this.effects.push({ pid, eff, start: y0, end: y0 + years - 1, source, applied: false });
    }
  }

  active(pid, types) {
    return this.effects.filter((e) => e.pid === pid && e.start <= this.year && this.year <= e.end && types.includes(e.eff.type));
  }

  scale(e, p) {
    const cond = e.eff.ifSpending;
    if (cond && p.decision) {
      const lvl = p.decision[cond.category];
      if (lvl >= cond.atLeast) return cond.scale;
    }
    return 1.0;
  }

  // ---------- year steps ----------
  begin_year(eventId = null) {
    this.year += 1;
    this.price_mult = { food: 1.0, energy: 1.0, materials: 1.0 };
    this.event_id = eventId;
    if (eventId) {
      for (const eff of this.events[eventId].auto) {
        if (eff.type === "price") this.price_mult[eff.resource] *= eff.mult;
        else this.register(eff, null, "event");
      }
    }
    for (const p of Object.values(this.provs)) {
      for (const e of this.active(p.id, ["baseProduction"])) {
        if (!e.applied) { p.base_prod[e.eff.resource] += e.eff.amount; e.applied = true; }
      }
      for (const e of this.active(p.id, ["interestRate"])) {
        if (!e.applied) { p.interest_add += e.eff.amount; e.applied = true; }
      }
    }
  }

  need(p, g, infraLevel = 3) {
    let n = p.base_need[g];
    for (const e of this.active(p.id, ["need"])) {
      if (e.eff.resource === g) {
        if ("pct" in e.eff) n *= 1 + e.eff.pct / 100;
        else n += e.eff.amount;
      }
    }
    if (g === "materials" && infraLevel > 3) {
      const per = Math.max(1, pyRound(p.base_need.materials * this.C.infraMaterialsPctPerLevel / 100));
      n += per * (infraLevel - 3);
    }
    return Math.max(0.0, n);
  }

  income() {
    const C = this.C;
    const provs = Object.values(this.provs);
    for (const p of provs) {
      const s = this.sys[p.system];
      let mult = s.prodMult * (1 + C.infraStockProdBonus * p.infra_stock);
      mult *= 1 - C.energyShortProdLoss * p.last_unmet.energy;
      mult *= 1 - C.materialsShortProdLoss * p.last_unmet.materials;
      p.prod = {};
      for (const g of GOODS) {
        const base = Math.max(0.0, p.base_prod[g] + p.shift[g]);
        let m = mult;
        for (const e of this.active(p.id, ["production"])) {
          if (e.eff.resource === g) {
            let pct = e.eff.pct;
            if (e.source === "event" && pct < 0) pct *= s.shockMult;
            m *= 1 + pct / 100;
          }
        }
        p.prod[g] = Math.max(0, pyRound(base * m));
      }
      let sv = p.base_services * p.services_index;
      sv *= 1 - C.unemploymentServicesLoss * Math.max(0.0, p.unemployment - C.unemploymentNeutral);
      for (const e of this.active(p.id, ["services"])) sv *= 1 + e.eff.pct * this.scale(e, p) / 100;
      p.services = pyRound(sv);
      p.received = { food: 0, energy: 0, materials: 0 };
      p.shipped = { food: 0, energy: 0, materials: 0 };
      p.trade_money = 0.0;
    }
    for (const g of GOODS) {
      const tn = sum(provs.map((p) => this.need(p, g)));
      const tp = sum(provs.map((p) => p.prod[g])) || 1;
      let pr = clamp(tn / tp, C.priceMin, C.priceMax);
      pr = clamp(pr * this.price_mult[g], C.priceMin, C.priceMax);
      this.price[g] = pyRound(pr, 1);
    }
    for (const p of provs) p.gdp = pyRound(sum(GOODS.map((g) => p.prod[g] * this.price[g])) + p.services);
  }

  // ---------- trade ----------
  trade_market(participants = null, infraPlan = null) {
    const fee = this.trade_fee;
    const parts = (participants || Object.keys(this.provs)).map((i) => this.provs[i]);
    for (const g of GOODS) {
      const sup = {}, dem = {};
      for (const p of parts) {
        const il = (infraPlan || {})[p.id] ?? 3;
        const bal = p.prod[g] - this.need(p, g, il);
        if (bal > 0) sup[p.id] = bal;
        else if (bal < 0) dem[p.id] = -bal / (1 - fee);
      }
      const S = sum(Object.values(sup)), D = sum(Object.values(dem));
      const T = Math.min(S, D);
      if (T <= 0) continue;
      for (const [pid, s] of Object.entries(sup)) {
        const q = s * T / S;
        this.provs[pid].shipped[g] += q;
        this.provs[pid].trade_money += q * this.price[g];
      }
      for (const [pid, dd] of Object.entries(dem)) {
        const q = dd * T / D;
        this.provs[pid].received[g] += q * (1 - fee);
        this.provs[pid].trade_money -= q * this.price[g];
      }
    }
  }

  dealValue(side) {
    return sum(Object.entries(side).map(([g, q]) => q * (g !== "money" ? this.price[g] : 1)));
  }

  // give/get from a's point of view. fee: optional per-route fee (defaults to trade_fee).
  trade_deal(a, b, give, get, fee = null) {
    const C = this.C;
    const f = fee ?? this.trade_fee;
    const pa = this.provs[a], pb = this.provs[b];
    const va = this.dealValue(give), vb = this.dealValue(get);
    if (va === 0 || vb === 0) return [false, "Both sides must send something."];
    const [lo, hi] = C.fairPriceBand;
    if (!(lo <= vb / va && vb / va <= hi)) return [false, "Outside the fair price band."];
    for (const [side, src, dst] of [[give, pa, pb], [get, pb, pa]]) {
      for (const [g, q] of Object.entries(side)) {
        if (g === "money") { src.trade_money -= q; dst.trade_money += q; }
        else { src.shipped[g] += q; dst.received[g] += q * (1 - f); }
      }
    }
    return [true, "ok"];
  }

  // ---------- decisions ----------
  choose(pid, card, choiceId, isEvent = false) {
    const c = (isEvent ? this.events : this.cards)[card];
    const ch = c.choices.find((x) => x.id === choiceId);
    for (const eff of ch.effects) this.register(eff, pid, "choice");
  }

  set_budget(pid, decision) {
    const p = this.provs[pid];
    const d = { ...decision };
    const cur = p.system;
    const m = this.C.maxSystemStepsPerYear;
    d.system = clamp(d.system ?? cur, cur - m, cur + m);
    p.decision = d;
  }

  interest_share(p, f) {
    return f.revenue > 0 && f.interest > 0 ? 100 * f.interest / f.revenue : 0.0;
  }

  must_balance(p) {
    if (p.gdp <= 0 || p.debt <= 0) return false;
    if (p.debt / p.gdp > this.C.creditLimitRatio) return true;
    const h = p.history.length ? p.history[p.history.length - 1] : null;
    return Boolean(h && h.revenue > 0 && 100 * h.interest / h.revenue > this.C.creditLimitInterestShare);
  }

  // ---------- year end ----------
  finances(p, d) {
    const C = this.C;
    const rev = pyRound(p.gdp * C.taxRates[d.tax - 1] / 100);
    const out = { revenue: rev, trade: p.trade_money };
    let buys = 0.0, sells = 0.0;
    const unmet = {}, have = {};
    out.need = {};
    for (const g of GOODS) {
      const need = this.need(p, g, d.infrastructure);
      out.need[g] = need;
      const h = p.prod[g] + p.received[g] - p.shipped[g];
      have[g] = h;
      let short = Math.max(0.0, need - h);
      if (short > 0.5) (out.shortGoods ||= []).push(g);
      if (short > 0 && (d.policy ?? "buy") === "buy") {
        buys += short * this.price[g] * C.worldBuyMult;
        short = 0.0;
      }
      unmet[g] = need ? short / need : 0.0;
      sells += Math.max(0.0, h - need) * this.price[g] * C.worldSellMult;
    }
    out.have = have;
    out.worldBuy = buys; out.worldSell = sells; out.unmet = unmet;
    const spend = {};
    for (const c of CATS) {
      let cost = p.baseline[c] * C.spendingLevelMult[d[c] - 1] * p.cost_factor;
      for (const e of this.active(p.id, ["cost"])) {
        if (e.eff.category === c || e.eff.category === "all") cost *= 1 + e.eff.pct / 100;
      }
      if (c === "social") cost *= C.socialCostBase + C.socialCostPerUnemployment * p.unemployment;
      spend[c] = cost;
    }
    out.spending = spend;
    const ratio = p.gdp ? p.debt / p.gdp : 0;
    const rate = (ratio > C.highDebtRatio ? C.highDebtInterestRate : C.interestRate) + p.interest_add;
    out.interest = p.debt > 0 ? p.debt * rate / 100 : p.debt * C.savingsRate / 100;
    let proj = 0.0;
    if (d.project) proj = rev * this.projects[d.project].costPctRevenue / 100;
    out.project = proj;
    let cm = 0.0;
    for (const e of this.active(p.id, ["money"])) {
      let amt = e.eff.amount;
      if (amt === undefined || amt === null) amt = rev * e.eff.pctRevenue / 100;
      cm += amt * this.scale(e, p);
    }
    out.cardMoney = cm;
    out.balance = rev + out.trade + sells - buys - sum(Object.values(spend)) - out.interest - proj + cm;
    return out;
  }

  year_end() {
    const C = this.C;
    for (const p of Object.values(this.provs)) {
      const d = p.decision;
      const s = this.sys[p.system];
      const f = this.finances(p, d);
      if (d.project) for (const eff of this.projects[d.project].effects) this.register(eff, p.id, "choice");
      p.debt -= f.balance;
      const un = f.unmet;
      let infl = C.baseInflation + C.inflationFromFoodPrice * (this.price.food - 1)
        + C.inflationFromEnergyPrice * (this.price.energy - 1)
        + C.inflationFromFoodUnmet * un.food
        + C.inflationFromEnergyUnmet * un.energy;
      if (f.balance < 0 && f.revenue > 0) {
        infl += Math.min(C.inflationFromDeficitMax, C.inflationPerDeficitPctRevenue * 100 * -f.balance / f.revenue);
      }
      for (const e of this.active(p.id, ["inflation"])) infl += e.eff.amount;
      infl = clamp(infl, C.inflationMin, C.inflationMax);
      p.inflation = infl;
      p.cpi *= 1 + infl / 100;
      const skOld = p.skill;
      p.skill += d.education - 3;
      for (const e of this.active(p.id, ["skill"])) if (!e.applied) { p.skill += e.eff.amount; e.applied = true; }
      p.skill = clamp(p.skill, C.skillMin, C.skillMax);
      p.infra_stock += d.infrastructure - 3;
      for (const e of this.active(p.id, ["infrastructure"])) if (!e.applied) { p.infra_stock += e.eff.amount; e.applied = true; }
      p.infra_stock = clamp(p.infra_stock, C.infraStockMin, C.infraStockMax);
      let u = s.baseUnemployment + C.unemploymentFromEnergyShort * un.energy
        + C.unemploymentFromMaterialsShort * un.materials
        + C.unemploymentFromInfraLevel * (d.infrastructure - 3)
        + C.unemploymentFromTaxLevel * (d.tax - 3)
        + C.unemploymentFromSkill * p.skill;
      for (const e of this.active(p.id, ["unemployment"])) u += e.eff.amount * this.scale(e, p);
      p.unemployment = pyRound(clamp(u, C.unemploymentMin, C.unemploymentMax), 1);
      const why = {};
      const catW = Object.fromEntries(this.d.spendingCategories.map((x) => [x.id, x.groupWeight]));
      for (const g of GROUPS) {
        const gw = this.d.citizenGroups.find((x) => x.id === g);
        const parts = {};
        why[g] = parts;
        parts.tax = C.taxLevelEffect[d.tax - 1] * gw.taxWeight;
        let sp = 0.0;
        for (const c of CATS) sp += C.spendingLevelEffect[d[c] - 1] * catW[c][g];
        parts.spending = sp;
        let cut = 0.0;
        for (const c of CATS) cut += Math.max(0, p.prev[c] - d[c]) * catW[c][g];
        parts.change = C.cutPenalty * cut + C.taxHikePenalty * Math.max(0, d.tax - p.prev.tax) * gw.taxWeight;
        parts.system = s.approvalPerYear[g] + (d.system !== p.system ? C.systemChangeApproval : 0);
        const sc = C.scarcityApproval;
        parts.shortages = -(sc.food * un.food + sc.energy * un.energy + sc.materials * un.materials) * s.scarcityShare[g];
        const ua = C.unemploymentApproval;
        if (p.unemployment > ua.painAbove) parts.jobs = ua.pain[g] * (p.unemployment - ua.painAbove);
        else if (p.unemployment < ua.gainBelow) parts.jobs = ua.gain[g] * (ua.gainBelow - p.unemployment);
        else parts.jobs = 0.0;
        const ia = C.inflationApproval;
        parts.prices = infl > ia.above ? ia.perPoint[g] * (infl - ia.above) : 0.0;
        const da = C.debtApproval;
        const r = p.gdp ? p.debt / p.gdp : 0;
        let dv = 0.0;
        if (r > da.above) dv = da.perRatio[g] * (r - da.above);
        if (r > C.highDebtRatio) dv += da.downgradeAll;
        const ish = this.interest_share(p, f);
        if (ish > da.interestShareAbove) dv += da.perInterestPoint[g] * (ish - da.interestShareAbove);
        const dfa = C.deficitApproval;
        if (f.balance < 0 && f.revenue > 0) {
          const dpct = 100 * -f.balance / f.revenue;
          if (dpct > dfa.abovePctRevenue) dv += Math.max(dfa.maxPerGroup, dfa.perPct[g] * (dpct - dfa.abovePctRevenue));
        }
        parts.debt = dv;
        let cv = 0.0, fv = 0.0;
        for (const e of this.active(p.id, ["approval"])) {
          if (e.eff.group === g || e.eff.group === "all") {
            const v = e.eff.amount * this.scale(e, p);
            if (e.source === "federal") fv += v; else cv += v;   // app addition: federal segment (Year 7)
          }
        }
        parts.cards = cv;
        if (fv) parts.federal = fv;
        parts.reasoning = C.reasoningApprovalPerPoint * (d.reasoning ?? 0);
        const delta = sum(Object.values(parts));
        let a = p.approval[g] + delta;
        a += C.approvalDrift * (C.approvalCenter - a);
        p.approval[g] = clamp(a, C.approvalMin, C.approvalMax);
      }
      let gr = s.growth + C.infraLevelGrowth * (d.infrastructure - 3) + C.taxLevelGrowth * (d.tax - 3) + C.skillGrowth * skOld;
      for (const e of this.active(p.id, ["growth"])) gr += e.eff.amount;
      p.services_index *= 1 + gr / 100;
      const ms = s.marketShift;
      if (ms) {
        const hi = argmax(GOODS, (g) => this.price[g]);
        const lo = argmin(GOODS, (g) => this.price[g]);
        if (this.price[hi] - this.price[lo] >= C.marketShiftPriceGap) this._shift(p, lo, hi, ms);
      }
      for (const [a, b, k] of d.planner || []) this._shift(p, a, b, Math.min(k, s.plannerShift));
      p.last_unmet = un;
      p.prev = Object.fromEntries(["tax", ...CATS].map((k) => [k, d[k]]));
      p.system = d.system;
      const r1 = (v) => pyRound(v, 1);
      p.history.push({
        year: this.year, gdp: p.gdp, revenue: f.revenue,
        balance: r1(f.balance), debt: r1(p.debt),
        cpi: r1(p.cpi), inflation: r1(infl),
        unemployment: p.unemployment, approval: r1(approvalTotal(p)),
        groups: Object.fromEntries(GROUPS.map((g) => [g, r1(p.approval[g])])),
        worldBuy: r1(f.worldBuy), trade: r1(f.trade),
        interest: r1(f.interest), system: p.system,
        levels: Object.fromEntries(["tax", ...CATS].map((k) => [k, d[k]])), short: f.shortGoods || [],
        why: Object.fromEntries(GROUPS.map((g) => [g, Object.fromEntries(Object.entries(why[g]).map(([k, v]) => [k, r1(v)]))])),
        // app additions (not in engine.py history): money lines for the ledger and log
        spending: r1(sum(Object.values(f.spending))), worldSell: r1(f.worldSell), cardMoney: r1(f.cardMoney),
        project: d.project || null, policy: d.policy || "buy", reasoning: d.reasoning ?? 0, borrowReason: d.borrowReason || null,
      });
    }
  }

  _shift(p, frm, to, k) {
    const C = this.C;
    const capFrom = C.shiftCapPct / 100 * this.d_base(p, frm);
    const capTo = C.shiftCapPct / 100 * this.d_base(p, to);
    k = Math.min(k, p.shift[frm] + capFrom, p.shift[to] < capTo ? capTo - p.shift[to] : 0);
    k = Math.min(k, p.base_prod[frm] + p.shift[frm]);
    if (k <= 0) return;
    p.shift[frm] -= k;
    p.shift[to] += k * C.shiftConversion;
  }

  d_base(p, g) { return this.d.provinces.find((x) => x.id === p.id).production[g]; }
}
