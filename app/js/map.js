// The Borealis map: inlines map/borealis-map.svg and drives its states
// (selection, trade routes, approval badges, riding seats, party colours).
// Layer and class names follow map/visual-system.md.

const NS = "http://www.w3.org/2000/svg";
const PARTY_HATCH = { commongood: 1, cornerstone: 2, forward: 3, evergreen: 4 };
// The map designer left the Great Narrows Bridge to the app. It sits on the
// Goldplain and Lakemoor border where the lakes narrow.
const BRIDGE_AT = { x: 783, y: 662 };

let svgCache = null;

export async function loadMap(container, { thumb = false, onSelect = () => {} } = {}) {
  if (!svgCache) svgCache = await (await fetch("map/borealis-map.svg")).text();
  container.innerHTML = svgCache.replace(/^<\?xml[^>]*>/, "");
  const svg = container.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (thumb) svg.classList.add("bm-thumb");
  const overlay = svg.querySelector("#overlay");
  const badges = svg.querySelector("#badges");
  const anchors = {};
  svg.querySelectorAll("#anchors .anchor").forEach((c) => (anchors[c.dataset.province] = { x: +c.getAttribute("cx"), y: +c.getAttribute("cy") }));
  const selLayer = el("g", { class: "sel-layer" }); overlay.appendChild(selLayer);
  const hatchLayer = el("g", { class: "hatch-layer" }); overlay.appendChild(hatchLayer);
  const routeLayer = el("g", { class: "route-layer" }); overlay.appendChild(routeLayer);
  const markLayer = el("g", { class: "mark-layer" }); overlay.appendChild(markLayer);
  let selected = null;

  svg.querySelectorAll(".bm-prov").forEach((p) => {
    const pid = p.dataset.province;
    if (!thumb) {
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", pid.charAt(0).toUpperCase() + pid.slice(1));
      p.addEventListener("pointerdown", () => p.classList.add("is-pressed"));
      p.addEventListener("pointerleave", () => p.classList.remove("is-pressed"));
      p.addEventListener("pointerup", () => { p.classList.remove("is-pressed"); onSelect(pid); });
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(pid); } });
    }
  });
  if (!thumb) svg.querySelector("#ocean")?.parentNode && svg.addEventListener("pointerup", (e) => { if (!e.target.closest(".bm-prov")) onSelect(null); });

  const api = {
    svg, anchors,
    select(pid) {
      if (pid === selected) return;
      selected = pid;
      selLayer.innerHTML = "";
      svg.querySelectorAll(".bm-prov.is-selected").forEach((x) => x.classList.remove("is-selected"));
      svg.classList.toggle("has-selection", !!pid);
      if (!pid) return;
      svg.querySelector(`#prov-${pid}`).classList.add("is-selected");
      // Copies of the path, not <use>: a <use> clone keeps the #prov-id fill rule and hides the terrain.
      selLayer.appendChild(shape(pid, { class: "bm-select-halo" }));
      selLayer.appendChild(shape(pid, { class: "bm-select" }));
    },
    highlight(pid) { // used on phones: own province stays bright
      svg.classList.toggle("has-selection", !!pid);
      svg.querySelectorAll(".bm-prov").forEach((x) => x.classList.toggle("is-selected", x.dataset.province === pid));
    },
    // routes: [{ id, a, b, res, qty, pending, fresh }]
    setRoutes(routes) {
      const keep = new Set(routes.map((r) => String(r.id)));
      routeLayer.querySelectorAll("[data-route]").forEach((g) => { if (!keep.has(g.dataset.route)) g.remove(); });
      for (const r of routes) {
        let g = routeLayer.querySelector(`[data-route="${r.id}"]`);
        if (g && g.dataset.pending === String(!!r.pending)) continue;
        if (g) g.remove();
        g = drawRoute(r);
        routeLayer.appendChild(g);
      }
    },
    // badges: { pid: { text, sub, cls } }
    setBadges(map) {
      badges.innerHTML = "";
      for (const [pid, b] of Object.entries(map)) {
        const a = anchors[pid]; if (!a || !b) continue;
        const g = el("g", { class: "bm-badge " + (b.cls || ""), transform: `translate(${a.x},${a.y - 30})` });
        const w = 22 + 13 * String(b.text).length + (b.sub ? 10 * b.sub.length : 0);
        g.appendChild(el("rect", { x: -w / 2, y: -19, width: w, height: 36, rx: 18 }));
        const t = el("text", { x: b.sub ? -w / 2 + 14 : 0, y: 7, "text-anchor": b.sub ? "start" : "middle" });
        t.textContent = b.text;
        g.appendChild(t);
        if (b.sub) { const s = el("text", { x: w / 2 - 12, y: 6, "text-anchor": "end", class: "sub" }); s.textContent = b.sub; g.appendChild(s); }
        if (b.alert) {
          const aw = 16 + 9 * b.alert.length;
          const ag = el("g", { class: "bm-alert", transform: "translate(0,32)" });
          ag.appendChild(el("rect", { x: -aw / 2, y: -13, width: aw, height: 24, rx: 12 }));
          const at = el("text", { x: 0, y: 4, "text-anchor": "middle" }); at.textContent = b.alert;
          ag.appendChild(at); g.appendChild(ag);
        }
        badges.appendChild(g);
      }
    },
    showRidings(on) { const r = svg.querySelector("#ridings"); if (r) r.style.display = on ? "" : "none"; },
    fillSeats(winners, upto = Infinity, order = null) {
      const seats = [...svg.querySelectorAll("#ridings .seat")];
      const ids = order || seats.map((s) => s.dataset.riding);
      const shown = new Set(ids.slice(0, upto));
      for (const s of seats) {
        const w = winners?.[s.dataset.riding];
        s.style.fill = w && shown.has(s.dataset.riding) ? `var(--party-${w})` : "";
      }
    },
    // fills: { pid: partyId | null } ; null clears
    partyFill(fills) {
      hatchLayer.innerHTML = "";
      svg.querySelectorAll(".bm-prov").forEach((p) => {
        const party = fills ? fills[p.dataset.province] : undefined;
        p.style.fill = party ? `var(--party-${party}-tint)` : party === null && fills ? "var(--party-none)" : "";
        if (party) hatchLayer.appendChild(shape(p.dataset.province, { style: `fill: url(#bm-hatch-${PARTY_HATCH[party]}); opacity: .35` }));
      });
    },
    alerts(list) { // [{pid}] scarcity alert rings
      markLayer.querySelectorAll(".bm-alert-ring").forEach((x) => x.remove());
      for (const a of list) markLayer.appendChild(shape(a, { class: "bm-alert-ring" }));
    },
    bridge(state) { // null | "closed" | "open"
      markLayer.querySelectorAll(".bm-bridge").forEach((x) => x.remove());
      if (!state) return;
      const g = el("g", { class: "bm-bridge " + state, transform: `translate(${BRIDGE_AT.x},${BRIDGE_AT.y})` });
      g.appendChild(el("rect", { x: -26, y: -9, width: 52, height: 18, rx: 3 }));
      g.appendChild(el("path", { d: "M-22 5 Q-11 -8 0 5 Q11 -8 22 5", class: "arch" }));
      if (state === "closed") g.appendChild(el("path", { d: "M-8 -14 L8 14 M8 -14 L-8 14", class: "x" }));
      const t = el("text", { x: 0, y: -16, "text-anchor": "middle" });
      t.textContent = state === "closed" ? "Great Narrows Bridge: closed" : "Great Narrows Bridge";
      g.appendChild(t);
      markLayer.appendChild(g);
    },
  };

  function shape(pid, attrs) {
    const src = svg.querySelector(`#prov-${pid}`);
    return el("path", { d: src.getAttribute("d"), "fill-rule": "evenodd", ...attrs });
  }

  function drawRoute(r) {
    const a = anchors[r.a], b = anchors[r.b];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const cx = mx, cy = my - 0.18 * len; // bow north
    const d = `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
    const g = el("g", { "data-route": r.id, "data-pending": String(!!r.pending), class: "route-g" });
    g.appendChild(el("path", { d, class: "bm-route-halo" }));
    const w = Math.min(9, 3 + (r.qty || 1) * 0.6);
    const path = el("path", { d, class: "bm-route" + (r.pending ? " is-pending" : "") + (r.fresh ? " is-fresh" : ""), style: `--route: var(--res-${r.res}); stroke-width:${w}` });
    g.appendChild(path);
    const px = 0.25 * a.x + 0.5 * cx + 0.25 * b.x, py = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
    const chip = el("g", { class: "route-chip", transform: `translate(${px},${py})` });
    chip.appendChild(el("circle", { r: 15, style: `fill: var(--res-${r.res}-tint); stroke: var(--res-${r.res})` }));
    const t = el("text", { y: 6, "text-anchor": "middle" }); t.textContent = r.qty ?? "";
    chip.appendChild(t);
    g.appendChild(chip);
    return g;
  }
  return api;
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, v);
  return e;
}
