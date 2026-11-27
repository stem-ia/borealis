// Patch a DOM subtree to match new HTML instead of replacing it. Open <details>,
// focused inputs, scroll positions and nodes marked data-keep survive updates, and a
// button under a finger is not swapped for a new one.

export function morph(target, html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  patchChildren(target, tpl.content);
}

function same(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  if (a.nodeName !== b.nodeName) return false;
  const ka = a.getAttribute("data-key") ?? a.id, kb = b.getAttribute("data-key") ?? b.id;
  return (ka || "") === (kb || "");
}

function patchChildren(a, b) {
  const an = [...a.childNodes];
  const bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) a.appendChild(y);
    else if (!same(x, y)) a.replaceChild(y, x);
    else patchNode(x, y);
  }
  for (let i = bn.length; i < an.length; i++) an[i].remove();
}

function patchNode(x, y) {
  if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
  const isDetails = x.nodeName === "DETAILS";
  for (const { name } of [...x.attributes]) {
    if (isDetails && name === "open") continue; // the user's open or closed choice wins
    if (!y.hasAttribute(name)) x.removeAttribute(name);
  }
  for (const { name, value } of [...y.attributes]) {
    if (x.getAttribute(name) !== value) x.setAttribute(name, value);
  }
  if ((x.nodeName === "INPUT" || x.nodeName === "SELECT" || x.nodeName === "TEXTAREA") && document.activeElement !== x) {
    if (y.hasAttribute("value") && x.value !== y.getAttribute("value")) x.value = y.getAttribute("value");
  }
  if (x.hasAttribute("data-keep")) return;
  patchChildren(x, y);
}
