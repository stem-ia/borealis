// Shared UI helpers: escaping, icons, crests, numbers, modal and toast.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ICONS = {
  energy: '<path d="M13.6 1.8 4.2 13.4c-.4.5 0 1.2.6 1.2h5.6l-1.6 7.1c-.1.7.7 1.1 1.2.6l9.4-11.6c.4-.5 0-1.2-.6-1.2h-5.6l1.6-7.1c.1-.7-.7-1.1-1.2-.6Z"/>',
  food: '<path d="M11.2 22.5V7h1.6v15.5z"/><ellipse cx="12" cy="4.2" rx="1.7" ry="2.9"/><ellipse cx="9.2" cy="8.6" rx="1.6" ry="2.8" transform="rotate(-38 9.2 8.6)"/><ellipse cx="14.8" cy="8.6" rx="1.6" ry="2.8" transform="rotate(38 14.8 8.6)"/><ellipse cx="9.2" cy="12.8" rx="1.6" ry="2.8" transform="rotate(-38 9.2 12.8)"/><ellipse cx="14.8" cy="12.8" rx="1.6" ry="2.8" transform="rotate(38 14.8 12.8)"/><ellipse cx="9.2" cy="17" rx="1.6" ry="2.8" transform="rotate(-38 9.2 17)"/><ellipse cx="14.8" cy="17" rx="1.6" ry="2.8" transform="rotate(38 14.8 17)"/>',
  materials: '<path d="M3.6 15h7.2l1 6H2.6zM13.2 15h7.2l1 6h-9.2zM8.4 6.5h7.2l1 6H7.4z"/>',
  money: '<path fill-rule="evenodd" d="M12 1.8a10.2 10.2 0 1 1 0 20.4 10.2 10.2 0 0 1 0-20.4Zm0 2.3a7.9 7.9 0 1 0 0 15.8 7.9 7.9 0 0 0 0-15.8Z"/><path d="M12 5.6l1.6 4.8 4.8 1.6-4.8 1.6-1.6 4.8-1.6-4.8-4.8-1.6 4.8-1.6z"/>',
};
export const RES_NAMES = { energy: "Energy", food: "Food", materials: "Materials", money: "Money" };
export function icon(res, size = "1.2em") {
  return `<svg class="ico ico-${res}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${ICONS[res]}</svg>`;
}
export function resChip(res, text) {
  return `<span class="res res-${res}">${icon(res)}<span>${esc(text)}</span></span>`;
}

// Province crests: flat, two colours, from map/visual-system.md. No real symbols.
const CREST = {
  westhaven: '<path d="M6 34 16 18l6 9 6-12 14 19z" fill="#fff" opacity=".9"/><path d="M24 8l-6 12h3l-5 9h4l-4 7h16l-4-7h4l-5-9h3z" fill="S"/><path d="M8 40q4-3 8 0t8 0 8 0 8 0M8 45q4-3 8 0t8 0 8 0 8 0" stroke="S" stroke-width="2" fill="none"/>',
  ridgeland: '<path d="M10 30a14 14 0 0 1 28 0z" fill="S" opacity=".55"/><path d="M4 42h40v-6H34v-5H22v-4H12v4H4z" fill="S"/>',
  goldplain: '<path d="M4 40h40" stroke="S" stroke-width="3"/><g fill="S"><path d="M23 38V12h2v26z"/><path d="M24 8c3 4 3 8 0 11-3-3-3-7 0-11z"/><path d="M14 38l6-22 2 .6-6 21.4z"/><path d="M19 12c3 3 3 7 1 10-3-2-4-6-1-10z"/><path d="M34 38l-6-22-2 .6 6 21.4z"/><path d="M29 12c-3 3-3 7-1 10 3-2 4-6 1-10z"/></g>',
  lakemoor: '<circle cx="24" cy="21" r="9" fill="none" stroke="S" stroke-width="5" stroke-dasharray="4 3"/><circle cx="24" cy="21" r="5" fill="none" stroke="S" stroke-width="2.5"/><path d="M6 37q4.5-4 9 0t9 0 9 0 9 0M6 43q4.5-4 9 0t9 0 9 0 9 0" stroke="S" stroke-width="2.4" fill="none"/>',
  valcourt: '<path d="M24 4l1.8 4.6 4.8.2-3.8 3 1.4 4.7L24 13.8l-4.2 2.7 1.4-4.7-3.8-3 4.8-.2z" fill="S"/><path d="M4 42V24h40v18h-6v-7a5 5 0 0 0-10 0v7h-8v-7a5 5 0 0 0-10 0v7z" fill="S"/>',
  saltmarch: '<g stroke="S" stroke-width="3" fill="none" stroke-linecap="round"><circle cx="24" cy="9" r="3.5"/><path d="M24 13v28M16 19h16M10 31q2 10 14 10t14-10"/></g><path d="M30 22q8 3 4 10-3 4-8 2 5-2 4-6-1-3-5-3z" fill="S" opacity=".75"/>',
  northreach: '<path d="M24 3l2.5 8.5L35 9l-6 6.5 8 2.5-8 2.5 6 6.5-8.5-2.5L24 33l-2.5-8.5L13 27l6-6.5-8-2.5 8-2.5L13 9l8.5 2.5z" fill="S"/><path d="M3 44l8-8 5 4 7-9 6 7 5-5 11 11z" fill="S" opacity=".7"/>',
};
export function crest(pid, size = 40) {
  const s = `var(--prov-${pid}-strong)`;
  return `<svg class="crest" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><rect x="1" y="1" width="46" height="46" rx="8" fill="var(--prov-${pid})" stroke="${s}" stroke-width="2"/>${CREST[pid].replaceAll('"S"', `"${s}"`)}</svg>`;
}
export function partyMark(id, size = 36) {
  return `<svg class="crest" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><rect x="1" y="1" width="46" height="46" rx="24" fill="var(--party-${id})"/><text x="24" y="31" text-anchor="middle" font-size="20" font-weight="700" fill="${id === "cornerstone" ? "#2B2520" : "#fff"}" font-family="var(--font-display)">${{ cornerstone: "C", forward: "F", commongood: "CG", evergreen: "E" }[id]}</text></svg>`;
}

export const money = (v, nd = 1) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(nd)}B`;
export const signed = (v, nd = 1) => { const r = Number(v.toFixed(nd)); return (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r).toFixed(nd); };
export const num = (v, nd = 0) => Number(v).toFixed(nd);

export function deltaChip(v) {
  if (v === undefined || v === null) return "";
  const cls = v > 0.05 ? "up" : v < -0.05 ? "down" : "flat";
  const arrow = cls === "up" ? "▲" : cls === "down" ? "▼" : "•";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(v).toFixed(1)}</span>`;
}

// ---------- modal and toast ----------
export function modal({ title, body, actions = [{ label: "OK", value: true, primary: true }], wide = false, onMount }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2><div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.primary ? "primary" : ""} ${a.danger ? "danger" : ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div></div>`;
    document.body.appendChild(wrap);
    const close = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) { const a = actions[+b.dataset.i]; close(typeof a.value === "function" ? a.value(wrap) : a.value); }
      else if (e.target === wrap) close(null);
    });
    if (onMount) onMount(wrap, close);
    const f = wrap.querySelector("input,select,button.primary");
    if (f) setTimeout(() => f.focus(), 30);
  });
}
export const confirmBox = (text, yes = "Continue", no = "Go back") =>
  modal({ title: "Check first", body: `<p>${esc(text)}</p>`, actions: [{ label: no, value: false }, { label: yes, value: true, primary: true }] });

let toastTimer;
export function toast(msg, bad = false) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 3200);
}

export async function loadData() {
  const r = await fetch("data/game-data.json");
  return r.json();
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
