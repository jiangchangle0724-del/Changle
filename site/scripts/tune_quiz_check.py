"""
Name That Tune's multiple choice, played long with the sound on: one phone (real songs, then
melodies) and an online table of three phones (real songs, then melodies), 20 songs each. Every
phone's console errors and page errors are collected, and one phone's memory is sampled after
every song (390x844): the JS heap after a forced GC, DOM nodes, notes and effects on the stage,
decoded song previews and Web Audio nodes still alive, GSAP tweens, and the tabs' process memory
(also five times a second, for the peaks). The tabs' memory must hold steady too, not just the JS
heap: the stage's lights once grew it by about 150 MB a song, with the heap flat all along. `stress` plays a table where a phone locks mid-song and
wakes up, a player walks off and another sits down, and answers and "next" get double taps.
`levels` checks the hard titles: no singer under any of the four, on one phone and on every phone
at a table (multiple choice, and the four a buzzer picks from), and the reveal still names the singer.
`snap` checks one-second rounds: what each phone plays (from where, for how long) on one phone (tap
for more) and at a table (every phone the same spot, the one the host's phone found).
`specials` checks the decades and the singer specials (the sheet, a game of one singer's titles, a table).

Apple's previews are AAC, which the open-source Chromium can't decode, so each one is fetched
and turned into MP3 on the fly (ffmpeg): the phone loads, decodes, analyses and plays it like a
real one. Today's charts are left out, so every song is in src/data/songs.ts and the script
knows the right title. Works against the dev server (reads window.__room) or a production build
(`vite preview`, read off the screens; `stress` needs the dev server).

  python3 scripts/tune_quiz_check.py [base_url] [solo|online|stress|levels|snap|specials ...]
  (both local servers running; needs ffmpeg and pip's playwright, psutil and requests; ROUNDS=8
  for a shorter run; SHOTS=dir for screenshots and the audio cache; HTTPS_PROXY is passed to the
  browser when set)
"""
import hashlib, json, os, random, re, subprocess, sys, threading, time, uuid

import psutil
import requests
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5183/").rstrip("/") + "/"
ONLY = [a for a in sys.argv[1:] if not a.startswith("http")] or ["solo", "online"]
ROUNDS = int(os.environ.get("ROUNDS", "20"))
OUT = os.environ.get("SHOTS", os.path.join(os.environ.get("TMPDIR", "/tmp"), "tune-quiz"))
CACHE = os.path.join(OUT, "audio")
os.makedirs(CACHE, exist_ok=True)
PRE = "https://audio-ssl.itunes.apple.com/itunes-assets/"
SUF = ".plus.aac.p.m4a"
MARK = "--tune-quiz-run=" + uuid.uuid4().hex[:10]
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "Mia", "Jay"])]
rng = random.Random(7)

fails: list[str] = []


def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)


def until(fn, timeout=8000, step=100):
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


# ------------------------------------------------------------------ the song list, and its audio

ROWS = []
for line in open(os.path.join(HERE, "..", "src", "data", "songs.ts"), encoding="utf-8"):
    line = line.strip()
    if line.startswith("[") and line.endswith("],"):
        ROWS.append(json.loads(line[:-1]))
BY_PATH = {(r[6][len(PRE):-len(SUF)] if r[6].startswith(PRE) else r[6]): r for r in ROWS}
TUNE_NOTES = re.findall(r'^\s*tune\("([^"]*)", "([^"]*)", \d+, "([^"]*)"', open(os.path.join(HERE, "..", "src", "data", "tunes.ts"), encoding="utf-8").read(), re.M)
requested: list[str] = []  # preview paths the phones asked for, in order


def path_of(url: str) -> str:
    return url[len(PRE):-len(SUF)] if url.startswith(PRE) and url.endswith(SUF) else url


def mp3_for(url: str) -> bytes | None:
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    out = os.path.join(CACHE, key + ".mp3")
    if not os.path.exists(out):
        src = os.path.join(CACHE, key + ".m4a")
        try:
            r = requests.get(url, timeout=30)
            if r.status_code != 200 or len(r.content) < 1000:
                return None
            open(src, "wb").write(r.content)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:a", "libmp3lame", "-b:a", "96k", out], check=True, timeout=60)
        except Exception as e:  # noqa: BLE001
            print("  (audio)", url[-40:], e, flush=True)
            return None
    return open(out, "rb").read()


def serve_preview(route):
    url = route.request.url
    requested.append(path_of(url))
    body = mp3_for(url)
    if body is None:
        route.fulfill(status=404, body="", headers={"access-control-allow-origin": "*"})
        return
    route.fulfill(status=200, body=body, headers={"content-type": "audio/mpeg", "access-control-allow-origin": "*", "cache-control": "no-store"})


# ------------------------------------------------------------------ phones

COUNT_BUFFERS = """
(() => {
  const reg = new FinalizationRegistry(() => { window.__tq.alive--; });
  window.__tq = { alive: 0, decoded: 0, nodes: 0, made: 0 };
  const orig = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (data, ok, bad) {
    const seen = (buf) => { window.__tq.alive++; window.__tq.decoded++; reg.register(buf, 0); if (ok) ok(buf); };
    return orig.call(this, data, seen, bad);
  };
  // Web Audio nodes still alive (made, not yet collected)
  const nodes = new FinalizationRegistry(() => { window.__tq.nodes--; });
  for (const m of ["createGain", "createBufferSource", "createOscillator", "createBiquadFilter", "createStereoPanner", "createDynamicsCompressor", "createConvolver", "createDelay", "createWaveShaper"]) {
    const make = BaseAudioContext.prototype[m];
    if (!make) continue;
    BaseAudioContext.prototype[m] = function (...args) {
      const n = make.apply(this, args);
      window.__tq.nodes++;
      window.__tq.made++;
      nodes.register(n, 0);
      return n;
    };
  }
})();
"""

SAMPLE = """async () => {
  const tick = () => new Promise((r) => setTimeout(r, 40));
  for (let i = 0; i < 3; i++) { if (window.gc) window.gc(); await tick(); }
  const fx = [...document.querySelectorAll('.tn-avatar .fx, .tn-avatar .tears')].reduce((a, g) => a + g.childElementCount, 0);
  return {
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    nodes: document.getElementsByTagName('*').length,
    notes: document.querySelectorAll('.tn-stage-notes text').length,
    fx,
    alive: window.__tq ? window.__tq.alive : -1,
    decoded: window.__tq ? window.__tq.decoded : -1,
    audioNodes: window.__tq ? window.__tq.nodes : -1,
    audioMade: window.__tq ? window.__tq.made : -1,
    tweens: window.gsap ? window.gsap.globalTimeline.getChildren(true, true, false).length : -1,
  };
}"""


def browser_of(p):
    b = p.chromium.launch(args=[
        MARK,
        "--autoplay-policy=no-user-gesture-required",
        "--js-flags=--expose-gc",
        "--enable-precise-memory-info",
        *(["--proxy-server=" + os.environ["HTTPS_PROXY"], "--proxy-bypass-list=127.0.0.1;localhost"] if os.environ.get("HTTPS_PROXY") else []),
    ])
    return b


def renderers_mb():
    """Memory (USS) of this run's page processes, in MB."""
    total = 0
    for pr in psutil.process_iter(["cmdline"]):
        cmd = pr.info["cmdline"] or []
        if MARK not in cmd:
            continue
        for ch in pr.children(recursive=True):
            try:
                if any(a == "--type=renderer" for a in ch.cmdline()) and not any("extension" in a for a in ch.cmdline()):
                    total += ch.memory_full_info().uss
            except psutil.Error:
                pass
    return round(total / 2**20)


def phone(browser, name, players=None, lang="zh"):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True, locale="zh-CN")
    ctx.route("https://audio-ssl.itunes.apple.com/**", serve_preview)
    # no charts today: every song is in songs.ts
    ctx.route("https://itunes.apple.com/**", lambda r: r.fulfill(status=200, body='{"feed": {}}', headers={"content-type": "application/json", "access-control-allow-origin": "*"}))
    pg = ctx.new_page()
    settings = {"lang": lang, "sound": True, "music": False, "customPenalty": "", "players": players or []}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    pg.add_init_script(COUNT_BUFFERS)
    errs: list[str] = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("crash", lambda *_: errs.append("CRASH: the tab died"))
    pg._errs = errs
    pg._name = name
    return pg


def errors_of(pages):
    return [(g._name, e) for g in pages for e in g._errs if "favicon" not in e and "WebSocket" not in e]


def shot(pg, tag):
    try:
        pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))
    except Exception:
        pass


def clear_stamps(pages):
    for _ in range(12):
        busy = False
        for g in pages:
            if g.locator(".stamp-layer").count() == 0:
                continue
            busy = True
            btn = g.locator(".stamp-layer .stamp-done").first
            later = g.locator(".stamp-layer button", has_text=re.compile("等会|稍后|Later"))
            try:
                (btn if btn.count() else later.first).click(timeout=1200)
            except Exception:
                pass
        if not busy:
            return
        time.sleep(0.4)


class Memory:
    def __init__(self, label):
        self.label = label
        self.rows = []
        # the tab's memory five times a second, for the peaks between songs (decoding, analysing)
        self.peak = 0
        self.samples = []
        self.running = True

        def watch():
            while self.running:
                mb = renderers_mb()
                self.samples.append(mb)
                self.peak = max(self.peak, mb)
                time.sleep(0.2)

        threading.Thread(target=watch, daemon=True).start()

    def take(self, pg, n):
        s = pg.evaluate(SAMPLE)
        s["rss"] = renderers_mb()
        s["n"] = n
        self.rows.append(s)
        print(f"  [{self.label}] song {n:2d}: heap {s['heap'] / 2**20:5.1f} MB, nodes {s['nodes']}, notes {s['notes']}, fx {s['fx']}, previews alive {s['alive']} of {s['decoded']}, audio nodes alive {s['audioNodes']} of {s['audioMade']}, tweens {s['tweens']}, tabs {s['rss']} MB", flush=True)

    def report(self):
        self.running = False
        if self.samples:
            avg = sum(self.samples) / len(self.samples)
            print(f"  [{self.label}] tabs' memory: peak {self.peak} MB, average {avg:.0f} MB; previews decoded {self.rows[-1]['decoded'] if self.rows else '?'} for {len(self.rows)} songs", flush=True)
        if len(self.rows) < 6:
            return
        first, last = self.rows[2], self.rows[-1]  # from song 3 on: everything is warm by then
        grow = (last["heap"] - first["heap"]) / 2**20
        ok(grow < 8, f"[{self.label}] the JS heap holds steady over {len(self.rows)} songs ({first['heap'] / 2**20:.1f} -> {last['heap'] / 2**20:.1f} MB)")
        ok(max(r["alive"] for r in self.rows[2:]) <= 3, f"[{self.label}] at most three decoded previews alive at once ({[r['alive'] for r in self.rows]})")
        if last["decoded"] > 0:
            # each song fetched and decoded once (the next one is loaded early; a dev server's
            # StrictMode starts the first song's loading twice)
            ok(last["decoded"] <= len(self.rows) + 4, f"[{self.label}] each song decoded once ({last['decoded']} decodes for {len(self.rows)} songs)")
        ok(last["nodes"] - first["nodes"] < 150, f"[{self.label}] the page doesn't pile up elements ({first['nodes']} -> {last['nodes']})")
        ok(last["tweens"] < 200, f"[{self.label}] tweens don't pile up ({first['tweens']} -> {last['tweens']})")
        # the page's own memory, outside the JS heap (styles, paint): from song 3 on it may wobble, not climb
        per = (last["rss"] - first["rss"]) / max(1, len(self.rows) - 3)
        ok(per < 20, f"[{self.label}] the tabs' memory holds steady from song 3 on ({first['rss']} -> {last['rss']} MB, {per:+.0f} MB a song)")


# ------------------------------------------------------------------ one phone

def right_option(pg):
    """Which of the four titles is the song playing (the phone asked for its preview)."""
    opts = pg.locator(".tn-option").all()
    for i, o in enumerate(opts):
        t = o.locator("strong").inner_text().strip()
        a = o.locator("small").inner_text().strip()
        for r in ROWS:
            if r[1] == t and (r[2] == a or (r[3] or r[2]) == a):
                p = r[6][len(PRE):-len(SUF)] if r[6].startswith(PRE) else r[6]
                if p in requested[-6:]:
                    return i
    return None


def solo_round(pg, mode, n, mem):
    ok(until(lambda: pg.locator(".tn-round").inner_text().startswith(f"第 {n} 首"), 15000) is not None, f"[solo {mode}] song {n} is up")
    # the four titles open up once the music starts
    up = until(lambda: pg.locator(".tn-option").count() == 4 and pg.locator(".tn-option:not([disabled])").count() == 4, 20000)
    if not up:
        shot(pg, f"solo-{mode}-stuck-{n}")
        ok(False, f"[solo {mode}] song {n}: the four titles can be picked")
        return False
    pg.wait_for_timeout(rng.choice([300, 900, 2200, 4500]))
    want_right = rng.random() < 0.6
    idx = right_option(pg) if mode == "songs" else None
    if mode == "songs" and idx is None:
        ok(False, f"[solo songs] song {n}: the right title is one of the four")
        idx = 0
    if mode == "melody":
        idx = rng.randrange(4)
    elif not want_right:
        idx = (idx + 1 + rng.randrange(3)) % 4
    pg.locator(".tn-option").nth(idx).click()
    pg.wait_for_timeout(250)
    if pg.locator(".song-title, .tune-title").count() == 0:
        # a wrong pick: try another one if the screen allows, else reveal
        others = pg.locator(".tn-option:not([disabled])")
        if others.count() and rng.random() < 0.5:
            others.first.click()
            pg.wait_for_timeout(250)
        if pg.locator(".song-title, .tune-title").count() == 0:
            pg.get_by_role("button", name="揭晓歌名").click()
    ok(until(lambda: pg.locator(".song-title, .tune-title").count() > 0, 6000) is not None, f"[solo {mode}] song {n}: the title is out")
    pg.wait_for_timeout(rng.choice([400, 1500, 3000]))
    if n == 3:
        shot(pg, f"solo-{mode}-reveal")
    if rng.random() < 0.8:
        pg.locator(".picker .chip").nth(rng.randrange(len(PLAYERS))).click()
    else:
        pg.get_by_role("button", name="没人猜到").click()
    if mem:
        mem.take(pg, n)
    return True


def solo(browser, mode):
    pg = phone(browser, f"solo-{mode}", players=PLAYERS)
    pg.goto(BASE + "#/g/tune", wait_until="networkidle")
    pg.wait_for_selector(".vinyl")
    if mode == "melody":
        pg.get_by_role("button", name="旋律").click()
    pg.get_by_role("button", name="选择题", exact=True).click()
    pg.get_by_role("button", name=f"{ROUNDS} 首" if ROUNDS in (5, 8, 12, 20) else "20 首").click()
    pg.get_by_role("button", name="开始").click()
    mem = Memory(f"solo {mode}")
    total = ROUNDS if ROUNDS in (5, 8, 12, 20) else 20
    for n in range(1, total + 1):
        if not solo_round(pg, mode, n, mem):
            break
        if pg.locator("text=这里出了点问题").count():
            ok(False, f"[solo {mode}] the screen broke after song {n}")
            shot(pg, f"solo-{mode}-broken")
            break
    ok(until(lambda: pg.locator(".pl-board-title").count() > 0, 8000) is not None, f"[solo {mode}] the final scores")
    shot(pg, f"solo-{mode}-end")
    mem.report()
    errs = errors_of([pg])
    ok(not errs, f"[solo {mode}] no console or page errors {errs[:4]}")
    pg.context.close()


# ------------------------------------------------------------------ online

def view(pg):
    return pg.evaluate("() => window.__room && window.__room.game")


def room(pg):
    return pg.evaluate("() => window.__room")


def me(pg):
    return pg.evaluate("() => window.__room && window.__room.you")


def seat_table(browser, names):
    host = phone(browser, names[0])
    host.goto(BASE, wait_until="networkidle")
    host.wait_for_timeout(400)
    host.locator(".online-btn").click()
    host.wait_for_timeout(400)
    host.locator("#online-name").fill(names[0])
    host.get_by_role("button", name="开一桌", exact=True).click()
    host.wait_for_url(re.compile(r"/t/[A-Z0-9]{4}"), timeout=8000)
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    until(lambda: room(host))
    guests = []
    for n in names[1:]:
        g = phone(browser, n)
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        g.wait_for_timeout(300)
        g.locator(".join-card input").fill(n)
        g.locator(".join-card button[type=submit]").click()
        guests.append(g)
    ok(until(lambda: len(room(host)["seats"]) == len(names)) is not None, f"[online] {len(names)} seated at {code}")
    return host, guests


def right_choice(v):
    if v["mode"] == "songs":
        r = BY_PATH.get(path_of(v["audio"] or ""))
        return r[0] if r else None
    notes = [x[2] for x in TUNE_NOTES]
    return notes.index(v["clip"]["notes"]) if v.get("clip") and v["clip"]["notes"] in notes else None


def online(browser):
    host, guests = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    tiles = host.locator(".lobby .tile[aria-label^='猜歌名'], .lobby .tile[aria-label^='Name That Tune']")
    if tiles.count():
        tiles.first.click()
    host.wait_for_timeout(500)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(until(lambda g=g: (view(g) or {}).get("id") == "tune") for g in everyone), "[online] every phone is in Name That Tune")
    host.wait_for_timeout(500)
    for mode in ("songs", "melody"):
        if mode == "melody":
            host.get_by_role("button", name="旋律").click()
        host.get_by_role("button", name="选择题", exact=True).click()
        host.get_by_role("button", name="20 首" if ROUNDS not in (5, 8, 12) else f"{ROUNDS} 首").click()
        ok(until(lambda: view(guests[0])["quiz"] and view(guests[0])["mode"] == mode), f"[online {mode}] multiple choice is on for the table")
        host.wait_for_timeout(300)
        host.get_by_role("button", name="放第一首").click()
        mem = Memory(f"online {mode}")
        total = view(host)["total"]
        n = 0
        while True:
            ok(until(lambda: view(host)["phase"] in ("listen", "end") and view(host)["round"] > n, 15000) is not None, f"[online {mode}] song {n + 1} starts")
            v = view(host)
            if v["phase"] == "end":
                break
            n = v["round"]
            # everyone picks once the music is on: most get it, someone now and then misses
            until(lambda: all(g.locator(".tn-option:not([disabled])").count() == 4 for g in everyone), 15000)
            host.wait_for_timeout(rng.choice([200, 800, 2500, 6000]))
            clear_stamps(everyone)
            for g in everyone:
                gv = view(g)
                if gv["phase"] != "listen" or gv["mine"] is not None:
                    continue
                right = right_choice(gv)
                ids = [c["id"] for c in gv["choices"]] if mode == "songs" else gv["options"]
                pick = right if right is not None and rng.random() < 0.7 else rng.choice(ids)
                try:
                    g.locator(".tn-option").nth(ids.index(pick)).click(timeout=3000)
                except Exception as e:  # noqa: BLE001
                    print("  (pick)", g._name, str(e)[:120], flush=True)
                g.wait_for_timeout(rng.choice([50, 400, 1200]))
            ok(until(lambda: view(host)["phase"] == "reveal", 25000) is not None, f"[online {mode}] song {n}: the reveal")
            host.wait_for_timeout(rng.choice([500, 1500, 3500]))
            if n == 3:
                shot(guests[0], f"online-{mode}-reveal")
            clear_stamps(everyone)
            mem.take(guests[0], n)
            if any(g.locator("text=这里出了点问题").count() for g in everyone):
                ok(False, f"[online {mode}] a screen broke at song {n}")
                for g in everyone:
                    shot(g, f"online-{mode}-broken")
                break
            if view(host)["phase"] == "reveal":
                btn = host.locator(".tn button", has_text=re.compile("^(下一首|看结果)$"))
                try:
                    btn.first.click(timeout=4000)
                except Exception:
                    pass
            if n >= total:
                break
        ok(until(lambda: view(host)["phase"] == "end", 15000) is not None, f"[online {mode}] the final scores")
        clear_stamps(everyone)
        host.wait_for_timeout(1500)
        clear_stamps(everyone)
        shot(guests[0], f"online-{mode}-end")
        mem.report()
        if mode == "songs":
            host.get_by_role("button", name="再来一局").click()
            ok(until(lambda: view(host)["phase"] == "ready"), "[online] back to the setup")
    errs = errors_of(everyone)
    ok(not errs, f"[online] no console or page errors {errs[:4]}")
    for g in everyone:
        g.context.close()


def online_screen(browser):
    """The same table, read off the screens only (a production build has no window.__room)."""
    host = phone(browser, "Steve")
    host.goto(BASE, wait_until="networkidle")
    host.wait_for_timeout(400)
    host.locator(".online-btn").click()
    host.wait_for_timeout(400)
    host.locator("#online-name").fill("Steve")
    host.get_by_role("button", name="开一桌", exact=True).click()
    host.wait_for_url(re.compile(r"/t/[A-Z0-9]{4}"), timeout=8000)
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    guests = []
    for n in ["Mia", "Jay"]:
        g = phone(browser, n)
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        g.wait_for_timeout(300)
        g.locator(".join-card input").fill(n)
        g.locator(".join-card button[type=submit]").click()
        guests.append(g)
    everyone = [host] + guests
    ok(until(lambda: host.locator(".lobby .face:not(.face-add)").count() >= 3, 10000) is not None, f"[online] 3 seated at {code}")
    host.locator(".lobby .tile[aria-label^='猜歌名'], .lobby .tile[aria-label^='Name That Tune']").first.click()
    host.wait_for_timeout(500)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(until(lambda g=g: g.locator(".tn").count() > 0, 10000) for g in everyone), "[online] every phone is in Name That Tune")
    for mode in ("songs", "melody"):
        if mode == "melody":
            host.get_by_role("button", name="旋律").click()
        host.get_by_role("button", name="选择题", exact=True).click()
        host.get_by_role("button", name="20 首" if ROUNDS not in (5, 8, 12) else f"{ROUNDS} 首").click()
        host.wait_for_timeout(500)
        host.get_by_role("button", name="放第一首").click()
        mem = Memory(f"online {mode} (screens)")
        total = ROUNDS if ROUNDS in (5, 8, 12) else 20
        for n in range(1, total + 1):
            up = until(lambda: all(g.locator(".tn-round").count() and g.locator(".tn-round").inner_text().startswith(f"第 {n} 首") for g in everyone) and all(g.locator(".tn-option:not([disabled])").count() == 4 for g in everyone), 20000)
            if not up:
                ok(False, f"[online {mode}] song {n}: every phone has four titles to pick")
                for g in everyone:
                    shot(g, f"screens-{mode}-stuck-{n}")
                break
            host.wait_for_timeout(rng.choice([200, 800, 2500]))
            clear_stamps(everyone)
            for g in everyone:
                try:
                    g.locator(".tn-option:not([disabled])").nth(rng.randrange(4)).click(timeout=3000)
                except Exception as e:  # noqa: BLE001
                    print("  (pick)", g._name, str(e)[:100], flush=True)
            ok(until(lambda: host.locator(".tn-who").count() > 0, 25000) is not None, f"[online {mode}] song {n}: the reveal")
            host.wait_for_timeout(rng.choice([500, 1500]))
            clear_stamps(everyone)
            mem.take(guests[0], n)
            if any(g.locator("text=这里出了点问题").count() for g in everyone):
                ok(False, f"[online {mode}] a screen broke at song {n}")
                break
            try:
                host.locator(".tn button", has_text=re.compile("^(下一首|看结果)$")).first.click(timeout=6000)
            except Exception:
                pass
        ok(until(lambda: host.locator(".pl-board-title").count() > 0, 15000) is not None, f"[online {mode}] the final scores")
        clear_stamps(everyone)
        host.wait_for_timeout(1500)
        clear_stamps(everyone)
        mem.report()
        if mode == "songs":
            host.get_by_role("button", name="再来一局").click()
            host.wait_for_timeout(800)
    errs = errors_of(everyone)
    ok(not errs, f"[online] no console or page errors {errs[:4]}")
    for g in everyone:
        g.context.close()


def stress(browser):
    """What real phones do mid-quiz: lock and come back, leave, a new one sits down, double taps."""
    host, guests = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    host.locator(".lobby .tile[aria-label^='猜歌名'], .lobby .tile[aria-label^='Name That Tune']").first.click()
    host.wait_for_timeout(500)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(until(lambda g=g: (view(g) or {}).get("id") == "tune") for g in everyone), "[stress] every phone is in Name That Tune")
    host.get_by_role("button", name="选择题", exact=True).click()
    host.get_by_role("button", name="8 首").click()
    host.wait_for_timeout(400)
    host.get_by_role("button", name="放第一首").click()
    late = None
    for n in range(1, 9):
        ok(until(lambda: view(host)["phase"] in ("listen", "end") and view(host)["round"] >= n, 20000) is not None, f"[stress] song {n} starts")
        if view(host)["phase"] == "end":
            break
        players = [g for g in everyone if not g.is_closed()]
        if n == 2:
            # Mia's phone locks for a few seconds mid-song, then wakes up
            cdp = guests[0].context.new_cdp_session(guests[0])
            cdp.send("Page.setWebLifecycleState", {"state": "frozen"})
            host.wait_for_timeout(3500)
            cdp.send("Page.setWebLifecycleState", {"state": "active"})
        if n == 4:
            # Jay walks off mid-song; a newcomer sits down a song later
            guests[1].close()
        until(lambda: all(g.locator(".tn-option:not([disabled])").count() == 4 for g in players if not g.is_closed()), 15000)
        if n == 5:
            code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
            late = phone(browser, "Lin")
            late.goto(BASE + f"#/r/{code}", wait_until="networkidle")
            late.wait_for_timeout(300)
            if late.locator(".join-card input").count():
                late.locator(".join-card input").fill("Lin")
                late.locator(".join-card button[type=submit]").click()
            everyone.append(late)
        clear_stamps([g for g in everyone if not g.is_closed()])
        for g in [g for g in everyone if not g.is_closed()]:
            opt = g.locator(".tn-option:not([disabled])")
            if opt.count() == 4:
                try:
                    opt.nth(rng.randrange(4)).dblclick(timeout=3000)  # an excited double tap
                except Exception:
                    pass
        until(lambda: view(host)["phase"] == "reveal", 25000)
        host.wait_for_timeout(700)
        clear_stamps([g for g in everyone if not g.is_closed()])
        if any(g.locator("text=这里出了点问题").count() for g in everyone if not g.is_closed()):
            ok(False, f"[stress] a screen broke at song {n}")
            break
        btn = host.locator(".tn button", has_text=re.compile("^(下一首|看结果)$"))
        try:
            btn.first.dblclick(timeout=4000)  # the host taps "next" twice
        except Exception:
            pass
    ok(until(lambda: view(host)["phase"] == "end", 30000) is not None, "[stress] the game reaches the final scores")
    errs = errors_of([g for g in everyone])
    ok(not errs, f"[stress] no console or page errors {errs[:4]}")
    for g in everyone:
        if not g.is_closed():
            g.context.close()


# every preview a page plays: from where (offset, s) and for how long (s), by its own audio clock
WATCH_PLAYS = """
(() => {
  window.__plays = [];
  const start = AudioBufferSourceNode.prototype.start;
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, ...rest) {
    if (this.buffer && this.buffer.duration > 5) {
      this.__play = { when, offset, len: null, at: performance.now() };
      window.__plays.push(this.__play);
    }
    return start.call(this, when, offset, ...rest);
  };
  AudioBufferSourceNode.prototype.stop = function (when = 0) {
    if (this.__play && this.__play.len === null) this.__play.len = Math.max(0, when - this.__play.when);
    return stop.call(this, when);
  };
})();
"""


def plays(pg):
    return pg.evaluate("() => (window.__plays || []).map((p) => ({ offset: p.offset, len: p.len, at: p.at }))")


def snap(browser):
    """One second (dev server): one phone taps for more; a table plays the same spot on every phone."""
    pg = phone(browser, "Steve", players=[{"id": "p0", "name": "Steve"}, {"id": "p1", "name": "Mia"}])
    pg.add_init_script(WATCH_PLAYS)
    pg.goto(BASE + "g/name-that-tune/play", wait_until="networkidle")
    pg.get_by_role("button", name="一秒猜歌", exact=True).click()
    pg.get_by_role("button", name="5 首", exact=True).click()
    pg.get_by_role("button", name="开始", exact=True).click()
    ok(until(lambda: len(plays(pg)) >= 1, 20000) is not None, "[snap] one phone: the first snippet plays")
    first = plays(pg)[0]
    ok(first["len"] is not None and 0.9 <= first["len"] <= 1.3, f"[snap] one phone: one second of it ({first['len']})")
    pg.wait_for_timeout(1500)
    ok(pg.locator(".vinyl.is-spinning").count() == 0, "[snap] one phone: the record stops with the snippet")
    shot(pg, "snap-solo-one")
    pg.get_by_role("button", name="多放一点", exact=True).click()
    ok(until(lambda: len(plays(pg)) >= 2, 4000) is not None, "[snap] one phone: more")
    second = plays(pg)[-1]
    ok(second["len"] is not None and 2.8 <= second["len"] <= 3.3 and abs(second["offset"] - first["offset"]) < 0.05, f"[snap] one phone: three seconds, from the same spot ({second['offset']:.2f} s, {second['len']})")
    ok(pg.locator(".stage.is-now strong").inner_text() == "2", "[snap] one phone: now worth 2 points")
    pg.get_by_role("button", name="多放一点", exact=True).click()
    ok(until(lambda: len(plays(pg)) >= 3, 4000) is not None, "[snap] one phone: and the rest")
    third = plays(pg)[-1]
    ok((third["len"] or 0) > 10 and abs(third["offset"] - first["offset"]) < 0.05, f"[snap] one phone: the rest, from the same spot ({third['len']})")
    ok(pg.locator("button", has_text=re.compile("^多放一点$")).count() == 0, "[snap] one phone: nothing more to play after that")
    pg.get_by_role("button", name="揭晓歌名", exact=True).click()
    ok(until(lambda: pg.locator(".sup-ask").count() > 0, 6000) is not None, "[snap] one phone: the reveal")
    ok("+1" in pg.locator(".picker").inner_text(), "[snap] one phone: worth 1 point after the whole thing")
    shot(pg, "snap-solo-reveal")
    errs = errors_of([pg])
    ok(not errs, f"[snap] one phone: no console or page errors {errs[:4]}")
    pg.context.close()

    host, guests = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    for g in everyone:
        g.add_init_script(WATCH_PLAYS)
        g.reload(wait_until="networkidle")
    ok(until(lambda: all(room(g) for g in everyone), 10000) is not None, "[snap] the table is back after the reloads")
    # and a big screen, which plays along
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    tv = phone(browser, "TV")
    tv.set_viewport_size({"width": 1280, "height": 720})
    tv.add_init_script(WATCH_PLAYS)
    tv.goto(BASE + f"tv/{code}", wait_until="networkidle")
    ok(until(lambda: room(tv), 10000) is not None, "[snap] the big screen is at the table")
    tv.keyboard.press("Shift")  # a big screen's sound waits for one click or key
    start_tune(host, everyone)
    host.get_by_role("button", name="一秒猜歌", exact=True).click()
    host.get_by_role("button", name="5 首", exact=True).click()
    ok(until(lambda: view(guests[0])["snap"]), "[snap] one second is on for the table")
    # (a phone schedules a round's snippets all at once: count what each has played before each round)
    ok(until(lambda: bool(view(host)["pre"]), 5000) is not None, "[snap] the first song is picked during the setup, for every phone to load")
    host.wait_for_timeout(2500)
    hearing = everyone + [tv]
    base = [len(plays(g)) for g in hearing]
    host.get_by_role("button", name="放第一首").click()
    hooks = []
    for n in (1, 2, 3):
        ok(until(lambda: view(host)["phase"] == "listen" and view(host)["round"] == n, 20000) is not None, f"[snap] song {n} starts")
        until(lambda: all(len(plays(g)) >= b + 2 for g, b in zip(hearing, base)), 14000)
        v = view(host)
        hooks.append(v["hook"])
        if n == 1:
            shot(tv, "snap-tv-listen")
        for g, b in zip(hearing, base):
            mine = plays(g)[b:]
            ok(len(mine) >= 2, f"[snap] song {n}: {g._name} played the first two snippets ({len(mine)})")
            if len(mine) >= 2:
                ok(all(abs(x["offset"] - v["hook"] / 1000) < 0.06 for x in mine[:2]), f"[snap] song {n}: {g._name} plays from the table's spot ({[round(x['offset'], 2) for x in mine[:2]]} vs {v['hook'] / 1000})")
                ok(0.9 <= (mine[0]["len"] or 0) <= 1.3 and 2.8 <= (mine[1]["len"] or 0) <= 3.3, f"[snap] song {n}: {g._name}: one second, then three ({mine[0]['len']}, {mine[1]['len']})")
        if n == 2:
            shot(guests[0], "snap-online-listen")
        # Mia buzzes and gets it: 2 points (the three-second stage)
        guests[0].locator(".buzz").dispatch_event("pointerdown")
        if until(lambda: view(host)["phase"] == "answer", 3000):
            right = right_choice(view(guests[0]))
            ids = [c["id"] for c in view(guests[0])["choices"]]
            try:
                guests[0].locator(".tn-options .tn-option").nth(ids.index(right) if right in ids else 0).click(timeout=3000)
            except Exception as e:  # noqa: BLE001
                print("  (pick)", str(e)[:100], flush=True)
        ok(until(lambda: view(host)["phase"] == "reveal", 30000) is not None, f"[snap] song {n}: the reveal")
        clear_stamps(everyone)
        host.wait_for_timeout(1500)
        if n == 1:
            shot(tv, "snap-tv-reveal")
        base = [len(plays(g)) for g in hearing]
        try:
            host.locator(".tn button", has_text=re.compile("^(下一首|看结果)$")).first.click(timeout=4000)
        except Exception:
            pass
    ok(any(h != 1000 for h in hooks[1:]), f"[snap] after the first song, the spot is the one the host's phone found ({hooks})")
    errs = errors_of(hearing)
    ok(not errs, f"[snap] the table: no console or page errors {errs[:4]}")
    for g in hearing:
        g.context.close()


def specials(browser):
    """Decades and singer specials: the decade row; a sheet of singers, by language or by name; a game
    of one singer's songs (all four titles theirs, no singer on them); a table where the host picks and
    every phone and the big screen show it."""
    pg = phone(browser, "Steve", players=[{"id": "p0", "name": "Steve"}, {"id": "p1", "name": "Mia"}])
    pg.goto(BASE + "g/name-that-tune/play", wait_until="networkidle")
    pg.get_by_role("button", name="90 年代", exact=True).click()
    ok(pg.get_by_role("button", name="90 年代", exact=True).get_attribute("aria-pressed") == "true", "[specials] one phone: a decade picked")
    shot(pg, "specials-decade")
    pg.get_by_role("button", name="歌手专场", exact=True).click()
    sheet = pg.locator("dialog.ui-sheet[open]")
    ok(until(lambda: sheet.count() > 0, 3000) is not None, "[specials] one phone: the singers' sheet opens")
    pg.wait_for_timeout(500)
    shot(pg, "specials-sheet")
    ok(sheet.locator(".tn-singers .ui-pill").count() >= 20, f"[specials] one phone: Chinese singers to pick from ({sheet.locator('.tn-singers .ui-pill').count()})")
    sheet.locator("input[type=search]").fill("周杰")
    ok(until(lambda: sheet.locator(".tn-singers .ui-pill").count() == 1, 3000), "[specials] one phone: found by name")
    sheet.locator(".tn-singers .ui-pill").first.click()
    ok(until(lambda: pg.locator("dialog.ui-sheet[open]").count() == 0, 3000) is not None, "[specials] one phone: picking one closes the sheet")
    ok("周杰伦" in pg.locator(".tn-pool-singer").inner_text(), "[specials] one phone: 周杰伦 is up")
    pg.get_by_role("button", name="选择题", exact=True).click()
    pg.get_by_role("button", name="5 首", exact=True).click()
    ok(pg.get_by_role("button", name="简单", exact=True).count() == 0, "[specials] one phone: no easy or hard for one singer's titles")
    pg.wait_for_timeout(300)
    shot(pg, "specials-picked")
    pg.get_by_role("button", name="开始", exact=True).click()
    jay = {r[1] for r in ROWS if "周杰伦" in r[2]}
    for n in (1, 2):
        up = until(lambda: pg.locator(".tn-option:not([disabled])").count() == 4, 20000)
        ok(up is not None, f"[specials] one phone: song {n}, four titles")
        titles = [t.strip() for t in pg.locator(".tn-option strong").all_inner_texts()]
        ok(len(titles) == 4 and all(t in jay for t in titles), f"[specials] one phone: song {n}, all four are 周杰伦's ({titles})")
        ok(pg.locator(".tn-option small").count() == 0, f"[specials] one phone: song {n}, no singer under them")
        if n == 1:
            shot(pg, "specials-quiz")
        pg.get_by_role("button", name="揭晓歌名").click()
        ok(until(lambda: "周杰伦" in pg.locator(".song-reveal, .sup-ask").first.inner_text() or pg.locator("text=周杰伦").count() > 0, 6000) is not None, f"[specials] one phone: song {n}, the reveal")
        pg.get_by_role("button", name="没人猜到").click()
    errs = errors_of([pg])
    ok(not errs, f"[specials] one phone: no console or page errors {errs[:4]}")
    pg.context.close()

    host, guests = seat_table(browser, ["Steve", "Mia"])
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    tv = phone(browser, "TV")
    tv.set_viewport_size({"width": 1280, "height": 720})
    tv.goto(BASE + f"tv/{code}", wait_until="networkidle")
    everyone = [host] + guests
    start_tune(host, everyone)
    host.get_by_role("button", name="歌手专场", exact=True).click()
    sheet = host.locator("dialog.ui-sheet[open]")
    until(lambda: sheet.count() > 0, 3000)
    sheet.locator(".tn-singer-langs .ui-pill", has_text="粤语").click()
    pick = sheet.locator(".tn-singers .ui-pill").first
    who = pick.inner_text().split("\n")[0].strip()
    pick.click()
    ok(until(lambda: (view(guests[0]) or {}).get("pool", "").startswith("@"), 5000) is not None, f"[specials] the table: the host picks {who}")
    g = guests[0]
    ok(until(lambda: who in g.locator(".tn-pool-singer").inner_text(), 3000) is not None and g.locator(".tn-pool .seg button[disabled]").count() == 2, "[specials] the table: a guest sees who, and can't change it")
    ok(until(lambda: f"歌手专场：{who}" in tv.locator(".tvt-chips").inner_text(), 5000) is not None, "[specials] the big screen says whose songs")
    shot(tv, "specials-tv-ready")
    shot(g, "specials-guest-setup")
    host.get_by_role("button", name="选择题", exact=True).click()
    host.get_by_role("button", name="20 首", exact=True).click()
    host.get_by_role("button", name="放第一首").click()
    ok(until(lambda: view(g)["phase"] == "listen", 10000) is not None, "[specials] the table: the first song")
    v = view(g)
    theirs = [r for r in ROWS if v["pool"][1:] in [w.strip().lower() for w in re.split(r"\s*(?:,|，|、|&|＆|feat\.?|ft\.|\s[x×]\s|\swith\s)\s*", r[2])]]
    ok(v["total"] == min(20, len(theirs)), f"[specials] the table: as many songs as they have, up to 20 ({v['total']} of {len(theirs)})")
    ok(until(lambda: view(g)["choices"] and all(c["a"] == "" for c in view(g)["choices"]), 8000) is not None, "[specials] the table: no singer on the four titles")
    shot(g, "specials-online-quiz")
    errs = errors_of(everyone + [tv])
    ok(not errs, f"[specials] the table: no console or page errors {errs[:4]}")
    for x in everyone + [tv]:
        x.context.close()


def start_tune(host, everyone):
    tiles = host.locator(".lobby .tile[aria-label^='猜歌名'], .lobby .tile[aria-label^='Name That Tune']")
    if tiles.count():
        tiles.first.click()
    host.wait_for_timeout(500)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(until(lambda g=g: (view(g) or {}).get("id") == "tune") for g in everyone), "[levels] every phone is in Name That Tune")
    host.wait_for_timeout(500)


def levels(browser):
    """Hard titles (dev server): one phone, then a table, multiple choice and buzz-in."""
    pg = phone(browser, "Steve", players=[{"id": "p0", "name": "Steve"}, {"id": "p1", "name": "Mia"}])
    pg.goto(BASE + "g/name-that-tune/play", wait_until="networkidle")
    pg.get_by_role("button", name="选择题", exact=True).click()
    ok(pg.get_by_role("button", name="难", exact=True).count() == 1, "[levels] one phone: easy or hard, once it's multiple choice")
    for hard in (False, True):
        if hard:
            pg.get_by_role("button", name="难", exact=True).click()
        pg.get_by_role("button", name="5 首", exact=True).click()
        pg.get_by_role("button", name="开始", exact=True).click()
        ok(until(lambda: pg.locator(".tn-option:not([disabled])").count() == 4, 20000) is not None, f"[levels] one phone {'hard' if hard else 'easy'}: four titles")
        smalls = pg.locator(".tn-option small").count()
        ok(smalls == (0 if hard else 4), f"[levels] one phone {'hard' if hard else 'easy'}: {'no singer' if hard else 'a singer'} under each title ({smalls})")
        shot(pg, f"levels-solo-{'hard' if hard else 'easy'}")
        pg.get_by_role("button", name="揭晓歌名", exact=True).click()
        ok(until(lambda: pg.locator(".song-reveal, .tune-title, .sup-ask").count() > 0, 6000) is not None, "[levels] one phone: the reveal")
        # back to the setup for the other level: the tally's 再来一局 starts the game afresh
        pg.goto(BASE + "g/name-that-tune/play", wait_until="networkidle")
        if pg.get_by_role("button", name="重新开始").count():
            pg.get_by_role("button", name="重新开始").click()
        pg.get_by_role("button", name="选择题", exact=True).click()
    errs = errors_of([pg])
    ok(not errs, f"[levels] one phone: no console or page errors {errs[:4]}")
    pg.context.close()

    host, guests = seat_table(browser, ["Steve", "Mia", "Jay"])
    everyone = [host] + guests
    start_tune(host, everyone)
    for quiz in (True, False):
        host.get_by_role("button", name="选择题" if quiz else "抢答", exact=True).click()
        host.get_by_role("button", name="难", exact=True).click()
        host.get_by_role("button", name="5 首", exact=True).click()
        ok(until(lambda: view(guests[0])["hard"] and view(guests[0])["quiz"] == quiz), f"[levels] the table: hard {'multiple choice' if quiz else 'buzz-in'} is on for everyone")
        host.get_by_role("button", name="放第一首").click()
        for n in (1, 2):
            ok(until(lambda: view(host)["phase"] == "listen" and view(host)["round"] == n, 15000) is not None, f"[levels] song {n} starts")
            if quiz:
                ok(until(lambda: all(g.locator(".tn-option:not([disabled])").count() == 4 for g in everyone), 15000) is not None, f"[levels] song {n}: four titles on every phone")
            else:
                # the buzzer counts once the song is playing (the record spins)
                ok(until(lambda: guests[0].locator(".buzz:not([disabled])").count() == 1 and guests[0].locator(".vinyl.is-spinning").count() > 0, 15000) is not None, f"[levels] song {n}: the song plays, the buzzer is live")
                for _ in range(3):
                    guests[0].locator(".buzz").dispatch_event("pointerdown")
                    if until(lambda: view(host)["phase"] == "answer", 2500):
                        break
                ok(until(lambda: view(host)["phase"] == "answer" and guests[0].locator(".tn-options .tn-option:not([disabled])").count() == 4, 8000) is not None, f"[levels] song {n}: Mia buzzed and has four titles")
            v = view(guests[0])
            ok(v["choices"] and all(c["a"] == "" and c["ae"] == "" for c in v["choices"]), f"[levels] song {n}: the table is sent titles only")
            ok(all(g.locator(".tn-option small").count() == 0 for g in everyone), f"[levels] song {n}: no singer under any title, on any phone")
            if n == 1:
                shot(guests[0], f"levels-online-{'quiz' if quiz else 'buzz'}")
            right = right_choice(v)
            ids = [c["id"] for c in v["choices"]]
            pickers = everyone if quiz else [guests[0]]
            for g in pickers:
                try:
                    g.locator(".tn-option:not([disabled])" if quiz else ".tn-options .tn-option").nth(ids.index(right) if right in ids else 0).click(timeout=3000)
                except Exception as e:  # noqa: BLE001
                    print("  (pick)", g._name, str(e)[:120], flush=True)
            ok(until(lambda: view(host)["phase"] == "reveal", 25000) is not None, f"[levels] song {n}: the reveal")
            ok(bool((view(host).get("song") or {}).get("a")), f"[levels] song {n}: the reveal names the singer")
            clear_stamps(everyone)
            host.wait_for_timeout(600)
            try:
                host.locator(".tn button", has_text=re.compile("^(下一首|看结果)$")).first.click(timeout=4000)
            except Exception:
                pass
        # the rest of the five: the host reveals each one at once, then on to the final scores
        for _ in range(40):
            ph = view(host)["phase"]
            if ph == "end":
                break
            clear_stamps(everyone)
            try:
                if ph == "listen":
                    host.locator(".tn button", has_text=re.compile("^揭晓答案$")).first.click(timeout=3000)
                elif ph == "reveal":
                    host.locator(".tn button", has_text=re.compile("^(下一首|看结果)$")).first.click(timeout=3000)
            except Exception:
                pass
            host.wait_for_timeout(700)
        ok(until(lambda: view(host)["phase"] == "end", 15000) is not None, "[levels] the final scores")
        clear_stamps(everyone)
        host.wait_for_timeout(1500)
        clear_stamps(everyone)
        host.get_by_role("button", name="再来一局").click()
        ok(until(lambda: view(host)["phase"] == "ready"), "[levels] back to the setup")
    errs = errors_of(everyone)
    ok(not errs, f"[levels] the table: no console or page errors {errs[:4]}")
    for p in everyone:
        p.context.close()


def main():
    print(f"{BASE}  rounds {ROUNDS}  out {OUT}", flush=True)
    with sync_playwright() as p:
        if "solo" in ONLY:
            for mode in ("songs", "melody"):
                b = browser_of(p)
                solo(b, mode)
                b.close()
        if "online" in ONLY:
            b = browser_of(p)
            # the dev server shares the room with the page (window.__room); a production build doesn't
            probe = b.new_page()
            probe.goto(BASE, wait_until="domcontentloaded")
            dev = probe.evaluate("() => !!document.querySelector('script[src*=\"@vite/client\"]')")
            probe.close()
            (online if dev else online_screen)(b)
            b.close()
        if "stress" in ONLY:
            b = browser_of(p)
            stress(b)
            b.close()
        if "levels" in ONLY:
            b = browser_of(p)
            levels(b)
            b.close()
        if "snap" in ONLY:
            b = browser_of(p)
            snap(b)
            b.close()
        if "specials" in ONLY:
            b = browser_of(p)
            specials(b)
            b.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
