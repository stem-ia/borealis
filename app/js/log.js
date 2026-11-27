// Printable history log for one class save (summative evidence). Read only.
import * as store from "./store.js";
import { loadData, esc, crest, money, signed } from "./ui.js";
import { PHASE_NAMES, STEP_NAMES } from "./game.js";

const $ = (q) => document.querySelector(q);
let d;

async function boot() {
  d = await loadData();
  const saves = store.listSaves();
  const want = new URLSearchParams(location.search).get("class") || saves[0]?.name;
  $("#cls").innerHTML = saves.map((s) => `<option ${s.name === want ? "selected" : ""}>${esc(s.name)}</option>`).join("") || "<option>No saves</option>";
  $("#cls").addEventListener("change", () => show(store.loadSave($("#cls").value)));
  $("#imp").addEventListener("click", async () => { try { show(await store.importFile()); } catch (e) { alert(e.message); } });
  show(want ? store.loadSave(want) : null);
}

function show(s) {
  if (!s) { $("#log").innerHTML = `<p>No saved game found in this browser. Open a save file instead.</p>`; return; }
  const L = d.constants.levelNames;
  const provs = s.engine.provs;
  let h = `<header class="log-head"><span class="kicker">Borealis history log</span><h1>Class ${esc(s.className)}</h1><p>Now at: ${esc(PHASE_NAMES[s.phase])}${STEP_NAMES[s.step] !== PHASE_NAMES[s.phase] ? `, ${esc(STEP_NAMES[s.step])}` : ""}. Printed ${new Date().toLocaleDateString()}.</p></header>`;
  h += `<section class="nat"><h2>Borealis timeline</h2><ul>${s.log.filter((l) => !l.pid && l.kind !== "note").map((l) => `<li><b>${l.phase === "p1" ? "Year " + l.y : esc(PHASE_NAMES[l.phase] || "")}</b> ${esc(l.text)}</li>`).join("")}</ul></section>`;
  for (const pd of d.provinces) {
    const p = provs[pd.id];
    h += `<section class="prov"><h2>${crest(pd.id, 36)} ${esc(pd.name)}</h2>
      <table><thead><tr><th>Year</th><th>Approval</th><th>GDP</th><th>Revenue</th><th>Balance</th><th>Debt</th><th>Unempl.</th><th>CPI</th><th>Tax</th><th>Health</th><th>Educ.</th><th>Infra.</th><th>Social</th><th>System</th><th>Short</th></tr></thead><tbody>
      ${p.history.map((x) => `<tr><td>${x.year}</td><td>${x.approval.toFixed(0)}</td><td>${money(x.gdp, 0)}</td><td>${money(x.revenue, 0)}</td><td>${signed(x.balance)}</td><td>${money(x.debt)}</td><td>${x.unemployment}%</td><td>${x.cpi.toFixed(0)}</td><td>${d.constants.taxRates[x.levels.tax - 1]}%</td><td>${L[x.levels.health - 1]}</td><td>${L[x.levels.education - 1]}</td><td>${L[x.levels.infrastructure - 1]}</td><td>${L[x.levels.social - 1]}</td><td>${esc(d.economicSystems[x.system - 1].name)}</td><td>${x.short.join(", ")}</td></tr>`).join("")}
      </tbody></table>
      <ul class="events">${s.log.filter((l) => l.pid === pd.id && l.kind !== "year-end").map((l) => `<li><b>${l.phase === "p1" ? "Y" + l.y : esc(PHASE_NAMES[l.phase] || "")}</b> ${esc(l.text)}</li>`).join("")}</ul></section>`;
  }
  const p2 = s.p2;
  if (p2?.election) {
    h += `<section class="nat"><h2>Phase 2</h2><p>Seats: ${d.parties.map((p) => `${esc(p.shortName)} ${p2.election.seats[p.id]} (${(100 * p2.election.votes[p.id]).toFixed(0)}% of the vote)`).join(", ")}.</p>
      ${p2.gov ? `<p>Government: ${esc(d.parties.find((p) => p.id === p2.gov.party).shortName)}, ${p2.gov.majority ? "majority" : "minority"}.</p>` : ""}
      ${p2.bill?.result ? `<p>C-1 House vote: ${p2.bill.result.yes} yes, ${p2.bill.result.no} no. Class show of hands: ${p2.bill.classVote.yes} yes, ${p2.bill.classVote.no} no.</p>` : ""}
      ${p2.year7 ? `<p>Federal Year 7: ${p2.year7.money.balance >= 0 ? "surplus" : "deficit"} ${money(Math.abs(p2.year7.money.balance))}.</p>` : ""}</section>`;
  }
  $("#log").innerHTML = h;
}
boot();
