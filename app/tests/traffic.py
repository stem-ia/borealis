"""Sync traffic check (playtest issue B2). Serve app/ on port 8765 first.

Board plus 7 group pages in one browser. A listener tab counts every message on the
room channel. Reports bytes and full re-renders while the class is idle for 10 s,
then the size of one change (a card choice), and checks that an open riding list
on a party page stays open through updates.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:8765"
PIDS = ["westhaven", "ridgeland", "goldplain", "lakemoor", "valcourt", "saltmarch", "northreach"]
LISTEN = """(room) => { window.__msgs = []; const c = new BroadcastChannel('borealis:' + room);
  c.onmessage = (e) => window.__msgs.push({ type: e.data.type, n: JSON.stringify(e.data).length }); }"""


async def main():
    ok = True
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1920, "height": 1080})
        board = await ctx.new_page()
        await board.goto(f"{BASE}/board.html"); await board.evaluate("localStorage.clear()"); await board.goto(f"{BASE}/board.html")
        await board.fill("#newname", "TR"); await board.click("text=Start a new game")
        room = (await board.inner_text(".joinbox .code")).strip()
        groups = []
        for pid in PIDS:
            g = await ctx.new_page(); await g.set_viewport_size({"width": 390, "height": 844})
            await g.goto(f"{BASE}/group.html?room={room}&as=province:{pid}"); await g.wait_for_selector(".g-head")
            groups.append(g)
        lis = await ctx.new_page(); await lis.goto(f"{BASE}/index.html"); await lis.evaluate(LISTEN, room)
        for _ in range(3):
            await board.click("#btn-next"); await board.wait_for_timeout(1400)
        await board.wait_for_timeout(1500)
        await lis.evaluate("window.__msgs = []")
        await groups[0].evaluate("window.__n = 0; new MutationObserver(() => window.__n++).observe(document.getElementById('g'), { childList: true })")
        await board.wait_for_timeout(10000)
        msgs = await lis.evaluate("window.__msgs")
        n = await groups[0].evaluate("window.__n")
        by = {}
        for m in msgs:
            by.setdefault(m["type"], [0, 0]); by[m["type"]][0] += 1; by[m["type"]][1] += m["n"]
        total = sum(m["n"] for m in msgs)
        print(f"Idle 10 s, 7 devices: {len(msgs)} messages, {total} bytes ({json.dumps(by)}). Full re-renders on one phone: {n}.")
        idle_ok = total < 10000 and not any(m["type"] in ("state", "patch") for m in msgs)
        print(("PASS" if idle_ok else "FAIL") + " idle class sends almost nothing")
        ok &= idle_ok
        # One change: Westhaven trades (trade step), then measure the patch
        await lis.evaluate("window.__msgs = []")
        w = groups[0]
        await w.click("[data-act='tto'][data-pid='goldplain']")
        await w.click("[data-act='tq'][data-k='give'][data-r='materials'] >> nth=-1")
        await w.click("[data-act='tq'][data-k='get'][data-r='food'] >> nth=-1")
        await w.click("[data-act='propose']"); await w.wait_for_timeout(800)
        msgs = await lis.evaluate("window.__msgs")
        patch = [m for m in msgs if m["type"] == "patch"]
        full = [m for m in msgs if m["type"] == "state"]
        print(f"One offer: {len(patch)} patch ({sum(m['n'] for m in patch)} bytes), {len(full)} full states.")
        ok &= len(full) == 0 and len(patch) >= 1
        # Open UI survives updates: open a details list on a party page during Campaign
        await board.click("#btn-teacher"); await board.click(".menu-item[data-k='ff']")
        await board.click(".modal-wrap button:has-text('Fast-forward')"); await board.wait_for_timeout(800)
        party = await ctx.new_page(); await party.set_viewport_size({"width": 390, "height": 844})
        await party.goto(f"{BASE}/group.html?room={room}&as=party:forward"); await party.wait_for_selector(".g-head")
        await board.click("#btn-teacher"); await board.click(".menu-item[data-k='fill']"); await board.wait_for_timeout(400)
        await board.click("#btn-next"); await board.wait_for_timeout(1400)
        await board.click("#btn-teacher"); await board.click(".menu-item[data-k='fill']"); await board.wait_for_timeout(400)
        await board.click("#btn-next"); await board.wait_for_timeout(1400)  # campaign
        await party.click("details.ridings >> nth=3 >> summary")
        await party.wait_for_timeout(200)
        # Other parties act from the board: every action sends a patch to all pages
        for _ in range(3):
            await board.click(".camp button >> nth=0"); await board.wait_for_timeout(300)
            await board.click(".modal-wrap .crid >> nth=0"); await board.click(".modal-wrap .cgo"); await board.wait_for_timeout(300)
            await board.click(".modal-wrap button:has-text('Done')"); await board.wait_for_timeout(300)
        await party.wait_for_timeout(2500)
        still = await party.evaluate("document.querySelectorAll('details.ridings')[3].open")
        print(("PASS" if still else "FAIL") + " campaign riding list stays open through updates")
        ok &= bool(still)
        await party.click("details.ridings >> nth=3 >> [data-act='crid'] >> nth=0"); await party.click("[data-act='cgo']"); await party.wait_for_timeout(500)
        st = await board.evaluate("JSON.parse(localStorage.getItem('borealis.save.TR')).p2.campaign.forward.spent")
        print(("PASS" if st >= 1 else "FAIL") + f" door knocking works on a party phone (spent {st})")
        ok &= st >= 1
        await br.close()
    sys.exit(0 if ok else 1)

asyncio.run(main())
