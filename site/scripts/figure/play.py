"""
The figure's moves played in real time on the page (props growing in, Zzz, tears, the flash, the
sword's streak), a few shots of each after a tap on its chip:

  python3 play.py out.png 'move:t1,t2,...' ...      (times in seconds after the tap)

Needs the site's dev server (npm run dev, port 5173) and Playwright for Python. This machine draws
WebGL in software, so expect 15 to 25 frames a second, not a phone's 60.
"""
import io
import sys
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

out = sys.argv[1]
W = 220
rows = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.add_init_script("window.__figAnyGl = true;")
    pg.goto("http://127.0.0.1:5173/me/figure", wait_until="load")
    pg.wait_for_function("window.__figIs === 'on'", timeout=120000)
    stage = pg.locator(".fig-stage")
    for spec in sys.argv[2:]:
        move, ts = spec.split(":")
        pg.locator(f".fig-moves .chip[data-move='{move}']").click()
        t0 = time.time()
        row = []
        for t in [float(x) for x in ts.split(",")]:
            while time.time() - t0 < t:
                time.sleep(0.02)
            im = Image.open(io.BytesIO(stage.screenshot())).convert("RGB")
            im = im.resize((W, int(im.height * W / im.width)))
            ImageDraw.Draw(im).text((6, 6), f"{move} +{t:g}s", fill=(255, 255, 255))
            row.append(im)
        rows.append(row)
    print("frames a second:", pg.evaluate("window.__figFps"), "errors:", errs[:3])
    b.close()
cols = max(len(r) for r in rows)
h = rows[0][0].height
sheet = Image.new("RGB", (cols * (W + 2), len(rows) * (h + 2)), (20, 20, 30))
for r, row in enumerate(rows):
    for c, im in enumerate(row):
        sheet.paste(im, (c * (W + 2), r * (h + 2)))
sheet.save(out)
print(out, sheet.size)
