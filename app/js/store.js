// Class saves in localStorage. Every call is wrapped in try/catch: storage can be
// full, blocked (private mode) or cleared. The game keeps running in memory if so.
// Saves hold game state, counts and choices only. Never student names.

const INDEX = "borealis.saves";
const KEY = (name) => "borealis.save." + name;
const LAST = "borealis.last";

export function listSaves() {
  try { return JSON.parse(localStorage.getItem(INDEX) || "[]"); } catch { return []; }
}

export function loadSave(name) {
  try {
    const raw = localStorage.getItem(KEY(name));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { console.warn("load failed", e); return null; }
}

export function writeSave(state) {
  try {
    const name = state.className;
    localStorage.setItem(KEY(name), JSON.stringify(state));
    const idx = listSaves().filter((s) => s.name !== name);
    idx.unshift({ name, room: state.room, phase: state.phase, year: state.year, step: state.step, savedAt: Date.now() });
    localStorage.setItem(INDEX, JSON.stringify(idx));
    localStorage.setItem(LAST, name);
    return true;
  } catch (e) {
    console.warn("save failed", e);
    return false;
  }
}

export function lastSaveName() {
  try { return localStorage.getItem(LAST); } catch { return null; }
}

export function removeFromIndex(name) {
  // Not a delete of game data: hides the save from the list. Data stays until overwritten.
  try {
    localStorage.setItem(INDEX, JSON.stringify(listSaves().filter((s) => s.name !== name)));
  } catch { /* ignore */ }
}

export function exportFile(state) {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  a.download = `borealis-${state.className}-${d}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function importFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return reject(new Error("No file"));
      const r = new FileReader();
      r.onload = () => {
        try {
          const s = JSON.parse(r.result);
          if (!s || !s.engine || !s.className) throw new Error("This file is not a Borealis save.");
          resolve(s);
        } catch (e) { reject(e); }
      };
      r.readAsText(f);
    };
    input.click();
  });
}
