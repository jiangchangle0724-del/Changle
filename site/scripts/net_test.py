"""Online tables: four phones (browser contexts) at one table against a local room server.

usage: python3 scripts/net_test.py [base_url] [game ...]
games: rogue truth undercover draw king prompts dice wheel lifecycle
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
ONLY = [a for a in sys.argv[1:] if not a.startswith("http")]
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/net")
os.makedirs(OUT, exist_ok=True)
ORDER = ["truth", "rogue", "trip", "superlatives", "king", "drama", "postit", "limbo", "prompts", "euchre", "dice", "freeze", "wheel", "undercover", "tune", "punchline", "draw"]
GAME_INDEX = {g: i for i, g in enumerate(ORDER)}

fails = []
def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)

def phone(browser, name, lang="zh"):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.add_init_script(
        "sessionStorage.setItem('lazysusan.entered','1');"
        "if(!localStorage.getItem('lazysusan.settings.v1')) localStorage.setItem('lazysusan.settings.v1', JSON.stringify({lang:'%s',sound:false,music:false,customPenalty:'',players:[]}));" % lang
    )
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

def by_pid(pages, pid):
    for g in pages:
        if me(g) == pid:
            return g
    return None

def stamps_up(pages):
    return any(g.locator(".stamp-layer").count() for g in pages)

def clear_stamps(pages, wait=True):
    """Penalized phones say they drank; watchers' stamps go by themselves (or get a tap)."""
    if wait:
        time.sleep(0.4)
    for _ in range(12):
        busy = False
        for g in pages:
            if g.locator(".stamp-layer").count() == 0:
                continue
            busy = True
            drank = g.locator(".stamp-layer button", has_text="我喝了")
            cont = g.locator(".stamp-layer button", has_text="继续")
            try:
                if drank.count():
                    drank.first.click(timeout=1500)
                elif cont.count():
                    cont.first.click(timeout=1500)
            except Exception:
                pass
        if not busy:
            return
        time.sleep(0.5)

def seat_table(browser, names):
    host = phone(browser, names[0])
    host.goto(BASE, wait_until="networkidle")
    host.wait_for_timeout(500)
    host.get_by_role("button", name="联机").click()
    host.wait_for_timeout(400)
    host.get_by_label("你的名字").fill(names[0])
    host.get_by_role("button", name="开一桌", exact=True).click()
    host.wait_for_url(re.compile(r"/t/[A-Z0-9]{4}"), timeout=5000)
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    ok(until(lambda: room(host)) is not None, f"host opened table {code}")
    guests = []
    for n in names[1:]:
        g = phone(browser, n)
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        g.wait_for_timeout(300)
        g.get_by_placeholder("你的名字").fill(n)
        g.get_by_role("button", name="入座").click()
        guests.append(g)
    for g in guests:
        until(lambda: room(g))
    ok(until(lambda: len(room(host)["seats"]) == len(names)), f"{len(names)} seated")
    host.wait_for_timeout(500)
    return host, guests, code

def start_game(host, everyone, gid):
    # tap the game's tile (the host's pick shows on every phone), then start it
    if room(host)["front"] != GAME_INDEX[gid]:
        host.locator(f'.lobby .tile[data-tile="{GAME_INDEX[gid]}"]').click()
        until(lambda: room(host)["front"] == GAME_INDEX[gid])
        host.wait_for_timeout(300)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(until(lambda g=g: (view(g) or {}).get("id") == gid) for g in everyone), f"[{gid}] every phone is in the game")
    host.wait_for_timeout(700)

def end_game(host, everyone):
    clear_stamps(everyone)
    host.locator(".table-btn").click()
    host.wait_for_timeout(500)
    host.get_by_role("button", name="结束这局，回到选游戏").click()
    ok(all(until(lambda g=g: view(g) is None) for g in everyone), "back at the lobby on every phone")
    host.wait_for_timeout(500)

# ---------------------------------------------------------------- games

def t_dice(host, everyone):
    start_game(host, everyone, "dice")
    shot(host, "dice-start")
    for r in range(3):
        v = view(host)
        turn = by_pid(everyone, v["turn"])
        turn.get_by_role("button", name="掷骰子").last.click()
        time.sleep(1.6)
        sums = [g.locator(".dice-sum").inner_text() if g.locator(".dice-sum").count() else "-" for g in everyone]
        v = view(host)
        if v["phase"] == "assign":
            ok(True, f"[dice] snake eyes on roll {r}")
            turn.locator(".picker .chip").nth(1).click()
            time.sleep(1)
        else:
            ok(len(set(sums)) == 1 and sums[0] == str(sum(v["dice"])), f"[dice] roll {r}: every phone shows {sums}")
        if r == 0:
            shot(everyone[1], "dice-result")
        if stamps_up(everyone):
            shot(turn, f"dice-stamp{r}")
        clear_stamps(everyone)
        turn.get_by_role("button", name="下一个").first.click()
        time.sleep(0.5)
    end_game(host, everyone)

def bottle_angle(pg):
    return pg.evaluate("() => { const g = document.querySelector('.bottle-svg g[transform^=rotate]'); return g && g.getAttribute('transform'); }")

def t_truth(host, everyone):
    start_game(host, everyone, "truth")
    shot(everyone[2], "truth-start")
    for r in range(2):
        v = view(host)
        spinner = by_pid(everyone, v["spinner"])
        spinner.get_by_role("button", name="转瓶子").click()
        time.sleep(0.8)
        shot(everyone[3], f"truth-spinning{r}")
        until(lambda: all(g.locator(".choose-box").count() for g in everyone), 9000)
        time.sleep(0.6)
        v = view(host)
        angles = set()
        for g in everyone:
            a = bottle_angle(g)
            m = re.search(r"rotate\((-?[\d.e-]+)", a or "")
            angles.add(round(float(m.group(1)) % 360) if m else None)
        ok(len(angles) == 1, f"[truth] the bottle points the same way on every phone {angles}")
        chosen = by_pid(everyone, v["chosen"])
        ok(chosen.get_by_role("button", name="真心话").count() == 1, f"[truth] only the chosen phone gets the choice ({chosen._name})")
        others_have = [g._name for g in everyone if g is not chosen and g.get_by_role("button", name="真心话").count()]
        ok(not others_have, f"[truth] nobody else can choose {others_have}")
        shot(chosen, f"truth-choose{r}")
        chosen.get_by_role("button", name="真心话" if r == 0 else "大冒险").click()
        time.sleep(0.8)
        for g in everyone:
            if g.locator(".cloche-dome").count():
                g.locator(".cloche-dome").click()
        time.sleep(1.0)
        texts = set(g.locator(".prompt-text").inner_text() for g in everyone)
        ok(len(texts) == 1, f"[truth] same card on every phone")
        shot(chosen, f"truth-card{r}")
        if r == 0:
            chosen.get_by_role("button", name="做完了").click()
        else:
            chosen.get_by_role("button", name="放弃，认罚").click()
            ok(until(lambda: chosen.locator(".stamp-layer").count()), "[truth] passing stamps the chooser")
            shot(chosen, "truth-pass-stamp")
            shot(host if host is not chosen else everyone[1], "truth-pass-stamp-watch")
            clear_stamps(everyone)
        time.sleep(0.6)
    end_game(host, everyone)

def t_undercover(host, everyone):
    start_game(host, everyone, "undercover")
    shot(everyone[1], "uc-setup")
    host.get_by_role("button", name="发词").click()
    time.sleep(0.8)
    words = {}
    for g in everyone:
        g.locator(".cloche-dome").click()
    time.sleep(1.0)
    for g in everyone:
        words[g._name] = g.locator(".word-big").inner_text()
    shot(everyone[2], "uc-word")
    distinct = set(words.values())
    ok(len(distinct) == 2, f"[undercover] two different words dealt {words}")
    counts = {w: list(words.values()).count(w) for w in distinct}
    ok(sorted(counts.values()) == [1, 3], f"[undercover] one undercover, three civilians {counts}")
    uc_word = min(counts, key=counts.get)
    uc_phone = next(g for g in everyone if words[g._name] == uc_word)
    for g in everyone:
        g.get_by_role("button", name="记住了").click()
    ok(until(lambda: view(host)["phase"] == "talk"), "[undercover] everyone ready: talk starts")
    for i in range(4):
        v = view(host)
        if v["phase"] != "talk":
            break
        sp = by_pid(everyone, v["order"][v["speaker"]])
        sp.get_by_placeholder(re.compile("一句话描述")).fill(f"第{i+1}个人的描述")
        if i == 1:
            shot(sp, "uc-talk")
        sp.get_by_role("button", name="说完了").click()
        time.sleep(0.5)
    ok(until(lambda: view(host)["phase"] == "vote"), "[undercover] vote phase")
    shot(everyone[0], "uc-vote")
    target = me(uc_phone)
    target_name = uc_phone._name
    for g in everyone:
        if g is uc_phone:
            g.locator(".picker .chip:not([disabled])").first.click()
        else:
            g.locator(".picker .chip", has_text=target_name).click()
        time.sleep(0.25)
    ok(until(lambda: view(host)["phase"] == "reveal"), "[undercover] all voted: reveal")
    time.sleep(1.6)
    shot(everyone[3], "uc-reveal")
    out = view(host)["out"]
    ok(out and out["pid"] == target and out["role"] == "uc", f"[undercover] the undercover is out {out}")
    host.get_by_role("button", name="看结果").click()
    ok(until(lambda: view(host)["phase"] == "end"), "[undercover] game over")
    time.sleep(0.6)
    shot(uc_phone, "uc-end-stamp")
    clear_stamps(everyone)
    shot(everyone[1], "uc-end")
    ok("平民赢了" in everyone[1].locator(".net-body").inner_text(), "[undercover] civilians win")
    end_game(host, everyone)

def ink(pg):
    return pg.evaluate("""() => { const c = document.querySelector('.plate-canvas'); if (!c) return -1; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++; return n; }""")

def t_draw(host, everyone):
    start_game(host, everyone, "draw")
    v = view(host)
    drawer = by_pid(everyone, v["drawer"])
    guessers = [g for g in everyone if g is not drawer]
    shot(guessers[0], "draw-pick-wait")
    drawer.get_by_role("button", name=re.compile("简单")).click()
    time.sleep(0.8)
    word = drawer.locator(".draw-word-main").inner_text().strip()
    ok(bool(word), f"[draw] drawer sees the word {word!r}")
    ok(all(g.locator(".draw-word-main").count() == 0 for g in guessers), "[draw] guessers do not see the word")
    ok(all(not (view(g) or {}).get("word") for g in guessers), "[draw] the word never reaches a guesser's phone")
    box = drawer.locator(".plate-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    drawer.mouse.move(cx - 70, cy - 30)
    drawer.mouse.down()
    for i in range(1, 16):
        drawer.mouse.move(cx - 70 + i * 9, cy - 30 + ((i % 4) - 2) * 12)
        drawer.wait_for_timeout(16)
    drawer.mouse.up()
    time.sleep(0.8)
    inks = [ink(g) for g in guessers]
    ok(all(n > 200 for n in inks), f"[draw] the stroke shows up on every guesser's plate {inks}")
    shot(drawer, "draw-drawer")
    shot(guessers[0], "draw-guesser")
    guessers[0].get_by_placeholder("猜是什么").fill("完全不对")
    guessers[0].get_by_role("button", name="猜").click()
    ok(until(lambda: "完全不对" in drawer.locator(".guess-list").inner_text()), "[draw] wrong guesses show on the drawer's phone")
    guessers[1].get_by_placeholder("猜是什么").fill(word)
    guessers[1].get_by_role("button", name="猜").click()
    ok(until(lambda: "猜中了" in drawer.locator(".guess-list").inner_text()), "[draw] a right guess is announced")
    ok(word not in drawer.locator(".guess-list").inner_text(), "[draw] the right answer itself is not shown in the feed")
    shot(guessers[2], "draw-after-correct")
    drawer.get_by_role("button", name=re.compile("结束这轮")).click()
    ok(until(lambda: view(host)["phase"] == "result"), "[draw] round over")
    time.sleep(0.6)
    shot(guessers[0], "draw-result")
    sc = view(host)["scores"]
    ok(sc.get(me(guessers[1]), 0) == 2 and sc.get(me(drawer), 0) == 1, f"[draw] scores: first guesser 2, drawer 1 {sc}")
    drawer.get_by_role("button", name="下一位画").click()
    ok(until(lambda: view(host)["phase"] == "pick" and view(host)["drawer"] != me(drawer)), "[draw] next drawer")
    ok(until(lambda: all(ink(g) == 0 for g in everyone)), "[draw] plates wiped for the next round")
    end_game(host, everyone)

def t_king(host, everyone):
    start_game(host, everyone, "king")
    shot(everyone[1], "king-deal")
    for i, g in enumerate(everyone):
        free = g.locator(".holder-svg g[role=button][aria-disabled='false']")
        (free.last if i % 2 else free.first).click()
        time.sleep(0.35)
    time.sleep(0.9)
    tokens = {}
    for g in everyone:
        tokens[g._name] = (view(g) or {}).get("myToken")
    shot(everyone[2], "king-pulled")
    vals = list(tokens.values())
    ok("K" in vals and sorted(x for x in vals if x != "K") == [1, 2, 3], f"[king] one king and numbers 1..3 {tokens}")
    for g in everyone:
        g.get_by_role("button", name="记住了").click()
        time.sleep(0.2)
    ok(until(lambda: view(host)["phase"] == "crown"), "[king] crowned when all are ready")
    time.sleep(0.6)
    king_pid = view(host)["king"]
    king = by_pid(everyone, king_pid)
    shot(everyone[0] if everyone[0] is not king else everyone[1], "king-crown")
    shot(king, "king-crown-me")
    king.get_by_role("button", name="国王抽命令").click()
    ok(until(lambda: view(host)["phase"] == "command"), "[king] command drawn")
    time.sleep(0.6)
    nums = view(host)["cmd"]["nums"]
    called = [g for g in everyone if (view(g) or {}).get("myToken") in nums]
    ok(len(called) == len(nums), f"[king] {len(nums)} numbers called")
    for g in called:
        g.get_by_role("button", name=re.compile("站出来")).click()
        time.sleep(0.3)
    ok(until(lambda: len(view(host)["stepped"]) == len(nums)), "[king] the called stepped up")
    shot(king, "king-command")
    king.get_by_role("button", name="有人不做").click()
    time.sleep(0.3)
    king.locator(".picker .chip:not([disabled])").first.click()
    ok(until(lambda: stamps_up(everyone)), "[king] refusing earns a penalty")
    clear_stamps(everyone)
    king.get_by_role("button", name=re.compile("执行完毕")).click()
    ok(until(lambda: view(host)["phase"] == "deal" and view(host)["round"] == 2), "[king] next round dealt")
    end_game(host, everyone)

def t_prompts(host, everyone):
    start_game(host, everyone, "prompts")
    v = view(host)
    reader = by_pid(everyone, v["reader"])
    reader.get_by_role("button", name="抽一张").click()
    ok(until(lambda: view(host)["phase"] == "answer"), "[prompts] card drawn, everyone answers")
    time.sleep(0.4)
    shot(everyone[2], "prompts-answer")
    yes = everyone[:2]
    for g in everyone:
        g.get_by_role("button", name="我做过" if g in yes else "没做过").click()
        time.sleep(0.2)
    ok(until(lambda: view(host)["phase"] == "reveal"), "[prompts] all answered: reveal")
    time.sleep(0.3)
    r = view(host)["result"]
    ok(sorted(r["yes"]) == sorted(me(g) for g in yes), "[prompts] the two who have are named")
    shot(everyone[3], "prompts-reveal")
    ok(until(lambda: stamps_up(yes), 4000), "[prompts] the ones who have get the stamp")
    shot(yes[0], "prompts-stamp")
    clear_stamps(everyone)
    host.locator(".heat-tab button", has_text="谁最有可能").click()
    ok(until(lambda: view(host)["mode"] == "likely"), "[prompts] host switched to Most Likely To")
    v = view(host)
    by_pid(everyone, v["reader"]).get_by_role("button", name="抽一张").click()
    ok(until(lambda: view(host)["phase"] == "answer"), "[prompts] likely card drawn")
    target = everyone[3]
    for g in everyone:
        if g is target:
            g.locator(".picker .chip:not([disabled])").first.click()
        else:
            g.locator(".picker .chip", has_text=target._name).click()
        time.sleep(0.2)
    ok(until(lambda: view(host)["phase"] == "reveal"), "[prompts] votes in: reveal")
    time.sleep(0.4)
    shot(everyone[0], "prompts-likely-reveal")
    ok(view(host)["result"]["top"] == [me(target)], "[prompts] most votes drinks")
    clear_stamps(everyone)
    end_game(host, everyone)

def t_wheel(host, everyone):
    start_game(host, everyone, "wheel")
    for r in range(3):
        v = view(host)
        turn = by_pid(everyone, v["turn"])
        turn.get_by_role("button", name="转").first.click()
        time.sleep(0.6)
        if r == 0:
            shot(everyone[1], "wheel-spinning")
        ok(until(lambda: view(host)["phase"] not in ("spin", "spinning") or view(host)["result"] is None, 9000), f"[wheel] spin {r} landed")
        time.sleep(0.9)
        v = view(host)
        label = None
        if v["result"] is not None:
            label = v["slices"][v["result"]]["label"]["zh"]
        shot(everyone[2], f"wheel-result{r}")
        if v["phase"] == "pick":
            turn.locator(".picker .chip:not([disabled])").first.click()
            time.sleep(0.8)
        elif v["phase"] == "prompt":
            turn.get_by_role("button", name="做完了").click()
            time.sleep(0.5)
        clear_stamps(everyone)
        v = view(host)
        if v["phase"] == "result":
            shown = [g.locator(".wheel-result").inner_text() if g.locator(".wheel-result").count() else "" for g in everyone]
            ok(len(set(shown)) == 1, f"[wheel] same slice on every phone {shown} ({label})")
            turn.get_by_role("button", name="下一个").click()
            time.sleep(0.5)
        elif v["phase"] == "spin":
            ok(True, f"[wheel] spin again ({label})")
    end_game(host, everyone)

def t_rogue(host, everyone):
    start_game(host, everyone, "rogue")
    shot(everyone[1], "rogue-start")
    seen = set()
    for r in range(16):
        clear_stamps(everyone)
        v = view(host)
        if v["phase"] != "draw":
            break
        turn = by_pid(everyone, v["turn"])
        turn.locator(".pcard-back").click()
        until(lambda: view(host)["card"] is not None)
        time.sleep(1.0)
        v = view(host)
        rank = v["card"]["rank"]
        seen.add(rank)
        drawer = by_pid(everyone, v["drawer"])
        ranks = set((view(g) or {}).get("card", {}).get("rank") for g in everyone)
        ok(ranks == {rank}, f"[rogue] draw {r}: every phone shows {rank} ({v['phase']})")
        phase = v["phase"]
        if phase == "pick":
            drawer.locator(".picker .chip:not([disabled])").first.click()
            ok(until(lambda: stamps_up(everyone), 3000), "[rogue] A: the picked one gets the stamp")
        elif phase == "garden-pick":
            drawer.get_by_role("button", name="水果园").click()
            until(lambda: view(host)["phase"] == "garden")
            for _ in range(2):
                sp = by_pid(everyone, view(host)["garden"]["speaker"])
                sp.get_by_role("button", name=re.compile("我说完了")).click()
                time.sleep(0.4)
            shot(drawer, "rogue-garden")
            drawer.get_by_role("button", name=re.compile("重复了")).click()
            ok(until(lambda: stamps_up(everyone), 3000), "[rogue] 3: a repeat earns the stamp")
        elif phase == "grab":
            shot(everyone[1], "rogue-grab")
            for g in everyone:
                if g.locator(".grab-btn").count():
                    g.locator(".grab-btn").dispatch_event("pointerdown")
                    time.sleep(0.6)
            ok(until(lambda: view(host)["phase"] == "done", 4000), "[rogue] 4: everyone grabbed a number")
            ok(until(lambda: stamps_up(everyone), 3000), "[rogue] 4: the last one drinks")
        elif phase == "sevens-start":
            drawer.locator(".num-btn", has_text=re.compile(r"^5$")).click()
            until(lambda: view(host)["phase"] == "sevens")
            for _ in range(5):
                sv = view(host)["sevens"]
                if not sv:
                    break
                n = sv["n"]
                sp = by_pid(everyone, sv["speaker"])
                seven = n % 7 == 0 or "7" in str(n)
                if seven:
                    sp.get_by_role("button", name="过").click()
                else:
                    sp.locator(".sevens-num").click()
                time.sleep(0.4)
            shot(everyone[0], "rogue-sevens")
            ok(view(host)["phase"] == "sevens", "[rogue] 7: right calls keep the count going")
            sv = view(host)["sevens"]
            sp = by_pid(everyone, sv["speaker"])
            wrong_pass = not (sv["n"] % 7 == 0 or "7" in str(sv["n"]))
            if wrong_pass:
                sp.get_by_role("button", name="过").click()
            else:
                sp.locator(".sevens-num").click()
            ok(until(lambda: stamps_up(everyone), 3000), "[rogue] 7: a wrong call drinks")
        elif phase == "done" and rank in ("9", "J", "Q", "K"):
            ok(until(lambda: stamps_up(everyone), 3000), f"[rogue] {rank}: the stamp lands")
        clear_stamps(everyone)
        holders = view(host)["holders"]
        if holders.get("camera") and "camera" not in seen:
            seen.add("camera")
            cam = by_pid(everyone, holders["camera"])
            cam.get_by_role("button", name="照相机").click()
            time.sleep(0.4)
            shot(everyone[0] if everyone[0] is not cam else everyone[1], "rogue-camera-freeze")
            ok(until(lambda: cam.get_by_text("谁动了？").count(), 6000), "[rogue] 5: the camera holder judges after the freeze")
            cam.locator(".interrupt-stage .picker .chip:not([disabled])").first.click()
            ok(until(lambda: stamps_up(everyone), 3000), "[rogue] 5: whoever moved drinks")
            clear_stamps(everyone)
        if holders.get("nose") and "nose" not in seen:
            seen.add("nose")
            nose = by_pid(everyone, holders["nose"])
            nose.get_by_role("button", name="摸鼻子").click()
            time.sleep(0.5)
            others = [g for g in everyone if g is not nose]
            shot(others[0], "rogue-nose")
            for g in others:
                g.locator(".nose-btn").dispatch_event("pointerdown")
                time.sleep(0.25)
            ok(until(lambda: stamps_up(everyone), 4000), "[rogue] 6: the slowest nose drinks")
            clear_stamps(everyone)
        v = view(host)
        if v["phase"] == "done":
            nxt = by_pid(everyone, v["drawer"])
            nxt.get_by_role("button", name="下一位抽牌").click()
            time.sleep(0.4)
    print("  ranks seen:", sorted(seen))
    # the bathroom: no pass, drink first
    v = view(host)
    someone = next(g for g in everyone if v["holders"].get("wc") != me(g))
    someone.get_by_role("button", name="上厕所").click()
    someone.get_by_role("button", name="我喝").click()
    ok(until(lambda: someone.locator(".stamp-layer").count(), 3000), "[rogue] no bathroom pass: drink first")
    clear_stamps(everyone)
    end_game(host, everyone)

def t_lifecycle(host, everyone, browser, code):
    guest = everyone[3]
    # a phone that drops and comes back keeps its seat
    pid = me(guest)
    guest.close()
    ok(until(lambda: next(s for s in room(host)["seats"] if s["id"] == pid)["on"] is False), "[life] a closed phone shows as away")
    shot(host, "life-away")
    back = guest.context.new_page()
    back._name = "Cat2"; back._errs = []
    back.goto(BASE + f"#/r/{code}", wait_until="networkidle")
    ok(until(lambda: room(back) and room(back)["you"] == pid), "[life] reopening the link sits straight back in the same seat")
    everyone[3] = back
    # rename
    back.locator(".table-btn").click()
    time.sleep(0.4)
    back.get_by_label("你的名字").fill("Cathy")
    back.get_by_role("button", name="保存").first.click()
    ok(until(lambda: any(s["name"] == "Cathy" for s in room(host)["seats"])), "[life] rename reaches the table")
    back.keyboard.press("Escape")
    time.sleep(0.3)
    # the host sets the table's penalty
    host.locator(".table-btn").click()
    time.sleep(0.4)
    host.get_by_label("这桌的惩罚").fill("做十个深蹲")
    host.locator("form", has=host.get_by_label("这桌的惩罚")).get_by_role("button", name="保存").click()
    ok(until(lambda: room(back)["penalty"] == "做十个深蹲"), "[life] the host's penalty reaches every phone")
    shot(host, "life-table-sheet")
    host.keyboard.press("Escape")
    time.sleep(0.3)
    # invite sheet
    host.get_by_role("button", name="叫人").first.click()
    time.sleep(0.6)
    ok(host.locator(".invite-qr-svg svg").count() == 1, "[life] the invite card has a QR code")
    shot(host, "life-invite")
    host.keyboard.press("Escape")
    time.sleep(0.3)
    # a guest leaves
    leaver = everyone[2]
    lpid = me(leaver)
    leaver.locator(".topbar .icon-btn").first.click()
    time.sleep(0.4)
    leaver.locator(".sheet").get_by_role("button", name="离开这桌").click()
    ok(until(lambda: lpid not in [s["id"] for s in room(host)["seats"]]), "[life] leaving frees the seat")
    ok(until(lambda: "/t/" not in leaver.evaluate("() => location.pathname") and leaver.locator(".online-btn").count()), "[life] the one who left is back at the one-phone table")
    # the host hands the table over, then removes someone
    host.locator(".table-btn").click()
    time.sleep(0.4)
    host.locator(".seat-row", has_text="小雨").get_by_role("button", name="让他当主人").click()
    ok(until(lambda: room(host)["host"] == me(everyone[1])), "[life] host handed over")
    host.keyboard.press("Escape")
    time.sleep(0.5)
    new_host = everyone[1]
    new_host.locator(".table-btn").click()
    time.sleep(0.4)
    new_host.locator(".seat-row", has_text="Cathy").get_by_role("button", name="请出去").click()
    new_host.locator(".seat-row", has_text="Cathy").get_by_role("button", name="请出去").click()
    ok(until(lambda: back.get_by_text("主人把你请出了这桌").count()), "[life] a removed phone is told so")
    shot(back, "life-kicked")

with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = seat_table(browser, ["Steve", "小雨", "Ben", "Cat"])
    everyone = [host] + guests
    shot(host, "lobby-host")
    shot(guests[0], "lobby-guest")
    for name in ["dice", "truth", "wheel", "prompts", "king", "draw", "undercover", "rogue"]:
        if ONLY and name not in ONLY:
            continue
        print(f"--- {name}")
        try:
            globals()[f"t_{name}"](host, everyone)
        except Exception as e:
            ok(False, f"[{name}] crashed: {str(e).splitlines()[0][:200]}")
            for g in everyone:
                shot(g, f"crash-{name}")
            try:
                end_game(host, everyone)
            except Exception:
                pass
    if not ONLY or "lifecycle" in ONLY:
        print("--- lifecycle")
        try:
            t_lifecycle(host, everyone, browser, code)
        except Exception as e:
            ok(False, f"[life] crashed: {str(e).splitlines()[0][:200]}")
            for g in everyone:
                try:
                    shot(g, "crash-life")
                except Exception:
                    pass
    for g in everyone:
        errs = [e for e in getattr(g, "_errs", []) if "WebSocket" not in e]
        if errs:
            print(f"  errors on {g._name}: {errs[:4]}")
            fails.append(f"console errors on {g._name}")
    browser.close()

print("FAILED:\n  " + "\n  ".join(fails) if fails else "net test passed")
sys.exit(1 if fails else 0)
