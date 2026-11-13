"""
The owner's back office, staying signed in, the monthly AI avatar, and the table's back button.
Runs against the local site and worker (worker/.dev.vars: DEV_SHOW_CODES=1, DEV_FAKE_DRAW=1,
MASTER_EMAIL=master@example.test, ADMIN_EMAILS=master@example.test).

  - the owner and a player sign up; the owner's profile links to the back office
  - the owner opens a table, the player sits down, a game starts; the host's back button takes
    the table to the lobby (nobody leaves); the back office shows the player online, at that table
  - kick the player (signed out on their phone, off the table); ban them (their phone shows the
    blocked sign, their email can't sign in); unban
  - pause the site: a guest's table closes, a visitor sees the closed sign, the owner still gets
    in and sees the strip; reopen
  - the monthly AI avatar: six drawings, then no more; choosing one ends the month; the owner draws freely
  - redrawing from the figure you chose (the phone sends no picture)
  - a phone whose storage was wiped is still signed in (the cookie)
  - a code typed on a composing keyboard keeps one letter per letter

  python3 scripts/admin_check.py [base_url] [api_url] [out_dir]
"""
import base64
import io
import json
import os
import random
import string
import sys
import urllib.error
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/").rstrip("/") + "/"
API = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8787").rstrip("/") + "/api"
OUT = sys.argv[3] if len(sys.argv) > 3 else "/tmp/admin-shots"
ORIGIN = BASE.rstrip("/")
os.makedirs(OUT, exist_ok=True)
MASTER = "master@example.test"

fails: list[str] = []
errors: list[str] = []


def check(ok: bool, what: str):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def call(method: str, path: str, token: str = "", body=None):
    """The API as a phone calls it: JSON in and out, the session as a bearer token."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Origin", ORIGIN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def jpeg(color=(200, 120, 160)) -> str:
    im = Image.new("RGB", (300, 400), color)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=80)
    return base64.b64encode(b.getvalue()).decode()


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")


def phone(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark", locale="zh-CN")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    return ctx, page


def signup(page, email, name):
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
    page.fill("#pf-name", name)
    page.fill("#pf-phone", "+1 604 555 01" + str(random.randint(10, 99)))
    page.fill("#pf-city", "Vancouver")
    page.click(".pf-genders .chip:text-is('男')")
    page.fill("#pf-bio", "周末组局。")
    page.check(".pf-check input")
    page.click(".profile-form button[type=submit]")
    page.wait_for_selector(".acct-me", timeout=10000)


def signin(page, email):
    page.goto(BASE)
    page.wait_for_selector(".acct-signin", timeout=15000)
    page.click(".acct-signin")
    page.wait_for_selector("#si-email")
    page.fill("#si-email", email)
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".otp-input")
    page.wait_for_function("document.querySelector('.otp-input').value.length === 6")
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".acct-me", timeout=10000)


def token_of(page) -> str:
    return page.evaluate("localStorage.getItem('changle.session') || ''")


def guest_socket(page, code, name, create):
    """A guest at a table straight over the room socket (window.__ws), as a phone would sit down."""
    ws_base = API.replace("http", "ws").rsplit("/api", 1)[0]
    page.evaluate(
        """([url, code, name, create]) => new Promise((ok) => {
            const ws = new WebSocket(url + '/room/' + code + '/ws');
            window.__ws = ws; window.__closed = null; window.__msgs = [];
            ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', pid: 'g' + Math.random().toString(36).slice(2, 10), name, create }));
            ws.onmessage = (e) => { window.__msgs.push(e.data); if (String(e.data).includes('"room"')) ok(true); };
            ws.onclose = (e) => { window.__closed = e.code; ok(false); };
        })""",
        [ws_base, code, name, create],
    )


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    player_email = f"player.{tag}@example.com"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        octx, owner = phone(browser)
        pctx, player = phone(browser)
        gctx, guest = phone(browser)

        # ---- the owner and a player ----
        try:
            signup(owner, MASTER, "Steve")
        except Exception:
            # a second run: the owner's account is already there, and the code signed it in
            owner.goto(BASE)
            owner.wait_for_selector(".acct-me", timeout=10000)
        signup(player, player_email, "Kai")
        otok, ptok = token_of(owner), token_of(player)
        st, me = call("GET", "/me", otok)
        check(st == 200 and me["user"].get("master") is True, "the owner's account is the master")
        st, me = call("GET", "/me", ptok)
        check(st == 200 and not me["user"].get("master"), "a player's account is not")
        check(call("GET", "/admin/overview", ptok)[0] == 403, "a player can't open the back office")

        owner.goto(BASE + "#/me")
        owner.wait_for_selector(".me-head", timeout=10000)
        check(owner.locator(".me-foot a[href='/admin']").count() == 1, "the owner's profile links to the back office")
        player.goto(BASE + "#/me")
        player.wait_for_selector(".me-head", timeout=10000)
        check(player.locator(".me-foot a[href='/admin']").count() == 0, "the player's profile doesn't")

        # ---- a table: the host's back button goes to the lobby ----
        owner.goto(BASE)
        owner.wait_for_selector(".online-btn")
        owner.click(".online-btn")
        owner.wait_for_selector("#online-name")
        owner.get_by_role("button", name="开一桌", exact=True).click()
        owner.wait_for_selector(".lobby .faces", timeout=10000)
        code = owner.evaluate("location.pathname").split("/")[-1]
        player.goto(BASE + f"#/r/{code}")
        player.wait_for_selector(".join-card, .lobby", timeout=10000)
        if player.locator(".join-card").count():
            player.click(".join-card button[type=submit]")
        player.wait_for_selector(".lobby .faces", timeout=10000)
        owner.wait_for_function("document.querySelectorAll('.lobby .face:not(.face-add)').length === 2", timeout=8000)
        owner.click(".lobby-actions .btn-primary")
        owner.wait_for_selector(".net-screen:not(.lobby-screen)", timeout=8000)
        owner.wait_for_timeout(500)
        owner.click(".topbar .topbar-side .icon-btn")
        owner.wait_for_selector(".sheet :text('回大厅')", timeout=5000)
        shot(owner, "host-back-sheet")
        owner.click(".sheet button:has-text('回大厅')")
        try:
            owner.wait_for_selector(".lobby", timeout=6000)
            player.wait_for_selector(".lobby", timeout=6000)
            check(True, "the host's back button ends the game and the whole table is back in the lobby")
        except Exception:
            check(False, "the host's back button ends the game and the whole table is back in the lobby")
        check(owner.evaluate("location.pathname").endswith(code) and player.evaluate("location.pathname").endswith(code), "nobody left the table")

        # ---- the back office: the player is online, at this table ----
        owner.goto(BASE + "#/admin")
        owner.wait_for_selector(".adm-switch", timeout=10000)
        owner.wait_for_timeout(1200)
        st, o = call("GET", "/admin/overview", otok)
        mine = [x for x in o.get("online", []) if x["email"] == player_email]
        check(st == 200 and len(mine) == 1 and mine[0]["where"] and mine[0]["where"]["code"] == code, f"the back office shows the player online at table {code}")
        check(any(r["code"] == code for r in o.get("rooms", [])), "and lists the table")
        shot(owner, "admin")

        # ---- kick: the player's phone is signed out and off the table ----
        uid = mine[0]["id"] if mine else ""
        st, _ = call("POST", "/admin/kick", otok, {"uid": uid})
        check(st == 200, "kick the player")
        try:
            player.wait_for_selector(".acct-signin, .notice-screen", timeout=8000)
            check(True, "the kicked player's phone is signed out (and off the table)")
        except Exception:
            check(False, "the kicked player's phone is signed out (and off the table)")
        check(call("GET", "/me", ptok)[0] == 401, "their old session no longer works")

        # ---- ban, and unban ----
        signin(player, player_email)
        ptok = token_of(player)
        st, _ = call("POST", "/admin/ban", otok, {"uid": uid, "on": True})
        check(st == 200, "ban the player")
        try:
            player.wait_for_selector(".closed-sign", timeout=8000)
            check(True, "the banned player's phone shows the blocked sign")
        except Exception:
            check(False, "the banned player's phone shows the blocked sign")
        shot(player, "banned")
        st, r = call("POST", "/auth/code", "", {"email": player_email})
        check(st == 403 and r.get("error") == "banned", f"a banned email can't get a sign-in code ({st} {r})")
        st, o = call("GET", "/admin/overview", otok)
        check(any(x["id"] == uid for x in o["banned"]["users"]), "the back office lists them as banned")
        call("POST", "/admin/ban", otok, {"uid": uid, "on": False})
        st, o = call("GET", "/admin/overview", otok)
        check(not any(x["id"] == uid for x in o["banned"]["users"]) and not o["banned"]["devices"], "unbanned: off the list, phones too")

        # ---- pause the site ----
        guest.goto(BASE)
        guest.wait_for_selector(".online-btn", timeout=10000)
        gcode = "".join(random.choice("ABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(4))
        guest_socket(guest, gcode, "Guest", True)
        st, r = call("POST", "/admin/pause", otok, {"on": True})
        check(st == 200 and r.get("paused") is True, "pause the site")
        guest.wait_for_function("window.__closed !== null", timeout=8000)
        check(guest.evaluate("window.__closed") == 4004 and any('"paused"' in m for m in guest.evaluate("window.__msgs")), "a guest's table closes with 'paused'")
        st, r = call("GET", "/wishes", "")
        check(st == 503 and r.get("error") == "paused", "the API answers 'paused' to everyone else")
        check(call("GET", "/me", otok)[0] == 200, "the owner still gets in")
        vctx, visitor = phone(browser)
        visitor.wait_for_timeout(11000)  # (the open/closed answer is cached at the edge for 10 s)
        visitor.goto(BASE)
        try:
            visitor.wait_for_selector(".closed-sign", timeout=10000)
            check(True, "a visitor sees the closed sign")
        except Exception:
            check(False, "a visitor sees the closed sign")
        shot(visitor, "paused-visitor")
        owner.goto(BASE)
        try:
            owner.wait_for_selector(".paused-strip", timeout=10000)
            check(owner.locator(".acct-me").count() == 1, "the owner sees the site and the paused strip")
        except Exception:
            check(False, "the owner sees the site and the paused strip")
        shot(owner, "paused-owner")
        guest_socket(guest, gcode, "Guest", True)
        check(guest.evaluate("window.__closed") == 4004, "nobody else can sit down while paused")
        st, r = call("POST", "/admin/pause", otok, {"on": False})
        check(st == 200 and r.get("paused") is False, "reopen the site")
        visitor.wait_for_timeout(11000)
        visitor.goto(BASE)
        visitor.wait_for_selector(".online-btn", timeout=10000)
        check(visitor.locator(".closed-sign").count() == 0, "the visitor is back in")

        # ---- the monthly AI avatar (the player signs in again: the ban ended their sessions) ----
        signin(player, player_email)
        ptok = token_of(player)
        st, a = call("POST", "/avatar/allowance", ptok, {})
        check(st == 200 and a.get("left") == a.get("per") == 6, f"a new month: 6 drawings ({a})")
        pic = jpeg()
        lefts = []
        for _ in range(6):
            st, r = call("POST", "/avatar/draw", ptok, {"image": pic, "mime": "image/jpeg", "from": "photo", "choices": {}})
            lefts.append(r.get("left") if st == 200 else f"{st}:{r.get('error')}")
        check(lefts == [5, 4, 3, 2, 1, 0], f"each drawing counts ({lefts})")
        st, r = call("POST", "/avatar/draw", ptok, {"image": pic, "mime": "image/jpeg", "from": "photo", "choices": {}})
        check(st == 429 and r.get("error") == "month", f"the seventh is refused: this month's is done ({st} {r})")
        st, a = call("POST", "/avatar/allowance", otok, {})
        check(st == 200 and a.get("left") is None, "the owner draws without a limit")
        # choosing a drawing ends the month (a fresh account)
        p2ctx, p2 = phone(browser)
        signup(p2, f"second.{tag}@example.com", "Lin")
        t2 = token_of(p2)
        st, r = call("POST", "/avatar/draw", t2, {"image": pic, "mime": "image/jpeg", "from": "photo", "choices": {}})
        full = r.get("image", "")
        st, r = call("PUT", "/me/figure", t2, {"full": full, "round": pic, "mime": "image/jpeg", "choices": {}})
        check(st == 200, "save a drawing")
        st, a = call("POST", "/avatar/allowance", t2, {})
        check(a.get("left") == 0 and a.get("done") is True, f"choosing one uses up the month ({a})")
        st, r = call("POST", "/avatar/draw", t2, {"from": "saved", "choices": {"hair": "bob"}})
        check(st == 429 and r.get("error") == "month", "so a change waits for next month")

        # ---- redrawing from the figure you chose: the phone sends no picture ----
        call("PUT", "/me/figure", otok, {"full": pic, "round": pic, "mime": "image/jpeg", "choices": {}})
        st, r = call("POST", "/avatar/draw", otok, {"from": "saved", "choices": {"hair": "bob"}})
        check(st == 200 and len(r.get("image", "")) > 1000, f"redraw from the saved figure ({st} {r.get('error')})")
        st, r = call("POST", "/avatar/draw", ptok, {"from": "saved", "choices": {}})
        check(st == 429 or st == 401, "(someone without a saved figure, or out of drawings, is told so)")

        # the maker on the profile: change the hair and draw (no fetch of the picture)
        owner.goto(BASE + "#/me")
        owner.reload()  # (the figure was saved through the API, behind the page's back)
        owner.wait_for_selector(".me-head", timeout=10000)
        owner.click(".topbar-right .icon-btn")
        owner.wait_for_selector(".profile-form", timeout=5000)
        owner.click(".pf-kind button:has-text('动漫头像')")
        owner.wait_for_selector(".mk .mk-dock", timeout=6000)
        owner.click(".mk-tab:has-text('发型')")
        owner.click(".mk-panel .chip:has-text('波波头')")
        owner.click(".mk-foot .btn-primary")
        try:
            owner.wait_for_selector(".mk-acts .btn-primary", timeout=15000)
            check(owner.locator(".mk-err").count() == 0, "the maker redraws your figure with new hair (no 'couldn't connect')")
        except Exception:
            check(False, f"the maker redraws your figure with new hair ({owner.locator('.mk-err').all_inner_texts()})")
        shot(owner, "maker-redraw")
        owner.keyboard.press("Escape")

        # ---- staying signed in: a wiped phone gets its session back from the cookie ----
        owner.goto(BASE)
        owner.wait_for_selector(".acct-me", timeout=10000)
        owner.evaluate("localStorage.removeItem('changle.session'); localStorage.removeItem('changle.me')")
        owner.reload()
        try:
            owner.wait_for_selector(".acct-me", timeout=8000)
            check(token_of(owner) != "", "a phone whose storage was wiped is still signed in")
        except Exception:
            check(False, "a phone whose storage was wiped is still signed in")
        # signing out clears the cookie too
        owner.goto(BASE + "#/me")
        owner.wait_for_selector(".me-foot", timeout=10000)
        owner.click(".me-foot button:has-text('退出登录')")
        owner.wait_for_timeout(800)
        owner.goto(BASE)
        owner.wait_for_timeout(1500)
        check(owner.locator(".acct-signin").count() == 1, "after signing out, the cookie doesn't sign the phone back in")

        # ---- a code typed on a composing keyboard ----
        guest.goto(BASE)
        guest.wait_for_selector(".online-btn")
        guest.click(".online-btn")
        guest.wait_for_selector("#online-code")
        guest.click("#online-code")
        cdp = gctx.new_cdp_session(guest)
        for ch in "qk":
            cdp.send("Input.imeSetComposition", {"text": ch, "selectionStart": 1, "selectionEnd": 1})
            cdp.send("Input.insertText", {"text": ch})
        guest.wait_for_timeout(200)
        val = guest.input_value("#online-code")
        check(val == "QK", f"letters typed through a composing keyboard come out once each ({val!r})")

        browser.close()

    real = [e for e in errors if "favicon" not in e]
    if real:
        print("\npage errors:\n  " + "\n  ".join(real[:10]))
    # an error thrown in a page is a failure, not a footnote (a crash the "something went wrong" screen caught still counts)
    check(not real, f"no error was thrown in any page ({len(real)})")
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
