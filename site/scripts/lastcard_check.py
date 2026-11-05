"""最后一张 · Last Card in a browser: three phones (390x844, 375x667 and 320x568), a fourth phone that
only watches (held sideways) and two TVs (1920x1080 and 1280x720) at one table, against the local
dev servers (HANDOFF.md). The host opens the table from the game's own address
(/g/last-card/play), the house rules are set, and two matches are played through on the phones'
own screens: the first with stacking on and first to 1 round (a round's end that ends the match:
the podium), the second with stacking off and first to 3 (a round's end with more to come).

Along the way, every kind of card is played (numbers, skip, reverse, +2, wild, +4), a wild's colour
is picked, someone down to one card without calling it is caught (and drinks), someone calls it in
time, and at each step no phone shows another player's cards, and no TV or watching phone shows
anyone's. One phone is also turned sideways. No page errors.

usage: python3 scripts/lastcard_check.py [base_url] [zh|en]
Screenshots go to $SHOTS (default: scratchpad/last-card/<lang>).
"""
import json, os, random, re, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
import party_test as P  # noqa: E402
from party_test import clear_stamps, me, ok, phone, room, until, view  # noqa: E402

BASE = P.BASE
LANG = next((a for a in sys.argv[1:] if a in ("zh", "en")), "zh")
ZH = LANG == "zh"
OUT = os.path.join(os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/last-card"), LANG)
os.makedirs(OUT, exist_ok=True)
random.seed(7)


def L(zh, en):
    return zh if ZH else en


# the 108 cards, as in src/shared/lastcard/cards.ts: by id, (colour, kind)
FACES = []
for c in "rygb":
    FACES.append((c, "0"))
    for n in range(1, 10):
        FACES += [(c, str(n))] * 2
    for k in ("skip", "rev", "d2"):
        FACES += [(c, k)] * 2
FACES += [(None, "wild")] * 4 + [(None, "d4")] * 4
assert len(FACES) == 108


def kind(cid):
    k = FACES[cid][1]
    return "number" if k.isdigit() else k


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def screen(browser, name, w, h, code):
    """A big screen (a TV, or a computer) showing the table."""
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
    pg = ctx.new_page()
    settings = {"lang": LANG, "sound": True, "music": False, "customPenalty": "", "players": []}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs
    pg._name = name
    pg.goto(BASE.rstrip("/") + f"/tv/{code}", wait_until="networkidle")
    pg.mouse.click(w // 2, h // 2)  # the click that lets a TV play sound
    return pg


def sit(browser, code, name, w, h):
    g = phone(browser, name, LANG, w=w, h=h)
    g.goto(BASE.rstrip("/") + f"/t/{code}", wait_until="networkidle")
    g.wait_for_timeout(250)
    g.locator(".join-card input").fill(name)
    g.locator(".join-card button[type=submit]").click()
    until(lambda: room(g))
    return g


def cards_in(pg, sel="[data-card]"):
    return set(pg.evaluate("(s) => [...document.querySelectorAll(s)].map((e) => +e.dataset.card)", sel))


class Table:
    def __init__(self, browser):
        self.browser = browser
        # the host opens the table from the game's own address
        host = phone(browser, "Steve", LANG, w=390, h=844)
        host.goto(BASE.rstrip("/") + "/g/last-card/play", wait_until="networkidle")
        ok(until(lambda: host.locator(".sheet #online-name").count() == 1), "/g/last-card/play: the way to a table comes straight up")
        host.wait_for_timeout(600)
        shot(host, "01-start")
        host.locator("#online-name").fill("Steve")
        host.locator(".sheet").get_by_role("button", name=L("开一桌", "Open a table"), exact=True).click()
        host.wait_for_url(re.compile(r"/t/[A-Z0-9]{4}"), timeout=8000)
        self.code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
        until(lambda: room(host))
        mia = sit(browser, self.code, "Mia", 375, 667)
        lin = sit(browser, self.code, "小林", 320, 568)
        self.host, self.players = host, [host, mia, lin]
        ok(until(lambda: len(room(host)["seats"]) == 3), f"three players at {self.code}")
        # the phone that only watches, held sideways
        self.watcher = sit(browser, self.code, "Lu", 844, 390)
        self.watcher._name = "watcher"
        self.watcher.locator(".table-btn").click()
        self.watcher.wait_for_timeout(500)
        self.watcher.locator(".table-watch button").click()
        ok(until(lambda: any(s["id"] == me(self.watcher) and s.get("watch") for s in room(host)["seats"])), "Lu just watches")
        self.watcher.keyboard.press("Escape")
        self.tv = screen(browser, "tv", 1920, 1080, self.code)
        self.tv720 = screen(browser, "tv720", 1280, 720, self.code)
        ok(until(lambda: room(host)["screens"] == 2), "two big screens show the table")
        self.screens = [self.tv, self.tv720, self.watcher]
        self.by_pid = {me(g): g for g in self.players}
        ok(until(lambda: room(host)["front"] == P.GAME_INDEX["lastcard"], 5000), "the table opened from the game's address has it up in the lobby")
        host.wait_for_timeout(600)
        shot(host, "02-lobby")

    def everyone(self):
        return self.players + self.screens

    def stamps(self):
        if any(g.locator(".stamp-layer").count() for g in self.players + [self.watcher]):
            clear_stamps(self.players + [self.watcher], wait=False)


def check_private(t, label):
    """No phone shows another player's cards; no TV or watching phone shows anyone's."""
    hands = {}
    for g in t.players:
        hands[me(g)] = set((view(g) or {}).get("hand", []))
    allc = set().union(*hands.values())
    playing = (view(t.host) or {}).get("phase") == "play"
    for g in t.players:
        # (a hand shows during play; at a round's end the results take its place)
        mine = hands[me(g)] if playing else set()
        ok(until(lambda g=g, mine=mine: cards_in(g, ".lc-hand [data-card]") == mine, 3000), f"{label}: {g._name}'s phone shows its own hand ({len(mine)} cards)")
        others = allc - mine
        leak = cards_in(g) & others
        ok(not leak, f"{label}: {g._name}'s phone shows none of the others' cards {sorted(leak)[:4]}")
    for s in t.screens:
        v = view(s) or {}
        leak = cards_in(s) & allc
        ok(not v.get("hand") and not v.get("legal") and v.get("drawn") is None and not leak and s.locator(".lc-hand").count() == 0, f"{label}: the {s._name} shows nobody's hand {sorted(leak)[:4]}")


def went(t, pg, tn):
    """The move went through: the turn moved on (or the round ended)."""
    ok(until(lambda: (view(t.host) or {}).get("tn", tn) != tn or (view(t.host) or {}).get("phase") != "play", 6000), f"{pg._name}'s move goes through")


def click_card(pg, cid):
    """A card in the hand: tap its left edge, which shows even when the next card overlaps it."""
    pg.locator(f'.lc-hand [data-card="{cid}"]').click(position={"x": 16, "y": 56}, timeout=4000)


def press(pg, label_zh, label_en, scope=".lc-actions"):
    pg.locator(scope).get_by_role("button", name=re.compile(L(label_zh, label_en))).first.click(timeout=4000)


class Bot:
    def __init__(self, t):
        self.t = t
        self.seen = set()
        self.caught = False
        self.called = False
        self.picked = False
        self.stacked = False
        self.sideways = False

    def step(self):
        t = self.t
        t.stamps()
        v = view(t.host)
        if not v or v["phase"] != "play":
            return False
        turn = v["turn"]
        pg = t.by_pid[turn]
        mv = view(pg)
        tn = mv["tn"]
        hand, legal = mv["hand"], mv["legal"]

        # the moments to check, once each
        if mv["pending"] and not self.stacked:
            self.stacked = True
            for g in t.everyone():
                shot(g, "06-stack")
        if len(hand) == 2 and legal and not mv["pending"] and mv["drawn"] is None:
            if not self.caught:
                return self.no_call(pg, turn, legal)
            if not self.called:
                return self.call_first(pg, turn, legal)

        picked = sorted(cards_in(pg, ".lc-hand .is-picked"))
        if picked and picked[0] in legal and FACES[picked[0]][0] is not None:
            # a card already picked up (a tap that went through just before): play it
            press(pg, "^出 ", "^Play ")
        elif mv["drawn"] is not None:
            if legal and random.random() < 0.7:
                self.play(pg, mv["drawn"], from_drawn=True)
            else:
                press(pg, "留着", "Keep it")
        elif legal:
            # every kind of card at least once: the ones not seen yet first
            fresh = [c for c in legal if kind(c) not in self.seen]
            self.play(pg, random.choice(fresh or legal))
        else:
            press(pg, "摸", "Draw|Take")
        went(t, pg, tn)
        return True

    def play(self, pg, cid, from_drawn=False):
        t = self.t
        if from_drawn:
            press(pg, "出这张", "Play it")
        else:
            click_card(pg, cid)
        if FACES[cid][0] is None:
            ok(until(lambda: pg.locator(".lc-pick").count() == 1, 3000), f"{pg._name}: a wild asks for its colour")
            if not self.picked:
                self.picked = True
                # (after the frame has brought the colours up from under the reactions bar)
                pg.wait_for_timeout(1200)
                shot(pg, "05-pick")
            pg.locator(f'.lc-pick-btn[data-color="{random.choice("rygb")}"]').click(timeout=4000)
        elif not from_drawn:
            # the second tap plays it
            ok(until(lambda: pg.locator(f'.lc-hand [data-card="{cid}"].is-picked').count() == 1, 3000), f"{pg._name}: a tap picks the card up")
            if random.random() < 0.5:
                click_card(pg, cid)
            else:
                press(pg, "^出 ", "^Play ")
        self.seen.add(kind(cid))
        if not self.sideways and len(self.seen) >= 2 and pg is t.host:
            # one phone held sideways: the table on the left, the hand on the right
            self.sideways = True
            t.host.wait_for_timeout(700)
            t.host.set_viewport_size({"width": 844, "height": 390})
            t.host.wait_for_timeout(700)
            shot(t.host, "07-sideways")
            t.host.set_viewport_size({"width": 390, "height": 844})
            t.host.wait_for_timeout(400)

    def no_call(self, pg, turn, legal):
        """Down to one card without calling it: the next phone catches them."""
        t = self.t
        cid = next((c for c in legal if FACES[c][0] is not None and kind(c) in ("number",)), legal[0])
        tn = view(pg)["tn"]
        self.play(pg, cid)
        went(t, pg, tn)
        v = view(t.host)
        if v["phase"] != "play" or v.get("open") != turn:
            return True
        catcher = next(g for g in t.players if g is not pg)
        ok(until(lambda: catcher.locator(".lc-catch button").count() == 1, 3000), f"{catcher._name} sees {pg._name} on one card, uncalled, with a button to catch them")
        for g in t.everyone():
            shot(g, "08-catch")
        before = view(t.host)["counts"][turn]
        catcher.locator(".lc-catch button").click(timeout=4000)
        ok(until(lambda: view(t.host)["counts"][turn] == before + 2 and view(t.host)["open"] is None, 4000), f"{catcher._name} catches {pg._name}: two cards")
        ok(until(lambda: pg.locator(".stamp-layer").count() == 1, 4000), f"{pg._name} gets the penalty stamp")
        pg.wait_for_timeout(900)
        shot(pg, "09-caught")
        shot(t.tv, "09-caught")
        self.caught = True
        t.stamps()
        return True

    def call_first(self, pg, turn, legal):
        """Two cards on your turn: call it, then play: nobody can catch you."""
        t = self.t
        press(pg, "最后一张", "Last card")
        ok(until(lambda: turn in view(t.host)["called"], 3000), f"{pg._name} calls last card with two cards")
        pg.wait_for_timeout(250)
        shot(t.tv, "10-called")
        cid = legal[0]
        tn = view(pg)["tn"]
        self.play(pg, cid)
        went(t, pg, tn)
        v = view(t.host)
        ok(v.get("open") != turn and len(view(pg)["hand"]) <= 1, f"{pg._name} played down to one, safe")
        ok(all(g.locator(".lc-catch").count() == 0 for g in t.players), "and nobody has a catch button")
        self.called = True
        return True


def play_round(t, bot, label):
    steps = 0
    last, same = None, 0
    while steps < 400:
        v = view(t.host) or {}
        at = (v.get("tn"), v.get("turn"))
        same = same + 1 if at == last else 0
        last = at
        if same >= 5:
            # the same turn five times over: something on the screen is in the way; keep the evidence
            for g in t.everyone():
                shot(g, f"stuck-{label}-{steps}")
            ok(False, f"{label}: stuck on {t.by_pid[v['turn']]._name}'s turn {json.dumps({k: v.get(k) for k in ('pending', 'pendingKind', 'drawn', 'open', 'called')})} {json.dumps(view(t.by_pid[v['turn']]).get('legal'))}")
            break
        try:
            if not bot.step():
                break
        except Exception as e:  # a tap that missed (a stamp in the way): look again
            why = [x.strip() for x in str(e).splitlines() if "intercepts" in x or "waiting for" in x or "not stable" in x]
            print(f"  (retrying: {str(e).splitlines()[0][:100]} {why[-1][:140] if why else ''})", flush=True)
            t.stamps()
            time.sleep(0.5)
        steps += 1
        if steps == 1:
            t.host.wait_for_timeout(500)
            for g in t.everyone():
                shot(g, f"04-play-{label}")
            check_private(t, f"{label} first move")
        elif steps % 7 == 0:
            check_private(t, f"{label} move {steps}")
    v = view(t.host)
    ok(v["phase"] in ("round", "end"), f"{label}: someone went out after {steps} moves ({v['phase']})")
    return v


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        t = Table(browser)
        # 1: stacking on, first to 1
        t.host.locator(".lobby-actions .btn-primary").click()
        ok(all(until(lambda g=g: (view(g) or {}).get("id") == "lastcard") for g in t.everyone()), "every phone and screen is in the game")
        ok(all(until(lambda s=s: s.locator(".tvx.tvlc").count() == 1, 8000) for s in t.screens), "the TVs and the watching phone show the game's own big-screen view")
        ok(t.watcher.locator(".watch .watch-bar").count() == 1, "the watching phone shows the big screen full screen")
        t.host.get_by_role("radio", name=L("开", "On")).click()
        t.host.get_by_role("radio", name=L("1 轮", "1"), exact=True).click()
        ok(until(lambda: view(t.players[1])["stack"] and view(t.players[1])["target"] == 1), "the host turns stacking on, first to 1")
        ok(t.players[1].locator(".lc-setup button.ui-button").count() == 0, "only the host has the deal button")
        t.host.wait_for_timeout(400)
        for g in t.everyone():
            shot(g, "03-setup")
        t.host.get_by_role("button", name=L("发牌", "Deal")).click()
        ok(all(until(lambda g=g: (view(g) or {}).get("phase") == "play") for g in t.everyone()), "dealt: everyone is playing")
        v = view(t.host)
        ok(all(v["counts"][me(g)] == 7 for g in t.players) and me(t.watcher) not in v["order"], "seven cards each, none for the watcher")
        bot = Bot(t)
        end = play_round(t, bot, "m1")
        t.stamps()
        ok(end["phase"] == "end" and end["champ"], "first to 1: the match is won")
        ok(until(lambda: t.tv.locator(".tvx-podium").count() == 1, 6000), "the TV shows the podium")
        time.sleep(3.2)
        for g in t.everyone():
            shot(g, "11-match-end-stamp")
        t.stamps()
        time.sleep(0.8)
        for g in t.everyone():
            shot(g, "11-match-end")
        # 2: a new match, stacking off, first to 3
        t.host.locator(".lc-result").get_by_role("button", name=L("再来一场", "New match")).click()
        ok(until(lambda: view(t.host)["phase"] == "setup"), "a new match: back to the house rules")
        t.host.get_by_role("radio", name=L("关", "Off")).click()
        t.host.get_by_role("radio", name=L("3 轮", "3"), exact=True).click()
        ok(until(lambda: not view(t.host)["stack"] and view(t.host)["target"] == 3), "stacking off, first to 3")
        t.host.get_by_role("button", name=L("发牌", "Deal")).click()
        ok(until(lambda: view(t.host)["phase"] == "play"), "dealt again")
        end = play_round(t, bot, "m2")
        ok(end["phase"] == "round" and end["winner"], "first to 3: a round's end, not the match's")
        t.host.wait_for_timeout(2600)
        for g in t.everyone():
            shot(g, "12-round-end-stamp")
        t.stamps()
        time.sleep(0.8)
        for g in t.everyone():
            shot(g, "12-round-end")
        ok(t.players[1].locator(".lc-result button.ui-button").count() == 0, "only the host deals the next round")
        t.host.locator(".lc-result").get_by_role("button", name=L("发下一轮", "Deal the next round")).click()
        ok(until(lambda: view(t.host)["phase"] == "play" and view(t.host)["round"] == 2), "round 2 is dealt")
        check_private(t, "round 2")
        # short rounds can end before anyone is down to two cards on their turn: play on until both have come up
        r = 2
        while not (bot.caught and bot.called) and r <= 5:
            end = play_round(t, bot, f"m2 round {r}")
            if end["phase"] != "round":
                break
            t.host.wait_for_timeout(2600)
            t.stamps()
            time.sleep(0.8)
            r += 1
            t.host.locator(".lc-result").get_by_role("button", name=L("发下一轮", "Deal the next round")).click()
            ok(until(lambda: view(t.host)["phase"] == "play" and view(t.host)["round"] == r), f"round {r} is dealt")
        missing = {"number", "skip", "rev", "d2", "wild", "d4"} - bot.seen
        ok(not missing, f"every kind of card was played ({sorted(bot.seen)})")
        ok(bot.caught and bot.called and bot.picked, f"a catch ({bot.caught}), a call in time ({bot.called}), a wild's colour ({bot.picked})")
        errs = [(g._name, e) for g in t.everyone() for e in g._errs if "favicon" not in e and "WebSocket" not in e]
        ok(not errs, f"no page errors {errs[:3]}")
        browser.close()
    print(f"\n{len(P.fails)} failed" if P.fails else "\nall passed")
    sys.exit(1 if P.fails else 0)


if __name__ == "__main__":
    main()
