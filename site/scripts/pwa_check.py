"""Check a production build with Vite preview running (Python Playwright, Chromium).

Usage: python scripts/pwa_check.py [--base http://127.0.0.1:4173]
For an already-deployed Pages preview, add --skip-update (update lifecycle is local).
The update check temporarily adds an index.html head marker, rebuilds, then restores
the source and rebuilds in finally. Do not edit index.html while this check runs.
External account/status responses and a disconnected table socket are local fixtures;
this test never contacts or creates a table on the live rooms service.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect

SITE = Path(__file__).resolve().parents[1]
PREFIX = 'changle-shell-'


def passed(message):
    print('PASS ' + message, flush=True)


def build():
    npm = shutil.which('npm.cmd' if sys.platform == 'win32' else 'npm')
    subprocess.run([npm, 'run', 'build'], cwd=SITE, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:4173')
    parser.add_argument('--skip-update', action='store_true', help='Read-only deployed-preview check; skip local rebuild/update test')
    args = parser.parse_args()
    base = args.base.rstrip('/')
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        # Keep unrelated services deterministic, including while offline. SW must bypass them.
        ctx.route('https://rooms.changle.ca/**', lambda route: route.fulfill(
            status=200, content_type='application/json', body=json.dumps({'paused': False})))
        # An unresponsive socket exercises the existing connection timeout, without
        # opening a real table or producing the browser's expected network-error log.
        ctx.route_web_socket('wss://rooms.changle.ca/**', lambda ws: None)
        ctx.add_init_script("""
          localStorage.setItem('lazysusan.settings.v1', JSON.stringify({lang:'zh',sound:false,music:false,players:[{id:'p0',name:'Guest'}]}));
          sessionStorage.setItem('changle.entered','1');
        """)

        def page():
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            return pg

        pg = page()
        robots = ctx.request.get(base + '/robots.txt')
        assert robots.ok and 'text/plain' in robots.headers['content-type']
        assert robots.text().splitlines() == ['User-agent: *', 'Allow: /', 'Disallow: /eat/api/', 'Disallow: /go/api/', 'Disallow: /trip/api/', 'Sitemap: https://changle.ca/sitemap.xml']
        passed('robots.txt is plain text; all three Worker APIs disallowed')
        npm_exec = shutil.which('npx.cmd' if sys.platform == 'win32' else 'npx')
        games = json.loads(subprocess.check_output([npm_exec, 'tsx', '-e', 'import {GAMES} from "./src/games/registry.ts"; console.log(JSON.stringify(GAMES.filter(g=>g.ready&&!g.hidden).map(g=>g.slug)))'], cwd=SITE, text=True))
        sitemap = ET.fromstring(ctx.request.get(base + '/sitemap.xml').text())
        urls = {node.text for node in sitemap.findall('{*}url/{*}loc')}
        expected = {'https://changle.ca' + path for path in ['/', '/tools', '/eat', '/trip', '/go'] + ['/g/' + slug for slug in games]}
        assert urls == expected
        passed(f'sitemap.xml: {len(games)} playable games, {len(urls)} public URLs; no private/play routes')
        manifest = ctx.request.get(base + '/manifest.webmanifest').json()
        assert manifest['name'] == manifest['short_name'] == '开席 Lazy Susan'
        assert manifest['start_url'] == manifest['scope'] == '/' and manifest['display'] == 'standalone'
        assert manifest['theme_color'] == manifest['background_color'] == '#0e0c22'
        assert manifest['lang'] == 'zh-CN' and manifest['categories'] == ['games', 'entertainment']
        for icon in manifest['icons']:
            response = ctx.request.get(base + icon['src'])
            assert response.ok and response.body().startswith(b'\x89PNG\r\n\x1a\n')
            width, height = struct.unpack('>II', response.body()[16:24])
            assert icon['sizes'] == f'{width}x{height}'
        assert {i['sizes'] for i in manifest['icons']} == {'192x192', '512x512'}
        assert any(i.get('purpose') == 'maskable' and i['sizes'] == '512x512' for i in manifest['icons'])
        passed('manifest, 192/512 PNG icons and maskable icon')
        for slug in ['default'] + games:
            image = ctx.request.get(base + f'/og/{slug}.png')
            assert image.ok and struct.unpack('>II', image.body()[16:24]) == (1200, 630)
            assert len(image.body()) < 300_000
            path = '/' if slug == 'default' else '/g/' + slug
            # Vite preview uses the SPA fallback for extensionless game paths; Pages serves .html.
            html_path = '/' if slug == 'default' else '/g/' + slug + '.html'
            html = ctx.request.get(base + html_path).text()
            assert f'content="https://changle.ca/og/{slug}.png"' in html
            assert f'href="https://changle.ca{path}"' in html
        passed(f'{len(games) + 1} share cards: correct dimensions, <300 KB, canonical/OG tags')

        pg.goto(base + '/')
        pg.evaluate('navigator.serviceWorker.ready')
        pg.reload()
        pg.wait_for_function('navigator.serviceWorker.controller !== null')
        pg.wait_for_selector('.board .tile')
        await_assets = """async () => { await document.fonts.ready; const c=await caches.open((await caches.keys()).find(k=>k.startsWith('changle-shell-'))); return (await c.keys()).map(r=>new URL(r.url).pathname); }"""
        first_keys = pg.evaluate(await_assets)
        assert '/index.html' in first_keys and any(k.endswith('.js') for k in first_keys) and any(k.endswith('.css') for k in first_keys)
        assert pg.evaluate("caches.keys().then(async ks => !(await (await caches.open(ks.find(k=>k.startsWith('changle-shell-')))).match('/index.html')).redirected)")
        passed('service worker controls after visit/reload; entry JS/CSS and shell cached')
        passed('cached shell has no redirect flag (Pages /index.html clean-URL redirect is safe)')
        pg.goto(base + '/g/wheel-of-fate/play')
        spin = pg.locator('.game-screen .btn-primary.btn-lg').last
        expect(spin).to_be_enabled()
        spin.click()
        expect(spin).to_be_disabled()
        pg.wait_for_timeout(7000)
        pg.evaluate(await_assets)
        passed('one-phone game loads and plays a turn online')
        # Warm the table screen's lazy chunk before checking its disconnected message offline.
        pg.goto(base + '/t/ABCD')
        pg.wait_for_selector('.join-screen, .notice-screen, input', timeout=15000)
        pg.evaluate(await_assets)
        ctx.set_offline(True)
        pg.goto(base + '/')
        pg.wait_for_selector('.board .tile')
        pg.goto(base + '/g/wheel-of-fate/play')
        expect(pg.locator('.game-screen')).to_be_visible()
        passed('offline home and previously played game open through shell fallback')
        pg.evaluate("localStorage.setItem('lazysusan.lastRoom','ABCD'); localStorage.setItem('lazysusan.name','Guest')")
        pg.goto(base + '/t/ABCD')
        expect(pg.get_by_text('连不上联机服务，检查一下网络。')).to_be_visible(timeout=15000)
        keys = pg.evaluate(await_assets)
        assert all(path == '/index.html' or path.startswith('/assets/') for path in keys)
        passed('offline table shows existing connection error; no APIs, tables or Worker pages cached')
        ctx.set_offline(False)
        if args.skip_update:
            assert not errors, '\n'.join(errors)
            browser.close()
            passed('zero console errors and page errors')
            passed('ALL DEPLOYED PWA CHECKS (update lifecycle checked locally)')
            return
        pg.goto(base + '/')
        old_cache = pg.evaluate("caches.keys().then(ks=>ks.find(k=>k.startsWith('changle-shell-')))")
        index = SITE / 'index.html'
        original = index.read_bytes()
        marker = '<meta name="changle-pwa-check" content="next-build" />'
        try:
            index.write_bytes(original.replace(b'</head>', marker.encode() + b'\n</head>'))
            build()
            worker = (SITE / 'dist/sw.js').read_text(encoding='utf-8')
            new_version = re.search(r'CACHE_PREFIX \+ "([a-f0-9]+)"', worker).group(1)
            assert old_cache != PREFIX + new_version
            pg.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
            pg.wait_for_function('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)', timeout=30000)
            pg.goto(base + '/tools')
            assert pg.locator('meta[name="changle-pwa-check"]').count() == 1
            assert pg.evaluate("caches.keys().then(ks=>ks.includes('" + old_cache + "'))")
            passed('changed rebuild: next navigation gets new HTML; waiting worker preserves active visit')
            pg.close()
            pg = page()
            pg.goto(base + '/')
            pg.evaluate('navigator.serviceWorker.ready')
            pg.wait_for_function("caches.keys().then(ks=>ks.filter(k=>k.startsWith('changle-shell-')).join() === '" + PREFIX + new_version + "')", timeout=30000)
            passed('next visit activates new worker and removes only previous changle caches')
        finally:
            index.write_bytes(original)
            build()
        assert not errors, '\n'.join(errors)
        passed('zero console errors and page errors; source restored and final production build rebuilt')
        browser.close()
    passed('ALL PWA CHECKS')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'FAIL {error}', file=sys.stderr)
        sys.exit(1)
