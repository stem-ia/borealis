// Sync adapter. Every network message in the app goes through connect().
// This version uses BroadcastChannel, so it only links tabs in one browser.
// To move to a realtime service (websocket relay, Firebase, Supabase), write a new
// file with the same connect() signature and change the one import in board.js and group.js.
//
// connect(room, role, id) -> { send(msg), onMessage(cb), onStatus(cb), status, close() }
//   room: 4-letter room code. role: "board" | "group". id: "board" or "province:<id>" / "party:<id>".
//   send(msg): msg is a plain JSON object. The adapter adds { from, room, t }.
//   onMessage(cb): cb(msg) for every message from another endpoint in the room.
//   status: "open" | "closed" | "unsupported".
// Message protocol is documented in app/README.md.

export function connect(room, role, id) {
  const listeners = [];
  const statusListeners = [];
  const api = {
    status: "closed",
    send(msg) {
      if (!chan) return false;
      try {
        chan.postMessage({ ...msg, from: id, role, room, t: Date.now() });
        return true;
      } catch (e) {
        console.warn("sync send failed", e);
        return false;
      }
    },
    onMessage(cb) { listeners.push(cb); },
    onStatus(cb) { statusListeners.push(cb); cb(api.status); },
    close() { if (chan) chan.close(); chan = null; setStatus("closed"); },
  };
  function setStatus(s) { api.status = s; statusListeners.forEach((cb) => cb(s)); }
  let chan = null;
  if (typeof BroadcastChannel === "undefined") {
    setStatus("unsupported");
    return api;
  }
  chan = new BroadcastChannel("borealis:" + String(room).toUpperCase());
  chan.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.from === id) return;
    listeners.forEach((cb) => { try { cb(msg); } catch (e) { console.error(e); } });
  };
  setStatus("open");
  return api;
}
