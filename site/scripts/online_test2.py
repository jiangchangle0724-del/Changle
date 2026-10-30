"""Draw & Guess strokes and typed guesses, King's chopsticks, Truth or Dare and the Wheel across phones."""
import os, re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/"
OUT = ".impeccable/review/online"
os.makedirs(OUT, exist_ok=True)

def phone(ctx, name):
    pg = ctx.new_page()
    pg.add_init_script("sessionStorage.setItem('lazysusan.entered','1'); localStorage.setItem('lazysusan.settings.v1', JSON.stringify({lang:'zh',sound:false,customPenalty:'',players:[]}));")
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs; pg._name = name
    return pg

def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, f"{pg._name}-{name}.png"))

def serve(host, index):
    host.get_by_role("button", name="菜单").click(); host.wait_for_timeout(500)
    host.locator(".menu-item").nth(index).click(); host.wait_for_timeout(1500)

def back(host):
    host.locator(".topbar .icon-btn").first.click(); host.wait_for_timeout(1000)

with sync_playwright() as p:
    b = p.chromium.launch()
    phones = []
    for name in ["host", "amy", "ben"]:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        phones.append(phone(ctx, name))
    host, amy, ben = phones
    host.goto(BASE, wait_until="networkidle"); host.wait_for_timeout(800)
    host.get_by_role("button", name="联机").click(); host.wait_for_timeout(500)
    host.get_by_placeholder("你的名字").fill("Steve")
    host.get_by_role("button", name="开一桌").click(); host.wait_for_timeout(2500)
    code = re.sub(r"\s", "", host.locator(".invite-code").inner_text())
    for g, nm in [(amy, "小雨"), (ben, "Ben")]:
        g.goto(BASE + f"#/join/{code}", wait_until="networkidle"); g.wait_for_timeout(800)
        g.get_by_placeholder("你的名字").fill(nm)
        g.get_by_role("button", name="加入").click(); g.wait_for_timeout(1800)
    for g in phones:
        g.keyboard.press("Escape"); g.wait_for_timeout(300)

    # ---- Draw & Guess: host draws (seat 0), amy guesses by typing
    serve(host, 3)
    host.locator(".setup-card .btn").nth(0).click(); host.wait_for_timeout(600)   # easy
    host.locator(".cloche-dome").click(); host.wait_for_timeout(1000)
    word = host.locator(".word-big").inner_text().strip()
    print("word:", word)
    assert amy.locator(".word-big").count() == 0, "guests must not see the word"
    host.locator(".btn-primary").last.click(); host.wait_for_timeout(900)  # start drawing
    # draw a stroke on the host plate
    box = host.locator(".plate-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    host.mouse.move(cx - 60, cy - 40); host.mouse.down()
    for i in range(1, 12):
        host.mouse.move(cx - 60 + i * 11, cy - 40 + (i % 3) * 14); host.wait_for_timeout(20)
    host.mouse.up(); host.wait_for_timeout(600)
    shot(host, "draw-drawer"); shot(amy, "draw-guesser")
    # amy's canvas should now have ink (count non-transparent pixels)
    ink = amy.evaluate("""() => { const c = document.querySelector('.plate-canvas'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++; return n; }""")
    print("amy ink pixels:", ink)
    assert ink > 50, "strokes should mirror to the guesser"
    amy.get_by_placeholder("猜是什么").fill("完全不对"); amy.get_by_role("button", name="猜").click(); amy.wait_for_timeout(700)
    assert "完全不对" in host.locator(".guess-list").inner_text()
    amy.get_by_placeholder("猜是什么").fill(word); amy.get_by_role("button", name="猜").click(); amy.wait_for_timeout(900)
    shot(host, "draw-after-correct")
    txt = host.locator(".game-body").inner_text()
    assert "小雨 猜中了" in txt, txt[:200]
    back(host)

    # ---- King's game: each phone pulls its own stick
    serve(host, 4)
    for g in phones:
        g.locator(".holder-svg g[role=button][aria-disabled='false']").first.click(); g.wait_for_timeout(900)
    host.wait_for_timeout(800)
    shot(amy, "king-after-draws")
    assert all(g.locator(".crown-card").count() == 1 for g in phones), "everyone sees the crown card"
    kingname = host.locator(".crown-card .word-big").inner_text().strip()
    print("king:", kingname)
    # the king draws a command (host can act for the king too)
    host.get_by_role("button", name="国王抽命令").click(); host.wait_for_timeout(900)
    assert ben.locator(".cloche-dome").count() == 1, "guests see the command under a cloche"
    back(host)

    # ---- Truth or Dare: amy spins on her phone
    serve(host, 1)
    amy.get_by_role("button", name="转瓶子").click(); amy.wait_for_timeout(5500)
    chosen = host.locator(".choose-who .turn-name").inner_text().strip()
    print("chosen:", chosen)
    assert chosen in ["Steve", "小雨", "Ben"]
    shot(host, "truth-chosen"); shot(ben, "truth-chosen")
    back(host)

    # ---- Wheel: host's turn first, guests follow the spin
    serve(host, 7)
    host.get_by_role("button", name="转").click(); host.wait_for_timeout(6500)
    r1 = host.locator(".wheel-result").inner_text().strip()
    r2 = amy.locator(".wheel-result").inner_text().strip()
    print("wheel:", r1, "|", r2)
    assert r1 == r2 and r1
    shot(amy, "wheel-result")

    for pg in phones:
        if pg._errs:
            print(f"!! {pg._name}: {pg._errs[:3]}")
    b.close()
print("ONLINE TEST 2 OK")
