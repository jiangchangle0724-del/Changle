"""Three players and a seat that just watches (the third seat, Cat), online, on the local servers.

The games are the players': on every phone the bottle's ring, the lists to pick or vote from, the
score lists, the rosters and the counts leave the watcher out, and the watcher's own phone has
nothing to play with. 真心话大冒险 is played for real: on every phone the bottle stops on the player
the server chose, and every spin counts (nobody has to spin again).

usage: python3 scripts/watch_players_check.py [base_url] [game ...]
games: truth superlatives prompts king draw freeze postit tune euchre rogue undercover
Needs the rooms server and the site running (HANDOFF.md, "Run the site locally"). Screenshots
(390x844) go to $SHOTS (default: watch-players in the system's temp folder).
"""
import os, re, sys, tempfile, time
from playwright.sync_api import sync_playwright
import party_test as T

ONLY = [a for a in sys.argv[1:] if not a.startswith("http")]
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "watch-players"))
os.makedirs(OUT, exist_ok=True)
SPINS = int(os.environ.get("SPINS", "8"))
ok, until, view, room, me, by_pid = T.ok, T.until, T.view, T.room, T.me, T.by_pid
NAMES = ["Amy", "Ben", "Cat", "Dan"]
WATCHER = "Cat"
PLAYERS = [n for n in NAMES if n != WATCHER]


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def texts(pg, sel):
    return pg.evaluate("(sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim())", sel)


def without_watcher(rows):
    return not any(WATCHER in r for r in rows)


def watching(pg, on):
    """This phone's own seat just watches (or plays again): the switch in the table sheet."""
    pg.locator(".table-btn").click()
    pg.wait_for_timeout(400)
    btn = pg.locator(".table-watch button")
    if (btn.get_attribute("aria-pressed") == "true") != on:
        btn.click()
    mine = lambda: next(s for s in room(pg)["seats"] if s["id"] == me(pg))
    ok(until(lambda: bool(mine().get("watch")) == on), f"{pg._name} {'just watches' if on else 'plays again'}")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)


def end_game(host, everyone):
    # (a penalty stamp can land a moment after the reveal, over the buttons: clear it and try again)
    for _ in range(5):
        T.clear_stamps(everyone)
        try:
            host.locator(".table-btn").click(timeout=3000)
            host.wait_for_timeout(400)
            host.get_by_role("button", name="结束这局，回到选游戏").click(timeout=3000)
            break
        except Exception:
            host.keyboard.press("Escape")
            time.sleep(1.5)
    ok(all(until(lambda g=g: view(g) is None) for g in everyone), "back at the lobby on every phone")
    host.wait_for_timeout(400)


# ---------------------------------------------------------------- 真心话大冒险

RING = "() => [...document.querySelectorAll('.bottle-svg text')].map((t) => t.textContent)"
BOTTLE = "() => { const g = document.querySelector('.bottle-svg g[transform^=rotate]'); return g && g.getAttribute('transform'); }"


def bottle_slot(pg, n):
    """The slot the bottle points at: it turns with the table, and slot i sits i/n of a turn clockwise from the top."""
    m = re.search(r"rotate\((-?[\d.e+-]+)", pg.evaluate(BOTTLE) or "")
    return round(float(m.group(1)) / (360 / n)) % n if m and n else None


def t_truth(host, everyone, watcher, names):
    T.start_game(host, everyone, "truth")
    for g in everyone:
        ok(g.evaluate(RING) == PLAYERS, f"[truth] {g._name}: the ring is the three players {g.evaluate(RING)}")
    shot(host, "truth-ring")
    shot(watcher, "truth-ring")
    landed = []
    for r in range(SPINS):
        v = view(host)
        spinner = by_pid(everyone, v["spinner"])
        ok(spinner is not watcher, f"[truth] spin {r}: a player spins ({spinner._name})")
        spinner.get_by_role("button", name="转瓶子").click()
        ok(until(lambda: view(host)["phase"] == "choose", 4000), f"[truth] spin {r}: the spin counts (no spinning again)")
        v = view(host)
        chosen = names.get(v["chosen"])
        landed.append(chosen)
        ok(chosen in PLAYERS, f"[truth] spin {r}: the server chose a player ({chosen})")
        until(lambda: all(g.locator(".choose-box").count() for g in everyone), 9000)
        time.sleep(0.5)
        for g in everyone:
            ring = g.evaluate(RING)
            slot = bottle_slot(g, len(ring))
            at = ring[slot] if slot is not None and slot < len(ring) else None
            ok(at == chosen, f"[truth] spin {r}: on {g._name}'s phone the bottle stops on {at}, the server chose {chosen}")
        if r == 0:
            shot(watcher, "truth-landed")
            shot(spinner, "truth-landed")
        picked = by_pid(everyone, v["chosen"])
        picked.get_by_role("button", name="真心话").click()
        ok(until(lambda: picked.locator(".cloche-dome").count(), 4000), f"[truth] spin {r}: {picked._name} gets a truth")
        picked.locator(".cloche-dome").click()
        picked.get_by_role("button", name="做完了").click(timeout=5000)
        ok(until(lambda: view(host)["phase"] == "spin", 4000), f"[truth] spin {r}: on to {picked._name}'s spin")
    print(f"  the bottle stopped on: {landed}")
    end_game(host, everyone)


# ---------------------------------------------------------------- lists, counts and the watcher's own phone

def t_superlatives(host, everyone, watcher, names):
    T.start_game(host, everyone, "superlatives")
    time.sleep(0.6)
    for g in everyone:
        ballot = texts(g, ".ballot .nominee-name")
        ok(len(ballot) == 3 and without_watcher(ballot), f"[superlatives] {g._name}: the ballot is the three players {ballot}")
        count = g.locator(".sup-status strong").inner_text().strip()
        ok(count == "0/3", f"[superlatives] {g._name}: {count} voted")
        ok(g.locator(".sup-voted > span").count() == 3, f"[superlatives] {g._name}: three faces to vote")
    ok(watcher.locator(".ballot .nominee:not([disabled])").count() == 0, "[superlatives] the watcher has nobody to vote for")
    shot(host, "superlatives-ballot")
    shot(watcher, "superlatives-ballot")
    for g in everyone:
        if g is not watcher:
            g.locator(".ballot .nominee", has_text="Ben" if g._name == "Amy" else "Amy").click()
            time.sleep(0.3)
    ok(until(lambda: view(host)["phase"] == "reveal"), "[superlatives] revealed once the three players voted")
    time.sleep(1.0)
    shot(watcher, "superlatives-reveal")
    end_game(host, everyone)


def t_prompts(host, everyone, watcher, names):
    T.start_game(host, everyone, "prompts")
    host.get_by_role("button", name="谁最有可能").click()
    until(lambda: view(host)["mode"] == "likely")
    by_pid(everyone, view(host)["reader"]).get_by_role("button", name="抽一张").click()
    ok(until(lambda: view(host)["phase"] == "answer"), "[likely] a card is up")
    time.sleep(0.8)
    for g in everyone:
        count = g.locator(".answer-head .hint").inner_text().strip()
        ok(count == "0/3 人好了", f"[likely] {g._name}: {count}")
        if g is watcher:
            ok(g.locator(".picker").count() == 0, "[likely] the watcher has nobody to vote for")
        else:
            chips = texts(g, ".picker .chip")
            ok(len(chips) == 3 and without_watcher(chips), f"[likely] {g._name}: votes among the three players {chips}")
    shot(host, "likely-vote")
    shot(watcher, "likely-vote")
    for g in everyone:
        if g is not watcher:
            g.locator(".picker .chip", has_text="Ben" if g._name == "Amy" else "Amy").click()
            time.sleep(0.3)
    ok(until(lambda: view(host)["phase"] == "reveal"), "[likely] revealed once the three players voted")
    end_game(host, everyone)


def t_king(host, everyone, watcher, names):
    T.start_game(host, everyone, "king")
    v = view(host)
    ok(v["count"] == 3 and me(watcher) not in v["inRound"], f"[king] three sticks, none for the watcher ({v['count']})")
    ok(watcher.locator(".holder-svg g[role=button][aria-disabled='false']").count() == 0, "[king] the watcher can't draw a stick")
    hint = watcher.locator(".holder-svg").locator("xpath=preceding-sibling::p[1]").inner_text().strip()
    ok("下一轮" not in hint, f"[king] the watcher isn't promised the next round ({hint!r})")
    shot(watcher, "king-deal")
    players = [g for g in everyone if g is not watcher]
    for i, g in enumerate(players):
        free = g.locator(".holder-svg g[role=button][aria-disabled='false']")
        (free.last if i % 2 else free.first).click()
        time.sleep(0.35)
    time.sleep(0.9)
    for g in players:
        g.get_by_role("button", name="记住了").click()
        time.sleep(0.2)
    ok(until(lambda: view(host)["phase"] == "crown"), "[king] crowned when the three players are ready")
    time.sleep(0.6)
    king = by_pid(everyone, view(host)["king"])
    king.get_by_role("button", name="国王抽命令").click()
    ok(until(lambda: view(host)["phase"] == "command"), "[king] command drawn")
    time.sleep(0.6)
    king.get_by_role("button", name="有人不做").click()
    time.sleep(0.5)
    chips = texts(king, ".picker .chip")
    ok(len(chips) == 3 and without_watcher(chips), f"[king] who refused: the three players {chips}")
    shot(king, "king-refuse")
    end_game(host, everyone)


def t_draw(host, everyone, watcher, names):
    T.start_game(host, everyone, "draw")
    drawer = by_pid(everyone, view(host)["drawer"])
    ok(drawer is not watcher, f"[draw] a player draws ({drawer._name})")
    drawer.get_by_role("button", name=re.compile("简单")).click()
    ok(until(lambda: view(host)["phase"] == "draw"), "[draw] drawing")
    time.sleep(0.8)
    word = view(drawer)["word"]["zh"]
    ok(watcher.locator(".guess-field").count() == 0, "[draw] the watcher has no guess box")
    shot(watcher, "draw-drawing")
    for g in everyone:
        if g is watcher or g is drawer:
            continue
        ok(g.locator(".guess-field").count() == 1, f"[draw] {g._name} has a guess box")
        g.locator(".guess-field input").fill(word)
        g.locator(".guess-field button[type=submit]").click()
        time.sleep(0.4)
    ok(until(lambda: view(host)["phase"] == "result"), "[draw] both players guessed it")
    time.sleep(1.0)
    for g in everyone:
        rows = texts(g, ".score-list li")
        ok(len(rows) == 3 and without_watcher(rows), f"[draw] {g._name}: the scores are the three players' {rows}")
    shot(host, "draw-scores")
    shot(watcher, "draw-scores")
    end_game(host, everyone)


def t_freeze(host, everyone, watcher, names):
    T.start_game(host, everyone, "freeze")
    time.sleep(0.6)
    for g in everyone:
        rows = texts(g, ".fz-roster li")
        ok(len(rows) == 3 and without_watcher(rows), f"[freeze] {g._name}: the dancers are the three players {rows}")
    ok(watcher.locator(".fz button", has_text="感应").count() == 0, "[freeze] the watcher has no motion sensing to turn on")
    ok(host.locator(".fz button", has_text="感应").count() == 1, "[freeze] a player has")
    shot(host, "freeze-ready")
    shot(watcher, "freeze-ready")
    host.get_by_role("button", name="放音乐").click()
    ok(until(lambda: view(host)["phase"] == "dance"), "[freeze] dancing")
    time.sleep(0.8)
    ok("出局" not in watcher.locator(".fz").inner_text(), "[freeze] the watcher isn't told she's out")
    shot(watcher, "freeze-dance")
    end_game(host, everyone)


def t_postit(host, everyone, watcher, names):
    T.start_game(host, everyone, "postit")
    host.get_by_role("button", name="不等了，没写的随机").click()
    ok(until(lambda: view(host)["phase"] == "play"), "[post-it] playing")
    time.sleep(0.8)
    order = view(host)["order"]
    ok(len(order) == 3 and me(watcher) not in order, f"[post-it] notes for the three players only ({[names.get(x) for x in order]})")
    asker = by_pid(everyone, view(host)["turn"])
    asker.locator(".pi-ask input").fill("我是动物吗？")
    asker.locator(".pi-ask button[type=submit]").click()
    ok(until(lambda: watcher.locator(".pi-question").count()), "[post-it] the watcher hears the question")
    ok(watcher.locator(".pi-reply").count() == 0, "[post-it] and has no answer buttons")
    others = [g for g in everyone if g is not watcher and g is not asker]
    ok(all(g.locator(".pi-reply").count() == 3 for g in others), "[post-it] the other two players answer")
    shot(watcher, "postit-play")
    shot(others[0], "postit-play")
    end_game(host, everyone)


def t_tune(host, everyone, watcher, names):
    T.start_game(host, everyone, "tune")
    host.get_by_role("button", name="旋律").click()
    until(lambda: view(host)["mode"] == "melody")
    if view(host)["quiz"]:
        host.get_by_role("button", name="抢答").click()
        until(lambda: not view(host)["quiz"])
    host.get_by_role("button", name="放第一首").click()
    ok(until(lambda: view(host)["phase"] == "listen"), "[tune] a tune is playing")
    time.sleep(1.0)
    ok(watcher.locator(".buzz").count() == 0, "[tune] the watcher has no buzzer")
    ok(all(g.locator(".buzz").count() == 1 for g in everyone if g is not watcher), "[tune] every player has one")
    shot(watcher, "tune-listen")
    shot(host, "tune-listen")
    end_game(host, everyone)


def t_euchre(host, everyone, watcher, names):
    T.start_game(host, everyone, "euchre")
    time.sleep(0.6)
    seated = [s["pid"] for s in view(host)["seats"] if s["pid"]]
    ok(len(seated) == 3 and me(watcher) not in seated, f"[euchre] the three players sit, a computer has the fourth seat ({[names.get(x) for x in seated]})")
    ok(watcher.locator(".eu-sit").count() == 0, "[euchre] the watcher can't take the computer's seat")
    ok(all(g.locator(".eu-sit").count() >= 1 for g in everyone if g is not watcher), "[euchre] a player can move to it")
    shot(watcher, "euchre-setup")
    shot(host, "euchre-setup")
    end_game(host, everyone)


def t_rogue(host, everyone, watcher, names):
    T.start_game(host, everyone, "rogue")
    time.sleep(0.6)
    ok(watcher.locator(".power-quiet").count() == 0, "[rogue] the watcher has no bathroom button to drink for")
    ok(all(g.locator(".power-quiet").count() == 1 for g in everyone if g is not watcher), "[rogue] every player has")
    shot(watcher, "rogue")
    end_game(host, everyone)


def t_undercover(host, everyone, watcher, names):
    # it takes four players: Cat plays to start it, then sits down to watch before the deal
    watching(watcher, False)
    T.start_game(host, everyone, "undercover")
    line = lambda: host.locator(".setup-card .hint-ink").first.inner_text()
    ok(until(lambda: line().startswith("4 人在玩")), f"[undercover] four playing ({line()[:12]})")
    watching(watcher, True)
    ok(until(lambda: line().startswith("3 人在玩")), f"[undercover] the watcher isn't counted ({line()[:12]})")
    ok(host.get_by_role("button", name="发词").is_disabled(), "[undercover] three players can't be dealt in")
    shot(host, "undercover-setup")
    end_game(host, everyone)


with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = T.seat_table(browser, NAMES)
    everyone = [host] + guests
    watcher = everyone[NAMES.index(WATCHER)]
    watching(watcher, True)
    names = {s["id"]: s["name"] for s in room(host)["seats"]}
    for gid in ["truth", "superlatives", "prompts", "king", "draw", "freeze", "postit", "tune", "euchre", "rogue", "undercover"]:
        if ONLY and gid not in ONLY:
            continue
        print(f"--- {gid}", flush=True)
        try:
            globals()[f"t_{gid}"](host, everyone, watcher, names)
        except Exception as e:
            ok(False, f"[{gid}] crashed: {str(e).splitlines()[0][:200]}")
            for g in everyone:
                shot(g, f"crash-{gid}")
            try:
                end_game(host, everyone)
            except Exception:
                pass
    T.errors(everyone)
    browser.close()

print(f"screenshots: {OUT}")
print("FAILED:\n  " + "\n  ".join(T.fails) if T.fails else "watch players check passed")
sys.exit(1 if T.fails else 0)
