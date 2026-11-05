"""Watching: every game's own big-screen view. A table of three players (four for Undercover), one
phone that only watches (held sideways), and two TVs (1920x1080 and 1280x720) play each game with a
big-screen view through. On the TVs and the watching phone: every phase shows the game's own view,
nothing secret is anywhere in the page (a player's word, card, task or vote before the reveal),
and there are no errors. Against the local dev servers (HANDOFF.md).

usage: python3 scripts/watch_test.py [base_url] [zh|en] [game ...]
games: superlatives undercover tune drama punchline trip dj (trip last: it sends the table off to 到此一游)
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
SHOWS = ("superlatives", "undercover", "tune", "drama")


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
        g.locator(".topbar .icon-btn").first.click()
        g.wait_for_timeout(400)
        g.locator(".sheet").get_by_role("button", name=L("离开这桌", "Leave the table")).click()
        n = len(room(self.host)["seats"])
        ok(until(lambda: len(room(self.host)["seats"]) == n - 1, 5000), f"{g._name} leaves the table")
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
        own = {k: v.get(k) for k in ("myWord", "myVote", "me", "mine", "isBlank") if v.get(k) not in (None, False, [], {})}
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
    t.tv.wait_for_timeout(800)
    shot(t.screens, "sup-02-votes-in")
    # held upright, the watching phone lays the stage on its side (turn the phone and it reads)
    t.watcher.set_viewport_size({"width": 390, "height": 844})
    ok(until(lambda: t.watcher.locator(".watch-turn.is-turned").count() == 1, 3000), "superlatives: a watching phone held upright lays the big screen on its side")
    t.watcher.wait_for_timeout(500)
    t.watcher.mouse.click(195, 400)
    t.watcher.wait_for_timeout(400)
    shot([t.watcher], "sup-02b-upright")
    t.watcher.set_viewport_size({"width": 844, "height": 390})
    ok(until(lambda: t.watcher.locator(".watch-turn.is-turned").count() == 0, 3000), "superlatives: sideways again, the right way up")
    ok(t.tv.locator('.tvx-person[data-state="voted"]').count() == 2, "superlatives: the two who voted light up")
    for pg in t.screens:
        txt = pg.evaluate("() => document.body.innerText")
        ok(all(txt.count(n) == 1 for n in NAMES), f"superlatives: the {pg._name} names nobody twice before the reveal (no who-voted-for-whom)")
    views_clean(t, "superlatives vote")
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


# ------------------------------------------------------------------ main

TESTS = {"superlatives": t_superlatives, "undercover": t_undercover, "tune": t_tune, "drama": t_drama, "punchline": t_punchline, "trip": t_trip}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        t = Table(browser)
        for name, fn in TESTS.items():
            if GAMES and name not in GAMES:
                continue
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
        no_errors(t)
        if not GAMES or "dj" in GAMES:
            print("--- dj", flush=True)
            try:
                t_dj(browser)
            except Exception as e:
                ok(False, f"dj crashed: {e}")
        browser.close()
    print("\nwatch test:", "ALL PASS" if not P.fails else f"{len(P.fails)} FAILED: {P.fails}")
    sys.exit(1 if P.fails else 0)


if __name__ == "__main__":
    main()
