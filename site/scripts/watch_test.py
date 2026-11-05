"""Watching: every game's own big-screen view. A table of three players (four for Undercover), one
phone that only watches (held sideways), and two TVs (1920x1080 and 1280x720) play each game with a
big-screen view through. On the TVs and the watching phone: every phase shows the game's own view,
nothing secret is anywhere in the page (a player's word, card, task or vote before the reveal),
and there are no errors. Against the local dev servers (HANDOFF.md).

usage: python3 scripts/watch_test.py [base_url] [zh|en] [game ...]
games: superlatives undercover tune drama truth wheel dice rogue king prompts postit freeze euchre draw limbo punchline trip dj hide trip-host
(trip last: it sends the table off to 到此一游; dj, hide and trip-host each open a table of their own.
Neither game's own server is needed: its answers and pages are stood in for.)
Screenshots of every phase go to $SHOTS (default: scratchpad/watch).
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
import party_test as P  # noqa: E402
from party_test import me, ok, phone, room, until, view  # noqa: E402

BASE = P.BASE
LANG = next((a for a in sys.argv[1:] if a in ("zh", "en")), "zh")
GAMES = [a for a in sys.argv[1:] if not a.startswith("http") and a not in ("zh", "en")]
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/watch")
os.makedirs(OUT, exist_ok=True)
ZH = LANG == "zh"
NAMES = ["Steve", "Mia", "小林"]
# the games with a show of their own on the big screen (the .tvx stage; Punchline has its own, older one)
SHOWS = ("superlatives", "undercover", "tune", "drama", "truth", "wheel", "dice", "rogue", "king", "prompts", "postit", "freeze", "euchre", "draw", "limbo")


def L(zh, en):
    return zh if ZH else en


def clear_stamps(pages, wait=True):
    """Every phone's penalty stamp out of the way. The click goes straight to the stamp's button:
    a headless browser busy drawing two TVs takes seconds to call a stamp that is still settling
    "stable", longer than a song gives (party_test's helper waits for that)."""
    if wait:
        time.sleep(0.4)
    for _ in range(14):
        busy = False
        for g in pages:
            if g.locator(".stamp-layer").count() == 0:
                continue
            busy = True
            for label in ("我喝了", "做完了", "继续", "I drank", "Done it", "Continue"):
                b = g.locator(".stamp-layer button", has_text=label)
                if b.count():
                    try:
                        b.first.dispatch_event("click")
                    except Exception:
                        pass
                    break
        if not busy:
            return
        time.sleep(0.5)


def shot(pages, tag):
    for pg in pages:
        pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def screen(browser, name, w, h, code, path=None, click=True):
    """A big screen (a TV, or a computer) showing the table."""
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
    pg = ctx.new_page()
    settings = {"lang": LANG, "sound": True, "music": False, "customPenalty": "", "players": []}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: print(f"  ({name}: request failed {r.url[:120]} {r.failure})", flush=True))
    pg._errs = errs
    pg._name = name
    pg.goto(BASE.rstrip("/") + (path or f"/tv/{code}"), wait_until="networkidle")
    if click:
        pg.mouse.click(w // 2, h // 2)  # the click that lets a TV play sound
    return pg


def sit(browser, code, name, w=390, h=844):
    g = phone(browser, name, LANG, w=w, h=h)
    g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
    g.wait_for_timeout(250)
    g.locator(".join-card input").fill(name)
    g.locator(".join-card button[type=submit]").click()
    until(lambda: room(g))
    return g


class Table:
    def __init__(self, browser):
        self.browser = browser
        host, guests, code = P.seat_table(browser, NAMES, LANG)
        self.code = code
        self.players = [host] + guests
        self.host = host
        # the phone that only watches, held sideways
        self.watcher = sit(browser, code, "Lu", 844, 390)
        self.watcher._name = "watcher"
        self.watcher.on("requestfailed", lambda r: print(f"  (watcher: request failed {r.url[:120]} {r.failure})", flush=True))
        self.watcher.locator(".table-btn").click()
        self.watcher.wait_for_timeout(500)
        self.watcher.locator(".table-watch button").click()
        ok(until(lambda: any(s["id"] == me(self.watcher) and s.get("watch") for s in room(self.host)["seats"])), "Lu just watches")
        self.watcher.keyboard.press("Escape")
        self.watcher.wait_for_timeout(400)
        self.tv = screen(browser, "tv", 1920, 1080, code)
        self.tv720 = screen(browser, "tv720", 1280, 720, code)
        ok(until(lambda: room(self.host)["screens"] == 2), "two big screens show the table")
        self.screens = [self.tv, self.tv720, self.watcher]

    def everyone(self):
        return self.players + self.screens

    def add_player(self, name):
        g = sit(self.browser, self.code, name)
        self.players.append(g)
        return g

    def remove_player(self, g):
        """A player gets up and leaves the table (from the lobby)."""
        clear_stamps([g])
        n = len(room(self.host)["seats"])  # (counted before: the table can hear of it before the next line runs)
        g.locator(".topbar .icon-btn").first.click()
        g.wait_for_timeout(400)
        g.locator(".sheet").get_by_role("button", name=L("离开这桌", "Leave the table")).click()
        ok(until(lambda: len(room(self.host)["seats"]) == n - 1, 12000), f"{g._name} leaves the table")
        self.players.remove(g)
        g.context.close()

    def start(self, gid):
        P.start_game(self.host, self.players, gid)
        ok(all(until(lambda s=s: (view(s) or {}).get("id") == gid) for s in self.screens), f"[{gid}] the screens are in the game")
        if gid in SHOWS:
            for s in self.screens:
                ok(until(lambda s=s: s.locator(".tvx").count() == 1, 8000), f"[{gid}] {s._name}: the game's own big-screen view")
        ok(self.watcher.locator(".watch .watch-bar").count() == 1, f"[{gid}] the watching phone shows the big screen full screen, with a way back to play")

    def end(self):
        """The host takes everyone back to the lobby."""
        clear_stamps(self.players)
        self.host.evaluate("() => 0")
        self.host.locator(".topbar .icon-btn").first.click()
        self.host.wait_for_timeout(400)
        self.host.get_by_role("button", name=L("回大厅", "To the lobby")).click()
        ok(until(lambda: not view(self.host), 5000), "back to the lobby")
        self.host.wait_for_timeout(500)

    def wait_phase(self, phase, timeout=8000):
        return until(lambda: all((view(s) or {}).get("phase") == phase for s in self.screens), timeout)


def shown(pg, sel, timeout=4000):
    """An element whose entrance has played. A headless browser drawing two TVs in software takes
    a second or more to start a CSS animation; a TV doesn't, but a picture taken before then shows
    the element still invisible."""
    return until(lambda: pg.evaluate("(s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).opacity === '1'; }", sel), timeout)


def fresh_tv(t, sel, prop, want, label):
    """The small TV switched on in the middle of the game, with nothing loaded by an earlier view:
    the game's own parts are drawn as they should be (their styles come with the view)."""
    pg = t.tv720
    pg.reload(wait_until="networkidle")
    pg.mouse.click(640, 360)
    ok(until(lambda: pg.locator(".tvx").count() == 1, 8000), f"{label}: a TV switched on mid-game shows the game")
    got = lambda: pg.evaluate("([s, p]) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; }", [sel, prop])
    ok(until(lambda: got() == want, 5000), f"{label}: ...and draws its parts with their own styles ({sel} {prop}: {got()})")


def page_text(pg):
    return pg.content() + "\n" + pg.evaluate("() => document.body.innerText")


def no_secrets(t, secrets, label):
    secrets = [s for s in secrets if s and len(s.strip()) >= 2]
    for pg in t.screens:
        txt = page_text(pg)
        leaked = [s for s in secrets if s in txt]
        ok(not leaked, f"{label}: nothing secret on the {pg._name} {leaked[:3]}")


def views_clean(t, label):
    """What only one phone may know is not even in the screens' copy of the game."""
    for pg in t.screens:
        v = view(pg) or {}
        own = {k: v.get(k) for k in ("myWord", "myVote", "me", "mine", "isBlank", "myToken", "myTarget") if v.get(k) not in (None, False, [], {})}
        ok(not own, f"{label}: the {pg._name} holds nobody's own word, card or vote {own}")


def no_errors(t):
    errs = [(g._name, e) for g in t.everyone() for e in g._errs if "favicon" not in e and "WebSocket" not in e]
    ok(not errs, f"no page errors {errs[:3]}")


# ------------------------------------------------------------------ superlatives

def t_superlatives(t):
    t.start("superlatives")
    ok(t.wait_phase("vote"), "superlatives: the vote is up on the screens")
    t.tv.wait_for_timeout(1500)
    shot(t.screens, "sup-01-vote")
    ok(t.tv.locator(".tvs-plaque").count() == 1 and t.tv.locator(".tvx-person").count() == 3, "superlatives: the award on its plaque, the three players standing")
    ok(t.watcher.locator(".tvx-person").count() == 3, "superlatives: the watcher isn't one of the nominees")
    players = t.players
    pids = [me(g) for g in players]
    names = {me(g): g._name for g in players}
    # Steve and Mia vote for 小林; the screens light up who has voted, not for whom
    players[0].locator(".ballot .nominee", has_text=NAMES[2]).click()
    t.tv.wait_for_timeout(700)
    players[1].locator(".ballot .nominee", has_text=NAMES[2]).click()
    ok(until(lambda: len(view(t.tv)["voted"]) == 2), "superlatives: two votes in")
    # (the vote has a clock: look first, then the pictures)
    ok(until(lambda: t.tv.locator('.tvx-person[data-state="voted"]').count() == 2, 3000), "superlatives: the two who voted light up")
    for pg in t.screens:
        txt = pg.evaluate("() => document.body.innerText")
        ok(all(txt.count(n) == 1 for n in NAMES), f"superlatives: the {pg._name} names nobody twice before the reveal (no who-voted-for-whom)")
    views_clean(t, "superlatives vote")
    t.tv.wait_for_timeout(500)
    shot([t.tv, t.watcher], "sup-02-votes-in")
    # held upright, the watching phone lays the stage on its side (turn the phone and it reads)
    t.watcher.set_viewport_size({"width": 390, "height": 844})
    ok(until(lambda: t.watcher.locator(".watch-turn.is-turned").count() == 1, 3000), "superlatives: a watching phone held upright lays the big screen on its side")
    t.watcher.wait_for_timeout(500)
    t.watcher.mouse.click(195, 400)
    t.watcher.wait_for_timeout(400)
    shot([t.watcher], "sup-02b-upright")
    t.watcher.set_viewport_size({"width": 844, "height": 390})
    ok(until(lambda: t.watcher.locator(".watch-turn.is-turned").count() == 0, 3000), "superlatives: sideways again, the right way up")
    ok(view(t.tv)["phase"] == "vote", "superlatives: still voting (a machine this busy can let the clock run out)")
    players[2].locator(".ballot .nominee", has_text=NAMES[0]).click()
    ok(t.wait_phase("reveal"), "superlatives: all in, the reveal")
    t.tv.wait_for_timeout(300)
    shot([t.tv], "sup-03-drumroll")
    ok(until(lambda: all(s.locator(".tv-pen").count() == 1 for s in t.screens), 6000), "superlatives: the winner's penalty on the screens")
    shot(t.screens, "sup-04-winner")
    ok(NAMES[2] in t.tv.locator(".tvs-winner").inner_text(), "superlatives: 小林 takes it in the spotlight")
    ok(t.tv.locator(".tvs-vote-row").count() == 2, "superlatives: the votes, as bars, once it's out")
    # quickly through the rest: one vote and the host reveals
    for _ in range(40):
        if view(t.host)["phase"] == "ceremony":
            break
        clear_stamps(players)
        if view(t.host)["phase"] == "reveal":
            t.host.wait_for_timeout(2700)
            clear_stamps(players)
            t.host.get_by_role("button", name=re.compile(L("下一个奖|开颁奖典礼", "Next award|On to the awards"))).click()
            until(lambda: view(t.host)["phase"] != "reveal", 3000)
            continue
        g = players[(view(t.host)["round"]) % 3]
        g.locator(".ballot .nominee:not([disabled])").nth(view(t.host)["round"] % 2).click()
        t.host.wait_for_timeout(250)
        t.host.get_by_role("button", name=L("现在揭晓", "Reveal now")).click()
        until(lambda: view(t.host)["phase"] != "vote", 3000)
    ok(t.wait_phase("ceremony"), "superlatives: eight awards, then the ceremony")
    t.tv.wait_for_timeout(3200)
    shot(t.screens, "sup-06-ceremony")
    ok(t.tv.locator(".tvx-podium .tvx-place").count() == 3 and t.tv.locator(".tvs-honours li").count() >= 1, "superlatives: the podium and the night's awards")
    t.end()


# ------------------------------------------------------------------ undercover

def words_of(g):
    v = view(g) or {}
    w = v.get("myWord")
    return [w["zh"], w["en"]] if w else []


def t_undercover(t):
    if len(t.players) < 4:
        t.add_player("Kev")
        ok(until(lambda: len(room(t.host)["seats"]) == 5), "undercover: a fourth player sits down (it needs four)")
    players = t.players
    t.start("undercover")
    ok(t.wait_phase("setup"), "undercover: the case file is up")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "uc-01-setup")
    ok(t.tv.locator(".tvu-file").count() == 1 and t.tv.locator(".tvx-person").count() == 4, "undercover: the case file, four players standing")
    t.host.get_by_role("button", name=L("发词", "Deal the words")).click()
    ok(t.wait_phase("word"), "undercover: the words are dealt")
    secrets = sorted({w for g in players for w in words_of(g)})
    ok(len(secrets) >= 3, f"undercover: the players hold their words ({len(secrets)} strings)")
    for g in players:
        g.locator(".cloche-dome").click()
    t.tv.wait_for_timeout(900)
    for g in players[:2]:
        g.get_by_role("button", name=L("记住了", "Got it")).click()
    ok(until(lambda: len(view(t.tv)["ready"]) == 2), "undercover: two have read their word")
    t.tv.wait_for_timeout(700)
    shot(t.screens, "uc-02-reading")
    ok(t.tv.locator('.tvx-person[data-state="ready"]').count() == 2 and t.tv.locator(".tvu-card").count() == 2, "undercover: a card over each head, lit once read")
    no_secrets(t, secrets, "undercover word")
    views_clean(t, "undercover word")
    for g in players[2:]:
        g.get_by_role("button", name=L("记住了", "Got it")).click()
    ok(t.wait_phase("talk"), "undercover: everyone has read: describing")
    clues = [L("每天都会见到", "You see it every day"), L("有点甜", "A bit sweet"), L("小时候常有", "Common when we were kids"), L("颜色很多", "Comes in many colors")]
    for i in range(4):
        v = view(t.host)
        if v["phase"] != "talk":
            break
        sp = P.by_pid(players, v["order"][v["speaker"]])
        if i == 2:
            t.tv.wait_for_timeout(900)
            shot(t.screens, "uc-03-talk")
            ok(t.tv.locator(".tvu-spot-name").inner_text().strip().endswith(sp._name), "undercover: whoever is describing stands in the lamp's light")
            ok(t.tv.locator(".tvu-said li.is-done").count() == 2, "undercover: what the first two said, down the side")
            no_secrets(t, secrets, "undercover talk")
        sp.get_by_placeholder(re.compile(L("一句话描述", "Describe your word"))).fill(clues[i])
        sp.get_by_role("button", name=L("说完了", "Done")).click()
        until(lambda i=i: view(t.host)["phase"] != "talk" or view(t.host)["speaker"] > i, 3000)
    ok(t.wait_phase("vote"), "undercover: the vote")
    words = {g._name: (view(g).get("myWord") or {}).get("zh") for g in players}
    counts = {w: list(words.values()).count(w) for w in set(words.values())}
    uc_word = min(counts, key=counts.get)
    uc = next(g for g in players if words[g._name] == uc_word)
    voters = [g for g in players if g is not uc]
    voters[0].locator(".picker .chip", has_text=uc._name).click()
    t.tv.wait_for_timeout(900)
    shot(t.screens, "uc-04-vote")
    ok(t.tv.locator('.tvx-person[data-state="voted"]').count() == 1 and t.tv.locator(".tvu-clue").count() == 4, "undercover: who has voted lights up, everyone's clue under their name")
    for pg in t.screens:
        txt = pg.evaluate("() => document.body.innerText")
        ok(all(txt.count(g._name) == 1 for g in players), f"undercover: the {pg._name} doesn't say who voted for whom")
    no_secrets(t, secrets, "undercover vote")
    for g in voters[1:]:
        g.locator(".picker .chip", has_text=uc._name).click()
        t.tv.wait_for_timeout(200)
    uc.locator(".picker .chip:not([disabled])").first.click()
    ok(t.wait_phase("reveal"), "undercover: the votes are in")
    no_secrets(t, secrets, "undercover reveal")
    t.tv.wait_for_timeout(2600)
    shot(t.screens, "uc-05-reveal")
    ok(t.tv.locator(".tvu-out.is-caught .tvx-stamp").count() == 1, "undercover: the undercover is stamped")
    ok(t.tv.locator(".tvu-tally li").count() >= 1, "undercover: who voted for whom, now it's out")
    clear_stamps(players)
    t.host.get_by_role("button", name=L("看结果", "See the result")).click()
    ok(t.wait_phase("end"), "undercover: game over")
    ok(until(lambda: all(s.locator(".tv-pen").count() == 1 for s in t.screens), 5000), "undercover: the losing side's penalty on the screens")
    t.tv.wait_for_timeout(600)
    shot(t.screens, "uc-06-end")
    ok(uc_word in t.tv.locator(".tvu-pair").inner_text(), "undercover: both words, at the end")
    t.end()
    t.remove_player(t.players[3])


# ------------------------------------------------------------------ name that tune

def no_answer_yet(t, label):
    for pg in t.screens:
        ok(pg.locator(".tvt-titles li.is-right, .tvt-song").count() == 0, f"{label}: the {pg._name} doesn't give the answer away")


def t_tune(t):
    host, players = t.host, t.players[:3]
    mia, lin = players[1], players[2]
    t.start("tune")
    ok(t.wait_phase("ready"), "tune: ready")
    host.get_by_role("button", name=L("旋律", "Melody")).click()
    host.get_by_role("button", name=L("5 首", "5 songs")).click()
    ok(until(lambda: view(t.tv)["mode"] == "melody" and view(t.tv)["total"] == 5), "tune: melodies, five songs")
    t.tv.wait_for_timeout(1500)
    shot(t.screens, "tn-01-ready")
    ok(t.tv.locator(".tn-stage .tn-mate").count() == 3 and t.tv.locator(".tvt-names span").count() == 3, "tune: the three players on the stage, named")
    host.get_by_role("button", name=L("放第一首", "Play the first one")).click()
    ok(t.wait_phase("listen"), "tune: the first song")
    t.tv.wait_for_timeout(2600)
    shot(t.screens, "tn-02-listen")
    ok(t.tv.locator(".tvt-ladder li.is-now").count() == 1 and t.tv.locator(".vinyl.is-spinning").count() == 1, "tune: the record spins, the points count down")
    no_answer_yet(t, "tune listen")
    mia.locator(".buzz").dispatch_event("pointerdown")
    ok(t.wait_phase("answer"), "tune: Mia buzzes in")
    t.tv.wait_for_timeout(700)
    # (ten seconds to answer: look first, then the pictures)
    ok(t.tv.locator('.tn-mate[data-state="spot"]').count() == 1 and t.tv.locator(".tvt-titles li").count() == 4, "tune: Mia in the spotlight, the four titles up")
    no_answer_yet(t, "tune answer")
    v = view(mia)
    # (ten seconds to answer: a picture only when there's time for one)
    if view(t.tv)["answerEndsAt"] - time.time() * 1000 > 6000:
        shot([t.tv], "tn-03-answer")
    right = P.tune_index(v)
    mia.locator(".tn-option").nth(v["options"].index(next(o for o in v["options"] if o != right))).click()
    ok(until(lambda: view(t.tv)["phase"] == "listen" and me(mia) in view(t.tv)["locked"]), "tune: wrong, Mia is locked out and the music goes on")
    # (the song runs on meanwhile: look first, then the pictures, and leave 小林 time to buzz)
    ok(until(lambda: t.tv.locator(".tvt-locked").count() == 1, 3000), "tune: who's locked out")
    t.tv.wait_for_timeout(900)
    shot([t.tv, t.watcher], "tn-04-locked")
    lin.locator(".buzz").dispatch_event("pointerdown")
    ok(until(lambda: view(t.tv)["phase"] == "answer" and view(t.tv)["buzzer"] == me(lin)), "tune: 小林 buzzes in, same song")
    v = view(lin)
    clear_stamps([lin], wait=False)
    lin.locator(".tn-option").nth(v["options"].index(P.tune_index(v))).click()
    ok(t.wait_phase("reveal"), "tune: 小林 names it")
    # (the next song comes by itself in a few seconds: look first, then the pictures)
    t.tv.wait_for_timeout(1200)
    ok(t.tv.locator(".tvt-song").count() == 1 and t.tv.locator('.tn-mate[data-state="win"]').count() == 1, "tune: the title up in lights, 小林 cheering")
    shown(t.tv, ".tvt-song")
    shot([t.tv], "tn-05-reveal")
    # the rest of the songs, quickly
    for _ in range(30):
        ph = view(host)["phase"]
        if ph == "end":
            break
        clear_stamps(players)
        if ph == "reveal":
            name = L("看结果", "Final scores") if view(host)["round"] >= view(host)["total"] else L("下一首", "Next song")
            try:
                host.get_by_role("button", name=name).click(timeout=2000)
            except Exception:
                pass
            until(lambda: view(host)["phase"] != "reveal", 3000)
        elif ph == "listen":
            try:
                host.get_by_role("button", name=L("揭晓答案", "Reveal")).click(timeout=2000)
            except Exception:
                pass
            until(lambda: view(host)["phase"] != "listen", 3000)
        else:
            time.sleep(0.3)
    ok(t.wait_phase("end"), "tune: five songs, the end")
    t.tv.wait_for_timeout(2600)
    ok(t.tv.locator(".tvx-podium .tvx-place").count() == 3, "tune: the podium")
    shot(t.screens, "tn-06-end")
    # once more, as multiple choice
    clear_stamps(players)
    host.get_by_role("button", name=L("再来一局", "Play again")).click()
    ok(t.wait_phase("ready"), "tune: again")
    host.get_by_role("button", name=L("选择题", "Multiple choice")).click()
    ok(until(lambda: view(t.tv)["quiz"]), "tune: multiple choice")
    host.get_by_role("button", name=L("放第一首", "Play the first one")).click()
    ok(t.wait_phase("listen"), "tune: a multiple-choice song")
    t.tv.wait_for_timeout(2400)
    v = view(mia)
    right = P.tune_index(v)
    clear_stamps(players, wait=False)
    mia.locator(".tn-quiz .tn-option").nth(v["options"].index(right)).click()
    ok(until(lambda: len(view(t.tv)["answered"]) == 1), "tune: Mia has picked")
    t.tv.wait_for_timeout(700)
    shot(t.screens, "tn-07-quiz")
    ok(t.tv.locator(".tvt-titles li").count() == 4 and t.tv.locator(".tvt-answered .tvx-face-in").count() == 1, "tune: the four titles, and who has picked (not what)")
    no_answer_yet(t, "tune quiz")
    views_clean(t, "tune quiz")
    for g in (host, lin):
        vv = view(g)
        clear_stamps([g], wait=False)
        g.locator(".tn-quiz .tn-option").nth(vv["options"].index(next(o for o in vv["options"] if o != right))).click()
    ok(t.wait_phase("reveal"), "tune: everyone has picked")
    t.tv.wait_for_timeout(600)
    # (the next song comes by itself in a few seconds: look first, then the pictures)
    ok(t.tv.locator(".tvt-titles li.is-right").count() == 1 and t.tv.locator(".tvt-got.is-yes").count() == 1, "tune: the right title lights up, and who got it")
    shot([t.tv, t.watcher], "tn-08-quiz-reveal")
    t.end()


# ------------------------------------------------------------------ drama queens

def cards_of(players):
    out = []
    for g in players:
        c = (view(g) or {}).get("me")
        if c:
            for k in ("secret", "task"):
                out += [c[k]["zh"], c[k]["en"]]
    return out


def no_culprit(t, label):
    for pg in t.screens:
        ok(pg.locator(".dm-actor.is-culprit, .dm-actor-mask, .tvd-cards").count() == 0, f"{label}: the {pg._name} doesn't point at the culprit")


def drama_vote(audience, cast_n):
    for k, g in enumerate(audience):
        clear_stamps([g], wait=False)
        g.locator(".dm-suspect").nth(k % cast_n).click()
        rows = g.locator(".dm-rates li")
        for r in range(rows.count()):
            rows.nth(r).locator(".dm-star").nth((r + k + 2) % 5).click()
        g.get_by_role("button", name=L("交卷", "Send my vote")).click()


def t_drama(t):
    host, players = t.host, t.players[:3]
    t.start("drama")
    ok(t.wait_phase("setup"), "drama: the poster is up")
    host.get_by_role("button", name="3", exact=True).click()
    ok(until(lambda: view(t.tv)["total"] == 3), "drama: three acts")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "dm-01-setup")
    host.get_by_role("button", name=L("开演", "Curtain up")).click()
    ok(t.wait_phase("brief"), "drama: a scene is dealt")
    v = view(host)
    cast = [c["pid"] for c in v["cast"]]
    actors = [g for g in players if me(g) in cast]
    audience = [g for g in players if me(g) not in cast]
    secrets = cards_of(actors)
    ok(len(actors) == 2 and len(secrets) >= 2, f"drama: two actors with their cards ({len(secrets)} strings)")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "dm-02-brief")
    ok(t.tv.locator(".tvd-roster li").count() == 2 and t.tv.locator(".tvd-title").count() == 1, "drama: the playbill and who plays whom")
    no_secrets(t, secrets, "drama brief")
    no_culprit(t, "drama brief")
    views_clean(t, "drama brief")
    actors[0].locator(".dm-card-back").click()
    actors[0].wait_for_timeout(800)
    actors[0].locator(".dm-cardwrap .btn-primary").click()
    ok(until(lambda: len(view(t.tv)["ready"]) == 1), "drama: one actor is ready")
    t.tv.wait_for_timeout(600)
    ok(t.tv.locator(".tvd-roster li.is-ready").count() == 1, "drama: their line on the playbill lights up")
    actors[1].locator(".dm-card-back").click()
    actors[1].wait_for_timeout(800)
    actors[1].locator(".dm-cardwrap .btn-primary").click()
    ok(t.wait_phase("act"), "drama: action")
    t.tv.wait_for_timeout(500)
    shot([t.tv], "dm-03-slate")
    t.tv.wait_for_timeout(1500)
    shot(t.screens, "dm-04-act")
    ok(t.tv.locator(".tvd-theatre.is-act .dm-actor").count() == 2, "drama: the curtain open, the cast on stage")
    no_secrets(t, secrets, "drama act")
    no_culprit(t, "drama act")
    if os.environ.get("TWIST"):
        ok(until(lambda: view(t.tv).get("twist"), 60000), "drama: the plot twist lands")
        t.tv.wait_for_timeout(1200)
        shot(t.screens, "dm-04b-twist")
    actors[0].get_by_role("button", name=L("演完了，开始投票", "That's a wrap: vote")).click()
    ok(t.wait_phase("vote"), "drama: the audience votes")
    t.tv.wait_for_timeout(1500)
    shot(t.screens, "dm-05-vote")
    no_secrets(t, secrets, "drama vote")
    no_culprit(t, "drama vote")
    views_clean(t, "drama vote")
    drama_vote(audience, len(cast))
    ok(t.wait_phase("reveal"), "drama: the reveal")
    t.tv.wait_for_timeout(700)
    shot([t.tv], "dm-06-drum")
    ok(until(lambda: t.tv.locator(".tvd-cards li").count() == 2, 6000), "drama: every card turns over")
    t.tv.wait_for_timeout(1500)
    shot(t.screens, "dm-07-truth")
    ok(t.tv.locator(".dm-actor.is-culprit").count() == 1, "drama: the mask comes down on the culprit")
    # the other two acts, quickly
    for _ in range(40):
        ph = view(host)["phase"]
        if ph == "end":
            break
        clear_stamps(players)
        if ph == "reveal":
            name = L("颁奖", "On to the awards") if view(host)["round"] >= view(host)["total"] else L("下一幕", "Next act")
            try:
                host.get_by_role("button", name=name).click(timeout=2000)
            except Exception:
                pass
            until(lambda: view(host)["phase"] != "reveal", 3000)
        elif ph == "brief":
            try:
                host.get_by_role("button", name=L("直接开演", "Start now")).click(timeout=2000)
            except Exception:
                pass
            until(lambda: view(host)["phase"] != "brief", 3000)
        elif ph == "act":
            try:
                host.get_by_role("button", name=L("演完了，开始投票", "That's a wrap: vote")).click(timeout=2000)
            except Exception:
                pass
            until(lambda: view(host)["phase"] != "act", 3000)
        elif ph == "vote":
            vv = view(host)
            aud = [g for g in players if me(g) not in [c["pid"] for c in vv["cast"]]]
            try:
                drama_vote(aud, len(vv["cast"]))
            except Exception:
                pass
            until(lambda: view(host)["phase"] != "vote", 4000)
        else:
            time.sleep(0.3)
    ok(t.wait_phase("end"), "drama: three acts, the curtain call")
    t.tv.wait_for_timeout(2800)
    ok(t.tv.locator(".tvx-podium .tvx-place").count() == 3, "drama: the podium")
    shot(t.screens, "dm-08-finale")
    t.end()


# ------------------------------------------------------------------ punchline (its show, now on the watching phone too)

def t_punchline(t):
    t.start("punchline")
    for s in t.screens:
        ok(until(lambda s=s: s.locator(".sh-stage.is-tv").count() == 1, 8000), f"punchline: the {s._name} plays the whole show")
    t.tv.wait_for_timeout(3600)
    shot(t.screens, "pl-01-write")
    ok(t.watcher.locator(".sh-writer").count() == 3, "punchline: the watcher sees the three writers, and isn't one")
    # the host who switches to watching keeps the host's buttons: the game waits on them
    host = t.host
    host.locator(".table-btn").click()
    host.wait_for_timeout(500)
    host.locator(".table-watch button").click()
    ok(until(lambda: any(x["id"] == me(host) and x.get("watch") for x in room(host)["seats"])), "punchline: the host just watches now")
    host.keyboard.press("Escape")
    host.wait_for_timeout(600)
    ok(host.locator(".watch").count() == 0 and host.locator(".watch-strip").count() == 1, "punchline: a watching host keeps the phone screen, with the host's buttons")
    shot([host], "pl-02-host-watching")
    host.locator(".watch-strip .link-btn").click()
    ok(until(lambda: not any(x["id"] == me(host) and x.get("watch") for x in room(host)["seats"])), "punchline: and plays again")
    t.end()


# ------------------------------------------------------------------ 到此一游: the way to its own big screen (last: everyone leaves for it)

def t_trip(t):
    t.start("trip")
    ok(until(lambda: t.watcher.locator(".watch-away").count() == 1, 5000), "trip: the watcher waits for the host to open the game")
    shot([t.watcher], "trip-01-wait")
    # the game's own server isn't running here: the host's phone is told it opened room 4321
    t.host.route("**/trip/api/rooms", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"code": "4321"})))
    for pg in t.everyone():
        pg.route("**/trip/r/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<p>trip</p>"))
        pg.route("**/trip/tv/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<p>trip tv</p>"))
    t.host.get_by_role("button", name=L("开一局", "Open a game")).click()
    ok(until(lambda: (view(t.watcher) or {}).get("code") == "4321", 6000), "trip: the game is open")
    btn = t.watcher.get_by_role("button", name=L("打开到此一游的大屏", "Open its big screen"))
    ok(until(lambda: btn.count() == 1, 4000), "trip: the watcher gets a clear way to the game's own big screen")
    ok("/trip/r/" not in t.watcher.url, "trip: the watcher isn't sent into the game as a player")
    shot([t.watcher], "trip-02-open")
    btn.click()
    ok(until(lambda: re.search(r"/trip/tv/4321\?table=" + t.code, t.watcher.url) is not None, 5000), "trip: it opens the game's big screen for this table")


# ------------------------------------------------------------------ the DJ booth: the way to its speaker

def t_dj(browser):
    tv = screen(browser, "dj-tv", 1280, 720, "", "/dj", click=False)
    ok(until(lambda: re.search(r"/tv/[A-Z0-9]{4}", tv.url) is not None, 8000), "dj: /dj opens a table with the booth up")
    code = re.search(r"/tv/([A-Z0-9]{4})", tv.url).group(1)
    # the first phone at the booth hosts it (a host who watches keeps the host's buttons)
    host = sit(browser, code, "Steve")
    g = sit(browser, code, "Lu", 844, 390)
    g._name = "dj-watcher"
    ok(until(lambda: (view(g) or {}).get("id") == "dj", 6000), "dj: the phone is at the booth")
    ok(room(g)["host"] != me(g), "dj: Steve hosts, Lu doesn't")
    g.locator(".table-btn").click()
    g.wait_for_timeout(500)
    g.locator(".table-watch button").click()
    ok(until(lambda: any(s["id"] == me(g) and s.get("watch") for s in room(g)["seats"])), "dj: Lu just watches")
    ok(until(lambda: tv.locator(".dj-floor .dj-dancer").count() == 1, 5000), "dj: one dancer on the big screen's floor: watching, Lu doesn't dance")
    ok("Steve" in tv.locator(".dj-floor").inner_text() and "Lu" not in tv.locator(".dj-floor").inner_text(), "dj: ...it's Steve")
    shot([tv], "dj-00-floor")
    g.keyboard.press("Escape")
    btn = g.get_by_role("button", name=L("打开音箱页", "Open the speaker page"))
    ok(until(lambda: btn.count() == 1, 5000), "dj: the watcher gets the way to the booth's speaker page")
    g.wait_for_timeout(400)
    shot([g], "dj-01-watch")
    ok(f"/tv/{code}" in g.evaluate("() => document.body.innerText"), "dj: it says where the speaker page is")
    errs = [e for pg in (tv, g) for e in pg._errs if "favicon" not in e and "WebSocket" not in e]
    ok(not errs, f"dj: no page errors {errs[:3]}")
    tv.context.close()
    g.context.close()
    host.context.close()


# ------------------------------------------------------------------ games with a Worker of their own: a table of two and a watcher

def small_table(browser, tag):
    """Steve (hosting) and Mia play; Lu, held sideways, just watches."""
    host, guests, code = P.seat_table(browser, ["Steve", "Mia"], LANG)
    w = sit(browser, code, "Lu", 844, 390)
    w._name = f"{tag}-watcher"
    w.locator(".table-btn").click()
    w.wait_for_timeout(500)
    w.locator(".table-watch button").click()
    ok(until(lambda: any(s["id"] == me(w) and s.get("watch") for s in room(host)["seats"])), f"{tag}: Lu just watches")
    w.keyboard.press("Escape")
    w.wait_for_timeout(400)
    return host, guests[0], w, code


def stand_in(pages, game, phase=None):
    """The game's own server and pages, stood in for: the host's phone is told it opened room 4321
    (or the save it loads), the game's pages are blank, and its phase is `phase["p"]` when asked."""
    for pg in pages:
        pg.route(f"**/{game}/api/rooms", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"code": "4321"})))
        pg.route(f"**/{game}/r/**", lambda r: r.fulfill(status=200, content_type="text/html", body=f"<p>{game}</p>"))
        pg.route(f"**/{game}/tv/**", lambda r: r.fulfill(status=200, content_type="text/html", body=f"<p>{game} tv</p>"))
        if phase is not None:
            pg.route(f"**/{game}/api/rooms/4321", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"exists": True, "phase": phase["p"]})))


def front(host, gid):
    host.locator(f'.lobby .tile[data-tile="{P.GAME_INDEX[gid]}"]').click()
    ok(until(lambda: room(host)["front"] == P.GAME_INDEX[gid]), f"the table turns to {gid}")


def at(pg, pattern, timeout=8000):
    """The page got to an address. (A wait of Playwright's own: reading page.url in a loop never
    lets the stand-in pages above answer, so the page would never get there.)"""
    try:
        pg.wait_for_url(re.compile(pattern), timeout=timeout)
        return True
    except Exception:
        return False


def page_errors(pages, label):
    errs = [(pg._name, e) for pg in pages for e in pg._errs if "favicon" not in e and "WebSocket" not in e]
    ok(not errs, f"{label}: no page errors {errs[:3]}")


def t_hide(browser):
    """藏在人群里: the big screen's lobby counts the players only and says where the game's big screen
    is; a watching phone gets the way to it, as in 到此一游, and stays at the table."""
    host, mia, w, code = small_table(browser, "hide")
    tv = screen(browser, "hide-tv", 1280, 720, code)
    ok(until(lambda: tv.locator(".tv-lobby").count() == 1, 8000), "hide: the big screen's lobby")
    # the TV lobby: two players and a watcher are one short of a game for three
    front(host, "superlatives")
    need = lambda: tv.locator(".tv-front-need").inner_text().strip()
    ok(until(lambda: need() == L("还差 1 人", "1 more to start"), 4000), f"hide: the TV lobby counts players only, not the watcher ({need()!r})")
    shot([tv], "hide-01-tv-lobby-need")
    front(host, "hide")
    ok(until(lambda: need() == L("人够了，等主持人开始", "Ready when the host is"), 4000), f"hide: two players are enough for it ({need()!r})")
    ok(L("藏在人群里在大屏幕上有自己的页面", "Hide in the Crowd has its own big-screen page") in tv.locator(".tv-front-note").inner_text(), "hide: the TV lobby says the game has a big screen of its own")
    tv.wait_for_timeout(700)
    shot([tv], "hide-02-tv-lobby")
    stand_in([host, mia, w, tv], "hide")
    host.locator(".lobby-actions .btn-primary").click()
    ok(until(lambda: (view(w) or {}).get("id") == "hide", 6000), "hide: the game is up")
    for g in (host, mia):
        ok(at(g, r"/hide/r/4321\?table=" + code), f"hide: {g._name} goes into the game")
    ok(at(tv, r"/hide/tv/4321\?table=" + code), "hide: the big screen goes to the game's own")
    btn = w.get_by_role("button", name=L("打开藏在人群里的大屏", "Open its big screen"))
    ok(until(lambda: btn.count() == 1 and w.locator(".watch .watch-away").count() == 1, 6000), "hide: the watching phone shows the way to the game's big screen, full screen")
    ok(w.locator(".hide").count() == 0, "hide: ...not the table's phone screen")
    ok(re.search(r"/t/" + code, w.url) is not None and "/hide/" not in w.url, "hide: the watcher isn't sent into the game as a player")
    w.wait_for_timeout(500)
    shot([w], "hide-03-watch")
    page_errors([w, tv], "hide")
    btn.click()
    ok(at(w, r"/hide/tv/4321\?table=" + code, 5000), "hide: it opens the game's big screen for this table")
    for pg in (host, mia, w, tv):
        pg.context.close()


def t_trip_host(browser):
    """到此一游 while everyone's in it: the table's host role passes to the seat still at the table (a
    watcher), which stays a watcher (not sent into the game), and ends the game at the table when
    the game is over, so the others coming back land in the lobby."""
    host, mia, w, code = small_table(browser, "trip-host")
    phase = {"p": "playing"}
    stand_in([host, mia, w], "trip", phase)
    front(host, "trip")
    host.locator(".lobby-actions .btn-primary").click()
    ok(until(lambda: (view(w) or {}).get("id") == "trip", 6000), "trip-host: the game is up")
    host.get_by_role("button", name=L("开一局", "Open a game")).click()
    for g in (host, mia):
        ok(at(g, r"/trip/r/4321\?table=" + code), f"trip-host: {g._name} goes into the game")
    ok(until(lambda: w.get_by_role("button", name=L("打开到此一游的大屏", "Open its big screen")).count() == 1, 6000), "trip-host: the watcher has the way to the game's big screen")
    # 25 seconds after Steve left the table, the table makes the seat still there its host
    ok(until(lambda: room(w)["host"] == me(w), 45000, 500), "trip-host: Lu, still at the table, is the table's host now")
    w.wait_for_timeout(1500)
    ok("/trip/" not in w.url and re.search(r"/t/" + code, w.url) is not None, "trip-host: Lu still watches at the table, not sent into the game")
    ok(w.get_by_role("button", name=L("打开到此一游的大屏", "Open its big screen")).count() == 1, "trip-host: ...with the way to the game's big screen")
    ok(w.get_by_role("button", name=L("结束这局", "End the game")).count() == 1, "trip-host: ...and the host's button to end it")
    w.evaluate("() => window.scrollTo(0, 0)")
    w.wait_for_timeout(300)
    shot([w], "trip-host-01-watching-host")
    # Mia comes back to the table while the game goes on: it's still on there
    mia.goto(BASE + f"t/{code}", wait_until="networkidle")
    ok(until(lambda: room(mia) and (view(mia) or {}).get("id") == "trip", 8000), "trip-host: Mia is back at the table")
    ok(until(lambda: mia.get_by_role("button", name=L("回到这局", "Back to the game")).count() == 1, 6000), "trip-host: ...where the trip is still on")
    shot([mia], "trip-host-02-back")
    # the game ends (Steve, its host, never comes back to the table): the table's host now ends it
    # there. (The note the game's last screen leaves is read once, and a development build runs
    # each effect twice, so on this server only the phones' check of the game's phase tells.)
    phase["p"] = "over"
    ok(until(lambda: room(mia) and room(mia)["game"] is None and room(w)["game"] is None, 20000, 300), "trip-host: Lu's phone, the table's host now, ended it: everyone's in the lobby")
    w.wait_for_timeout(500)
    shot([w, mia], "trip-host-03-lobby")
    page_errors([w, mia], "trip-host")
    for pg in (host, mia, w):
        pg.context.close()


# ------------------------------------------------------------------ batch 2: truth or dare, the wheel, 7-8-9, rogue thirteen

def by_pid(t, pid):
    return next(g for g in t.players if me(g) == pid)


def pen_on(t, timeout=5000):
    """The penalty on the screens: the strip along the bottom of the TV."""
    return until(lambda: t.tv.locator(".tv-pen").count() > 0, timeout)


def spin_bottle(t):
    """The spinner flicks the bottle. (A phone's bottle counts a watcher's seat as a slot, the
    server doesn't: a spin that lands there isn't taken, and the spinner flicks again.)"""
    for _ in range(5):
        g = by_pid(t, view(t.host)["spinner"])
        clear_stamps([g], wait=False)
        btn = g.get_by_role("button", name=L("转瓶子", "Spin the bottle"))
        until(lambda: btn.is_enabled(), 8000)
        btn.click()
        if until(lambda: view(t.tv)["phase"] == "choose", 4000):
            return True
    return False


def t_truth(t):
    t.start("truth")
    ok(t.wait_phase("spin"), "truth: the bottle waits")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "td-01-spin")
    ok(t.tv.locator(".tvtd-seat").count() == 3 and t.watcher.locator(".tvtd-seat").count() == 3, "truth: the three players around the table (the watcher isn't one)")
    for r, kind in enumerate(("truth", "dare")):
        ok(spin_bottle(t), f"truth: the bottle spins ({r})")
        ok(until(lambda: t.tv.locator(".tvtd-seat.is-picked").count() == 1, 10000), f"truth: the bottle lands on someone ({r})")
        chosen = by_pid(t, view(t.tv)["chosen"])
        picked = t.tv.locator(".tvtd-seat.is-picked .tvtd-seat-name").inner_text()
        ok(picked == chosen._name, f"truth: the screen lights up whoever the table picked ({picked}, {chosen._name})")
        if r == 0:
            t.tv.wait_for_timeout(700)
            shot(t.screens, "td-02-choose")
        clear_stamps([chosen], wait=False)
        chosen.get_by_role("button", name=L("真心话", "Truth") if kind == "truth" else L("大冒险", "Dare")).click()
        ok(t.wait_phase("card"), f"truth: a {kind} card ({r})")
        prompt = view(chosen)["prompt"]
        ok(until(lambda: t.tv.locator(f".tvtd-cover.is-{kind}").count() == 1, 4000), f"truth: the card under its cover, {kind}")
        t.tv.wait_for_timeout(700)
        # read out at the table first: not one word of it on a screen
        no_secrets(t, [prompt["zh"], prompt["en"]], f"truth card {r}")
        shot(t.screens if r == 0 else [t.tv], f"td-0{3 + r}-card")
        chosen.locator(".cloche-dome").click()
        chosen.wait_for_timeout(800)
        if r == 0:
            chosen.get_by_role("button", name=L("做完了", "Done it")).click()
        else:
            chosen.get_by_role("button", name=L("放弃，认罚", "Pass. Penalty.")).click()
            ok(pen_on(t), "truth: refused, the penalty goes up on the screens")
            shot([t.tv], "td-05-refused")
        ok(t.wait_phase("spin"), f"truth: back to the bottle ({r})")
        clear_stamps(t.players)
    t.end()


def t_wheel(t):
    t.start("wheel")
    ok(t.wait_phase("spin"), "wheel: the wheel waits")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "wh-01-spin")
    n = len(view(t.tv)["slices"])
    ok(t.tv.locator(".tvw-slice").count() == n and t.watcher.locator(".tvw-slice").count() == n, f"wheel: all {n} slices on the wheel")
    seen = set()
    # (one slice in ten is a truth, one a dare: spin until one comes up)
    for r in range(18):
        clear_stamps(t.players)
        turn = by_pid(t, view(t.host)["turn"])
        turn.get_by_role("button", name=L("转一个", "Spin")).first.click()
        ok(until(lambda: view(t.tv)["phase"] != "spin", 4000), f"wheel: spin {r}")
        if "spinning" not in seen:
            seen.add("spinning")
            t.tv.wait_for_timeout(500)
            shot([t.tv], "wh-02-spinning")
        # landed: the slice on the screen, or (spin again) the wheel waits for another go
        until(lambda: view(t.tv)["phase"] not in ("spinning",), 12000)
        until(lambda: t.tv.locator(".tvw-chip").count() == 1 or view(t.tv)["phase"] == "spin", 6000)
        v = view(t.tv)
        ph = v["phase"]
        if ph == "spin":
            continue
        label = v["slices"][v["result"]]["label"]
        chip = t.tv.locator(".tvw-chip").inner_text()
        ok(label["zh"] in chip or label["en"] in chip or v["slices"][v["result"]]["kind"] == "drink", f"wheel: the slice it stopped on, large ({chip.splitlines()[0]})")
        if ph not in seen:
            seen.add(ph)
            t.tv.wait_for_timeout(600)
            shot(t.screens if ph != "result" or "shot-result" not in seen else [t.tv], f"wh-03-{ph}")
            seen.add("shot-result")
        if ph == "pick":
            turn.locator(".picker .chip:not([disabled])").first.click()
            ok(pen_on(t), "wheel: whoever they pick, the penalty on the screens")
        elif ph == "prompt":
            p = v["prompt"]
            ok(t.tv.locator(".tvw-prompt-main").inner_text().strip() in (p["zh"], p["en"]), "wheel: the truth or dare it landed on (on every phone too)")
            turn.get_by_role("button", name=L("做完了", "Done")).click()
        until(lambda: view(t.tv)["phase"] == "result", 4000)
        clear_stamps(t.players)
        turn.get_by_role("button", name=L("下一个", "Next")).click()
        until(lambda: view(t.tv)["phase"] == "spin", 4000)
        if {"result", "prompt"} <= seen:
            break
    print("  wheel phases seen:", sorted(x for x in seen if not x.startswith("shot")), flush=True)
    ok("prompt" in seen, "wheel: a truth or a dare came up and showed")
    t.end()


def t_dice(t):
    t.start("dice")
    ok(t.wait_phase("roll"), "dice: the dice wait")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "dc-01-roll")
    ok(t.tv.locator(".tvdc-dice .die").count() == 2 and t.tv.locator(".tvdc-rules li").count() == 5, "dice: two dice, the glass, the rules along the bottom")
    for r in range(4):
        clear_stamps(t.players)
        before = view(t.host)["roll"]
        turn = by_pid(t, view(t.host)["turn"])
        turn.get_by_role("button", name=L("掷骰子", "Roll")).last.click()
        ok(until(lambda: view(t.tv)["roll"] == before + 1, 4000), f"dice: roll {r}")
        if r == 0:
            t.tv.wait_for_timeout(300)
            shot([t.tv], "dc-02-rolling")
        ok(until(lambda: t.tv.locator(".tvdc-sum").count() == 1, 6000), f"dice: the dice land ({r})")
        v = view(t.tv)
        ok(t.tv.locator(".tvdc-sum").inner_text() == str(sum(v["dice"])) and t.tv.locator(".tvdc-rules li.is-now").count() == 1, f"dice: {v['dice']} and what it means ({v['outcome']})")
        if r < 2:
            t.tv.wait_for_timeout(600)
            shot(t.screens if r == 0 else [t.tv], f"dc-0{3 + r}-{v['outcome']}")
        if r == 1:
            # the watching phone held upright: the stage lies on its side
            t.watcher.set_viewport_size({"width": 390, "height": 844})
            ok(until(lambda: t.watcher.locator(".watch-turn.is-turned .tvdc-dice").count() == 1, 3000), "dice: held upright, the watching phone lays the stage on its side")
            t.watcher.wait_for_timeout(400)
            shot([t.watcher], "dc-05-upright")
            t.watcher.set_viewport_size({"width": 844, "height": 390})
        if v["phase"] == "assign":
            shot([t.tv], "dc-ones")
            turn.locator(".picker .chip").nth(1).click()
            until(lambda: view(t.tv)["phase"] == "result", 4000)
        clear_stamps(t.players)
        turn.get_by_role("button", name=L("下一个", "Next")).first.click()
        until(lambda: view(t.tv)["phase"] == "roll", 4000)
    t.end()


def t_rogue(t):
    t.start("rogue")
    ok(t.wait_phase("draw"), "rogue: the deck waits")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "rg-01-draw")
    seen = set()
    for r in range(16):
        clear_stamps(t.players)
        v = view(t.host)
        if v["phase"] != "draw" or v["interrupt"]:
            break
        by_pid(t, v["turn"]).locator(".pcard-back").click()
        ok(until(lambda: view(t.tv)["phase"] != "draw", 4000), f"rogue: draw {r}")
        t.tv.wait_for_timeout(1000)
        v = view(t.tv)
        rank, phase = v["card"]["rank"], v["phase"]
        seen.add(rank)
        ok(t.tv.locator(".tvr-title").count() == 1 and t.tv.locator(".pcard-front").count() == 1, f"rogue: {rank} and its rule on the screens ({phase})")
        if "card" not in seen:
            seen.add("card")
            shot(t.screens, "rg-02-card")
        drawer = by_pid(t, v["drawer"])
        if phase == "pick":
            drawer.locator(".picker .chip:not([disabled])").first.click()
        elif phase == "garden-pick":
            drawer.get_by_role("button", name=L("水果园", "Fruits")).click()
            until(lambda: view(t.tv)["phase"] == "garden")
            for _ in range(2):
                sp = by_pid(t, view(t.host)["garden"]["speaker"])
                clear_stamps([sp], wait=False)
                sp.get_by_role("button", name=re.compile(L("我说完了", "Said it"))).click()
                time.sleep(0.5)
            ok(until(lambda: t.tv.locator(".tvr-game .tvr-big").count() == 1, 3000), "rogue: the garden, whose turn to name one, the clock")
            shot(t.screens if "garden" not in seen else [t.tv], "rg-03-garden")
            seen.add("garden")
            try:
                drawer.get_by_role("button", name=re.compile(L("重复了", "repeated"))).click(timeout=3000)
            except Exception:
                pass
        elif phase == "grab":
            ok(until(lambda: t.tv.locator(".tvr-next").count() == 1, 3000), "rogue: the race for the next number")
            for g in t.players:
                clear_stamps([g], wait=False)
                if g.locator(".grab-btn").count():
                    g.locator(".grab-btn").dispatch_event("pointerdown")
                    time.sleep(0.5)
                    if "grab" not in seen:
                        seen.add("grab")
                        t.tv.wait_for_timeout(400)
                        shot([t.tv, t.watcher], "rg-04-grab")
        elif phase == "sevens-start":
            drawer.locator(".num-btn", has_text=re.compile(r"^5$")).click()
            until(lambda: view(t.tv)["phase"] == "sevens")
            for _ in range(3):
                sv = view(t.host)["sevens"]
                if not sv:
                    break
                sp = by_pid(t, sv["speaker"])
                clear_stamps([sp], wait=False)
                if sv["n"] % 7 == 0 or "7" in str(sv["n"]):
                    sp.get_by_role("button", name=L("过", "Pass")).click()
                else:
                    sp.locator(".sevens-num").click()
                time.sleep(0.5)
            ok(until(lambda: t.tv.locator(".tvr-log li.is-next").count() == 1, 3000), "rogue: counting sevens, who's next and what's been said")
            shot(t.screens if "sevens" not in seen else [t.tv], "rg-05-sevens")
            seen.add("sevens")
            sv = view(t.host)["sevens"]
            if sv:
                sp = by_pid(t, sv["speaker"])
                clear_stamps([sp], wait=False)
                # a wrong call ends the count
                if sv["n"] % 7 == 0 or "7" in str(sv["n"]):
                    sp.locator(".sevens-num").click()
                else:
                    sp.get_by_role("button", name=L("过", "Pass")).click()
        if not until(lambda: view(t.tv)["phase"] == "done", 8000):
            # (a round that didn't wrap up by itself: the host ends the card)
            try:
                t.host.get_by_role("button", name=L("结束这张牌", "End this card")).click(timeout=3000)
            except Exception:
                pass
            ok(until(lambda: view(t.tv)["phase"] == "done", 4000), f"rogue: {rank} done")
        clear_stamps(t.players)
        holders = view(t.host)["holders"]
        if holders and "powers" not in seen and t.tv.locator(".tvr-powers li").count():
            seen.add("powers")
            shot([t.tv], "rg-06-powers")
        if holders.get("camera") and "camera" not in seen:
            seen.add("camera")
            cam = by_pid(t, holders["camera"])
            cam.get_by_role("button", name=L("照相机", "Camera")).click()
            ok(until(lambda: t.tv.locator(".tvr-stop.is-camera").count() == 1, 3000), "rogue: the camera stops the whole screen")
            t.tv.wait_for_timeout(500)
            shot(t.screens, "rg-07-camera")
            ok(until(lambda: cam.get_by_text(L("谁动了？", "Who moved?")).count(), 6000), "rogue: then the camera holder judges")
            cam.locator(".interrupt-stage .picker .chip:not([disabled])").first.click()
            until(lambda: not view(t.tv)["interrupt"], 4000)
            clear_stamps(t.players)
        if holders.get("nose") and "nose" not in seen:
            seen.add("nose")
            nose = by_pid(t, holders["nose"])
            nose.get_by_role("button", name=L("摸鼻子", "Nose")).click()
            ok(until(lambda: t.tv.locator(".tvr-stop.is-nose").count() == 1, 3000), "rogue: the nose stops the whole screen")
            others = [g for g in t.players if g is not nose]

            def tap(g):
                # (six seconds to tap: on a busy machine the moment can be gone already)
                if g.locator(".nose-btn").count():
                    try:
                        g.locator(".nose-btn").dispatch_event("pointerdown", timeout=2000)
                    except Exception:
                        pass

            tap(others[0])
            t.tv.wait_for_timeout(500)
            shot([t.tv, t.watcher], "rg-08-nose")
            for g in others[1:]:
                tap(g)
            until(lambda: not view(t.tv)["interrupt"], 6000)
            clear_stamps(t.players)
        v = view(t.host)
        if v["phase"] == "done":
            by_pid(t, v["drawer"]).get_by_role("button", name=L("下一位抽牌", "Next player draws")).click()
            until(lambda: view(t.tv)["phase"] == "draw", 4000)
    print("  rogue seen:", sorted(seen), flush=True)
    t.end()


# ------------------------------------------------------------------ batch 3: the king, never have I ever, post-it, freeze dance

def t_king(t):
    t.start("king")
    ok(t.wait_phase("deal"), "king: the sticks are dealt")
    t.tv.wait_for_timeout(1000)
    shot(t.screens, "kg-01-deal")
    for i, g in enumerate(t.players):
        clear_stamps([g], wait=False)
        free = g.locator(".holder-svg g[role=button][aria-disabled='false']")
        (free.last if i % 2 else free.first).click()
        time.sleep(0.4)
    ok(until(lambda: len(view(t.host)["pulledIds"]) == 3, 5000), "king: everyone has drawn")
    tokens = {g._name: view(g).get("myToken") for g in t.players}
    ok("K" in tokens.values(), f"king: one of them is the king {tokens}")
    # whose number is whose: no number on a screen yet, and nobody's stick in the screens' copy
    for pg in t.screens:
        ok(pg.locator(".tvk-num").count() == 0, f"king: the {pg._name} shows no one's number")
    views_clean(t, "king deal")
    for g in t.players:
        g.get_by_role("button", name=L("记住了", "Got it")).click()
        time.sleep(0.25)
    ok(t.wait_phase("crown"), "king: crowned once everyone has looked")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "kg-02-crown")
    ok(t.tv.locator(".tvk-king-name").count() == 1 and t.tv.locator(".tvk-num").count() == 0, "king: the king, and still no numbers")
    king = by_pid(t, view(t.host)["king"])
    king.get_by_role("button", name=L("国王抽命令", "Draw an order")).click()
    ok(t.wait_phase("command"), "king: the order")
    nums = view(t.tv)["cmd"]["nums"]
    t.tv.wait_for_timeout(900)
    ok(t.tv.locator(".tvk-cmd").count() == 1 and t.tv.locator(".tvk-nums li").count() == len(nums) and t.tv.locator(".tvk-nums li.is-up").count() == 0, f"king: the order and its numbers {nums}, nobody named yet")
    shot(t.screens, "kg-03-order")
    for g in t.players:
        if view(g).get("myToken") in nums:
            g.get_by_role("button", name=re.compile(L("站出来", "Step up"))).click()
            time.sleep(0.3)
    ok(until(lambda: t.tv.locator(".tvk-nums li.is-up").count() == len(nums), 4000), "king: the numbers called step up, by name")
    t.tv.wait_for_timeout(600)
    shot(t.screens, "kg-04-stepped")
    clear_stamps(t.players)
    king.get_by_role("button", name=re.compile(L("执行完毕", "Done"))).click()
    ok(until(lambda: view(t.tv)["phase"] == "deal" and view(t.tv)["round"] == 2, 4000), "king: the next round")
    t.end()


def t_prompts(t):
    t.start("prompts")
    ok(t.wait_phase("draw"), "prompts: a card to draw")
    t.tv.wait_for_timeout(1000)
    shot(t.screens, "pr-01-draw")
    by_pid(t, view(t.host)["reader"]).get_by_role("button", name=L("抽一张", "Draw one")).click()
    ok(t.wait_phase("answer"), "prompts: the card, everyone answers")
    yes = t.players[:2]
    for g in yes:
        clear_stamps([g], wait=False)
        g.get_by_role("button", name=L("我做过", "I have")).click()
        time.sleep(0.3)
    ok(until(lambda: t.tv.locator(".tvpr-answered .tvx-face-in").count() == 2, 4000), "prompts: who has answered shows")
    for pg in t.screens:
        ok(pg.locator(".tvpr-yes, .tvpr-verdict").count() == 0, f"prompts: the {pg._name} shows nobody's answer before the reveal")
    views_clean(t, "prompts answer")
    t.tv.wait_for_timeout(500)
    shot(t.screens, "pr-02-answer")
    t.players[2].get_by_role("button", name=L("没做过", "I haven't")).click()
    ok(t.wait_phase("reveal"), "prompts: all in, the reveal")
    ok(until(lambda: t.tv.locator(".tvpr-yes").count() == 2, 4000), "prompts: the two who have")
    t.tv.wait_for_timeout(900)
    shot(t.screens, "pr-03-reveal")
    clear_stamps(t.players)
    t.host.locator(".heat-tab button", has_text=L("谁最有可能", "Most likely")).click()
    ok(until(lambda: view(t.tv)["mode"] == "likely" and view(t.tv)["phase"] == "draw", 4000), "prompts: most likely to")
    by_pid(t, view(t.host)["reader"]).get_by_role("button", name=L("抽一张", "Draw one")).click()
    ok(t.wait_phase("answer"), "prompts: a most-likely card")
    target = t.players[2]
    for g in t.players:
        clear_stamps([g], wait=False)
        if g is target:
            g.locator(".picker .chip:not([disabled])", has_text=NAMES[0]).click()
        else:
            g.locator(".picker .chip", has_text=target._name).click()
        time.sleep(0.3)
    ok(t.wait_phase("reveal"), "prompts: the votes are in")
    ok(until(lambda: t.tv.locator(".tvpr-board li.is-hot").count() == 1, 4000), "prompts: the most votes, up top")
    t.tv.wait_for_timeout(900)
    shot(t.screens, "pr-04-likely")
    clear_stamps(t.players)
    t.end()


def t_postit(t):
    t.start("postit")
    ok(t.wait_phase("write"), "postit: everyone writes a note")
    words = ["孙悟空", "皮卡丘", "熊猫"]
    for i, g in enumerate(t.players):
        g.locator(".pi-note-input").fill(words[i])
        g.get_by_role("button", name=L("贴上去", "Stick it on")).click()
        if i == 0:
            ok(until(lambda: t.tv.locator(".tvp .tvx-badge").count() == 1, 4000), "postit: who has written shows (never what, or for whom)")
            no_secrets(t, words, "postit write")
            t.tv.wait_for_timeout(500)
            shot(t.screens, "pi-01-write")
    ok(t.wait_phase("play"), "postit: every note on a forehead")
    t.tv.wait_for_timeout(1000)
    ok(t.tv.locator(".tvp-note").count() == 3 and t.tv.locator(".tvp-note.is-open").count() == 0, "postit: three blank notes on the screens")
    no_secrets(t, words, "postit play")
    views_clean(t, "postit play")
    shot(t.screens, "pi-02-play")
    turn = by_pid(t, view(t.host)["turn"])
    others = [g for g in t.players if g is not turn]
    turn.locator(".pi-ask input").fill(L("我是动物吗？", "Am I an animal?"))
    turn.locator(".pi-ask button").click()
    until(lambda: view(others[0])["asking"])
    others[0].locator(".pi-reply.is-no").click()
    others[1].locator(".pi-reply.is-yes").click()
    ok(until(lambda: t.tv.locator(".tvp-replies .tvx-face-in").count() == 2, 4000), "postit: the question and everyone's yes or no")
    t.tv.wait_for_timeout(500)
    shot(t.screens, "pi-03-ask")
    # the watching phone held upright: the stage lies on its side, the notes still blank
    t.watcher.set_viewport_size({"width": 390, "height": 844})
    ok(until(lambda: t.watcher.locator(".watch-turn.is-turned .tvp-note").count() == 3, 3000), "postit: held upright, the watching phone lays the stage on its side")
    t.watcher.wait_for_timeout(400)
    shot([t.watcher], "pi-03b-upright")
    t.watcher.set_viewport_size({"width": 844, "height": 390})
    # a wrong guess, then the next player gets theirs
    turn.locator(".pi-guess input").fill(L("不是这个", "Not this"))
    turn.locator(".pi-guess button[type=submit]").click()
    ok(until(lambda: t.tv.locator(".tvp-guess.is-wrong").count() == 1, 4000), "postit: a wrong guess")
    clear_stamps(t.players)
    nxt = by_pid(t, view(t.host)["turn"])
    other = next(g for g in t.players if g is not nxt)
    word = view(other)["notes"][me(nxt)]["zh"]
    clear_stamps([nxt], wait=False)
    nxt.locator(".pi-guess input").fill(word)
    nxt.locator(".pi-guess button[type=submit]").click()
    ok(until(lambda: t.tv.locator(".tvp-note.is-open").count() == 1, 4000), f"postit: {nxt._name} got theirs, and now it shows")
    no_secrets(t, [w for w in words if w != word], "postit, one guessed")
    t.tv.wait_for_timeout(700)
    shot(t.screens, "pi-04-solved")
    clear_stamps(t.players)
    t.end()


def t_freeze(t):
    t.start("freeze")
    ok(t.wait_phase("ready"), "freeze: ready to dance")
    t.tv.wait_for_timeout(1000)
    shot(t.screens, "fz-01-ready")
    t.host.get_by_role("button", name=L("放音乐", "Start the music")).click()
    ok(t.wait_phase("dance"), "freeze: the music plays")
    fresh_tv(t, ".tvfz-floor .floor", "display", "grid", "freeze")
    t.tv.wait_for_timeout(1200)
    ok(t.tv.locator('.tvfz-dancers .lineup-fig[data-pose="dance"]').count() == 3, "freeze: everyone dancing (the watcher isn't)")
    ok(all(pg.locator(".tvx-clock").count() == 0 for pg in t.screens), "freeze: nothing counts down to the cut (it's a surprise)")
    shot(t.screens, "fz-02-dance")
    ok(until(lambda: view(t.tv)["phase"] == "freeze", 22000), "freeze: the music cuts")
    mia = t.players[1]
    clear_stamps([mia], wait=False)
    mia.get_by_role("button", name=L("我动了", "I moved")).click()
    ok(until(lambda: t.tv.locator('.tvfz-dancers .lineup-fig[data-pose="caught"]').count() == 1, 3000), "freeze: caught moving, as the phones show it")
    shot([t.tv], "fz-03-freeze")  # (one picture: the judging takes under four seconds, the result five)
    ok(until(lambda: view(t.tv)["phase"] in ("result", "end"), 8000), "freeze: judged")
    t.tv.wait_for_timeout(800)
    ok(t.tv.locator(".tvfz-big.is-caught").count() == 1, "freeze: who moved, and out")
    shot(t.screens, "fz-04-result")
    clear_stamps(t.players)
    ok(until(lambda: view(t.tv)["phase"] == "dance", 12000), "freeze: the next round starts by itself")
    ok(until(lambda: view(t.tv)["phase"] == "freeze", 22000), "freeze: cut again")
    t.host.locator(".fz-catch-btn", has_text=NAMES[2]).click()
    ok(until(lambda: view(t.tv)["phase"] == "end", 6000), "freeze: the last one standing")
    t.tv.wait_for_timeout(1200)
    ok(t.tv.locator(".tvfz-crown").count() == 1, "freeze: crowned")
    shot(t.screens, "fz-05-end")
    clear_stamps(t.players)
    t.end()


# ------------------------------------------------------------------ euchre

def eu_table_cards(v):
    """The cards anyone may see: the one turned up while bidding, and those played to the table."""
    cards = set()
    if v.get("phase") in ("bid1", "bid2") and v.get("upcard"):
        cards.add(v["upcard"])
    for p in v.get("trick") or []:
        cards.add(p["card"])
    for p in (v.get("lastTrick") or {}).get("plays") or []:
        cards.add(p["card"])
    return cards


def eu_hidden(t, label):
    """Nobody's hand on the screens: every face-up card there is on the table, none is in a hand."""
    def clean():
        hands = set(c for g in t.players for c in ((view(g) or {}).get("hand") or []))
        for pg in t.screens:
            v = view(pg) or {}
            if v.get("mySeat") is not None or v.get("hand") or v.get("legal"):
                return False
            shown = set(pg.evaluate("() => [...document.querySelectorAll('.tvx [data-card]')].map((e) => e.dataset.card)"))
            if shown & hands or not shown <= eu_table_cards(v):
                return False
        return True
    ok(until(clean, 3000), f"{label}: nobody's hand on the screens, only the table's cards")


def t_euchre(t):
    t.start("euchre")
    ok(t.wait_phase("setup"), "euchre: the host seats the table")
    t.tv.wait_for_timeout(900)
    ok(t.tv.locator(".tveu-seat").count() == 4 and t.tv.locator(".tveu-seat .eu-bot").count() == 1, "euchre: four seats, three players and a bot (the watcher isn't dealt in)")
    shot(t.screens, "eu-01-setup")
    t.host.get_by_role("button", name=L("先到 5 分", "First to 5")).click()
    ok(until(lambda: view(t.tv)["target"] == 5), "euchre: first to five")
    t.host.get_by_role("button", name=L("发牌", "Deal"), exact=True).click()
    ok(until(lambda: view(t.tv)["phase"] in ("bid1", "bid2", "discard", "play"), 5000), "euchre: dealt")
    ok(all(len((view(g) or {}).get("hand") or []) == 5 for g in t.players), "euchre: five cards in every player's hand")
    shots = set()
    fresh = False
    end = time.time() + 360
    while time.time() < end:
        v = view(t.host)
        if v["phase"] == "end":
            break
        clear_stamps(t.players, wait=False)
        if v["phase"] in ("bid1", "bid2") and v["bids"] and v["phase"] not in shots:
            # look first (the bot may bid next), then the pictures
            ok(until(lambda: t.tv.locator(".tveu-bid").count() >= 1 and t.tv.locator(".tveu-up").count() == 1, 3000), f"euchre: {v['phase']}: the card turned up and the bids so far")
            eu_hidden(t, f"euchre {v['phase']}")
            shot(t.screens if v["phase"] == "bid1" else [t.tv], f"eu-02-{v['phase']}")
            shots.add(v["phase"])
        if v["phase"] == "play" and len(v["trick"]) >= 2 and "play" not in shots:
            ok(until(lambda: t.tv.locator(".tveu-trump").count() == 1, 3000), "euchre: trump and who called it")
            eu_hidden(t, "euchre play")
            shot(t.screens, "eu-03-play")
            shots.add("play")
            # held upright, the watching phone lays the table on its side
            t.watcher.set_viewport_size({"width": 390, "height": 844})
            ok(until(lambda: t.watcher.locator(".watch-turn.is-turned").count() == 1, 3000), "euchre: the upright watching phone turns the table")
            t.watcher.wait_for_timeout(500)
            shot([t.watcher], "eu-03b-upright")
            t.watcher.set_viewport_size({"width": 844, "height": 390})
        if v["phase"] == "play" and "play" in shots and not fresh:
            fresh_tv(t, ".tveu-seat .ecard", "width", "46px", "euchre")
            fresh = True
            continue
        if v["phase"] == "trick" and "trick" not in shots:
            # (a trick stays up under two seconds: look first, then the pictures)
            if until(lambda: t.tv.locator(".tveu-play .ecard.is-win").count() == 1, 1200):
                ok(True, "euchre: the trick's winning card lights up")
                t.tv.wait_for_timeout(400)
                shot([t.tv, t.watcher], "eu-04-trick")
                shots.add("trick")
        if v["phase"] == "hand":
            if "hand" not in shots:
                ok(until(lambda: t.tv.locator(".tveu-result").count() == 1, 3000), "euchre: the hand's result")
                t.tv.wait_for_timeout(700)
                shot(t.screens, "eu-05-hand")
                ok([int(x) for x in t.tv.locator(".tveu-team b").all_inner_texts()] == list(view(t.tv)["score"]), "euchre: the score on the TV is the table's")
                shots.add("hand")
            clear_stamps(t.players)
            # (the next hand deals itself after a few seconds: the host may not need to)
            nxt = t.host.locator(".eu-result .btn-primary")
            if view(t.host)["phase"] == "hand" and nxt.count():
                try:
                    nxt.first.dispatch_event("click", timeout=3000)
                except Exception:
                    pass
            until(lambda: view(t.host)["phase"] != "hand", 8000)
            continue
        acted = False
        for g in t.players:
            gv = view(g) or {}
            if gv.get("mySeat") is not None and gv["turn"] == gv["mySeat"] and gv["phase"] in ("bid1", "bid2", "discard", "play"):
                acted = P.eu_act_dom(g, gv)
                if acted:
                    until(lambda g=g, gv=gv: view(g)["turn"] != gv["turn"] or view(g)["phase"] != gv["phase"] or len(view(g)["trick"]) != len(gv["trick"]), 3000)
                break
        if not acted:
            time.sleep(0.2)
    v = view(t.host)
    ok("trick" in shots, "euchre: a finished trick was seen on the TV")
    ok(v["phase"] == "end" and max(v["score"]) >= 5, f"euchre: played to five ({v['score']})")
    clear_stamps(t.players)
    ok(until(lambda: t.tv.locator(".tveu-result").count() == 1 and t.tv.locator(".tveu-team.is-win").count() == 1, 4000), "euchre: the winning team")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "eu-06-end")
    t.end()


# ------------------------------------------------------------------ draw

def ink(pg):
    return pg.evaluate("""() => { const c = document.querySelector('.plate-canvas'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }""")


def t_draw(t):
    t.start("draw")
    ok(t.wait_phase("pick"), "draw: the drawer picks how hard")
    drawer = by_pid(t, view(t.host)["drawer"])
    guessers = [g for g in t.players if g is not drawer]
    t.tv.wait_for_timeout(900)
    ok(drawer._name in t.tv.locator(".tvdr-head").inner_text(), "draw: whose turn to draw")
    shot(t.screens, "dr-01-pick")
    drawer.get_by_role("button", name=re.compile(L("简单", "Easy"))).click()
    ok(t.wait_phase("draw"), "draw: drawing")
    w = view(drawer)["word"]
    secret = [w["zh"], w["en"]]
    ok(all((view(pg) or {}).get("word") is None for pg in t.screens), "draw: the word isn't in the screens' copy of the game")
    box = drawer.locator(".plate-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    drawer.mouse.move(cx - 70, cy - 30)
    drawer.mouse.down()
    for i in range(1, 16):
        drawer.mouse.move(cx - 70 + i * 9, cy - 30 + ((i % 4) - 2) * 12)
        drawer.wait_for_timeout(16)
    drawer.mouse.up()
    ok(until(lambda: all(ink(pg) > 200 for pg in t.screens), 4000), f"draw: the stroke shows on the screens as it's drawn {[ink(pg) for pg in t.screens]}")
    guessers[0].get_by_placeholder(L("猜是什么", "Your guess")).fill(L("完全不对", "nothing like it"))
    guessers[0].get_by_role("button", name=L("猜", "Guess"), exact=True).click()
    ok(until(lambda: L("完全不对", "nothing like it") in t.tv.locator(".tvdr-guesses").inner_text(), 3000), "draw: a wrong guess shows as it comes in")
    no_secrets(t, secret, "draw: drawing")
    t.tv.wait_for_timeout(600)
    shot(t.screens, "dr-02-draw")
    guessers[1].get_by_placeholder(L("猜是什么", "Your guess")).fill(w["zh"] if ZH else w["en"])
    guessers[1].get_by_role("button", name=L("猜", "Guess"), exact=True).click()
    ok(until(lambda: t.tv.locator(".tvdr-guesses li.is-ok").count() == 1, 3000), "draw: a right guess says who, not what")
    ok(t.tv.locator(".tvdr-solved .tvx-face-in").count() == 1, "draw: who has it")
    no_secrets(t, secret, "draw: after a right guess")
    t.tv.wait_for_timeout(500)
    shot([t.tv, t.watcher], "dr-03-solved")
    t.watcher.set_viewport_size({"width": 390, "height": 844})
    ok(until(lambda: t.watcher.locator(".watch-turn.is-turned").count() == 1, 3000), "draw: the upright watching phone turns the drawing")
    t.watcher.wait_for_timeout(500)
    shot([t.watcher], "dr-03b-upright")
    t.watcher.set_viewport_size({"width": 844, "height": 390})
    drawer.get_by_role("button", name=re.compile(L("结束这轮", "End this round"))).click()
    ok(t.wait_phase("result"), "draw: the round's over")
    ok(until(lambda: w["zh"] in t.tv.locator(".tvdr-word").inner_text() and w["en"] in t.tv.locator(".tvdr-word").inner_text(), 3000), "draw: now the word, in both languages")
    ok(t.tv.locator(".tvdr-scores li").count() == 3, "draw: everyone's score")
    t.tv.wait_for_timeout(900)
    clear_stamps(t.players)
    shot(t.screens, "dr-04-result")
    t.end()


# ------------------------------------------------------------------ limbo

def tap(loc, timeout=8000):
    """A button on a phone that redraws itself four times a second (a countdown), pressed as soon
    as it's there: a click that waits for it to hold still can wait for ever on a busy machine."""
    loc.first.wait_for(timeout=timeout)
    loc.first.dispatch_event("click")


def wobble(pg, on=True):
    """A phone that won't hold still, so it locks no lean until the test leans it (lean())."""
    pg.evaluate("(on) => { clearInterval(window.__wobble); if (on) window.__wobble = setInterval(() => { window.__beta = 65 + Math.random() * 25; }, 60); }", on)


def lean(pg, deg):
    wobble(pg, False)
    P.lean_to(pg, deg)


def t_limbo(t):
    t.start("limbo")
    ok(t.wait_phase("ready"), "limbo: the bar's up")
    t.tv.wait_for_timeout(900)
    ok(t.tv.locator(".tvx-person").count() == 3, "limbo: the three players (the watcher isn't one)")
    shot(t.screens, "lb-01-ready")
    # a host who just watches keeps the phone screen (the host's buttons), but has nothing to lean with
    host = t.host
    sensing = lambda: host.locator(".lb button", has_text=re.compile(L("感应|测不了", "motion sensing|can't measure"))).count() + host.locator(".lb .fz-sensor-on").count()
    ok(sensing() == 1, "limbo: a player has the motion sensing button")
    host.locator(".table-btn").click()
    host.wait_for_timeout(500)
    host.locator(".table-watch button").click()
    ok(until(lambda: any(x["id"] == me(host) and x.get("watch") for x in room(host)["seats"])), "limbo: the host just watches now")
    host.keyboard.press("Escape")
    host.wait_for_timeout(600)
    ok(host.locator(".lb").count() == 1 and host.locator(".watch-strip").count() == 1, "limbo: a watching host keeps the phone screen, for the host's buttons")
    ok(sensing() == 0, "limbo: ...with no motion sensing to turn on")
    shot([host], "lb-01b-host-watching")
    host.locator(".watch-strip .link-btn").click()
    ok(until(lambda: not any(x["id"] == me(host) and x.get("watch") for x in room(host)["seats"])), "limbo: and plays again")
    ok(until(lambda: sensing() == 1 and len(view(t.tv)["alive"]) == 3), "limbo: three players again, the host's button back")
    steve, mia, lin = t.players
    t.host.get_by_role("button", name=L("开始", "Start"), exact=True).click()
    ok(t.wait_phase("go"), "limbo: bar one")
    ok(until(lambda: t.tv.locator(".tvlb-count").count() == 1 and t.tv.locator(".tvlb-count").inner_text().strip() in ("1", "2", "3", "4"), 3000), "limbo: the count in, as on the phones")
    shot([t.tv], "lb-02-count")
    ok(until(lambda: L("往后仰", "Lean back") in t.tv.locator(".tvlb-ask").inner_text(), 6000), "limbo: how far back")
    ok(t.tv.locator('.tvlb-scene .lineup-fig[data-pose="lean"]').count() == 3, "limbo: everyone leaning")
    fresh_tv(t, ".tvlb-scene .limbo-bar", "fill", t.tv.evaluate("() => getComputedStyle(document.querySelector('.tvlb-scene .limbo-bar')).fill"), "limbo")
    ok(t.tv.evaluate("() => getComputedStyle(document.querySelector('.tvlb-scene .limbo-bar')).fill") not in ("rgb(0, 0, 0)", "black"), "limbo: the bar in the game's gel")
    shot(t.screens, "lb-03-go")
    clear_stamps(t.players, wait=False)
    tap(steve.get_by_role("button", name=L("我过了", "I made it")))
    tap(mia.get_by_role("button", name=L("我过了", "I made it")))
    ok(until(lambda: t.tv.locator('.tvlb-scene .lineup-fig[data-pose="pass"]').count() == 2, 3000), "limbo: who's made it, as they make it")
    tap(lin.get_by_role("button", name=L("没过", "Missed"), exact=True))
    ok(t.wait_phase("result"), "limbo: the bar's done")
    ok(until(lambda: NAMES[2] in t.tv.locator(".tvlb-big.is-out").inner_text(), 3000), "limbo: who didn't make it")
    ok(t.tv.locator('.tvlb-scene .lineup-fig[data-pose="fail"]').count() == 1, "limbo: ...falling under the bar")
    t.tv.wait_for_timeout(800)
    shot(t.screens, "lb-04-result")
    clear_stamps(t.players)
    ok(until(lambda: view(t.tv)["phase"] == "go" and view(t.tv)["level"] == 1, 12000), "limbo: the bar comes down by itself")
    ok(until(lambda: steve.get_by_role("button", name=L("我过了", "I made it")).count() == 1, 8000), "limbo: bar two")
    clear_stamps(t.players, wait=False)
    tap(steve.get_by_role("button", name=L("我过了", "I made it")))
    tap(mia.get_by_role("button", name=L("没过", "Missed"), exact=True))
    ok(t.wait_phase("end"), "limbo: one left under the bar")
    clear_stamps(t.players)
    ok(until(lambda: t.tv.locator(".tvlb-crown").count() == 1 and NAMES[0] in t.tv.locator(".tvlb-big").inner_text(), 4000), "limbo: Steve is crowned")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "lb-05-end")
    # blind lean: the phones measure, and nobody's angle shows until the round is over
    tap(t.host.get_by_role("button", name=L("再来一局", "Play again")))
    ok(t.wait_phase("ready"), "limbo: again")
    t.host.get_by_role("button", name=L("盲仰", "Blind lean")).click()
    ok(until(lambda: view(t.tv)["mode"] == "blind"), "limbo: blind lean")
    for g in t.players:
        P.fake_sensor(g)
        wobble(g)
        tap(g.get_by_role("button", name=L("开启动作感应", "Turn on motion sensing")))
    ok(until(lambda: len(view(t.host)["sensors"]) == 3), "limbo: every phone measures")
    t.tv.wait_for_timeout(700)
    shot([t.tv], "lb-06-blind-ready")
    t.host.get_by_role("button", name=L("开始", "Start"), exact=True).click()
    ok(until(lambda: view(t.tv)["phase"] == "go" and L("凭感觉", "by feel") in t.tv.locator(".tvlb-ask").inner_text(), 9000), "limbo blind: lean by feel")
    target = view(t.tv)["angle"]
    lean(steve, target - 1)
    lean(mia, target + 4 if target + 4 <= 85 else target - 4)
    ok(until(lambda: len(view(t.tv)["locked"]) == 2, 6000), "limbo blind: two locked")
    ok(until(lambda: t.tv.locator(".tvlb-locked .avatar").count() == 2, 3000), "limbo blind: who has locked (not at what)")
    no_secrets(t, [f"{target - 1}°"], "limbo blind: no angle before the round's over")
    shot([t.tv, t.watcher], "lb-07-blind-go")
    lean(lin, target + 15 if target + 15 <= 85 else target - 15)
    ok(until(lambda: view(t.tv)["phase"] == "result", 6000), "limbo blind: all locked")
    for g in t.players:
        wobble(g)  # (straight away: round two opens by itself, and a phone still held still would lock it)
    ok(until(lambda: NAMES[2] in t.tv.locator(".tvlb-big.is-out").inner_text() and t.tv.locator(".tvlb-locks li").count() == 4, 3000), "limbo blind: furthest off is out, everyone's angle against the target")
    t.tv.wait_for_timeout(800)
    shot(t.screens, "lb-08-blind-result")
    clear_stamps(t.players)
    ok(until(lambda: view(t.tv)["phase"] == "go" and view(t.tv)["level"] == 1, 12000), "limbo blind: round two by itself")
    ok(until(lambda: L("凭感觉", "by feel") in t.tv.locator(".tvlb-ask").inner_text(), 9000), "limbo blind: lean again")
    target = view(t.tv)["angle"]
    lean(steve, target)
    lean(mia, target + 12 if target + 12 <= 85 else target - 12)
    ok(until(lambda: view(t.tv)["phase"] == "end", 8000), "limbo blind: decided")
    clear_stamps(t.players)
    ok(until(lambda: t.tv.locator(".tvlb-crown").count() == 1 and L("正好", "spot on") in t.tv.locator(".tvlb-top").inner_text(), 4000), "limbo blind: the best feel, and how close")
    t.tv.wait_for_timeout(1200)
    shot(t.screens, "lb-09-blind-end")
    t.end()


# ------------------------------------------------------------------ main

TESTS = {"superlatives": t_superlatives, "undercover": t_undercover, "tune": t_tune, "drama": t_drama, "truth": t_truth, "wheel": t_wheel, "dice": t_dice, "rogue": t_rogue, "king": t_king, "prompts": t_prompts, "postit": t_postit, "freeze": t_freeze, "euchre": t_euchre, "draw": t_draw, "limbo": t_limbo, "punchline": t_punchline, "trip": t_trip}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # (the shared table only when one of its games is asked for)
        table_tests = [name for name in TESTS if not GAMES or name in GAMES]
        t = Table(browser) if table_tests else None
        for name in table_tests:
            fn = TESTS[name]
            print(f"--- {name}", flush=True)
            try:
                fn(t)
            except Exception as e:
                ok(False, f"{name} crashed: {e}")
                shot(t.screens + t.players[:1], f"crash-{name}")
                try:
                    if view(t.host):
                        t.end()
                except Exception:
                    pass
        if t:
            no_errors(t)
        for name, fn in (("dj", t_dj), ("hide", t_hide), ("trip-host", t_trip_host)):
            if GAMES and name not in GAMES:
                continue
            print(f"--- {name}", flush=True)
            try:
                fn(browser)
            except Exception as e:
                ok(False, f"{name} crashed: {e}")
        browser.close()
    print("\nwatch test:", "ALL PASS" if not P.fails else f"{len(P.fails)} FAILED: {P.fails}")
    sys.exit(1 if P.fails else 0)


if __name__ == "__main__":
    main()
