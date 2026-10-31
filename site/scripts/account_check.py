"""
Two phones, two accounts: sign up with email codes (dev mode shows the code), one with a photo
and one with an anime avatar made in the maker, add each other, chat live, sit at one online
table and check the faces, then switch the first to an anime avatar too. Screenshots go to OUT.

  python3 scripts/account_check.py [base_url] [out_dir] [--solo]
"""
import io
import os
import random
import re
import string
import sys
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "http://127.0.0.1:5173/").rstrip("/") + "/"
OUT = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else "/tmp/account-shots"
SOLO = "--solo" in sys.argv
os.makedirs(OUT, exist_ok=True)

fails: list[str] = []
errors: list[str] = []


def check(ok: bool, what: str):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def photo(c1, c2) -> bytes:
    im = Image.new("RGB", (480, 360), c1)
    d = ImageDraw.Draw(im)
    for i in range(0, 360, 6):
        d.line([(0, i), (480, i)], fill=tuple(int(c1[k] + (c2[k] - c1[k]) * i / 360) for k in range(3)))
    d.ellipse([170, 90, 310, 230], fill=(250, 220, 190))
    d.ellipse([205, 140, 222, 157], fill=(30, 30, 40))
    d.ellipse([258, 140, 275, 157], fill=(30, 30, 40))
    d.arc([210, 160, 270, 205], 20, 160, fill=(120, 40, 60), width=5)
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")


def phone(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark", locale="zh-CN")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console {m.text}"))
    return ctx, page


def make_anime(page, style):
    """In the avatar maker (already open): start from a style and use it."""
    page.wait_for_selector(".mk-start", timeout=5000)
    page.click(f".mk-start-fig:has-text('{style}')")
    page.wait_for_selector(".mk-fig svg", timeout=5000)
    page.click(".mk-tab:text-is('发型')")
    page.click(".mk-pic:has-text('丸子头')")
    page.wait_for_timeout(300)
    shot(page, f"maker-{style}")
    page.click(".mk-foot .btn-primary")
    page.wait_for_selector(".mk", state="detached", timeout=5000)


def signup(page, email, name, city, gender, bio, pic=None, anime=None):
    page.goto(BASE)
    page.wait_for_selector(".acct-signin", timeout=15000)
    page.click(".acct-signin")
    page.wait_for_selector("#si-email")
    page.fill("#si-email", email)
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".otp-input")
    page.wait_for_function("document.querySelector('.otp-input').value.length === 6")
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".profile-form", timeout=10000)
    if pic:
        page.set_input_files(".profile-form input[type=file]", files=[{"name": "me.png", "mimeType": "image/png", "buffer": pic}])
        page.wait_for_selector(".pf-photo img", timeout=5000)
    if anime:
        page.click(".pf-kind button:has-text('动漫头像')")
        make_anime(page, anime)
        page.wait_for_selector(".pf-photo .pf-look svg", timeout=5000)
    page.fill("#pf-name", name)
    page.fill("#pf-phone", "+1 604 555 01" + str(random.randint(10, 99)))
    page.fill("#pf-city", city)
    page.click(f".pf-genders .chip:text-is('{gender}')")
    page.fill("#pf-bio", bio)
    page.check(".pf-check input")
    page.wait_for_timeout(200)
    shot(page, f"signup-{name}")
    page.click(".profile-form button[type=submit]")
    page.wait_for_selector(".acct-me", timeout=10000)


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        actx, a = phone(browser)
        bctx, b = phone(browser)

        signup(a, f"steve.{tag}@example.com", "Steve", "Vancouver", "男", "周末组局的人。拿手游戏：流氓十三章。", photo((176, 114, 255), (255, 95, 162)))
        try:
            a.wait_for_selector(".acct-me .avatar img", timeout=6000)
            check(True, "A: header shows the uploaded photo")
        except Exception:
            check(False, "A: header shows the uploaded photo")
        shot(a, "home-signed-in")

        signup(b, f"mia.{tag}@example.com", "Mia", "Toronto", "女", "酒量一般，气氛担当。", None, anime="女")
        try:
            b.wait_for_selector(".acct-me .avatar img", timeout=6000)
            src = b.get_attribute(".acct-me .avatar img", "src")
            r = b.request.get(src)
            kind = f"{r.headers.get('content-type')} {r.headers.get('content-security-policy')}"
            check(kind.startswith("image/svg+xml") and "default-src 'none'" in kind, f"B: header shows the anime face, served as locked-down SVG ({kind})")
        except Exception as e:
            check(False, f"B: header shows the anime face ({e})")
        b.goto(BASE + "#/me")
        b.wait_for_selector(".me-head")
        b.wait_for_timeout(500)
        check(b.locator(".me-head .me-figure svg").count() == 1, "B: profile shows the whole figure")
        shot(b, "me-B")

        # A's profile and friend code
        a.goto(BASE + "#/me")
        a.wait_for_selector(".me-head")
        a.wait_for_timeout(500)
        shot(a, "me-A")
        code_text = a.locator(".tag-code").inner_text()
        m = re.search(r"([A-Z0-9]{4,10})", code_text.replace("好友码", ""))
        handle = m.group(1) if m else ""
        check(bool(handle), f"A: friend code visible ({handle})")

        # B finds A by code and sends a request
        b.goto(BASE + "#/me")
        b.wait_for_selector(".me-tabs")
        b.click(".me-tabs button:nth-child(2)")
        b.fill(".friend-find input", handle)
        b.click(".friend-find button[type=submit]")
        b.wait_for_selector(".people .person", timeout=5000)
        shot(b, "find-A")
        b.click(".people .person .btn-primary")
        b.wait_for_selector(".people .hint:text-is('已发送')", timeout=5000)
        check(True, "B: request sent")

        # A hears about it live: a badge on the header, then accepts
        a.goto(BASE)
        try:
            a.wait_for_selector(".acct-badge", timeout=8000)
            check(a.locator(".acct-badge").inner_text().strip() == "1", "A: header badge counts the request")
        except Exception:
            check(False, "A: header badge counts the request")
        shot(a, "home-badge")
        a.click(".acct-me")
        a.wait_for_selector(".me-tabs")
        a.click(".me-tabs button:nth-child(2)")
        a.wait_for_selector(".list-title:text-is('好友请求')", timeout=5000)
        shot(a, "friends-request")
        a.click(".people .person .btn-primary")
        a.wait_for_selector(".people .person-main[href^='#/chat/']", timeout=5000)
        check(True, "A: request accepted, B in friends")

        # chat
        a.click(".people .person-main[href^='#/chat/']")
        a.wait_for_selector(".chat-compose, .chat-hello", timeout=8000)
        a.wait_for_timeout(400)
        shot(a, "chat-empty")
        a.click(".chat-ideas .chip >> nth=0")
        a.wait_for_selector(".chat-line.is-mine .bubble-emoji, .chat-line.is-mine .bubble", timeout=5000)
        a.fill(".chat-field textarea", "今晚来玩吗？我开桌，十点见")
        a.click(".chat-send")
        a.wait_for_function("[...document.querySelectorAll('.chat-line.is-mine .bubble')].some(e => e.textContent.includes('十点见'))", timeout=5000)
        try:
            a.wait_for_function("!document.querySelector('.chat-note') || ![...document.querySelectorAll('.chat-note')].some(e => e.textContent === '发送中')", timeout=6000)
            check(True, "A: messages delivered")
        except Exception:
            check(False, "A: messages delivered")

        api = BASE.replace(":5173", ":8787") + "api"
        aid = a.evaluate("u => fetch(u + '/me', {headers: {Authorization: 'Bearer ' + localStorage.getItem('changle.session')}}).then(r => r.json()).then(d => d.user.id)", api)
        b.goto(BASE + f"#/chat/{aid}")
        b.wait_for_function("[...document.querySelectorAll('.chat-line.is-theirs .bubble')].some(e => e.textContent.includes('十点见'))", timeout=8000)
        check(True, "B: sees A's messages")
        try:
            a.wait_for_selector(".chat-note:text-is('已读')", timeout=6000)
            check(True, "A: sees read receipt live")
        except Exception:
            check(False, "A: sees read receipt live")
        b.fill(".chat-field textarea", "来！我带两瓶酒 🍷")
        b.click(".chat-send")
        b.fill(".chat-field textarea", "🍻🍻")
        b.click(".chat-send")
        a.wait_for_function("[...document.querySelectorAll('.chat-line.is-theirs')].length >= 2", timeout=8000)
        check(True, "A: B's reply arrives live")
        a.wait_for_timeout(700)
        shot(a, "chat-A")
        shot(b, "chat-B")

        # B's view of A's profile
        b.goto(BASE + f"#/u/{aid}")
        b.wait_for_selector(".me-head")
        b.wait_for_timeout(500)
        shot(b, "user-A-from-B")
        check(b.locator(".user-actions a[href^='#/chat/']").count() == 1, "B: A's page offers Message")
        check(b.locator(".me-head .me-figure").count() == 0, "B: A's page shows A's photo, not a figure")
        bid = b.evaluate("u => fetch(u + '/me', {headers: {Authorization: 'Bearer ' + localStorage.getItem('changle.session')}}).then(r => r.json()).then(d => d.user.id)", api)
        a.goto(BASE + f"#/u/{bid}")
        a.wait_for_selector(".me-head")
        a.wait_for_timeout(500)
        check(a.locator(".me-head .me-figure svg").count() == 1, "A: B's page shows B's whole figure")
        shot(a, "user-B-from-A")

        # one online table, both faces
        a.goto(BASE)
        a.wait_for_selector(".online-btn")
        a.click(".online-btn")
        a.wait_for_selector("#online-name")
        check(a.input_value("#online-name") in ("Steve",), f"A: table name defaults to profile ({a.input_value('#online-name')})")
        shot(a, "online-sheet")
        a.get_by_role("button", name="开一桌", exact=True).click()
        a.wait_for_selector(".lobby .faces", timeout=10000)
        code = a.evaluate("location.hash").split("/")[-1]
        b.goto(BASE + f"#/r/{code}")
        b.wait_for_selector(".join-card, .lobby", timeout=10000)
        if b.locator(".join-card").count():
            check(b.locator(".join-card input").input_value() == "Mia", "B: join name defaults to profile")
            b.click(".join-card button[type=submit]")
        b.wait_for_selector(".lobby .faces", timeout=10000)
        a.wait_for_function("document.querySelectorAll('.lobby .face:not(.face-add)').length === 2", timeout=8000)
        a.wait_for_timeout(600)
        check(a.locator(".lobby .face .face-dot img").count() == 2, "A: lobby shows A's photo and B's anime face")
        check(b.locator(".lobby .face .face-dot img").count() == 2, "B: lobby shows both faces too")
        shot(a, "lobby-A")
        shot(b, "lobby-B")
        b.click(".lobby .face:not(.is-me):not(.face-add) .face-dot")
        b.wait_for_selector(".person-card", timeout=5000)
        b.wait_for_timeout(600)
        shot(b, "person-sheet")
        check(b.locator(".person-card .hint").count() >= 1, "B: tapping A's face shows the friend state")

        # A switches to an anime face in the profile editor (the photo goes, the look stays)
        me_now = "u => fetch(u + '/me', {headers: {Authorization: 'Bearer ' + localStorage.getItem('changle.session')}}).then(r => r.json()).then(d => d.user)"
        a.goto(BASE + "#/me")
        a.wait_for_selector(".me-head")
        before = a.evaluate(me_now, api)
        a.click(".topbar-right .icon-btn")
        a.wait_for_selector(".profile-form .pf-kind")
        a.click(".pf-kind button:has-text('动漫头像')")
        make_anime(a, "男")
        try:
            a.wait_for_selector(".me-head .me-figure svg", timeout=6000)
            check(True, "A: switching to anime shows the figure on the profile")
        except Exception:
            check(False, "A: switching to anime shows the figure on the profile")
        a.wait_for_timeout(400)
        shot(a, "edit-A-anime")
        after = a.evaluate(me_now, api)
        check(after["lookOn"] and after["av"] > before["av"] and not before.get("lookOn"), f"A: the round face is redrawn as the look (av {before['av']} -> {after['av']}, lookOn {before.get('lookOn')} -> {after['lookOn']})")

        if SOLO:
            a.goto(BASE + "#/g/dice")
            a.wait_for_timeout(61500)
            a.goto(BASE + "#/me")
            a.wait_for_selector(".history-row", timeout=8000)
            check(True, "A: a one-phone game shows in history")
            shot(a, "me-history")

        browser.close()
    print("errors:", errors[:12])
    print("FAILS:", fails if fails else "none")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
