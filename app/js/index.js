// Start page: teacher opens the board; groups join with a room code and a province or party.
import { loadData, crest, partyMark, esc, toast } from "./ui.js";

const $ = (q) => document.querySelector(q);
let pick = null;

loadData().then((d) => {
  $("#provs").innerHTML = d.provinces.map((p) => `<button type="button" class="pchip big" data-as="province:${p.id}" style="--pc: var(--prov-${p.id}-strong)">${crest(p.id, 28)} ${esc(p.name)}</button>`).join("");
  $("#parties").innerHTML = d.parties.map((p) => `<button type="button" class="pchip big" data-as="party:${p.id}" style="--pc: var(--party-${p.id})">${partyMark(p.id, 28)} ${esc(p.shortName)}</button>`).join("");
});
const params = new URLSearchParams(location.search);
if (params.get("room")) { $("#join").hidden = false; $("#room").value = params.get("room").toUpperCase(); }
$("#join-open").addEventListener("click", () => { $("#join").hidden = false; $("#room").focus(); });
$("#join").addEventListener("click", (e) => {
  const b = e.target.closest("[data-as]");
  if (!b) return;
  pick = b.dataset.as;
  document.querySelectorAll("[data-as]").forEach((x) => x.classList.toggle("on", x === b));
});
$("#join").addEventListener("submit", (e) => {
  e.preventDefault();
  const room = $("#room").value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (room.length !== 4) return toast("The room code has 4 letters.", true);
  if (!pick) return toast("Pick your province or party.", true);
  location.href = `group.html?room=${room}&as=${pick}`;
});
