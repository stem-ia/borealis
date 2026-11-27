// Group dashboard (BYOD, mobile first). Renders board snapshots and sends intents.
// It never changes game state itself. No names are asked for or stored.
import { connect } from "./sync.js";
import { Game, GOODS, approvalTotal } from "./engine.js";
import { STEP_NAMES, PHASE_NAMES, BILL_STAGES, provinceHave, sideText, cap, leverLabel, pledgeCap, lockDecision, votersFor, plural } from "./game.js";
import * as EL from "./election.js";
import { esc, icon, resChip, crest, partyMark, money, signed, deltaChip, toast, loadData, fmtClock } from "./ui.js";
import { goodsTable, cardChooser, budgetEditor, budgetAction, draftFrom, whyView, indicators, resourceStrip, shortList, threeQuestions } from "./widgets.js";
import { loadMap } from "./map.js";
import { morph } from "./morph.js";
import { ATLAS, ROLES_P1, ROLES_P2, groupTask } from "./content.js";

const $ = (q) => document.querySelector(q);
const params = new URLSearchParams(location.search);
const room = (params.get("room") || "").toUpperCase();
let as = params.get("as") || "";
const demo = params.get("demo") === "1";
let d, chan, snap = null, g = null, mapApi = null, rev = null;
const ui = { tab: "now", draft: null, draftKey: "", trade: { to: null, give: {}, get: {} }, counter: null, rank: [], camp: { action: "door", ridings: [], province: null }, lastStep: "", blocked: false, lost: false };
let reqN = 0;
const pending = new Map(); // reqId -> { timer, after, intent }
let lastHeard = Date.now(), lastResync = 0;
// One id per browser tab (kept across reloads of the tab). Lets the board tell two phones on one group apart.
const devId = (() => {
  try { let v = sessionStorage.getItem("borealis.dev"); if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("borealis.dev", v); } return v; }
  catch { return Math.random().toString(36).slice(2, 10); }
})();

function me() { const [kind, id] = as.split(":"); return { kind, id }; }

async function boot() {
  d = await loadData();
  if (!room || !as) { location.href = "index.html"; return; }
  openChannel();
  setInterval(hello, 4000);
  setInterval(tick, 1000);
  setInterval(() => { const lost = Date.now() - lastHeard > 12000; if (lost !== ui.lost) { ui.lost = lost; render(); } }, 1000);
  setTimeout(() => { if (!snap) render(); }, 2500);
  document.body.addEventListener("click", onClick);
  render();
}

function openChannel() {
  if (chan) chan.close();
  chan = connect(room, "group", as);
  chan.onMessage(onMessage);
  hello();
}

// hello is tiny. It carries this page's state version; the board answers only if this page is out of date.
function hello() { chan.send({ type: "hello", devId, rev, demo }); }
function resync() {
  if (Date.now() - lastResync < 1500) return;
  lastResync = Date.now();
  chan.send({ type: "resync", devId });
}

function setPath(obj, path, val, del) {
  const ks = path.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] ||= {};
  if (del) delete o[ks.at(-1)]; else o[ks.at(-1)] = val;
}

function onMessage(msg) {
  if (msg.room !== room) return;
  if (msg.toDev && msg.toDev !== devId) return;
  lastHeard = Date.now();
  if (msg.type === "state") {
    const before = snap;
    snap = msg.state; rev = msg.rev;
    g = Game.fromJSON(d, snap.engine);
    noticeChanges(before);
    render();
  } else if (msg.type === "patch") {
    if (!snap || msg.base !== rev) return resync();
    const before = { offers: snap.offers };
    let engine = false;
    for (const [path, val, del] of msg.ops) { setPath(snap, path, val, del); if (path.startsWith("engine")) engine = true; }
    rev = msg.rev;
    if (engine) g = Game.fromJSON(d, snap.engine);
    noticeChanges(before);
    render();
  } else if (msg.type === "beat") {
    if (msg.rev !== rev) resync();
  } else if (msg.type === "dup" && msg.actor === as) {
    ui.blocked = true; render();
  } else if (msg.type === "owner" && msg.actor === as) {
    ui.blocked = false; render();
  } else if (msg.type === "ack") {
    const p = pending.get(msg.reqId);
    if (p) { clearTimeout(p.timer); pending.delete(msg.reqId); }
    if (!msg.ok) toast(msg.msg || "That did not work.", true);
    else if (msg.msg) toast(msg.msg);
    if (p?.after && msg.ok) p.after();
    render();
  }
}

// Tell a proposer when its offer was declined (the offer otherwise just disappears).
function noticeChanges(before) {
  const { kind, id } = me();
  if (kind !== "province" || !before?.offers || !snap?.offers) return;
  for (const o of snap.offers) {
    const old = before.offers.find((x) => x.id === o.id);
    if (old && old.status === "open" && o.from === id && o.status === "declined") toast(`${nameOf(o.to)} said no to your offer.`, true);
  }
}

// A sending button stays locked until the board answers, so a double tap sends once.
function busy(intent) { for (const p of pending.values()) if (p.intent === intent) return true; return false; }
function send(intent, payload = {}, after) {
  if (busy(intent)) return;
  const reqId = devId + "-" + ++reqN;
  const timer = setTimeout(() => { pending.delete(reqId); toast("The board did not answer. Is the board open? Check the room code.", true); render(); }, 4000);
  pending.set(reqId, { timer, after, intent });
  chan.send({ type: "intent", intent, payload, reqId, devId });
  render();
}

function tick() {
  const t = $("#g-timer");
  if (t && snap?.timer?.duration) {
    const left = snap.timer.endsAt ? Math.max(0, (snap.timer.endsAt - Date.now()) / 1000) : snap.timer.remaining;
    t.textContent = left <= 0 && snap.timer.endsAt ? "Time" : fmtClock(left);
    t.classList.toggle("done", left <= 0 && !!snap.timer.endsAt);
  }
}

// Drafts survive a refresh (sessionStorage, this tab only).
const draftKey = () => `borealis.draft.${room}.${as}.${snap?.year}.${snap?.step}`;
function saveDrafts() { try { sessionStorage.setItem(draftKey(), JSON.stringify({ draft: ui.draft, trade: ui.trade })); } catch { /* ignore */ } }
function loadDrafts() { try { return JSON.parse(sessionStorage.getItem(draftKey()) || "null"); } catch { return null; } }

// ---------- render ----------
function render() {
  const { kind, id } = me();
  document.body.dataset.kind = kind;
  const root = $("#g");
  if (!snap) {
    morph(root, `${demoBar()}<div class="g-wait"><h1>Borealis</h1><p>Connecting to room <b>${esc(room)}</b>…</p><p class="small">The board must be open in this browser. If nothing happens, check the room code with your teacher.</p><a class="btn" href="index.html">Back</a></div>`);
    return;
  }
  if (snap.step !== ui.lastStep) {
    ui.lastStep = snap.step; ui.tab = "now"; ui.counter = null;
    const dr = loadDrafts();
    ui.draft = dr?.draft || null; ui.draftKey = dr?.draft ? `${snap.year}` : ""; ui.trade = dr?.trade || { to: null, give: {}, get: {} };
  }
  const head = kind === "party" ? partyHeader(id) : provHeader(id);
  const tabs = kind === "party" ? [["now", "Now"], ["platform", "Platform"], ["news", "News"], ["roles", "Roles"]] : [["now", "Now"], ["province", "Province"], ["news", "News"], ["roles", "Roles"]];
  const task = groupTask(snap, kind, id, { isGov: snap.p2?.gov?.party === id });
  let body = "";
  if (ui.tab === "now") body = kind === "party" ? partyNow(id) : provNow(id);
  else if (ui.tab === "province") body = provinceTab(id);
  else if (ui.tab === "platform") body = platformTab(id);
  else if (ui.tab === "news") body = newsTab();
  else if (ui.tab === "roles") body = rolesTab(kind);
  const timer = snap.timer?.duration ? `<span class="g-timer" id="g-timer">--:--</span>` : "";
  const label = kind === "party" ? d.parties.find((p) => p.id === id)?.shortName : nameOf(id);
  morph(root, `${demoBar()}${ui.lost ? `<div class="g-lost">Lost the board. Check that the board is open and on this class.</div>` : ""}${head}
    <section class="task"><div class="task-top"><span class="kicker">${esc(snap.phase === "p1" ? `Year ${snap.year} · ${STEP_NAMES[snap.step]}` : `${PHASE_NAMES[snap.phase]} · ${STEP_NAMES[snap.step]}`)}</span>${timer}</div>
      <p class="job"><b>Your job now:</b> ${esc(task.text)}</p><span class="who">${esc(task.who)}</span></section>
    <main class="g-main">${body}</main>
    <nav class="g-tabs">${tabs.map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? "on" : ""}">${l}${k === "now" && inboxCount() ? `<span class="dot">${inboxCount()}</span>` : ""}</button>`).join("")}</nav>
    ${snap.paused ? `<div class="g-pause"><b>Eyes up</b><span>Look at the board.</span></div>` : ""}
    ${ui.blocked ? `<div class="g-pause dup"><b>${esc(label)} is open on another device.</b><span>Only one device per group can send choices.</span><button class="btn primary big" data-act="takeover">Use this device instead</button></div>` : ""}`);
  for (const b of root.querySelectorAll("[data-send]")) if (busy(b.dataset.send)) b.disabled = true;
  tick();
  const mapEl = $("#g-map");
  if (mapEl) placeMap(mapEl, kind, id);
}

// One map instance per page. It moves into each new placeholder, so the SVG is parsed once.
let mapReady = null;
async function placeMap(slot, kind, id) {
  if (!mapReady) {
    const host = document.createElement("div");
    host.className = "g-map-host";
    mapReady = loadMap(host, { thumb: true }).then((api) => { mapApi = api; return host; });
  }
  const host = await mapReady;
  if (!slot.isConnected || !snap) return;
  if (host.parentNode !== slot) slot.appendChild(host);
  mapApi.highlight(kind === "province" ? id : null);
  const el = snap.p2?.election;
  mapApi.showRidings(!!el);
  mapApi.fillSeats(el ? el.winners : null);
  mapApi.partyFill(el && kind === "party" ? el.provWinner : null);
}

function demoBar() {
  if (!demo) return "";
  const opts = [...d.provinces.map((p) => [`province:${p.id}`, p.name]), ...d.parties.map((p) => [`party:${p.id}`, `${p.shortName} caucus`])];
  return `<div class="demobar"><span>Demo</span><select data-act="demo-switch" aria-label="Switch group">${opts.map(([v, l]) => `<option value="${v}" ${v === as ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
}

function provHeader(pid) {
  const pd = d.provinces.find((p) => p.id === pid);
  const a = approvalTotal(g.provs[pid]);
  const dl = snap.lastYearDelta?.[pid];
  return `<header class="g-head" style="--pc: var(--prov-${pid}-strong); --pt: var(--prov-${pid})">${crest(pid, 44)}<div class="g-name"><h1>${esc(pd.name)}</h1><span class="gbar"><span style="width:${a}%"></span></span></div>
    <div class="g-appr"><b>${a.toFixed(0)}</b><span>approval</span>${snap.step === "results" ? deltaChip(dl) : ""}</div></header>
    ${snap.phase === "p1" || snap.phase === "launch" ? resourceStrip(d, g, snap, pid) : ""}`;
}

function partyHeader(id) {
  const pt = d.parties.find((p) => p.id === id);
  const seats = snap.p2.election?.seats?.[id];
  return `<header class="g-head party" style="--pc: var(--party-${id}); --pt: var(--party-${id}-tint)">${partyMark(id, 44)}<div class="g-name"><h1>${esc(pt.shortName)}</h1><span class="small">${esc(pt.identity)}</span></div>
    <div class="g-appr">${seats !== undefined ? `<b>${seats}</b><span>${seats === 1 ? "seat" : "seats"}</span>` : `<b>${Object.values(snap.p2.members[id]).reduce((a, b) => a + b, 0)}</b><span>${Object.values(snap.p2.members[id]).reduce((a, b) => a + b, 0) === 1 ? "member" : "members"}</span>`}</div></header>`;
}

function inboxCount() {
  const { kind, id } = me();
  if (kind !== "province" || snap?.step !== "trade") return 0;
  return snap.offers.filter((o) => o.status === "open" && o.turn === id).length;
}

// ---------- province: Now ----------
function provNow(pid) {
  const s = snap;
  const pd = d.provinces.find((p) => p.id === pid);
  if (s.phase === "launch") return `<div class="card"><p class="atlas">${esc(ATLAS[pid])}</p><p>${esc(pd.blurb)}</p>${goodsStart(pid)}<div id="g-map" class="g-map" data-keep></div></div>`;
  if (s.phase === "p1") {
    switch (s.step) {
      case "headline": {
        const ev = s.yc.event && s.yc.revealed ? g.events[s.yc.event] : null;
        return ev ? `<article class="card news-card"><span class="kicker">${esc(ev.category)}</span><h2>${esc(ev.title)}</h2><p class="lede">${esc(ev.headline)}</p><p>${esc(ev.text)}</p></article>` : `<div class="card"><p>${s.yc.event ? "The headline is face down. Watch the board." : "No national event this year."}</p></div>`;
      }
      case "income": {
        const short = shortList(g, pid, false);
        return `<div class="card"><h2>Income</h2>${goodsTable(d, g, pid)}<p>GDP <b>${money(g.provs[pid].gdp, 0)}</b>. Expected tax money <b>${money(g.provs[pid].gdp * d.constants.taxRates[g.provs[pid].prev.tax - 1] / 100, 0)}</b>.</p>
          ${short.length ? `<p class="bad-box">You are short of ${short.join(" and ")}. Trade for it, or buy from the world at a high price.</p>` : `<p class="ok-box">You make enough of everything. Sell your extra goods.</p>`}</div>`;
      }
      case "trade": return tradeView(pid);
      case "local": return `<div class="card">${cardChooser(d, s, g, pid)}${(s.choices[pid]?.choice && (!s.yc.event || s.choices[pid]?.eventChoice)) ? '<p class="ok-box">Choice saved. You can change it until the teacher moves on.</p>' : ""}</div>`;
      case "budget": {
        const key = `${s.year}`;
        if (!ui.draft || ui.draftKey !== key) { ui.draft = draftFrom(s, g, pid); ui.draftKey = key; }
        return `<div class="card">${budgetEditor(d, s, g, pid, ui.draft)}</div>`;
      }
      case "results": return `<div class="card"><h2>Year ${s.year} results</h2>${whyView(d, g, pid)}</div><div class="card"><h3>Indicators</h3>${indicators(d, g, pid)}</div>
        <div class="card">${threeQuestions(d, g.provs[pid].system, { title: `How ${nameOf(pid)} answered the three economic questions` })}</div>
        <div class="card ledger"><h3>Ledger line</h3><p class="frame">"We chose ___ because ___. The trade-off is ___."</p></div>`;
    }
  }
  if (s.phase === "review") return `<div class="card"><h2>Your Phase 1 story</h2>${historyTable(pid)}</div><div class="card">${indicators(d, g, pid)}</div>`;
  if (s.phase === "bridge") return bridgeView(pid);
  if (s.phase === "p2" || s.phase === "debrief") {
    const el = s.p2.election;
    let h = `<div class="card"><h2>Phase 2: politics</h2><p>Your group now works as a <b>party caucus</b>. Your province, ${esc(pd.name)}, is still your riding.</p>
      <p class="small">Ask your teacher which party device to use. Open your party here:</p><div class="seg wrap">${d.parties.map((p) => `<button data-act="switch" data-as="party:${p.id}">${partyMark(p.id, 22)} ${esc(p.shortName)}</button>`).join("")}</div></div>`;
    if (s.step === "vote") {
      // The polling device shows the ballot only. No party buttons, so a voter cannot turn it into a party page.
      const cast = Object.values(s.p2.ballots[pid]).reduce((a, b) => a + b, 0);
      const cap = votersFor(s, pid);
      h = cast >= cap ? `<div class="card ballot"><h2>Polling station: ${esc(pd.name)}</h2><p class="ok-box">Voting is closed for this riding. ${cast} of ${cap} voters have voted.</p><p class="small">Only the count is kept.</p></div>`
        : `<div class="card ballot"><h2>Polling station: ${esc(pd.name)}</h2><p>Show your riding card. Then vote in secret: tap one party and press Cast. The screen clears for the next voter.</p>
        <div class="planks">${d.parties.map((p) => `<button class="plank ${ui.ballot === p.id ? "on" : ""}" data-act="ballot" data-v="${p.id}">${partyMark(p.id, 28)} <b>${esc(p.shortName)}</b><span>${esc(p.identity)}</span></button>`).join("")}</div>
        <button class="btn primary big" data-act="cast" data-send="castBallot" ${ui.ballot ? "" : "disabled"}>Cast my ballot</button>
        <p class="small">${cast} of ${cap} voters have voted here. Only the count is kept.</p></div>`;
    }
    if (el) h += `<div class="card"><h3>Your ridings</h3>${d.ridings.filter((r) => r.province === pid).map((r) => `<div class="mini">${esc(r.name)}: ${ptag(el.winners[r.id])}</div>`).join("")}</div>`;
    if (s.p2.year7) { const r = s.p2.year7.rows[pid]; h += `<div class="card"><h3>Year ${s.year}: the federal budget</h3><p>Approval ${r.before.toFixed(0)} → <b>${r.after.toFixed(0)}</b> ${deltaChip(r.delta)}. Federal part ${signed(r.federal)}.</p>${r.notes.map((n) => `<p class="small">${esc(n)}</p>`).join("")}${whyView(d, g, pid)}</div>`; }
    return h;
  }
  return "";
}

function goodsStart(pid) {
  const pd = d.provinces.find((p) => p.id === pid);
  return `<table class="goods"><thead><tr><th></th><th>Make</th><th>Need</th></tr></thead><tbody>${GOODS.map((x) => `<tr><th>${resChip(x, cap(x))}</th><td>${pd.production[x]}</td><td>${pd.needs[x]}</td></tr>`).join("")}</tbody></table>
    <p>Short on: <b>${pd.shortOn.map(cap).join(", ")}</b>. Strong in: <b>${pd.strongIn.map(cap).join(", ")}</b>.</p>`;
}

function historyTable(pid) {
  const h = g.provs[pid].history;
  if (!h.length) return `<p class="note">No years played yet.</p>`;
  return `<table class="tbl"><thead><tr><th>Year</th><th>Approval</th><th>Balance</th><th>Debt</th><th>Unempl.</th></tr></thead><tbody>${h.map((x) => `<tr><td>${x.year}</td><td>${x.approval.toFixed(0)}</td><td class="${x.balance < 0 ? "bad" : ""}">${signed(x.balance)}</td><td>${money(x.debt, 0)}</td><td>${x.unemployment}%</td></tr>`).join("")}</tbody></table>`;
}

function tradeView(pid) {
  const s = snap;
  const mine = s.offers.filter((o) => o.status === "open" && (o.to === pid || o.from === pid));
  const t = ui.trade;
  const others = d.provinces.filter((p) => p.id !== pid);
  const have = provinceHave(g, pid);
  const short = shortList(g, pid);
  const steppers = (key, owner) => ["food", "energy", "materials", "money"].map((r) => {
    const v = t[key][r] || 0;
    const h = owner && r !== "money" ? Math.floor(provinceHave(g, owner)[r] + 0.01) : null;
    const step = r === "money" ? 0.5 : 1;
    return `<div class="trow"><div class="tlab">${resChip(r, cap(r))}${h !== null ? `<small>has ${h}</small>` : ""}</div><div class="stepper"><button class="step" data-act="tq" data-k="${key}" data-r="${r}" data-v="${Math.max(0, v - step)}" aria-label="Less ${r}">−</button><output>${r === "money" ? "$" + v + "B" : v}</output><button class="step" data-act="tq" data-k="${key}" data-r="${r}" data-v="${v + step}" aria-label="More ${r}">+</button></div></div>`;
  }).join("");
  const gv = g.dealValue(t.give), tv = g.dealValue(t.get);
  const ratio = gv && tv ? tv / gv : null;
  let h = `<div class="card"><h2>Trade</h2>${short.length ? `<p class="bad-box">Still short: ${short.map(cap).join(", ")}.</p>` : `<p class="ok-box">You have what you need. Sell your extra.</p>`}
    <p class="small">You have: ${GOODS.map((x) => `${cap(x)} ${Math.floor(have[x] + 0.01)}`).join(", ")}. 10% of goods you receive are lost to paperwork.</p></div>`;
  if (mine.length) {
    h += `<div class="card"><h3>Offers</h3>${mine.map((o) => {
      const incoming = o.turn === pid;
      const fromMe = o.from === pid;
      const giveTxt = fromMe ? `You give ${sideText(o.give)}` : `You give ${sideText(o.get)}`;
      const getTxt = fromMe ? `you get ${sideText(o.get)}` : `you get ${sideText(o.give)}`;
      const other = fromMe ? o.to : o.from;
      if (ui.counter?.id === o.id) return counterEditor(o, pid);
      return `<div class="offer ${incoming ? "in" : ""}"><b>${esc(nameOf(other))}</b><p>${esc(giveTxt)}, ${esc(getTxt)}.</p>${incoming ? `<div class="row"><button class="btn primary" data-act="accept" data-send="respondTrade" data-id="${o.id}">Accept</button><button class="btn" data-act="counter" data-id="${o.id}" ${o.counters >= d.constants.maxCounters ? "disabled" : ""}>Counter</button><button class="btn" data-act="decline" data-id="${o.id}">Decline</button></div>` : `<p class="small">Waiting for ${esc(nameOf(o.turn))}.</p>${fromMe ? `<button class="btn sm" data-act="cancel" data-id="${o.id}">Cancel offer</button>` : ""}`}</div>`;
    }).join("")}</div>`;
  }
  h += `<div class="card"><h3>Make an offer</h3><div class="pchips">${others.map((p) => `<button class="pchip ${t.to === p.id ? "on" : ""}" data-act="tto" data-pid="${p.id}" style="--pc: var(--prov-${p.id}-strong)">${esc(p.name)}</button>`).join("")}</div>
    ${t.to ? `<h4>You give</h4>${steppers("give", pid)}<h4>You get from ${esc(nameOf(t.to))}</h4>${steppers("get", t.to)}
      <p class="fair">${ratio === null ? "Add something to both sides." : ratio >= 0.5 && ratio <= 2 ? `<span class="ok">Fair price check: OK</span>` : `<span class="bad">Not fair enough. Each side must get at least half of what it gives.</span>`} <small>Worth ${money(gv)} for ${money(tv)} at today's prices.</small></p>
      <button class="btn primary big" data-act="propose" data-send="proposeTrade" ${gv || tv ? "" : "disabled"}>Send offer</button>` : `<p class="note">Pick a province to trade with.</p>`}</div>`;
  const done = s.trades.filter((x) => !x.undone && (x.a === pid || x.b === pid));
  if (done.length) h += `<div class="card"><h3>Your deals this year</h3><ul class="tlog">${done.map((x) => `<li>${esc(nameOf(x.a))} sent ${esc(sideText(x.give))} to ${esc(nameOf(x.b))} for ${esc(sideText(x.get))}</li>`).join("")}</ul></div>`;
  return h;
}

function counterEditor(o, pid) {
  const c = ui.counter;
  const fromMe = o.from === pid;
  // c.give / c.get are from MY point of view
  const st = (key) => ["food", "energy", "materials", "money"].map((r) => {
    const v = c[key][r] || 0; const step = r === "money" ? 0.5 : 1;
    return `<div class="trow"><div class="tlab">${resChip(r, cap(r))}</div><div class="stepper"><button class="step" data-act="cq" data-k="${key}" data-r="${r}" data-v="${Math.max(0, v - step)}">−</button><output>${r === "money" ? "$" + v + "B" : v}</output><button class="step" data-act="cq" data-k="${key}" data-r="${r}" data-v="${v + step}">+</button></div></div>`;
  }).join("");
  return `<div class="offer in"><b>Counter offer to ${esc(nameOf(fromMe ? o.to : o.from))}</b><h4>You give</h4>${st("give")}<h4>You get</h4>${st("get")}
    <div class="row"><button class="btn primary" data-act="sendcounter" data-id="${o.id}">Send counter</button><button class="btn" data-act="nocounter">Back</button></div></div>`;
}

function bridgeView(pid) {
  const s = snap, cost = d.cards.bridgeCrisis.rebuildCost;
  const b = d.cards.bridgeCrisis;
  let h = `<article class="card news-card"><h2>${esc(b.title)}</h2><p class="lede">${esc(b.headline)}</p>${s.step === "crisis" ? `<p>${esc(b.text)}</p>` : ""}</article>`;
  if (s.step === "pledge1" || s.step === "pledge2") {
    const key = s.step === "pledge1" ? "pledges1" : "pledges2";
    const v = ui.pledge ?? s.bridge[key][pid] ?? 0;
    const capV = pledgeCap(g, pid);
    h += `<div class="card"><h3>${s.step === "pledge1" ? "Secret pledge" : "Open pledge"}</h3><p>How much will ${esc(nameOf(pid))} give toward the $${cost}B bridge? You can give up to $${capV}B. If the bridge gets built, you pay this in Year 7.</p>
      <div class="stepper big"><button class="step" data-act="pl" data-v="${Math.max(0, v - 1)}">−</button><output>$${v}B</output><button class="step" data-act="pl" data-v="${Math.min(capV, v + 1)}">+</button></div>
      <button class="btn primary big" data-act="pledge" data-send="pledge">Save pledge</button>${s.bridge[key][pid] !== undefined ? `<p class="ok center">Saved: $${s.bridge[key][pid]}B</p>` : ""}</div>`;
    if (s.step === "pledge2") h += `<div class="card"><h3>Live pledges</h3>${d.provinces.map((p) => `<div class="mini">${esc(p.name)}: $${s.bridge.pledges2[p.id] ?? 0}B</div>`).join("")}</div>`;
  }
  if (s.step === "reveal" || s.step === "outcome") {
    const tot = Object.values(s.bridge[s.step === "reveal" ? "pledges1" : "pledges2"]).reduce((a, x) => a + x, 0);
    h += `<div class="card"><p class="big-num">$${tot.toFixed(0)}B <small>of $${cost}B</small></p>${s.step === "outcome" ? `<p>${esc(b.outcomes[s.bridge.outcome])}</p>` : ""}</div>`;
  }
  return h;
}

function provinceTab(pid) {
  return `<div class="card"><p class="atlas">${esc(ATLAS[pid])}</p><div id="g-map" class="g-map" data-keep></div></div>
    ${snap.phase === "p1" && !["headline"].includes(snap.step) ? `<div class="card"><h3>Goods</h3>${goodsTable(d, g, pid, { afterTrade: snap.step !== "income" })}</div>` : ""}
    <div class="card"><h3>Indicators</h3>${indicators(d, g, pid)}<p class="small">System: ${esc(d.economicSystems[g.provs[pid].system - 1].name)}</p></div>
    ${g.provs[pid].history.length ? `<div class="card"><h3>Why approval changed last year</h3>${whyView(d, g, pid)}</div><div class="card"><h3>Year by year</h3>${historyTable(pid)}</div>` : ""}
    ${snap.year >= 5 ? compareView(pid) : ""}`;
}

function compareView(pid) {
  const other = ui.cmp || d.provinces.find((p) => p.id !== pid).id;
  const col = (id) => { const h = g.provs[id].history.at(-1); return h ? `<div><b>${esc(nameOf(id))}</b><span>GDP ${money(h.gdp, 0)}</span><span>CPI ${h.cpi.toFixed(0)}</span><span>Unemployment ${h.unemployment}%</span><span>Approval ${h.approval.toFixed(0)}</span></div>` : ""; };
  return `<div class="card compare"><h3>Compare with another province</h3><div class="pchips">${d.provinces.filter((p) => p.id !== pid).map((p) => `<button class="pchip ${other === p.id ? "on" : ""}" data-act="cmp" data-pid="${p.id}" style="--pc: var(--prov-${p.id}-strong)">${esc(p.name)}</button>`).join("")}</div><div class="cmp-cols">${col(pid)}${col(other)}</div></div>`;
}

function newsTab() {
  return `<div class="card"><h2>News</h2><ul class="newslist">${[...snap.news].reverse().slice(0, 25).map((n) => `<li><span class="kicker">${n.y ? "Year " + n.y : "Borealis"}</span>${esc(n.text)}</li>`).join("")}</ul></div>`;
}

const GOV_ROLES = [
  { name: "Prime Minister", text: "You lead Cabinet. Pick ministers. Recommend 3 senators." },
  { name: "Cabinet ministers", text: "Finance, Health, Education, Infrastructure, Social Programs. You write your part of the budget bill. Answer questions about it." },
  { name: "Backbenchers", text: "You vote, speak in debate, and push your riding's needs." },
];
const OPP_ROLES = [
  { name: "Leader of the Opposition", text: "You lead the largest party not in government. Ask the first question." },
  { name: "Shadow cabinet critics", text: "You each watch one minister. Find weak spots. Propose amendments." },
];
function rolesTab(kind) {
  const gov = snap.p2?.gov;
  const back = kind === "party" ? `<div class="card"><h3>Back to a province page</h3><div class="seg wrap">${d.provinces.map((p) => `<button data-act="switch" data-as="province:${p.id}">${esc(p.name)}</button>`).join("")}</div></div>` : "";
  if (kind === "party" && gov) {
    const mine = gov.party === me().id ? GOV_ROLES : OPP_ROLES;
    return `<div class="card"><h2>${gov.party === me().id ? "Government" : "Opposition"} roles</h2>${mine.map((r) => `<div class="role"><b>${esc(r.name)}</b><span>${esc(r.text)}</span></div>`).join("")}
      <div class="role"><b>Senators (3)</b><span>The PM recommended you. You review the bill and can send back one change.</span></div>
      <div class="role"><b>Governor General</b><span>Your teacher. Gives Royal Assent. Stays neutral.</span></div></div>${back}`;
  }
  const list = kind === "party" ? ROLES_P2 : ROLES_P1;
  return `<div class="card"><h2>${kind === "party" ? "Party jobs" : "Job cards"}</h2>${list.map((r) => `<div class="role"><b>${esc(r.name)}</b><span>${esc(r.text)}</span></div>`).join("")}
    ${kind === "province" ? `<p class="small">Roles move one seat clockwise after Year 2 and after Year 4.</p>` : ""}</div>${back}`;
}

// ---------- party views ----------
function partyNow(party) {
  const s = snap, p2 = s.p2;
  const pt = d.parties.find((p) => p.id === party);
  if (s.phase !== "p2" && s.phase !== "debrief") return `<div class="card"><p>Parties open in Phase 2. Your teacher will tell you when.</p></div>`;
  const ranking = EL.rankingFromBorda(pt, p2.borda[party]);
  if (s.step === "vote") return `<div class="card"><h2>Student Vote</h2><p>Voting happens on each riding's device. Open your home province's polling station:</p><div class="seg wrap">${d.provinces.map((p) => `<button data-act="switch" data-as="province:${p.id}">${esc(p.name)}</button>`).join("")}</div></div>` + parliamentView(party);
  switch (s.step) {
    case "parties":
      return `<div class="card"><h2>Leader</h2><p>Hold a secret caucus vote. Majority wins. Then tap the new leader's home province.</p>
        <div class="seg wrap">${d.provinces.map((p) => `<button data-act="leader" data-pid="${p.id}" class="${p2.leader[party] === p.id ? "on" : ""}">${esc(p.name)}</button>`).join("")}</div></div>
        <div class="card"><h2>Priorities</h2><p>Pass the device around. Each member taps the 4 promises from most to least important, then adds the ranking.</p>
        <div class="planks">${pt.planks.map((pl) => { const i = ui.rank.indexOf(pl.id); return `<button class="plank ${i >= 0 ? "on" : ""}" data-act="rank" data-pl="${pl.id}">${i >= 0 ? `<span class="num">${i + 1}</span>` : ""}<b>${esc(pl.title)}</b><span>${esc(pl.text)}</span></button>`; }).join("")}</div>
        <button class="btn primary big" data-act="rankadd" data-send="addRanking" ${ui.rank.length === 4 ? "" : "disabled"}>Add my ranking</button>
        <p class="small">${plural(p2.ballotsIn[party], "ranking")} in. Platform so far: ${ranking.slice(0, 3).map((id) => esc(pt.planks.find((x) => x.id === id).title)).join(", ")}.</p></div>`;
    case "platform": return platformTab(party, true);
    case "campaign": return campaignView(party);
    case "election": case "vote": case "government": case "bill": case "year7": case "debrief": return parliamentView(party);
  }
  return `<div class="card"><p>Look at the board.</p></div>`;
}

function platformTab(party, edit = false) {
  const s = snap, p2 = s.p2;
  const pt = d.parties.find((p) => p.id === party);
  if (!p2) return "";
  const ranking = EL.rankingFromBorda(pt, p2.borda[party]);
  const plat = EL.platformLevers(d, pt, ranking, p2.levers[party]);
  const gdp = EL.nationalGdp(g);
  const m = EL.fedMoney(d, plat.levers, gdp, -(s.classGoal?.bonus || 0));
  const lv = plat.levers, L = d.constants.levelNames;
  const canEdit = edit && s.step === "platform";
  const lst = (k) => {
    const lk = plat.locked.includes(k);
    return `<div class="brow"><div class="blabel"><b>${esc(leverLabel(d, k))}</b>${lk ? '<small>Set by your promise</small>' : ""}</div>${canEdit && !lk ? `<div class="stepper"><button class="step" data-act="plev" data-k="${k}" data-v="${lv[k] - 1}" ${lv[k] <= 1 ? "disabled" : ""}>−</button><output>${k === "tax" ? d.federalBudget.taxRates[lv[k] - 1] + "%" : L[lv[k] - 1]}</output><button class="step" data-act="plev" data-k="${k}" data-v="${lv[k] + 1}" ${lv[k] >= 5 ? "disabled" : ""}>+</button></div>` : `<output>${k === "tax" ? d.federalBudget.taxRates[lv[k] - 1] + "%" : L[lv[k] - 1]}</output>`}<div class="bval">${k === "tax" ? money(m.revenue) : money(m.lines[k], 0)}</div></div>`;
  };
  let h = `<div class="card"><h2>Platform: top 3 promises</h2><ol class="rank">${ranking.map((id, i) => `<li class="${i < 3 ? "in" : "out"}"><b>${esc(pt.planks.find((x) => x.id === id).title)}</b> <span class="small">${esc(pt.planks.find((x) => x.id === id).text)}</span></li>`).join("")}</ol><p class="small">The 4th promise is left out of this campaign.</p></div>
    <div class="card"><h2>Price tag</h2><div class="budget">${["tax", ...EL.LINES].map(lst).join("")}
    <div class="bsec"><b>Bridge</b><div class="seg wrap">${Object.keys(d.federalBudget.bridge).map((b) => `<button data-act="plev" data-k="bridge" data-v="${b}" class="${lv.bridge === b ? "on" : ""}" ${!canEdit || plat.locked.includes("bridge") ? "disabled" : ""}>${esc(d.federalBudget.bridge[b].name)} ($${d.federalBudget.bridge[b].costPerYear}B)</button>`).join("")}</div></div>
    <div class="bsec"><b>Equalization ($6B to provinces that fell behind)</b><div class="seg"><button data-act="plev" data-k="equalization" data-v="0" class="${!lv.equalization ? "on" : ""}" ${!canEdit || plat.locked.includes("equalization") ? "disabled" : ""}>Off</button><button data-act="plev" data-k="equalization" data-v="1" class="${lv.equalization ? "on" : ""}" ${!canEdit || plat.locked.includes("equalization") ? "disabled" : ""}>On</button></div></div>
    <div class="preview"><table><tr><td>Federal revenue</td><td>+${money(m.revenue)}</td></tr><tr><td>Spending</td><td class="neg">−${money(m.spending)}</td></tr><tr class="total ${m.balance >= 0 ? "good" : "badrow"}"><td>${m.balance >= 0 ? "Surplus" : "Deficit"}</td><td>${money(Math.abs(m.balance))}</td></tr></table>
    ${plat.maxDeficit !== null ? `<p class="small">Your promise: deficit at most ${plat.maxDeficit}% of revenue. Now: ${Math.max(0, m.deficitPct).toFixed(0)}%.</p>` : ""}
    ${m.deficitPct > d.election.fiscalCredibility.deficitAboveSharePct ? `<p class="bad-box">Your deficit is above 15% of revenue. Businesses and seniors trust your platform less.</p>` : ""}</div></div></div>`;
  if (canEdit) {
    h += `<div class="card"><h2>Regional promise</h2><p class="small">Pick one. It helps you in that province.</p><div class="seg wrap">${d.regionalPromises.map((rp) => `<button data-act="promise" data-pid="${rp.province}" class="${p2.promise[party] === rp.province ? "on" : ""}">${esc(rp.title)}</button>`).join("")}</div></div>
      <div class="card"><h2>Riding candidates</h2><p class="small">Members from each province confirm that riding's candidate. No member there? Name a volunteer.</p><div class="seg wrap">${d.provinces.map((p) => `<button data-act="cand" data-pid="${p.id}" class="${p2.candidates[party][p.id] ? "on" : ""}">${p2.candidates[party][p.id] ? "✓ " : ""}${esc(p.name)}</button>`).join("")}</div></div>`;
  }
  return h;
}

function campaignView(party) {
  const E = d.election, c = snap.p2.campaign[party], cd = ui.camp;
  const act = E.campaignActions.find((a) => a.id === cd.action);
  return `<div class="card"><h2>Campaign</h2><p><b>${E.campaignActionsPerParty - c.spent}</b> of ${E.campaignActionsPerParty} action points left.</p>
    <div class="seg wrap">${E.campaignActions.map((a) => `<button data-act="cact" data-v="${a.id}" class="${cd.action === a.id ? "on" : ""}">${esc(a.name)} (${a.cost})</button>`).join("")}</div>
    <p class="small">${esc(act?.effect || "")}${act?.membersOnly ? " Needs members from that province." : ""}</p>
    ${cd.action === "rally" ? `<div class="seg wrap">${d.provinces.map((p) => `<button data-act="cprov" data-pid="${p.id}" class="${cd.province === p.id ? "on" : ""}">${esc(p.name)}</button>`).join("")}</div>` :
    cd.action !== "gotv" ? d.provinces.map((p) => `<details class="ridings"><summary>${esc(p.name)} <small>${plural(d.ridings.filter((r) => r.province === p.id).length, "seat")}</small></summary><div class="seg wrap">${d.ridings.filter((r) => r.province === p.id).map((r) => `<button data-act="crid" data-v="${r.id}" class="${cd.ridings.includes(r.id) ? "on" : ""}">${esc(r.name)} <small>+${c.riding[r.id] || 0}</small></button>`).join("")}</div></details>`).join("") : ""}
    <button class="btn primary big" data-act="cgo" data-send="campaign">Do it</button><button class="btn" data-act="cundo">Undo last action</button></div>`;
}

function parliamentView(party) {
  const s = snap, p2 = s.p2;
  const el = p2.election;
  let h = "";
  if (el) h += `<div class="card"><h2>Seats</h2>${d.parties.map((p) => `<div class="vote-row">${ptag(p.id)}<b>${el.seats[p.id]}</b><span class="small">${(100 * el.votes[p.id]).toFixed(0)}% of the vote</span></div>`).join("")}<p class="small">Majority: ${d.election.majority} of ${d.election.seats}.</p><div id="g-map" class="g-map" data-keep></div></div>`;
  else h += `<div class="card"><p>Vote at the polling table. Results come next.</p></div>`;
  const gov = p2.gov;
  if (gov) {
    const isGov = gov.party === party;
    h += `<div class="card"><h2>${isGov ? "You are the government" : "You are in opposition"}</h2><p>${gov.majority ? "Majority government." : "Minority government."} ${esc(d.parties.find((p) => p.id === gov.party).shortName)} governs.${gov.opposition === party ? " You are the Official Opposition." : ""}</p>`;
    if (s.step === "government" && !gov.majority && gov.status !== "passed") h += `<p>Vote on the Throne Speech:</p><div class="seg"><button data-act="govvote" data-v="yes" class="${gov.votes[party] === "yes" ? "on" : ""}">Yes</button><button data-act="govvote" data-v="no" class="${gov.votes[party] === "no" ? "on" : ""}">No</button></div>`;
    h += `</div>`;
    const b = p2.bill;
    if (s.step === "bill" && b) {
      const m = EL.fedMoney(d, b.levers, EL.nationalGdp(g), -(s.classGoal?.bonus || 0));
      const L = d.constants.levelNames;
      h += `<div class="card"><h2>Bill C-1</h2><ol class="stages">${BILL_STAGES.map((st, i) => `<li class="${i === b.stage ? "on" : i < b.stage ? "done" : ""}">${esc(st)}</li>`).join("")}</ol>
        <div class="budget">${["tax", ...EL.LINES].map((k) => `<div class="brow"><div class="blabel"><b>${esc(leverLabel(d, k))}</b></div>${isGov && b.stage === 0 ? `<div class="stepper"><button class="step" data-act="blev" data-k="${k}" data-v="${b.levers[k] - 1}" ${b.levers[k] <= 1 ? "disabled" : ""}>−</button><output>${k === "tax" ? d.federalBudget.taxRates[b.levers[k] - 1] + "%" : L[b.levers[k] - 1]}</output><button class="step" data-act="blev" data-k="${k}" data-v="${b.levers[k] + 1}" ${b.levers[k] >= 5 ? "disabled" : ""}>+</button></div>` : `<output>${k === "tax" ? d.federalBudget.taxRates[b.levers[k] - 1] + "%" : L[b.levers[k] - 1]}</output>`}</div>`).join("")}
        <p>Bridge: ${esc(d.federalBudget.bridge[b.levers.bridge].name)}. Equalization: ${b.levers.equalization ? "on" : "off"}.</p>
        <p class="${m.balance >= 0 ? "ok" : "bad"}">${m.balance >= 0 ? "Surplus" : "Deficit"} ${money(Math.abs(m.balance))}</p></div>`;
      if (b.stage === 3 && !isGov) {
        const a = b.amendments.find((x) => x.party === party);
        h += `<h3>Move one amendment</h3><div class="seg wrap">${["tax", ...EL.LINES].map((k) => `<button data-act="amend" data-k="${k}" data-v="1" class="${a?.lever === k && a.dir > 0 ? "on" : ""}">${esc(leverLabel(d, k))} up</button><button data-act="amend" data-k="${k}" data-v="-1" class="${a?.lever === k && a.dir < 0 ? "on" : ""}">${esc(leverLabel(d, k))} down</button>`).join("")}</div>`;
      }
      if (b.stage === 3) for (const a of b.amendments.filter((x) => x.party !== party)) h += `<p>${esc(d.parties.find((p) => p.id === a.party).shortName)} moves: ${esc(leverLabel(d, a.lever))} ${a.dir > 0 ? "up" : "down"}. Your vote: <button class="btn sm ${a.votes[party] === "yes" ? "on" : ""}" data-act="amendvote" data-amend="${a.party}" data-v="yes">Yes</button><button class="btn sm ${a.votes[party] !== "yes" ? "on" : ""}" data-act="amendvote" data-amend="${a.party}" data-v="no">No</button></p>`;
      if (b.stage === 4) h += `<h3>House vote</h3><div class="seg"><button data-act="billvote" data-v="yes" class="${b.votes[party] === "yes" ? "on" : ""}">Yes</button><button data-act="billvote" data-v="no" class="${b.votes[party] === "no" ? "on" : ""}">No</button></div><p class="small">Your whip counts your members first. Your party votes as a bloc.</p>`;
      h += `</div>`;
    }
  }
  if (p2.year7) h += `<div class="card"><h2>Year ${s.year}: the federal budget</h2>${d.provinces.map((p) => { const r = p2.year7.rows[p.id]; return `<div class="mini">${esc(p.name)}: ${r.after.toFixed(0)} ${deltaChip(r.delta)} <small>federal ${signed(r.federal)}</small></div>`; }).join("")}</div>`;
  return h;
}

function ptag(id) { if (!id) return ""; const p = d.parties.find((x) => x.id === id); return `<span class="ptag" style="--pc: var(--party-${id})">${esc(p.shortName)}</span>`; }
function nameOf(pid) { return d.provinces.find((p) => p.id === pid)?.name || pid; }

// ---------- events ----------
function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  const { kind, id } = me();
  const v = b.dataset.v;
  switch (a) {
    case "tab": ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); return;
    case "switch": as = b.dataset.as; history.replaceState(null, "", `group.html?room=${room}&as=${as}${demo ? "&demo=1" : ""}`); ui.blocked = false; ui.lastStep = ""; openChannel(); ui.tab = "now"; render(); return;
    case "takeover": chan.send({ type: "takeover", devId }); ui.blocked = false; render(); return;
    case "card": send("chooseCard", { card: b.dataset.card, choice: b.dataset.choice }); return;
    case "evt": send("chooseEvent", { choice: b.dataset.choice }); return;
    case "bud": case "plan": budgetAction(ui.draft, b); saveDrafts(); render(); return;
    case "confirmBudget": send("confirmBudget", { decision: ui.draft }); return;
    case "tto": ui.trade = { to: b.dataset.pid, give: {}, get: {} }; saveDrafts(); render(); return;
    case "tq": { const side = ui.trade[b.dataset.k]; side[b.dataset.r] = +v; if (!side[b.dataset.r]) delete side[b.dataset.r]; saveDrafts(); render(); return; }
    case "propose": send("proposeTrade", { to: ui.trade.to, give: ui.trade.give, get: ui.trade.get }, () => { ui.trade = { to: null, give: {}, get: {} }; saveDrafts(); render(); }); return;
    case "accept": send("respondTrade", { id: +b.dataset.id, action: "accept" }); return;
    case "decline": send("respondTrade", { id: +b.dataset.id, action: "decline" }); return;
    case "cancel": send("cancelOffer", { id: +b.dataset.id }); return;
    case "counter": {
      const o = snap.offers.find((x) => x.id === +b.dataset.id);
      const fromMe = o.from === id;
      ui.counter = { id: o.id, give: { ...(fromMe ? o.give : o.get) }, get: { ...(fromMe ? o.get : o.give) } };
      render(); return;
    }
    case "cq": { const side = ui.counter[b.dataset.k]; side[b.dataset.r] = +v; if (!side[b.dataset.r]) delete side[b.dataset.r]; render(); return; }
    case "nocounter": ui.counter = null; render(); return;
    case "sendcounter": {
      const o = snap.offers.find((x) => x.id === +b.dataset.id);
      const fromMe = o.from === id;
      const c = ui.counter;
      send("respondTrade", { id: o.id, action: "counter", give: fromMe ? c.give : c.get, get: fromMe ? c.get : c.give }, () => { ui.counter = null; render(); });
      return;
    }
    case "cmp": ui.cmp = b.dataset.pid; render(); return;
    case "ballot": ui.ballot = v; render(); return;
    case "cast": send("castBallot", { party: ui.ballot }, () => { ui.ballot = null; render(); }); return;
    case "pl": ui.pledge = +v; render(); return;
    case "pledge": send("pledge", { amount: ui.pledge ?? snap.bridge[snap.step === "pledge1" ? "pledges1" : "pledges2"][id] ?? 0 }); return;
    // party
    case "leader": send("setLeader", { province: snap.p2.leader[id] === b.dataset.pid ? null : b.dataset.pid }); return;
    case "rank": { const i = ui.rank.indexOf(b.dataset.pl); if (i >= 0) ui.rank.splice(i, 1); else ui.rank.push(b.dataset.pl); render(); return; }
    case "rankadd": send("addRanking", { order: ui.rank }, () => { ui.rank = []; render(); }); return;
    case "plev": send("setLevers", { levers: { [b.dataset.k]: b.dataset.k === "bridge" ? v : b.dataset.k === "equalization" ? v === "1" : +v } }); return;
    case "promise": send("setPromise", { province: snap.p2.promise[id] === b.dataset.pid ? null : b.dataset.pid }); return;
    case "cand": send("setCandidate", { province: b.dataset.pid, on: !snap.p2.candidates[id][b.dataset.pid] }); return;
    case "cact": ui.camp = { action: v, ridings: [], province: null }; render(); return;
    case "crid": { const max = ui.camp.action === "flyers" ? 2 : 1; const r = ui.camp.ridings; ui.camp.ridings = r.includes(v) ? r.filter((x) => x !== v) : [...r, v].slice(-max); render(); return; }
    case "cprov": ui.camp.province = b.dataset.pid; render(); return;
    case "cgo": send("campaign", { action: ui.camp.action, riding: ui.camp.ridings[0], ridings: ui.camp.ridings, province: ui.camp.province }); return;
    case "cundo": send("undoCampaign"); return;
    case "govvote": send("govVote", { vote: v }); return;
    case "blev": send("billLevers", { levers: { [b.dataset.k]: +v } }); return;
    case "amend": send("amend", { lever: b.dataset.k, dir: +v }); return;
    case "amendvote": send("amendVote", { amendParty: b.dataset.amend, vote: v }); return;
    case "billvote": send("billVote", { vote: v }); return;
  }
}

document.addEventListener("change", (e) => {
  if (e.target.dataset.act === "demo-switch") {
    as = e.target.value;
    history.replaceState(null, "", `group.html?room=${room}&as=${as}&demo=1`);
    ui.blocked = false; ui.lastStep = "";
    openChannel();
    ui.tab = "now"; ui.draft = null; ui.trade = { to: null, give: {}, get: {} }; ui.counter = null;
    render();
  }
});

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("beforeend", `<p class="fatal">This page could not start: ${esc(e.message)}</p>`); });
