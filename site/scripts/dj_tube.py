"""打碟 · DJ Booth: what the checks with a whole song from YouTube share (dj_youtube_check.py,
dj_floor3d_check.py, dj_player_check.py, dj_shared_check.py): YouTube's player, standing in, the
phones' player, and a song coming on by itself."""
import os, sys

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


def key(ph, n):
    """A phone's player (Steve on Nov 12): 0 上一曲, 1 暂停 or 播放, 2 切歌."""
    return ph.locator(".djk-player-keys .djk-key").nth(n)


def hold(tv, ph):
    """暂停 from a phone: the room holds its music (a song up next waits, ready, in the TV's corner)."""
    key(ph, 1).click()
    ok(until(lambda: deck(tv).get("paused", 0) > 0, 4000), "(held: nothing comes up next)")


def carry_on(tv, ph):
    """播放 from a phone, after `hold`."""
    key(ph, 1).click()
    ok(until(lambda: deck(tv).get("paused", 1) == 0, 4000), "(播放: it carries on)")


def drop_into(tv, phones, who, whole=True, press=None):
    """The song up next is `who`'s: the room switches into it by itself (点歌模式, the booth's only way
    since Nov 12: nothing to build up or press). A room held (`hold`) carries on first, from
    `press`'s phone or the first. Whole: the room says the whole song plays."""
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") == who or (deck(tv).get("song") or {}).get("by") == who, 6000), "up next")
    if deck(tv).get("paused"):
        carry_on(tv, press or phones[0])
    if whole:
        ok(until(lambda: (deck(tv).get("song") or {}).get("by") == who, 60000, 50), "it comes on by itself: the whole song's time")
    else:
        landed = until(lambda: (deck(tv).get("now") or {}).get("by") == who and not deck(tv).get("drop"), 60000, 50)
        if not landed:
            dk = deck(tv)
            print("   (the deck:", {k: dk.get(k) for k in ("a", "b", "fader", "up", "now", "drop", "last", "sounding")}, ")")
        ok(landed, "it lands")
