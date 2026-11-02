"""Capture the 12 isolated previews and four desktop layouts, then check their contracts.

Run with Vite on 127.0.0.1:5173: python scripts/ui_preview_shots.py [base_url]
Requires Python Playwright and its Chromium browser. No account, server or secrets needed.
"""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:5173"
OUT = Path(__file__).resolve().parents[1] / "local-shots" / "ui"
NAMES = ("Button", "Tile", "Sheet", "Tabs", "Pill", "RosterChip", "OTPInput", "Toast", "EmptyState", "Skeleton", "GameHeader", "PenaltyCard")
DESKTOP = ("Tile", "Sheet", "Tabs", "GameHeader")
errors = []


def watch(page):
    def record(message):
        errors.append(f"{page.url}: {message}")
        print(errors[-1], file=sys.stderr)
    page.on("pageerror", lambda error: record(f"pageerror: {error}"))
    page.on("console", lambda message: record(f"console: {message.text}") if message.type == "error" else None)


def open_preview(page, name, lang="zh"):
    page.goto(f"{BASE}/ui-preview.html#{name}", wait_until="networkidle")
    page.locator(f'[data-preview="{name}"]').wait_for()
    page.evaluate("document.fonts.ready")
    desired = "en" if lang == "en" else "zh-CN"
    if page.locator("html").get_attribute("lang") != desired:
        page.get_by_role("button", name="EN" if lang == "en" else "中", exact=True).click()
        page.wait_for_function("lang => document.documentElement.lang === lang", arg=desired)


def no_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"horizontal overflow: {page.url}"


def keyboard_checks(page):
    open_preview(page, "Button")
    play = page.get_by_role("button", name="sm · 开始", exact=True).first
    play.focus()
    page.keyboard.press("Enter")
    page.keyboard.press("Space")
    assert page.locator("output").inner_text() == "2"
    busy = page.locator('.ui-button[aria-busy="true"]').first
    assert busy.is_disabled() and busy.inner_text().strip(), "busy button retains its name"
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement.tagName === 'BUTTON'")

    open_preview(page, "Tabs")
    home_tabs = page.get_by_role("tablist", name="首页")
    first = home_tabs.get_by_role("tab").first
    first.focus()
    page.keyboard.press("ArrowRight")
    assert home_tabs.get_by_role("tab").nth(1).get_attribute("aria-selected") == "true"
    page.keyboard.press("End")
    assert home_tabs.get_by_role("tab").last.get_attribute("aria-selected") == "true"
    page.keyboard.press("Home")
    assert first.get_attribute("aria-selected") == "true"
    panel = page.get_by_role("tabpanel")
    assert first.get_attribute("aria-controls") == panel.get_attribute("id"), "tab points at its panel"
    assert panel.get_attribute("aria-labelledby") == first.get_attribute("id"), "panel is named after its tab"
    radio = page.get_by_role("radio").first
    radio.focus()
    page.keyboard.press("ArrowLeft")
    assert page.get_by_role("radio").last.get_attribute("aria-checked") == "true"

    open_preview(page, "Pill")
    toggle = page.locator('.ui-pill-toggle').first
    previous = toggle.get_attribute("aria-pressed")
    toggle.focus()
    page.keyboard.press("Space")
    assert toggle.get_attribute("aria-pressed") != previous

    open_preview(page, "OTPInput")
    code = page.get_by_role("textbox", name="验证码", exact=True)
    # Exercise the real paste handler, including formatted input and sanitization.
    code.evaluate("el => { const data = new DataTransfer(); data.setData('text/plain', '123 456'); el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true})); }")
    assert code.input_value() == "123456"
    assert page.locator("output").inner_text() == "✓ 123456"
    code.focus()
    page.keyboard.press("End")
    page.keyboard.press("Backspace")
    assert code.input_value() == "12345"
    table = page.get_by_role("textbox", name="桌号", exact=True)
    table.fill("ab1cd")
    assert table.input_value() == "ABCD"
    table.fill("ab 3d")
    assert table.input_value() == "AB3D", "table codes keep 2 to 9"
    table.fill("oil0x7")
    assert table.input_value() == "X7", "I, L, O, 0 and 1 are never in a table code"
    assert table.get_attribute("autocomplete") == "off", "no one-time-code autofill on a table code"
    assert code.get_attribute("autocomplete") == "one-time-code"
    expired = page.get_by_role("textbox", name="重试验证码")
    assert expired.get_attribute("aria-invalid") == "true"
    assert page.locator('[id="' + expired.get_attribute("aria-describedby") + '"]').inner_text()

    open_preview(page, "Sheet")
    opener = page.get_by_role("button", name="打开长内容弹层", exact=True)
    opener.focus()
    page.keyboard.press("Enter")
    dialog = page.get_by_role("dialog")
    page.wait_for_timeout(250)
    assert dialog.is_visible() and dialog.get_attribute("aria-labelledby")
    assert page.evaluate("document.body.style.overflow === 'hidden'")
    assert dialog.evaluate("el => el.contains(document.activeElement)")
    for _ in range(8):
        page.keyboard.press("Tab")
        assert dialog.evaluate("el => el.contains(document.activeElement)")
    # Scrolling the body must leave the footer in view.
    footer_before = page.locator(".ui-sheet-footer").bounding_box()
    page.locator(".ui-sheet-body").evaluate("el => el.scrollTop = el.scrollHeight")
    assert page.locator(".ui-sheet-footer").bounding_box() == footer_before
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('.ui-sheet').open")
    assert opener.evaluate("el => el === document.activeElement")
    assert page.evaluate("document.body.style.overflow !== 'hidden'")
    opener.click()
    page.mouse.click(2, 2)
    page.wait_for_function("!document.querySelector('.ui-sheet').open")
    opener.click()
    handle = page.locator(".ui-sheet-handle")
    box = handle.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 10)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 100, steps=6)
    page.mouse.up()
    page.wait_for_function("!document.querySelector('.ui-sheet').open")
    # Fast close/reopen keeps the trap, lock and eventual focus restoration intact.
    opener.click()
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('.ui-sheet').open")
    page.get_by_role("button", name="无标题 / 无底栏").click()
    assert page.get_by_role("dialog").get_attribute("aria-label") == "今晚的设置"
    page.wait_for_function("history.state && history.state.sheet")
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('.ui-sheet').open")
    page.wait_for_function("!(history.state && history.state.sheet)")
    depth = page.evaluate("history.length")
    page.get_by_role("button", name="无标题 / 无底栏").click()
    page.wait_for_function("history.state && history.state.sheet")
    page.evaluate("history.back()")
    page.wait_for_function("!document.querySelector('.ui-sheet').open")
    assert page.evaluate("location.hash") == "#Sheet", "back closes the sheet and stays on the page"
    assert page.evaluate("history.length") == depth, "no entries pile up"

    open_preview(page, "GameHeader")
    for header in page.locator(".ui-game-header").all():
        assert header.bounding_box()["height"] == 56, "header stays 56px high"
    more = page.get_by_role("button", name="更多操作").first
    more.focus()
    page.keyboard.press("Enter")
    sound = page.get_by_role("button", name="声音", exact=True).first
    sound.focus()
    page.keyboard.press("Space")
    assert sound.get_attribute("aria-pressed") == "false"
    page.keyboard.press("Escape")
    assert more.evaluate("el => el === document.activeElement")

    open_preview(page, "Toast")
    page.get_by_role("button", name="撤销", exact=True).click()
    assert page.locator('.ui-toast[role="status"]').count() == 0
    page.get_by_role("button", name="danger", exact=True).click()
    assert page.get_by_role("alert").count() == 1
    page.get_by_role("button", name="success", exact=True).click()
    assert page.locator(".ui-toast").count() == 1 and page.get_by_role("alert").count() == 0
    page.wait_for_timeout(4200)
    assert page.locator(".ui-toast").count() == 0, "default toast dismisses after 4000ms"

    open_preview(page, "PenaltyCard")
    page.get_by_role("button", name="sip", exact=True).click()
    assert page.get_by_role("dialog").is_visible()
    page.get_by_role("dialog").get_by_role("button", name="继续").click()
    assert page.get_by_role("dialog").count() == 0
    page.get_by_role("button", name="房间惩罚 + 自定义动作").click()
    assert "喝" not in page.get_by_role("dialog").inner_text(), "custom penalties contain no drinking copy"
    assert "×3" in page.get_by_role("dialog").inner_text(), "the table's own penalty shows how many times"
    page.get_by_role("button", name="我完成了", exact=True).click()
    print("PASS keyboard, focus trap/restore, backdrop, swipe, back button, footer, tab panels, OTP paste/backspace/table codes, toast lifecycle, penalty actions")


def reduced_checks(page):
    for name in NAMES:
        open_preview(page, name, "en")
        no_overflow(page)
        if name == "Sheet":
            page.get_by_role("button", name="Open long sheet").click()
        if name == "PenaltyCard":
            page.get_by_role("button", name="sip", exact=True).click()
        assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--motion-shift').trim() === '0px'")
        # No slide, shake, shimmer, stamp rotation or legacy Glass bubble animation.
        assert page.evaluate(r"""() => [...document.getAnimations()].every(animation => {
          const target = animation.effect?.target;
          if (!(target instanceof Element)) return true;
          return animation.effect.getKeyframes().every(frame =>
            !frame.transform || /^(none|translateY\(0(px)?\))$/.test(frame.transform));
        })"""), f"moving animation in reduced motion: {name}"
        if name == "Skeleton":
            assert page.locator(".ui-skeleton-shape").first.evaluate("el => getComputedStyle(el, '::after').animationName") == "none"
        if name == "PenaltyCard":
            page.wait_for_timeout(500)
            assert page.locator(".ui-penalty-stage").last.evaluate("el => getComputedStyle(el).animationName") == "none"
    print("PASS all 12 English previews and reduced-motion checks")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = context.new_page()
        watch(page)
        for name in NAMES:
            open_preview(page, name)
            no_overflow(page)
            if name == "Sheet":
                page.get_by_role("button", name="打开长内容弹层").click()
                page.wait_for_timeout(250)
            if name == "Skeleton":
                page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / f"{name}.png"), full_page=True, animations="disabled")
            print(f"SHOT {name}.png (390×844, scale 2, zh)")
        keyboard_checks(page)
        context.close()
        desktop = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page = desktop.new_page()
        watch(page)
        for name in DESKTOP:
            open_preview(page, name)
            no_overflow(page)
            if name == "Sheet":
                page.get_by_role("button", name="打开长内容弹层").click()
                page.wait_for_timeout(250)
            page.screenshot(path=str(OUT / f"{name}-desktop.png"), full_page=True, animations="disabled")
            print(f"SHOT {name}-desktop.png (1440 wide, scale 2, zh)")
        desktop.close()
        reduced = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, reduced_motion="reduce")
        page = reduced.new_page()
        watch(page)
        reduced_checks(page)
        reduced.close()
        browser.close()
    if errors:
        print(f"FAIL: {len(errors)} browser error(s)", file=sys.stderr)
        return 1
    print("PASS: 16 screenshots; no console or page errors")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise
