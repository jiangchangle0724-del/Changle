"""打碟 · DJ Booth: what the checks with a whole song from YouTube share (dj_youtube_check.py,
dj_floor3d_check.py): YouTube's player, standing in, and a song brought down on its drop."""
import os, sys, time

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, view  # noqa: E402

# YouTube's IFrame API, standing in: a player that loads, buffers a video's start the first time,
# plays an ad first (__ytConf.ads), errors on a video it won't play (__ytConf.bad), and with
# __ytConf.sound false wants a tap on the video before it plays with sound (muted is fine)
FAKE_YT = r"""(() => {
const C = (window.__ytConf = Object.assign({ readyMs: 500, bufferMs: 900, againMs: 180, ads: {}, bad: {}, sound: true }, window.__ytConf || {}));
window.YT = { Player: function (el, o) {
  const f = document.createElement('iframe'); f.className = 'fake-yt'; f.title = 'YouTube';
  f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#14223a';
  el.replaceWith(f);
  const ev = o.events || {};
  const S = (window.__yt = { video: o.videoId, state: -1, t: 0, muted: false, activated: false, loaded: {}, adLeft: Object.assign({}, C.ads), heard: [], log: [] });
  let tick = 0, pend = 0, last = 0;
  const note = (k, x) => S.log.push([Math.round(performance.now()), k, x]);
  const set = (st) => { if (S.state === st) return; S.state = st; note('state', st); if (ev.onStateChange) ev.onStateChange({ data: st }); };
  const halt = () => { clearInterval(tick); tick = 0; clearTimeout(pend); pend = 0; };
  const inAd = () => S.adLeft[S.video] > 0;
  const heard = () => { const sp = window.__fakeDj && window.__fakeDj.speaker; S.heard.push({ video: S.video, at: performance.now(), ctx: sp ? sp.heardTime() : null }); note('heard', S.video); };
  const run = () => {
    last = performance.now();
    tick = setInterval(() => {
      const now = performance.now(); const dt = (now - last) / 1000; last = now;
      if (inAd()) { S.adLeft[S.video] -= dt * 1000; if (!inAd()) { note('ad over', S.video); if (!S.muted) heard(); } return; }
      S.t += dt;
    }, 20);
  };
  const play = (byUser) => {
    if (C.bad[S.video]) { setTimeout(() => ev.onError && ev.onError({ data: C.bad[S.video] }), 150); return; }
    if (!S.muted && !C.sound && !S.activated && !byUser) { note('blocked', S.video); if (ev.onAutoplayBlocked) ev.onAutoplayBlocked(); return; }
    if (byUser) S.activated = true;
    if (S.state === 1) return;
    halt(); set(3);
    pend = setTimeout(() => {
      pend = 0; S.loaded[S.video] = true;
      // (its sound came on while it was getting going, with no tap: the browser won't have it)
      if (!S.muted && !C.sound && !S.activated) { set(2); note('paused by the browser', S.video); return; }
      set(1); if (!S.muted && !inAd()) heard(); run();
    }, S.loaded[S.video] ? C.againMs : C.bufferMs);
  };
  this.playVideo = () => { note('playVideo', S.muted ? 'muted' : 'sound'); play(false); };
  this.pauseVideo = () => { note('pauseVideo', ''); halt(); if (S.state === 1 || S.state === 3) set(2); };
  this.seekTo = (s) => { note('seekTo', s); S.t = s; };
  this.mute = () => { S.muted = true; };
  this.unMute = () => {
    if (!S.muted) return;
    S.muted = false;
    // like Safari: a video playing muted pauses when its sound comes on with no tap
    if (S.state === 1 && !C.sound && !S.activated) { halt(); set(2); note('paused by the browser', S.video); return; }
    if (S.state === 1 && !inAd()) heard();
  };
  this.isMuted = () => S.muted;
  this.setVolume = () => {};
  this.cueVideoById = (id) => { halt(); S.video = id; S.t = 0; set(-1); setTimeout(() => set(5), 80); };
  this.loadVideoById = (id) => { this.cueVideoById(id); setTimeout(() => play(false), 100); };
  this.getPlayerState = () => S.state;
  this.getCurrentTime = () => (inAd() ? 0 : S.t);
  this.destroy = () => { halt(); f.remove(); window.__yt = null; };
  S.end = () => { halt(); set(0); };
  S.userTap = () => play(true);
  const me = this;
  setTimeout(() => ev.onReady && ev.onReady({ target: me }), C.readyMs);
} };
if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();"""


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def press_drop(ph):
    """DROP on the cue, as a quick thumb would."""
    if until(lambda: ph.locator(".djk-drop.is-now").count() > 0, 30000, 15):
        ph.locator(".djk-drop").dispatch_event("pointerdown")
        return True
    return False


def drop_into(tv, phones, who, whole=True, press=None):
    """The song up next is `who`'s: the speaker cues its deck, the table builds up and drops into it
    (`press`: that phone presses DROP on the cue; else the DJ drops it after a countdown nobody
    pressed). Whole: the room says the whole song plays. (A deck still changing when the build-up
    fills keeps the drop on the deck that's on, as it should: the table builds up again.)"""
    side = "b" if deck(tv).get("fader", 0) <= 0.5 else "a"
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") == who, 6000), "up next")
    ok(until(lambda: bool((deck(tv).get("sounding") or {}).get(side)) and (deck(tv).get("sounding") or {}).get(side) == deck(tv).get(side), 40000, 250), f"the speaker plays it on deck {side.upper()}")
    into = False
    for _ in range(4):
        end = time.time() + 30
        while time.time() < end and not deck(tv).get("drop"):
            for ph in phones:
                ph.evaluate("() => { const b = document.querySelector('.djk-charge'); if (b) for (let i = 0; i < 3; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }")
            phones[0].wait_for_timeout(150)
        dr = deck(tv).get("drop") or {}
        if dr.get("to") == side:
            into = True
            break
        # (into the deck that's on: let it land, wait for the deck to settle, build up again)
        until(lambda: not deck(tv).get("drop"), 30000, 200)
        until(lambda: (deck(tv).get("sounding") or {}).get(side) == deck(tv).get(side), 30000, 250)
    ok(into, "the table builds it up, into its deck")
    if press is not None:
        ok(press_drop(press), "DROP pressed on the cue")
    if whole:
        ok(until(lambda: (deck(tv).get("song") or {}).get("by") == who, 60000, 50), "it lands (the table's drop or the DJ's): the whole song's time")
    else:
        landed = until(lambda: (deck(tv).get("now") or {}).get("by") == who and not deck(tv).get("drop"), 60000, 50)
        if not landed:
            dk = deck(tv)
            print("   (the deck:", {k: dk.get(k) for k in ("a", "b", "fader", "up", "now", "drop", "last", "sounding")}, ")")
        ok(landed, "it lands")
