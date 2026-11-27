"""Checks for the playtest fixes (M1 to M10, M6, M7). Serve app/ on port 8765 first.
Usage: python3 app/tests/robustness.py
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:8765"
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail else ""))


async def state(b, cls):
    return await b.evaluate(f"JSON.parse(localStorage.getItem('borealis.save.{cls}'))")


async def main():
    errors = []
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1920, "height": 1080}, has_touch=True)
        b = await ctx.new_page()
        b.on("pageerror", lambda e: errors.append(str(e)))
        await b.goto(f"{BASE}/board.html"); await b.evaluate("localStorage.clear()"); await b.goto(f"{BASE}/board.html")
        await b.fill("#newname", "RB"); await b.click("text=Start a new game")
        room = (await b.inner_text(".joinbox .code")).strip()

        # M1: a double tap on Next moves one step
        await b.dblclick("#btn-next"); await b.wait_for_timeout(1400)
        st = await state(b, "RB")
        check("M1 double tap on Next runs one step", st["step"] == "headline" and st["year"] == 1, f"{st['phase']}/{st['step']}")

        # M9: two phones on one province
        g1 = await ctx.new_page(); await g1.set_viewport_size({"width": 360, "height": 740})
        g1.on("pageerror", lambda e: errors.append(str(e)))
        await g1.goto(f"{BASE}/group.html?room={room}&as=province:westhaven"); await g1.wait_for_selector(".g-head")
        await g1.wait_for_timeout(500)
        g2 = await ctx.new_page(); await g2.set_viewport_size({"width": 360, "height": 740})
        await g2.goto(f"{BASE}/group.html?room={room}&as=province:westhaven"); await g2.wait_for_selector(".g-head")
        await g2.wait_for_timeout(1200)
        check("M9 second device on a province is told to take over", await g2.locator("[data-act='takeover']").count() == 1)
        await b.wait_for_timeout(500)
        top = await b.inner_text(".devs")
        check("M9 board shows the duplicate", "extra" in top, top.replace("\n", " "))
        await b.click("#btn-next"); await b.wait_for_timeout(1400)  # income
        await b.click("#btn-next"); await b.wait_for_timeout(1400)  # trade

        # M8: trade steppers at 360 px are at least 44 px wide
        await g1.click("[data-act='tto'][data-pid='goldplain']")
        w = await g1.evaluate("Math.min(...[...document.querySelectorAll('.trow .step')].map(e => e.getBoundingClientRect().width))")
        check("M8 trade steppers at 360 px are 44 px or wider", w >= 44, f"{w:.0f} px")

        # M10: double tap on Send offer sends one offer
        await g1.click("[data-act='tq'][data-k='give'][data-r='materials'] >> nth=-1")
        await g1.click("[data-act='tq'][data-k='get'][data-r='food'] >> nth=-1")
        await g1.dblclick("[data-act='propose']"); await g1.wait_for_timeout(800)
        st = await state(b, "RB")
        check("M10 double tap on Send offer sends one offer", len([o for o in st["offers"] if o["from"] == "westhaven"]) == 1, str(len(st["offers"])))

        # M9: the blocked phone cannot act; take over works
        await g2.click("[data-act='takeover']"); await g2.wait_for_timeout(800)
        await g1.wait_for_timeout(800)
        check("M9 take over moves control to the new phone", await g2.locator("[data-act='takeover']").count() == 0 and await g1.locator("[data-act='takeover']").count() == 1)

        # M3: Change a number refuses silly values
        await b.click("[data-act='selprov'] >> nth=0") if await b.locator(".prow").count() else None
        await b.locator("#prov-saltmarch").dispatch_event("pointerup"); await b.wait_for_timeout(200)
        await b.click("[data-act='tab'][data-tab='overview']")
        await b.click("[data-act='override']")
        await b.select_option("#ov-f", "debt"); await b.fill("#ov-v", "99999"); await b.fill("#ov-r", "typo")
        await b.click(".modal-wrap button:has-text('Change it')"); await b.wait_for_timeout(300)
        st = await state(b, "RB")
        check("M3 debt 99999 is refused", st["engine"]["provs"]["saltmarch"]["debt"] < 100, str(st["engine"]["provs"]["saltmarch"]["debt"]))
        await b.click("[data-act='override']")
        await b.select_option("#ov-f", "cpi"); await b.fill("#ov-v", "-50"); await b.fill("#ov-r", "typo")
        await b.click(".modal-wrap button:has-text('Change it')"); await b.wait_for_timeout(300)
        st = await state(b, "RB")
        check("M3 CPI -50 is refused", st["engine"]["provs"]["saltmarch"]["cpi"] > 90)
        await b.click("[data-act='closepanel']")

        # M6: three questions on the phone budget and the board results
        await b.click("#btn-next"); await b.wait_for_timeout(1300)
        dlg = b.locator(".modal-wrap button:has-text('Continue')")
        if await dlg.count(): await dlg.first.click()
        await b.wait_for_timeout(1300)
        await b.click("#btn-teacher"); await b.click(".menu-item[data-k='fill']"); await b.wait_for_timeout(300)
        await b.click("#btn-next"); await b.wait_for_timeout(1300)  # budget
        txt = await g2.inner_text("main")
        check("M6 phone budget shows what, how, for whom", "What to produce?" in txt and "For whom?" in txt)
        await b.click("#btn-teacher"); await b.click(".menu-item[data-k='fill']"); await b.wait_for_timeout(300)
        await b.click("#btn-next"); await b.wait_for_timeout(1300)  # results
        dlg = b.locator(".modal-wrap button:has-text('Continue')")
        if await dlg.count(): await dlg.first.click(); await b.wait_for_timeout(1300)
        check("M6 board results show the three questions", "What to produce?" in await b.inner_text("#panel"))
        await b.screenshot(path="/home/claude/econ-sim/review/build-shots/c01-board-results-three-questions.png")
        await g2.screenshot(path="/home/claude/econ-sim/review/build-shots/c01-group-results-three-questions.png", full_page=True)

        # M7: end Phase 1 after Year 1
        await b.click("#btn-teacher"); await b.click(".menu-item[data-k='end1']")
        await b.click(".modal-wrap button:has-text('End Phase 1')"); await b.wait_for_timeout(500)
        st = await state(b, "RB")
        check("M7 End Phase 1 after Year 1 goes to the review", st["phase"] == "review", st["phase"])
        await b.wait_for_timeout(900)
        await b.click("#btn-next"); await b.wait_for_timeout(1300)  # crisis
        await b.click("#btn-next"); await b.wait_for_timeout(1300)  # pledge1

        # M5: the bridge is buildable when everyone gives the most
        caps = await b.evaluate("""async () => { const G = await import('./js/game.js'); const E = await import('./js/engine.js');
            const d = await (await fetch('data/game-data.json')).json(); const s = JSON.parse(localStorage.getItem('borealis.save.RB'));
            const g = E.Game.fromJSON(d, s.engine); return G.pledgeCapTotal(g); }""")
        check("M5 the most Borealis can pledge is above the $60B cost", caps >= 60, f"${caps}B after Year 1")
        check("M5 board shows what Borealis can raise", "Most Borealis can raise" in await b.inner_text("#panel"))
        await b.screenshot(path="/home/claude/econ-sim/review/build-shots/c02-board-pledge-capacity.png")

        # M4: ballots capped per riding
        await b.click("#btn-teacher"); await b.click(".menu-item[data-k='fill']"); await b.wait_for_timeout(300)
        for _ in range(3):
            await b.click("#btn-next"); await b.wait_for_timeout(1300)
        st = await state(b, "RB")
        while st["step"] != "vote":
            await b.click("#btn-teacher"); await b.click(".menu-item[data-k='fill']"); await b.wait_for_timeout(300)
            await b.click("#btn-next"); await b.wait_for_timeout(1300)
            st = await state(b, "RB")
        v = await ctx.new_page(); await v.set_viewport_size({"width": 360, "height": 740})
        await v.goto(f"{BASE}/group.html?room={room}&as=province:saltmarch"); await v.wait_for_selector(".g-head"); await v.wait_for_timeout(600)
        for _ in range(8):
            if await v.locator("[data-act='cast']").count() == 0: break
            await v.click("[data-act='ballot'][data-v='cornerstone']"); await v.click("[data-act='cast']"); await v.wait_for_timeout(500)
        st = await state(b, "RB")
        cast = sum(st["p2"]["ballots"]["saltmarch"].values())
        cap = st["p2"].get("voters", {}).get("saltmarch") or sum(m.get("saltmarch", 0) for m in st["p2"]["members"].values()) or 4
        check("M4 ballots stop at the riding's voters", cast == cap, f"{cast} of {cap}")
        check("M4 polling device shows voting closed", "Voting is closed" in await v.inner_text("main"))
        await v.screenshot(path="/home/claude/econ-sim/review/build-shots/c03-group-voting-closed.png", full_page=True)
        await br.close()
    if errors:
        print("Page errors:", errors[:5])
    print(f"{sum(results)} of {len(results)} checks passed, {len(errors)} page errors.")
    sys.exit(0 if all(results) and not errors else 1)

asyncio.run(main())
