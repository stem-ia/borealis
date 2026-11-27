// Phase 2 rules: province issues, platform levers, the riding vote model, seats,
// proportional view, and the federal Year 7. Ports spec/balance/election.py where it exists.
// Federal Year 7 follows game-systems.md section 10 (no reference code exists for it).
import { GROUPS, CATS, GOODS, pyRound, clamp } from "./engine.js";

export const LINES = ["health", "education", "infrastructure", "social"];

export function provinceIssues(d, g) {
  const out = {};
  for (const [pid, p] of Object.entries(g.provs)) {
    const h = p.history.slice(0, 6);
    if (!h.length) { out[pid] = d.election.issueFallbackOrder.slice(0, 2); continue; }
    const last = h[h.length - 1];
    const hits = [];
    if (last.debt / last.gdp > 0.6) hits.push("debt");
    if (last.unemployment >= 7) hits.push("unemployment");
    if (last.cpi >= 112) hits.push("cost");
    if (h.filter((x) => x.levels.health <= 3).length >= 3 && !hits.includes("health")) hits.push("health");
    if (h.filter((x) => x.short.includes("food")).length >= 2) hits.push("food");
    if (h.filter((x) => x.short.includes("energy")).length >= 2) hits.push("energy");
    if (last.gdp / h[0].gdp - 1 < 0.08) hits.push("growth");
    if (pid === "goldplain" || pid === "lakemoor") hits.push("bridge");
    if (["valcourt", "northreach", "saltmarch"].includes(pid)) hits.push("regional");
    for (const f of d.election.issueFallbackOrder) {
      if (hits.length >= 2) break;
      if (!hits.includes(f)) hits.push(f);
    }
    out[pid] = hits.slice(0, 2);
  }
  return out;
}

export function nationalGdp(g) {
  let s = 0;
  for (const p of Object.values(g.provs)) {
    const h = p.history[Math.min(5, p.history.length - 1)];
    s += h ? h.gdp : p.gdp;
  }
  return s;
}

export function defaultLevers(d) {
  return { ...d.federalBudget.defaults, programs: [] };
}

// Party levers: the caucus's own settings, then the top 3 planks on top (top priority wins).
export function platformLevers(d, party, ranking, caucusLevers) {
  const lv = { ...defaultLevers(d), ...(caucusLevers || {}) };
  lv.programs = [...(caucusLevers?.programs || [])];
  let maxDef = null;
  const planks = Object.fromEntries(party.planks.map((pl) => [pl.id, pl]));
  const top = ranking.slice(0, d.election.platformSize);
  const locked = new Set();
  for (const pid of [...top].reverse()) {
    for (const [k, v] of Object.entries(planks[pid].budgetLevers)) {
      if (k === "program") { if (!lv.programs.includes(v)) lv.programs.push(v); locked.add("program:" + v); }
      else if (k === "maxDeficit") maxDef = maxDef === null ? v : Math.min(maxDef, v);
      else { lv[k] = v; locked.add(k); }
    }
  }
  return { levers: lv, maxDeficit: maxDef, locked: [...locked] };
}

export function fedMoney(d, l, gdp, startDebt = 0, provinceShares = null) {
  const fb = d.federalBudget;
  const revenue = gdp * fb.taxRates[l.tax - 1] / 100;
  const lines = {};
  for (const c of LINES) lines[c] = fb.lines[c].cost[l[c] - 1];
  const bridge = fb.bridge[l.bridge]?.costPerYear ?? 0;
  const equal = l.equalization ? fb.equalization.pool : 0;
  const programs = (l.programs || []).reduce((s, x) => s + fb.programs[x].cost, 0);
  const interest = startDebt > 0 ? startDebt * fb.interestRate / 100 : 0;
  const spending = Object.values(lines).reduce((a, b) => a + b, 0) + bridge + equal + programs + interest;
  const balance = revenue - spending;
  return { revenue, lines, bridge, equal, programs, interest, spending, balance,
    deficitPct: revenue ? 100 * -balance / revenue : 0 };
}

// Ranking from Borda points: highest first; ties keep the party's plank order.
export function rankingFromBorda(party, borda) {
  const ids = party.planks.map((p) => p.id);
  return [...ids].sort((a, b) => (borda?.[b] || 0) - (borda?.[a] || 0) || ids.indexOf(a) - ids.indexOf(b));
}

// The riding vote model (game-systems.md section 10, election.py appeal_table).
export function appealTable(d, ctx) {
  const E = d.election;
  const res = {};
  for (const r of d.ridings) {
    const prov = r.province;
    const mix = d.ridingTypes[r.type].mix;
    const ap = {};
    for (const party of d.parties) {
      const pid = party.id;
      const planks = Object.fromEntries(party.planks.map((pl) => [pl.id, pl]));
      const a = Object.fromEntries(GROUPS.map((g) => [g, E.baseAppeal]));
      ctx.rankings[pid].forEach((plid, rank) => {
        const pl = planks[plid];
        const w = E.rankWeight[rank];
        const mult = pl.addresses.some((x) => ctx.issues[prov].includes(x)) ? E.issueMultiplier : 1.0;
        for (const g of GROUPS) a[g] += w * mult * pl.appeal[g] + w * ((pl.provinceAppeal || {})[prov] || 0);
      });
      if (ctx.promises[pid] === prov) for (const g of GROUPS) a[g] += E.regionalPromiseBonus;
      const camp = Math.min(E.maxAppealFromCampaignPerRiding, ctx.campaign[pid]?.[r.id] || 0);
      for (const g of GROUPS) {
        a[g] += camp + (ctx.momentum[pid] || 0) + E.studentVoteSwing * (ctx.ballots[prov]?.[pid] || 0);
        if (ctx.leaders[pid] === prov) a[g] += E.leaderHomeBonus;
      }
      if (ctx.deficitPct[pid] > E.fiscalCredibility.deficitAboveSharePct) {
        for (const [g, v] of Object.entries(E.fiscalCredibility.penalty)) a[g] += v;
      }
      ap[pid] = Object.fromEntries(Object.entries(a).map(([g, v]) => [g, Math.max(E.minAppeal, v)]));
    }
    const share = Object.fromEntries(Object.keys(ap).map((k) => [k, 0]));
    for (const g of GROUPS) {
      const tot = Object.values(ap).reduce((s, x) => s + x[g], 0);
      for (const pid of Object.keys(ap)) share[pid] += mix[g] * ap[pid][g] / tot;
    }
    res[r.id] = share;
  }
  return res;
}

export function countSeats(d, shares, coin) {
  const winners = {};
  const parties = d.parties.map((p) => p.id);
  const provShare = {};
  for (const r of d.ridings) {
    provShare[r.province] ||= Object.fromEntries(parties.map((p) => [p, 0]));
    for (const p of parties) provShare[r.province][p] += shares[r.id][p];
  }
  for (const r of d.ridings) {
    const s = shares[r.id];
    const best = Math.max(...parties.map((p) => s[p]));
    let tied = parties.filter((p) => Math.abs(s[p] - best) < 1e-9);
    if (tied.length > 1) {
      const pb = Math.max(...tied.map((p) => provShare[r.province][p]));
      tied = tied.filter((p) => Math.abs(provShare[r.province][p] - pb) < 1e-9);
    }
    winners[r.id] = tied.length > 1 ? tied[Math.floor(coin() * tied.length)] : tied[0];
  }
  const seats = Object.fromEntries(parties.map((p) => [p, 0]));
  for (const w of Object.values(winners)) seats[w]++;
  const votes = Object.fromEntries(parties.map((p) => [p, d.ridings.reduce((a, r) => a + shares[r.id][p], 0) / d.ridings.length]));
  return { winners, seats, votes };
}

// Largest remainder proportional seats from national vote share.
export function proportionalSeats(votes, total) {
  const raw = Object.entries(votes).map(([p, v]) => [p, v * total]);
  const seats = Object.fromEntries(raw.map(([p, x]) => [p, Math.floor(x)]));
  let left = total - Object.values(seats).reduce((a, b) => a + b, 0);
  raw.sort((a, b) => (b[1] % 1) - (a[1] % 1));
  for (const [p] of raw) { if (left <= 0) break; seats[p]++; left--; }
  return seats;
}

// Cut a line, or raise tax, one level at a time until the budget balances.
// Port of force_balance in spec/balance/simulate.py. Used when lenders say no
// and a group has not confirmed a balanced budget.
export function autoBalance(g, p, dec, year) {
  const d = { ...dec };
  const order = ["tax", "infrastructure", "social", "education", "health"];
  for (let i = 0; i < 25; i++) {
    if (g.finances(p, d).balance >= 0) break;
    if (year >= 3 && d.tax < 4) { d.tax++; continue; }
    let k = CATS[0];
    for (const c of CATS) if (d[c] > d[k] || (d[c] === d[k] && order.indexOf(c) < order.indexOf(k))) k = c;
    if (d[k] <= 1) { if (year >= 3 && d.tax < 5) { d.tax++; continue; } break; }
    d[k]--;
  }
  return d;
}

// Register federal effects for Year 7 on the engine. Call after begin_year().
export function registerFederal(d, g, l) {
  const fb = d.federalBudget;
  const reg = (eff, pid) => g.register({ ...eff, federal: true }, pid, "federal");
  const pids = Object.keys(g.provs);
  const totalPop = pids.reduce((s, x) => s + g.provs[x].pop, 0);
  const notes = {};
  const note = (pid, t) => (notes[pid] ||= []).push(t);
  for (const pid of pids) {
    for (const grp of GROUPS) {
      const v = fb.taxApproval[grp][l.tax - 1];
      if (v) reg({ type: "approval", group: grp, amount: v }, pid);
    }
    const tg = fb.taxGrowth[l.tax - 1];
    if (tg) reg({ type: "growth", amount: tg }, pid);
    const share = g.provs[pid].pop / totalPop;
    const health = fb.lines.health.cost[l.health - 1] * share;
    if (health) { reg({ type: "money", amount: pyRound(health, 1) }, pid); note(pid, `Health transfer +$${pyRound(health, 1)}B`); }
    for (const [grp, arr] of Object.entries(fb.lines.health.approval)) if (arr[l.health - 1]) reg({ type: "approval", group: grp, amount: arr[l.health - 1] }, pid);
    const ed = fb.lines.education.effects;
    if (ed.skill[l.education - 1]) reg({ type: "skill", amount: ed.skill[l.education - 1] }, pid);
    if (ed.families[l.education - 1]) reg({ type: "approval", group: "families", amount: ed.families[l.education - 1] }, pid);
    if (ed.unemployment[l.education - 1]) reg({ type: "unemployment", amount: ed.unemployment[l.education - 1] }, pid);
    const inf = fb.lines.infrastructure.effects;
    if (inf.infrastructure[l.infrastructure - 1]) reg({ type: "infrastructure", amount: inf.infrastructure[l.infrastructure - 1] }, pid);
    if (inf.growth[l.infrastructure - 1]) reg({ type: "growth", amount: inf.growth[l.infrastructure - 1] }, pid);
    if (inf.businesses[l.infrastructure - 1]) reg({ type: "approval", group: "businesses", amount: inf.businesses[l.infrastructure - 1] }, pid);
    for (const grp of ["seniors", "families", "workers"]) {
      const v = fb.lines.social.effects[grp][l.social - 1];
      if (v) reg({ type: "approval", group: grp, amount: v }, pid);
    }
  }
  const br = fb.bridge[l.bridge];
  if (l.bridge === "none") {
    for (const pid of pids) reg({ type: "approval", group: "all", amount: br.approval.all }, pid);
    for (const [pid, v] of Object.entries(br.regionalApproval)) reg({ type: "approval", group: "all", amount: v }, pid);
  } else if (l.bridge === "partnership") {
    for (const pid of pids) reg({ type: "approval", group: "businesses", amount: br.approval.businesses }, pid);
  } else if (l.bridge === "fast") {
    for (const pid of pids) reg({ type: "growth", amount: br.growthWhileBuilding }, pid);
  }
  if (l.equalization) {
    const gaps = {};
    for (const pid of pids) {
      const p = g.provs[pid];
      const std = { tax: 3, health: 3, education: 3, infrastructure: 3, social: 3 };
      const f = g.finances(p, std);
      const cost = Object.values(f.spending).reduce((a, b) => a + b, 0);
      gaps[pid] = Math.max(0, cost - f.revenue);
    }
    const tot = Object.values(gaps).reduce((a, b) => a + b, 0);
    for (const pid of pids) {
      if (tot > 0 && gaps[pid] > 0) {
        const amt = pyRound(fb.equalization.pool * gaps[pid] / tot, 1);
        reg({ type: "money", amount: amt }, pid);
        note(pid, `Equalization +$${amt}B`);
      }
    }
  }
  for (const prog of l.programs || []) {
    for (const eff of fb.programs[prog].effects) {
      const ts = Array.isArray(eff.target) ? eff.target : [eff.target];
      for (const t of ts) reg({ ...eff, target: undefined }, t);
    }
  }
  return notes;
}

export { GOODS, clamp };
