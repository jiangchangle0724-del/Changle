"""真心话大冒险 (truth or dare), one phone and online, against the local dev servers.

Run with the site and the rooms server running (README: wrangler dev on 8787, Vite on 5173):
    python3 scripts/truth_check.py [http://127.0.0.1:5173] [single] [online] [screens]
Checks: a tap is not a spin; the bottle stays where it pointed; it never picks the same person twice
running and evens out who it picks; 听天由命; one swap a game; the table's own cards (one phone: kept
on the phone; online: anonymous, never dealt to their writer); long names fit the ring; picking up
after a reload; the countdown in sight on a small phone and on its side.
Screenshots go to $SHOTS (default /tmp/truth-shots). Exits 1 on any failed check or page error.
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
import party_test as T  # noqa: E402  (seat_table, start_game, until, view, me)

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173").rstrip("/")
ONLY = [a for a in sys.argv[1:] if not a.startswith("http")] or ["single", "online", "screens"]
OUT = os.environ.get("SHOTS", "/tmp/truth-shots")
os.makedirs(OUT, exist_ok=True)
T.BASE = BASE + "/"
T.OUT = OUT
NAMES = ["小明", "Ann", "Ben", "欧阳娜娜子", "Bartholomew"]
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(NAMES)]
fails = []
TV = None


def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)


def phone(browser, lang="zh", w=390, h=844, players=PLAYERS, storage=None):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              locale="zh-CN" if lang == "zh" else "en-CA")
    settings = {"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": players}
    extra = "".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in (storage or {}).items())
    ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('lazysusan.settings.v1', %s); %s sessionStorage.setItem('seeded', '1'); }"
                        " sessionStorage.setItem('changle.entered', '1');" % (json.dumps(json.dumps(settings)), extra))
    pg = ctx.new_page()
    pg._errs = []
    pg._name = f"{lang}-{w}x{h}"
    pg.on("pageerror", lambda e: pg._errs.append(str(e)))
    pg.on("console", lambda m: pg._errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    return ctx, pg


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}.png"))


def open_single(pg):
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.evaluate("() => { history.pushState({ inSite: true }, '', '/g/truth-or-dare/play'); dispatchEvent(new Event('changle:navigate')); }")
    pg.wait_for_selector(".bottle-svg", timeout=8000)
    pg.wait_for_timeout(400)


def bottle_angle(pg):
    """Where the bottle points, in degrees clockwise from the top (seat 0 sits at the top)."""
    t = pg.evaluate("() => document.querySelector('.bottle-svg > g[transform^=\"rotate\"]')?.getAttribute('transform')")
    m = re.match(r"rotate\((-?[\d.e-]+)", t or "")
    return float(m.group(1)) % 360 if m else None


def seat_at(pg, n):
    a = bottle_angle(pg)
    return None if a is None else round(a / (360 / n)) % n


def clear_of_dock(pg, box):
    """In sight and not under the bottom buttons (on a phone on its side they sit in the right-hand column)."""
    if not box or box["y"] < 0:
        return False
    if pg.locator(".game-actions").count() == 0:
        return box["y"] + box["height"] <= pg.viewport_size["height"]
    dock = pg.locator(".game-actions").bounding_box()
    beside = box["x"] + box["width"] <= dock["x"] + 1 or box["x"] >= dock["x"] + dock["width"] - 1
    return beside and box["y"] + box["height"] <= pg.viewport_size["height"] or box["y"] + box["height"] <= dock["y"] + 4


def spin_until_choose(pg, timeout=9000):
    pg.locator(".game-actions .btn-primary").click()
    return T.until(lambda: pg.locator(".choose-box .turn-name").count() and pg.locator(".choose-box .turn-name").inner_text(), timeout)


def lift(pg):
    pg.locator(".cloche-dome").click()
    pg.wait_for_timeout(700)


def card_text(pg):
    return pg.locator(".prompt-text").inner_text().strip()


def whisper_single(pg, who):
    """悄悄话 on one phone: read alone, cover, the name, the coin; tails, the one named pays to see."""
    pg.get_by_role("button", name="悄悄话").click()
    pg.wait_for_selector(".card-flow")
    ok(pg.locator(".kind-tag.secret").count() == 1 and f"把手机给 {who}" in pg.locator(".whisper-hint").inner_text(), "悄悄话: hand the phone to whoever was picked")
    ok(pg.get_by_role("button", name=f"只给 {who} 看").count() == 1, "the lid says whose eyes only")
    lift(pg)
    question = card_text(pg)
    ok("谁" in question, f"a question about the table ({question})")
    shot(pg, "single-whisper-read")
    pg.get_by_role("button", name="盖上，说名字").click()
    pg.wait_for_timeout(700)
    ok(not pg.locator(".prompt-text").is_visible(), "covered again before anyone else looks")
    pg.locator(".cloche-dome").click()
    pg.wait_for_timeout(500)
    ok(not pg.locator(".prompt-text").is_visible(), "and a tap on the cover doesn't give it away")
    chips = pg.locator(".whisper-chips .btn")
    ok(chips.count() == pg.locator(".game-roster [role=listitem]").count(), f"every name to tap ({chips.count()})")
    named = chips.nth(2).inner_text().strip()
    chips.nth(2).click()
    ok("抛硬币" in pg.locator(".whisper-coin-says").inner_text(), "the coin is in the air")
    pg.wait_for_timeout(2000)
    says = pg.locator(".whisper-coin-says").inner_text()
    ok("正面" in says or "反面" in says, f"the coin lands: {says}")
    shot(pg, "single-whisper-coin")
    if "反面" in says:
        ok(not pg.locator(".prompt-text").is_visible(), "tails: the question stays covered")
        pg.get_by_role("button", name=f"{named} 认罚看题").click()
        T.clear_stamps([pg])
        pg.wait_for_timeout(900)
    ok(pg.locator(".prompt-text").is_visible() and card_text(pg) == question, "then everyone sees the question")


def single(browser):
    ctx, pg = phone(browser)
    open_single(pg)
    n = len(NAMES)

    # a tap on the bottle is not a spin
    box = pg.locator(".bottle-svg").bounding_box()
    pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.wait_for_timeout(900)
    ok(pg.locator(".choose-box").count() == 0, "a tap on the bottle doesn't pick anyone")
    ok("再用力一点" in pg.locator(".bottle-actions .hint").inner_text(), "and says to spin it harder")
    # nor is a short drag that only nudges it
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pg.mouse.move(cx + 60, cy)
    pg.mouse.down()
    for i in range(6):
        pg.mouse.move(cx + 60, cy + 4 * (i + 1))
        pg.wait_for_timeout(30)
    pg.wait_for_timeout(200)
    pg.mouse.up()
    pg.wait_for_timeout(1200)
    ok(pg.locator(".choose-box").count() == 0, "a slow nudge doesn't pick anyone either")

    # long names fit the ring: a smaller size first, then … (never wider than the seat)
    labels = pg.evaluate("""() => [...document.querySelectorAll('.bottle-svg text')].map((t) => ({ text: t.textContent, w: t.getComputedTextLength(), size: +t.getAttribute('font-size') }))""")
    ok(all(l["w"] <= 44 for l in labels), f"every name inside its seat: {[(l['text'], round(l['w'], 1), l['size']) for l in labels]}")
    ok(any(l["text"] == "欧阳娜娜子" for l in labels) or any(l["text"].startswith("欧阳娜娜") for l in labels), "a five-character name keeps at least four")
    shot(pg, "single-spin")

    picks = []
    for rnd in range(14):
        who = spin_until_choose(pg)
        ok(bool(who), f"round {rnd + 1}: the bottle picked {who}")
        if not who:
            break
        i = seat_at(pg, n)
        ok(i is not None and NAMES[i] == who, f"round {rnd + 1}: the bottle points at {who} ({NAMES[i] if i is not None else i})")
        picks.append(who)
        if rnd == 0:
            shot(pg, "single-choose")
            pg.get_by_role("button", name="听天由命").click()
            pg.wait_for_selector(".card-flow")
            ok(pg.locator(".turn-line .ui-pill", has_text="听天由命").count() == 1, "听天由命: the card says it was left to chance")
            lift(pg)
            first = card_text(pg)
            swap = pg.get_by_role("button", name=re.compile("换一张"))
            ok(swap.count() == 1, "a swap on offer")
            shot(pg, "single-card")
            swap.click()
            pg.wait_for_timeout(900)
            ok(pg.locator(".cloche-dome").count() == 1, "the new card comes under a closed lid")
            lift(pg)
            ok(card_text(pg) != first, f"swapped: {first} → {card_text(pg)}")
            ok(pg.get_by_role("button", name=re.compile("换一张")).count() == 0, "no second swap for them this game")
        elif rnd == 1:
            whisper_single(pg, who)
        else:
            pg.locator(".game-actions .btn-porcelain").click()
            pg.wait_for_selector(".card-flow")
            lift(pg)
        done = "下一轮" if pg.locator(".kind-tag.secret").count() else "答完了" if pg.locator(".kind-tag.truth").count() else "做完了"
        pg.get_by_role("button", name=done).click()
        pg.wait_for_selector(".bottle-svg")
        pg.wait_for_timeout(500)
        after = seat_at(pg, n)
        ok(after is not None and NAMES[after] == who, f"round {rnd + 1}: back at the bottle, it still points at {who}")
    ok(all(a != b for a, b in zip(picks, picks[1:])), f"never the same person twice running: {picks}")
    counts = [picks.count(x) for x in NAMES]
    ok(max(counts) - min(counts) <= 2, f"nobody far ahead: {dict(zip(NAMES, counts))}")

    # the table's own cards: written on the phone, dealt first, kept for next time
    pg.get_by_role("button", name="自己出题").click()
    pg.wait_for_selector(".own-form")
    pg.get_by_role("radio", name="大冒险").or_(pg.get_by_role("tab", name="大冒险")).or_(pg.get_by_role("button", name="大冒险")).first.click()
    pg.locator(".own-form input").fill("学猫叫三声，叫得最像的人喝一口")
    pg.locator(".own-form button[type=submit]").click()
    pg.wait_for_timeout(300)
    ok(pg.locator(".own-row").count() == 1, "the card is on the list")
    shot(pg, "single-own-sheet")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(500)
    ok("1" in pg.get_by_role("button", name=re.compile("自己出题")).inner_text(), "the button counts the table's cards")
    spin_until_choose(pg)
    pg.locator(".game-actions .btn-gold").click()
    pg.wait_for_selector(".card-flow")
    lift(pg)
    ok(card_text(pg).startswith("学猫叫三声") and pg.locator(".turn-line .ui-pill", has_text="你们出的").count() == 1, f"the table's own card comes first ({card_text(pg)})")
    shot(pg, "single-own-card")

    # 每人底线 from the menu: switch some on for a player, and the phone remembers them
    pg.locator(".ui-game-menu-trigger").click()
    pg.get_by_role("button", name="每人底线").click()
    pg.wait_for_selector(".limits-form")
    rows = pg.locator(".limits-row")
    ok(rows.count() == len(NAMES), f"a row of limits for each player ({rows.count()})")
    rows.nth(1).get_by_role("button", name="不碰身体").click()
    rows.nth(1).get_by_role("button", name="只要温和").click()
    ok(rows.nth(1).get_by_role("button", name="不碰身体").get_attribute("aria-pressed") == "true", "a limit switches on")
    shot(pg, "single-limits")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    kept_limits = json.loads(pg.evaluate("() => localStorage.getItem('changle.truth.limits.v1')") or "{}")
    ok(sorted(kept_limits.get("p1", [])) == ["mild", "touch"], f"the phone keeps them ({kept_limits})")
    # 这局小结 in the tally that ‹ opens
    pg.locator(".ui-game-header button").first.click()
    pg.wait_for_selector(".truth-recap")
    recap = pg.locator(".truth-recap").inner_text()
    ok("被瓶子指到最多" in recap and "真心话答得最多" in recap, f"the tally has the game's titles: {recap[:80]}")
    shot(pg, "single-recap")
    pg.get_by_role("button", name="继续这局").click()
    pg.wait_for_timeout(500)

    # a reload picks the game up where it was, the swap and the bottle's memory with it
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(600)
    cont = pg.get_by_role("button", name=re.compile("继续"))
    if cont.count():
        cont.first.click()
        pg.wait_for_timeout(600)
    ok(pg.locator(".card-flow").count() == 1, "after a reload, the card is still on the table")
    kept = pg.evaluate("() => Object.entries(localStorage).filter(([k]) => k.includes('truth')).map(([k, v]) => k + '=' + v.slice(0, 80))")
    ok(any("changle.truth.own.v1" in k for k in kept), "the table's own cards are kept on the phone")
    ok(any("changle.truth.seen.v1" in k for k in kept), "and which cards this phone has dealt")
    ok(not pg._errs, f"no page errors {pg._errs[:3]}")
    ctx.close()


def screens(browser):
    """A timed dare on a small phone and on its side: the countdown is in sight above the buttons."""
    for lang, w, h in (("zh", 320, 568), ("en", 320, 568), ("zh", 844, 390), ("en", 390, 844)):
        ctx, pg = phone(browser, lang, w, h, PLAYERS[:4])
        pg.goto(BASE + "/", wait_until="networkidle")
        pg.evaluate("""async () => {
          const m = await import('/src/data/truthDare.ts');
          const keep = m.DARES.filter((c) => /秒|分钟/.test(c.zh) && c.heat === 1);
          m.DARES.splice(0, m.DARES.length, ...keep);
        }""")
        pg.evaluate("() => { history.pushState({ inSite: true }, '', '/g/truth-or-dare/play'); dispatchEvent(new Event('changle:navigate')); }")
        pg.wait_for_selector(".bottle-svg", timeout=8000)
        pg.wait_for_timeout(300)
        shot(pg, f"screen-{lang}-{w}x{h}-spin")
        ok(clear_of_dock(pg, pg.locator(".own-open").bounding_box()), f"{lang} {w}x{h}: 自己出题 in sight")
        top = pg.locator(".truth-top").bounding_box()
        ok(top["height"] < 60, f"{lang} {w}x{h}: the heat and 自己出题 share one line ({round(top['height'])}px)")
        spin_until_choose(pg)
        pg.wait_for_timeout(900)
        ok(clear_of_dock(pg, pg.locator(".choose-box").bounding_box()), f"{lang} {w}x{h}: the name and 听天由命 in sight, clear of the buttons")
        shot(pg, f"screen-{lang}-{w}x{h}-choose")
        pg.locator(".game-actions .btn-gold").click()
        pg.wait_for_selector(".card-flow")
        lift(pg)
        pg.wait_for_timeout(900)
        timer = pg.locator(".dare-timer")
        ok(timer.count() == 1, f"{lang} {w}x{h}: a timed dare has a countdown")
        if timer.count():
            ok(clear_of_dock(pg, timer.bounding_box()), f"{lang} {w}x{h}: the countdown in sight, clear of the buttons")
        shot(pg, f"screen-{lang}-{w}x{h}-card")
        ok(not pg._errs, f"{lang} {w}x{h}: no page errors {pg._errs[:3]}")
        ctx.close()


def whisper_online(everyone, pg, chosen):
    """悄悄话 online: only the one picked reads it; a name; the coin lands on every phone together."""
    pg.get_by_role("button", name="悄悄话").click()
    ok(T.until(lambda: (T.view(pg) or {}).get("kind") == "secret"), "悄悄话: a whisper")
    others = [g for g in everyone if g is not pg]
    question = T.view(pg)["prompt"]["zh"]
    ok(all((T.view(g) or {}).get("prompt") is None for g in others), "only the one picked gets its words")
    ok(all(question not in g.content() for g in others), "and no other phone shows them")
    ok(T.until(lambda: "只有 TA 看得到" in others[0].locator(".card-flow").inner_text()), "the others wait for a name")
    ok(T.until(lambda: "悄悄话" in TV.locator(".tvtd-tag").inner_text(), 4000), "the big screen says it's a whisper")
    ok(question not in TV.content(), "and shows nothing of it")
    TV.wait_for_timeout(800)
    TV.screenshot(path=os.path.join(OUT, "online-whisper-tv.png"))
    lift(pg)
    target = others[1]
    target_id = T.me(target)
    target_name = T.room(pg)["seats"][[x["id"] for x in T.room(pg)["seats"]].index(target_id)]["name"]
    pg.locator(".whisper-chips .btn", has_text=target_name).click()
    ok(T.until(lambda: all((T.view(g) or {}).get("named") == target_id for g in everyone)), f"{target_name} named on every phone")
    T.shot(others[0], "online-whisper-coin")
    ok(T.until(lambda: all(("正面" in g.locator(".whisper-coin-says").inner_text() or "反面" in g.locator(".whisper-coin-says").inner_text()) for g in everyone), 5000), "the coin lands on every phone")
    coin = T.view(pg)["coin"]
    if coin == "hidden":
        ok(all((T.view(g) or {}).get("prompt") is None for g in others), "tails: still nobody else has the words")
        ok(T.until(lambda: target.get_by_role("button", name="认罚看题").count() == 1, 3000), "the one named can pay to see it")
        ok(all(g.get_by_role("button", name="认罚看题").count() == 0 for g in everyone if g is not target), "nobody else can")
        target.get_by_role("button", name="认罚看题").click()
        T.clear_stamps(everyone)
    ok(T.until(lambda: all(g.locator(".prompt-text", has_text=question).count() == 1 for g in everyone), 6000), f"{coin}: then every phone shows the question")
    T.shot(others[0], "online-whisper-open")
    pg.get_by_role("button", name="下一轮").click()
    ok(T.until(lambda: (T.view(pg) or {}).get("phase") == "spin"), "back to the bottle")
    pg.wait_for_timeout(400)


def online(browser):
    host, guests, code = T.seat_table(browser, ["Steve", "Mia", "Jay", "Kev"])
    everyone = [host] + guests
    # the big screen watches the same table
    global TV
    TV = browser.new_context(viewport={"width": 1366, "height": 768}).new_page()
    TV._errs = []
    TV._name = "tv"
    TV.on("pageerror", lambda e: TV._errs.append(str(e)))
    TV.goto(BASE + f"/#/tv/{code}", wait_until="networkidle")
    T.start_game(host, everyone, "truth")
    by = {T.me(g): g for g in everyone}
    v = T.view(host)
    ok(v and v.get("slips") == {"truth": 0, "dare": 0, "mine": 0}, f"the rooms server sends the new fields ({v and v.get('slips')})")
    ok(all(g.locator(".heat-tab").count() == 0 and g.locator(".segmented-row .ui-pill").count() == 1 for g in guests), "only the host gets heat buttons; the others see the heat")
    T.shot(guests[1], "online-guest")

    # every phone can drop in a card; nobody sees whose
    mia = guests[0]
    mia.get_by_role("button", name=re.compile("自己出题")).click()
    mia.wait_for_selector(".own-form")
    mia.get_by_role("tab", name="大冒险").or_(mia.get_by_role("radio", name="大冒险")).or_(mia.get_by_role("button", name="大冒险")).first.click()
    mia.locator(".own-form input").fill("用 Steve 的语气夸自己十秒")
    mia.locator(".own-form button[type=submit]").click()
    ok(T.until(lambda: (T.view(host) or {}).get("slips", {}).get("dare") == 1), "the pile has one dare")
    ok("Steve 的语气" not in json.dumps(T.view(host), ensure_ascii=False), "and its words reach nobody yet")
    ok(T.until(lambda: "1 张是你出的" in mia.locator(".own-count").inner_text()), "Mia's phone says one of them is hers")
    T.shot(mia, "online-own")
    mia.keyboard.press("Escape")
    mia.wait_for_timeout(400)

    picks = []
    mia_id = T.me(mia)
    for rnd in range(10):
        v = T.view(host)
        spinner = by[v["spinner"]]
        spinner.locator(".bottle-actions .btn-primary").click()
        ok(T.until(lambda: (T.view(host) or {}).get("phase") == "choose"), f"round {rnd + 1}: spun")
        v = T.view(host)
        chosen = v["chosen"]
        picks.append(chosen)
        ok(chosen != v["spinner"], f"round {rnd + 1}: not back to whoever spun it")
        pg = by[chosen]
        T.until(lambda: pg.locator(".choose-box .btn-gold").count() > 0, 9000)
        pg.wait_for_timeout(300)
        # angles agree on every phone
        angles = [T.until(lambda g=g: bottle_angle(g) is not None and round(bottle_angle(g)) % 360 or None, 3000) or round(bottle_angle(g) or 0) % 360 for g in everyone]
        ok(len(set(angles)) == 1, f"round {rnd + 1}: every phone's bottle points the same way {angles}")
        if rnd == 0:
            pg.get_by_role("button", name="听天由命").click()
        elif rnd == 2:
            whisper_online(everyone, pg, chosen)
            continue
        else:
            pg.locator(".choose-box .btn-gold").click()
        ok(T.until(lambda: (T.view(host) or {}).get("phase") == "card"), f"round {rnd + 1}: a card")
        v = T.view(pg)
        if rnd == 0:
            ok(v.get("rand") is True, "听天由命 reaches every phone")
        if v.get("own"):
            ok(chosen != mia_id and v["prompt"]["zh"].startswith("用 Steve 的语气"), f"the table's card goes to someone who didn't write it ({chosen})")
        lift(pg)
        if rnd == 1 and v.get("swapLeft"):
            before = v["prompt"]["zh"]
            pg.get_by_role("button", name=re.compile("换一张")).click()
            ok(T.until(lambda: (T.view(pg) or {}).get("prompt", {}).get("zh") != before), "a swap deals another card")
            ok(T.until(lambda: pg.locator(".cloche-dome").count() == 1), "under a closed lid")
            lift(pg)
            ok(pg.get_by_role("button", name=re.compile("换一张")).count() == 0, "and no second swap")
        others = [g for g in everyone if g is not pg]
        word = "听" if v["kind"] == "truth" else "看"
        lift(others[0])
        ok(T.until(lambda: word in others[0].locator(".card-flow").inner_text()), f"round {rnd + 1}: the others read {word} …")
        pg.get_by_role("button", name=re.compile("答完了|做完了")).click()
        ok(T.until(lambda: (T.view(host) or {}).get("phase") == "spin"), f"round {rnd + 1}: back to the bottle")
        ok(all(T.until(lambda g=g: bottle_angle(g) is not None, 4000) for g in everyone), f"round {rnd + 1}: the bottle is back on every phone")
        host.wait_for_timeout(300)
        rest = {g._name: seat_at(g, 4) for g in everyone}
        at = [s["id"] for s in T.room(host)["seats"] if not s.get("watch")].index(chosen)
        ok(set(rest.values()) == {at}, f"round {rnd + 1}: the bottle stays where it pointed on every phone {rest} (seat {at})")
    ok(all(a != b for a, b in zip(picks, picks[1:])), f"never the same person twice running: {picks}")
    counts = [picks.count(T.me(g)) for g in everyone]
    ok(max(counts) - min(counts) <= 2, f"nobody far ahead: {counts}")
    T.shot(host, "online-end")

    # my limits: on my own phone, kept for next time, seen by nobody else
    mia.get_by_role("button", name=re.compile("我的底线")).click()
    mia.wait_for_selector(".limits-form")
    mia.locator(".limits-row").get_by_role("button", name="不动手机").click()
    ok(T.until(lambda: (T.view(mia) or {}).get("limits") == ["phone"]), "Mia's limit reaches the table")
    ok(all((T.view(g) or {}).get("limits") == [] for g in everyone if g is not mia), "and nobody else sees it")
    T.shot(mia, "online-limits")
    mia.keyboard.press("Escape")
    mia.wait_for_timeout(400)
    # the recap, for everyone
    host.get_by_role("button", name="这局小结").click()
    host.wait_for_selector(".truth-recap")
    recap = host.locator(".truth-recap").inner_text()
    ok("被瓶子指到最多" in recap and "悄悄话里被点名最多" in recap, f"the recap: {recap[:90]}")
    T.shot(host, "online-recap")
    host.keyboard.press("Escape")
    errs = [(g._name, e) for g in everyone + [TV] for e in g._errs if "favicon" not in e and "WebSocket" not in e]
    ok(not errs, f"no page errors {errs[:3]}")


def whisper_small(browser):
    """A whisper on a small phone and on its side: the names to tap and the coin stay in sight."""
    for lang, w, h in (("zh", 320, 568), ("en", 844, 390)):
        ctx, pg = phone(browser, lang, w, h, PLAYERS[:4])
        open_single(pg)
        spin_until_choose(pg)
        pg.wait_for_timeout(600)
        pg.get_by_role("button", name=re.compile("悄悄话|Whisper")).click()
        pg.wait_for_selector(".card-flow")
        lift(pg)
        pg.get_by_role("button", name=re.compile("盖上，说名字|Cover it, say a name")).click()
        pg.wait_for_timeout(900)
        ok(clear_of_dock(pg, pg.locator(".whisper-chips").bounding_box()), f"{lang} {w}x{h}: the names to tap, in sight")
        shot(pg, f"whisper-{lang}-{w}x{h}-names")
        pg.locator(".whisper-chips .btn").first.click()
        pg.wait_for_timeout(2300)
        ok(clear_of_dock(pg, pg.locator(".whisper-coin-wrap").bounding_box()), f"{lang} {w}x{h}: the coin, in sight")
        shot(pg, f"whisper-{lang}-{w}x{h}-coin")
        ok(not pg._errs, f"{lang} {w}x{h}: no page errors {pg._errs[:3]}")
        ctx.close()


def english(browser):
    """In English on a small phone: the third choice, the tags on the card, the sheet with two cards."""
    ctx, pg = phone(browser, "en", 320, 568)
    open_single(pg)
    spin_until_choose(pg)
    pg.wait_for_timeout(900)
    shot(pg, "en-320-choose")
    pg.get_by_role("button", name="Surprise me").click()
    pg.wait_for_selector(".card-flow")
    ok(pg.locator(".turn-line .ui-pill", has_text="Left to chance").count() == 1, "en: the card says it was left to chance")
    lift(pg)
    pg.wait_for_timeout(600)
    ok(pg.get_by_role("button", name="Swap it (once a game)").count() == 1, "en: a swap on offer")
    shot(pg, "en-320-card")
    pg.get_by_role("button", name=re.compile("Done it|Answered")).click()
    pg.wait_for_selector(".bottle-svg")
    pg.get_by_role("button", name=re.compile("Your cards")).click()
    pg.wait_for_selector(".own-form")
    for text in ("Who here would you call at 3 a.m.?", "Do your best impression of the host"):
        pg.locator(".own-form input").fill(text)
        pg.locator(".own-form button[type=submit]").click()
        pg.wait_for_timeout(200)
    ok(pg.locator(".own-row").count() == 2, "en: two cards of your own on the list")
    shot(pg, "en-320-own")
    ok(not pg._errs, f"en: no page errors {pg._errs[:3]}")
    ctx.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        if "single" in ONLY:
            single(browser)
        if "screens" in ONLY:
            screens(browser)
            whisper_small(browser)
            english(browser)
        if "online" in ONLY:
            online(browser)
        browser.close()

    print("\n" + (f"{len(fails)} FAILED:\n  " + "\n  ".join(fails) if fails else "all passed"))
    sys.exit(1 if fails else 0)
