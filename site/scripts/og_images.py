"""Run Vite dev, then python scripts/og_images.py [--base http://127.0.0.1:5173].

Exports registry-driven share cards and favicon-derived app icons. Requires Python
Playwright/Chromium; no image library, extra npm dependencies or remote fonts.
"""
import argparse
from pathlib import Path
import struct
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(args.base + '/og.html')
        page.wait_for_selector('html[data-ready="true"]')
        out = SITE / 'public/og'
        out.mkdir(parents=True, exist_ok=True)
        for card in page.locator('.card').all():
            slug = card.get_attribute('data-slug')
            image = card.screenshot(path=str(out / f'{slug}.png'), animations='disabled')
            assert struct.unpack('>II', image[16:24]) == (1200, 630), slug
            assert len(image) < 300_000, f'{slug}: {len(image)} bytes exceeds 300 KB'
            print(f'PASS og/{slug}.png: 1200x630, {len(image)} bytes')
        # SVG is rendered inline so its text can use the machine's CJK font.
        svg = (SITE / 'public/favicon.svg').read_text(encoding='utf-8')
        icons = SITE / 'public/icons'
        icons.mkdir(parents=True, exist_ok=True)
        for name, size, maskable in [('icon-192', 192, False), ('icon-512', 512, False), ('maskable-512', 512, True)]:
            page.set_viewport_size({'width': size, 'height': size})
            # A 56% square fits entirely inside the maskable 80% diameter safe circle.
            extent = '56%' if maskable else '100%'
            page.set_content(f'<style>html,body{{margin:0;width:100%;height:100%;display:grid;place-items:center;background:#0e0c22}}svg{{width:{extent};height:{extent}}}text{{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif}}</style>{svg}')
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(icons / f'{name}.png'))
            print(f'PASS icons/{name}.png: {size}x{size}')
        assert not errors, '\n'.join(errors)
        browser.close()


if __name__ == '__main__':
    main()
