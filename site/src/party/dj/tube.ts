/**
 * 打碟 · DJ Booth: the big screen's YouTube player for 真歌时间 (Steve on Nov 2: whole real songs, in
 * YouTube's own player, never downloaded or mixed). One player for the page, made the first time a
 * song from YouTube is up next and kept for the night. While the DJ plays, the song up next is
 * loaded in it, in sight in a corner of the TV, and its start buffered (played muted until its own
 * picture moves, then held at 0:00 with its sound back on), so that on the drop's bar it starts at
 * once (Steve on Nov 4: the video took seconds to load after the drop, and the two didn't meet).
 *
 * What a browser allows decides the rest. Chrome lets a video start with sound once the page has
 * had a tap (the speaker's start tap). Safari, and every browser on an iPhone or iPad, wants one tap
 * on the video itself first; after that the same player can start songs by itself all night. Until
 * a song is heard, the DJ plays on: a song that can't start by itself asks for a tap instead of
 * leaving the room silent. TubePlayer.tsx shows it and tells the speaker when to give way.
 *
 * The player's calls are messages to another page and answer late, so this doesn't trust them: it
 * looks at the player every tenth of a second and moves on from what it sees.
 */

/** The player as YouTube's IFrame API makes it (the parts used here). */
export type YtPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  cueVideoById(id: string): void;
  loadVideoById(id: string): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  destroy(): void;
};
type YtEvents = {
  onReady?: (e: { target: YtPlayer }) => void;
  onStateChange?: (e: { data: number }) => void;
  onError?: (e: { data: number }) => void;
  onAutoplayBlocked?: () => void;
};
type YtApi = {
  Player: new (el: HTMLElement, o: { host: string; videoId: string; width: string; height: string; playerVars: Record<string, number | string>; events: YtEvents }) => YtPlayer;
};

/** The player's states. */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;

let api: Promise<YtApi> | null = null;
/** YouTube's IFrame API, loaded once: early, as soon as a song from YouTube is asked for. */
export function loadYt(): Promise<YtApi> {
  const w = window as unknown as { YT?: YtApi & { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
  api ??= new Promise<YtApi>((ok, no) => {
    if (w.YT?.Player) return ok(w.YT);
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      ok(w.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      api = null;
      no(new Error("YouTube's player didn't load"));
    };
    document.head.appendChild(s);
  });
  return api;
}

/**
 * Safari, or any browser on an iPhone or iPad: a video with sound starts only from a tap on it (the
 * first time; the same player can start later ones by itself).
 */
export function tapFirst(): boolean {
  const w = window as unknown as { __tubeTapFirst?: boolean };
  if (typeof w.__tubeTapFirst === "boolean") return w.__tubeTapFirst;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)\//.test(ua);
  return ios || safari;
}

/** YouTube's errors that mean this video won't play here whatever we do: a bad id (2), removed or
 *  private (100), its owner doesn't allow it outside YouTube (101, 150). */
const FOR_GOOD = new Set([2, 100, 101, 150]);

/** What the player is doing, for the screen. */
export type TubeStatus =
  /** nothing to do */
  | "idle"
  /** YouTube's player is still being made */
  | "loading"
  /** loading its start (played muted, out of earshot) */
  | "buffering"
  /** YouTube plays an ad first (muted while the DJ plays) */
  | "ad"
  /** held at its start with its sound on: it starts at once */
  | "ready"
  /** asked to play, not heard yet */
  | "starting"
  /** the song is heard */
  | "playing"
  /** the browser wants a tap on the video before it plays with sound */
  | "tap"
  /** YouTube couldn't be reached; this is retriable and doesn't ban the video. */
  | "offline"
  /** YouTube won't play this video here */
  | "bad";

type Step =
  | "none"
  /** the video asked for: wait till the player has it */
  | "cue"
  /** playing muted till its own picture moves (an ad may come first) */
  | "buffer"
  /** paused and back at its start: wait till the player says so */
  | "hold"
  /** buffered at its start, paused, sound on */
  | "ready"
  /** the song's moment is coming (a timer) */
  | "wait"
  /** a drop may come into it (nobody's pressed in time yet): playing muted from just before the bar */
  | "roll"
  /** the word came while it rolled: its sound comes on on the bar (a timer) */
  | "rolled"
  /** asked to play (with sound, or muted till its own picture moves: from cold) */
  | "start"
  /** playing with sound */
  | "on"
  /** the browser wants a tap */
  | "tap";

type Hooks = {
  /** the server's clock, ms */
  now(): number;
  /** what it's doing, and whether a song may start by itself (Safari's one tap done) */
  status(s: TubeStatus, armed: boolean): void;
  /** a start is set for `when` (performance.now() time), the video ready and allowed to start by
   *  itself: the DJ lets go then, on the drop's bar (said again if the moment moves) */
  timed(video: string, when: number): void;
  /** the song is heard (playing, with sound): the DJ gives way now if it hasn't already */
  playing(video: string): void;
  /** it couldn't start by itself (the browser wants a tap on the video): the DJ plays on */
  blocked(video: string): void;
  ended(video: string): void;
  /** YouTube won't play it here */
  bad(video: string): void;
};

/** How long a ready video takes to play once asked, at first (then learned: the middle of the last
 *  few), and the most it's taken to be. */
const LEAD_MS = 200;
const LEAD_MAX = 900;
/**
 * A ready video starts rolling (muted) this much more ahead of its moment than it takes to play, so
 * it's surely playing by then; its sound comes on on the moment (a tenth of a second or so of the
 * song's very start goes by unheard). How fast a video starts varies; turning its sound on doesn't.
 */
const ROLL_MS = 120;

export class Tube {
  status: TubeStatus = "idle";
  /** a video has played with sound here, or this browser lets one start after the speaker's start tap */
  armed: boolean;
  /** someone tapped the video while it was held ready (Safari's one tap): it can start by itself now */
  tapped = false;
  /** how long a ready video takes to play once asked, ms (the middle of the last few starts) */
  lead = LEAD_MS;
  private took: number[] = [];
  /** when it was last asked to play (to learn how long that takes), 0 once learned */
  private askedAt = 0;
  private p: YtPlayer | null = null;
  private slot: HTMLElement | null = null;
  private making = false;
  /** the player has said it's ready */
  private live = false;
  /** the video in the player (or asked for) */
  private video = "";
  private step: Step = "none";
  /** when the step began (performance.now()) */
  private stepAt = 0;
  /** a song's moment: when it should be heard (performance.now()); and whether a song is going */
  private goAt = 0;
  private going = false;
  /** from cold: playing muted till its own picture moves (past any ad), then from its start with sound */
  private quiet = false;
  /** seconds into the song to pick up from (a page opened again mid-song) */
  private from = 0;
  /** playing with no time passing since (an ad, or a slow start) */
  private stillAt = 0;
  /** when a mute was first seen on a song meant to be heard */
  private mutedAt = 0;
  private blockedSaid = false;
  private timer = 0;
  private tick = 0;
  private broken = new Set<string>();
  private retried = new Set<string>();
  private gone = false;

  constructor(private h: Hooks) {
    this.armed = !tapFirst();
  }

  /** Where the player goes on the screen (it's made there the first time it's needed). */
  attach(el: HTMLElement) {
    this.slot = el;
  }

  isBad(video: string) {
    return this.broken.has(video);
  }

  /**
   * A drop is on its way into this song but nobody has pressed in time yet (a press reaches the TV
   * a moment before the bar, often too late to start a video then): a ready video starts rolling,
   * muted, just before the bar, so that when the word comes its sound comes on right on the bar.
   * No word by a moment after the bar (nobody pressed: the DJ counts down again), it goes back to
   * its start, ready.
   */
  expect(video: string, at: number, when = performance.now() - (this.h.now() - at)) {
    if (this.gone || this.going || !this.armed || this.video !== video || this.step !== "ready") return;
    this.goAt = when;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const p = this.p;
      if (this.gone || !p || this.going || this.step !== "ready" || this.video !== video) return;
      p.mute();
      p.playVideo();
      this.askedAt = performance.now();
      this.to("roll", "ready");
    }, Math.max(0, when - this.lead - ROLL_MS - performance.now()));
  }

  /** Get the song up next ready (null: nothing up next). Not while a song is going. */
  prepare(video: string | null) {
    if (this.gone || this.going) return;
    if (!video) {
      // (one held ready stays held, paused at its start: nothing plays, and it may be asked for again)
      if (this.step === "ready" || this.step === "hold" || this.step === "roll") return;
      if (this.step === "cue" || this.step === "buffer") this.p?.pauseVideo();
      this.to("none", this.status === "bad" ? "bad" : "idle");
      return;
    }
    if (this.broken.has(video)) {
      this.video = video;
      return this.to("none", "bad");
    }
    if (this.video === video && (this.step === "cue" || this.step === "buffer" || this.step === "hold" || this.step === "ready" || this.step === "roll")) return;
    this.video = video;
    this.tapped = false;
    if (!this.p || !this.live) return this.make(video, "cue");
    this.p.cueVideoById(video);
    this.to("cue", "buffering");
  }

  /**
   * The song plays from server time `at` (now, if that has passed; a page opened mid-song picks it
   * up where the room is). Asked again for the same video, only its moment moves (until it starts).
   */
  play(video: string, at: number, when = performance.now() - (this.h.now() - at)) {
    if (this.gone) return;
    const late = this.h.now() - at;
    if (this.going && this.video === video) {
      // the drop's time corrected before it lands: the start moves with it (once it's started, the
      // room's word that it landed changes nothing)
      if (this.step === "wait") this.schedule(when);
      else if (this.step === "cue" || this.step === "buffer" || this.step === "hold") this.goAt = when;
      return;
    }
    window.clearTimeout(this.timer);
    // (the bar a rolling video was started for, before this song's moment takes its place)
    const rolledFor = this.goAt;
    this.going = true;
    this.goAt = when;
    this.blockedSaid = false;
    this.from = late > 3000 ? late / 1000 : 0;
    if (this.broken.has(video)) {
      this.video = video;
      this.to("none", "bad");
      this.h.bad(video);
      return;
    }
    if (this.video === video && this.p && this.live) {
      // ready: on its moment; rolling (muted, the bar near): its sound on the bar; still loading its
      // start: it goes once it can (the DJ plays on till then)
      if (this.step === "ready") return this.schedule(when);
      if (this.step === "roll") {
        if (Math.abs(when - rolledFor) < 1000) return this.sound(when);
        // (rolled for a drop that didn't come, and this is the next one: back to its start first)
        this.p.pauseVideo();
        this.p.seekTo(0, true);
        this.to("hold", "ready");
        return;
      }
      if (this.step === "cue" || this.step === "buffer" || this.step === "hold") return;
    }
    // not got ready (a page opened mid-song, a song that came on another way): from cold, muted
    // till its own picture moves (an ad first plays out of earshot while the DJ plays on)
    this.video = video;
    this.quiet = true;
    if (!this.p || !this.live) return this.make(video, "start");
    this.p.mute();
    this.p.loadVideoById(video);
    this.to("start", "starting");
  }

  /** The song is over, skipped, or isn't coming after all: quiet, ready for the next. */
  stop() {
    window.clearTimeout(this.timer);
    const was = this.going;
    this.going = false;
    this.quiet = false;
    if (!was && this.step !== "on" && this.step !== "start" && this.step !== "tap" && this.step !== "wait" && this.step !== "rolled") return;
    this.p?.pauseVideo();
    this.to("none", "idle");
  }

  dispose() {
    this.gone = true;
    window.clearTimeout(this.timer);
    window.clearInterval(this.tick);
    try {
      this.p?.destroy();
    } catch {
      /* already gone */
    }
    this.p = null;
  }

  /* ------------------------------------------------------------------ inside */

  /** what it did, for the checks (scripts/dj_youtube_check.py): when, the step, the status */
  readonly log: [number, string, string][] = [];

  private to(step: Step, status?: TubeStatus) {
    if (step !== this.step || (status && status !== this.status)) {
      this.log.push([Math.round(performance.now()), step, status ?? this.status]);
      if (this.log.length > 80) this.log.splice(0, 40);
    }
    this.step = step;
    this.stepAt = performance.now();
    this.stillAt = 0;
    this.mutedAt = 0;
    if (status && status !== this.status) {
      this.status = status;
      this.h.status(status, this.armed);
    }
    // watch the player while there's something to watch for
    const watch = step !== "none" && step !== "wait";
    if (watch && !this.tick) this.tick = window.setInterval(() => this.look(), 100);
    else if (!watch && this.tick) {
      window.clearInterval(this.tick);
      this.tick = 0;
    }
  }

  private say(status: TubeStatus) {
    if (status === this.status) return;
    this.status = status;
    this.h.status(status, this.armed);
  }

  /** The player, made once with its first video (`then`: what to do with it once it's ready). */
  private make(video: string, then: "cue" | "start") {
    this.to(then, "loading");
    if (this.p || this.making || !this.slot) return;
    this.making = true;
    const el = document.createElement("div");
    this.slot.appendChild(el);
    void loadYt().then(
      (YT) => {
        if (this.gone) return;
        this.p = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com",
          videoId: video,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => this.ready(),
            onStateChange: (e) => {
              if (e.data === ENDED) this.look();
            },
            onError: (e) => this.failed(e.data),
            onAutoplayBlocked: () => {
              if (this.step === "start") this.blocked();
            },
          },
        });
      },
      () => {
        // YouTube's player didn't load (offline, blocked): nothing will play here
        this.making = false;
        el.remove();
        if (this.video) this.to("none", "offline");
      },
    );
  }

  private ready() {
    if (this.gone || !this.p) return;
    this.live = true;
    const p = this.p;
    // made with its first video; carry on with whatever's wanted now
    if (this.going) {
      p.mute();
      p.loadVideoById(this.video);
      this.quiet = true;
      this.to("start", "starting");
      return;
    }
    if (this.video) {
      p.cueVideoById(this.video);
      this.to("cue", "buffering");
    }
  }

  private failed(code: number) {
    const v = this.video;
    if (!v) return;
    if (!FOR_GOOD.has(code) && !this.retried.has(v)) {
      // (a hiccup in the player: once more)
      this.retried.add(v);
      window.setTimeout(() => {
        if (this.gone || this.video !== v || !this.p) return;
        if (this.going) {
          this.quiet = true;
          this.p.mute();
          this.p.loadVideoById(v);
          this.to("start", "starting");
        } else {
          this.p.cueVideoById(v);
          this.to("cue", "buffering");
        }
      }, 1500);
      return;
    }
    window.clearTimeout(this.timer);
    if (!FOR_GOOD.has(code)) {
      this.to("none", "offline");
      return;
    }
    this.broken.add(v);
    this.to("none", "bad");
    this.h.bad(v);
  }

  /** Retry a connection failure without marking a playable video as forbidden. */
  retry() {
    if (this.gone || this.status !== "offline" || !this.video) return;
    this.retried.delete(this.video);
    if (!this.p || !this.live) return this.make(this.video, this.going ? "start" : "cue");
    if (this.going) {
      this.quiet = true;
      this.p.mute();
      this.p.loadVideoById(this.video);
      this.to("start", "starting");
    } else {
      this.p.cueVideoById(this.video);
      this.to("cue", "buffering");
    }
  }

  /** The song's moment: ask the ready video to play a little before it, by what starts have taken. */
  private schedule(when: number) {
    window.clearTimeout(this.timer);
    this.goAt = when;
    this.to("wait", "ready");
    // allowed to start by itself: it rolls in muted just ahead, its sound on on the moment; else it's
    // asked to play with sound then (and the browser will likely want a tap)
    const ahead = this.armed ? this.lead + ROLL_MS : this.lead;
    this.timer = window.setTimeout(() => (this.armed ? this.rollIn() : this.start()), Math.max(0, when - ahead - performance.now()));
    this.note(`start set, ${Math.round(when - performance.now())} ms off, it takes ${Math.round(this.lead)}`);
    if (this.armed) this.h.timed(this.video, when);
  }

  /** On its way to its moment: playing muted, its sound on on the moment. */
  private rollIn() {
    const p = this.p;
    if (this.gone || !p || !this.going) return;
    p.mute();
    p.playVideo();
    this.askedAt = performance.now();
    this.sound(this.goAt, false);
  }

  /** How long it took to play once asked: the next starts ask that much ahead (the middle of the last few). */
  private learn(t: number, now: number) {
    if (!this.askedAt) return;
    const took = now - t * 1000 - this.askedAt;
    this.askedAt = 0;
    if (!(took > 0 && took < 2000)) return;
    this.took = [...this.took.slice(-4), took];
    const sorted = [...this.took].sort((a, b) => a - b);
    this.lead = Math.min(LEAD_MAX, sorted[Math.floor(sorted.length / 2)]);
    this.note(`took ${Math.round(took)} ms to play, asks ${Math.round(this.lead)} ms ahead now`);
  }

  private note(what: string) {
    this.log.push([Math.round(performance.now()), "·", what]);
    if (this.log.length > 80) this.log.splice(0, 40);
  }

  /** Rolling: its sound on the moment (it's playing already: that's at once). */
  private sound(when: number, say = true) {
    window.clearTimeout(this.timer);
    this.goAt = when;
    this.to("rolled", "starting");
    this.note(`sound set, ${Math.round(when - performance.now())} ms off`);
    if (say && this.armed) this.h.timed(this.video, when);
    this.timer = window.setTimeout(() => {
      const p = this.p;
      if (this.gone || !p || !this.going) return;
      p.unMute();
      p.setVolume(100);
      this.to("start", "starting");
    }, Math.max(0, when - 15 - performance.now()));
  }

  private start() {
    const p = this.p;
    if (this.gone || !p || !this.going) return;
    p.unMute();
    p.setVolume(100);
    p.playVideo();
    this.askedAt = performance.now();
    this.quiet = false;
    this.to("start", "starting");
  }

  /** It can't start by itself: hold it at the start with its sound on, and ask for a tap. */
  private blocked() {
    const p = this.p;
    if (!p || this.step === "tap") return;
    this.armed = false;
    this.quiet = false;
    p.pauseVideo();
    p.unMute();
    this.to("tap", "tap");
    if (!this.blockedSaid) {
      this.blockedSaid = true;
      this.h.blocked(this.video);
    }
  }

  /** The song is heard. */
  private heard(t: number, now: number) {
    this.learn(t, now);
    this.note(`heard ${Math.round(now - t * 1000 - this.goAt)} ms off its moment`);
    this.armed = true;
    this.to("on", "playing");
    this.h.playing(this.video);
  }

  /** Every tenth of a second: what the player is doing, and what to do about it. */
  private look() {
    const p = this.p;
    if (this.gone || !p || !this.live) return;
    let st: number;
    let t: number;
    let muted: boolean;
    try {
      st = p.getPlayerState();
      t = p.getCurrentTime() || 0;
      muted = p.isMuted();
    } catch {
      return;
    }
    const now = performance.now();
    const age = now - this.stepAt;
    switch (this.step) {
      case "cue": {
        // it has the video: play it muted to load its start (out of earshot, in sight in its corner)
        if (st === CUED || st === PAUSED || age > 900) {
          p.mute();
          p.playVideo();
          this.to("buffer", "buffering");
        }
        return;
      }
      case "buffer": {
        if (st === PLAYING && t >= 0.2) {
          // its own picture moves: its start is loaded
          if (this.going && now >= this.goAt - this.lead) {
            // (its moment came while it loaded: from its start, with sound, now; the DJ waits to hear it)
            p.seekTo(0, true);
            p.unMute();
            p.setVolume(100);
            this.to("start", "starting");
            return;
          }
          p.pauseVideo();
          p.seekTo(0, true);
          this.to("hold", "buffering");
          return;
        }
        if (st === PLAYING && t < 0.05) {
          // playing, but not the song: YouTube's ad first (left to play, muted, in its corner)
          if (!this.stillAt) this.stillAt = now;
          else if (now - this.stillAt > 1500) this.say("ad");
          return;
        }
        // it wouldn't even play muted, or takes too long: from cold when its moment comes
        if ((age > 5000 && st !== PLAYING && st !== BUFFERING) || age > 60_000) {
          p.pauseVideo();
          p.unMute();
          this.to("none", "idle");
          if (this.going) {
            this.going = false;
            this.play(this.video, this.h.now());
          }
        }
        return;
      }
      case "hold": {
        const held = (st === PAUSED || st === CUED) && t < 0.5;
        if (held || age > 3000) {
          if (!held) {
            p.pauseVideo();
            p.seekTo(0, true);
          }
          // held at its start, its sound back on: a tap or its moment plays it heard
          p.unMute();
          if (this.going) this.schedule(this.goAt);
          else this.to("ready", "ready");
        }
        return;
      }
      case "roll": {
        // how long a ready video takes to play, for the next start (its first moving moment)
        if (st === PLAYING && t >= 0.03 && t < 3) this.learn(t, now);
        // no word by a moment after the bar: back to its start, ready for the next countdown
        if (now > this.goAt + 700) {
          p.pauseVideo();
          p.seekTo(0, true);
          this.to("hold", "ready");
        }
        return;
      }
      case "rolled": {
        if (st === PLAYING && t >= 0.03 && t < 3) this.learn(t, now);
        // (it stopped before its sound came on: start it again, with sound, now)
        if (st !== PLAYING && st !== BUFFERING && age > 600) {
          window.clearTimeout(this.timer);
          p.unMute();
          p.playVideo();
          this.to("start", "starting");
        }
        return;
      }
      case "ready": {
        // someone tapped the video in its corner (Safari's one tap): it may start by itself from now
        if (st === PLAYING) {
          this.armed = true;
          this.tapped = true;
          p.pauseVideo();
          p.seekTo(0, true);
          this.to("hold", "ready");
          this.h.status("ready", true);
        }
        return;
      }
      case "start":
      case "tap": {
        if (st === ENDED && age > 1500) {
          this.going = false;
          this.to("none", "idle");
          this.h.ended(this.video);
          return;
        }
        if (st === PLAYING && t < 0.05) {
          // playing, no time passing yet: its first moment, or an ad (out of earshot when from cold)
          if (this.step === "start") {
            if (!this.stillAt) this.stillAt = now;
            else if (now - this.stillAt > 1500) this.say("ad");
          }
          return;
        }
        if (st === PLAYING) {
          if (this.quiet) {
            // its own picture moves: from its start (or where the room is), with sound
            this.quiet = false;
            p.seekTo(this.from, true);
            p.unMute();
            p.setVolume(100);
            this.from = 0;
            this.to("start", "starting");
            return;
          }
          if (muted) {
            // the browser started it without its sound: once more, then it needs a tap
            p.unMute();
            if (!this.mutedAt) this.mutedAt = now;
            else if (now - this.mutedAt > 700) this.blocked();
            return;
          }
          this.heard(t, now);
          return;
        }
        // asked, and nothing: the browser won't start it by itself (a slow network gets longer)
        if (this.step === "start" && ((age > 2500 && st !== BUFFERING) || age > 20_000)) this.blocked();
        return;
      }
      case "on": {
        if (st === ENDED) {
          this.going = false;
          this.to("none", "idle");
          this.h.ended(this.video);
        }
        return;
      }
    }
  }
}
