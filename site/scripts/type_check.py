"""C4: phone typography, targets, zoom and touch regression (no live API calls).

Run with Vite running: python scripts/type_check.py
Compare main with exactly this script: --base http://127.0.0.1:5174 --out local-shots/c4/before
API replies below are synthetic UI fixtures. No email is sent and no account is used.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from playwright.sync_api import sync_playwright


PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["小明", "Ann", "Ben", "小雨", "Cathy"])]
SCREENS = {
    "home": ("/", ".board-foot.hint"),
    "tools": ("/tools", ".tool-blurb"),
    "game-sheet": ("/g/truth-or-dare", ".game-card-how"),
    "players": ("/", ".sheet .hint"),
    "settings": ("/settings", ".sheet .hint"),
    "signin-code": ("/login", ".signin-lead"),
    "truth": ("/g/truth-or-dare/play", ".bottle-actions .hint"),
    "undercover": ("/g/undercover/play", ".hint-ink"),
    "postit": ("/g/post-it/play", ".pi-curtain .hint"),
    "profile": ("/me", ".me-bio"),
    "profile-edit": ("/me", ".sheet .hint"),
}
# Only text links inside a sentence are exempt, never button-shaped links.
INLINE_LINKS = {".table-tv small a": "address inside the TV help sentence"}
FAILURES = []
COUNTS = {"screens": 0, "targets": 0, "small": 0, "allowed": 0, "console": 0}


def check(condition, message):
    print(("PASS " if condition else "FAIL ") + message, flush=True)
    if not condition:
        FAILURES.append(message)


def phone(browser, lang, profile=False):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              has_touch=True, is_mobile=True, locale="zh-CN" if lang == "zh" else "en-CA",
                              timezone_id="America/Vancouver", reduced_motion="reduce")
    ctx.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('changle.entered', '1');" %
                        json.dumps(json.dumps({"lang": lang, "sound": False, "music": False,
                                               "customPenalty": "", "players": PLAYERS})))
    # Stable, public-looking test profile; the synthetic session is generated per run.
    user = {"id": "u12345678", "name": "C4 Reader", "handle": "READ1234", "email": "reader@example.test",
            "city": "Vancouver", "gender": "private", "bio": "中文与 English 都读得清楚。",
            "av": 0, "ac": 0, "phone": "", "master": False}
    session = uuid4().hex

    def network(route):
        url = urlparse(route.request.url)
        if "/api/" not in url.path:
            if url.hostname in ("127.0.0.1", "localhost"):
                route.continue_()
            else:
                FAILURES.append("Unexpected external request: " + url.hostname)
                route.fulfill(status=200, json={})
            return
        path = url.path.split("/api", 1)[1]
        replies = {
            "/status": {"paused": False},
            "/auth/restore": {"token": session, "user": user} if profile else {},
            "/auth/keep": {},
            "/auth/code": {"sent": True},  # code remains empty: no development code in screenshots
            "/me": {"user": user},
            "/me/history": {"history": [], "stats": {"games": 0, "drinks": 0, "favorite": None, "friends": 0}},
            "/friends": {"friends": [], "incoming": [], "outgoing": []},
            "/fx": {"rates": {"USD": 1, "CAD": 1.4, "CNY": 7.2, "HKD": 7.8},
                    "at": 1793491200000, "source": "C4 fixture"},
        }
        if path not in replies:
            FAILURES.append("Unexpected API request: " + path)
        route.fulfill(status=200, json=replies.get(path, {}))

    ctx.route("**/*", network)
    ctx.route_web_socket("**/*", lambda ws: None)  # never connect a test phone to a real table
    pg = ctx.new_page()
    # Freeze calendar time while allowing animation/timer clocks to keep running.
    pg.clock.set_fixed_time(datetime(2026, 11, 1, 19, tzinfo=timezone.utc))
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg._c4_errors = errors
    return ctx, pg


def settle(pg):
    pg.wait_for_timeout(650)
    pg.evaluate("document.fonts.ready")


def audit(pg, screen, lang, paragraph, out):
    settle(pg)
    # A modal occludes the page underneath. Inspect its scrollable contents, including below fold.
    result = pg.evaluate("""({paragraph, allowed}) => {
      const sheets = [...document.querySelectorAll('.sheet')];
      const scope = sheets.at(-1) || document;
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' &&
        !el.closest('[hidden], [aria-hidden="true"]');
      const targets = [...scope.querySelectorAll('button, a, [role="button"], [role="tab"], input, select')]
        .filter(visible).map(el => {
          const r = el.getBoundingClientRect();
          const exception = Object.entries(allowed).find(([s]) => el.matches(s));
          return {tag: el.tagName, cls: el.className, label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 60),
                  w: r.width, h: r.height, allowed: exception ? exception[1] : null};
        });
      const p = document.querySelector(paragraph);
      const cs = p && getComputedStyle(p);
      return {targets, ratio: cs ? parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) : null,
              lang: document.documentElement.lang,
              overflow: document.documentElement.scrollWidth > innerWidth + 1};
    }""", {"paragraph": paragraph, "allowed": INLINE_LINKS})
    small = [t for t in result["targets"] if t["w"] < 43.95 or t["h"] < 43.95]
    COUNTS["screens"] += 1
    COUNTS["targets"] += len(result["targets"])
    for t in small:
        if t["allowed"]:
            COUNTS["allowed"] += 1
            print(f"ALLOW {screen}-{lang}: {t['label']} ({t['allowed']})")
        else:
            COUNTS["small"] += 1
            check(False, f"{screen}-{lang}: {t['tag']}.{t['cls']} {t['label']!r} {t['w']:.1f}x{t['h']:.1f}")
    ratio = result["ratio"]
    expected = 1.65 if lang == "zh" else 1.5
    check(ratio is not None and abs(ratio - expected) < .005,
          f"{screen}-{lang}: paragraph {paragraph} leading={ratio}, expected={expected}")
    check(result["lang"].startswith(lang), f"{screen}-{lang}: html lang={result['lang']}")
    check(not result["overflow"], f"{screen}-{lang}: no horizontal page overflow")
    print(f"TARGETS {screen}-{lang}: {len(result['targets'])} measured, {len(small)} below 44x44", flush=True)
    if screen == 'profile-edit':
        check(pg.locator('.av-swatch').first.evaluate('(e) => getComputedStyle(e).backgroundClip') == 'content-box',
              f'{screen}-{lang}: small color drawings inside 48px targets')
    pg.screenshot(path=str(out / f"{screen}-{lang}.png"))
    if screen == "tools":
        pg.screenshot(path=str(out / f"{screen}-{lang}-full.png"), full_page=True)


def errors(pg, label):
    COUNTS["console"] += len(pg._c4_errors)
    for error in pg._c4_errors:
        check(False, f"{label}: browser error: {error}")


def screens(browser, args, out):
    for lang in ("zh", "en"):
        for name, (path, paragraph) in SCREENS.items():
            if args.screens and name not in args.screens:
                continue
            ctx, pg = phone(browser, lang, profile=name.startswith('profile'))
            try:
                pg.goto(args.base.rstrip("/") + path, wait_until="networkidle")
                settle(pg)
                if name == "players":
                    pg.locator('.tonight-head .link-btn').tap()
                elif name == "signin-code":
                    pg.locator('#si-email').fill('reader@example.test')
                    pg.locator('.signin button[type=submit]').tap()
                    pg.locator('.otp-input').wait_for(state="attached")
                    pg.locator('.otp-input').blur()
                elif name == "postit":
                    pg.locator('.game-body .btn-primary').tap()
                    pg.locator('.pi-curtain').wait_for()
                elif name == "profile-edit":
                    pg.locator('.topbar-right .icon-btn').tap()
                audit(pg, name, lang, paragraph, out)
            except Exception as exc:
                check(False, f"{name}-{lang}: {exc}")
            finally:
                errors(pg, name + '-' + lang)
                ctx.close()


def touch_drag(pg, selector, points):
    el = pg.locator(selector)
    el.scroll_into_view_if_needed()
    box = el.bounding_box()
    cdp = pg.context.new_cdp_session(pg)
    for i, (x, y) in enumerate(points):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart" if i == 0 else "touchMove", "touchPoints":
                  [{"x": box['x'] + box['width'] * x, "y": box['y'] + box['height'] * y}]})
        pg.wait_for_timeout(35)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()


def interaction_checks(browser, args):
    ctx, pg = phone(browser, "zh")
    try:
        pg.goto(args.base.rstrip('/') + '/', wait_until="networkidle")
        settle(pg)
        for width in (320, 390, 1440):
            pg.set_viewport_size({'width': width, 'height': 844})
            check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'home: no overflow at {width}px')
        pg.set_viewport_size({'width': 390, 'height': 844})
        viewport = pg.locator('meta[name="viewport"]').get_attribute('content')
        check('user-scalable=no' not in viewport and 'maximum-scale=1' not in viewport, 'home: viewport permits pinch zoom')
        cdp = ctx.new_cdp_session(pg)
        start = pg.evaluate('visualViewport.scale')
        # Two physical touch points on non-interactive page background, spread apart.
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 170, 'y': 175}, {'x': 220, 'y': 175}]})
        for distance in range(30, 111, 10):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 195-distance, 'y': 175}, {'x': 195+distance, 'y': 175}]})
            pg.wait_for_timeout(40)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_timeout(250)
        end = pg.evaluate('visualViewport.scale')
        check(end > start + .1, f'home: touch pinch increased visualViewport.scale ({start:.2f} -> {end:.2f})')
        cdp.detach()
        # Reload resets zoom, then check the real language switch rather than only seeded storage.
        pg.goto(args.base.rstrip('/') + '/', wait_until="networkidle")
        pg.locator('.lang-tab button', has_text='EN').tap()
        check(pg.locator('html').get_attribute('lang') == 'en', 'language switch updates html lang')
        check(abs(pg.locator('.board-foot').evaluate('(e) => parseFloat(getComputedStyle(e).lineHeight)/parseFloat(getComputedStyle(e).fontSize)') - 1.5) < .005,
              'language switch updates reading leading to 1.5')

        for path, selector in [('truth-or-dare', '.bottle-svg'), ('wheel-of-fate', '.wheel-svg')]:
            pg.goto(args.base.rstrip('/') + f'/g/{path}/play', wait_until="networkidle")
            settle(pg)
            check(pg.locator(selector).evaluate('(e) => getComputedStyle(e).touchAction') == 'none', path + ': touch-action none')
            transforms = "(e) => [...e.querySelectorAll('g')].map(g => [g.getAttribute('style'), g.getAttribute('transform')])"
            before = pg.locator(selector).evaluate(transforms)
            touch_drag(pg, selector, [(.7, .5), (.68, .66), (.5, .8), (.3, .68), (.25, .5)])
            pg.wait_for_timeout(350)
            after = pg.locator(selector).evaluate(transforms)
            check(before != after, path + ': touch flick rotates the game surface')

        pg.goto(args.base.rstrip('/') + '/g/draw-and-guess/play', wait_until="networkidle")
        settle(pg)
        pg.locator('.setup-card .btn').first.tap()
        pg.locator('.cloche-dome').tap()
        pg.locator('.game-body .btn-primary').tap()
        pg.locator('.plate-canvas').wait_for()
        check(pg.locator('.plate-canvas').evaluate('(e) => getComputedStyle(e).touchAction') == 'none', 'drawing: touch-action none')
        before = pg.locator('.plate-canvas').evaluate('(e) => e.toDataURL()')
        touch_drag(pg, '.plate-canvas', [(.35, .35), (.4, .4), (.5, .45), (.6, .55)])
        after = pg.locator('.plate-canvas').evaluate('(e) => e.toDataURL()')
        check(before != after, 'drawing: touch stroke changes canvas pixels')

        pg.goto(args.base.rstrip('/') + '/settings', wait_until="networkidle")
        settle(pg)
        check(pg.locator('.sheet-grip').evaluate('(e) => getComputedStyle(e).touchAction') == 'none', 'sheet grip: touch-action none')
        touch_drag(pg, '.sheet-grip', [(.5, .5), (.5, 2), (.5, 5), (.5, 9)])
        pg.wait_for_timeout(700)
        check(pg.locator('.sheet').count() == 0, 'sheet grip: touch swipe dismisses sheet')
    except Exception as exc:
        check(False, 'touch interactions: ' + str(exc))
    finally:
        errors(pg, 'touch interactions')
        ctx.close()


def tabs_check(browser, args):
    ctx, pg = phone(browser, 'zh', profile=True)
    try:
        pg.goto(args.base.rstrip('/') + '/me', wait_until="networkidle")
        tabs = pg.locator('.me-tabs [role=tab]')
        tabs.first.wait_for()
        tabs.first.focus()
        for key, selected in [('ArrowRight', 1), ('ArrowRight', 0), ('ArrowLeft', 1), ('Home', 0), ('End', 1)]:
            pg.keyboard.press(key)
            check(tabs.nth(selected).get_attribute('aria-selected') == 'true' and
                  tabs.nth(selected).evaluate('(e) => e === document.activeElement') and
                  tabs.nth(1 - selected).get_attribute('tabindex') == '-1', f'profile tabs: {key} selects and focuses tab {selected}')
        check(pg.locator('[role=tabpanel]:visible').count() == 1, 'profile tabs: one labelled panel visible')
    except Exception as exc:
        check(False, 'profile tabs: ' + str(exc))
    finally:
        errors(pg, 'profile tabs')
        ctx.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:5173')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'local-shots' / 'c4')
    parser.add_argument('--screens', nargs='+', choices=SCREENS)
    parser.add_argument('--skip-interactions', action='store_true', help='screenshot-only baseline comparison')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    print('Chromium 390x844, touch; synthetic API fixtures, no email or real sessions.', flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        screens(browser, args, args.out)
        if not args.skip_interactions:
            interaction_checks(browser, args)
            tabs_check(browser, args)
        browser.close()
    print('SUMMARY ' + json.dumps({**COUNTS, 'failures': len(FAILURES)}), flush=True)
    print('Screenshots: ' + str(args.out), flush=True)
    return 1 if FAILURES else 0


if __name__ == '__main__':
    raise SystemExit(main())
