"""
Review captures for the account screens: sign-in steps, profile with history, a friend's page,
the table sheet and the lobby, in both languages and at 360px.

  python3 scripts/account_shots.py [base_url] [out_dir]
"""
import os
import random
import string
import sys

sys.path.insert(0, os.path.dirname(__file__))
from account_check import photo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/").rstrip("/") + "/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/account-review"
API = BASE.replace(":5173", ":8787") + "api"
os.makedirs(OUT, exist_ok=True)
errors: list[str] = []


def phone(browser, width=390, lang="zh"):
    ctx = browser.new_context(viewport={"width": width, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark")
    ctx.add_init_script(f"try {{ const k='lazysusan.settings.v1'; const s=JSON.parse(localStorage.getItem(k)||'{{}}'); s.lang='{lang}'; localStorage.setItem(k, JSON.stringify(s)); }} catch {{}}")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console {m.text}"))
    return ctx, page


def signup(page, email, name, city, gender_idx, bio, pic=None, shots_prefix=None):
    page.goto(BASE)
    page.wait_for_selector(".acct-signin", timeout=15000)
    if shots_prefix:
        page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/{shots_prefix}-home-out.png")
    page.click(".acct-signin")
    page.wait_for_selector("#si-email")
    page.fill("#si-email", email)
    if shots_prefix:
        page.wait_for_timeout(700)
        page.screenshot(path=f"{OUT}/{shots_prefix}-signin-email.png")
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".otp-input")
    page.wait_for_function("document.querySelector('.otp-input').value.length === 6")
    if shots_prefix:
        page.wait_for_timeout(500)
        page.screenshot(path=f"{OUT}/{shots_prefix}-signin-code.png")
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".profile-form", timeout=10000)
    if shots_prefix:
        page.wait_for_timeout(600)
        page.screenshot(path=f"{OUT}/{shots_prefix}-signup-empty.png")
    if pic:
        page.set_input_files(".profile-form input[type=file]", files=[{"name": "me.png", "mimeType": "image/png", "buffer": pic}])
        page.wait_for_selector(".pf-photo img", timeout=5000)
    page.fill("#pf-name", name)
    page.fill("#pf-phone", "+1 604 555 0" + str(random.randint(100, 999)))
    page.fill("#pf-city", city)
    page.click(f".pf-genders .chip >> nth={gender_idx}")
    page.fill("#pf-bio", bio)
    page.check(".pf-check input")
    page.click(".profile-form button[type=submit]")
    page.wait_for_selector(".acct-me", timeout=10000)
    page.wait_for_timeout(500)


def token(page):
    return page.evaluate("localStorage.getItem('changle.session')")


def call(page, method, path, body=None):
    return page.evaluate(
        "([u, m, b]) => fetch(u, {method: m, headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('changle.session')}, body: b ? JSON.stringify(b) : undefined}).then(r => r.json())",
        [API + path, method, body],
    )


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        actx, a = phone(browser, 390, "en")
        signup(a, f"steve.{tag}@example.com", "Steve", "Vancouver", 1, "Hosts the Friday table. Best game: Rogue Thirteen.", photo((176, 114, 255), (255, 95, 162)), shots_prefix="en")
        bctx, b = phone(browser, 360, "zh")
        signup(b, f"mia.{tag}@example.com", "林小米", "Toronto", 0, "酒量一般，气氛担当。周五有空。", None, shots_prefix="zh360")

        # some history for both, and a friendship
        for g, ppl, mins in [("rogue", ["Mia", "Jay", "Kev", "Ann"], 34), ("dice", ["Mia", "Jay"], 12), ("truth", ["Mia", "Jay", "Kev", "Ann", "Bo", "Cy"], 51), ("rogue", ["Jay"], 8)]:
            call(a, "POST", "/me/history", {"game": g, "players": ppl, "minutes": mins})
        call(b, "POST", "/me/history", {"game": "king", "players": ["Steve", "Jay"], "minutes": 20})
        aid = call(a, "GET", "/me")["user"]["id"]
        bid = call(b, "GET", "/me")["user"]["id"]
        call(b, "POST", f"/friends/{aid}", {})
        call(a, "POST", f"/friends/{bid}", {})
        call(b, "POST", f"/chat/{aid}", {"body": "周五几点？"})

        a.goto(BASE + "#/me")
        a.wait_for_selector(".history-row", timeout=8000)
        a.wait_for_timeout(700)
        a.screenshot(path=f"{OUT}/en-me-history.png")
        a.click(".me-tabs button:nth-child(2)")
        a.wait_for_selector(".people .person", timeout=5000)
        a.wait_for_timeout(400)
        a.screenshot(path=f"{OUT}/en-me-friends.png")
        a.click(".icon-btn[aria-label='Edit profile']")
        a.wait_for_selector(".profile-form")
        a.wait_for_timeout(700)
        a.screenshot(path=f"{OUT}/en-edit.png")
        a.keyboard.press("Escape")

        b.goto(BASE + f"#/u/{aid}")
        b.wait_for_selector(".history-row", timeout=8000)
        b.wait_for_timeout(700)
        b.screenshot(path=f"{OUT}/zh360-user-page.png", full_page=True)
        b.goto(BASE)
        b.wait_for_selector(".acct-me")
        b.wait_for_timeout(1200)
        b.screenshot(path=f"{OUT}/zh360-home-in.png")

        # a table: lobby, table sheet
        a.goto(BASE)
        a.wait_for_selector(".online-btn")
        a.click(".online-btn")
        a.wait_for_selector("#online-name")
        a.get_by_role("button", name="Open a table", exact=True).click()
        a.wait_for_selector(".lobby .faces", timeout=10000)
        code = a.evaluate("location.hash").split("/")[-1]
        b.goto(BASE + f"#/r/{code}")
        b.wait_for_selector(".join-card", timeout=10000)
        b.wait_for_timeout(600)
        b.screenshot(path=f"{OUT}/zh360-join.png")
        b.click(".join-card button[type=submit]")
        b.wait_for_selector(".lobby .faces", timeout=10000)
        a.wait_for_function("document.querySelectorAll('.lobby .face:not(.face-add)').length === 2", timeout=8000)
        a.wait_for_timeout(2600)
        a.screenshot(path=f"{OUT}/en-lobby.png")
        a.click(".table-btn")
        a.wait_for_selector(".seat-list")
        a.wait_for_timeout(700)
        a.screenshot(path=f"{OUT}/en-table-sheet.png")
        browser.close()
    print("errors:", errors[:10] or "none")


if __name__ == "__main__":
    main()
