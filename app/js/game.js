// Board-side game controller. The board is the single source of truth: it holds
// the state, runs the engine, applies intents from groups (or from the board in
// board-only mode) and broadcasts snapshots. Group pages only read snapshots and
// use the pure helpers at the bottom of this file for previews.
import { Game, GOODS, CATS, GROUPS, approvalTotal, pyRound, clamp } from "./engine.js";
import * as EL from "./election.js";

export const P1_STEPS = ["headline", "income", "trade", "local", "budget", "results"];
export const BRIDGE_STEPS = ["crisis", "pledge1", "reveal", "pledge2", "outcome"];
export const P2_STEPS = ["parties", "platform", "campaign", "vote", "election", "government", "bill", "year7"];
export const STEP_NAMES = {
  launch: "Launch", headline: "Headline", income: "Income", trade: "Trade", local: "Local issue", budget: "Budget", results: "Year-end results",
  review: "Phase 1 review", crisis: "The bridge falls", pledge1: "Pledge round 1", reveal: "Reveal", pledge2: "Pledge round 2", outcome: "Outcome",
  election: "Election results", parties: "Parties", platform: "Platforms and ridings", campaign: "Campaign", vote: "Student Vote", government: "Forming government",
  bill: "Budget bill C-1", year7: "Federal year", debrief: "Debrief",
};
export const PHASE_NAMES = { launch: "Launch", p1: "Phase 1: Economy", review: "Phase 1 review", bridge: "Bridge crisis", p2: "Phase 2: Politics", debrief: "Debrief" };
export const STEP_MINUTES = { trade: 8, local: 6, budget: 8, pledge1: 4, pledge2: 6, campaign: 15, parties: 20, platform: 25 };
export const BILL_STAGES = ["Cabinet drafts", "First reading", "Debate and Question Period", "Amendments", "House vote", "Senate review", "Royal Assent"];
export const BILL_LEVERS = ["tax", "health", "education", "infrastructure", "social", "bridge", "equalization"];

const copy = (o) => JSON.parse(JSON.stringify(o));

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function makeRoom() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = ""; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

export function newState(d, className, room) {
  const seed = Math.floor(Math.random() * 1e9);
  const g = new Game(d, seed);
  const rnd = mulberry32(seed);
  const general = d.cards.localIssues.filter((c) => !c.province).map((c) => c.id);
  const pools = {};
  for (const p of d.provinces) pools[p.id] = shuffle(general, rnd);
  const parties = d.parties.map((p) => p.id);
  const pids = d.provinces.map((p) => p.id);
  const zero = (keys, v) => Object.fromEntries(keys.map((k) => [k, typeof v === "function" ? v(k) : copy(v)]));
  return {
    v: 1, app: "borealis", className, room, seed, createdAt: Date.now(),
    phase: "launch", step: "launch", year: 0, paused: false,
    timer: { duration: 0, remaining: 0, endsAt: null },
    engine: g.toJSON(),
    pools,
    yc: { event: null, revealed: false, local: {}, underdog: null },
    choices: {}, budgets: {}, reasoning: {},
    offers: [], trades: [], aidUsed: {}, nextId: 1,
    preYearEnd: null, lastYearDelta: {},
    news: [{ y: 0, text: "Welcome to Borealis. Seven provinces, one nation." }],
    log: [],
    bridge: { pledges1: {}, pledges2: {}, outcome: null },
    p2: {
      members: zero(parties, () => zero(pids, 0)),
      borda: zero(parties, {}), ballotsIn: zero(parties, 0),
      leader: zero(parties, null), promise: zero(parties, null),
      levers: zero(parties, () => EL.defaultLevers(d)),
      candidates: zero(parties, {}),
      campaign: zero(parties, () => ({ spent: 0, riding: {}, gotv: 0, actions: [] })),
      debate: { order: [], bonus: {} },
      ballots: zero(pids, () => zero(parties, 0)),
      election: null, gov: null, bill: null, year7: null,
    },
  };
}

export class Controller {
  constructor(d, state) {
    this.d = d;
    this.s = state;
    this.g = Game.fromJSON(d, state.engine);
    this.undoStack = (state.undo || []).slice();
    delete this.s.undo;
    this.pids = d.provinces.map((p) => p.id);
    this.parties = d.parties.map((p) => p.id);
  }

  // ---------- persistence ----------
  sync() { this.s.engine = this.g.toJSON(); }
  snapshot() { this.sync(); return this.s; }
  saveable() { this.sync(); return { ...this.s, undo: this.undoStack.slice(-1) }; }
  pushUndo() { this.sync(); this.undoStack.push(JSON.stringify(this.s)); if (this.undoStack.length > 25) this.undoStack.shift(); }
  canBack() { return this.undoStack.length > 0; }
  back() {
    if (!this.undoStack.length) return { ok: false, msg: "Nothing to undo." };
    const prev = JSON.parse(this.undoStack.pop());
    this.s = prev;
    this.g = Game.fromJSON(this.d, prev.engine);
    this.logIt(null, "Teacher pressed Back. The last step was undone.");
    return { ok: true };
  }

  rnd(salt) { return mulberry32((this.s.seed + salt * 7919 + this.s.year * 104729 + this.s.nextId) | 0); }
  id() { return this.s.nextId++; }
  logIt(pid, text, kind = "note") { this.s.log.push({ y: this.s.year, phase: this.s.phase, step: this.s.step, pid, text, kind, t: Date.now() }); }
  newsIt(text) { this.s.news.push({ y: this.s.year, text }); if (this.s.news.length > 60) this.s.news.shift(); }
  pname(pid) { return this.d.provinces.find((p) => p.id === pid)?.name || pid; }
  partyName(id) { return this.d.parties.find((p) => p.id === id)?.shortName || id; }

  // ---------- timer and pause ----------
  setTimer(minutes, start = true) {
    const sec = Math.round(minutes * 60);
    this.s.timer = { duration: sec, remaining: sec, endsAt: start ? Date.now() + sec * 1000 : null };
  }
  timerLeft() { const t = this.s.timer; return t.endsAt ? Math.max(0, (t.endsAt - Date.now()) / 1000) : t.remaining; }
  timerToggle() {
    const t = this.s.timer;
    if (t.endsAt) { t.remaining = this.timerLeft(); t.endsAt = null; }
    else if (t.remaining > 0) t.endsAt = Date.now() + t.remaining * 1000;
  }
  timerAdd(sec) {
    const t = this.s.timer;
    if (t.endsAt) t.endsAt += sec * 1000; else t.remaining += sec;
    t.duration = Math.max(t.duration, this.timerLeft());
  }
  togglePause() {
    this.s.paused = !this.s.paused;
    const t = this.s.timer;
    if (this.s.paused && t.endsAt) { t.remaining = this.timerLeft(); t.endsAt = null; t.pausedByEyes = true; }
    else if (!this.s.paused && t.pausedByEyes) { t.endsAt = Date.now() + t.remaining * 1000; t.pausedByEyes = false; }
  }

  // ---------- step flow ----------
  pendingProvinces(kind) {
    if (kind === "local") return this.pids.filter((p) => !this.s.choices[p]?.choice || (this.s.yc.event && !this.s.choices[p]?.eventChoice));
    if (kind === "budget") return this.pids.filter((p) => !this.s.budgets[p]?.confirmed);
    return [];
  }

  // Returns { ok } or { ask: "question" } when the teacher should confirm first.
  next(force = false) {
    const s = this.s;
    if (!force) {
      if (s.step === "local") {
        const n = this.pendingProvinces("local");
        if (n.length) return { ask: `${listNames(n.map((p) => this.pname(p)))} ${n.length === 1 ? "has" : "have"} not picked a choice. They get no card effect this year. Continue?` };
      }
      if (s.step === "budget") {
        const n = this.pendingProvinces("budget");
        if (n.length) return { ask: `${listNames(n.map((p) => this.pname(p)))} ${n.length === 1 ? "has" : "have"} not confirmed. They keep last year's settings. Continue?` };
      }
      if (s.step === "trade" && s.offers.some((o) => o.status === "open")) return { ask: "Some trade offers are still open. Closing the window ends them. Continue?" };
      if (s.step === "government" && s.p2.gov && s.p2.gov.status !== "passed") return { ask: `No government has won a confidence vote yet. Continue with ${this.partyName(s.p2.gov.party)} as government anyway?` };
    }
    if (s.phase === "p1" && s.step === "headline" && s.yc.event && !s.yc.revealed) {
      // First press reveals the card. Undo is not needed for a reveal.
      s.yc.revealed = true;
      this.logIt(null, `Headline revealed: ${this.g.events[s.yc.event].title}.`, "event");
      return { ok: true };
    }
    this.pushUndo();
    try {
      this._advance();
    } catch (e) {
      console.error(e);
      this.back();
      return { ok: false, msg: "Something went wrong moving to the next step: " + e.message };
    }
    return { ok: true };
  }

  _advance() {
    const s = this.s;
    s.paused = false;
    s.timer = { duration: 0, remaining: 0, endsAt: null };
    if (s.phase === "launch") return this.startYear(1);
    if (s.phase === "p1") {
      switch (s.step) {
        case "headline": return this.doIncome();
        case "income": s.step = "trade"; this.setTimer(STEP_MINUTES.trade); this.newsIt("The trade window is open."); return;
        case "trade": return this.closeTrade();
        case "local": return this.commitChoices();
        case "budget": return this.runYearEnd();
        case "results":
          if (s.year < this.d.meta.fiscalYears) return this.startYear(s.year + 1);
          s.phase = "review"; s.step = "review"; this.finishPhase1(); return;
      }
    }
    if (s.phase === "review") { s.phase = "bridge"; s.step = "crisis"; this.newsIt(this.d.cards.bridgeCrisis.headline); this.logIt(null, "The Great Narrows Bridge falls.", "event"); return; }
    if (s.phase === "bridge") {
      const i = BRIDGE_STEPS.indexOf(s.step);
      if (s.step === "outcome") { s.phase = "p2"; s.step = "parties"; this.newsIt("Borealis founds a federal Parliament. Four parties open their doors."); return; }
      s.step = BRIDGE_STEPS[i + 1];
      if (s.step === "pledge1") this.setTimer(STEP_MINUTES.pledge1);
      if (s.step === "pledge2") { for (const [k, v] of Object.entries(s.bridge.pledges1)) if (!(k in s.bridge.pledges2)) s.bridge.pledges2[k] = v; this.setTimer(STEP_MINUTES.pledge2); }
      if (s.step === "reveal") this.newsIt(`Pledges reach $${this.pledgeTotal(1)}B of $${this.d.cards.bridgeCrisis.rebuildCost}B.`);
      if (s.step === "outcome") this.bridgeOutcome();
      return;
    }
    if (s.phase === "p2") {
      if (s.step === "bill") return this.billNext();
      const i = P2_STEPS.indexOf(s.step);
      if (s.step === "year7") { s.phase = "debrief"; s.step = "debrief"; return; }
      s.step = P2_STEPS[i + 1];
      if (s.step === "election") this.runElection();
      if (s.step === "government") this.formGovernment();
      if (s.step === "bill") this.startBill();
      if (s.step === "year7") this.runYear7();
      if (STEP_MINUTES[s.step]) this.setTimer(STEP_MINUTES[s.step]);
      return;
    }
  }

  // ---------- Phase 1 ----------
  startYear(y) {
    const s = this.s, d = this.d;
    s.phase = "p1"; s.step = "headline"; s.year = y;
    // engine.year is still y-1 until the headline is applied
    s.yc = { event: d.deck.nationalByYear[String(y)] || null, revealed: false, local: {}, underdog: null };
    s.choices = {}; s.budgets = {}; s.offers = []; s.trades = []; s.aidUsed = {}; s.reasoning = {}; s.preYearEnd = null;
    const kind = d.deck.localByYear[String(y)] || "general";
    for (const pid of this.pids) s.yc.local[pid] = [this.drawLocal(pid, kind)];
    if (y >= 2) {
      let low = this.pids[0];
      for (const pid of this.pids) if (approvalTotal(this.g.provs[pid]) < approvalTotal(this.g.provs[low])) low = pid;
      const extra = s.pools[low].pop();
      if (extra) { s.yc.local[low].push(extra); s.yc.underdog = low; }
    }
    this.logIt(null, "A new fiscal year begins.", "year");
  }
  drawLocal(pid, kind) {
    if (kind === "general") return this.s.pools[pid].pop();
    return this.d.deck.provinceCardOrder[pid][kind === "province-1" ? 0 : 1];
  }

  doIncome() {
    const s = this.s, g = this.g;
    g.begin_year(s.yc.event);
    g.income();
    s.step = "income";
    if (s.yc.event) this.newsIt(this.g.events[s.yc.event].headline);
    else this.newsIt(`Year ${s.year}: a calm year. No national event.`);
    const top = [...this.pids].sort((a, b) => g.provs[b].gdp - g.provs[a].gdp)[0];
    this.newsIt(`Prices this year: Food ${g.price.food.toFixed(1)}, Energy ${g.price.energy.toFixed(1)}, Materials ${g.price.materials.toFixed(1)}. ${this.pname(top)} has the biggest economy.`);
  }

  closeTrade() {
    for (const o of this.s.offers) if (o.status === "open") o.status = "expired";
    this.s.step = "local";
    this.setTimer(STEP_MINUTES.local);
    const n = this.s.trades.filter((t) => !t.undone).length;
    this.newsIt(`The trade window closes. ${plural(n, "deal")} ${n === 1 ? "was" : "were"} made this year.`);
  }

  commitChoices() {
    const s = this.s;
    for (const pid of this.pids) {
      const c = s.choices[pid];
      if (c?.card && c?.choice) {
        this.g.choose(pid, c.card, c.choice);
        const card = this.g.cards[c.card];
        this.logIt(pid, `Local issue "${card.title}": ${card.choices.find((x) => x.id === c.choice).label}.`, "card");
      } else this.logIt(pid, "No local issue choice this year.", "card");
      if (s.yc.event) {
        if (c?.eventChoice) {
          this.g.choose(pid, s.yc.event, c.eventChoice, true);
          const ev = this.g.events[s.yc.event];
          this.logIt(pid, `Response to "${ev.title}": ${ev.choices.find((x) => x.id === c.eventChoice).label}.`, "card");
        }
      }
    }
    s.step = "budget";
    this.setTimer(STEP_MINUTES.budget);
  }

  defaultDecision(pid) {
    const p = this.g.provs[pid];
    return { ...p.prev, system: p.system, policy: "buy", project: null, planner: [], borrowReason: null };
  }

  finalDecision(pid) {
    const s = this.s, p = this.g.provs[pid];
    let d = s.budgets[pid]?.confirmed ? { ...s.budgets[pid].decision } : this.defaultDecision(pid);
    d = lockDecision(this.d, s.year, p, d);
    d.reasoning = s.reasoning[pid] || 0;
    if (this.g.must_balance(p) && this.g.finances(p, d).balance < 0) {
      d = EL.autoBalance(this.g, p, d, s.year);
      this.logIt(pid, "Lenders said no. The budget was balanced automatically.", "budget");
    }
    return d;
  }

  runYearEnd() {
    const s = this.s, g = this.g;
    for (const pid of this.pids) {
      const d = this.finalDecision(pid);
      g.set_budget(pid, d);
      if (!s.budgets[pid]?.confirmed) this.logIt(pid, "Budget not confirmed. Last year's settings were used.", "budget");
    }
    this.sync();
    s.preYearEnd = copy(s.engine);
    this._yearEnd();
    s.step = "results";
  }

  _yearEnd() {
    const s = this.s, g = this.g;
    const before = Object.fromEntries(this.pids.map((p) => [p, approvalTotal(g.provs[p])]));
    for (const pid of this.pids) g.provs[pid].decision.reasoning = s.reasoning[pid] || 0;
    g.year_end();
    s.lastYearDelta = {};
    const deltas = [];
    for (const pid of this.pids) {
      const h = g.provs[pid].history.at(-1);
      const dlt = h.approval - before[pid];
      s.lastYearDelta[pid] = pyRound(dlt, 1);
      deltas.push([pid, dlt]);
      this.logIt(pid, yearLine(this.d, h), "year-end");
    }
    deltas.sort((a, b) => b[1] - a[1]);
    this.newsIt(`Year ${s.year} results: ${this.pname(deltas[0][0])} approval ${changeWords(deltas[0][1])}. ${this.pname(deltas.at(-1)[0])} approval ${changeWords(deltas.at(-1)[1])}.`);
    for (const pid of this.pids) {
      const h = g.provs[pid].history.at(-1);
      if (h.short.length) this.newsIt(`${this.pname(pid)} ran short of ${h.short.join(" and ")}.`);
      if (h.balance < -0.05 * h.revenue) this.newsIt(`${this.pname(pid)} runs a $${Math.abs(h.balance).toFixed(1)}B deficit.`);
    }
  }

  setReasoning(pid, pts) {
    const s = this.s;
    s.reasoning[pid] = clamp(Math.round(pts), 0, 3);
    if (s.step === "results" && s.preYearEnd) {
      // Recompute the year end from the saved pre-year-end state with the new points.
      s.log = s.log.filter((l) => !(l.y === s.year && l.kind === "year-end"));
      this.g = Game.fromJSON(this.d, s.preYearEnd);
      this._yearEnd();
    }
    return { ok: true };
  }

  finishPhase1() {
    const avg = this.pids.reduce((a, p) => a + approvalTotal(this.g.provs[p]), 0) / this.pids.length;
    const goal = this.d.scoring.classGoal;
    this.s.classGoal = { avg: pyRound(avg, 1), met: avg >= 55, bonus: avg >= 55 ? goal.bonusMoney : 0 };
    this.newsIt(avg >= 55 ? `Strong Borealis! Average approval is ${avg.toFixed(0)}. The new federal government starts with $${goal.bonusMoney}B.` : `Average approval is ${avg.toFixed(0)}. The class goal was 55.`);
    this.s.awards = computeAwards(this.d, this.g, this.s);
  }

  // ---------- trade ----------
  have(pid, good) { const p = this.g.provs[pid]; return p.prod[good] + p.received[good] - p.shipped[good]; }

  checkDeal(a, b, give, get) {
    const C = this.d.constants;
    const g = this.g;
    if (a === b) return "Pick another province.";
    const giveV = g.dealValue(give), getV = g.dealValue(get);
    for (const [side, who] of [[give, a], [get, b]]) {
      for (const [k, q] of Object.entries(side)) {
        if (!(q > 0)) return "Amounts must be more than zero.";
        if (k !== "money" && q > this.have(who, k) + 1e-9) return `${this.pname(who)} only has ${Math.floor(this.have(who, k))} ${k}.`;
      }
    }
    if (!giveV && !getV) return "Add something to the deal.";
    if (!giveV || !getV) {
      const total = (giveV ? Object.values(give) : Object.values(get)).reduce((x, y) => x + y, 0);
      const giver = giveV ? a : b;
      if (total + (this.s.aidUsed[giver] || 0) > C.aidCapPerYear) return `Aid is limited to ${C.aidCapPerYear} units or $${C.aidCapPerYear}B a year.`;
      return null;
    }
    const r = getV / giveV;
    if (r < C.fairPriceBand[0] || r > C.fairPriceBand[1]) return "This deal is outside the fair price band. Each side must get at least half of what it gives.";
    return null;
  }

  applyDeal(t) {
    const g = this.g;
    const giveV = g.dealValue(t.give), getV = g.dealValue(t.get);
    if (giveV && getV) return g.trade_deal(t.a, t.b, t.give, t.get);
    // Aid: a gift with nothing back (logged on the board)
    const [src, dst, side] = giveV ? [g.provs[t.a], g.provs[t.b], t.give] : [g.provs[t.b], g.provs[t.a], t.get];
    for (const [k, q] of Object.entries(side)) {
      if (k === "money") { src.trade_money -= q; dst.trade_money += q; }
      else { src.shipped[k] += q; dst.received[k] += q * (1 - g.trade_fee); }
    }
    return [true, "aid"];
  }

  executeDeal(a, b, give, get, via) {
    const err = this.checkDeal(a, b, give, get);
    if (err) return { ok: false, msg: err };
    const t = { id: this.id(), a, b, give: copy(give), get: copy(get), year: this.s.year, via, undone: false, t: Date.now() };
    t.fair = !!(this.g.dealValue(give) && this.g.dealValue(get));
    if (!t.fair) { const giver = this.g.dealValue(give) ? a : b; this.s.aidUsed[giver] = (this.s.aidUsed[giver] || 0) + Object.values(this.g.dealValue(give) ? give : get).reduce((x, y) => x + y, 0); }
    this.applyDeal(t);
    this.s.trades.push(t);
    const line = dealText(this.d, a, b, give, get);
    this.newsIt(line);
    this.logIt(a, "Trade: " + line, "trade");
    this.logIt(b, "Trade: " + line, "trade");
    return { ok: true, trade: t };
  }

  replayTrades() {
    for (const p of Object.values(this.g.provs)) {
      p.received = { food: 0, energy: 0, materials: 0 }; p.shipped = { food: 0, energy: 0, materials: 0 }; p.trade_money = 0;
    }
    this.s.aidUsed = {};
    for (const t of this.s.trades) if (!t.undone) {
      this.applyDeal(t);
      if (!t.fair) { const giver = this.g.dealValue(t.give) ? t.a : t.b; this.s.aidUsed[giver] = (this.s.aidUsed[giver] || 0) + Object.values(this.g.dealValue(t.give) ? t.give : t.get).reduce((x, y) => x + y, 0); }
    }
  }

  undoTrade(id) {
    const t = this.s.trades.find((x) => x.id === id);
    if (!t || t.undone) return { ok: false, msg: "Trade not found." };
    t.undone = true;
    this.replayTrades();
    this.logIt(t.a, `Teacher undid a trade with ${this.pname(t.b)}.`, "trade");
    this.newsIt(`A trade between ${this.pname(t.a)} and ${this.pname(t.b)} was undone.`);
    return { ok: true };
  }

  // ---------- Phase 2 helpers ----------
  partyRanking(party) { return EL.rankingFromBorda(this.d.parties.find((p) => p.id === party), this.s.p2.borda[party]); }
  partyPlatform(party) {
    const pt = this.d.parties.find((p) => p.id === party);
    return EL.platformLevers(this.d, pt, this.partyRanking(party), this.s.p2.levers[party]);
  }
  fedStartDebt() { return -(this.s.classGoal?.bonus || 0); }
  partyMoney(party) { return EL.fedMoney(this.d, this.partyPlatform(party).levers, EL.nationalGdp(this.g), this.fedStartDebt()); }
  partySeats(party) { return this.s.p2.election?.seats?.[party] || 0; }

  runElection() {
    const d = this.d, s = this.s, p2 = s.p2;
    const issues = EL.provinceIssues(d, this.g);
    const rankings = {}, promises = {}, leaders = {}, momentum = {}, deficitPct = {};
    const order = p2.debate.order.length ? p2.debate.order : [];
    for (const party of this.parties) {
      rankings[party] = this.partyRanking(party);
      promises[party] = p2.promise[party];
      leaders[party] = p2.leader[party];
      const idx = order.indexOf(party);
      momentum[party] = (idx >= 0 ? d.election.debateMomentum.endorsementRankBonus[idx] || 0 : 0) + (p2.debate.bonus[party] || 0);
      deficitPct[party] = this.partyMoney(party).deficitPct;
    }
    const campaign = Object.fromEntries(this.parties.map((x) => [x, p2.campaign[x].riding]));
    const shares = EL.appealTable(d, { rankings, promises, campaign, leaders, momentum, ballots: p2.ballots, issues, deficitPct });
    const res = EL.countSeats(d, shares, this.rnd(31));
    const pr = EL.proportionalSeats(res.votes, d.election.seats);
    const provWinner = {};
    for (const pid of this.pids) {
      const c = {};
      for (const r of d.ridings.filter((x) => x.province === pid)) c[res.winners[r.id]] = (c[res.winners[r.id]] || 0) + 1;
      const best = Math.max(...Object.values(c));
      const top = Object.keys(c).filter((k) => c[k] === best);
      provWinner[pid] = top.length === 1 ? top[0] : null;
    }
    p2.election = { shares, issues, ...res, pr, provWinner };
    const ranked = [...this.parties].sort((a, b) => res.seats[b] - res.seats[a]);
    this.newsIt(`Election night: ${ranked.map((x) => `${this.partyName(x)} ${res.seats[x]}`).join(", ")}.`);
    this.logIt(null, `Election results: ${ranked.map((x) => `${this.partyName(x)} ${res.seats[x]} seat${res.seats[x] === 1 ? "" : "s"} (${(100 * res.votes[x]).toFixed(0)}% of the vote)`).join("; ")}.`, "election");
  }

  formGovernment() {
    const p2 = this.s.p2, E = this.d.election;
    const ranked = [...this.parties].sort((a, b) => p2.election.seats[b] - p2.election.seats[a] || p2.election.votes[b] - p2.election.votes[a]);
    const top = ranked[0];
    const majority = p2.election.seats[top] >= E.majority;
    p2.gov = { order: ranked, idx: 0, party: top, majority, status: majority ? "passed" : "pending",
      votes: Object.fromEntries(this.parties.map((x) => [x, x === top ? "yes" : "no"])), tries: [] };
    p2.gov.opposition = ranked.find((x) => x !== top);
    this.newsIt(majority ? `${this.partyName(top)} wins a majority with ${p2.election.seats[top]} seats.` : `A minority Parliament. ${this.partyName(top)} has the most seats and must win a confidence vote.`);
  }

  seatVote(votes) {
    const yes = this.parties.filter((x) => votes[x] === "yes").reduce((a, x) => a + this.partySeats(x), 0);
    const no = this.d.election.seats - yes;
    return { yes, no, passed: yes >= this.d.election.majority };
  }

  confidenceVote() {
    const gov = this.s.p2.gov;
    const r = this.seatVote(gov.votes);
    gov.tries.push({ party: gov.party, ...r });
    if (r.passed) {
      gov.status = "passed";
      this.newsIt(`The Throne Speech passes ${r.yes} to ${r.no}. ${this.partyName(gov.party)} forms government.`);
    } else {
      this.newsIt(`The Throne Speech fails ${r.yes} to ${r.no}. The Governor General asks the next party.`);
      gov.idx = (gov.idx + 1) % gov.order.length;
      gov.party = gov.order[gov.idx];
      gov.votes = Object.fromEntries(this.parties.map((x) => [x, x === gov.party ? "yes" : "no"]));
      gov.opposition = gov.order.find((x) => x !== gov.party);
    }
    this.logIt(null, `Confidence vote: ${r.yes} yes, ${r.no} no.`, "parliament");
    return { ok: true, result: r };
  }

  startBill() {
    const p2 = this.s.p2;
    const gov = p2.gov.party;
    p2.bill = { stage: 0, levers: copy(this.partyPlatform(gov).levers), amendments: [], qp: {}, votes: Object.fromEntries(this.parties.map((x) => [x, x === gov ? "yes" : "no"])),
      classVote: { yes: 0, no: 0 }, senate: null, result: null, fell: false };
  }

  billNext() {
    const p2 = this.s.p2, b = p2.bill;
    if (b.stage === 3) {
      for (const a of b.amendments) {
        if (a.result) continue;
        const r = this.seatVote(a.votes);
        a.result = r.passed ? "passed" : "failed";
        if (r.passed) applyLeverChange(this.d, b.levers, a.lever, a.dir);
        this.newsIt(`Amendment from ${this.partyName(a.party)} (${leverLabel(this.d, a.lever)} ${a.dir > 0 ? "up" : "down"}) ${a.result}, ${r.yes} to ${r.no}.`);
      }
    }
    if (b.stage === 4) {
      const r = this.seatVote(b.votes);
      b.result = { ...r };
      this.newsIt(`House vote on C-1: ${r.yes} yes, ${r.no} no. The bill ${r.passed ? "passes" : "fails"}.`);
      this.logIt(null, `House vote on C-1: ${r.yes} yes, ${r.no} no. Class show of hands: ${b.classVote.yes} yes, ${b.classVote.no} no.`, "parliament");
      if (!r.passed) {
        b.fell = true;
        this.newsIt(`The government loses the budget vote and falls. In real life, an election would follow.`);
        this.s.phase = "debrief"; this.s.step = "debrief";
        return;
      }
    }
    if (b.stage === 5 && b.senate?.lever && !b.senate.applied) {
      applyLeverChange(this.d, b.levers, b.senate.lever, b.senate.dir);
      b.senate.applied = true;
      this.newsIt(`The Senate sends back one change (${leverLabel(this.d, b.senate.lever)}). The House accepts it.`);
    }
    if (b.stage === 6) {
      this.s.step = "year7";
      this.runYear7();
      return;
    }
    b.stage++;
    if (b.stage === 6) this.newsIt("The Governor General gives Royal Assent. C-1 is law.");
  }

  runYear7() {
    const g = this.g, d = this.d, s = this.s;
    if (s.p2.year7) return;
    const before = Object.fromEntries(this.pids.map((p) => [p, approvalTotal(g.provs[p])]));
    const levers = s.p2.bill?.levers || EL.defaultLevers(d);
    const gdp = EL.nationalGdp(g);
    const money = EL.fedMoney(d, levers, gdp, this.fedStartDebt());
    g.begin_year(null);
    s.year = g.year;
    // bridge crisis effects carry into the first federal year
    g.register({ type: "unemployment", amount: 1, target: ["goldplain", "lakemoor"] }, null, "event");
    if (s.bridge.outcome === "temporary") {
      for (const [pid, amt] of Object.entries(s.bridge.pledges2)) if (amt > 0) g.register({ type: "money", amount: -amt }, pid, "choice");
    }
    g.income();
    const notes = EL.registerFederal(d, g, levers);
    g.trade_market(null, Object.fromEntries(this.pids.map((p) => [p, g.provs[p].prev.infrastructure])));
    for (const pid of this.pids) {
      const p = g.provs[pid];
      // Year 7 has no Budget Speech. Year 6 reasoning points carry over, so the federal year is not a hidden penalty.
      let dec = { ...p.prev, system: p.system, policy: "buy", reasoning: p.history.at(-1)?.reasoning || 0, planner: [], project: null };
      if (g.must_balance(p) && g.finances(p, dec).balance < 0) dec = EL.autoBalance(g, p, dec, 7);
      g.set_budget(pid, dec);
    }
    g.year_end();
    const rows = {};
    for (const pid of this.pids) {
      const h = g.provs[pid].history.at(-1);
      let fed = 0;
      for (const grp of GROUPS) fed += (h.why[grp].federal || 0) * g.provs[pid].share[grp];
      rows[pid] = { before: pyRound(before[pid], 1), after: h.approval, delta: pyRound(h.approval - before[pid], 1), federal: pyRound(fed, 1), notes: notes[pid] || [] };
      s.lastYearDelta[pid] = rows[pid].delta;
      this.logIt(pid, `Year 7 (federal budget in effect): approval ${fmtSigned(rows[pid].delta)}, federal part ${fmtSigned(rows[pid].federal)}. ${(notes[pid] || []).join(". ")}`, "year-end");
    }
    s.p2.year7 = { rows, money: { ...money }, levers: copy(levers), gdp };
    this.newsIt(`Year ${s.year}: the first federal budget reaches every province. Federal ${money.balance >= 0 ? "surplus" : "deficit"} $${Math.abs(money.balance).toFixed(1)}B.`);
  }

  pledgeTotal(r) { return pyRound(Object.values(this.s.bridge["pledges" + r]).reduce((a, b) => a + b, 0), 1); }
  bridgeOutcome() {
    const cost = this.d.cards.bridgeCrisis.rebuildCost;
    const tot = this.pledgeTotal(2);
    this.s.bridge.outcome = tot >= cost ? "temporary" : "short";
    this.newsIt(tot >= cost ? `Pledges reach $${tot}B. A temporary bridge opens for 2 years.` : `Pledges reach only $${tot}B of $${cost}B. The bridge stays closed.`);
    this.logIt(null, `Bridge pledges: $${tot}B of $${cost}B. ${this.d.cards.bridgeCrisis.outcomes[this.s.bridge.outcome]}`, "event");
  }

  // ---------- intents ----------
  // actor: "board" or "province:<id>" or "party:<id>". Returns { ok, msg }.
  intent(actor, type, p = {}) {
    try {
      const r = this._intent(actor, type, p || {});
      return r || { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "That did not work: " + e.message };
    }
  }

  _intent(actor, type, p) {
    const s = this.s;
    const isBoard = actor === "board";
    const [kind, who] = isBoard ? ["board", null] : actor.split(":");
    const pid = kind === "province" ? who : p.pid;
    const party = kind === "party" ? who : p.party;
    if (s.paused && !isBoard) return { ok: false, msg: "Eyes up. The game is paused." };
    const needStep = (...steps) => { if (!steps.includes(s.step)) throw new Error("This is not open right now."); };
    const needBoard = () => { if (!isBoard) throw new Error("Only the board can do this."); };
    switch (type) {
      case "hello": return { ok: true };
      // ----- Phase 1 trade -----
      case "proposeTrade": {
        needStep("trade");
        const open = s.offers.filter((o) => o.from === pid && o.status === "open").length;
        if (open >= this.d.constants.maxOpenOffers) return { ok: false, msg: `You can have ${this.d.constants.maxOpenOffers} open offers at a time.` };
        const give = cleanSide(p.give), get = cleanSide(p.get);
        const err = this.checkDeal(pid, p.to, give, get);
        if (err) return { ok: false, msg: err };
        const twin = s.offers.find((x) => x.from === pid && x.to === p.to && x.status === "open" && Date.now() - x.t < 2000 && JSON.stringify([x.give, x.get]) === JSON.stringify([give, get]));
        if (twin) return { ok: false, msg: "That offer is already sent." };
        const o = { id: this.id(), from: pid, to: p.to, give, get, status: "open", counters: 0, turn: p.to, t: Date.now() };
        s.offers.push(o);
        this.logIt(pid, `Offer to ${this.pname(p.to)}: ${sideText(give)} for ${sideText(get)}.`, "offer");
        return { ok: true, msg: "Offer sent." };
      }
      case "respondTrade": {
        needStep("trade");
        const o = s.offers.find((x) => x.id === p.id);
        if (!o || o.status !== "open") return { ok: false, msg: "This offer is closed." };
        const me = isBoard ? o.turn : pid;
        if (o.turn !== me) return { ok: false, msg: "Wait for the other province to answer." };
        if (p.action === "decline") { o.status = "declined"; this.logIt(me, `Declined an offer.`, "offer"); return { ok: true, msg: "Declined." }; }
        if (p.action === "counter") {
          if (o.counters >= this.d.constants.maxCounters) return { ok: false, msg: "No more counters. Accept or decline." };
          const give = cleanSide(p.give), get = cleanSide(p.get);
          const err = this.checkDeal(o.from, o.to, give, get);
          if (err) return { ok: false, msg: err };
          o.give = give; o.get = get; o.counters++; o.turn = o.turn === o.to ? o.from : o.to;
          return { ok: true, msg: "Counter sent." };
        }
        if (p.action === "accept") {
          const r = this.executeDeal(o.from, o.to, o.give, o.get, "devices");
          if (!r.ok) return r;
          o.status = "accepted"; o.tradeId = r.trade.id;
          return { ok: true, msg: "Deal done." };
        }
        return { ok: false, msg: "Unknown answer." };
      }
      case "cancelOffer": {
        const o = s.offers.find((x) => x.id === p.id);
        if (o && o.status === "open" && (isBoard || o.from === pid)) o.status = "cancelled";
        return { ok: true };
      }
      case "deskTrade": { needBoard(); needStep("trade"); return this.executeDeal(p.a, p.b, cleanSide(p.give), cleanSide(p.get), "desk"); }
      case "undoTrade": { needBoard(); return this.undoTrade(p.id); }
      // ----- cards -----
      case "chooseCard": {
        needStep("local");
        if (!s.yc.local[pid]?.includes(p.card)) return { ok: false, msg: "That card is not yours this year." };
        s.choices[pid] = { ...(s.choices[pid] || {}), card: p.card, choice: p.choice };
        return { ok: true };
      }
      case "chooseEvent": {
        needStep("local");
        if (!s.yc.event) return { ok: false, msg: "No event this year." };
        s.choices[pid] = { ...(s.choices[pid] || {}), eventChoice: p.choice };
        return { ok: true };
      }
      case "swapEvent": {
        needBoard(); needStep("headline");
        if (s.yc.revealed) return { ok: false, msg: "The card is already revealed." };
        s.yc.event = p.event || null;
        this.logIt(null, `Teacher swapped the national event to ${p.event ? this.g.events[p.event].title : "no event"}.`, "event");
        return { ok: true };
      }
      case "reveal": { needBoard(); needStep("headline"); s.yc.revealed = true; return { ok: true }; }
      case "swapLocal": {
        needBoard(); needStep("headline", "income", "trade", "local");
        if (s.choices[p.pid]?.choice) return { ok: false, msg: "This province already chose." };
        s.yc.local[p.pid] = [p.card];
        this.logIt(p.pid, `Teacher swapped the local issue card to "${this.g.cards[p.card].title}".`, "card");
        return { ok: true };
      }
      // ----- budget -----
      case "confirmBudget": {
        needStep("budget");
        const prov = this.g.provs[pid];
        const dec = lockDecision(this.d, s.year, prov, { ...this.defaultDecision(pid), ...p.decision });
        const f = this.g.finances(prov, dec);
        if (this.g.must_balance(prov) && f.balance < -0.05) return { ok: false, msg: "Lenders say no. Your budget must balance (zero or better)." };
        if (s.year >= 4 && f.balance < -0.05 && !dec.borrowReason) return { ok: false, msg: "You plan a deficit. Pick a borrow reason: Crisis or Investment." };
        s.budgets[pid] = { decision: dec, confirmed: true, by: kind };
        if (p.reasoning !== undefined && isBoard) s.reasoning[pid] = p.reasoning;
        this.logIt(pid, budgetText(this.d, dec, f), "budget");
        return { ok: true, msg: "Budget confirmed." };
      }
      case "unconfirmBudget": {
        if (s.budgets[pid]) s.budgets[pid].confirmed = false;
        return { ok: true };
      }
      case "reasoning": { needBoard(); return this.setReasoning(p.pid, p.points); }
      case "override": {
        needBoard();
        return this.override(p.pid, p.field, Number(p.value), p.reason || "");
      }
      // ----- bridge -----
      case "pledge": {
        needStep("pledge1", "pledge2");
        const cap = pledgeCap(this.g, pid);
        const amt = clamp(Math.round(Number(p.amount) * 10) / 10, 0, cap);
        s.bridge[s.step === "pledge1" ? "pledges1" : "pledges2"][pid] = amt;
        return { ok: true, msg: `Pledge of $${amt}B saved.` };
      }
      // ----- Phase 2 -----
      case "setMembers": {
        needBoard();
        s.p2.members[p.party][p.pid] = clamp(Math.round(Number(p.count) || 0), 0, 12);
        return { ok: true };
      }
      case "addRanking": {
        const order = p.order || [];
        const pt = this.d.parties.find((x) => x.id === party);
        if (order.length !== pt.planks.length || new Set(order).size !== order.length) return { ok: false, msg: "Rank all 4 promises." };
        const b = s.p2.borda[party];
        order.forEach((id, i) => { b[id] = (b[id] || 0) + (order.length - 1 - i); });
        s.p2.ballotsIn[party]++;
        return { ok: true, msg: "Ranking added." };
      }
      case "resetRankings": { s.p2.borda[party] = {}; s.p2.ballotsIn[party] = 0; return { ok: true }; }
      case "setLeader": { s.p2.leader[party] = p.province || null; if (p.province) this.newsIt(`${this.partyName(party)} picks a leader from ${this.pname(p.province)}.`); return { ok: true }; }
      case "setPromise": { s.p2.promise[party] = p.province || null; return { ok: true }; }
      case "setLevers": {
        const lv = s.p2.levers[party];
        for (const k of ["tax", ...CATS]) if (p.levers[k] !== undefined) lv[k] = clamp(Math.round(p.levers[k]), 1, 5);
        if (p.levers.bridge) lv.bridge = p.levers.bridge;
        if (p.levers.equalization !== undefined) lv.equalization = !!p.levers.equalization;
        if (p.levers.programs) lv.programs = p.levers.programs.filter((x) => this.d.federalBudget.programs[x]);
        return { ok: true };
      }
      case "setCandidate": { s.p2.candidates[party][p.province] = !!p.on; return { ok: true }; }
      case "campaign": { needStep("campaign"); return this.campaign(party, p); }
      case "undoCampaign": {
        const c = s.p2.campaign[party]; const a = c.actions.pop();
        if (!a) return { ok: false, msg: "Nothing to undo." };
        c.spent -= a.cost;
        for (const [rid, v] of Object.entries(a.adds || {})) c.riding[rid] -= v;
        if (a.action === "gotv") c.gotv--;
        return { ok: true };
      }
      case "debate": { needBoard(); s.p2.debate = { order: p.order || [], bonus: p.bonus || {} }; return { ok: true }; }
      case "castBallot": {
        // Secret ballot on the riding's device: one tap adds one to a count. Nothing else is stored.
        needStep("vote");
        if (kind !== "province" && !isBoard) return { ok: false, msg: "Vote on your home riding's device." };
        if (!this.parties.includes(p.party)) return { ok: false, msg: "Pick a party." };
        const cast = Object.values(s.p2.ballots[pid]).reduce((a, b) => a + b, 0);
        const cap = votersFor(s, pid);
        if (cast >= cap) return { ok: false, msg: `All ${cap} voters in ${this.pname(pid)} have voted. Voting is closed here.` };
        s.p2.ballots[pid][p.party]++;
        return { ok: true, msg: "Ballot cast. Pass the device to the next voter." };
      }
      case "ballots": {
        needBoard();
        const others = Object.entries(s.p2.ballots[p.pid]).filter(([k]) => k !== p.party).reduce((a, [, v]) => a + v, 0);
        const room = Math.max(0, votersFor(s, p.pid) - others);
        const n = clamp(Math.round(Number(p.count) || 0), 0, room);
        s.p2.ballots[p.pid][p.party] = n;
        return n < Math.round(Number(p.count) || 0) ? { ok: false, msg: `Only ${votersFor(s, p.pid)} voters in ${this.pname(p.pid)}. Raise the voter count first.` } : { ok: true };
      }
      case "setVoters": { needBoard(); (s.p2.voters ||= {})[p.pid] = clamp(Math.round(Number(p.count) || 0), 1, 12); return { ok: true }; }
      case "govVote": {
        // confidence vote ballot from a party (bloc) or the board
        if (!s.p2.gov) return { ok: false, msg: "No vote yet." };
        s.p2.gov.votes[party] = p.vote; return { ok: true };
      }
      case "holdConfidence": { needBoard(); return this.confidenceVote(); }
      case "billLevers": {
        needStep("bill");
        if (!isBoard && party !== s.p2.gov.party) return { ok: false, msg: "Only Cabinet drafts the bill." };
        if (s.p2.bill.stage > 0) return { ok: false, msg: "The bill is already tabled." };
        Object.assign(s.p2.bill.levers, p.levers);
        return { ok: true };
      }
      case "amend": {
        needStep("bill");
        const b = s.p2.bill;
        if (b.stage !== 3) return { ok: false, msg: "Amendments open at the Amendments stage." };
        if (party === s.p2.gov.party) return { ok: false, msg: "Opposition parties move amendments." };
        b.amendments = b.amendments.filter((a) => a.party !== party);
        if (p.lever) b.amendments.push({ party, lever: p.lever, dir: p.dir > 0 ? 1 : -1, votes: Object.fromEntries(this.parties.map((x) => [x, x === party ? "yes" : "no"])), result: null });
        return { ok: true, msg: "Amendment moved." };
      }
      case "amendVote": { const a = s.p2.bill.amendments.find((x) => x.party === p.amendParty); if (a && !a.result) a.votes[party] = p.vote; return { ok: true }; }
      case "billVote": { needStep("bill"); s.p2.bill.votes[party] = p.vote; return { ok: true }; }
      case "classVote": { needBoard(); s.p2.bill.classVote = { yes: Math.max(0, p.yes | 0), no: Math.max(0, p.no | 0) }; return { ok: true }; }
      case "qp": { needBoard(); s.p2.bill.qp[p.party] = clamp(Number(p.score) || 0, 0, 12); return { ok: true }; }
      case "senate": { needBoard(); s.p2.bill.senate = p.lever ? { lever: p.lever, dir: p.dir > 0 ? 1 : -1, applied: false } : null; return { ok: true }; }
      default: return { ok: false, msg: "Unknown action: " + type };
    }
  }

  campaign(party, p) {
    const E = this.d.election;
    const c = this.s.p2.campaign[party];
    const act = E.campaignActions.find((a) => a.id === p.action);
    if (!act) return { ok: false, msg: "Pick an action." };
    if (c.spent + act.cost > E.campaignActionsPerParty) return { ok: false, msg: "You have no action points left." };
    const adds = {};
    const ridingsOf = (prov) => this.d.ridings.filter((r) => r.province === prov).map((r) => r.id);
    if (p.action === "door") adds[p.riding] = 2;
    else if (p.action === "phones") adds[p.riding] = 1;
    else if (p.action === "flyers") {
      const rs = (p.ridings || []).slice(0, 2);
      if (rs.length < 1) return { ok: false, msg: "Pick ridings." };
      const prov = this.d.ridings.find((r) => r.id === rs[0]).province;
      if (rs.some((r) => this.d.ridings.find((x) => x.id === r).province !== prov)) return { ok: false, msg: "Flyers go to two ridings in the same province." };
      for (const r of rs) adds[r] = 1;
    } else if (p.action === "rally") {
      if (!p.province) return { ok: false, msg: "Pick a province." };
      if (!(this.s.p2.members[party][p.province] > 0)) return { ok: false, msg: "Rallies need party members from that province." };
      for (const r of ridingsOf(p.province)) adds[r] = 1;
    } else if (p.action === "gotv") {
      if (c.gotv >= 3) return { ok: false, msg: "Get out the vote can be used 3 times per party." };
      c.gotv++;
    }
    for (const rid of Object.keys(adds)) if (!this.d.ridings.find((r) => r.id === rid)) return { ok: false, msg: "Pick a riding." };
    for (const [rid, v] of Object.entries(adds)) c.riding[rid] = (c.riding[rid] || 0) + v;
    c.spent += act.cost;
    c.actions.push({ action: p.action, cost: act.cost, adds });
    return { ok: true, msg: `${act.name} done.` };
  }

  override(pid, field, value, reason) {
    const p = this.g.provs[pid];
    if (!p || !isFinite(value)) return { ok: false, msg: "Enter a number." };
    const lim = overrideLimits(this.g, pid)[field];
    if (!lim) return { ok: false, msg: "This number cannot be changed." };
    if (value < lim.min || value > lim.max) return { ok: false, msg: `${lim.label} must be between ${lim.min} and ${lim.max}.` };
    let old;
    if (field === "approval") {
      old = approvalTotal(p);
      const delta = value - old;
      for (const g of GROUPS) p.approval[g] = clamp(p.approval[g] + delta, 5, 95);
    } else if (field === "debt") { old = p.debt; p.debt = value; }
    else if (field === "unemployment") { old = p.unemployment; p.unemployment = clamp(value, 2, 20); }
    else if (field === "cpi") { old = p.cpi; p.cpi = value; }
    else if (GOODS.includes(field)) { old = p.prod[field] ?? 0; p.prod[field] = Math.max(0, Math.round(value)); }
    else return { ok: false, msg: "This number cannot be changed." };
    this.logIt(pid, `Teacher override: ${field} changed from ${pyRound(old, 1)} to ${pyRound(value, 1)}. Reason: ${reason || "none given"}.`, "override");
    return { ok: true };
  }

  // ---------- demo helpers ----------
  fillSample() {
    const s = this.s, g = this.g, rnd = this.rnd(97);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    if (s.phase === "p1" && s.step === "trade") {
      let made = 0;
      for (const good of GOODS) {
        for (const buyer of this.pids) {
          const p = g.provs[buyer];
          const short = Math.ceil(g.need(p, good, p.prev.infrastructure) - this.have(buyer, good));
          if (short <= 0) continue;
          const seller = [...this.pids].sort((a, b) => (this.have(b, good) - g.need(g.provs[b], good)) - (this.have(a, good) - g.need(g.provs[a], good)))[0];
          const spare = Math.floor(this.have(seller, good) - g.need(g.provs[seller], good, g.provs[seller].prev.infrastructure));
          const q = Math.min(spare, Math.ceil(short / 0.9));
          if (q < 1 || seller === buyer) continue;
          const r = this.executeDeal(seller, buyer, { [good]: q }, { money: pyRound(q * g.price[good], 1) }, "sample");
          if (r.ok) made++;
        }
      }
      return { ok: true, msg: `${plural(made, "sample trade")} made.` };
    }
    if (s.phase === "p1" && s.step === "local") {
      for (const pid of this.pids) {
        const c = s.choices[pid] || {};
        if (!c.choice) { const card = this.g.cards[s.yc.local[pid][0]]; c.card = card.id; c.choice = pick(card.choices).id; }
        if (s.yc.event && !c.eventChoice) c.eventChoice = pick(this.g.events[s.yc.event].choices).id;
        s.choices[pid] = c;
      }
      return { ok: true };
    }
    if (s.phase === "p1" && s.step === "budget") {
      for (const pid of this.pids) {
        if (s.budgets[pid]?.confirmed) continue;
        const p = g.provs[pid];
        let dec = this.defaultDecision(pid);
        for (const c of CATS) dec[c] = clamp(dec[c] + pick([-1, 0, 0, 0, 1]), 1, 5);
        if (s.year >= 2) dec.system = clamp(p.system + pick([-1, 0, 0, 1]), 1, 5);
        dec = lockDecision(this.d, s.year, p, dec);
        let f = g.finances(p, dec);
        if (f.balance < -0.04 * p.gdp || g.must_balance(p)) dec = EL.autoBalance(g, p, dec, s.year);
        f = g.finances(p, dec);
        if (f.balance < 0) dec.borrowReason = "crisis";
        s.budgets[pid] = { decision: dec, confirmed: true, by: "sample" };
        if (s.reasoning[pid] === undefined) s.reasoning[pid] = 1 + Math.floor(rnd() * 3);
      }
      return { ok: true };
    }
    if (s.phase === "p1" && s.step === "results") { for (const pid of this.pids) if (!s.reasoning[pid]) this.setReasoning(pid, 1 + Math.floor(rnd() * 3)); return { ok: true }; }
    if (s.phase === "bridge" && (s.step === "pledge1" || s.step === "pledge2")) {
      const key = s.step === "pledge1" ? "pledges1" : "pledges2";
      for (const pid of this.pids) if (!(pid in s.bridge[key]) || s.step === "pledge2") s.bridge[key][pid] = Math.min(pledgeCap(g, pid), pyRound((s.bridge.pledges1[pid] || 0) + Math.floor(rnd() * 4) + (g.provs[pid].pop > 4 ? 4 : 1), 1));
      return { ok: true };
    }
    if (s.phase === "p2") return this.fillSampleP2(rnd, pick);
    return { ok: true, msg: "Nothing to fill on this step." };
  }

  fillSampleP2(rnd, pick) {
    const s = this.s, p2 = s.p2, d = this.d;
    if (s.step === "parties") {
      const total = this.parties.reduce((a, x) => a + Object.values(p2.members[x]).reduce((m, n) => m + n, 0), 0);
      if (!total) for (const pid of this.pids) for (let i = 0; i < 4; i++) p2.members[this.parties[(i + this.pids.indexOf(pid)) % 4]][pid]++;
      for (const party of this.parties) {
        if (!p2.leader[party]) p2.leader[party] = pick(this.pids.filter((x) => p2.members[party][x] > 0));
        if (!p2.ballotsIn[party]) {
          const ids = d.parties.find((x) => x.id === party).planks.map((x) => x.id);
          for (let i = 0; i < 7; i++) this._intent("party:" + party, "addRanking", { order: shuffle(ids, rnd) });
        }
      }
      return { ok: true };
    }
    if (s.step === "platform") {
      for (const party of this.parties) {
        if (!p2.promise[party]) p2.promise[party] = pick(this.pids);
        for (const pid of this.pids) p2.candidates[party][pid] = true;
      }
      return { ok: true };
    }
    if (s.step === "campaign") {
      for (const party of this.parties) {
        let guard = 0;
        while (p2.campaign[party].spent < d.election.campaignActionsPerParty && guard++ < 40) {
          this.campaign(party, { action: pick(["door", "phones", "door"]), riding: pick(d.ridings).id });
        }
      }
      p2.debate = { order: shuffle(this.parties, rnd), bonus: { [pick(this.parties)]: 1 } };
      return { ok: true };
    }
    if (s.step === "vote") {
      for (const pid of this.pids) for (let i = 0; i < 4; i++) p2.ballots[pid][pick(this.parties)]++;
      return { ok: true };
    }
    if (s.step === "government" && p2.gov.status !== "passed") {
      const partner = p2.gov.order.find((x) => x !== p2.gov.party && this.partySeats(x) + this.partySeats(p2.gov.party) >= d.election.majority);
      if (partner) p2.gov.votes[partner] = "yes";
      return { ok: true };
    }
    if (s.step === "bill") {
      const b = p2.bill;
      if (b.stage === 2) for (const x of this.parties) if (x !== p2.gov.party) b.qp[x] = 2 + Math.floor(rnd() * 4);
      if (b.stage === 3 && !b.amendments.length) {
        for (const x of this.parties) if (x !== p2.gov.party) this._intent("party:" + x, "amend", { lever: pick(["health", "education", "social", "tax"]), dir: pick([1, -1]) });
      }
      if (b.stage === 4) {
        if (!p2.gov.majority) for (const x of this.parties) if (p2.gov.votes[x] === "yes") b.votes[x] = "yes";
        b.classVote = { yes: 10 + Math.floor(rnd() * 10), no: 5 + Math.floor(rnd() * 10) };
      }
      return { ok: true };
    }
    return { ok: true, msg: "Nothing to fill on this step." };
  }

  // End Phase 1 after any finished year (the 12-period plan). Works at Year-end results,
  // or at the next headline before it is revealed.
  endPhase1() {
    const s = this.s;
    if (s.phase !== "p1") return { ok: false, msg: "This works during Phase 1." };
    if (this.g.year < 1) return { ok: false, msg: "Play at least one year first." };
    if (!(s.step === "results" || (s.step === "headline" && this.g.year === s.year - 1))) return { ok: false, msg: "Finish this year first. Press Next until Year-end results, then end Phase 1." };
    this.pushUndo();
    s.year = this.g.year;
    s.phase = "review"; s.step = "review";
    s.timer = { duration: 0, remaining: 0, endsAt: null };
    this.logIt(null, `Teacher ended Phase 1 after Year ${s.year}.`, "year");
    this.finishPhase1();
    return { ok: true };
  }

  fastForward(target = "p2") {
    let guard = 0;
    while (guard++ < 200) {
      if (target === "bridge" && this.s.phase === "bridge") break;
      if (target === "p2" && this.s.phase === "p2") break;
      if (target === "review" && this.s.phase === "review") break;
      if (this.s.phase === "debrief") break;
      this.fillSample();
      const r = this.next(true);
      if (r && r.ok === false) return r;
    }
    return { ok: true };
  }
}

// ---------- pure helpers (board and groups) ----------
// A province can pledge up to 30% of last year's revenue. Pledges are paid in Year 7 if the bridge is built.
export function pledgeCap(g, pid) {
  const h = g.provs[pid].history.at(-1);
  const pct = (g.d.cards.bridgeCrisis.pledgeCapPctRevenue ?? 60) / 100;
  return Math.max(1, Math.round(pct * (h ? h.revenue : g.provs[pid].gdp * 0.3)));
}
export function pledgeCapTotal(g) { return Object.keys(g.provs).reduce((a, pid) => a + pledgeCap(g, pid), 0); }

// Sane ranges for "Change a number". A typo (1200 for 12.0) is refused, not applied.
export function overrideLimits(g, pid) {
  const p = g.provs[pid];
  const gdp = p.history.at(-1)?.gdp || p.gdp || 1;
  const r = (x) => Math.round(x);
  const out = {
    approval: { label: "Approval", min: 5, max: 95 },
    debt: { label: "Debt", min: r(-0.5 * gdp), max: r(1.5 * gdp) },
    unemployment: { label: "Unemployment", min: 2, max: 20 },
    cpi: { label: "CPI", min: 80, max: 150 },
  };
  for (const x of GOODS) out[x] = { label: cap(x) + " made", min: 0, max: 40 };
  return out;
}
export function plural(n, word, many = word + "s") { return `${n} ${n === 1 ? word : many}`; }
export function changeWords(v) { const r = pyRound(v, 1); return r > 0 ? `up ${r.toFixed(1)}` : r < 0 ? `down ${Math.abs(r).toFixed(1)}` : "no change"; }
// Student Vote: voters per riding. Default is that province's party members, or 4.
export function votersFor(s, pid) {
  const set = s.p2.voters?.[pid];
  if (set !== undefined) return set;
  const m = Object.values(s.p2.members || {}).reduce((a, x) => a + (x[pid] || 0), 0);
  return m || 4;
}
export function unlocked(year, feature) {
  const at = { economicSystem: 2, taxRate: 3, investmentProjects: 4, borrowReason: 4, indicatorCompare: 5 };
  return year >= (at[feature] || 1);
}

export function lockDecision(d, year, p, dec) {
  const out = { ...dec };
  if (!unlocked(year, "taxRate")) out.tax = 3;
  if (!unlocked(year, "economicSystem")) { out.system = p.system; out.planner = []; }
  if (!unlocked(year, "investmentProjects")) out.project = null;
  out.system = clamp(out.system ?? p.system, p.system - 1, p.system + 1);
  for (const k of ["tax", ...CATS]) out[k] = clamp(Math.round(out[k] ?? 3), 1, 5);
  return out;
}

export function provinceHave(g, pid) {
  const p = g.provs[pid];
  return Object.fromEntries(GOODS.map((x) => [x, (p.prod[x] || 0) + p.received[x] - p.shipped[x]]));
}

// "Why it changed": total approval change split by driver (weighted by group share). Drift is the rest.
export function whyTotals(p, h, prevApproval) {
  const out = {};
  for (const g of GROUPS) for (const [k, v] of Object.entries(h.why[g])) out[k] = (out[k] || 0) + v * p.share[g];
  const sumParts = Object.values(out).reduce((a, b) => a + b, 0);
  if (prevApproval !== undefined) out.drift = h.approval - prevApproval - sumParts;
  return out;
}

export const WHY_LABELS = { tax: "Taxes", spending: "Spending", change: "Cuts or tax hikes", system: "Economic system", shortages: "Shortages", jobs: "Jobs", prices: "Prices", debt: "Debt", cards: "Cards and events", federal: "Federal budget", reasoning: "Budget Speech", drift: "Pull back toward 50" };

export function sideText(side) {
  return Object.entries(side || {}).filter(([, q]) => q > 0).map(([k, q]) => (k === "money" ? `$${q}B` : `${q} ${cap(k)}`)).join(" + ") || "nothing";
}
export function dealText(d, a, b, give, get) {
  const n = (id) => d.provinces.find((p) => p.id === id).name;
  return `${n(a)} sends ${sideText(give)} to ${n(b)} for ${sideText(get)}.`;
}
export function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
export function fmtSigned(v, nd = 1) { const r = pyRound(v, nd); return (r > 0 ? "+" : r < 0 ? "-" : "") + Math.abs(r).toFixed(nd); }
function listNames(a) { return a.length <= 2 ? a.join(" and ") : a.slice(0, -1).join(", ") + " and " + a.at(-1); }
function cleanSide(side) {
  const out = {};
  for (const [k, v] of Object.entries(side || {})) {
    const n = Number(v);
    if (n > 0 && (k === "money" || GOODS.includes(k))) out[k] = k === "money" ? Math.round(n * 10) / 10 : Math.round(n);
  }
  return out;
}
export function leverLabel(d, k) {
  if (k === "tax") return "Federal tax";
  if (d.federalBudget.lines[k]) return d.federalBudget.lines[k].name;
  if (k === "bridge") return "Bridge plan";
  if (k === "equalization") return "Equalization";
  return k;
}
export function applyLeverChange(d, lv, k, dir) {
  if (k === "bridge") {
    const opts = ["none", "partnership", "steady", "fast"];
    lv.bridge = opts[clamp(opts.indexOf(lv.bridge) + dir, 0, 3)];
  } else if (k === "equalization") lv.equalization = dir > 0;
  else lv[k] = clamp(lv[k] + dir, 1, 5);
}
function budgetText(d, dec, f) {
  const L = d.constants.levelNames;
  const sys = d.economicSystems[dec.system - 1].name;
  const bal = f.balance >= 0 ? `surplus $${f.balance.toFixed(1)}B` : `deficit $${(-f.balance).toFixed(1)}B${dec.borrowReason ? ` (borrow reason: ${dec.borrowReason})` : ""}`;
  return `Budget: tax ${d.constants.taxRates[dec.tax - 1]}%, health ${L[dec.health - 1]}, education ${L[dec.education - 1]}, infrastructure ${L[dec.infrastructure - 1]}, social ${L[dec.social - 1]}, ${sys} system${dec.project ? `, project ${d.investmentProjects.find((x) => x.id === dec.project).name}` : ""}. Planned ${bal}.`;
}
function yearLine(d, h) {
  return `Year ${h.year} results: approval ${h.approval}, GDP $${h.gdp}B, revenue $${h.revenue}B, ${h.balance >= 0 ? "surplus" : "deficit"} $${Math.abs(h.balance)}B, debt $${h.debt}B, unemployment ${h.unemployment}%, CPI ${h.cpi}${h.short.length ? `, short of ${h.short.join(", ")}` : ""}.`;
}

export function computeAwards(d, g, s) {
  const pids = Object.keys(g.provs);
  const H = (pid) => g.provs[pid].history.slice(0, 6);
  const best = (f, filt = () => true) => { const c = pids.filter(filt); if (!c.length) return null; return c.reduce((a, b) => (f(b) > f(a) ? b : a)); };
  const fairCount = {};
  for (const l of s.log) if (l.kind === "trade" && l.pid) fairCount[l.pid] = (fairCount[l.pid] || 0) + 1;
  const debtRise = (pid) => { const h = H(pid); return h.length ? h.at(-1).debt / h.at(-1).gdp - g.d.provinces.find((p) => p.id === pid).debt / h[0].gdp : 0; };
  return [
    { id: "trust", name: "Most Trusted", pid: best((p) => approvalTotal(g.provs[p])) },
    { id: "comeback", name: "Comeback", pid: best((p) => { const h = H(p); return h.length ? h.at(-1).approval - Math.min(...h.map((x) => x.approval)) : 0; }) },
    { id: "speech", name: "Best Explained", pid: best((p) => H(p).reduce((a, x) => a + (x.reasoning || 0), 0)) },
    { id: "dealmaker", name: "Fair Dealer", pid: best((p) => fairCount[p] || 0) },
    { id: "steward", name: "Steady Hands", pid: best((p) => -debtRise(p), (p) => approvalTotal(g.provs[p]) > 45) },
  ];
}
