// Run the scripted game with app/js/engine.js and compare with the Python reference engine.
// Usage: node app/tests/parity.mjs   (needs python3 on the path)
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "../js/engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "..", "data", "game-data.json"), "utf8"));
const script = JSON.parse(readFileSync(join(HERE, "parity-script.json"), "utf8"));

function runJs() {
  const g = new Game(data, script.seed);
  for (const yr of script.years) {
    g.begin_year(yr.event);
    g.income();
    if (yr.market) g.trade_market(null, Object.fromEntries(Object.values(g.provs).map((p) => [p.id, p.prev.infrastructure])));
    for (const [a, b, give, get] of yr.deals) g.trade_deal(a, b, give, get);
    for (const [pid, card, ch, isEv] of yr.choices) g.choose(pid, card, ch, isEv);
    for (const [pid, b] of Object.entries(yr.budgets)) {
      const p = g.provs[pid];
      const dec = { ...b };
      dec.system = Math.max(1, Math.min(5, { up: p.system + 1, down: p.system - 1 }[b.system] ?? p.system));
      g.set_budget(pid, dec);
    }
    g.year_end();
  }
  return Object.fromEntries(Object.values(g.provs).map((p) => [p.id, p.history]));
}

const js = runJs();
const py = JSON.parse(execFileSync("python3", [join(HERE, "parity.py")], { encoding: "utf8" }));
const FIELDS = ["gdp", "revenue", "balance", "debt", "cpi", "inflation", "unemployment", "approval", "worldBuy", "trade", "interest", "system"];
let checked = 0, bad = 0;
for (const pid of Object.keys(py)) {
  py[pid].forEach((hp, i) => {
    const hj = js[pid][i];
    const cmp = (label, a, b) => {
      checked++;
      if (typeof a === "number" ? Math.abs(a - b) > 0.11 : JSON.stringify(a) !== JSON.stringify(b)) {
        bad++; console.log(`MISMATCH ${pid} Y${hp.year} ${label}: py=${JSON.stringify(a)} js=${JSON.stringify(b)}`);
      }
    };
    for (const f of FIELDS) cmp(f, hp[f], hj[f]);
    for (const g of Object.keys(hp.groups)) cmp("groups." + g, hp.groups[g], hj.groups[g]);
    for (const g of Object.keys(hp.why)) for (const k of Object.keys(hp.why[g])) cmp(`why.${g}.${k}`, hp.why[g][k], hj.why[g][k]);
    cmp("levels", hp.levels, hj.levels);
    cmp("short", hp.short, hj.short);
  });
}
console.log(`Parity: ${checked} values compared over ${script.years.length} years x 7 provinces, ${bad} mismatches (tolerance 0.11).`);
const last = (h) => h[h.length - 1];
console.log("Year 6 approval  py:", Object.keys(py).map((p) => last(py[p]).approval).join(" "));
console.log("Year 6 approval  js:", Object.keys(js).map((p) => last(js[p]).approval).join(" "));
process.exit(bad ? 1 : 0);
