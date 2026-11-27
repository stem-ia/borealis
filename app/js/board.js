// Teacher board (1920x1080 touch). Single source of truth: runs the Controller,
// saves to localStorage, broadcasts snapshots through sync.js.
import { connect } from "./sync.js";
import * as store from "./store.js";
import { GOODS, CATS, approvalTotal } from "./engine.js";
import {
  Controller, newState, makeRoom, P1_STEPS, BRIDGE_STEPS, P2_STEPS, STEP_NAMES, PHASE_NAMES, BILL_STAGES, BILL_LEVERS,
  provinceHave, sideText, cap, leverLabel, pledgeCap, pledgeCapTotal, unlocked, overrideLimits, plural, votersFor,
} from "./game.js";
import * as EL from "./election.js";
import { esc, icon, resChip, crest, partyMark, money, signed, deltaChip, modal, confirmBox, toast, loadData, fmtClock } from "./ui.js";
import { goodsTable, cardChooser, budgetEditor, budgetAction, draftFrom, whyView, indicators, resourceStrip, approvalTotalStart, shortList, threeQuestions } from "./widgets.js";
import { loadMap } from "./map.js";
import { morph } from "./morph.js";
import { nowLine, ATLAS, ROLES_P1 } from "./content.js";

let d, ctl, chan, mapApi;
const ui = { sel: null, tab: "overview", drafts: {}, desk: { a: null, b: null, give: {}, get: {} }, deskOpen: false, newsIdx: 0, seen: new Set(), revealN: Infinity, prView: false, rankDraft: {}, debateDraft: [] };
const devices = {}; // devId -> { actor, t }
const owners = {}; // actor -> devId. The first device claims a province or party.
const TAB = Math.random().toString(36).slice(2, 10);
const EPOCH = Math.random().toString(36).slice(2, 8);
let revN = 0, rev = EPOCH + ":0", lastFlat = {};
let mode = "active"; // or "readonly" when another board tab holds this class
const $ = (q) => document.querySelector(q);

async function boot() {
  d = await loadData();
  document.documentElement.classList.add("board-root");
  mapApi = await loadMap($("#map"), { onSelect: (pid) => { ui.sel = pid; ui.tab = defaultTab(); render(); } });
  const params = new URLSearchParams(location.search);
  const want = params.get("class") || store.lastSaveName();
  const existing = want ? store.loadSave(want) : null;
  if (existing && params.get("class")) start(existing);
  else await savePicker(existing);
  setInterval(tick, 500);
  setInterval(() => { ui.newsIdx++; renderTicker(true); }, 8000);
  setInterval(heartbeat, 2000);
  setInterval(() => { if (mode === "active" && chan) chan.send({ type: "beat", rev }); }, 5000);
  window.addEventListener("storage", (e) => { if (ctl && e.key === lockKey()) heartbeat(); });
  // Release the lock when this tab closes or reloads, so a reload is not locked out by itself.
  window.addEventListener("pagehide", () => { try { if (ctl && mode === "active" && readLock()?.tab === TAB) localStorage.removeItem(lockKey()); } catch { /* ignore */ } });
  bindEvents();
}

async function savePicker(lastState) {
  const saves = store.listSaves();
  const body = `<p>Each class has its own saved game. It saves after every step.</p>
    ${saves.length ? `<div class="save-list">${saves.map((s, i) => `<button class="btn save-btn" data-i="pick-${i}" data-name="${esc(s.name)}"><b>${esc(s.name)}</b><span>${esc(PHASE_NAMES[s.phase] || s.phase)}${s.year ? `, Year ${s.year}` : ""}, ${esc(STEP_NAMES[s.step] || s.step)}</span><small>Saved ${new Date(s.savedAt).toLocaleString()}</small></button>`).join("")}</div>` : `<p class="note">No saved games yet.</p>`}
    <label class="field">New class save name <input id="newname" maxlength="16" placeholder="for example 8C" autocomplete="off"></label>`;
  return new Promise((resolve) => {
    modal({
      title: "Choose a class", body, wide: true,
      actions: [
        ...(ctl ? [{ label: "Cancel", value: "cancel" }] : []),
        { label: "Import a save file", value: "import" },
        { label: "Start a new game", value: (w) => "new:" + w.querySelector("#newname").value.trim(), primary: true },
      ],
      onMount: (wrap, close) => {
        wrap.querySelectorAll(".save-btn").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); close("load:" + b.dataset.name); }));
      },
    }).then(async (v) => {
      if (v && v.startsWith("load:")) { const st = store.loadSave(v.slice(5)); if (st) { start(st); return resolve(); } toast("Could not load that save.", true); }
      else if (v === "import") {
        try { const st = await store.importFile(); start(st); toast(`Imported ${st.className}.`); return resolve(); } catch (e) { toast(e.message, true); }
      } else if (v && v.startsWith("new:")) {
        const name = v.slice(4).replace(/[^\w\- ]/g, "").slice(0, 16);
        if (!name) { toast("Type a class name first, for example 8C.", true); }
        else if (store.loadSave(name) && !(await confirmBox(`A save called ${name} exists. Start over and replace it?`, "Replace it"))) { /* back */ }
        else { start(newState(d, name, makeRoom())); return resolve(); }
      } else if (ctl && (v === "cancel" || v === null)) { return resolve(); }
      else if (lastState) { start(lastState); return resolve(); }
      savePicker(lastState).then(resolve);
    });
  });
}

// ---------- one board per class ----------
// A heartbeat lock in localStorage. A second tab on the same class opens read only.
const lockKey = () => "borealis.lock." + (ctl?.s.className || "");
function readLock() { try { return JSON.parse(localStorage.getItem(lockKey()) || "null"); } catch { return null; } }
function writeLock() { try { localStorage.setItem(lockKey(), JSON.stringify({ tab: TAB, t: Date.now() })); } catch { /* storage off: no lock */ } }
function lockFree() { const l = readLock(); return !l || l.tab === TAB || Date.now() - l.t > 6000; }
function heartbeat() {
  if (!ctl) return;
  if (mode === "active") {
    if (!lockFree()) return goReadOnly();
    writeLock();
  } else {
    const st = store.loadSave(ctl.s.className);
    if (st && JSON.stringify(st.engine?.year) + st.step + (st.log?.length || 0) !== JSON.stringify(ctl.s.engine?.year) + ctl.s.step + (ctl.s.log?.length || 0)) { ctl = new Controller(d, st); render(); }
    if (lockFree()) renderReadOnly();
  }
}
function goReadOnly() {
  mode = "readonly";
  if (chan) { chan.close(); chan = null; }
  renderReadOnly();
}
function renderReadOnly() {
  let el = $("#readonly");
  if (mode !== "readonly") { if (el) el.remove(); document.body.classList.remove("is-readonly"); return; }
  document.body.classList.add("is-readonly");
  if (!el) { el = document.createElement("div"); el.id = "readonly"; document.body.appendChild(el); }
  el.innerHTML = `<div class="ro-box"><b>Class ${esc(ctl.s.className)} is open on another board tab.</b><span>This tab is read only, so the two tabs cannot undo each other. Close this tab, or take over here.</span><button class="btn primary" id="ro-take">Take over in this tab</button></div>`;
  el.querySelector("#ro-take").onclick = () => { const st = store.loadSave(ctl.s.className) || ctl.saveable(); mode = "active"; writeLock(); renderReadOnly(); start(st); };
}

function start(state) {
  if (chan) chan.close();
  chan = null;
  ctl = new Controller(d, state);
  history.replaceState(null, "", `board.html?class=${encodeURIComponent(ctl.s.className)}`);
  ui.sel = null; ui.drafts = {}; ui.seen = new Set((ctl.s.trades || []).map((t) => t.id));
  lastFlat = {};
  if (!lockFree()) { mode = "readonly"; render(); renderReadOnly(); return; }
  mode = "active";
  writeLock();
  renderReadOnly();
  chan = connect(ctl.s.room, "board", "board");
  chan.onMessage(onMessage);
  chan.onStatus((st) => { const e = $("#sync-status"); if (e) e.textContent = st === "open" ? "" : "Sync off"; });
  commit(false);
}

// ---------- devices ----------
function activeDevices() { return Object.entries(devices).filter(([, v]) => Date.now() - v.t < 12000); }
function claim(actor, devId, force) {
  const cur = owners[actor];
  const stale = !cur || !devices[cur] || Date.now() - devices[cur].t > 15000 || devices[cur].actor !== actor;
  if (stale || force) {
    if (cur && cur !== devId && force) chan.send({ type: "dup", toDev: cur, actor });
    owners[actor] = devId;
  }
  return owners[actor] === devId;
}

function onMessage(msg) {
  if (msg.room !== ctl.s.room || mode !== "active") return;
  const devId = msg.devId;
  if (!devId) return;
  if (msg.type === "hello" || msg.type === "resync" || msg.type === "takeover") {
    devices[devId] = { actor: msg.from, t: Date.now() };
    const mine = claim(msg.from, devId, msg.type === "takeover" || msg.demo);
    if (!mine) chan.send({ type: "dup", toDev: devId, actor: msg.from }); // it can watch, not act
    if (msg.type !== "hello" || msg.rev !== rev) sendFull(devId);
    if (mine && msg.type === "takeover") chan.send({ type: "owner", toDev: devId, actor: msg.from });
    renderTop();
    return;
  }
  if (msg.type === "intent") {
    devices[devId] = { actor: msg.from, t: Date.now() };
    if (!claim(msg.from, devId, false)) {
      chan.send({ type: "ack", toDev: devId, reqId: msg.reqId, ok: false, msg: "This group is open on another device." });
      chan.send({ type: "dup", toDev: devId, actor: msg.from });
      return;
    }
    const r = ctl.intent(msg.from, msg.intent, msg.payload);
    chan.send({ type: "ack", toDev: devId, reqId: msg.reqId, ok: r.ok !== false, msg: r.msg || "" });
    if (r.ok !== false) commit();
  }
}

// ---------- snapshots and patches ----------
// Groups get the public state: no history log, no undo data. The full snapshot goes
// to one device on join or resync. After that, each change sends only the parts that changed.
function publicState() {
  const { log, preYearEnd, undo, ...pub } = ctl.snapshot();
  return pub;
}
function flatten(pub) {
  const out = {};
  for (const [k, v] of Object.entries(pub)) {
    if (k === "engine") {
      for (const [ek, ev] of Object.entries(v)) {
        if (ek === "provs") for (const [pid, pv] of Object.entries(ev)) out["engine.provs." + pid] = JSON.stringify(pv);
        else out["engine." + ek] = JSON.stringify(ev);
      }
    } else if (k === "p2" && v) for (const [pk, pv] of Object.entries(v)) out["p2." + pk] = JSON.stringify(pv);
    else out[k] = JSON.stringify(v);
  }
  return out;
}
function sendFull(devId) {
  if (!chan) return;
  chan.send({ type: "state", toDev: devId, rev, state: publicState() });
}
function broadcast() {
  if (!chan || mode !== "active") return;
  const flat = flatten(publicState());
  const ops = [];
  for (const [path, json] of Object.entries(flat)) if (lastFlat[path] !== json) ops.push([path, JSON.parse(json)]);
  for (const path of Object.keys(lastFlat)) if (!(path in flat)) ops.push([path, null, 1]);
  lastFlat = flat;
  if (!ops.length) return;
  const base = rev;
  rev = EPOCH + ":" + ++revN;
  chan.send({ type: "patch", base, rev, ops });
}

function commit(save = true) {
  if (mode !== "active") return;
  if (!lockFree()) return goReadOnly();
  const ok = store.writeSave(ctl.saveable());
  const el = $("#save-status");
  if (el) { el.textContent = ok ? "Saved" : "Not saved"; el.className = ok ? "saved" : "unsaved"; el.title = ok ? "Saved in this browser" : "Storage is full or blocked. Export the save from the Teacher menu."; }
  broadcast();
  render();
}

function act(actor, type, payload) {
  const r = ctl.intent(actor, type, payload);
  if (r.ok === false) toast(r.msg || "That did not work.", true);
  else { if (r.msg) toast(r.msg); commit(); }
  return r;
}

// ---------- rendering ----------
function render() {
  if (!ctl) return;
  renderTop();
  renderMap();
  renderPanel();
  renderControls();
  renderTicker(false);
  renderPause();
}

function stepsFor(s) {
  if (s.phase === "p1") return P1_STEPS;
  if (s.phase === "bridge") return BRIDGE_STEPS;
  if (s.phase === "p2") return P2_STEPS;
  return [s.step];
}

function renderTop() {
  const s = ctl.s;
  const steps = stepsFor(s);
  const act = activeDevices();
  const actors = new Set(act.map(([, v]) => v.actor));
  const online = actors.size;
  const dups = act.length - online;
  $("#top").innerHTML = `
    <div class="phase"><span class="kicker">${esc(PHASE_NAMES[s.phase])}</span><b>${s.phase === "p1" ? `Year ${s.year} of ${d.meta.fiscalYears}` : s.phase === "p2" && s.step === "year7" ? `Federal year (Year ${s.year})` : esc(STEP_NAMES[s.step])}</b></div>
    <ol class="tracker">${steps.map((st, i) => `<li class="${st === s.step ? "on" : steps.indexOf(s.step) > i ? "done" : ""}"><span>${i + 1}</span>${esc(STEP_NAMES[st])}</li>`).join("")}</ol>
    <div class="timer ${s.timer.endsAt ? "running" : ""}" id="timer" aria-live="off">${s.timer.duration ? fmtClock(ctl.timerLeft()) : "--:--"}</div>
    <div class="room"><span class="kicker">Join code</span><b>${esc(s.room)}</b></div>
    <div class="cls"><span class="kicker">Class</span><b>${esc(s.className)}</b><span id="save-status" class="saved">Saved</span></div>
    <div class="devs" title="Group devices seen in the last 12 seconds"><span class="kicker">Devices</span><b>${online}</b>${dups > 0 ? `<span class="dupwarn">${dups} extra on one group</span>` : ""}<span id="sync-status"></span></div>`;
}

function tick() {
  if (!ctl) return;
  const t = $("#timer");
  if (t && ctl.s.timer.duration) {
    const left = ctl.timerLeft();
    const done = left === 0 && !!ctl.s.timer.endsAt;
    t.textContent = done ? "Time" : fmtClock(left);
    t.classList.toggle("low", left > 0 && left < 60);
    t.classList.toggle("done", done);
    if (done && chimed !== ctl.s.timer.endsAt && mode === "active") { chimed = ctl.s.timer.endsAt; chime(); }
  }
}

// One soft tone when a timer ends. No flashing (visual-system.md motion rules).
let chimed = null;
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), gn = ac.createGain();
    o.frequency.value = 660;
    gn.gain.setValueAtTime(0.0001, ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.05);
    gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1.2);
    o.connect(gn).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 1.3);
  } catch { /* no audio */ }
}

function renderMap() {
  const s = ctl.s, g = ctl.g;
  mapApi.select(ui.sel && d.provinces.some((p) => p.id === ui.sel) ? ui.sel : null);
  const inP2 = s.phase === "p2" || (s.phase === "debrief" && s.p2.election);
  // badges
  const badges = {};
  if (!inP2) {
    for (const p of d.provinces) {
      const a = approvalTotal(g.provs[p.id]);
      const dl = s.step === "results" || s.phase === "review" ? s.lastYearDelta[p.id] : undefined;
      badges[p.id] = { text: a.toFixed(0), sub: dl !== undefined && Math.abs(dl) >= 0.5 ? (dl > 0 ? "▲" : "▼") + Math.abs(dl).toFixed(0) : "", cls: dl >= 0.5 ? "up" : dl <= -0.5 ? "down" : "" };
    }
  }
  // scarcity alerts during income and trade: a red tag under the badge (every province starts short, so no rings)
  if (s.phase === "p1" && ["income", "trade"].includes(s.step)) {
    for (const p of d.provinces) { const sh = shortList(g, p.id, s.step === "trade"); if (sh.length) badges[p.id].alert = sh.map(cap).join(", ") + " short"; }
  }
  mapApi.setBadges(badges);
  // routes
  const routes = [];
  if (s.phase === "p1" && ["trade", "local", "budget"].includes(s.step)) {
    for (const t of s.trades) {
      if (t.undone) continue;
      const add = (from, to, side) => { for (const [k, q] of Object.entries(side)) if (k !== "money") routes.push({ id: `${t.id}-${k}-${from}`, a: from, b: to, res: k, qty: q, fresh: !ui.seen.has(t.id) }); };
      add(t.a, t.b, t.give); add(t.b, t.a, t.get);
      if (!Object.keys(t.give).some((k) => k !== "money") && !Object.keys(t.get).some((k) => k !== "money")) routes.push({ id: `${t.id}-m`, a: t.a, b: t.b, res: "money", qty: "$" });
      ui.seen.add(t.id);
    }
    if (s.step === "trade") for (const o of s.offers.filter((x) => x.status === "open")) {
      const k = Object.keys(o.give).find((x) => x !== "money") || Object.keys(o.get).find((x) => x !== "money") || "money";
      routes.push({ id: `o${o.id}`, a: o.from, b: o.to, res: k, qty: "?", pending: true });
    }
  }
  mapApi.setRoutes(routes);
  mapApi.bridge(["bridge", "p2", "debrief"].includes(s.phase) ? (s.bridge.outcome === "temporary" ? "open" : "closed") : null);
  // Phase 2 colours
  const el = s.p2.election;
  if (inP2 && el && (s.step !== "election" || ui.revealN >= d.ridings.length)) {
    mapApi.showRidings(true);
    mapApi.fillSeats(el.winners);
    mapApi.partyFill(el.provWinner);
  } else if (inP2 && el && s.step === "election") {
    mapApi.showRidings(true);
    mapApi.fillSeats(el.winners, ui.revealN, revealOrder());
    const done = {};
    const order = revealOrder();
    for (const p of d.provinces) { const ids = d.ridings.filter((r) => r.province === p.id).map((r) => r.id); if (ids.every((id) => order.indexOf(id) < ui.revealN)) done[p.id] = el.provWinner[p.id]; }
    mapApi.partyFill(Object.keys(done).length ? done : null);
  } else {
    mapApi.showRidings(inP2);
    mapApi.fillSeats(null);
    mapApi.partyFill(null);
  }
  renderStrip();
}

function revealOrder() {
  const bySize = [...d.provinces].sort((a, b) => d.ridings.filter((r) => r.province === a.id).length - d.ridings.filter((r) => r.province === b.id).length);
  return bySize.flatMap((p) => d.ridings.filter((r) => r.province === p.id).map((r) => r.id));
}

function renderStrip() {
  const s = ctl.s;
  const el = s.p2.election;
  const strip = $("#strip");
  if ((s.phase === "p2" || s.phase === "debrief") && el && (s.step !== "election" || ui.revealN >= d.ridings.length)) {
    strip.innerHTML = seatBar(el.seats, "Seats in the House of Commons");
    return;
  }
  if (s.phase === "p2" || s.phase === "debrief") {
    strip.innerHTML = `<div class="strip-title"><span>Left and right: the four parties</span><span>Forward and Evergreen are both centre-left.</span></div><div class="lr">${d.parties.map((p) => `<div class="lr-p" style="left:${lrPos(p)}%">${partyMark(p.id, 34)}<span>${esc(p.shortName)}</span></div>`).join("")}<span class="lr-l">Left: more shared, more government</span><span class="lr-r">Right: more individual choice</span></div>`;
    return;
  }
  const cols = d.economicSystems.map((x) => {
    const inCol = d.provinces.filter((p) => ctl.g.provs[p.id].system === x.step);
    return `<div class="sp-col"><div class="sp-name">${esc(x.name)}</div><div class="sp-chips">${inCol.map((p) => `<button class="sp-chip ${inCol.length > 2 ? "only" : ""}" data-act="selprov" data-pid="${p.id}" title="${esc(p.name)}" aria-label="${esc(p.name)}">${crest(p.id, 30)}<span>${esc(p.name)}</span></button>`).join("")}</div></div>`;
  }).join("");
  strip.innerHTML = `<div class="strip-title"><span>Market: prices decide</span><b>Economic systems</b><span>Command: the plan decides</span></div><div class="sp">${cols}</div>`;
}

// Left-right placement from each party's spectrum step. Parties on the same step sit side by side.
function lrPos(p) {
  const base = { 2: 78, 3: 48, 4: 18 }[p.spectrum] ?? 48;
  const same = d.parties.filter((x) => x.spectrum === p.spectrum);
  return base + (same.length > 1 ? (same.indexOf(p) - (same.length - 1) / 2) * 16 : 0);
}

function seatBar(seats, title) {
  const total = d.election.seats;
  const order = [...d.parties].sort((a, b) => (seats[b.id] || 0) - (seats[a.id] || 0));
  return `<div class="strip-title">${esc(title)}: ${total}. Majority: ${d.election.majority}.</div><div class="seatbar">${order.map((p) => `<span class="sb" title="${esc(p.shortName)} ${seats[p.id] || 0}" style="width:${(100 * (seats[p.id] || 0)) / total}%;background:var(--party-${p.id});color:${p.id === "cornerstone" ? "var(--ink)" : "#fff"}">${seats[p.id] ? (seats[p.id] >= 8 ? `${esc(p.shortName)} ${seats[p.id]}` : seats[p.id]) : ""}</span>`).join("")}<span class="maj" style="left:${(100 * d.election.majority) / total}%"><span>18</span></span></div>`;
}

let tickerShown = -1;
function renderTicker(advance) {
  const news = ctl?.s.news || [];
  if (!news.length) return;
  const last = news.slice(-8);
  const i = advance ? ui.newsIdx % last.length : last.length - 1;
  if (!advance) ui.newsIdx = last.length - 1;
  if (i === tickerShown && !advance) return;
  tickerShown = i;
  const t = $("#ticker-text");
  t.classList.remove("in");
  void t.offsetWidth;
  t.textContent = last[i].text;
  t.classList.add("in");
}

function renderPause() {
  const p = $("#pause");
  p.hidden = !ctl.s.paused;
}

function defaultTab() {
  const st = ctl.s.step;
  if (ctl.s.phase === "bridge" && ctl.s.step.startsWith("pledge")) return "pledge";
  if (ctl.s.phase !== "p1") return "overview";
  if (st === "local") return "card";
  if (st === "budget") return "budget";
  if (st === "trade") return "trade";
  if (st === "results") return "why";
  if (st === "pledge1" || st === "pledge2") return "pledge";
  return "overview";
}

function renderPanel() {
  const panel = $("#panel");
  const keep = panel.scrollTop;
  const sameView = panel.dataset.view === `${ui.sel}|${ui.tab}|${ctl.s.step}`;
  const html = ui.sel && d.provinces.some((p) => p.id === ui.sel) ? provincePanel(ui.sel) : stepPanel();
  if (sameView) morph(panel, html); else { panel.innerHTML = html; panel.scrollTop = 0; }
  panel.dataset.view = `${ui.sel}|${ui.tab}|${ctl.s.step}`;
  if (sameView) panel.scrollTop = keep;
}

// ---------- province panel ----------
function provincePanel(pid) {
  const s = ctl.s, g = ctl.g;
  const pd = d.provinces.find((p) => p.id === pid);
  const p = g.provs[pid];
  const a = approvalTotal(p);
  const dl = s.lastYearDelta[pid];
  const tabs = [["overview", "Overview"]];
  if (s.phase === "p1") {
    if (s.step === "trade") tabs.push(["trade", "Trade Desk"]);
    if (s.step === "local") tabs.push(["card", "Local issue"]);
    if (s.step === "budget") tabs.push(["budget", "Budget slip"]);
  }
  if (s.phase === "bridge" && s.step.startsWith("pledge")) tabs.push(["pledge", "Pledge"]);
  if (p.history.length) tabs.push(["why", "Why it changed"]);
  if (s.phase === "p2" || s.phase === "debrief") tabs.push(["ridings", "Ridings"]);
  if (!tabs.some((t) => t[0] === ui.tab)) ui.tab = "overview";
  let body = "";
  if (ui.tab === "overview") {
    body = `<p class="atlas">${esc(ATLAS[pid])}</p>${resourceStrip(d, g, s, pid)}
      ${s.phase === "p1" && s.step !== "headline" ? goodsTable(d, g, pid, { afterTrade: s.step !== "income" }) : `<p class="small">Strong in ${pd.strongIn.join(", ")}. Short on ${pd.shortOn.join(", ")}.</p>`}
      <h4>Indicators <button class="link" data-act="override" data-pid="${pid}">Change a number</button></h4>${indicators(d, g, pid)}
      <p class="small">System: <b>${esc(d.economicSystems[p.system - 1].name)}</b>. Population ${pd.population} million.</p>${threeQuestions(d, p.system, { open: false })}`;
  } else if (ui.tab === "card") {
    body = `<p class="small">Enter this province's Decision Slip. Tap a choice.</p>${cardChooser(d, s, g, pid)}
      <button class="btn" data-act="swaplocal" data-pid="${pid}">Swap this card</button> <button class="btn" data-act="readcard" data-pid="${pid}">Read card aloud (big)</button>`;
  } else if (ui.tab === "budget") {
    ui.drafts[pid] ||= draftFrom(s, g, pid);
    body = `<p class="small">Enter this province's Decision Slip.</p>${budgetEditor(d, s, g, pid, ui.drafts[pid])}${speechPoints(pid)}`;
  } else if (ui.tab === "trade") {
    ui.desk.a = pid;
    body = tradeDesk();
  } else if (ui.tab === "why") {
    body = whyView(d, g, pid) + (s.phase === "p1" && s.step === "results" ? speechPoints(pid) : "");
  } else if (ui.tab === "pledge") {
    const key = s.step === "pledge1" ? "pledges1" : "pledges2";
    const v = s.bridge[key][pid] ?? 0;
    body = `<p>Pledge toward the $${d.cards.bridgeCrisis.rebuildCost}B bridge. Most this province can give: $${pledgeCap(g, pid)}B.</p>
      <div class="stepper big"><button class="step" data-act="pledge" data-pid="${pid}" data-v="${Math.max(0, v - 1)}">−</button><output>$${v}B</output><button class="step" data-act="pledge" data-pid="${pid}" data-v="${v + 1}">+</button></div>`;
  } else if (ui.tab === "ridings") {
    const el = s.p2.election;
    body = `<table class="tbl"><thead><tr><th>Riding</th><th>Type</th><th>Winner</th></tr></thead><tbody>${d.ridings.filter((r) => r.province === pid).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(d.ridingTypes[r.type].name)}</td><td>${el ? partyTag(el.winners[r.id]) : "not yet"}</td></tr>`).join("")}</tbody></table>
      ${el ? `<p class="small">Top issues here: ${el.issues[pid].join(", ")}.</p>` : ""}`;
  }
  return `<div class="pp">
    <header class="pp-head" style="--pc: var(--prov-${pid}-strong)">${crest(pid, 56)}<div><h2>${esc(pd.name)}</h2><span class="small">${esc(pd.blurb)}</span></div>
      <button class="close" data-act="closepanel" aria-label="Close panel">×</button></header>
    <div class="pp-appr"><span class="big-num">${a.toFixed(0)}</span><span>approval</span>${deltaChip(dl)}</div>
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? "on" : ""}">${l}</button>`).join("")}</nav>
    <div class="pp-body">${body}</div></div>`;
}

function speechPoints(pid) {
  const v = ctl.s.reasoning[pid] || 0;
  return `<div class="speech-pts"><b>Budget Speech points</b><small>1 says the choice. 2 adds why with a number. 3 adds who pays or loses.</small>
    <div class="seg">${[0, 1, 2, 3].map((n) => `<button data-act="points" data-pid="${pid}" data-v="${n}" class="${v === n ? "on" : ""}">${n}</button>`).join("")}</div></div>`;
}

function partyTag(id) {
  if (!id) return "";
  const p = d.parties.find((x) => x.id === id);
  return `<span class="ptag" style="--pc: var(--party-${id})">${esc(p.shortName)}</span>`;
}

function tradeDesk() {
  const s = ctl.s, g = ctl.g, k = ui.desk;
  const provOpts = (sel, key) => d.provinces.map((p) => `<button class="pchip ${sel === p.id ? "on" : ""}" data-act="desk-prov" data-k="${key}" data-pid="${p.id}" style="--pc: var(--prov-${p.id}-strong)">${esc(p.name)}</button>`).join("");
  const side = (key, owner) => ["food", "energy", "materials", "money"].map((r) => {
    const v = k[key][r] || 0;
    const have = owner && r !== "money" ? Math.floor(provinceHave(g, owner)[r] + 0.01) : null;
    return `<div class="trow"><div class="tlab">${resChip(r, cap(r))}${have !== null ? `<small>has ${have}</small>` : ""}</div><div class="stepper sm"><button class="step" data-act="desk-q" data-k="${key}" data-r="${r}" data-v="${Math.max(0, v - (r === "money" ? 0.5 : 1))}">−</button><output>${r === "money" ? "$" + v + "B" : v}</output><button class="step" data-act="desk-q" data-k="${key}" data-r="${r}" data-v="${v + (r === "money" ? 0.5 : 1)}">+</button></div></div>`;
  }).join("");
  const gv = g.dealValue(k.give), tv = g.dealValue(k.get);
  const ratio = gv && tv ? tv / gv : null;
  const fair = ratio === null ? "" : ratio >= 0.5 && ratio <= 2 ? `<span class="ok">Fair price check: OK (${ratio.toFixed(2)})</span>` : `<span class="bad">Outside the fair band (${ratio.toFixed(2)})</span>`;
  const open = s.offers.filter((o) => o.status === "open");
  return `<div class="desk"><h3>Trade Desk</h3><p class="small">Two Trade Ministers enter the deal together, then both tap Accept.</p>
    <div class="desk-pick"><span>Province A</span><div class="pchips">${provOpts(k.a, "a")}</div><span>Province B</span><div class="pchips">${provOpts(k.b, "b")}</div></div>
    ${k.a && k.b && k.a !== k.b ? `<div class="desk-sides"><div><h4>${esc(ctl.pname(k.a))} gives</h4>${side("give", k.a)}</div><div><h4>${esc(ctl.pname(k.b))} gives</h4>${side("get", k.b)}</div></div>
      <p class="fair">${fair} <small>Value at national prices: ${money(gv)} for ${money(tv)}. 10% of goods are lost to paperwork.</small></p>
      <div class="accept2"><button class="btn ${k.okA ? "on" : ""}" data-act="desk-ok" data-k="okA">${esc(ctl.pname(k.a))} accepts</button><button class="btn ${k.okB ? "on" : ""}" data-act="desk-ok" data-k="okB">${esc(ctl.pname(k.b))} accepts</button></div>` : `<p class="note">Pick two provinces.</p>`}
    </div>
    ${open.length ? `<h4>Open offers from devices</h4>${open.map((o) => `<div class="offer"><span>${esc(ctl.pname(o.from))} offers ${esc(ctl.pname(o.to))}: ${esc(sideText(o.give))} for ${esc(sideText(o.get))}. Waiting on ${esc(ctl.pname(o.turn))}.</span><button class="btn sm" data-act="offer-accept" data-id="${o.id}">Accept for ${esc(ctl.pname(o.turn))}</button><button class="btn sm" data-act="offer-cancel" data-id="${o.id}">Cancel</button></div>`).join("")}` : ""}
    <h4>Trade log, Year ${s.year}</h4>${tradeLog()}`;
}

function tradeLog() {
  const list = ctl.s.trades;
  if (!list.length) return `<p class="note">No deals yet.</p>`;
  return `<ul class="tlog">${list.map((t) => `<li class="${t.undone ? "undone" : ""}"><span>${esc(ctl.pname(t.a))} → ${esc(ctl.pname(t.b))}: ${esc(sideText(t.give))} for ${esc(sideText(t.get))}${t.fair ? "" : " (aid)"}</span>${t.undone ? "<em>undone</em>" : `<button class="btn sm" data-act="undotrade" data-id="${t.id}">Undo</button>`}</li>`).join("")}</ul>`;
}

// ---------- step panels ----------
function stepPanel() {
  const s = ctl.s, g = ctl.g;
  const head = (title, sub) => `<header class="sp-head"><span class="kicker">${esc(PHASE_NAMES[s.phase])}</span><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ""}</header>`;
  const provRow = (pid, right) => `<button class="prow" data-act="selprov" data-pid="${pid}">${crest(pid, 34)}<span class="pn">${esc(ctl.pname(pid))}</span><span class="pr">${right}</span></button>`;
  const P = d.provinces.map((p) => p.id);
  switch (s.step) {
    case "launch": {
      const url = location.href.replace(/board\.html.*$/, "");
      return head("Welcome to Borealis", "Seven provinces. Seven groups. One nation.") +
        `<div class="joinbox"><span class="kicker">Groups join at</span><b>${esc(url)}</b><span class="kicker">with the code</span><b class="code">${esc(s.room)}</b></div>
        <p class="small">No names. Each group joins as its province. If a device fails, the group uses a paper Decision Slip and you enter it here.</p>
        <h4>Job cards</h4><div class="roles">${ROLES_P1.map((r) => `<div class="role"><b>${esc(r.name)}</b><span>${esc(r.text)}</span></div>`).join("")}</div>
        <h4>Provinces</h4>${P.map((pid) => provRow(pid, `${joined("province:" + pid) > 1 ? `<span class="bad">${joined("province:" + pid)} devices: only the first can send</span>` : joined("province:" + pid) ? "Device joined" : "Paper or not joined"}`)).join("")}`;
    }
    case "headline": {
      const ev = s.yc.event ? g.events[s.yc.event] : null;
      if (!s.yc.revealed && ev) return head(`Year ${s.year}: Headline`) + `<div class="cardback" data-act="reveal"><span>BOREALIS DAILY</span><b>Tap to reveal the headline</b></div>
        <button class="btn" data-act="swapevent">Swap card before revealing</button>` + localList();
      return head(`Year ${s.year}: Headline`) + (ev ? `<article class="news-card"><span class="kicker">${esc(ev.category)}</span><h3>${esc(ev.title)}</h3><p class="lede">${esc(ev.headline)}</p><p>${esc(ev.text)}</p><p class="small"><b>Talk:</b> ${esc(ev.debrief)}</p></article>`
        : `<article class="news-card calm"><h3>A calm year</h3><p class="lede">No national event this year. Learn the steps.</p></article>${s.year && !ev ? `<button class="btn" data-act="swapevent">Swap in an event</button>` : ""}`) + localList();
    }
    case "income":
      return head(`Year ${s.year}: Income`, `Prices: ${GOODS.map((x) => `${cap(x)} ${g.price[x].toFixed(1)}`).join(", ")}.`) +
        `<table class="tbl inc"><thead><tr><th></th><th>GDP</th>${GOODS.map((x) => `<th>${icon(x)}</th>`).join("")}<th>Tax $</th></tr></thead><tbody>${P.map((pid) => {
          const p = g.provs[pid];
          return `<tr data-act="selprov" data-pid="${pid}"><th>${crest(pid, 26)} ${esc(ctl.pname(pid))}</th><td>${money(p.gdp, 0)}</td>${GOODS.map((x) => { const df = p.prod[x] - g.need(p, x, p.prev.infrastructure); return `<td class="${df < 0 ? "bad" : "ok"}">${df > 0 ? "+" : ""}${Math.round(df)}</td>`; }).join("")}<td>${money(p.gdp * d.constants.taxRates[p.prev.tax - 1] / 100, 0)}</td></tr>`;
        }).join("")}</tbody></table><p class="small">Goods columns show extra (+) or short (−) before trade. Tap a province for details.</p>`;
    case "trade":
      return head(`Year ${s.year}: Trade`, "Trade Ministers make deals. Paper deals go through the Trade Desk.") + tradeDesk();
    case "local":
      return head(`Year ${s.year}: Local issue`, "Tap a province to read its card or enter its choice.") + P.map((pid) => {
        const c = s.choices[pid] || {};
        const done = c.choice && (!s.yc.event || c.eventChoice);
        return provRow(pid, `<span class="ctitle">${esc(s.yc.local[pid].map((x) => g.cards[x].title).join(" or "))}</span>${done ? '<span class="ok">Chosen</span>' : '<span class="wait">Waiting</span>'}`);
      }).join("") + (s.yc.underdog ? `<p class="small">${esc(ctl.pname(s.yc.underdog))} has the lowest approval and draws two cards.</p>` : "");
    case "budget":
      return head(`Year ${s.year}: Budget`, "Tap a province to enter its Decision Slip or give Budget Speech points.") + P.map((pid) => {
        const b = s.budgets[pid];
        let right = '<span class="wait">Not confirmed</span>';
        if (b?.confirmed) { const f = g.finances(g.provs[pid], b.decision); right = `<span class="${f.balance >= 0 ? "ok" : "bad"}">${f.balance >= 0 ? "Surplus" : "Deficit"} ${money(Math.abs(f.balance))}</span><span class="ok">Confirmed</span>`; }
        if (g.must_balance(g.provs[pid])) right = '<span class="bad">Lenders say no</span>' + right;
        return provRow(pid, right + `<span class="pts">Speech ${s.reasoning[pid] || 0}</span>`);
      }).join("");
    case "results":
      return head(`Year ${s.year}: Results`, "Tap a province to see why its approval changed and to give Budget Speech points.") +
        `<table class="tbl"><thead><tr><th></th><th>Approval</th><th>Balance</th><th>Debt</th><th>Unempl.</th><th>CPI</th></tr></thead><tbody>${P.map((pid) => {
          const h = g.provs[pid].history.at(-1);
          return `<tr data-act="selprov" data-pid="${pid}"><th>${crest(pid, 26)} ${esc(ctl.pname(pid))}</th><td><b>${h.approval.toFixed(0)}</b> ${deltaChip(s.lastYearDelta[pid])}</td><td class="${h.balance < 0 ? "bad" : ""}">${signed(h.balance)}</td><td>${h.debt < 0 ? "Savings " + money(-h.debt, 0) : money(h.debt, 0)}</td><td>${h.unemployment.toFixed(1)}%</td><td>${h.cpi.toFixed(0)}</td></tr>`;
        }).join("")}</tbody></table>` + (s.year >= 5 ? compareBox() : "") + `<p class="small">No ranking. Every province is judged by its own people.</p>` + threeQBoard();
    case "review": return reviewPanel(head);
    case "crisis": {
      const b = d.cards.bridgeCrisis;
      return head(b.title) + `<article class="news-card"><p class="lede">${esc(b.headline)}</p><p>${esc(b.text)}</p></article><h4>Talk</h4><ul>${b.debrief.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    }
    case "pledge1": case "reveal": case "pledge2": case "outcome": return bridgePanel(head);
    default: return p2Panel(head);
  }
}

// Three economic questions for every system in use this year (curriculum section 9).
function threeQBoard() {
  const used = [...new Set(d.provinces.map((p) => ctl.g.provs[p.id].system))].sort();
  return `<h4>The three economic questions</h4>` + used.map((st) => threeQuestions(d, st, { open: used.length === 1, title: `${d.economicSystems[st - 1].name}: ${d.provinces.filter((p) => ctl.g.provs[p.id].system === st).map((p) => p.name).join(", ")}` })).join("");
}

function compareBox() {
  const ids = ui.compare || ["goldplain", "lakemoor"];
  const g = ctl.g;
  const col = (pid) => { const h = g.provs[pid].history.at(-1); return `<div><b>${esc(ctl.pname(pid))}</b><span>GDP ${money(h.gdp, 0)}</span><span>CPI ${h.cpi.toFixed(0)}</span><span>Unemployment ${h.unemployment}%</span><span>Approval ${h.approval.toFixed(0)}</span></div>`; };
  return `<div class="compare"><h4>Compare two provinces</h4><div class="seg">${d.provinces.map((p) => `<button data-act="cmp" data-pid="${p.id}" class="${ids.includes(p.id) ? "on" : ""}">${esc(p.name)}</button>`).join("")}</div><div class="cmp-cols">${col(ids[0])}${col(ids[1])}</div></div>`;
}

function localList() {
  const s = ctl.s;
  return `<h4>Local issue cards this year</h4><p class="small">You can swap a province's card before it chooses. Tap a province.</p>` + d.provinces.map((p) => `<div class="mini">${crest(p.id, 22)} ${esc(p.name)}: ${esc(s.yc.local[p.id].map((x) => ctl.g.cards[x].title).join(" or "))}</div>`).join("");
}

function reviewPanel(head) {
  const s = ctl.s, g = ctl.g;
  const rows = d.provinces.map((p) => {
    const h = g.provs[p.id].history;
    const last = h.at(-1);
    return `<tr data-act="selprov" data-pid="${p.id}"><th>${crest(p.id, 26)} ${esc(p.name)}</th><td>${last.approval.toFixed(0)}</td><td>${Math.round((100 * last.debt) / last.gdp)}%</td><td>${signed(100 * (last.gdp / h[0].gdp - 1), 0)}%</td><td>${last.unemployment}%</td><td>${last.cpi.toFixed(0)}</td><td>${esc(d.economicSystems[last.system - 1].name)}</td></tr>`;
  }).join("");
  const cg = s.classGoal || {};
  return head("Phase 1 review", "State of the Province reports. High approval or low debt?") +
    `<div class="goal ${cg.met ? "met" : ""}"><b>Class goal: Strong Borealis</b><span>Average approval ${cg.avg ?? "?"} (goal 55). ${cg.met ? `Met. The federal government starts with $${cg.bonus}B.` : "Not met."}</span></div>
    <table class="tbl"><thead><tr><th></th><th>Approval</th><th>Debt/GDP</th><th>GDP growth</th><th>Unempl.</th><th>CPI</th><th>System</th></tr></thead><tbody>${rows}</tbody></table>
    <h4>Awards</h4><div class="awards">${(s.awards || []).map((a) => `<div class="award"><span class="kicker">${esc(a.name)}</span>${a.pid ? `${crest(a.pid, 28)} <b>${esc(ctl.pname(a.pid))}</b>` : "<b>No winner</b>"}</div>`).join("")}</div>`;
}

function bridgePanel(head) {
  const s = ctl.s, cost = d.cards.bridgeCrisis.rebuildCost;
  const r = s.step === "pledge1" ? 1 : 2;
  const key = "pledges" + r;
  const secret = s.step === "pledge1";
  const tot = s.step === "pledge1" ? null : ctl.pledgeTotal(s.step === "reveal" ? 1 : 2);
  const bar = tot === null ? "" : `<div class="pledgebar"><span style="width:${Math.min(100, (100 * tot) / cost)}%"></span><b>$${tot}B of $${cost}B</b></div>`;
  let h = head(STEP_NAMES[s.step], secret ? "Secret round. Each province enters a pledge on its device or a slip. Amounts stay hidden." : s.step === "pledge2" ? "Open round. Pledges show live. Talk it out." : "") + bar +
    `<p class="small">Most Borealis can raise this year: <b>$${pledgeCapTotal(ctl.g)}B</b> (every province at its limit). The bridge costs $${cost}B. Pledges are paid in Year 7 only if the bridge gets built.</p>`;
  if (s.step === "outcome") h += `<article class="news-card"><p class="lede">${esc(d.cards.bridgeCrisis.outcomes[s.bridge.outcome])}</p><p>${esc(d.cards.bridgeCrisis.outcomes.note)}</p></article><p class="small">Next: Four Ways to Decide (dictatorship, oligarchy, direct democracy, representative democracy). Then Borealis founds a federal Parliament.</p>`;
  h += d.provinces.map((p) => {
    const v = s.bridge[s.step === "reveal" ? "pledges1" : key][p.id];
    const shown = secret ? (v !== undefined ? '<span class="ok">Pledged</span>' : '<span class="wait">Waiting</span>') : `<b>$${v ?? 0}B</b>`;
    return `<button class="prow" data-act="selprov" data-pid="${p.id}">${crest(p.id, 34)}<span class="pn">${esc(p.name)}</span><span class="pr">${shown}</span></button>`;
  }).join("");
  return h;
}

// ---------- Phase 2 panels ----------
function p2Panel(head) {
  const s = ctl.s, p2 = s.p2;
  const stepper = (act, attrs, v, min = 0) => `<div class="stepper sm"><button class="step" data-act="${act}" ${attrs} data-v="${Math.max(min, v - 1)}">−</button><output>${v}</output><button class="step" data-act="${act}" ${attrs} data-v="${v + 1}">+</button></div>`;
  switch (s.step) {
    case "parties": {
      const counts = (party) => Object.values(p2.members[party]).reduce((a, b) => a + b, 0);
      return head("Parties and ideology", "Students choose a party on a secret slip. Enter counts only, never names. Province stays each student's riding.") +
        d.parties.map((pt) => {
          const rk = ctl.partyRanking(pt.id);
          return `<details class="party" ${ui.openParty === pt.id ? "open" : ""} data-party="${pt.id}"><summary style="--pc: var(--party-${pt.id})">${partyMark(pt.id, 30)}<b>${esc(pt.shortName)}</b><span>${plural(counts(pt.id), "member")}</span><span>${p2.leader[pt.id] ? "Leader from " + esc(ctl.pname(p2.leader[pt.id])) : "No leader yet"}</span></summary>
          <p class="small">${esc(pt.identity)}</p>
          <table class="tbl mini-t"><tbody>${d.provinces.map((p) => `<tr><th>${esc(p.name)}</th><td>${stepper("members", `data-party="${pt.id}" data-pid="${p.id}"`, p2.members[pt.id][p.id])}</td></tr>`).join("")}</tbody></table>
          <h4>Leader's home province</h4><div class="seg wrap">${d.provinces.map((p) => `<button data-act="leader" data-party="${pt.id}" data-pid="${p.id}" class="${p2.leader[pt.id] === p.id ? "on" : ""}">${esc(p.name)}</button>`).join("")}</div>
          <h4>Priorities (${plural(p2.ballotsIn[pt.id], "ranking")} in)</h4><ol class="rank">${rk.map((id, i) => `<li class="${i < 3 ? "in" : "out"}">${esc(pt.planks.find((x) => x.id === id).title)} <small>${p2.borda[pt.id][id] || 0} pts</small></li>`).join("")}</ol>
          ${rankEntry(pt)}</details>`;
        }).join("");
    }
    case "platform":
      return head("Platforms and ridings", "Top 3 priorities become the platform. Each promise has a price tag.") + d.parties.map((pt) => platformCard(pt)).join("");
    case "campaign": {
      const E = d.election;
      return head("Campaign", `Each party has ${E.campaignActionsPerParty} action points. Campaign work adds at most +${E.maxAppealFromCampaignPerRiding} appeal per riding.`) +
        d.parties.map((pt) => { const c = p2.campaign[pt.id]; return `<div class="camp" style="--pc: var(--party-${pt.id})">${partyMark(pt.id, 28)}<b>${esc(pt.shortName)}</b><span class="meter"><span style="width:${(100 * c.spent) / E.campaignActionsPerParty}%"></span></span><span>${c.spent} of ${E.campaignActionsPerParty} used</span><button class="btn sm" data-act="campaign-open" data-party="${pt.id}">Enter actions</button></div>`; }).join("") +
        `<h4>All-candidates debate</h4><p class="small">After the debate, every student endorses the best pitch from another party. Tap parties from most to fewest endorsements.</p>
        <div class="seg">${d.parties.map((pt) => { const i = (p2.debate.order || []).indexOf(pt.id); return `<button data-act="debate" data-party="${pt.id}" class="${i >= 0 ? "on" : ""}">${i >= 0 ? i + 1 + ". " : ""}${esc(pt.shortName)}</button>`; }).join("")}<button data-act="debate-clear">Clear</button></div>
        <p class="small">Clearest reasoning bonus (+1):</p><div class="seg">${d.parties.map((pt) => `<button data-act="debate-bonus" data-party="${pt.id}" class="${p2.debate.bonus?.[pt.id] ? "on" : ""}">${esc(pt.shortName)}</button>`).join("")}</div>`;
    }
    case "vote": {
      const tot = (pid) => Object.values(p2.ballots[pid]).reduce((a, b) => a + b, 0);
      return head("Student Vote", "Check each riding card at the polling table. Students vote on their riding's device, or on paper and you enter the counts.") +
        `<table class="tbl vote"><thead><tr><th></th><th>Voters</th>${d.parties.map((pt) => `<th>${partyMark(pt.id, 24)}</th>`).join("")}<th>Cast</th></tr></thead><tbody>${d.provinces.map((p) => `<tr><th>${esc(p.name)}</th><td>${stepper("voters", `data-pid="${p.id}"`, votersFor(s, p.id), 1)}</td>${d.parties.map((pt) => `<td>${stepper("ballot", `data-party="${pt.id}" data-pid="${p.id}"`, p2.ballots[p.id][pt.id])}</td>`).join("")}<td class="${tot(p.id) >= votersFor(s, p.id) ? "ok" : ""}">${tot(p.id)}/${votersFor(s, p.id)}</td></tr>`).join("")}</tbody></table>
        <p class="small">Voters: one ballot each, capped at the riding's voters (its party members, or 4). Each ballot adds a small boost for that party in that province. A whole riding voting one way can tip a close race, but cannot win a riding without a platform and a campaign.</p>`;
    }
    case "election": return resultsPanel(head);
    case "government": return govPanel(head);
    case "bill": return billPanel(head);
    case "year7": {
      const y7 = p2.year7;
      if (!y7) return head("Federal year") + `<p>Not run yet.</p>`;
      return head(`Year ${s.year}: the federal budget at work`, `Federal revenue ${money(y7.money.revenue)}, spending ${money(y7.money.spending)}: ${y7.money.balance >= 0 ? "surplus" : "deficit"} ${money(Math.abs(y7.money.balance))}.`) +
        `<table class="tbl"><thead><tr><th></th><th>Approval</th><th>Change</th><th>Federal part</th></tr></thead><tbody>${d.provinces.map((p) => { const r = y7.rows[p.id]; return `<tr data-act="selprov" data-pid="${p.id}"><th>${crest(p.id, 24)} ${esc(p.name)}</th><td>${r.after.toFixed(0)}</td><td>${deltaChip(r.delta)}</td><td>${signed(r.federal)}</td></tr>`; }).join("")}</tbody></table>
        <p class="small">Tap a province to see the full "why it changed" bar. The federal part is labelled "Federal budget".</p>`;
    }
    case "debrief": {
      return head("Debrief", "Replay the history log. Then the Budget Defence.") + `<a class="btn primary big" href="log.html?class=${encodeURIComponent(s.className)}" target="_blank">Open the history log (printable)</a>
        ${p2.bill?.fell ? `<article class="news-card"><p class="lede">The government lost the budget vote and fell.</p><p>In real life, an election would follow. Talk about why the vote failed.</p></article>` : ""}
        <h4>Final approval</h4>${d.provinces.map((p) => `<div class="mini">${crest(p.id, 22)} ${esc(p.name)}: ${approvalTotal(ctl.g.provs[p.id]).toFixed(0)}</div>`).join("")}`;
    }
  }
  return "";
}

function rankEntry(pt) {
  const dr = ui.rankDraft[pt.id] || [];
  return `<div class="rank-entry"><p class="small">Board entry: tap the 4 promises in one member's order, then add it.</p><div class="seg wrap">${pt.planks.map((pl) => { const i = dr.indexOf(pl.id); return `<button data-act="rank-tap" data-party="${pt.id}" data-pl="${pl.id}" class="${i >= 0 ? "on" : ""}">${i >= 0 ? i + 1 + ". " : ""}${esc(pl.title)}</button>`; }).join("")}</div>
    <button class="btn sm" data-act="rank-add" data-party="${pt.id}" ${dr.length === 4 ? "" : "disabled"}>Add this ranking</button> <button class="btn sm" data-act="rank-reset" data-party="${pt.id}">Clear all rankings</button></div>`;
}

function platformCard(pt) {
  const p2 = ctl.s.p2;
  const plat = ctl.partyPlatform(pt.id);
  const m = ctl.partyMoney(pt.id);
  const rk = ctl.partyRanking(pt.id).slice(0, 3);
  const L = d.constants.levelNames;
  const lv = plat.levers;
  const cand = Object.values(p2.candidates[pt.id]).filter(Boolean).length;
  const cred = m.deficitPct > d.election.fiscalCredibility.deficitAboveSharePct;
  return `<details class="party" data-party="${pt.id}" ${ui.openParty === pt.id ? "open" : ""}><summary style="--pc: var(--party-${pt.id})">${partyMark(pt.id, 30)}<b>${esc(pt.shortName)}</b><span class="${m.balance >= 0 ? "ok" : "bad"}">${m.balance >= 0 ? "Surplus" : "Deficit"} ${money(Math.abs(m.balance))}</span><span>${cand}/7 candidates</span></summary>
    <ol class="rank">${rk.map((id) => `<li class="in">${esc(pt.planks.find((x) => x.id === id).title)}</li>`).join("")}</ol>
    <table class="tbl mini-t"><tbody>
      <tr><th>Federal tax</th><td>${leverStepper(pt.id, "tax", lv.tax, plat.locked)}</td><td>${d.federalBudget.taxRates[lv.tax - 1]}%</td></tr>
      ${EL.LINES.map((c) => `<tr><th>${esc(d.federalBudget.lines[c].name)}</th><td>${leverStepper(pt.id, c, lv[c], plat.locked)}</td><td>${L[lv[c] - 1]}, ${money(m.lines[c], 0)}</td></tr>`).join("")}
      <tr><th>Bridge</th><td colspan="2"><div class="seg wrap">${Object.keys(d.federalBudget.bridge).map((b) => `<button data-act="plev" data-party="${pt.id}" data-k="bridge" data-v="${b}" class="${lv.bridge === b ? "on" : ""}" ${plat.locked.includes("bridge") ? "disabled" : ""}>${esc(d.federalBudget.bridge[b].name)}</button>`).join("")}</div></td></tr>
      <tr><th>Equalization</th><td colspan="2"><div class="seg"><button data-act="plev" data-party="${pt.id}" data-k="equalization" data-v="0" class="${!lv.equalization ? "on" : ""}" ${plat.locked.includes("equalization") ? "disabled" : ""}>Off</button><button data-act="plev" data-party="${pt.id}" data-k="equalization" data-v="1" class="${lv.equalization ? "on" : ""}" ${plat.locked.includes("equalization") ? "disabled" : ""}>On ($6B)</button></div></td></tr>
    </tbody></table>
    <p class="small">Revenue ${money(m.revenue)}. Spending ${money(m.spending)}. ${plat.maxDeficit !== null ? `Platform promise: deficit at most ${plat.maxDeficit}% of revenue. ` : ""}${cred ? `<b class="bad">Deficit above 15% of revenue: businesses and seniors trust this platform less.</b>` : ""}</p>
    <h4>Regional promise</h4><div class="seg wrap">${d.regionalPromises.map((rp) => `<button data-act="promise" data-party="${pt.id}" data-pid="${rp.province}" class="${p2.promise[pt.id] === rp.province ? "on" : ""}">${esc(rp.title)}</button>`).join("")}</div>
    <h4>Riding candidates confirmed</h4><div class="seg wrap">${d.provinces.map((p) => `<button data-act="cand" data-party="${pt.id}" data-pid="${p.id}" class="${p2.candidates[pt.id][p.id] ? "on" : ""}">${esc(p.name)}${p2.members[pt.id][p.id] ? "" : " (volunteer)"}</button>`).join("")}</div>
  </details>`;
}

function leverStepper(party, k, v, locked) {
  const lk = locked.includes(k);
  return `<div class="stepper sm"><button class="step" data-act="plev" data-party="${party}" data-k="${k}" data-v="${v - 1}" ${lk || v <= 1 ? "disabled" : ""}>−</button><output>${v}</output><button class="step" data-act="plev" data-party="${party}" data-k="${k}" data-v="${v + 1}" ${lk || v >= 5 ? "disabled" : ""}>+</button></div>${lk ? '<small class="lock">promise</small>' : ""}`;
}

function resultsPanel(head) {
  const el = ctl.s.p2.election;
  const revealing = ui.revealN < d.ridings.length;
  const pr = ui.prView;
  return head("Election results", revealing ? "Ridings light up province by province, smallest first." : "First past the post: the most votes in a riding wins the seat.") +
    `${revealing ? `<button class="btn" data-act="reveal-all">Show all results now</button>` : `<button class="btn" data-act="reveal-start">Replay the reveal</button>`}
    ${!revealing ? `<table class="tbl"><thead><tr><th>Party</th><th>Seats</th><th>Vote share</th><th>Seat share</th>${pr ? "<th>Seats if proportional</th>" : ""}</tr></thead><tbody>${d.parties.map((p) => `<tr><th>${partyTag(p.id)}</th><td><b>${el.seats[p.id]}</b></td><td>${(100 * el.votes[p.id]).toFixed(0)}%</td><td>${((100 * el.seats[p.id]) / d.election.seats).toFixed(0)}%</td>${pr ? `<td>${el.pr[p.id]}</td>` : ""}</tr>`).join("")}</tbody></table>
    <button class="btn" data-act="prview">${pr ? "Hide" : "Show"} a different system: proportional seats</button>
    <h4>Province issues used in this election</h4>${d.provinces.map((p) => `<div class="mini">${crest(p.id, 20)} ${esc(p.name)}: ${el.issues[p.id].join(", ")}</div>`).join("")}` : ""}`;
}

function govPanel(head) {
  const p2 = ctl.s.p2, gov = p2.gov;
  const seats = (x) => ctl.partySeats(x);
  let h = head("Forming government", gov.majority ? `${esc(ctl.partyName(gov.party))} has a majority (${seats(gov.party)} of 34).` : `Minority Parliament. ${esc(ctl.partyName(gov.party))} is invited to form government.`);
  h += parliamentChart();
  if (!gov.majority) {
    const r = ctl.seatVote(gov.votes);
    h += `<h4>Confidence vote on the Throne Speech</h4><p class="small">Each party votes as a bloc. A partner can support the government in exchange for one of its promises.</p>
      ${d.parties.map((p) => `<div class="vote-row">${partyTag(p.id)}<span>${plural(seats(p.id), "seat")}</span><div class="seg"><button data-act="govvote" data-party="${p.id}" data-v="yes" class="${gov.votes[p.id] === "yes" ? "on" : ""}">Yes</button><button data-act="govvote" data-party="${p.id}" data-v="no" class="${gov.votes[p.id] === "no" ? "on" : ""}">No</button></div></div>`).join("")}
      <p>Yes ${r.yes}, No ${r.no}. Needs ${d.election.majority}.</p>
      ${gov.status === "passed" ? `<p class="ok">The Throne Speech passed. ${esc(ctl.partyName(gov.party))} governs.</p>` : `<button class="btn primary" data-act="holdconf">Hold the confidence vote</button>`}
      ${gov.tries.map((t) => `<p class="small">${esc(ctl.partyName(t.party))}: ${t.yes} yes, ${t.no} no, ${t.passed ? "passed" : "failed"}.</p>`).join("")}`;
  }
  h += `<h4>Roles</h4><div class="roles">${[["Prime Minister", `Leader of ${ctl.partyName(gov.party)}. Picks Cabinet. Recommends 3 senators.`], ["Cabinet", d.parliament.cabinetRoles.slice(1).join(", ") + " ministers."], ["Leader of the Opposition", `Leader of ${ctl.partyName(gov.opposition)}. Asks the first question.`], ["Shadow cabinet", "One critic for each minister."], ["Senators (3)", "Recommended by the PM. Review the bill."], ["Governor General", "The teacher. Gives Royal Assent. Stays neutral."]].map(([a, b]) => `<div class="role"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("")}</div>`;
  return h;
}

function parliamentChart() {
  const p2 = ctl.s.p2, gov = p2.gov;
  // Government on the left benches, others on the right, like the House of Commons.
  const order = [gov.party, ...p2.gov.order.filter((x) => x !== gov.party)];
  const seatsList = order.flatMap((pid) => Array(ctl.partySeats(pid)).fill(pid));
  const govN = ctl.partySeats(gov.party);
  const dots = seatsList.map((pid, i) => {
    const left = i < govN;
    const k = left ? i : i - govN;
    const col = Math.floor(k / 3), row = k % 3;
    const x = left ? 20 + col * 22 : 20 + col * 22;
    const y = left ? 18 + row * 22 : 128 + row * 22;
    return `<circle cx="${x}" cy="${y}" r="9" fill="var(--party-${pid})" stroke="var(--ink)" stroke-width="1"><title>${esc(ctl.partyName(pid))}</title></circle>`;
  }).join("");
  return `<svg class="parl" viewBox="0 0 460 190" aria-label="House of Commons seating"><text x="0" y="98" class="small">Speaker</text><rect x="0" y="84" width="460" height="22" fill="none"/><text x="230" y="100" text-anchor="middle" class="aisle">Government benches above. Opposition below.</text>${dots}</svg>`;
}

function billPanel(head) {
  const p2 = ctl.s.p2, b = p2.bill, gov = p2.gov.party;
  const m = EL.fedMoney(d, b.levers, EL.nationalGdp(ctl.g), ctl.fedStartDebt());
  const L = d.constants.levelNames;
  let h = head("C-1 Borealis Founding Budget Act", `Drafted by the ${esc(ctl.partyName(gov))} Cabinet. ${p2.gov.majority ? "Majority" : "Minority"} government.`);
  h += `<ol class="stages">${BILL_STAGES.map((st, i) => `<li class="${i === b.stage ? "on" : i < b.stage ? "done" : ""}">${esc(st)}</li>`).join("")}</ol>`;
  const lev = (k) => {
    const v = b.levers[k];
    const edit = b.stage === 0;
    if (k === "bridge") return `<tr><th>Bridge</th><td colspan="2">${edit ? `<div class="seg wrap">${Object.keys(d.federalBudget.bridge).map((x) => `<button data-act="blev" data-k="bridge" data-v="${x}" class="${v === x ? "on" : ""}">${esc(d.federalBudget.bridge[x].name)}</button>`).join("")}</div>` : esc(d.federalBudget.bridge[v].name)}</td></tr>`;
    if (k === "equalization") return `<tr><th>Equalization</th><td colspan="2">${edit ? `<div class="seg"><button data-act="blev" data-k="equalization" data-v="0" class="${!v ? "on" : ""}">Off</button><button data-act="blev" data-k="equalization" data-v="1" class="${v ? "on" : ""}">On</button></div>` : v ? "On ($6B)" : "Off"}</td></tr>`;
    const val = k === "tax" ? `${d.federalBudget.taxRates[v - 1]}%` : `${L[v - 1]}, ${money(m.lines[k], 0)}`;
    return `<tr><th>${esc(leverLabel(d, k))}</th><td>${edit ? `<div class="stepper sm"><button class="step" data-act="blev" data-k="${k}" data-v="${v - 1}" ${v <= 1 ? "disabled" : ""}>−</button><output>${v}</output><button class="step" data-act="blev" data-k="${k}" data-v="${v + 1}" ${v >= 5 ? "disabled" : ""}>+</button></div>` : ""}</td><td>${val}</td></tr>`;
  };
  h += `<table class="tbl mini-t"><tbody>${BILL_LEVERS.map(lev).join("")}${(b.levers.programs || []).length ? `<tr><th>Programs</th><td colspan="2">${b.levers.programs.map((x) => esc(d.federalBudget.programs[x].name)).join(", ")}</td></tr>` : ""}</tbody></table>
    <p class="${m.balance >= 0 ? "ok" : "bad"}">Revenue ${money(m.revenue)}, spending ${money(m.spending)}: ${m.balance >= 0 ? "surplus" : "deficit"} ${money(Math.abs(m.balance))}.</p>`;
  if (b.stage === 2) h += `<h4>Question Period scores (0 to 3 per question and answer: claim, evidence, trade-off)</h4>${d.parties.map((p) => `<div class="vote-row">${partyTag(p.id)}<div class="stepper sm"><button class="step" data-act="qp" data-party="${p.id}" data-v="${Math.max(0, (b.qp[p.id] || 0) - 1)}">−</button><output>${b.qp[p.id] || 0}</output><button class="step" data-act="qp" data-party="${p.id}" data-v="${(b.qp[p.id] || 0) + 1}">+</button></div></div>`).join("")}`;
  if (b.stage === 3) {
    h += `<h4>Amendments</h4><p class="small">Each opposition party may move one amendment: one lever, one level. The House votes on each when you press Next step.</p>`;
    for (const p of d.parties.filter((x) => x.id !== gov)) {
      const a = b.amendments.find((x) => x.party === p.id);
      h += `<div class="amend">${partyTag(p.id)} <div class="seg wrap">${["tax", ...EL.LINES].map((k) => `<button data-act="amend" data-party="${p.id}" data-k="${k}" data-v="1" class="${a?.lever === k && a.dir > 0 ? "on" : ""}">${esc(leverLabel(d, k))} up</button><button data-act="amend" data-party="${p.id}" data-k="${k}" data-v="-1" class="${a?.lever === k && a.dir < 0 ? "on" : ""}">${esc(leverLabel(d, k))} down</button>`).join("")}<button data-act="amend" data-party="${p.id}" data-k="" data-v="0">None</button></div>
        ${a ? `<div class="seg">${d.parties.map((q) => `<button data-act="amendvote" data-party="${q.id}" data-amend="${p.id}" class="${a.votes[q.id] === "yes" ? "on" : ""}">${esc(q.shortName)} ${a.votes[q.id] === "yes" ? "yes" : "no"}</button>`).join("")}</div>` : ""}</div>`;
    }
  }
  if (b.amendments.some((a) => a.result)) h += b.amendments.filter((a) => a.result).map((a) => `<p class="small">${esc(ctl.partyName(a.party))}: ${esc(leverLabel(d, a.lever))} ${a.dir > 0 ? "up" : "down"}, ${a.result}.</p>`).join("");
  if (b.stage === 4) {
    const r = ctl.seatVote(b.votes);
    h += `<h4>House vote (seat-weighted, party blocs)</h4>${d.parties.map((p) => `<div class="vote-row">${partyTag(p.id)}<span>${plural(ctl.partySeats(p.id), "seat")}</span><div class="seg"><button data-act="billvote" data-party="${p.id}" data-v="yes" class="${b.votes[p.id] === "yes" ? "on" : ""}">Yes</button><button data-act="billvote" data-party="${p.id}" data-v="no" class="${b.votes[p.id] === "no" ? "on" : ""}">No</button></div></div>`).join("")}
      <p><b>House: Yes ${r.yes}, No ${r.no}.</b> Needs ${d.election.majority}.</p>
      <h4>Class show of hands (direct democracy)</h4><div class="vote-row"><span>Yes</span><div class="stepper sm"><button class="step" data-act="classvote" data-k="yes" data-v="${Math.max(0, b.classVote.yes - 1)}">−</button><output>${b.classVote.yes}</output><button class="step" data-act="classvote" data-k="yes" data-v="${b.classVote.yes + 1}">+</button></div><span>No</span><div class="stepper sm"><button class="step" data-act="classvote" data-k="no" data-v="${Math.max(0, b.classVote.no - 1)}">−</button><output>${b.classVote.no}</output><button class="step" data-act="classvote" data-k="no" data-v="${b.classVote.no + 1}">+</button></div></div>`;
  }
  if (b.result) h += `<p class="${b.result.passed ? "ok" : "bad"}">House vote: ${b.result.yes} yes, ${b.result.no} no. Class: ${b.classVote.yes} yes, ${b.classVote.no} no.</p>`;
  if (b.stage === 5) h += `<h4>Senate review</h4><p class="small">The 3 senators may send back one change, once.</p><div class="seg wrap">${["tax", ...EL.LINES].map((k) => `<button data-act="senate" data-k="${k}" data-v="1" class="${b.senate?.lever === k && b.senate.dir > 0 ? "on" : ""}">${esc(leverLabel(d, k))} up</button><button data-act="senate" data-k="${k}" data-v="-1" class="${b.senate?.lever === k && b.senate.dir < 0 ? "on" : ""}">${esc(leverLabel(d, k))} down</button>`).join("")}<button data-act="senate" data-k="" data-v="0" class="${!b.senate ? "on" : ""}">No change</button></div>`;
  if (b.stage === 6) h += `<article class="news-card"><p class="lede">Royal Assent. C-1 is law.</p><p>Press Next step to run the first federal year and see the budget reach every province.</p></article>`;
  return h;
}

function joined(actor) { return activeDevices().filter(([, v]) => v.actor === actor).length; }

// ---------- controls ----------
function nextLabel() {
  const s = ctl.s;
  if (s.phase === "launch") return "Start Year 1";
  if (s.phase === "p1") {
    if (s.step === "headline" && s.yc.event && !s.yc.revealed) return "Reveal headline";
    if (s.step === "results") return s.year < d.meta.fiscalYears ? `Start Year ${s.year + 1}` : "Phase 1 review";
    const i = P1_STEPS.indexOf(s.step);
    return `Next: ${STEP_NAMES[P1_STEPS[i + 1]]}`;
  }
  if (s.phase === "review") return "Next: Bridge crisis";
  if (s.phase === "bridge") return s.step === "outcome" ? "Start Phase 2" : `Next: ${STEP_NAMES[BRIDGE_STEPS[BRIDGE_STEPS.indexOf(s.step) + 1]]}`;
  if (s.phase === "p2") {
    if (s.step === "bill") return s.p2.bill.stage === 6 ? "Run the federal year" : `Next: ${BILL_STAGES[s.p2.bill.stage + 1]}`;
    if (s.step === "year7") return "Debrief";
    return `Next: ${STEP_NAMES[P2_STEPS[P2_STEPS.indexOf(s.step) + 1]]}`;
  }
  return "Finished";
}

function renderControls() {
  const s = ctl.s;
  const t = s.timer;
  $("#now").innerHTML = `<span class="kicker">What to do now</span><span>${esc(nowLine(s, ctl))}</span>`;
  $("#btn-back").disabled = !ctl.canBack();
  $("#btn-pause").textContent = s.paused ? "Resume" : "Pause: eyes up";
  $("#btn-pause").classList.toggle("on", s.paused);
  $("#btn-timer").textContent = t.endsAt ? "Pause timer" : t.duration ? "Start timer" : "Set timer";
  $("#btn-next").textContent = nextLabel();
  $("#btn-next").disabled = s.phase === "debrief";
}

// ---------- events ----------
function bindEvents() {
  // One step per tap: Next and Back ignore presses for 1.2 s and while a question is open.
  let stepLock = 0;
  const locked = () => Date.now() < stepLock;
  const lock = (ms = 1200) => { stepLock = Date.now() + ms; };
  $("#btn-next").addEventListener("click", async () => {
    if (locked() || mode !== "active") return;
    lock(60000);
    try {
      let r = ctl.next(false);
      if (r.ask) { if (!(await confirmBox(r.ask))) return; r = ctl.next(true); }
      if (r.ok === false) toast(r.msg, true);
      ui.sel = null; ui.drafts = {}; ui.deskOpen = false;
      if (ctl.s.step === "election") startReveal();
      commit();
    } finally { lock(); }
  });
  $("#btn-back").addEventListener("click", async () => {
    if (locked() || mode !== "active") return;
    lock(60000);
    const ok = await confirmBox("Undo the last step? Choices made since then are lost.", "Undo it");
    lock();
    if (!ok) return;
    const r = ctl.back();
    if (r.ok === false) toast(r.msg, true);
    ui.sel = null; ui.drafts = {};
    commit();
  });
  $("#btn-pause").addEventListener("click", () => { ctl.togglePause(); commit(); });
  $("#btn-timer").addEventListener("click", async () => {
    if (!ctl.s.timer.duration) {
      const v = await modal({ title: "Set the timer", body: `<div class="seg">${[2, 3, 5, 6, 8, 10].map((m) => `<button data-i="x" data-m="${m}" class="tm">${m} min</button>`).join("")}</div>`, actions: [{ label: "Cancel", value: null }],
        onMount: (w, close) => w.querySelectorAll(".tm").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); close(+b.dataset.m); })) });
      if (v) ctl.setTimer(v);
    } else ctl.timerToggle();
    commit();
  });
  $("#btn-plus").addEventListener("click", () => { if (!ctl.s.timer.duration) ctl.setTimer(1, false); else ctl.timerAdd(60); commit(); });
  $("#btn-teacher").addEventListener("click", teacherMenu);
  $("#pause").addEventListener("click", () => { ctl.togglePause(); commit(); });
  $("#panel").addEventListener("click", onPanelClick);
  $("#strip").addEventListener("click", onPanelClick);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.sel) { ui.sel = null; render(); } });
}

let lastTap = { key: "", t: 0 };
async function onPanelClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || mode !== "active") return;
  // Ignore a second tap on the same control within 400 ms (touch boards double fire).
  const key = b.dataset.act + "|" + JSON.stringify(b.dataset);
  if (key === lastTap.key && Date.now() - lastTap.t < 400) return;
  lastTap = { key, t: Date.now() };
  const a = b.dataset.act, s = ctl.s;
  const pid = b.dataset.pid, party = b.dataset.party;
  const v = b.dataset.v;
  switch (a) {
    case "selprov": ui.sel = pid; ui.tab = defaultTab(); render(); return;
    case "closepanel": ui.sel = null; render(); return;
    case "tab": ui.tab = b.dataset.tab; render(); return;
    case "card": act("board", "chooseCard", { pid: ui.sel, card: b.dataset.card, choice: b.dataset.choice }); return;
    case "evt": act("board", "chooseEvent", { pid: ui.sel, choice: b.dataset.choice }); return;
    case "bud": case "plan": budgetAction(ui.drafts[ui.sel], b); renderPanel(); return;
    case "confirmBudget": { const r = act("board", "confirmBudget", { pid: ui.sel, decision: ui.drafts[ui.sel] }); if (r.ok !== false) ui.drafts[ui.sel] = draftFrom(ctl.s, ctl.g, ui.sel); render(); return; }
    case "points": act("board", "reasoning", { pid, points: +v }); return;
    case "reveal": act("board", "reveal"); return;
    case "swapevent": return swapEvent();
    case "swaplocal": return swapLocal(pid);
    case "readcard": return readCard(pid);
    case "override": return overrideDialog(pid);
    case "cmp": { const c = ui.compare || ["goldplain", "lakemoor"]; ui.compare = c.includes(pid) ? c : [c[1], pid]; renderPanel(); return; }
    // trade desk
    case "desk-prov": ui.desk[b.dataset.k] = pid; ui.desk.okA = ui.desk.okB = false; if (b.dataset.k === "a" && ui.sel && ui.sel !== pid) ui.sel = pid; renderPanel(); return;
    case "desk-q": { const side = ui.desk[b.dataset.k]; side[b.dataset.r] = Math.max(0, +v); if (!side[b.dataset.r]) delete side[b.dataset.r]; ui.desk.okA = ui.desk.okB = false; renderPanel(); return; }
    case "desk-ok": {
      ui.desk[b.dataset.k] = !ui.desk[b.dataset.k];
      if (ui.desk.okA && ui.desk.okB) {
        const r = act("board", "deskTrade", { a: ui.desk.a, b: ui.desk.b, give: ui.desk.give, get: ui.desk.get });
        if (r.ok !== false) { toast("Deal done."); ui.desk = { a: ui.desk.a, b: null, give: {}, get: {} }; }
        else { ui.desk.okA = ui.desk.okB = false; }
      }
      render(); return;
    }
    case "offer-accept": act("board", "respondTrade", { id: +b.dataset.id, action: "accept" }); return;
    case "offer-cancel": act("board", "cancelOffer", { id: +b.dataset.id }); return;
    case "undotrade": if (await confirmBox("Undo this trade? Goods and money go back.", "Undo trade")) act("board", "undoTrade", { id: +b.dataset.id }); return;
    case "pledge": act("board", "pledge", { pid, amount: +v }); return;
    // phase 2
    case "members": ui.openParty = party; act("board", "setMembers", { party, pid, count: +v }); return;
    case "leader": ui.openParty = party; act("board", "setLeader", { party, province: ctl.s.p2.leader[party] === pid ? null : pid }); return;
    case "rank-tap": { ui.openParty = party; const dr = (ui.rankDraft[party] ||= []); const i = dr.indexOf(b.dataset.pl); if (i >= 0) dr.splice(i, 1); else dr.push(b.dataset.pl); renderPanel(); return; }
    case "rank-add": ui.openParty = party; act("board", "addRanking", { party, order: ui.rankDraft[party] }); ui.rankDraft[party] = []; render(); return;
    case "rank-reset": ui.openParty = party; if (await confirmBox("Clear all priority rankings for this party?", "Clear")) act("board", "resetRankings", { party }); return;
    case "plev": { ui.openParty = party; const lv = { [b.dataset.k]: b.dataset.k === "bridge" ? v : b.dataset.k === "equalization" ? v === "1" : +v }; act("board", "setLevers", { party, levers: lv }); return; }
    case "promise": ui.openParty = party; act("board", "setPromise", { party, province: ctl.s.p2.promise[party] === pid ? null : pid }); return;
    case "cand": ui.openParty = party; act("board", "setCandidate", { party, province: pid, on: !ctl.s.p2.candidates[party][pid] }); return;
    case "campaign-open": return campaignDialog(party);
    case "debate": { const o = [...(s.p2.debate.order || [])]; if (!o.includes(party)) o.push(party); act("board", "debate", { order: o, bonus: s.p2.debate.bonus }); return; }
    case "debate-clear": act("board", "debate", { order: [], bonus: {} }); return;
    case "debate-bonus": { const bo = { ...(s.p2.debate.bonus || {}) }; bo[party] = bo[party] ? 0 : 1; act("board", "debate", { order: s.p2.debate.order, bonus: bo }); return; }
    case "ballot": act("board", "ballots", { pid, party, count: +v }); return;
    case "voters": act("board", "setVoters", { pid, count: +v }); return;
    case "reveal-all": ui.revealN = Infinity; render(); return;
    case "reveal-start": startReveal(); return;
    case "prview": ui.prView = !ui.prView; renderPanel(); return;
    case "govvote": act("board", "govVote", { party, vote: v }); return;
    case "holdconf": act("board", "holdConfidence"); return;
    case "blev": act("board", "billLevers", { levers: { [b.dataset.k]: b.dataset.k === "bridge" ? v : b.dataset.k === "equalization" ? v === "1" : +v } }); return;
    case "qp": act("board", "qp", { party, score: +v }); return;
    case "amend": act("board", "amend", { party, lever: b.dataset.k || null, dir: +v }); return;
    case "amendvote": act("board", "amendVote", { party, amendParty: b.dataset.amend, vote: ctl.s.p2.bill.amendments.find((x) => x.party === b.dataset.amend).votes[party] === "yes" ? "no" : "yes" }); return;
    case "billvote": act("board", "billVote", { party, vote: v }); return;
    case "classvote": { const cv = { ...ctl.s.p2.bill.classVote, [b.dataset.k]: +v }; act("board", "classVote", cv); return; }
    case "senate": act("board", "senate", { lever: b.dataset.k || null, dir: +v }); return;
  }
}

let revealTimer = null;
function startReveal() {
  clearInterval(revealTimer);
  ui.revealN = 0;
  revealTimer = setInterval(() => {
    ui.revealN++;
    renderMap();
    if (ui.revealN >= d.ridings.length) { clearInterval(revealTimer); render(); }
  }, 250);
  render();
}

async function swapEvent() {
  const evs = d.cards.nationalEvents;
  const body = `<p>Pick the national event for Year ${ctl.s.year}. The default order follows the lesson plan.</p><div class="seg wrap">
    <button class="evpick" data-e="">No event</button>${evs.map((e) => `<button class="evpick ${ctl.s.yc.event === e.id ? "on" : ""}" data-e="${e.id}">${esc(e.title)}</button>`).join("")}</div>`;
  const v = await modal({ title: "Swap the headline card", body, wide: true, actions: [{ label: "Cancel", value: undefined }],
    onMount: (w, close) => w.querySelectorAll(".evpick").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); close(b.dataset.e); })) });
  if (v !== undefined && v !== null) act("board", "swapEvent", { event: v || null });
}

async function swapLocal(pid) {
  const cards = d.cards.localIssues.filter((c) => !c.province || c.province === pid);
  const v = await modal({ title: `Swap ${ctl.pname(pid)}'s local issue`, wide: true, body: `<div class="seg wrap">${cards.map((c) => `<button class="cpick" data-c="${c.id}">${esc(c.title)}</button>`).join("")}</div>`, actions: [{ label: "Cancel", value: null }],
    onMount: (w, close) => w.querySelectorAll(".cpick").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); close(b.dataset.c); })) });
  if (v) act("board", "swapLocal", { pid, card: v });
}

function readCard(pid) {
  const s = ctl.s;
  const c = ctl.g.cards[s.yc.local[pid][0]];
  modal({ title: c.title, wide: true, body: `<div class="readaloud"><p>${esc(c.text)}</p><ol>${c.choices.map((x) => `<li><b>${esc(x.label)}</b><br><span>${esc(x.hint)}</span></li>`).join("")}</ol><p class="small">Talk: ${esc(c.debrief)}</p></div>` });
}

async function overrideDialog(pid) {
  const p = ctl.g.provs[pid];
  const lim = overrideLimits(ctl.g, pid);
  const fields = [["approval", "Approval", approvalTotal(p).toFixed(1)], ["debt", "Debt $B (negative is savings)", p.debt.toFixed(1)], ["unemployment", "Unemployment %", p.unemployment], ["cpi", "CPI", p.cpi.toFixed(1)]];
  if (ctl.s.phase === "p1" && !["headline"].includes(ctl.s.step)) for (const x of GOODS) fields.push([x, `${cap(x)} made this year`, p.prod[x]]);
  for (const f of fields) f[1] += ` (allowed ${lim[f[0]].min} to ${lim[f[0]].max})`;
  const v = await modal({
    title: `Change a number: ${ctl.pname(pid)}`,
    body: `<p class="small">Use this to fix a mistake. Every change is written in the history log.</p>
      <label class="field">Number <select id="ov-f">${fields.map(([k, l, cur]) => `<option value="${k}" data-cur="${cur}">${esc(l)} (now ${cur})</option>`).join("")}</select></label>
      <label class="field">New value <input id="ov-v" type="number" step="0.1" inputmode="decimal"></label>
      <label class="field">Reason <input id="ov-r" maxlength="80" placeholder="for example: slip entered wrong"></label>`,
    actions: [{ label: "Cancel", value: null }, { label: "Change it", primary: true, value: (w) => ({ field: w.querySelector("#ov-f").value, value: w.querySelector("#ov-v").value, reason: w.querySelector("#ov-r").value }) }],
  });
  if (!v || v.value === "") return;
  const f = fields.find((x) => x[0] === v.field);
  const L = lim[v.field];
  const n = Number(v.value);
  if (!isFinite(n) || n < L.min || n > L.max) return toast(`${L.label} must be between ${L.min} and ${L.max}. Nothing changed.`, true);
  if (await confirmBox(`Change ${L.label.toLowerCase()} for ${ctl.pname(pid)} from ${f[2]} to ${n}? This is written in the history log.`, "Change it")) act("board", "override", { pid, ...v });
}

async function campaignDialog(party) {
  const pt = d.parties.find((x) => x.id === party);
  const render = () => {
    const c = ctl.s.p2.campaign[party];
    return `<p>${c.spent} of ${d.election.campaignActionsPerParty} points used. Get out the vote: ${c.gotv}.</p>
      <div class="seg wrap">${d.election.campaignActions.map((a) => `<button class="cact ${cdraft.action === a.id ? "on" : ""}" data-a="${a.id}">${esc(a.name)} (${a.cost})</button>`).join("")}</div>
      <p class="small">${esc(d.election.campaignActions.find((a) => a.id === cdraft.action)?.effect || "Pick an action.")}</p>
      ${cdraft.action === "rally" ? `<div class="seg wrap">${d.provinces.map((p) => `<button class="cprov ${cdraft.province === p.id ? "on" : ""}" data-p="${p.id}">${esc(p.name)}</button>`).join("")}</div>` :
      cdraft.action && cdraft.action !== "gotv" ? `<div class="ridgrid">${d.provinces.map((p) => `<div><b>${esc(p.name)}</b>${d.ridings.filter((r) => r.province === p.id).map((r) => `<button class="crid ${cdraft.ridings.includes(r.id) ? "on" : ""}" data-r="${r.id}">${esc(r.name)} <small>+${c.riding[r.id] || 0}</small></button>`).join("")}</div>`).join("")}</div>` : ""}
      <div class="modal-inline"><button class="btn primary cgo">Do it</button> <button class="btn cundo">Undo last action</button></div>`;
  };
  const cdraft = { action: "door", ridings: [], province: null };
  await modal({ title: `${pt.shortName}: campaign actions`, wide: true, body: `<div id="cbody">${render()}</div>`, actions: [{ label: "Done", primary: true, value: true }],
    onMount: (w) => {
      const body = w.querySelector("#cbody");
      body.addEventListener("click", (e) => {
        e.stopPropagation();
        const t = e.target.closest("button"); if (!t) return;
        if (t.classList.contains("cact")) { cdraft.action = t.dataset.a; cdraft.ridings = []; }
        if (t.classList.contains("cprov")) cdraft.province = t.dataset.p;
        if (t.classList.contains("crid")) { const max = cdraft.action === "flyers" ? 2 : 1; cdraft.ridings = cdraft.ridings.includes(t.dataset.r) ? cdraft.ridings.filter((x) => x !== t.dataset.r) : [...cdraft.ridings, t.dataset.r].slice(-max); }
        if (t.classList.contains("cgo")) { act("board", "campaign", { party, action: cdraft.action, riding: cdraft.ridings[0], ridings: cdraft.ridings, province: cdraft.province }); }
        if (t.classList.contains("cundo")) act("board", "undoCampaign", { party });
        body.innerHTML = render();
      });
    } });
}

async function teacherMenu() {
  if (mode !== "active") return;
  const s = ctl.s;
  const items = [
    ["demo", "Demo mode: open the group view in a new tab (switch provinces at the top)"],
    ["fill", "Fill this step with sample choices"],
    ...(s.phase === "p1" ? [["end1", "End Phase 1 now and go to the review (works at Year-end results)"]] : []),
    ...(s.phase === "launch" || s.phase === "p1" || s.phase === "review" ? [["ffb", "Fast-forward to the bridge crisis with sample choices (stops before the pledges)"]] : []),
    ...(s.phase === "launch" || s.phase === "p1" ? [["ff", "Fast-forward: play the rest of Phase 1 and the bridge with sample choices and go to Phase 2"]] : []),
    ["log", "Open the history log (printable)"],
    ["export", "Export this class save to a file"],
    ["import", "Import a save file"],
    ["switch", "Switch class or start a new class"],
  ];
  const v = await modal({ title: "Teacher tools", wide: true, body: `<div class="menu">${items.map(([k, l]) => `<button class="btn menu-item" data-k="${k}">${esc(l)}</button>`).join("")}</div>
    <p class="small">Class ${esc(s.className)}. Join code ${esc(s.room)}. Saves stay in this browser on this computer. Export a file to move to another computer.</p>`,
    actions: [{ label: "Close", value: null }],
    onMount: (w, close) => w.querySelectorAll(".menu-item").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); close(b.dataset.k); })) });
  if (v === "demo") window.open(`group.html?room=${s.room}&demo=1&as=province:${ui.sel && d.provinces.some((p) => p.id === ui.sel) ? ui.sel : "westhaven"}`, "_blank");
  if (v === "fill") { const r = ctl.fillSample(); toast(r.msg || "Sample choices filled."); commit(); }
  if (v === "ff") {
    if (await confirmBox("Play every remaining Phase 1 step with sample choices? You can press Back to undo one step at a time.", "Fast-forward")) {
      const r = ctl.fastForward("p2"); if (r.ok === false) toast(r.msg, true); ui.sel = null; commit();
    }
  }
  if (v === "end1") {
    if (await confirmBox(`End Phase 1 after Year ${ctl.g.year}? The class goes to the Phase 1 review, then the bridge crisis. Back undoes this.`, "End Phase 1")) {
      const r = ctl.endPhase1(); if (r.ok === false) toast(r.msg, true); ui.sel = null; commit();
    }
  }
  if (v === "ffb") {
    if (await confirmBox("Play to the bridge crisis with sample choices? Back undoes one step at a time.", "Fast-forward")) {
      const r = ctl.fastForward("bridge"); if (r.ok === false) toast(r.msg, true); ui.sel = null; commit();
    }
  }
  if (v === "log") window.open(`log.html?class=${encodeURIComponent(s.className)}`, "_blank");
  if (v === "export") store.exportFile(ctl.saveable());
  if (v === "import") { try { const st = await store.importFile(); if (await confirmBox(`Load ${st.className}? Its save in this browser is replaced.`, "Load it")) start(st); } catch (e) { toast(e.message, true); } }
  if (v === "switch") savePicker(null);
}

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("beforeend", `<p class="fatal">The board could not start: ${esc(e.message)}. Serve this folder from a web server (see README).</p>`); });
