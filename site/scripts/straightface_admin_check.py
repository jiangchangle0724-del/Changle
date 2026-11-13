"""
一本正经's desk in the back office, and what the phones send it, against the local site and rooms
server (worker/.dev.vars: DEV_SHOW_CODES=1, MASTER_EMAIL=master@example.test,
ADMIN_EMAILS=master@example.test). The server slows down one address after many rounds an hour:
restart it after three or four runs.

  - rounds count per card and per table size, posted the way the phones post them
  - flagged cards: two phones the same card (in two languages), one phone another
  - only the owner reaches the desk: a guest gets 401, a signed-in player 403
  - the desk: a flagged card once however many flagged it, with what each said; to fix; the list
    copied for the game's chat; nothing wrong; fixed; put back; how the cards play, the too-easy
    rule and the judge's hit rate by table size against its target
  - phone size, both languages, no sideways scroll; screenshots to local-shots/straightface-admin/

  python3 scripts/straightface_admin_check.py [base_url] [api_url]
"""
import json
import os
import random
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/").rstrip("/") + "/"
API = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8787").rstrip("/") + "/api"
ORIGIN = BASE.rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "straightface-admin")
os.makedirs(OUT, exist_ok=True)
MASTER = "master@example.test"
RUN = "".join(random.choice("abcdefghjkmnpqrstuvwxyz") for _ in range(6))
FLAGGED, FLAGGED_TERM = "petrichor", "Petrichor"
# the card bank's ids and terms, read off the source (the cards whose term is the same in both languages
# are the ones the desk can be checked by in either)
BANK = re.findall(
    r'^    id: "([^"]+)",\n    pack: "([^"]+)",\n    level: (\d),\n    term: \{ zh: "([^"]*)", en: "([^"]*)" \},',
    open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "straightface.ts"), encoding="utf-8").read(),
    re.M,
)

fails: list[str] = []


def check(ok: bool, what: str):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def call(method: str, path: str, body=None, token: str = "", device: str = "", ip: str = ""):
    """The API as a phone calls it: JSON in and out, the phone's id, the session if signed in."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Origin", ORIGIN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if device:
        req.add_header("X-Device", device)
    if ip:
        req.add_header("CF-Connecting-IP", ip)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def phone(browser, lang: str):
    ctx = browser.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=1, is_mobile=True, has_touch=True, locale="zh-CN" if lang == "zh" else "en-CA")
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=ORIGIN)
    ctx.add_init_script(
        "localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('lazysusan.entered','1');"
        % json.dumps(json.dumps({"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": []}))
    )
    pg = ctx.new_page()
    pg._errs = []
    pg.on("pageerror", lambda e: pg._errs.append(str(e)))
    pg.on("console", lambda m: pg._errs.append(m.text) if m.type == "error" else None)
    return pg


def enter(pg, email: str, name: str):
    """Sign in with the code the dev server shows; a new account fills in its profile."""
    pg.goto(BASE)
    pg.wait_for_selector(".acct-signin", timeout=15000)
    pg.click(".acct-signin")
    pg.wait_for_selector("#si-email")
    pg.fill("#si-email", email)
    pg.click(".signin button[type=submit]")
    pg.wait_for_selector(".otp-input")
    pg.wait_for_function("document.querySelector('.otp-input').value.length === 6")
    pg.click(".signin button[type=submit]")
    pg.wait_for_selector(".profile-form, .acct-me", timeout=10000)
    if pg.locator(".profile-form").count():
        pg.fill("#pf-name", name)
        pg.fill("#pf-phone", "+1 604 555 01" + str(random.randint(10, 99)))
        pg.fill("#pf-city", "Vancouver")
        pg.click(".pf-genders .chip >> nth=0")
        pg.fill("#pf-bio", "周末组局。")
        pg.check(".pf-check input")
        pg.click(".profile-form button[type=submit]")
        pg.wait_for_selector(".acct-me", timeout=10000)
    return pg.evaluate("localStorage.getItem('changle.session') || ''")


def shot(pg, name: str):
    pg.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)


def desk(pg):
    """The 一本正经 section of the back office, once it has loaded."""
    pg.goto(BASE + "#/admin")
    pg.wait_for_selector(".sfa", timeout=15000)
    pg.wait_for_selector(".sfa .sfa-table", timeout=15000)
    pg.wait_for_timeout(300)
    return pg.locator(".sfa")


def card_box(pg, term: str, stage: str):
    """A flagged card's box: 'waiting' has 要改 / Needs fixing, 'fixing' has 改好了 / Fixed."""
    label = {"waiting": ["要改", "Needs fixing"], "fixing": ["改好了", "Fixed"]}[stage]
    boxes = pg.locator(".sfa-card").filter(has=pg.locator("header strong", has_text=re.compile("^" + re.escape(term) + "$")))
    return boxes.filter(has=pg.get_by_role("button", name=re.compile("^(" + "|".join(label) + ")$")))


def reload_after(pg, click):
    """Press a decision button and wait for the desk to come back with it applied."""
    with pg.expect_response(lambda r: "/api/admin/sf" in r.url and r.request.method == "GET", timeout=10000):
        click()
    pg.wait_for_timeout(300)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        owner = phone(browser, "zh")
        token = enter(owner, MASTER, "Steve")
        check(bool(token), "the owner is signed in")

        # a clean desk: whatever earlier runs left waiting is set aside
        st, d = call("GET", "/admin/sf", token=token)
        check(st == 200 and "waiting" in d and "sizes" in d, f"the owner reads the desk ({st})")
        old = [r["id"] for r in d.get("waiting", []) + d.get("fixing", [])]
        if old:
            call("POST", "/admin/sf/reports", {"ids": old, "status": "no"}, token=token)
        before = {c["card"]: c for c in d.get("cards", [])}
        # the too-easy card: one nobody has played yet here, so its numbers are exactly this run's
        same = [c for c in BANK if c[3] == c[4] and c[0] != FLAGGED]
        easy = next((c for c in same if c[0] not in before), same[0])
        EASY, EASY_TERM = easy[0], easy[3]
        check(len(BANK) >= 300 and EASY not in before, f"a card nobody has played here for the too-easy rule ({EASY})")

        # rounds as phones post them: one card the judge nearly always sees through, a few table sizes
        posted = 0
        def round_(card, fooled, players):
            nonlocal posted
            posted += 1
            return call("POST", "/sf/round", {"card": card, "fooled": fooled, "players": players}, device=f"seed-{RUN}-{posted}", ip=f"10.9.{posted // 200}.{posted % 200}")
        codes = [round_(EASY, i == 0, 4)[0] for i in range(10)]
        check(codes == [200] * 10, f"ten rounds on {EASY}, the judge right in nine ({codes})")
        round_("mondegreen", True, 3)
        round_("mondegreen", False, 3)
        others = [c[0] for c in same if c[0] != EASY][:3]
        for i in range(22):
            round_(others[i % 3], i % 2 == 0, 5 if i % 2 else 6)
        check(call("POST", "/sf/round", {"card": "nope", "fooled": True, "players": 4}, device="seed-bad")[0] == 400, "a card that isn't one doesn't count")
        st, s = call("GET", "/sf/stats")
        was = before.get(EASY, {"rounds": 0})["rounds"]
        check(st == 200 and s["cards"][EASY][0] >= was + 10, f"the numbers come back to the phones ({s['cards'].get(EASY)})")

        # three flags: two phones the same card (in each language), one phone another
        for dev, card, reason, note, lang in [
            (f"flag-{RUN}-a", FLAGGED, "wrong", "测试：释义好像不对", "zh"),
            (f"flag-{RUN}-b", FLAGGED, "easy", "", "en"),
            (f"flag-{RUN}-c", EASY, "other", "test: just checking", "en"),
        ]:
            check(call("POST", "/sf/report", {"card": card, "reason": reason, "note": note, "lang": lang}, device=dev, ip="10.8.0.1")[0] == 200, f"{dev} flags {card}")
        call("POST", "/sf/report", {"card": FLAGGED, "reason": "unfit", "note": "", "lang": "zh"}, device=f"flag-{RUN}-a", ip="10.8.0.1")
        st, d = call("GET", "/admin/sf", token=token)
        check(len([r for r in d["waiting"] if r["card"] == FLAGGED]) == 2, "the same phone flagging the same card again is still one report")

        # only the owner: a guest, then a signed-in player
        check(call("GET", "/admin/sf")[0] == 401, "a guest can't read the desk")
        player = phone(browser, "zh")
        ptoken = enter(player, f"player-{RUN}@example.test", "小雨")
        check(call("GET", "/admin/sf", token=ptoken)[0] == 403 and call("POST", "/admin/sf/reports", {"ids": [1], "status": "no"}, token=ptoken)[0] == 403, "a player can't read it or decide")
        player.context.close()

        # the desk, in Chinese
        sec = desk(owner)
        head = sec.locator(".adm-h").first.inner_text()
        check("一本正经" in head and re.search(r"\d", head) is not None, f"the desk's heading, with the count waiting ({head!r})")
        box = card_box(owner, FLAGGED_TERM, "waiting")
        check(box.count() == 1, "the card two phones flagged shows once")
        text = box.inner_text() if box.count() else ""
        check("2 人说有问题" in text, "with how many flagged it")
        check("雨后泥土" in text and "smell of earth" in text, "the card as each of them read it (Chinese and English)")
        check("释义或冷知识不对" in text and "测试：释义好像不对" in text and "太简单" in text, "what each said")
        check("打过" in text and "裁判猜中" in text, "and how the card plays")
        shot(owner, "zh-1-waiting")

        reload_after(owner, lambda: box.get_by_role("button", name="要改").click())
        check(card_box(owner, FLAGGED_TERM, "waiting").count() == 0 and card_box(owner, FLAGGED_TERM, "fixing").count() == 1, "to fix: it moves under the cards to fix")
        check(owner.get_by_text("卡片写在代码里").count() == 1, "with how a fix gets made")
        owner.get_by_role("button", name="复制清单").click()
        owner.wait_for_timeout(400)
        clip = owner.evaluate("navigator.clipboard.readText()")
        check(clip.startswith("一本正经 要改的卡") and f"{FLAGGED} {FLAGGED_TERM}" in clip and "测试：释义好像不对" in clip, "the list copied for the game's chat: the card, why, what they said")
        check("太好猜" in clip and EASY in clip, "and the cards the judge nearly always sees through")
        print("    " + clip.replace("\n", "\n    "))

        tbox = card_box(owner, EASY_TERM, "waiting")
        check(tbox.count() == 1 and "test: just checking" in tbox.inner_text(), "the other flagged card waits too")
        reload_after(owner, lambda: tbox.get_by_role("button", name="没问题").click())
        check(card_box(owner, EASY_TERM, "waiting").count() == 0, "nothing wrong: off the list")
        fbox = card_box(owner, FLAGGED_TERM, "fixing")
        reload_after(owner, lambda: fbox.get_by_role("button", name="改好了").click())
        check(card_box(owner, FLAGGED_TERM, "fixing").count() == 0, "fixed: off the cards to fix")
        owner.get_by_role("button", name=re.compile(r"^处理过的 \d+ 条$")).click()
        decided = owner.locator(".sfa-decided li")
        check(decided.count() >= 3 and "改好了" in owner.locator(".sfa-decided").inner_text() and "没问题" in owner.locator(".sfa-decided").inner_text(), "the decided ones, with what was decided")
        back = decided.filter(has_text=EASY_TERM).first
        reload_after(owner, lambda: back.get_by_role("button", name="放回去").click())
        check(card_box(owner, EASY_TERM, "waiting").count() == 1, "put back: waiting again")

        # how the cards play
        tables = owner.locator(".sfa-table")
        sizes = tables.nth(0).inner_text()
        check("4 人" in sizes and "45 到 60%" in sizes and "5 到 6 人" in sizes and "7 到 9 人" in sizes, "the hit rate by table size, with each target")
        rows = {r.locator("th").inner_text(): r.inner_text() for r in tables.nth(0).locator("tbody tr").all()}
        check(any(v in rows.get("5 到 6 人", "") for v in ["正好", "偏高", "偏低"]), f"enough rounds at five or six: a verdict ({rows.get('5 到 6 人', '')!r})")
        check("局数还少" in rows.get("7 到 9 人", "局数还少"), "too few at seven to nine: no verdict yet")
        easy_row = tables.nth(1).locator("tbody tr.is-easy").filter(has_text=EASY_TERM)
        check(easy_row.count() == 1, "the too-easy card stands out in the cards table")
        over = owner.evaluate("() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
        check(over == 0, f"no sideways scroll at phone size ({over}px over)")
        shot(owner, "zh-2-after")
        sec.locator(".sfa-table").first.scroll_into_view_if_needed()
        owner.screenshot(path=os.path.join(OUT, "zh-3-numbers.png"))

        # the desk, in English
        en = phone(browser, "en")
        enter(en, MASTER, "Steve")
        desk(en)
        etext = en.locator(".sfa").inner_text()
        check("In All Seriousness · cards flagged" in etext and "How often the judge is right, by table size" in etext and "Too easy" in etext, "the desk in English")
        for label in ["Needs fixing", "Nothing wrong", "Copy the list", "Players", "Rounds", "Right", "Target"]:
            check(label in etext, f"English: {label}")
        en.get_by_role("button", name="Copy the list").click()
        en.wait_for_timeout(400)
        eclip = en.evaluate("navigator.clipboard.readText()")
        check(eclip.startswith("In All Seriousness cards to fix") and "Too easy" in eclip, "the list in English")
        shot(en, "en-1")

        for pg in (owner, en):
            real = [e for e in pg._errs if "favicon" not in e and "ResizeObserver" not in e]
            check(not real, f"no errors on the page ({real[:2]})")
        browser.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall good")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
