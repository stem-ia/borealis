// Views shared by the board (province panel, board-only mode) and the group dashboard.
import { GOODS, CATS, GROUPS, approvalTotal, clamp } from "./engine.js";
import { lockDecision, unlocked, provinceHave, whyTotals, WHY_LABELS, cap } from "./game.js";
import { esc, icon, resChip, money, signed, deltaChip } from "./ui.js";

const GROUP_NAMES = { workers: "Workers", families: "Families", businesses: "Businesses", seniors: "Seniors", all: "Everyone" };

export function provData(d, pid) { return d.provinces.find((p) => p.id === pid); }

export function goodsTable(d, g, pid, { afterTrade = false, infra } = {}) {
  const p = g.provs[pid];
  const have = provinceHave(g, pid);
  const il = infra ?? p.prev.infrastructure;
  const rows = GOODS.map((x) => {
    const need = g.need(p, x, il);
    const h = afterTrade ? have[x] : p.prod[x] || 0;
    const diff = h - need;
    const st = diff >= -0.01 ? `<span class="ok">Extra ${Math.floor(diff + 0.01)}</span>` : `<span class="bad">Short ${Math.ceil(-diff - 0.01)}</span>`;
    return `<tr><th>${resChip(x, cap(x))}</th><td>${Math.round(h * 10) / 10}</td><td>${Math.round(need * 10) / 10}</td><td>${st}</td><td>${g.price[x].toFixed(1)}</td></tr>`;
  }).join("");
  return `<table class="goods"><thead><tr><th></th><th>${afterTrade ? "Have" : "Make"}</th><th>Need</th><th></th><th>Price</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function shortList(g, pid, afterTrade = true) {
  const p = g.provs[pid];
  const have = provinceHave(g, pid);
  return GOODS.filter((x) => (afterTrade ? have[x] : p.prod[x] || 0) < g.need(p, x, p.prev.infrastructure) - 0.5);
}

export function winnersLosers(choice) {
  const by = {};
  let cost = 0;
  for (const e of choice.effects) {
    if (e.type === "approval") by[e.group] = (by[e.group] || 0) + e.amount;
    if (e.type === "money") cost += e.amount ?? e.pctRevenue ?? 0;
  }
  const win = Object.entries(by).filter(([, v]) => v > 0).map(([k]) => GROUP_NAMES[k]);
  const lose = Object.entries(by).filter(([, v]) => v < 0).map(([k]) => GROUP_NAMES[k]);
  return `<div class="wl">${win.length ? `<span class="win">Happier: ${win.join(", ")}</span>` : ""}${lose.length ? `<span class="lose">Unhappy: ${lose.join(", ")}</span>` : ""}${cost < 0 ? `<span class="cost">${icon("money")} Costs money</span>` : cost > 0 ? `<span class="earn">${icon("money")} Brings money</span>` : ""}</div>`;
}

export function cardChooser(d, s, g, pid, { compact = false } = {}) {
  const cards = s.yc.local[pid] || [];
  const ch = s.choices[pid] || {};
  let out = "";
  if (cards.length > 1) out += `<p class="note">Your approval is lowest, so you draw two cards. Pick a choice from either one.</p>`;
  for (const cid of cards) {
    const c = g.cards[cid];
    out += `<article class="card-issue"><h3>${esc(c.title)}</h3>${compact ? "" : `<p>${esc(c.text)}</p>`}<div class="choices">` +
      c.choices.map((x) => `<button class="choice ${ch.card === cid && ch.choice === x.id ? "on" : ""}" data-act="card" data-card="${cid}" data-choice="${x.id}" aria-pressed="${ch.card === cid && ch.choice === x.id}">
        <strong>${esc(x.label)}</strong><span class="hint">${esc(x.hint)}</span>${x.economy ? `<span class="econ-tag">Way of deciding: ${esc(ECONOMY_NAMES[x.economy] || x.economy)}</span>` : ""}${winnersLosers(x)}</button>`).join("") + `</div></article>`;
  }
  if (s.yc.event) {
    const e = g.events[s.yc.event];
    out += `<article class="card-issue event"><h3><span class="kicker">National event</span>${esc(e.title)}</h3>${compact ? "" : `<p>${esc(e.text)}</p>`}<p class="q">How does your province respond?</p><div class="choices">` +
      e.choices.map((x) => `<button class="choice ${ch.eventChoice === x.id ? "on" : ""}" data-act="evt" data-choice="${x.id}" aria-pressed="${ch.eventChoice === x.id}"><strong>${esc(x.label)}</strong><span class="hint">${esc(x.hint)}</span>${winnersLosers(x)}</button>`).join("") + `</div></article>`;
  }
  return out;
}

const WHO_CARES = {
  health: "Seniors and families", education: "Families", infrastructure: "Businesses and workers", social: "Workers, families, seniors",
};

export function draftFrom(s, g, pid) {
  const p = g.provs[pid];
  const b = s.budgets[pid];
  return b?.decision ? { ...b.decision } : { ...p.prev, system: p.system, policy: "buy", project: null, planner: [], borrowReason: null };
}

export function budgetEditor(d, s, g, pid, draft) {
  const p = g.provs[pid];
  const C = d.constants;
  const L = C.levelNames;
  const y = s.year;
  const dec = lockDecision(d, y, p, draft);
  const f = g.finances(p, dec);
  const conf = s.budgets[pid]?.confirmed && JSON.stringify(lockDecision(d, y, p, s.budgets[pid].decision)) === JSON.stringify(dec);
  const mustBal = g.must_balance(p);
  const step = (k, v, min, max, label) => `<div class="stepper" role="group" aria-label="${esc(label)}">
      <button class="step" data-act="bud" data-k="${k}" data-v="${v - 1}" ${v <= min ? "disabled" : ""} aria-label="Less ${esc(label)}">−</button>
      <output>${esc(k === "tax" ? C.taxRates[v - 1] + "%" : L[v - 1])}</output>
      <button class="step" data-act="bud" data-k="${k}" data-v="${v + 1}" ${v >= max ? "disabled" : ""} aria-label="More ${esc(label)}">+</button></div>`;
  let h = `<div class="budget">`;
  // tax
  h += `<div class="brow"><div class="blabel"><b>Tax rate</b><small>${unlocked(y, "taxRate") ? "Higher tax: more money, less approval (businesses most)." : "Fixed at 30% until Year 3."}</small></div>
    ${unlocked(y, "taxRate") ? step("tax", dec.tax, 1, 5, "tax rate") : `<output class="fixed">30%</output>`}<div class="bval">${money(f.revenue)}<small>revenue</small></div></div>`;
  for (const c of CATS) {
    const name = d.spendingCategories.find((x) => x.id === c).name;
    h += `<div class="brow"><div class="blabel"><b>${esc(name)}</b><small>${WHO_CARES[c]} care most.</small></div>${step(c, dec[c], 1, 5, name)}<div class="bval">${money(f.spending[c])}<small>cost</small></div></div>`;
  }
  // system
  if (unlocked(y, "economicSystem")) {
    h += `<div class="bsec"><b>Economic system</b><small>Move one step a year. Changing costs a little approval this year.</small><div class="spectrum-pick">` +
      d.economicSystems.map((x) => `<button data-act="bud" data-k="system" data-v="${x.step}" class="${dec.system === x.step ? "on" : ""} ${x.step === p.system ? "now" : ""}" ${Math.abs(x.step - p.system) > 1 ? "disabled" : ""}>${esc(x.name)}</button>`).join("") +
      `</div><p class="small">${esc(d.economicSystems[dec.system - 1].text)}</p>`;
    const ps = d.economicSystems[dec.system - 1].plannerShift;
    if (ps > 0) {
      const pl = draft._plan || (dec.planner && dec.planner[0]) || null;
      h += `<div class="planner"><span>Planner: move goods production next year (4 units make 3).</span>
        <div class="seg">` + GOODS.map((x) => `<button data-act="plan" data-k="from" data-v="${x}" class="${pl?.[0] === x ? "on" : ""}">From ${cap(x)}</button>`).join("") + `</div>
        <div class="seg">` + GOODS.map((x) => `<button data-act="plan" data-k="to" data-v="${x}" class="${pl?.[1] === x ? "on" : ""}">To ${cap(x)}</button>`).join("") + `</div>
        <div class="seg"><button data-act="plan" data-k="units" data-v="${Math.max(0, (pl?.[2] || 0) - 1)}">−</button><output>${pl?.[2] || 0} of ${ps} units</output><button data-act="plan" data-k="units" data-v="${Math.min(ps, (pl?.[2] || 0) + 1)}">+</button></div></div>`;
    } else if (d.economicSystems[dec.system - 1].marketShift) {
      h += `<p class="small">The market moves ${d.economicSystems[dec.system - 1].marketShift} units toward the best price each year on its own.</p>`;
    }
    h += `</div>`;
  }
  h += threeQuestions(d, dec.system, { title: unlocked(y, "economicSystem") ? null : `Your province runs a ${d.economicSystems[dec.system - 1].name.toLowerCase()} economy` });
  h += `<div class="bsec"><b>If you are short of goods</b><div class="seg">
    <button data-act="bud" data-k="policy" data-v="buy" class="${dec.policy !== "without" ? "on" : ""}">Buy from the world (costs money)</button>
    <button data-act="bud" data-k="policy" data-v="without" class="${dec.policy === "without" ? "on" : ""}">Go without (people get upset)</button></div></div>`;
  if (unlocked(y, "investmentProjects")) {
    h += `<div class="bsec"><b>Investment project (optional)</b><small>Costs 40% of revenue this year. Pays back every year after.</small><div class="seg wrap">
      <button data-act="bud" data-k="project" data-v="" class="${!dec.project ? "on" : ""}">None</button>` +
      d.investmentProjects.map((x) => `<button data-act="bud" data-k="project" data-v="${x.id}" class="${dec.project === x.id ? "on" : ""}" title="${esc(x.text)}">${esc(x.name)}</button>`).join("") + `</div></div>`;
  }
  // preview
  const rows = [["Tax revenue", f.revenue], ["Trade", f.trade], ["Sell extra goods to the world", f.worldSell], ["Buy missing goods from the world", -f.worldBuy],
    ["Spending (4 lines)", -Object.values(f.spending).reduce((a, b) => a + b, 0)], [f.interest >= 0 ? "Interest on debt" : "Interest on savings", -f.interest]];
  if (f.project) rows.push(["Investment project", -f.project]);
  if (Math.abs(f.cardMoney) > 0.01) rows.push(["Cards and events", f.cardMoney]);
  const bal = f.balance;
  const newDebt = p.debt - bal;
  h += `<div class="preview"><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="${v < 0 ? "neg" : ""}">${v < 0 ? "−" : "+"}${money(Math.abs(v))}</td></tr>`).join("")}
    <tr class="total ${bal >= 0 ? "good" : "badrow"}"><td>${bal >= 0 ? "Surplus" : "Deficit"}</td><td>${bal >= 0 ? "+" : "−"}${money(Math.abs(bal))}</td></tr></table>
    <p class="debtline">${p.debt >= 0 ? "Debt" : "Savings"} now ${money(Math.abs(p.debt))} → after this year ${newDebt >= 0 ? "debt" : "savings"} ${money(Math.abs(newDebt))} <small>(${Math.round(100 * Math.max(0, newDebt) / Math.max(1, p.gdp))}% of GDP)</small></p>`;
  if (f.shortGoods?.length) h += `<p class="warn">${icon(f.shortGoods[0])} You are short of ${f.shortGoods.join(", ")}. ${dec.policy === "without" ? "People go without." : "You buy it from the world at a high price."}</p>`;
  if (mustBal) h += `<p class="bad-box">Lenders say no. Your debt is too high. The budget must balance (zero or better).</p>`;
  if (unlocked(y, "borrowReason") && bal < 0) {
    h += `<div class="bsec"><b>Why are you borrowing?</b><div class="seg">
      <button data-act="bud" data-k="borrowReason" data-v="crisis" class="${dec.borrowReason === "crisis" ? "on" : ""}">Crisis (a bad year)</button>
      <button data-act="bud" data-k="borrowReason" data-v="investment" class="${dec.borrowReason === "investment" ? "on" : ""}">Investment (pays back later)</button></div></div>`;
  }
  h += `</div>`;
  const blocked = (mustBal && bal < -0.05) || (unlocked(y, "borrowReason") && bal < -0.05 && !dec.borrowReason);
  h += `<button class="btn primary big" data-act="confirmBudget" data-send="confirmBudget" ${blocked || conf ? "disabled" : ""}>${conf ? "Budget confirmed" : "Confirm budget"}</button>`;
  if (conf) h += `<p class="ok center">Confirmed. Change anything to confirm again.</p>`;
  else if (s.budgets[pid]?.confirmed) h += `<p class="warn center">Not confirmed. The board still has your last confirmed budget. Press Confirm to send this one.</p>`;
  h += `<details class="speech"><summary>Budget Speech (Citizens' Advocate)</summary><p>Say it out loud in 1 or 2 sentences:</p><p class="frame">"We chose ___ because ___ (use a number). The trade-off is ___ (who pays or loses)."</p></details>`;
  h += `</div>`;
  return h;
}

// Apply a budget button press to a draft. Returns true if the draft changed.
export function budgetAction(draft, btn) {
  const k = btn.dataset.k, v = btn.dataset.v;
  if (btn.dataset.act === "bud") {
    if (["tax", ...CATS, "system"].includes(k)) draft[k] = clamp(Number(v), 1, 5);
    else if (k === "project") draft.project = v || null;
    else draft[k] = v;
    return true;
  }
  if (btn.dataset.act === "plan") {
    const pl = draft._plan ? [...draft._plan] : draft.planner?.[0] ? [...draft.planner[0]] : ["food", "energy", 0];
    if (k === "from") pl[0] = v;
    if (k === "to") pl[1] = v;
    if (k === "units") pl[2] = Number(v);
    draft.planner = pl[0] !== pl[1] && pl[2] > 0 ? [pl] : [];
    draft._plan = pl;
    return true;
  }
  return false;
}

// The three economic questions (curriculum section 9): what, how and for whom, for one system step.
export function threeQuestions(d, step, { title = null, open = true } = {}) {
  const x = d.economicSystems[step - 1];
  const q = x.threeQuestions;
  return `<details class="three-q" ${open ? "open" : ""}><summary>${esc(title || `The three economic questions: ${x.name}`)}</summary>
    <dl><dt>What to produce?</dt><dd>${esc(q.what)}</dd><dt>How to produce?</dt><dd>${esc(q.how)}</dd><dt>For whom?</dt><dd>${esc(q.forWhom)}</dd></dl></details>`;
}

const ECONOMY_NAMES = { traditional: "Traditional: custom decides", market: "Market: prices decide", command: "Command: the plan decides", mixed: "Mixed" };

export function whyView(d, g, pid, { year } = {}) {
  const p = g.provs[pid];
  const hist = p.history;
  const idx = year ? hist.findIndex((x) => x.year === year) : hist.length - 1;
  const h = hist[idx];
  if (!h) return `<p class="note">No results yet.</p>`;
  const prevA = idx > 0 ? hist[idx - 1].approval : approvalTotalStart(d, pid);
  const t = whyTotals(p, h, prevA);
  const items = Object.entries(t).filter(([, v]) => Math.abs(v) >= 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const max = Math.max(1, ...items.map(([, v]) => Math.abs(v)));
  let out = `<div class="why"><p class="why-head">Approval ${prevA.toFixed(0)} → <b>${h.approval.toFixed(0)}</b> ${deltaChip(h.approval - prevA)}</p>`;
  out += items.map(([k, v]) => `<div class="why-row"><span class="wl-name">${WHY_LABELS[k] || k}</span><span class="why-bar"><span class="${v >= 0 ? "pos" : "neg"}" style="width:${(50 * Math.abs(v)) / max}%;${v >= 0 ? "left:50%" : `right:50%`}"></span></span><span class="why-v">${signed(v)}</span></div>`).join("");
  out += `</div><div class="groups">` + GROUPS.map((gname) => {
    const prev = idx > 0 ? hist[idx - 1].groups[gname] : provData(d, pid).startApproval[gname];
    return `<div class="grp"><span>${GROUP_NAMES[gname]}</span><span class="gbar"><span style="width:${h.groups[gname]}%"></span></span><b>${h.groups[gname].toFixed(0)}</b>${deltaChip(h.groups[gname] - prev)}</div>`;
  }).join("") + `</div>`;
  return out;
}

export function approvalTotalStart(d, pid) {
  const pd = provData(d, pid);
  return GROUPS.reduce((a, gname) => a + pd.groupShare[gname] * pd.startApproval[gname], 0);
}

export function indicators(d, g, pid) {
  const p = g.provs[pid];
  const h = p.history.at(-1);
  const prev = p.history.at(-2);
  const gdp = h ? h.gdp : p.gdp || "?";
  const rows = [
    ["GDP", h || p.gdp ? money(gdp, 0) : "…", h && prev ? deltaChip(100 * (h.gdp / prev.gdp - 1)) + "%" : ""],
    ["CPI (prices)", p.cpi.toFixed(1), h ? `inflation ${h.inflation.toFixed(1)}%` : ""],
    ["Unemployment", p.unemployment.toFixed(1) + "%", ""],
    [p.debt >= 0 ? "Debt" : "Savings", money(Math.abs(p.debt)), p.gdp ? `${Math.round((100 * p.debt) / (h ? h.gdp : p.gdp))}% of GDP` : ""],
    ["Last year", h ? (h.balance >= 0 ? "Surplus " : "Deficit ") + money(Math.abs(h.balance)) : "none yet", ""],
  ];
  return `<table class="ind">${rows.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td class="small">${c}</td></tr>`).join("")}</table>`;
}

export function approvalNow(g, pid) { return approvalTotal(g.provs[pid]); }

export function resourceStrip(d, g, s, pid) {
  const p = g.provs[pid];
  const have = provinceHave(g, pid);
  const started = s.phase === "p1" && s.step !== "headline" || g.year > 0 && s.phase !== "p1";
  const vals = GOODS.map((x) => [x, started && p.prod[x] !== undefined ? Math.floor(have[x] + 0.01) : provData(d, pid).production[x]]);
  const rev = p.gdp ? Math.round(p.gdp * d.constants.taxRates[(p.prev.tax || 3) - 1] / 100) : null;
  return `<div class="resstrip">${vals.map(([x, v]) => `<div class="rs rs-${x}">${icon(x, "1.4em")}<b>${v}</b><span>${cap(x)}</span></div>`).join("")}
    <div class="rs rs-money">${icon("money", "1.4em")}<b>${rev !== null ? "$" + rev + "B" : "?"}</b><span>Tax money</span></div></div>`;
}
