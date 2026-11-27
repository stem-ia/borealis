// Headless run of the whole unit with sample choices. Usage: node app/tests/controller-smoke.mjs
import { readFileSync } from "node:fs";
import { newState, Controller } from "../js/game.js";
const d = JSON.parse(readFileSync(new URL("../data/game-data.json", import.meta.url)));
const c = new Controller(d, newState(d, "8C", "ABCD"));
let guard = 0;
const seen = [];
while (c.s.phase !== "debrief" && guard++ < 300) {
  c.fillSample();
  if (c.s.step === "government" && c.s.p2.gov.status !== "passed") c.intent("board", "holdConfidence");
  const r = c.next(true);
  if (r.ok === false) { console.log("FAIL", c.s.phase, c.s.step, r.msg); process.exit(1); }
  seen.push(`${c.s.phase}/${c.s.step}${c.s.p2.bill ? "#" + c.s.p2.bill.stage : ""}`);
}
console.log(seen.join(" > "));
console.log("Year 6 approval:", Object.values(c.g.provs).map((p) => p.history[5].approval).join(" "));
console.log("Seats:", JSON.stringify(c.s.p2.election.seats), "gov:", c.s.p2.gov.party, c.s.p2.gov.majority ? "majority" : "minority", c.s.p2.gov.status);
console.log("Bill:", c.s.p2.bill.result, "fell:", c.s.p2.bill.fell);
if (c.s.p2.year7) console.log("Year 7:", JSON.stringify(Object.fromEntries(Object.entries(c.s.p2.year7.rows).map(([k, v]) => [k, [v.delta, v.federal]]))));
console.log("trades:", c.s.log.filter((l) => l.kind === "trade").length / 2, "log:", c.s.log.length, "news:", c.s.news.length, "state KB:", (JSON.stringify(c.saveable()).length / 1024).toFixed(0));
// undo check
const before = JSON.stringify(c.s.engine);
const sm = c.g.provs.saltmarch.history.at(-1);
console.log("saltmarch y7", JSON.stringify(sm.why.workers), sm.balance, sm.revenue, "pledge", c.s.bridge.pledges2.saltmarch, c.s.bridge.outcome);
const st = c.saveable();
for (const k of Object.keys(st)) console.log(k, (JSON.stringify(st[k]).length/1024).toFixed(0));
console.log("effects", c.g.effects.length, (JSON.stringify(c.g.effects).length/1024).toFixed(0), "history", (JSON.stringify(Object.values(c.g.provs).map(p=>p.history)).length/1024).toFixed(0));
