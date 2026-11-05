"""The seven newer games, one phone and online, against the local dev servers.

usage: python3 scripts/party_test.py [base_url] [game ...]
games: superlatives punchline postit freeze limbo limbo-variants tune euchre
Screenshots go to $SHOTS (default: scratchpad/party).
"""
import json, math, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
ONLY = [a for a in sys.argv[1:] if not a.startswith("http")]
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/party")
os.makedirs(OUT, exist_ok=True)
ORDER = ["truth", "rogue", "trip", "superlatives", "king", "drama", "postit", "limbo", "prompts", "euchre", "dice", "freeze", "wheel", "undercover", "tune", "punchline", "draw", "dj", "hide"]
GAME_INDEX = {g: i for i, g in enumerate(ORDER)}
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "Mia", "Jay", "Kev"])]

fails = []


def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)


def phone(browser, name, lang="zh", players=None, w=390, h=844):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    settings = {"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": players or []}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs
    pg._name = name
    return pg


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def view(pg):
    return pg.evaluate("() => window.__room && window.__room.game")


def room(pg):
    return pg.evaluate("() => window.__room")


def me(pg):
    return pg.evaluate("() => window.__room && window.__room.you")


def until(fn, timeout=8000, step=120):
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


def clear_stamps(pages, wait=True):
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
                        b.first.click(timeout=1500)
                    except Exception:
                        pass
                    break
        if not busy:
            return
        time.sleep(0.5)


def seat_table(browser, names, lang="zh"):
    host = phone(browser, names[0], lang)
    host.goto(BASE, wait_until="networkidle")
    host.wait_for_timeout(400)
    host.locator(".online-btn").click()
    host.wait_for_timeout(400)
    host.locator("#online-name").fill(names[0])
    host.get_by_role("button", name="开一桌" if lang == "zh" else "Open a table", exact=True).click()
    host.wait_for_url(re.compile(r"/t/[A-Z0-9]{4}"), timeout=5000)
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    until(lambda: room(host))
    guests = []
    for n in names[1:]:
        g = phone(browser, n, lang)
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        g.wait_for_timeout(250)
        g.locator(".join-card input").fill(n)
        g.locator(".join-card button[type=submit]").click()
        guests.append(g)
    for g in guests:
        until(lambda: room(g))
    ok(until(lambda: len(room(host)["seats"]) == len(names)), f"{len(names)} seated at {code}")
    host.wait_for_timeout(400)
    return host, guests, code


def start_game(host, everyone, gid):
    if room(host)["front"] != GAME_INDEX[gid]:
        host.locator(f'.lobby .tile[data-tile="{GAME_INDEX[gid]}"]').click()
        until(lambda: room(host)["front"] == GAME_INDEX[gid])
        host.wait_for_timeout(300)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(until(lambda g=g: (view(g) or {}).get("id") == gid) for g in everyone), f"[{gid}] every phone is in the game")
    host.wait_for_timeout(600)


def by_pid(pages, pid):
    for g in pages:
        if me(g) == pid:
            return g
    return None


def errors(pages):
    errs = [(g._name, e) for g in pages for e in g._errs if "favicon" not in e and "WebSocket" not in e]
    ok(not errs, f"no page errors {errs[:3]}")


# ------------------------------------------------------------------ superlatives

def t_superlatives_single(browser):
    pg = phone(browser, "solo", players=PLAYERS[:4])
    pg.goto(BASE + "#/g/superlatives", wait_until="networkidle")
    pg.wait_for_selector(".award-card")
    pg.wait_for_timeout(800)
    shot(pg, "sup-setup")
    pg.get_by_role("button", name="开始颁奖").click()
    for i, p in enumerate(PLAYERS[:4]):
        pg.wait_for_selector(".pass-curtain")
        if i == 0:
            pg.wait_for_timeout(500)
            shot(pg, "sup-pass")
        pg.get_by_role("button", name=f"我是 {p['name']}").click()
        pg.wait_for_selector(".ballot .nominee")
        if i == 0:
            pg.wait_for_timeout(300)
            shot(pg, "sup-ballot")
        target = "Mia" if p["name"] != "Mia" else "Jay"
        pg.locator(".ballot .nominee", has_text=target).click()
    pg.wait_for_selector(".award-reveal")
    pg.wait_for_timeout(2600)
    shot(pg, "sup-reveal")
    ok("Mia" in pg.locator(".winners").inner_text(), "one phone: Mia takes the award with three votes")
    pg.wait_for_timeout(800)
    clear_stamps([pg])
    errors([pg])
    pg.context.close()


def t_superlatives_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "superlatives")
    shot(host, "sup-net-vote")
    pids = [me(g) for g in everyone]
    # everyone votes for Jay (Jay votes Mia)
    jay = pids[2]
    for g in everyone:
        target = "Mia" if me(g) == jay else "Jay"
        g.locator(".ballot .nominee", has_text=target).click()
    ok(all(until(lambda g=g: (view(g) or {}).get("phase") == "reveal") for g in everyone), "votes in: reveal on every phone")
    host.wait_for_timeout(2700)
    shot(host, "sup-net-reveal")
    v = view(host)
    ok(v["winners"] == [jay] and v["counts"][jay] == 2, "Jay wins 2 to 1")
    clear_stamps(everyone)
    # jump to the ceremony
    for _ in range(9):
        if (view(host) or {}).get("phase") == "ceremony":
            break
        if view(host)["phase"] == "reveal":
            # the winner's stamp lands 2.6 s after the reveal and covers their phone, the host's
            # too when the host won: let it land and clear it before the host moves on
            host.wait_for_timeout(2800)
            clear_stamps(everyone)
            host.get_by_role("button", name=re.compile("下一个奖|开颁奖典礼")).click()
            host.wait_for_timeout(300)
        for g in everyone:
            if (view(g) or {}).get("phase") == "vote" and not view(g).get("myVote"):
                # the last award's winner may still be holding a penalty stamp
                clear_stamps([g], wait=False)
                g.locator(".ballot .nominee:not([disabled])").first.click()
        until(lambda: view(host)["phase"] != "vote", 5000)
        clear_stamps(everyone, wait=False)
    ok(until(lambda: view(host)["phase"] == "ceremony", 5000), "eight awards, then the ceremony")
    host.wait_for_timeout(1200)
    clear_stamps(everyone)
    shot(host, "sup-net-ceremony")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ punchline

def t_punchline_single(browser):
    pg = phone(browser, "solo", players=PLAYERS[:3])
    pg.goto(BASE + "#/g/punchline", wait_until="networkidle")
    pg.wait_for_selector(".pl-prompt")
    pg.get_by_role("button", name="开始").click()
    for i in range(3):
        pg.wait_for_selector(".pass-curtain")
        if i == 0:
            pg.wait_for_timeout(3600)
            shot(pg, "pl-pass")
        pg.locator(".game-actions .btn-primary").click()
        pg.wait_for_selector(".pl-solo-write textarea")
        boxes = pg.locator(".pl-solo-write textarea")
        for j in range(boxes.count()):
            if i == 2 and j == 1:
                pg.get_by_role("button", name="想不出来？给我一个（分数减半）").last.click()
                continue
            boxes.nth(j).fill(["冰箱里住着一只企鹅", "老板说今天放假", "外卖小哥是我前任", "我的猫会说英语", "月亮其实是个灯泡", "恐龙只是想减肥"][(i * 2 + j) % 6])
        if i == 0:
            shot(pg, "pl-write")
        pg.locator(".game-actions button[type=submit]").click()
    pg.wait_for_selector(".sh-stage .sh-ans")
    pg.wait_for_timeout(4200)
    shot(pg, "pl-present")
    pg.get_by_role("button", name="念完了，开始举手").click()
    pg.wait_for_selector(".pl-tally-row")
    pg.locator(".pl-tally-row").first.locator("button[aria-label$='多一票']").click()
    pg.wait_for_timeout(500)
    shot(pg, "pl-board")
    pg.get_by_role("button", name="揭晓是谁写的").click()
    pg.wait_for_selector(".sh-by")
    pg.wait_for_timeout(4600)
    shot(pg, "pl-result")
    ok(pg.locator(".sh-sweep").count() == 0, "one vote is not a sweep (needs two)")
    ok(pg.locator(".sh-token .pl-hand").count() == 1, "the counted hand shows up on the answer")
    pg.wait_for_timeout(1200)
    clear_stamps([pg])
    errors([pg])
    pg.context.close()


def t_punchline_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "punchline")
    shot(host, "pl-net-write")
    answers = ["我的手机先睡了", "Wi-Fi 叫 别偷了", "外星人要求退货", "冰箱在开会", "猫已读不回", "老板也想辞职"]
    n = 0
    for g in everyone:
        for card in range(g.locator(".pl-write textarea").count()):
            g.locator(".pl-write textarea").first.fill(answers[n % len(answers)])
            g.locator(".pl-write form button[type=submit]").first.click()
            g.wait_for_timeout(150)
            n += 1
    ok(until(lambda: view(host)["phase"] == "vote"), "all answers in: voting starts")
    host.wait_for_timeout(500)
    voter = next(g for g in everyone if view(g)["match"]["canVote"])
    ok(voter.locator(".sh-stage.is-phone").count() == 1, "no TV in the room: every phone plays the show")
    voter.wait_for_timeout(400)
    shot(voter, "pl-net-vote")
    voter.locator(".sh-ans.is-tappable").first.click()
    ok(until(lambda: view(host)["phase"] == "result"), "the only voter voted: result")
    host.wait_for_timeout(1200)
    shot(host, "pl-net-result")
    v = view(host)
    ok(sum((a["votes"] or 0) for a in v["match"]["answers"]) == 1, "one vote counted")
    clear_stamps(everyone)
    host.get_by_role("button", name="下一题").click()
    ok(until(lambda: view(host)["phase"] in ("vote", "result")), "next matchup")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ post-it

def t_postit_single(browser):
    pg = phone(browser, "solo", players=PLAYERS[:2])
    pg.goto(BASE + "#/g/postit", wait_until="networkidle")
    pg.wait_for_selector(".deck-grid")
    pg.locator(".deck-pick").nth(1).click()
    pg.get_by_role("button", name="45 秒").click()
    shot(pg, "pi-setup")
    pg.get_by_role("button", name="开始", exact=True).click()
    pg.wait_for_selector(".pass-curtain")
    shot(pg, "pi-ready")
    pg.get_by_role("button", name="举好了，开始").click()
    pg.wait_for_selector(".heads-word", timeout=8000)
    pg.wait_for_timeout(400)
    shot(pg, "pi-word")
    pg.locator(".heads-right").click()
    pg.wait_for_timeout(700)
    pg.locator(".heads-right").click()
    pg.wait_for_timeout(700)
    pg.locator(".heads-left").click()
    pg.wait_for_timeout(700)
    ok(pg.locator(".heads-score").inner_text().strip().endswith("2"), "two right on the tap fallback")
    pg.wait_for_selector(".heads-list", timeout=75000)
    shot(pg, "pi-done")
    ok(pg.locator(".heads-list li").count() == 3, "three words listed after the round")
    errors([pg])
    pg.context.close()


def t_postit_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "postit")
    notes = ["孙悟空", "Pikachu", "熊猫"]
    for i, g in enumerate(everyone):
        g.locator(".pi-note-input").fill(notes[i])
        if i == 0:
            shot(g, "pi-net-write")
        g.get_by_role("button", name="贴上去").click()
    ok(until(lambda: view(host)["phase"] == "play"), "all notes stuck on: play")
    host.wait_for_timeout(600)
    v = view(host)
    ok(v["notes"][me(host)] is None and sum(1 for n in v["notes"].values() if n) == 2, "host sees two notes, not their own")
    turn = by_pid(everyone, v["turn"])
    others = [g for g in everyone if g is not turn]
    turn.locator(".pi-ask input").fill("我是动物吗？")
    turn.locator(".pi-ask button").click()
    until(lambda: view(others[0])["asking"])
    others[0].locator(".pi-reply.is-no").click()
    others[1].locator(".pi-reply.is-yes").click()
    ok(until(lambda: len(view(turn)["replies"]) == 2), "both replies reached the asker")
    shot(turn, "pi-net-ask")
    shot(others[0], "pi-net-reply")
    # the asker's note, seen from another phone
    mine = view(others[0])["notes"][me(turn)]
    turn.locator(".pi-guess input").fill(mine["zh"])
    turn.locator(".pi-guess button[type=submit]").click()
    ok(until(lambda: me(turn) in view(host)["solved"]), "guessed right")
    turn.wait_for_timeout(500)
    shot(turn, "pi-net-solved")
    ok(view(turn)["notes"][me(turn)] is not None, "a solved player sees their own note")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ freeze

def t_freeze_single(browser):
    pg = phone(browser, "solo", players=PLAYERS[:3])
    pg.goto(BASE + "#/g/freeze", wait_until="networkidle")
    pg.wait_for_selector(".setup-panel")
    shot(pg, "fz-setup")
    pg.get_by_role("button", name="放音乐").click()
    pg.wait_for_selector(".floor")
    pg.wait_for_timeout(1500)
    shot(pg, "fz-dance")
    pg.wait_for_selector(".freeze", timeout=22000)
    pg.wait_for_timeout(500)
    pg.locator(".fz-catch-btn").first.click()
    shot(pg, "fz-freeze")
    pg.locator(".game-actions button.btn-primary").click()
    pg.wait_for_timeout(900)
    ok(pg.locator(".stamp-layer").count() == 1, "the caught dancer drinks before the music comes back")
    clear_stamps([pg])
    ok(until(lambda: pg.locator(".floor").count() == 1, 4000), "music back on: round 2")
    errors([pg])
    pg.context.close()


def t_freeze_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "freeze")
    shot(host, "fz-net-ready")
    host.get_by_role("button", name="放音乐").click()
    ok(all(until(lambda g=g: view(g)["phase"] == "dance") for g in everyone), "every phone dancing")
    host.wait_for_timeout(2500)
    shot(guests[0], "fz-net-dance")
    ok(until(lambda: view(host)["phase"] == "freeze", 22000), "the music cut on every phone")
    host.wait_for_timeout(300)
    # Mia owns up; the host catches Jay
    guests[0].get_by_role("button", name="我动了").click()
    host.locator(".fz-catch-btn", has_text="Jay").click()
    shot(host, "fz-net-freeze")
    shot(guests[1], "fz-net-freeze-guest")
    ok(until(lambda: view(host)["phase"] in ("result", "end"), 6000), "judged")
    host.wait_for_timeout(600)
    shot(host, "fz-net-result")
    v = view(host)
    ok(v["phase"] == "end" and v["winner"] == me(host), "knockout: Mia and Jay out, Steve wins")
    clear_stamps(everyone)
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ limbo

# A stand-in motion sensor: the page hears an orientation reading every 50 ms, with the phone held
# at window.__beta (90 = upright; leaning back L degrees is 90 - L) and window.__gamma (0 unless
# tilted sideways, see tilt_to). Headless Chromium has no sensor and its DeviceOrientationEvent
# ignores the values it's given, so a plain event carries them.
FAKE_TILT = """() => {
  if (window.__tilt) return;
  window.__beta = 90;
  window.__gamma = 0;
  window.__tilt = setInterval(() => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'beta', { value: window.__beta });
    Object.defineProperty(e, 'gamma', { value: window.__gamma });
    window.dispatchEvent(e);
  }, 50);
}"""

# A stand-in player for Limbo's variants, on top of the stand-in sensor: every 40 ms it does what the
# gauge on screen asks (its data-target, data-band and the side level's data-want). It leans a little
# past a still bar and holds dead still (so 稳住 passes too), right on a moving bar's live angle (跟着动的杆),
# and a little past the side asked for (歪着过). window.__auto = false stands it up straight.
AUTO_PLAYER = """() => {
  window.__auto = true;
  if (window.__autoT) return;
  window.__autoT = setInterval(() => {
    if (!window.__auto) { window.__beta = 90; window.__gamma = 0; return; }
    const g = document.querySelector('.gauge[data-target]');
    if (!g) return;
    const t = +g.dataset.target;
    const lean = g.dataset.band !== undefined ? t : Math.min(88, t + 3);
    const s = document.querySelector('.lb-side[data-want]');
    const want = s ? +s.dataset.want : 0;
    const side = want + Math.sign(want) * 4;
    const r = Math.PI / 180, L = lean * r, S = side * r;
    window.__beta = Math.asin(Math.cos(L) * Math.cos(S)) / r;
    window.__gamma = Math.atan2(Math.cos(L) * Math.sin(S), Math.sin(L)) / r;
  }, 40);
}"""


def fake_sensor(pg):
    # newer Chromium asks DeviceOrientationEvent.requestPermission(), like iOS; let it say yes
    pg.context.grant_permissions(["accelerometer", "gyroscope", "magnetometer"])
    pg.evaluate(FAKE_TILT)


def lean_to(pg, deg):
    pg.evaluate("(d) => { window.__beta = 90 - d; }", deg)


def tilt_to(pg, lean, side=0):
    """Lean back `lean` degrees and tilt `side` degrees to the side (right is positive), as beta and gamma."""
    L, S = math.radians(lean), math.radians(side)
    beta = math.degrees(math.asin(math.cos(L) * math.cos(S)))
    gamma = math.degrees(math.atan2(math.cos(L) * math.sin(S), math.sin(L)))
    pg.evaluate("([b, g]) => { window.__auto = false; clearInterval(window.__autoT); window.__autoT = 0; window.__beta = b; window.__gamma = g; }", [beta, gamma])


def auto(pg):
    pg.evaluate(AUTO_PLAYER)


def target_of(pg):
    return int(pg.locator(".lb-blind-target").inner_text().strip().rstrip("°"))

def t_limbo_single(browser):
    pg = phone(browser, "solo", players=PLAYERS[:2])
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    pg.wait_for_selector(".limbo-scene")
    shot(pg, "lb-setup")
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=6000)
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb-count")
    shot(pg, "lb-count")
    pg.wait_for_selector(".game-actions .btn-primary", timeout=6000)
    shot(pg, "lb-try")
    pg.locator(".game-actions .btn-primary").click()
    pg.wait_for_selector(".lb-verdict.is-pass")
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".game-actions .btn-ghost", timeout=6000)
    pg.locator(".game-actions .btn-ghost").click()
    pg.get_by_role("button", name="这一杆结束").click()
    pg.wait_for_timeout(600)
    clear_stamps([pg])
    ok(until(lambda: pg.locator(".fz-face.is-winner").count() == 1, 4000), "Steve clears, Mia misses: Steve is champion")
    shot(pg, "lb-end")
    errors([pg])
    pg.context.close()


def t_limbo_blind_single(browser):
    pg = phone(browser, "blind", players=PLAYERS[:2])
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    pg.wait_for_selector(".limbo-scene")
    fake_sensor(pg)
    pg.get_by_role("button", name="盲仰").click()
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=6000)
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb-blind", timeout=6000)
    shot(pg, "lb-blind-try")
    ok(pg.locator(".gauge-read").count() == 0, "blind: the live angle isn't on screen")
    target = target_of(pg)
    lean_to(pg, target)
    ok(until(lambda: pg.locator(".lb-verdict").count() == 1, 5000), "holding still locks the lean")
    ok("正好" in pg.locator(".lb-verdict").inner_text(), "Steve spot on")
    shot(pg, "lb-blind-verdict")
    lean_to(pg, 0)
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb-blind", timeout=6000)
    lean_to(pg, target + 20 if target + 20 <= 85 else target - 20)
    ok(until(lambda: pg.locator(".lb-verdict").count() == 1, 5000), "Mia's lean locks too")
    pg.get_by_role("button", name="看看谁差得最远").click()
    pg.wait_for_timeout(600)
    clear_stamps([pg])
    ok(until(lambda: pg.locator(".fz-face.is-winner").count() == 1, 4000), "Mia furthest off: Steve wins blind lean")
    ok("最有手感" in pg.locator(".fz-result-title").inner_text(), "blind winner's title")
    shot(pg, "lb-blind-end")
    errors([pg])
    pg.context.close()


def t_limbo_blind_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia"])
    everyone = [host] + guests
    start_game(host, everyone, "limbo")
    host.get_by_role("button", name="盲仰").click()
    ok(until(lambda: view(guests[0])["mode"] == "blind"), "the host picks blind lean for everyone")
    for g in everyone:
        fake_sensor(g)
        g.get_by_role("button", name="开启动作感应").click()
    ok(until(lambda: len(view(host)["sensors"]) == 2), "both phones can measure")
    shot(host, "lb-blind-net-ready")
    host.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: view(guests[0])["phase"] == "go"), "blind round on both phones")
    ok(until(lambda: host.locator(".lb-blind").count() == 1, 6000), "the target shows after the count-in")
    target = view(host)["angle"]
    lean_to(host, target - 1)
    lean_to(guests[0], target + 15 if target + 15 <= 85 else target - 15)
    ok(until(lambda: view(host)["phase"] == "end", 8000), "both locked: one round decides two players")
    host.wait_for_timeout(700)
    clear_stamps(everyone)
    shot(host, "lb-blind-net-end")
    v = view(host)
    ok(v["winner"] == me(host) and v["locks"][me(host)] == target - 1, "Steve closest wins, angles revealed")
    errors(everyone)
    for g in everyone:
        g.context.close()


def t_limbo_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia"])
    everyone = [host] + guests
    start_game(host, everyone, "limbo")
    shot(host, "lb-net-ready")
    host.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: view(guests[0])["phase"] == "go"), "the bar is up on both phones")
    host.wait_for_timeout(1000)
    shot(guests[0], "lb-net-count")
    host.wait_for_timeout(3000)
    shot(host, "lb-net-go")
    host.get_by_role("button", name="我过了").click()
    guests[0].get_by_role("button", name="没过").click()
    ok(until(lambda: view(host)["phase"] == "end"), "one under, one out: game over")
    host.wait_for_timeout(700)
    clear_stamps(everyone)
    shot(host, "lb-net-end")
    ok(view(host)["winner"] == me(host), "Steve wins the limbo")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ limbo's variants

KIND_OF_TAG = [("稳住", "steady"), ("跟着动的杆", "moving"), ("歪", "tilt"), ("经典", "classic")]


def kind_of_tag(pg):
    tag = pg.locator(".lb-level .lb-tag").inner_text()
    return next((k for word, k in KIND_OF_TAG if word in tag), tag)


def solo_limbo(browser, tag, mode):
    """One phone, Steve and Mia, a stand-in sensor, this way to play: up to the first pass-the-phone."""
    pg = phone(browser, tag, players=PLAYERS[:2])
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    pg.wait_for_selector(".limbo-scene")
    fake_sensor(pg)
    pg.get_by_role("button", name=mode, exact=True).click()
    ok(mode in pg.locator(".lb-modes [aria-pressed=true]").inner_text(), f"[{mode}] picked")
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=6000)
    return pg


def gauge_target(pg):
    return float(pg.locator(".gauge[data-target]").get_attribute("data-target"))


def t_limbo_steady_single(browser):
    pg = solo_limbo(browser, "steady", "稳住")
    ok("稳住 2 秒" in pg.locator(".lb-level").inner_text(), "bar 1: hold still for 2 seconds")
    ok("一动不动" in pg.locator(".pass-curtain").inner_text(), "the pass-the-phone screen says how")
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb .gauge", timeout=6000)
    target = gauge_target(pg)
    t0 = time.time()
    lean_to(pg, target + 4)
    pg.wait_for_timeout(1200)
    lean_to(pg, target + 12)
    pg.wait_for_timeout(200)
    ok("晃了" in pg.locator(".gauge-note").inner_text(), "a wobble shows, and the hold starts again")
    shot(pg, "lb-steady-wobble")
    lean_to(pg, target + 4)
    ok(until(lambda: pg.locator(".lb-verdict").count() == 1, 6000), "held dead still again: through")
    took = time.time() - t0
    ok(took > 3.0, f"the wobble cost the hold ({took:.1f}s for a 2 second hold)")
    auto(pg)
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.get_by_role("button", name="准备好了").click()
    ok(until(lambda: pg.locator(".lb-verdict.is-pass").count() == 1, 9000), "Mia holds still: through")
    pg.get_by_role("button", name="这一杆结束").click()
    ok(until(lambda: "稳住 2.5 秒" in pg.locator(".lb-level").inner_text(), 4000), "both through, bar 2: a longer hold")
    errors([pg])
    pg.context.close()


def t_limbo_moving_single(browser):
    pg = solo_limbo(browser, "moving", "跟着动的杆")
    ok("跟着动的杆" in pg.locator(".lb-level").inner_text() and "8° 到 20°" in pg.locator(".pass-curtain").inner_text(), "bar 1 floats between 8 and 20 degrees")
    auto(pg)
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb .gauge[data-band]", timeout=6000)
    pg.wait_for_timeout(2500)
    a = gauge_target(pg)
    pg.wait_for_timeout(600)
    b = gauge_target(pg)
    ok(a != b, f"the bar moves ({a} then {b})")
    shot(pg, "lb-moving-try")
    ok(until(lambda: pg.locator(".lb-verdict").count() == 1, 16000), "it stops after two sways")
    ok("跟住了" in pg.locator(".lb-verdict").inner_text(), "Steve kept up with it")
    pg.evaluate("() => { window.__auto = false; }")
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb .gauge[data-band]", timeout=6000)
    t0 = time.time()
    ok(until(lambda: pg.locator(".lb-verdict").count() == 1, 8000), "Mia stands still: she loses it")
    took = time.time() - t0
    ok("跟丢了" in pg.locator(".lb-verdict").inner_text() and took < 6, f"lost it a second after the bar left her ({took:.1f}s in)")
    pg.get_by_role("button", name="这一杆结束").click()
    pg.wait_for_timeout(600)
    clear_stamps([pg])
    ok(until(lambda: pg.locator(".fz-face.is-winner").count() == 1, 4000), "Steve kept up, Mia didn't: Steve wins")
    errors([pg])
    pg.context.close()


def t_limbo_moving_nosensor_single(browser):
    # no stand-in sensor: the phone can't measure, so the table watches the bar and taps
    pg = phone(browser, "moving-nosensor", players=PLAYERS[:2])
    pg.goto(BASE + "#/g/limbo", wait_until="networkidle")
    pg.wait_for_selector(".limbo-scene")
    pg.get_by_role("button", name="跟着动的杆", exact=True).click()
    pg.get_by_role("button", name="放音乐，开始").click()
    pg.wait_for_selector(".pass-curtain", timeout=8000)
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".game-actions .btn-primary", timeout=6000)
    ok(pg.locator(".game-actions .btn-primary").is_disabled(), "nobody has kept up while the bar still moves")
    pg.get_by_role("button", name="跟丢了").click()
    ok("跟丢了" in pg.locator(".lb-verdict").inner_text(), "Steve lost it")
    pg.get_by_role("button", name=re.compile("下一个")).click()
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".game-actions .btn-primary", timeout=6000)
    ok(until(lambda: pg.locator(".game-actions .btn-primary").is_enabled(), 17000), "the bar stops: now the table can say she kept up")
    ok("横杆停了" in pg.locator(".lb-time").inner_text(), "and the phone asks")
    pg.locator(".game-actions .btn-primary").click()
    pg.get_by_role("button", name="这一杆结束").click()
    pg.wait_for_timeout(600)
    clear_stamps([pg])
    ok(until(lambda: pg.locator(".fz-face.is-winner").count() == 1, 4000), "Mia kept up, Steve didn't: Mia wins")
    errors([pg])
    pg.context.close()


def t_limbo_tilt_single(browser):
    pg = solo_limbo(browser, "tilt", "歪着过")
    ok(re.search(r"往[左右]歪 15°", pg.locator(".lb-level .lb-tag").inner_text()), "bar 1: tilt 15 degrees, one side or the other")
    pg.get_by_role("button", name="准备好了").click()
    pg.wait_for_selector(".lb-side", timeout=6000)
    want = int(pg.locator(".lb-side").get_attribute("data-want"))
    target = gauge_target(pg)
    sign = 1 if want > 0 else -1
    tilt_to(pg, target + 5, 0)
    pg.wait_for_timeout(1800)
    ok(pg.locator(".lb-verdict").count() == 0, "leaning back alone isn't enough")
    tilt_to(pg, target + 5, -want - 4 * sign)
    pg.wait_for_timeout(1800)
    ok(pg.locator(".lb-verdict").count() == 0, "nor the wrong side")
    tilt_to(pg, target + 5, want + 4 * sign)
    pg.wait_for_timeout(300)
    shot(pg, "lb-tilt-try")
    ok(until(lambda: pg.locator(".lb-verdict.is-pass").count() == 1, 3000), "back and to the side: through")
    errors([pg])
    pg.context.close()


def t_limbo_party_single(browser):
    pg = solo_limbo(browser, "party", "派对")
    auto(pg)
    kinds = []
    for i in range(3):
        kinds.append(kind_of_tag(pg))
        for turn in ("Steve", "Mia"):
            pg.get_by_role("button", name="准备好了").click()
            ok(until(lambda: pg.locator(".lb-verdict.is-pass").count() == 1, 22000), f"bar {i + 1} ({kinds[-1]}): {turn} through")
            pg.get_by_role("button", name=re.compile("下一个|这一杆结束")).click()
        pg.wait_for_timeout(400)
    ok(all(k in ("classic", "steady", "moving", "tilt") for k in kinds) and all(kinds[i] != kinds[i - 1] for i in range(1, 3)), f"a different one each bar ({kinds})")
    errors([pg])
    pg.context.close()


def online_limbo(browser, mode, mode_id, sensors=(True, True)):
    """Steve hosts, Mia joins, Limbo in this way to play; the phones with a sensor turn it on."""
    host, guests, _ = seat_table(browser, ["Steve", "Mia"])
    everyone = [host] + guests
    start_game(host, everyone, "limbo")
    host.get_by_role("button", name=mode, exact=True).click()
    ok(until(lambda: view(guests[0])["mode"] == mode_id), f"the host picks {mode} for everyone")
    ok(mode in guests[0].locator(".lb").inner_text(), "the guest sees what's on")
    for g, on in zip(everyone, sensors):
        if on:
            fake_sensor(g)
            g.get_by_role("button", name="开启动作感应").click()
    ok(until(lambda: len(view(host)["sensors"]) == sum(sensors)), "motion sensing on")
    return host, guests, everyone


def bar_angle_at(angle, bar, ms):
    """The moving bar's path, as the rules have it (barAngleAt in shared/engine/games/limbo.ts; it waits 1.5 s at its top)."""
    t = min(max(0, ms - 1500), bar["moveMs"] - 1500)
    return angle - bar["swing"] + bar["swing"] * (1 - math.cos(2 * math.pi * t / bar["period"])) / 2


# one phone, one moment: its clock (the server's, within a few ms here), the bar in the scene, and its gauge's target if it shows one
BAR_NOW = """() => {
  const g = document.querySelector('.gauge[data-band]');
  const y = +document.querySelector('.limbo-bar-front > g').getAttribute('transform').match(/translate\\(0 ([-\\d.]+)\\)/)[1];
  return [Date.now(), (y - 40) / 150 * 90, g ? +g.dataset.target : null];
}"""


def t_limbo_moving_online(browser):
    host, guests, everyone = online_limbo(browser, "跟着动的杆", "moving")
    for g in everyone:
        auto(g)
    host.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: view(guests[0])["phase"] == "go"), "the bar is up")
    v = view(host)
    ok(v["bar"]["kind"] == "moving" and view(guests[0])["bar"] == v["bar"] and view(guests[0])["startAt"] == v["startAt"], "one moving bar and one start time for both phones")
    ok(until(lambda: all(g.locator(".gauge[data-band]").count() for g in everyone), 6000), "both phones follow it")
    mia = me(guests[0])
    guests[0].evaluate("() => { window.__auto = false; }")
    ok(until(lambda: mia in view(host)["failed"], 6000), "Mia stops following: she lost it")
    ok(view(host)["best"].get(mia, 0) >= 8, f"how deep she followed it counts ({view(host)['best'].get(mia)})")
    still_moving = time.time() * 1000 < v["startAt"] + v["bar"]["moveMs"] - 1000
    ok(not still_moving or me(host) not in view(host)["passed"], "nobody has kept up while it still moves")
    # every phone works the bar out from the server's start time: where the path says, at each phone's own moment
    worst = 0
    for _ in range(4):
        for g in everyone:
            t, scene, gauge = g.evaluate(BAR_NOW)
            want = bar_angle_at(v["angle"], v["bar"], t - v["startAt"])
            worst = max(worst, abs(scene - want), abs(gauge - want) if gauge is not None else 0)
        host.wait_for_timeout(300)
    ok(worst <= 2.5, f"the bar is where the start time puts it, on both phones ({worst:.1f}° off at most)")
    shot(host, "lb-moving-net")
    shot(guests[0], "lb-moving-net")
    ok(until(lambda: view(host)["phase"] == "end", 16000), "Steve keeps up to the end")
    host.wait_for_timeout(700)
    clear_stamps(everyone)
    ok(view(host)["winner"] == me(host), "Steve wins")
    errors(everyone)
    for g in everyone:
        g.context.close()


def t_limbo_steady_online(browser):
    host, guests, everyone = online_limbo(browser, "稳住", "steady", sensors=(True, False))
    auto(host)
    host.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: host.locator(".lb .gauge").count() == 1, 7000), "the count-in, then the gauge")
    t0 = time.time()
    g = guests[0]
    ok(until(lambda: g.get_by_role("button", name="我过了").count() == 1) and "一动不动" in g.locator(".lb").inner_text(), "a phone that can't measure: what to do, and honesty buttons")
    shot(g, "lb-steady-net-nosensor")
    host.get_by_role("button", name="没过").click()
    ok(until(lambda: me(g) in view(host)["failed"]), "the host judges Mia: missed")
    ok(until(lambda: view(host)["phase"] == "end", 6000), "Steve holds still: through")
    took = time.time() - t0
    ok(took > 1.8, f"after the 2 second hold ({took:.1f}s)")
    ok(view(host)["winner"] == me(host), "Steve wins")
    host.wait_for_timeout(700)
    clear_stamps(everyone)
    errors(everyone)
    for p in everyone:
        p.context.close()


def t_limbo_tilt_online(browser):
    host, guests, everyone = online_limbo(browser, "歪着过", "tilt")
    auto(guests[0])
    host.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: host.locator(".lb-side").count() == 1, 7000), "the side level shows")
    want = int(host.locator(".lb-side").get_attribute("data-want"))
    ok(abs(want) == 15 and view(guests[0])["bar"]["side"] == want, f"the same side on both phones ({want})")
    target = view(host)["angle"]
    sign = 1 if want > 0 else -1
    tilt_to(host, target + 5, 0)
    host.wait_for_timeout(2000)
    ok(me(host) not in view(host)["passed"] and me(guests[0]) in view(host)["passed"], "Mia tilts too: through; Steve only leans back: not yet")
    tilt_to(host, target + 5, want + 4 * sign)
    host.wait_for_timeout(300)
    shot(host, "lb-tilt-net")
    ok(until(lambda: view(host)["phase"] == "result", 4000), "Steve tilts as well: through, the bar drops")
    host.get_by_role("button", name="马上下一杆").click()
    ok(until(lambda: view(host)["phase"] == "go" and abs(view(host)["bar"]["side"]) == 18), "bar 2: 18 degrees to a random side")
    errors(everyone)
    for p in everyone:
        p.context.close()


def t_limbo_party_online(browser):
    host, guests, everyone = online_limbo(browser, "派对", "party")
    for g in everyone:
        auto(g)
    host.get_by_role("button", name="开始", exact=True).click()
    kinds = []
    for i in range(3):
        ok(until(lambda: view(host)["phase"] == "go"), f"bar {i + 1} is up")
        v = view(host)
        kinds.append(v["bar"]["kind"])
        ok(view(guests[0])["bar"] == v["bar"], f"bar {i + 1}: the same {kinds[-1]} bar on both phones")
        ok(until(lambda: view(host)["phase"] == "result", 25000), f"bar {i + 1} ({kinds[-1]}): both through")
        ok(len(view(host)["passed"]) == 2, "nobody out")
        if i == 0:
            shot(host, "lb-party-net")
        if i < 2:
            host.get_by_role("button", name="马上下一杆").click()
    ok(all(k in ("classic", "steady", "moving", "tilt") for k in kinds) and all(kinds[i] != kinds[i - 1] for i in range(1, 3)), f"a different one each bar ({kinds})")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ name that tune

def song_id_of(audio_url):
    """The server sends the preview, not the answer: find the song by its preview in the song list."""
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "songs.ts"), encoding="utf-8").read()
    for line in src.splitlines():
        line = line.strip()
        if line.startswith("[") and line.endswith("],"):
            row = json.loads(line[:-1])
            if row[6] and row[6] in audio_url:
                return row[0]
    return None


def t_tune_single(browser):
    pg = phone(browser, "solo", players=PLAYERS[:3])
    # real songs (the default): the list loads on demand, the reveal links to Apple Music
    pg.goto(BASE + "#/g/tune", wait_until="networkidle")
    pg.wait_for_selector(".vinyl")
    pg.get_by_role("button", name="英文", exact=True).click()  # drop English: Chinese songs only
    ok(pg.locator(".tn-pool .chip[aria-pressed=true]", has_text="华语").count() == 1 and pg.locator(".tn-pool .chip[aria-pressed=true]", has_text="英文").count() == 0, "languages toggle one by one")
    pg.get_by_role("button", name="5 首").click()
    shot(pg, "tn-songs-setup")
    pg.get_by_role("button", name="开始").click()
    ok(until(lambda: pg.get_by_role("button", name="揭晓歌名").count() == 1, 8000), "real songs: a song is up")
    pg.wait_for_timeout(1200)
    shot(pg, "tn-songs-play")
    pg.get_by_role("button", name="揭晓歌名").click()
    pg.wait_for_selector(".song-title")
    link = pg.locator(".song-link").get_attribute("href") or ""
    ok(re.match(r"^https://music\.apple\.com/[a-z]{2}/song/\d+$", link) is not None, f"the reveal links to Apple Music ({link})")
    pg.wait_for_timeout(700)
    shot(pg, "tn-songs-reveal")
    first = pg.locator(".song-title strong").inner_text()
    pg.locator(".picker .chip").first.click()
    ok(until(lambda: pg.locator(".tn-round").inner_text().startswith("第 2 首"), 3000), "a point and on to song two")
    pg.get_by_role("button", name="揭晓歌名").click()
    pg.wait_for_selector(".song-title")
    ok(pg.locator(".song-title strong").inner_text() != first, "song two is a different song")
    heard = pg.evaluate("() => JSON.parse(localStorage.getItem('lazysusan.tune.heard') || '[]').length")
    ok(heard >= 1, f"the phone remembers what it played ({heard})")
    # melodies
    pg.goto(BASE + "#/", wait_until="networkidle")
    pg.goto(BASE + "#/g/tune", wait_until="networkidle")
    pg.wait_for_selector(".vinyl")
    pg.get_by_role("button", name="旋律").click()
    pg.get_by_role("button", name="5 首").click()
    shot(pg, "tn-setup")
    pg.get_by_role("button", name="开始").click()
    pg.wait_for_selector(".stages")
    pg.wait_for_timeout(900)
    shot(pg, "tn-play")
    pg.get_by_role("button", name="多放几个音").click()
    pg.get_by_role("button", name="揭晓歌名").click()
    pg.wait_for_selector(".tune-title")
    shot(pg, "tn-reveal")
    pg.locator(".picker .chip").first.click()
    ok(until(lambda: pg.locator(".tn-round").inner_text().startswith("第 2 首"), 3000), "a point and on to song two")
    # buzzer pads
    pg.goto(BASE + "#/", wait_until="networkidle")
    pg.goto(BASE + "#/g/tune", wait_until="networkidle")
    pg.wait_for_selector(".vinyl")
    pg.get_by_role("button", name="抢答器").click()
    pg.get_by_role("button", name="开始").click()
    pg.wait_for_selector(".pads .pad")
    pg.locator(".pad").nth(1).dispatch_event("pointerdown")
    pg.locator(".pad").nth(0).dispatch_event("pointerdown")
    ok(pg.locator(".pad.is-first").count() == 1 and "Mia" in pg.locator(".pad.is-first").inner_text(), "first pad down wins")
    shot(pg, "tn-pads")
    pg.get_by_role("button", name="对了").click()
    ok("1" in pg.locator(".pad").nth(1).inner_text(), "Mia scores")
    errors([pg])
    pg.context.close()


def tune_index(v):
    """The server sends the notes, not the answer: find the tune by its notes in the data file."""
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "tunes.ts"), encoding="utf-8").read()
    notes = re.findall(r'^\s*tune\("[^"]*", "[^"]*", \d+, "([^"]*)"', src, re.M)
    return notes.index(v["clip"]["notes"])


def t_tune_songs_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "tune")
    ok(until(lambda: view(host)["mode"] == "songs"), "real songs by default")
    host.get_by_role("button", name="英文", exact=True).click()
    ok(until(lambda: view(guests[0])["pool"] == "zh:any"), "the host drops English: Chinese songs only, and the table sees it")
    host.wait_for_timeout(300)
    shot(guests[0], "tn-songs-net-ready")
    host.get_by_role("button", name="放第一首").click()
    ok(all(until(lambda g=g: view(g)["phase"] == "listen" and (view(g)["audio"] or "").startswith("https://audio-ssl.itunes.apple.com/")) for g in everyone), "every phone has the same preview")
    ok(len({view(g)["audio"] for g in everyone}) == 1 and view(host)["song"] is None, "the same song for all, and not which one")
    host.wait_for_timeout(3000)
    shot(guests[0], "tn-songs-net-listen")
    guests[0].locator(".buzz").dispatch_event("pointerdown")
    ok(until(lambda: view(host)["phase"] == "answer"), "Mia buzzed in")
    host.wait_for_timeout(400)
    shot(guests[0], "tn-songs-net-answer")
    v = view(guests[0])
    right = song_id_of(v["audio"])
    ok(right is not None and any(c["id"] == right for c in v["choices"]), "the right title is among the four")
    idx = [c["id"] for c in v["choices"]].index(right)
    guests[0].locator(".tn-option").nth(idx).click()
    ok(until(lambda: view(host)["phase"] == "reveal" and view(host)["correct"] == me(guests[0])), "Mia names it")
    host.wait_for_timeout(900)
    shot(host, "tn-songs-net-reveal")
    ok(host.locator(".vinyl-art").count() == 1 and host.locator(".song-link").count() == 1, "cover on the record, Apple Music link")
    ok(until(lambda: view(host)["round"] == 2 and view(host)["phase"] == "listen", 12000), "song two comes up by itself")
    ok(view(host)["audio"] != v["audio"], "a different song")
    errors(everyone)
    for g in everyone:
        g.context.close()


def t_tune_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "tune")
    host.get_by_role("button", name="旋律").click()
    ok(until(lambda: view(guests[0])["mode"] == "melody"), "melody mode")
    shot(host, "tn-net-ready")
    host.get_by_role("button", name="放第一首").click()
    ok(all(until(lambda g=g: view(g)["phase"] == "listen") for g in everyone), "every phone listening")
    host.wait_for_timeout(2200)
    shot(guests[0], "tn-net-listen")
    guests[0].locator(".buzz").dispatch_event("pointerdown")
    ok(until(lambda: view(host)["phase"] == "answer" and view(host)["buzzer"] == me(guests[0])), "Mia buzzed in")
    host.wait_for_timeout(400)
    shot(guests[0], "tn-net-answer")
    v = view(guests[0])
    right = tune_index(v)
    wrong = next(o for o in v["options"] if o != right)
    idx = v["options"].index(wrong)
    guests[0].locator(".tn-option").nth(idx).click()
    ok(until(lambda: view(host)["phase"] == "listen" and me(guests[0]) in view(host)["locked"]), "wrong: Mia locked out, music back")
    clear_stamps(everyone)
    guests[1].locator(".buzz").dispatch_event("pointerdown")
    until(lambda: view(host)["phase"] == "answer")
    v = view(guests[1])
    guests[1].locator(".tn-option").nth(v["options"].index(tune_index(v))).click()
    ok(until(lambda: view(host)["phase"] == "reveal" and view(host)["correct"] == me(guests[1])), "Jay names it")
    host.wait_for_timeout(700)
    shot(host, "tn-net-reveal")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ euchre

def eu_act_dom(pg, v=None):
    """Make whatever move this phone owes, through the screen. Returns True if it acted."""
    if pg.locator(".eu-suit").count():
        pg.locator(".eu-suit").first.click()
        return True
    legal = pg.locator(".eu-hand button.ecard.is-legal")
    if legal.count():
        legal.first.click()
        return True
    order = pg.get_by_role("button", name=re.compile("就它做主|拿起来|Order it up|Pick it up"))
    pas = pg.get_by_role("button", name=re.compile("^(过|Pass)$"))
    if pas.count():
        # order it up now and then, so people make trump too
        if order.count() and time.time() % 3 < 1:
            order.first.click()
        else:
            pas.first.click()
        return True
    return False


def t_euchre_single(browser):
    pg = phone(browser, "solo")
    pg.goto(BASE + "#/g/euchre", wait_until="networkidle")
    pg.wait_for_selector(".eu-setup")
    pg.wait_for_timeout(700)
    shot(pg, "eu-setup")
    pg.get_by_role("button", name="先到 5 分").click()
    pg.get_by_role("button", name="发牌").click()
    ok(until(lambda: pg.locator(".eu-hand .ecard").count() == 5, 4000), "one phone: five cards dealt")
    shots = set()
    end = time.time() + 300
    hands = 0
    while time.time() < end:
        clear_stamps([pg], wait=False)
        if pg.locator(".eu-result").count():
            hands += 1
            if "result" not in shots:
                pg.wait_for_timeout(700)
                shot(pg, "eu-result")
                shots.add("result")
            btn = pg.locator(".game-actions .btn-primary")
            if "再来一局" in btn.inner_text():
                pg.wait_for_timeout(900)
                clear_stamps([pg])
                shot(pg, "eu-end")
                ok(True, f"one phone: played to five in {hands} hands")
                break
            btn.click()
            pg.wait_for_timeout(300)
            continue
        if pg.locator(".eu-suit").count() and "bid2" not in shots:
            shot(pg, "eu-bid2")
            shots.add("bid2")
        if pg.get_by_role("button", name=re.compile("^(过)$")).count() and not pg.locator(".eu-suit").count() and "bid1" not in shots:
            pg.wait_for_timeout(500)
            shot(pg, "eu-bid1")
            shots.add("bid1")
        if pg.locator(".eu-hand button.ecard.is-legal").count() and pg.locator(".eu-center .ecard").count() >= 2 and "play" not in shots:
            pg.wait_for_timeout(450)
            shot(pg, "eu-play")
            shots.add("play")
        if pg.locator(".ecard.is-win").count() and "trick" not in shots:
            shot(pg, "eu-trick")
            shots.add("trick")
        if not eu_act_dom(pg):
            pg.wait_for_timeout(150)
        else:
            pg.wait_for_timeout(120)
    else:
        ok(False, "one phone: game didn't finish in time")
    errors([pg])
    pg.context.close()


def t_euchre_online(browser):
    host, guests, _ = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "euchre")
    v = view(host)
    ok(v["phase"] == "setup" and sum(1 for s in v["seats"] if s["pid"]) == 3, "three people seated, one bot")
    host.wait_for_timeout(500)
    shot(host, "eu-net-setup")
    jay = guests[1]
    jv = view(jay)
    bot_seat = next(i for i, s in enumerate(jv["seats"]) if not s["pid"])
    jay.get_by_role("button", name="换到这里").click()
    ok(until(lambda: view(host)["seats"][bot_seat]["pid"] == me(jay)), "Jay moves to the empty seat")
    host.get_by_role("button", name="先到 5 分").click()
    ok(until(lambda: view(guests[0])["target"] == 5), "first to five")
    shot(guests[0], "eu-net-setup-guest")
    host.get_by_role("button", name="发牌").click()
    ok(all(until(lambda g=g: view(g)["phase"] in ("bid1", "bid2", "discard", "play")) for g in everyone), "dealt on every phone")
    hands_v = [view(g)["hand"] for g in everyone]
    ok(all(len(h) == 5 for h in hands_v) and len({c for h in hands_v for c in h}) == 15, "five private cards each")
    shots = set()
    end = time.time() + 300
    while time.time() < end:
        v = view(host)
        if v["phase"] == "end":
            break
        clear_stamps(everyone, wait=False)
        if v["phase"] == "hand":
            if "hand" not in shots:
                host.wait_for_timeout(600)
                shot(host, "eu-net-hand")
                shot(guests[0], "eu-net-hand")
                shots.add("hand")
            host.locator(".eu-result .btn-primary").click()
            until(lambda: view(host)["phase"] != "hand", 3000)
            continue
        if v["phase"] == "trick" and "trick" not in shots:
            shot(host, "eu-net-trick")
            shots.add("trick")
        acted = False
        for g in everyone:
            gv = view(g)
            if gv["mySeat"] is not None and gv["turn"] == gv["mySeat"] and gv["phase"] in ("bid1", "bid2", "discard", "play"):
                if gv["phase"] == "play" and len(gv["trick"]) >= 2 and "play" not in shots:
                    g.wait_for_timeout(450)
                    shot(g, "eu-net-play")
                    shots.add("play")
                if gv["phase"] == "bid1" and "bid1" not in shots:
                    g.wait_for_timeout(400)
                    shot(g, "eu-net-bid1")
                    shots.add("bid1")
                acted = eu_act_dom(g, gv)
                if acted:
                    until(lambda g=g, gv=gv: view(g)["turn"] != gv["turn"] or view(g)["phase"] != gv["phase"] or len(view(g)["trick"]) != len(gv["trick"]), 3000)
                break
        if not acted:
            time.sleep(0.2)
    v = view(host)
    ok(v["phase"] == "end" and max(v["score"]) >= 5, f"online: played to five ({v['score']})")
    host.wait_for_timeout(900)
    clear_stamps(everyone)
    shot(host, "eu-net-end")
    errors(everyone)
    for g in everyone:
        g.context.close()


# ------------------------------------------------------------------ 到此一游 (runs at /trip: start the game's server on 8799)


def t_trip_online(browser):
    host, guests, code = seat_table(browser, ["Steve", "Mia"])
    tv = browser.new_context(viewport={"width": 1366, "height": 768}).new_page()
    tv._errs, tv._name = [], "tv"
    tv.on("pageerror", lambda e: tv._errs.append(str(e)))
    tv.goto(BASE + f"tv/{code}", wait_until="networkidle")
    until(lambda: room(tv))
    everyone = [host] + guests
    start_game(host, everyone, "trip")
    ok(host.get_by_role("button", name="开一局").count() == 1, "the host can open the game")
    ok(guests[0].get_by_text("等主人开局").count() == 1, "the others wait for the host")
    host.get_by_role("button", name="开一局").click()
    trip = re.compile(r"/trip/r/(\d{4})\?table=" + code)
    for g in everyone:
        g.wait_for_url(trip, timeout=8000)
    tv.wait_for_url(re.compile(r"/trip/tv/\d{4}\?table=" + code), timeout=8000)
    num = trip.search(host.url).group(1)
    ok(all(num in g.url for g in everyone) and num in tv.url, f"every phone and the big screen went to room {num}")
    for g in everyone:
        g.wait_for_selector(".lobby .roomcode", timeout=8000)
    ok(all(g.locator(".roomcode .tablecode").inner_text() == code for g in everyone), "the game's lobby shows the table's code")
    ok(host.locator(".lobby section.host").count() == 1, "the table's host is the game's host")
    ok(guests[0].locator(".lobby section.host").count() == 0, "the guest isn't")
    ok(until(lambda: guests[0].locator(".teams").count() == 1) and "Mia" in guests[0].inner_text(".lobby"), "names came along")
    tv.wait_for_selector(".lobby-tv .tablecode", timeout=8000)
    ok(tv.locator(".lobby-tv .tablecode").inner_text() == code, "the big screen says to join the table")
    shot(host, "trip-lobby")
    # a guest goes back to the table: the game is still on there
    guests[0].get_by_role("button", name=re.compile("回到这桌")).click()
    guests[0].wait_for_url(re.compile(r"/t/" + code), timeout=8000)
    ok(until(lambda: guests[0].get_by_role("button", name="回到这局").count() == 1), "back at the table, the game is still on")
    # the host comes back from the game's last screen: the game ends at the table
    host.evaluate(f"() => sessionStorage.setItem('trip.over', '{num}')")
    host.get_by_role("button", name=re.compile("回到这桌")).click()
    host.wait_for_url(re.compile(r"/t/" + code), timeout=8000)
    ok(until(lambda: room(host) and room(host)["game"] is None), "the host's phone ended it: back in the table's lobby")
    ok(until(lambda: room(guests[0]) and room(guests[0])["game"] is None), "and so is everyone else")
    errors(everyone)
    for g in everyone + [tv]:
        g.context.close()


def t_trip_single(browser):
    # (with nobody on the phone, a game's link shows its card first, since #74)
    pg = phone(browser, "solo", players=PLAYERS[:1])
    pg.goto(BASE + "#/g/trip", wait_until="networkidle")
    pg.wait_for_url(re.compile(r"/trip/demo"), timeout=8000)
    ok(pg.locator(".lobby .demohead").count() == 1 or until(lambda: pg.locator(".lobby .demohead").count() == 1), "one phone: the game's one-phone page")
    errors([pg])
    pg.context.close()


# ------------------------------------------------------------------ 戏精大赏


def t_drama_single(browser):
    pg = phone(browser, "solo", players=PLAYERS + [{"id": "p4", "name": "Lu"}])
    pg.goto(BASE + "#/g/drama", wait_until="networkidle")
    pg.wait_for_selector(".dm-marquee")
    pg.get_by_role("button", name="整蛊", exact=True).click()
    pg.get_by_role("button", name="3", exact=True).click()
    shot(pg, "dm-setup")
    pg.get_by_role("button", name="开演").click()
    pg.wait_for_selector(".dm-roster")
    actors = pg.locator(".dm-roster li").count()
    ok(actors >= 2 and actors <= 3, f"a scene with {actors} actors for five players")
    shot(pg, "dm-brief")
    pg.get_by_role("button", name="发身份牌").click()
    culprits = 0
    for _ in range(actors):
        pg.locator(".game-actions .btn-primary").click()
        pg.locator(".dm-card-back").click()
        pg.wait_for_timeout(800)
        culprits += pg.locator(".dm-card-secret.is-culprit").count()
        pg.locator(".game-actions .btn-primary").click()
        pg.wait_for_timeout(300)
    ok(culprits == 1, "one actor's card says they're the culprit")
    ok(until(lambda: pg.locator(".dm-clock").count() == 1, 3000), "the curtain opens and the clock runs")
    pg.wait_for_timeout(1600)
    shot(pg, "dm-act")
    pg.get_by_role("button", name="演完了，开始投票").click()
    pg.get_by_role("button", name="传手机投票").click()
    voters = 5 - actors
    for k in range(voters):
        pg.locator(".game-actions .btn-primary").click()
        pg.locator(".dm-suspect").nth(k % actors).click()
        rows = pg.locator(".dm-rates li")
        for r in range(rows.count()):
            rows.nth(r).locator(".dm-star").nth((r + k) % 5).click()
        if k == 0:
            shot(pg, "dm-ballot")
        pg.get_by_role("button", name="交卷").click()
        pg.wait_for_timeout(250)
    ok(until(lambda: pg.locator(".dm-reveal").count() == 1, 3000), "every ballot in: the reveal")
    ok(until(lambda: pg.locator(".dm-truths li").count() == actors, 6000), "every card is turned over")
    pg.wait_for_timeout(1500)
    shot(pg, "dm-reveal")
    ok(until(lambda: pg.locator(".stamp-layer").count() == 1, 9000), "then the forfeit lands")
    shot(pg, "dm-penalty")
    pg.locator(".stamp-layer button").first.click()
    pg.get_by_role("button", name="下一幕").click()
    ok(until(lambda: pg.locator(".dm-roster").count() == 1, 3000), "act two")
    errors([pg])
    pg.context.close()


def write_scene(pg, title, by=None):
    """Fill in 戏精大赏's scene form and add it to the table."""
    pg.locator(".dm-written .btn").click()
    pg.wait_for_selector("#dw-title")
    pg.locator("#dw-title").fill(title)
    pg.locator("#dw-setup").fill("中秋家宴上，最贵的那盒月饼只剩一个空盒子。")
    roles = pg.locator(".dw-role")
    for i, n in enumerate(["外婆", "表弟", "新女婿"]):
        roles.nth(i).locator("input").nth(0).fill(n)
    pg.locator("#dw-culprit").fill("偷月饼的人")
    pg.locator("#dw-card").fill("月饼是你偷吃的，盒子是你放回去的。要比谁都生气。")
    if by:
        pg.locator(".dm-writer .chip", has_text=by).click()
    pg.get_by_role("button", name="加到这一桌").click()
    ok(until(lambda: pg.locator(".dw-note").count() == 1, 3000), "the scene is added to the table")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(700)


def t_drama_written(browser):
    """Scenes players write: on one phone (Jay wrote it), then at an online table (a guest's)."""
    pg = phone(browser, "writer", players=PLAYERS)
    pg.goto(BASE + "#/g/drama", wait_until="networkidle")
    pg.wait_for_selector(".dm-marquee")
    write_scene(pg, "空月饼盒", by="Jay")
    ok(pg.locator(".dm-written li", has_text="空月饼盒").count() == 1, "one phone: the scene waits on the setup screen")
    pg.get_by_role("button", name="开演").click()
    pg.wait_for_selector(".dm-roster")
    ok(pg.locator(".dm-title", has_text="空月饼盒").count() == 1 and pg.locator(".dm-credit", has_text="Jay").count() == 1, "one phone: it's played first, credited to Jay")
    ok(pg.locator(".dm-roster li", has_text="Jay").count() == 1, "one phone: Jay is on stage in it")
    errors([pg])
    pg.context.close()

    host, guests, code = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_game(host, everyone, "drama")
    write_scene(guests[1], "空月饼盒")
    ok(all(until(lambda g=g: g.locator(".dm-written li", has_text="空月饼盒").count() == 1, 5000) for g in everyone), "online: everyone sees the scene a guest wrote")
    ok("偷吃" not in json.dumps(view(host), ensure_ascii=False), "online: its cards stay secret until it's played")
    host.get_by_role("button", name="开演").click()
    ok(until(lambda: (view(host) or {}).get("phase") == "brief", 5000), "online: curtain up")
    v = view(host)
    ok(v["scene"]["title"]["zh"] == "空月饼盒" and any(c["pid"] == me(guests[1]) for c in v["cast"]), "online: the guest's scene is first, with them on stage")
    errors(everyone)
    for g in everyone:
        g.context.close()


def t_drama_duel(browser):
    """演技 PK: the cast list and each card explain the style, the card carries the line and a link to videos."""
    for lang, site, word, labels in (("zh", "https://search.bilibili.com/all?keyword=", "下雨", ("演技 PK", "开演", "发身份牌")), ("en", "https://www.youtube.com/results?search_query=", "rain", ("Acting duel", "Curtain up", "Deal the cards"))):
        pg = phone(browser, f"duel-{lang}", lang=lang, players=PLAYERS)
        pg.goto(BASE + "#/g/drama", wait_until="networkidle")
        pg.wait_for_selector(".dm-marquee")
        pg.get_by_role("button", name=labels[0], exact=True).click()
        pg.get_by_role("button", name=labels[1]).click()
        pg.wait_for_selector(".dm-roster")
        ok(pg.locator(".dm-roster li").count() == 2 and pg.locator(".dm-roster-main > span").count() == 2, f"[{lang}] a duel: two actors, and the cast list says what each style looks like")
        line = pg.locator(".dm-title").first.inner_text().split("\n")[0].strip("「」\"“” ")
        pg.get_by_role("button", name=labels[2]).click()
        for i in range(2):
            pg.locator(".game-actions .btn-primary").click()
            ok(pg.locator(".dm-card-see").count() == 0, f"[{lang}] card {i + 1}: face down, nothing gives the style away")
            pg.locator(".dm-card-back").click()
            pg.wait_for_timeout(800)
            ok(len(pg.locator(".dm-card-brief").inner_text()) > 12 and word in pg.locator(".dm-card-demo").inner_text(), f"[{lang}] card {i + 1}: what to do, and the everyday sentence said that way")
            ok(line in pg.locator(".dm-card-line").inner_text(), f"[{lang}] card {i + 1}: the line to say is on the card")
            see = pg.locator(".dm-card-see")
            ok(see.count() == 1 and (see.get_attribute("href") or "").startswith(site) and see.get_attribute("target") == "_blank", f"[{lang}] card {i + 1}: a link to videos of the style, opening in a new page")
            if i == 0:
                shot(pg, "dm-duel-card")
            pg.locator(".game-actions .btn-primary").click()
            pg.wait_for_timeout(300)
        ok(until(lambda: pg.locator(".dm-clock").count() == 1, 3000), f"[{lang}] both have read their cards: the duel is on")
        errors([pg])
        pg.context.close()


def t_drama_online(browser):
    host, guests, code = seat_table(browser, ["Steve", "Mia", "Jay", "Kev", "Lu"])
    everyone = [host] + guests
    tv_ctx = browser.new_context(viewport={"width": 1366, "height": 768})
    tv = tv_ctx.new_page()
    tv._errs = []
    tv._name = "tv"
    tv.on("pageerror", lambda e: tv._errs.append(str(e)))
    tv.goto(BASE + f"#/tv/{code}", wait_until="networkidle")
    start_game(host, everyone, "drama")
    host.get_by_role("button", name="困难", exact=True).click()
    ok(until(lambda: view(guests[0])["diff"] == "hard"), "the host sets it up; the table sees it")
    host.get_by_role("button", name="开演").click()
    ok(until(lambda: view(host)["phase"] == "brief"), "a scene is dealt")
    v = view(host)
    cast = [c["pid"] for c in v["cast"]]
    actors = [g for g in everyone if me(g) in cast]
    audience = [g for g in everyone if me(g) not in cast]
    ok(len(actors) == len(cast) and all(view(a)["me"] for a in actors) and not any(view(a)["me"] for a in audience), "each actor has a card, nobody else")
    shot(actors[0], "dmn-card")
    shot(audience[0], "dmn-brief")
    for a in actors:
        a.locator(".dm-card-back").click()
        a.wait_for_timeout(700)
        a.locator(".dm-cardwrap .btn-primary").click()
    ok(until(lambda: view(host)["phase"] == "act"), "everyone's read their card: action")
    tv.wait_for_timeout(1800)
    tv.screenshot(path=os.path.join(OUT, "dmn-act-tv.png"))
    shot(audience[0], "dmn-act")
    actors[0].get_by_role("button", name="演完了，开始投票").click()
    ok(until(lambda: view(host)["phase"] == "vote"), "an actor calls the wrap: the vote")
    for k, g in enumerate(audience):
        g.locator(".dm-suspect").nth(k % len(cast)).click()
        rows = g.locator(".dm-rates li")
        for r in range(rows.count()):
            rows.nth(r).locator(".dm-star").nth((r + k + 1) % 5).click()
        if k == 0:
            shot(g, "dmn-ballot")
        g.get_by_role("button", name="交卷").click()
    ok(until(lambda: view(host)["phase"] == "reveal"), "the audience has voted: the reveal")
    host.wait_for_timeout(4500)
    shot(host, "dmn-reveal")
    tv.screenshot(path=os.path.join(OUT, "dmn-reveal-tv.png"))
    r = view(host)["result"]
    ok(r and set(r["cards"].keys()) == set(cast) and r["culprit"] in cast, "the truth: every card, and the culprit")
    clear_stamps(everyone)
    errors(everyone + [tv])
    for g in everyone:
        g.context.close()
    tv_ctx.close()


TESTS = {
    "trip": [t_trip_single, t_trip_online],
    "superlatives": [t_superlatives_single, t_superlatives_online],
    "drama": [t_drama_single, t_drama_duel, t_drama_online, t_drama_written],
    "punchline": [t_punchline_single, t_punchline_online],
    "postit": [t_postit_single, t_postit_online],
    "freeze": [t_freeze_single, t_freeze_online],
    "limbo": [t_limbo_single, t_limbo_online, t_limbo_blind_single, t_limbo_blind_online],
    "limbo-variants": [t_limbo_steady_single, t_limbo_moving_single, t_limbo_moving_nosensor_single, t_limbo_tilt_single, t_limbo_party_single, t_limbo_steady_online, t_limbo_moving_online, t_limbo_tilt_online, t_limbo_party_online],
    "tune": [t_tune_single, t_tune_songs_online, t_tune_online],
    "euchre": [t_euchre_single, t_euchre_online],
}

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, fns in TESTS.items():
            if ONLY and name not in ONLY:
                continue
            print(f"--- {name}", flush=True)
            for fn in fns:
                try:
                    fn(browser)
                except Exception as e:
                    ok(False, f"{fn.__name__} crashed: {e}")
        browser.close()

    print("\nparty test:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
    sys.exit(1 if fails else 0)
