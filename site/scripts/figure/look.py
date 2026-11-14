"""
Held poses of the figure's moves, through the real page, side by side in one picture:

  python3 look.py out.png 'move:t1,t2,...[:yaw[:intro[:camera]]]' ...

  move    a move's id (site/src/account/figure/moves.ts), its clip held at each time (seconds)
  yaw     turns the figure (degrees, 35 = a three-quarter view)
  intro   'intro' holds the move's intro clip instead (睡觉 lying down)
  camera  x,y,z,tx,ty,tz: the camera there, looking at that point (a close-up)

e.g.  python3 look.py /tmp/sword.png 'sword:0,0.85,1.12,1.65' 'sleep:0.6,1.8,2.6::intro'

Needs the site's dev server (npm run dev, port 5173), the built figure in public/models, and
Playwright for Python. CELL=300 sets each picture's width.
"""
import io
import os
import sys

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

out = sys.argv[1]
W = int(os.environ.get("CELL", "300"))
rows = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.add_init_script("window.__figAnyGl = true;")
    pg.goto("http://127.0.0.1:5173/me/figure", wait_until="load")
    pg.wait_for_function("window.__figIs === 'on'", timeout=120000)
    pg.wait_for_selector(".fig-stats")
    stage = pg.locator(".fig-stage")
    for spec in sys.argv[2:]:
        parts = spec.split(":")
        move, times = parts[0], [float(x) for x in parts[1].split(",")]
        yaw = float(parts[2]) if len(parts) > 2 and parts[2] else 0
        intro = len(parts) > 3 and parts[3] == "intro"
        cam = parts[4] if len(parts) > 4 else ""
        row = []
        for t in times:
            if not pg.evaluate(f"window.__figSeek('{move}', {t}, {yaw}, {str(intro).lower()})"):
                print("no such clip:", move, "(intro)" if intro else "")
            pg.evaluate(f"window.__figCam({cam})")
            im = Image.open(io.BytesIO(stage.screenshot())).convert("RGB")
            im = im.resize((W, int(im.height * W / im.width)))
            ImageDraw.Draw(im).text((6, 6), f"{move}{' in' if intro else ''} {t:g}s {yaw:g}°", fill=(255, 255, 255))
            row.append(im)
        rows.append(row)
    if errs:
        print("errors on the page:", errs[:3])
    b.close()
cols = max(len(r) for r in rows)
h = rows[0][0].height
sheet = Image.new("RGB", (cols * (W + 2), len(rows) * (h + 2)), (20, 20, 30))
for r, row in enumerate(rows):
    for c, im in enumerate(row):
        sheet.paste(im, (c * (W + 2), r * (h + 2)))
sheet.save(out)
print(out, sheet.size)
