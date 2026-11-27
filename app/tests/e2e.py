"""End-to-end test with Playwright (Chromium).

Serve the app first:  cd app && python3 -m http.server 8765
Then run:             python3 app/tests/e2e.py [--base http://localhost:8765] [--shots review/build-shots]

Part A: board at 1920x1080 plus two group phones (390x844) in one browser context.
        Join two provinces, play Year 1 fully (income, a device-to-device trade, local issue,
        budget, year-end), check that state syncs, then fast-forward to Phase 2 and run the
        election, government and the budget bill to Year 7.
Part B: board-only mode, no group pages: Year 1 with the Trade Desk, card and budget slips,
        then reload to check the class save resumes.
Fails (exit 1) on any console error or failed check.
"""
import argparse
import asyncio
import os
import sys

from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8765")
ap.add_argument("--shots", default=os.path.join(os.path.dirname(__file__), "..", "..", "review", "build-shots"))
args = ap.parse_args()
BASE = args.base.rstrip("/")
SHOTS = os.path.abspath(args.shots)
os.makedirs(SHOTS, exist_ok=True)

errors = []
checks = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail else ""))


def watch(page, label):
    page.on("console", lambda m: errors.append(f"[{label}] {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"[{label}] pageerror: {e}"))


async def shot(page, name, full=False):
    await page.wait_for_timeout(350)
    await page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)


async def next_step(board, confirm=True):
    # Next ignores a second press for 1.2 s (one step per tap), so wait it out.
    await board.click("#btn-next")
    await board.wait_for_timeout(250)
    dlg = board.locator(".modal-wrap button:has-text('Continue')")
    if confirm and await dlg.count():
        await dlg.first.click()
    await board.wait_for_timeout(1050)


async def teacher(board, key):
    await board.click("#btn-teacher")
    await board.click(f".menu-item[data-k='{key}']")
    await board.wait_for_timeout(250)
    dlg = board.locator(".modal-wrap button:has-text('Fast-forward')")
    if await dlg.count():
        await dlg.first.click()
    await board.wait_for_timeout(400)


async def state(board):
    return await board.evaluate("JSON.parse(localStorage.getItem('borealis.save.' + localStorage.getItem('borealis.last')))")


async def new_game(board, name):
    await board.goto(f"{BASE}/board.html")
    await board.evaluate("localStorage.clear()")
    await board.goto(f"{BASE}/board.html")
    await board.wait_for_selector("#newname")
    await board.fill("#newname", name)
    await board.click("text=Start a new game")
    await board.wait_for_selector(".joinbox .code")
    return (await board.inner_text(".joinbox .code")).strip()


async def join(page, room, prov):
    await page.goto(f"{BASE}/index.html")
    await page.click("#join-open")
    await page.fill("#room", room)
    await page.click(f"[data-as='{prov}']")
    await page.click("#join button[type=submit]")
    await page.wait_for_selector(".g-head", timeout=8000)


async def part_a(browser):
    ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
    board = await ctx.new_page()
    watch(board, "board")
    idx = await ctx.new_page(); watch(idx, "index")
    await idx.set_viewport_size({"width": 390, "height": 844})
    await idx.goto(f"{BASE}/index.html")
    await idx.click("#join-open")
    await shot(idx, "a00-index-join", full=True)
    await idx.close()
    room = await new_game(board, "8C")
    check("room code shown", len(room) == 4, room)
    phone = {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True}
    # Group pages need their own viewport, so they open in a second context page with a set size.
    ga = await ctx.new_page(); await ga.set_viewport_size(phone["viewport"]); watch(ga, "goldplain")
    gb = await ctx.new_page(); await gb.set_viewport_size(phone["viewport"]); watch(gb, "lakemoor")
    await join(ga, room, "province:goldplain")
    await join(gb, room, "province:lakemoor")
    await board.wait_for_timeout(600)
    await shot(board, "a01-board-launch")
    await shot(ga, "a01-group-launch", full=True)
    devs = await board.inner_text(".devs b")
    check("board sees 2 devices", devs.strip() == "2", devs)

    # Year 1 headline and income
    await next_step(board)
    await shot(board, "a02-board-y1-headline")
    await next_step(board)
    await shot(board, "a03-board-y1-income")
    await shot(ga, "a03-group-income", full=True)
    check("group sees income step", "income" in (await ga.inner_text(".task")).lower())

    # Trade: Goldplain offers Lakemoor 4 food for $3.5B; Lakemoor accepts on its phone
    await next_step(board)
    await ga.click("[data-act='tto'][data-pid='lakemoor']")
    for _ in range(4):
        await ga.click("[data-act='tq'][data-k='give'][data-r='food'] >> nth=-1")
    for _ in range(7):
        await ga.click("[data-act='tq'][data-k='get'][data-r='money'] >> nth=-1")
    await shot(ga, "a04-group-trade-propose", full=True)
    await ga.click("[data-act='propose']")
    await gb.wait_for_selector("[data-act='accept']", timeout=5000)
    await shot(gb, "a04-group-trade-inbox", full=True)
    await shot(board, "a04-board-trade-pending")
    await gb.click("[data-act='accept']")
    await board.wait_for_timeout(600)
    st = await state(board)
    tr = [t for t in st["trades"] if not t["undone"]]
    check("device trade recorded on board", len(tr) == 1 and tr[0]["a"] == "goldplain" and tr[0]["get"].get("money") == 3.5, str(tr[:1]))
    check("trade route drawn on map", await board.locator(".route-layer .bm-route").count() >= 1)
    await shot(board, "a05-board-trade-route")
    await ga.wait_for_timeout(300)
    check("goldplain phone shows the deal", "Your deals this year" in await ga.inner_text("main"))
    await shot(ga, "a05-group-trade-done", full=True)

    # Local issue: both phones choose the first choice; board fills the rest
    await next_step(board)
    for g in (ga, gb):
        await g.click(".card-issue:not(.event) .choice >> nth=0")
    await ga.wait_for_timeout(400)
    await shot(ga, "a06-group-local", full=True)
    st = await state(board)
    check("card choices synced", all(st["choices"].get(p, {}).get("choice") for p in ("goldplain", "lakemoor")))
    await teacher(board, "fill")
    await shot(board, "a06-board-local")

    # Budget: Goldplain boosts healthcare and confirms; Lakemoor confirms default
    await next_step(board)
    await ga.click("[data-act='bud'][data-k='health'] >> nth=1")
    await shot(ga, "a07-group-budget", full=True)
    await ga.click("[data-act='confirmBudget']")
    await gb.click("[data-act='confirmBudget']")
    await board.wait_for_timeout(500)
    st = await state(board)
    check("budgets confirmed from phones", st["budgets"].get("goldplain", {}).get("confirmed") and st["budgets"]["goldplain"]["decision"]["health"] == 4 and st["budgets"].get("lakemoor", {}).get("confirmed"))
    await shot(board, "a07-board-budget")
    await next_step(board)  # confirm dialog for the 5 others
    await board.wait_for_timeout(500)
    await shot(board, "a08-board-y1-results")
    await shot(ga, "a08-group-results", full=True)
    st = await state(board)
    h = st["engine"]["provs"]["goldplain"]["history"]
    check("year 1 resolved", len(h) == 1 and st["step"] == "results", f"approval {h[-1]['approval'] if h else None}")
    phone_appr = (await ga.inner_text(".g-appr b")).strip()
    check("phone approval matches board", h and phone_appr == f"{h[-1]['approval']:.0f}", f"{phone_appr} vs {h[-1]['approval'] if h else None}")
    await board.click("[data-act='selprov'][data-pid='goldplain'] >> nth=0")
    await shot(board, "a09-board-province-why")
    await board.click("[data-act='closepanel']")

    # Fast-forward to Phase 2
    await teacher(board, "ff")
    st = await state(board)
    check("fast-forward reaches Phase 2", st["phase"] == "p2" and st["step"] == "parties", f"{st['phase']}/{st['step']}")
    await shot(board, "a10-board-p2-parties")
    # Goldplain's group now acts as the Cornerstone caucus
    await ga.goto(f"{BASE}/group.html?room={room}&as=party:cornerstone")
    await ga.wait_for_selector(".g-head")
    await ga.click("[data-act='leader'][data-pid='goldplain']")
    for pl in ("c-balance", "c-low-tax", "c-business", "c-provinces"):
        await ga.click(f"[data-act='rank'][data-pl='{pl}']")
    await ga.click("[data-act='rankadd']")
    await ga.wait_for_timeout(400)
    await shot(ga, "a10-group-party-caucus", full=True)
    st = await state(board)
    check("party ranking synced", st["p2"]["ballotsIn"]["cornerstone"] == 1 and st["p2"]["leader"]["cornerstone"] == "goldplain")
    await teacher(board, "fill")
    await next_step(board)  # platform
    await ga.click("[data-act='promise'][data-pid='goldplain']")
    await ga.wait_for_timeout(300)
    await shot(ga, "a11-group-platform", full=True)
    await teacher(board, "fill")
    await board.click("details.party[data-party='forward'] summary")
    await shot(board, "a11-board-platform")
    await next_step(board)  # campaign
    await ga.click("[data-act='cact'][data-v='door']")
    await ga.click("details.ridings >> nth=2")
    await ga.click("details.ridings >> nth=2 >> [data-act='crid'] >> nth=0")
    await ga.click("[data-act='cgo']")
    await ga.wait_for_timeout(300)
    await shot(ga, "a12-group-campaign", full=True)
    st = await state(board)
    check("campaign action synced", st["p2"]["campaign"]["cornerstone"]["spent"] == 1)
    await teacher(board, "fill")
    await shot(board, "a12-board-campaign")
    await next_step(board)  # vote
    await gb.click("[data-act='ballot'][data-v='evergreen']")
    await shot(gb, "a13-group-ballot", full=True)
    await gb.click("[data-act='cast']")
    await board.wait_for_timeout(400)
    st = await state(board)
    check("secret ballot cast on a riding device (count only)", st["p2"]["ballots"]["lakemoor"]["evergreen"] == 1)
    await teacher(board, "fill")
    await shot(board, "a13-board-vote")
    await next_step(board)  # results with reveal
    await board.wait_for_timeout(2500)
    await shot(board, "a14-board-results-revealing")
    await board.wait_for_timeout(7500)
    await shot(board, "a14-board-results")
    await shot(ga, "a14-group-results", full=True)
    st = await state(board)
    seats = st["p2"]["election"]["seats"]
    check("34 seats awarded", sum(seats.values()) == 34, str(seats))
    await next_step(board)  # government
    st = await state(board)
    if not st["p2"]["gov"]["majority"]:
        await teacher(board, "fill")
        await board.click("[data-act='holdconf']")
        await board.wait_for_timeout(300)
    await shot(board, "a15-board-government")
    await next_step(board)  # bill stage 0
    await shot(board, "a16-board-bill-draft")
    await shot(ga, "a16-group-bill", full=True)
    for stage in range(1, 7):
        await teacher(board, "fill")
        await next_step(board)
        if stage in (3, 4):
            await shot(board, f"a17-board-bill-stage{stage}")
        st = await state(board)
        if st["phase"] == "debrief":
            break
    await teacher(board, "fill")
    await next_step(board)  # Royal Assent -> Year 7
    st = await state(board)
    check("budget bill reaches Year 7 or the government falls", (st["step"] == "year7" and st["p2"]["year7"]) or st["phase"] == "debrief", f"{st['phase']}/{st['step']}")
    await shot(board, "a18-board-year7")
    await gb.goto(f"{BASE}/group.html?room={room}&as=province:lakemoor")
    await gb.wait_for_selector(".g-head")
    await gb.wait_for_timeout(500)
    await shot(gb, "a18-group-province-year7", full=True)
    await next_step(board)
    await shot(board, "a19-board-debrief")
    log = await ctx.new_page(); watch(log, "log")
    await log.goto(f"{BASE}/log.html?class=8C")
    await log.wait_for_selector(".prov")
    await shot(log, "a20-history-log", full=False)
    check("history log lists 7 provinces", await log.locator(".prov").count() == 7)
    await ctx.close()


async def part_b(browser):
    ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
    board = await ctx.new_page()
    watch(board, "board-only")
    await new_game(board, "8D")
    await next_step(board)  # headline (Year 1 is calm by default)
    # Swap in a national event before revealing it
    await board.click("[data-act='swapevent']")
    await board.click(".evpick[data-e='drought']")
    await board.wait_for_timeout(200)
    st = await state(board)
    check("teacher can swap the headline card", st["yc"]["event"] == "drought" and not st["yc"]["revealed"])
    await shot(board, "b00-board-headline-facedown")
    await next_step(board)  # reveal
    await shot(board, "b00-board-headline-revealed")
    await next_step(board)  # income
    await next_step(board)  # trade
    # Trade Desk: tap Westhaven on the map, then trade with Goldplain
    await board.locator("#prov-westhaven").dispatch_event("pointerup")
    await board.wait_for_timeout(200)
    await board.click("[data-act='tab'][data-tab='trade']")
    await board.click("[data-act='desk-prov'][data-k='b'][data-pid='goldplain']")
    for _ in range(3):
        await board.click("[data-act='desk-q'][data-k='give'][data-r='materials'] >> nth=-1")
    for _ in range(3):
        await board.click("[data-act='desk-q'][data-k='get'][data-r='food'] >> nth=-1")
    await shot(board, "b01-board-trade-desk")
    await board.click("[data-act='desk-ok'][data-k='okA']")
    await board.click("[data-act='desk-ok'][data-k='okB']")
    await board.wait_for_timeout(500)
    st = await state(board)
    check("trade desk deal recorded", len(st["trades"]) == 1 and st["trades"][0]["via"] == "desk", str(st["trades"][:1]))
    await shot(board, "b02-board-trade-desk-done")
    await board.click("[data-act='closepanel']")
    await next_step(board)  # local
    for pid in ("westhaven", "ridgeland", "goldplain", "lakemoor", "valcourt", "saltmarch", "northreach"):
        await board.click(f".prow[data-pid='{pid}']")
        await board.click(".card-issue:not(.event) .choice >> nth=1")
        if pid == "westhaven":
            await shot(board, "b03-board-card-slip")
        await board.click("[data-act='closepanel']")
    st = await state(board)
    check("all 7 card slips entered at the board", all(st["choices"].get(p, {}).get("choice") for p in st["engine"]["provs"]))
    await next_step(board)  # budget
    for pid in ("westhaven", "ridgeland", "goldplain", "lakemoor", "valcourt", "saltmarch", "northreach"):
        await board.click(f".prow[data-pid='{pid}']")
        if pid == "saltmarch":
            await board.click("[data-act='bud'][data-k='education'] >> nth=1")
        await board.click("[data-act='points'][data-v='2']")
        await board.click("[data-act='confirmBudget']")
        if pid == "saltmarch":
            await shot(board, "b04-board-budget-slip")
        await board.click("[data-act='closepanel']")
    st = await state(board)
    check("all 7 budget slips confirmed at the board", all(st["budgets"].get(p, {}).get("confirmed") for p in st["engine"]["provs"]))
    await next_step(board)
    st = await state(board)
    check("board-only year 1 resolves", st["step"] == "results" and len(st["engine"]["provs"]["saltmarch"]["history"]) == 1)
    await shot(board, "b05-board-only-results")
    # Back (undo) and forward again
    await board.click("#btn-back")
    await board.click(".modal-wrap button:has-text('Undo it')")
    await board.wait_for_timeout(1300)
    st = await state(board)
    check("Back undoes the year end", st["step"] == "budget" and len(st["engine"]["provs"]["saltmarch"]["history"]) == 0)
    await next_step(board)
    # Resume: reload the page and expect the same class, year and step
    await board.reload()
    await board.wait_for_selector(".topbar .cls b")
    st2 = await state(board)
    cls = await board.inner_text(".topbar .cls b")
    check("class save resumes after reload", cls.strip() == "8D" and st2["step"] == "results" and st2["year"] == 1, f"{cls} {st2['step']} {st2['year']}")
    # Override a number from the province panel
    await board.click("[data-act='selprov'][data-pid='goldplain'] >> nth=0")
    await board.click("[data-act='tab'][data-tab='overview']")
    await board.click("[data-act='override']")
    await board.select_option("#ov-f", "debt")
    await board.fill("#ov-v", "5")
    await board.fill("#ov-r", "slip entered wrong")
    await board.click(".modal-wrap button:has-text('Change it')")
    await board.wait_for_timeout(200)
    await board.click(".modal-wrap button:has-text('Change it')")  # confirm old -> new
    await board.wait_for_timeout(300)
    st = await state(board)
    check("override changes the number and logs it", abs(st["engine"]["provs"]["goldplain"]["debt"] - 5) < 0.01 and any(l["kind"] == "override" for l in st["log"]))
    await board.click("[data-act='closepanel']")
    # Demo mode opens a group tab with a switcher
    async with ctx.expect_page() as pinfo:
        await board.click("#btn-teacher")
        await board.click(".menu-item[data-k='demo']")
    demo = await pinfo.value
    watch(demo, "demo")
    await demo.set_viewport_size({"width": 390, "height": 844})
    await demo.wait_for_selector(".demobar select")
    await demo.select_option(".demobar select", "province:saltmarch")
    await demo.wait_for_selector(".g-head")
    await demo.wait_for_timeout(500)
    check("demo tab follows the board", "saltmarch" in (await demo.inner_text(".g-head")).lower())
    await demo.click("[data-act='tab'][data-tab='province']")
    await demo.wait_for_timeout(600)
    await shot(demo, "b07-demo-province-tab", full=True)
    await demo.click("[data-act='tab'][data-tab='news']")
    await shot(demo, "b07-demo-news")
    # A second board tab on the same class opens read only, and can take over
    other = await ctx.new_page(); watch(other, "board-2")
    await other.goto(f"{BASE}/board.html?class=8D")
    await other.wait_for_selector("#readonly .ro-box", timeout=5000)
    await shot(other, "b08-second-board-tab-readonly")
    check("second board tab is read only", await other.locator("#readonly").count() == 1)
    await other.click("#ro-take")
    await other.wait_for_timeout(2600)
    check("take over moves the lock", await other.locator("#readonly").count() == 0 and await board.locator("#readonly").count() == 1)
    await other.close()
    await board.click("#ro-take")
    await board.wait_for_timeout(500)
    # Pause and Eyes up
    await board.click("#btn-pause")
    await shot(board, "b06-board-paused")
    await board.click("#pause")
    await ctx.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        await part_a(browser)
        await part_b(browser)
        await browser.close()
    print()
    if errors:
        print("Console errors:")
        for e in errors:
            print("  " + e)
    failed = [c for c in checks if not c[1]]
    print(f"{len(checks) - len(failed)} of {len(checks)} checks passed. {len(errors)} console errors. Screenshots in {SHOTS}")
    sys.exit(1 if failed or errors else 0)


asyncio.run(main())
