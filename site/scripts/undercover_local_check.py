"""谁是卧底 on one phone: the rules other tables play by (against the local site, port 5173).

usage: python3 scripts/undercover_local_check.py [base_url]   (UI_LANG=en WIDTH=320 for English on a small phone)

Seven at the table, one undercover and a blank. The first player doesn't know the word and asks for
a fresh pair (换一组词): the deal starts again. Someone forgets their word mid-talk and checks it
in the sheet (忘了词), which the phone's back button closes. The table ties: a run-off, then a
second tie, and nobody goes; round 2 never opens with the blank. The blank is voted out and guesses
wrong; the game goes on until the undercover is caught. The next game the blank guesses right and
wins alone: everyone else drinks. No page scrolls sideways or logs an error. Screenshots go to
local-shots/undercover-local/.
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
LANG = "en" if os.environ.get("UI_LANG", "zh") == "en" else "zh"
WIDTH = int(os.environ.get("WIDTH", "390"))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "undercover-local")
os.makedirs(OUT, exist_ok=True)
NAMES = ["Steve", "小雨", "Kevin", "阿强", "Lily", "大鹏", "Mia"]
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(NAMES)]
fails = []
zh = LANG == "zh"


def T(z, e):
    return z if zh else e


def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)


def until(fn, timeout=6000, step=120):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step / 1000)
    return None


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{LANG}-{WIDTH}-{tag}.png"))


def text(pg):
    return pg.evaluate("() => document.body.innerText")


def btn(pg, z, e, exact=True):
    return pg.get_by_role("button", name=T(z, e), exact=exact)


def tap(pg, loc):
    for _ in range(8):
        try:
            loc.first.click(timeout=1500)
            pg.wait_for_timeout(250)
            return True
        except Exception:
            clear_stamp(pg)
            pg.wait_for_timeout(250)
    return False


def clear_stamp(pg):
    for _ in range(12):
        if pg.locator(".stamp-layer").count() == 0:
            return
        for label in ("我喝了", "I drank", "继续", "Continue", "知道了", "OK"):
            b = pg.locator(".stamp-layer button", has_text=label)
            try:
                if b.count():
                    b.first.click(timeout=1000)
                    break
            except Exception:
                pass
        pg.wait_for_timeout(400)


def pick(pg, name):
    return tap(pg, pg.locator("main .picker button:not([disabled]), .ui-sheet .picker button:not([disabled])", has_text=re.compile("^\\s*" + re.escape(name) + "\\s*$")))


def lift(pg, scope=""):
    """Tap the lid until it is up (a lid closing after a fresh deal takes a moment to answer)."""
    for _ in range(5):
        tap(pg, pg.locator(f"{scope} .cloche-dome".strip()).last)
        if until(lambda: pg.locator(f"{scope} .cloche-content[aria-hidden=false]".strip()).count() > 0, timeout=1500):
            pg.wait_for_timeout(250)
            return True
    return False


def deal_all(pg, redeal=False):
    """Every player lifts the lid in turn; returns who holds which word (None for the blank)."""
    words = {}
    prev = None
    for i in range(len(NAMES)):
        # the last card slides out before the next comes in: wait for the next name
        name = until(lambda: (lambda n: n if n and n != prev and pg.locator(".turn-line .turn-name").count() == 1 else None)(pg.locator(".turn-line .turn-name").last.inner_text().strip()))
        prev = name
        ok(lift(pg), f"{name} lifts the lid")
        word = pg.locator(".cloche-content[aria-hidden=false] .word-big").last.inner_text().strip()
        words[name] = None if word.startswith(T("白板", "Blank")) else word
        if redeal and i == 0:
            fresh = pg.get_by_role("button", name=re.compile(T("不认识这个词", "Don't know this word")))
            ok(until(lambda: fresh.count() > 0), "a player who doesn't know the word can ask for a fresh pair")
            shot(pg, "01-fresh-pair-button")
            tap(pg, fresh)
            ok(until(lambda: T("换了一组新词", "A fresh pair") in text(pg)), "a fresh pair: the deal starts again from the first player")
            shot(pg, "02-fresh-pair")
            return deal_all(pg)
        got = btn(pg, "记住了，传给下一位", "Got it, pass it on")
        until(lambda: got.count() > 0 and got.first.is_visible())
        pg.wait_for_timeout(300)
        tap(pg, got)
    return words


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": WIDTH, "height": 760}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = ctx.new_page()
        pg.add_init_script(
            "localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('lazysusan.entered','1'); localStorage.removeItem('changle.undercover.night');"
            % json.dumps(json.dumps({"lang": LANG, "sound": False, "music": False, "customPenalty": "", "players": PLAYERS}))
        )
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(BASE + "#/g/undercover", wait_until="networkidle")
        pg.wait_for_timeout(700)

        tap(pg, pg.get_by_role("button", name=T("少一个卧底", "One undercover fewer")))
        tap(pg, pg.locator(".settings-row", has_text=T("加一个白板", "Add a blank")).locator("button"))
        ok(pg.locator(".settings-row", has_text=T("加一个白板", "Add a blank")).locator("button[aria-pressed=true]").count() == 1, "one undercover and a blank")
        tap(pg, btn(pg, "发词", "Deal the words"))
        words = deal_all(pg, redeal=True)
        blank = next(n for n, w in words.items() if w is None)
        civ_word = max(set(w for w in words.values() if w), key=list(words.values()).count)
        uc = next(n for n, w in words.items() if w and w != civ_word)
        ok(len(words) == 7, f"seven words dealt: the blank is {blank}, the undercover {uc}")

        first = until(lambda: pg.locator(".turn-line strong").inner_text().strip())
        ok(first and first != blank, f"the blank doesn't open the round ({first})")

        # 忘了词: Kevin checks his word again in the sheet; the back button closes it
        tap(pg, btn(pg, "忘了自己的词？", "Forgot your word?"))
        ok(until(lambda: pg.locator(".ui-sheet").count() > 0 and pg.locator(".ui-sheet").first.is_visible()), "the 'check your word' sheet opens")
        shot(pg, "03-peek-pick")
        pick(pg, "Kevin")
        ok(lift(pg, ".ui-sheet"), "Kevin lifts the lid in the sheet")
        seen = pg.locator(".ui-sheet .word-big").inner_text().strip()
        ok(words["Kevin"] is None and seen.startswith(T("白板", "Blank")) or seen == words["Kevin"], f"Kevin sees his own word ({seen})")
        shot(pg, "04-peek-word")
        pg.go_back()
        ok(until(lambda: pg.locator(".ui-sheet").count() == 0 or not pg.locator(".ui-sheet").first.is_visible()), "the phone's back button closes it")
        ok("/g/undercover" in pg.url and btn(pg, "忘了自己的词？", "Forgot your word?").count() == 1, f"and the game stays where it was ({pg.url})")

        # a tie: the run-off, then a second tie and nobody goes
        tap(pg, btn(pg, "投票", "Vote"))
        tap(pg, btn(pg, "平票，加赛", "Tie: run-off"))
        ok(until(lambda: T("平票加赛", "Tie run-off") in text(pg)), "the run-off: the tied describe again")
        shot(pg, "05-runoff-talk")
        tap(pg, btn(pg, "投票", "Vote"))
        ok(until(lambda: T("加赛：平票的人不投", "Run-off: the tied don't vote") in text(pg)), "the run-off vote says who votes")
        shot(pg, "06-runoff-vote")
        tap(pg, btn(pg, "又平了", "Tied again"))
        first2 = until(lambda: pg.locator(".turn-line strong").inner_text().strip())
        ok(first2 and first2 != blank, f"round 2, and the blank doesn't open it ({first2})")

        # the blank is voted out and guesses wrong: the game goes on
        tap(pg, btn(pg, "投票", "Vote"))
        pick(pg, blank)
        ok(until(lambda: T("最后一搏", "One last shot") in text(pg)), "the blank is out: one last shot at the civilians' word")
        shot(pg, "07-guess")
        ok(lift(pg), "the blank lifts the lid")
        ok(pg.locator(".cloche-content[aria-hidden=false] .word-big").last.inner_text().strip() == civ_word, "under the lid: the civilians' word")
        shot(pg, "08-guess-open")
        tap(pg, btn(pg, "没猜中", "Wrong"))
        ok(until(lambda: T("没猜中，游戏接着玩", "Wrong guess. The game goes on.") in text(pg)), "a wrong guess: the game goes on")
        shot(pg, "09-guess-wrong")
        tap(pg, btn(pg, "下一轮", "Next round"))
        tap(pg, btn(pg, "投票", "Vote"))
        pick(pg, uc)
        ok(until(lambda: T("出局", "Out") in text(pg) and uc in text(pg)), "the undercover is voted out")
        tap(pg, btn(pg, "看结果", "See the result"))
        clear_stamp(pg)
        ok(until(lambda: T("平民赢了", "Civilians win") in text(pg)), "the civilians win")

        # the next game the blank guesses right and wins alone
        tap(pg, btn(pg, "重开一局", "New round"))
        tap(pg, btn(pg, "发词", "Deal the words"))
        words = deal_all(pg)
        blank = next(n for n, w in words.items() if w is None)
        tap(pg, btn(pg, "投票", "Vote"))
        pick(pg, blank)
        ok(lift(pg), "the blank lifts the lid again")
        tap(pg, btn(pg, "猜中了", "Got it right"))
        ok(until(lambda: T("猜中了平民的词，白板赢！", "Guessed the civilians' word: the blank wins!") in text(pg)), "a right guess: the blank wins")
        shot(pg, "10-guess-right")
        tap(pg, btn(pg, "看结果", "See the result"))
        ok(until(lambda: pg.locator(".stamp-layer").count() > 0), "the penalty comes up")
        stamp = pg.locator(".stamp-layer").inner_text()
        ok(blank not in stamp and all(n in stamp for n in NAMES if n != blank), f"everyone but the blank drinks ({stamp[:90]!r})")
        shot(pg, "11-penalty")
        clear_stamp(pg)
        ok(until(lambda: T("白板赢了", "The blank wins") in text(pg)), "the end: the blank wins")
        shot(pg, "12-end")

        ok(pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), "nothing scrolls sideways")
        ok(not errs, f"no errors ({errs[:2]})")
        browser.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
