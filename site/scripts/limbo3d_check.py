"""
林波舞's 3D stage (src/party/limbo/scene3d/), in a browser that only draws WebGL in software: the page
is asked for the 3D anyway (window.__limboGl), then one phone and three online phones go through the
game while this reads what the stage draws (window.__limbo3d: draw calls, triangles, poses) and takes
pictures to look at. Run the dev servers first (site/README.md), then:

    python3 scripts/limbo3d_check.py [http://127.0.0.1:5173/]

Pictures land in $SHOTS (party_test.py's folder) as lb3d-*.png.
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import party_test as P  # noqa: E402
from party_test import fails, ok, until  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = P.BASE
# (an init script is run as it is; evaluate wants a function)
FORCE = "window.__limboGl = true;"
FORCE_FN = "() => { window.__limboGl = true; }"

# a phone with sound off (one phone gets up to ~55 calls with a crowd of seven; three online ~45)
CALLS = 170
TRIS = 120_000


def stats(pg):
    return pg.evaluate("() => window.__limbo3d || null")


def shot(pg, tag):
    pg.wait_for_timeout(250)
    P.shot(pg, "lb3d-" + tag)


def three_up(pg):
    ok(until(lambda: pg.locator(".limbo-3d canvas").count() == 1, 6000) and until(lambda: (stats(pg) or {}).get("calls", 0) > 0, 8000), "the 3D stage is up and drawing")
    s = stats(pg)
    ok(s["calls"] <= CALLS and s["tris"] <= TRIS, f"within budget: {s['calls']} calls, {s['tris']} triangles, {s['figures']} figures")
    return s


def t_single(browser):
    pg = P.phone(browser, "3d-solo", players=[{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "Mia", "Jay", "Kev", "小雨", "Ben", "Lin"])])
    pg.add_init_script(FORCE)
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    s = three_up(pg)
    ok(s["figures"] == 7, "setup: the seven players stand under the bar")
    pg.wait_for_timeout(1500)
    shot(pg, "01-setup-crowd")
    P.fake_sensor(pg)
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=6000)
    ok(until(lambda: stats(pg)["figures"] == 1, 4000), "whose turn it is: one on the stage")
    pg.wait_for_timeout(900)
    shot(pg, "02-ready-one")
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb .gauge", timeout=6000)
    for deg in (12, 24, 45):
        P.lean_to(pg, deg)
        ok(until(lambda: abs((stats(pg)["poses"][0].get("lean") or 0) - deg) < 1, 3000), f"leaning {deg}°: the figure follows the phone")
        pg.wait_for_timeout(700)
        shot(pg, f"03-lean-{deg}")
        if deg == 24:
            break
    ok(until(lambda: stats(pg)["poses"][0]["pose"] == "pass", 6000), "held past the bar: through")
    pg.wait_for_timeout(1500)
    shot(pg, "04-pass")
    P.lean_to(pg, 0)
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb .gauge", timeout=6000)
    P.lean_to(pg, 8)
    ok(until(lambda: stats(pg)["poses"][0]["pose"] == "fail", 20000), "time's up short of the bar: a miss")
    pg.wait_for_timeout(400)
    shot(pg, "05-fail-knock")
    pg.wait_for_timeout(1600)
    shot(pg, "06-fail-sitting")
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.wait_for_timeout(1200)
    shot(pg, "07-next-bar-back")
    s = stats(pg)
    ok(s["calls"] <= CALLS, f"still within budget: {s['calls']} calls, {s['tris']} triangles")
    P.errors([pg])
    pg.context.close()


def t_online(browser):
    host, guests, _ = P.seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    # (the pages opened before __limboGl could be set: from now on every load has it, and the host comes back to the game)
    for g in everyone:
        g.context.add_init_script(FORCE)
    P.start_game(host, everyone, "limbo")
    host.reload(wait_until="networkidle")
    until(lambda: P.view(host) and P.view(host).get("id") == "limbo")
    host.locator(".lb").wait_for()
    s = three_up(host)
    ok(s["figures"] == 3, "ready: the three of them on the stage")
    pg = host
    pg.wait_for_timeout(1200)
    shot(pg, "10-net-ready")
    for g in everyone:
        P.fake_sensor(g)
        g.get_by_role("button", name="开启动作感应").click()
    ok(until(lambda: len(P.view(host)["sensors"]) == 3), "three phones can measure")
    host.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: P.view(host)["phase"] == "go"), "the bar is up")
    host.wait_for_selector(".lb .gauge", timeout=8000)
    P.lean_to(host, 14)
    for g in guests:
        P.lean_to(g, 24)
    ok(until(lambda: len(P.view(host)["passed"]) == 2, 6000), "Mia and Jay through")
    host.wait_for_timeout(600)
    shot(pg, "11-net-two-through-me-short")
    ok(until(lambda: P.me(host) in P.view(host)["failed"], 20000), "Steve stays short: out when time's up")
    host.wait_for_timeout(1400)
    shot(pg, "12-net-me-out")
    s = stats(host)
    ok(s["calls"] <= CALLS, f"online within budget: {s['calls']} calls, {s['tris']} triangles")
    P.errors(everyone)
    for g in everyone:
        g.context.close()


def t_variants(browser):
    # a moving bar sways on the 3D stage too, and a tilt-through bar slants
    pg = P.phone(browser, "3d-moving", players=P.PLAYERS[:2])
    pg.add_init_script(FORCE)
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    three_up(pg)
    P.fake_sensor(pg)
    pg.get_by_role("button", name="跟着动的杆", exact=True).click()
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=6000)
    P.auto(pg)
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb .gauge[data-band]", timeout=6000)
    pg.wait_for_timeout(2600)
    a = stats(pg)["bar"]
    shot(pg, "30-moving-a")
    pg.wait_for_timeout(900)
    b = stats(pg)["bar"]
    shot(pg, "30-moving-b")
    ok(abs(a - b) >= 1, f"the bar floats on the stage ({a}° then {b}°), the figure with it")
    P.errors([pg])
    pg.context.close()
    pg = P.phone(browser, "3d-tilt", players=P.PLAYERS[:2])
    pg.add_init_script(FORCE)
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    three_up(pg)
    P.fake_sensor(pg)
    pg.get_by_role("button", name="歪着过", exact=True).click()
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=6000)
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb-side", timeout=6000)
    want = int(pg.locator(".lb-side").get_attribute("data-want"))
    P.tilt_to(pg, 22, want + 4 * (1 if want > 0 else -1))
    pg.wait_for_timeout(900)
    shot(pg, "31-tilt")
    P.errors([pg])
    pg.context.close()


def t_short_screen(browser):
    pg = P.phone(browser, "3d-se", players=P.PLAYERS[:2], w=375, h=667)
    pg.add_init_script(FORCE)
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    three_up(pg)
    pg.wait_for_timeout(800)
    shot(pg, "20-short-screen")
    P.errors([pg])
    pg.context.close()


if __name__ == "__main__":
    only = [a for a in sys.argv[1:] if not a.startswith("http")]
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for name, fn in (("single", t_single), ("online", t_online), ("variants", t_variants), ("short", t_short_screen)):
            if only and name not in only:
                continue
            print(f"--- {name}", flush=True)
            try:
                fn(browser)
            except Exception as e:  # noqa: BLE001
                ok(False, f"{name} crashed: {e}")
        browser.close()
    print(f"\nlimbo 3d check: {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + str(fails)} ({time.time() - t0:.0f}s)")
    sys.exit(1 if fails else 0)
