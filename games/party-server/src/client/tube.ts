// The TV's YouTube player for 一起跳's songs. The song plays in YouTube's own player, in sight on the
// TV the whole time (YouTube's rules: never hidden, never covered, never downloaded), the same way
// 打碟 · DJ Booth plays guests' songs (site/src/party/dj/tube.ts, whose lessons this follows):
//   - the video is loaded and its start buffered ahead, muted (an ad may play first, muted too),
//     then held at 0:00 with its sound on, so it starts at once when the dance's moment comes;
//   - Safari, and any browser on an iPhone or iPad, plays a video with sound only after a tap on the
//     video itself (the first time): the TV asks for it;
//   - the player's answers come late (it's another page), so this looks at it every few
//     milliseconds and goes by what it sees.
// While the song plays, it measures when the video's 0:00 was on the speaker's clock (each look:
// the speaker's time minus the video's; the smallest of the last few seconds is the freshest), so
// the room can move the dance's beat to where the song's really is (protocol.ts's songAt).
import { pageClock } from "./common";

type YtPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  cueVideoById(id: string): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};
type YtApi = {
  Player: new (
    el: HTMLElement,
    o: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void; onAutoplayBlocked?: () => void };
    },
  ) => YtPlayer;
};

const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;
/** YouTube's errors that mean this video won't play here: a bad id, removed or private, not allowed outside YouTube. */
const FOR_GOOD = new Set([2, 100, 101, 150]);

let api: Promise<YtApi> | null = null;
/** YouTube's IFrame API, loaded once. */
function loadYt(): Promise<YtApi> {
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
 * Safari, or any browser on an iPhone or iPad: a video with sound starts only from a tap on the
 * video itself, the first time (then the same player starts later ones by itself).
 */
export function tapFirst(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)\//.test(ua);
  return ios || safari;
}

export type TubeStatus =
  /** nothing loaded */
  | "idle"
  /** YouTube's player is on its way */
  | "loading"
  /** its start loading, muted (an ad may play first) */
  | "buffering"
  /** held at 0:00, sound on: it starts at once */
  | "ready"
  /** asked to play, not playing yet */
  | "starting"
  /** playing, with sound */
  | "playing"
  /** the browser wants a tap on the video before it plays with sound */
  | "tap"
  /** YouTube couldn't be reached */
  | "offline"
  /** YouTube won't play this video here */
  | "bad";

/** How long a held video takes to play once asked (ms): asked this much before its moment. */
const START_LEAD_MS = 150;
/** Asked to play with sound and not playing after this long: it wants a tap. */
const TAP_AFTER_MS = 2500;
/** The measurements kept (ms of looking): the smallest one is the freshest. */
const MEASURE_MS = 3000;
/** The song fades out over this long when its dance is over (then stops). */
const FADE_MS = 2500;
const ENDED = 0;

export class Tube {
  status: TubeStatus = "idle";
  /** a video has played with sound in this player (or this browser lets it without a tap on it) */
  armed = !tapFirst();
  readonly box: HTMLElement;
  private p: YtPlayer | null = null;
  private making = false;
  private live = false;
  private video = "";
  /** where it is in getting ready: none, cue, buffer, hold, ready, start, on; paused mid-song */
  private step: "none" | "cue" | "buffer" | "hold" | "ready" | "start" | "on" | "paused" = "none";
  private stepAt = 0;
  /** when the video's 0:00 should be (speaker time); null: not asked to play */
  private goAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seen: { local: number; zero: number }[] = [];
  private fast: ReturnType<typeof setInterval> | null = null;
  /** when (performance.now) it was last seen playing its song */
  private lastPlayed = 0;
  /** fading out at the dance's end: when it started (performance.now), or null */
  private fadeFrom: number | null = null;
  /** called when something the screen shows changes */
  onChange: () => void = () => {};

  constructor() {
    this.box = document.createElement("div");
    this.box.className = "tube-slot";
  }

  /** The video to have ready (buffered and held at 0:00). */
  load(videoId: string) {
    if (videoId === this.video && this.status !== "bad" && this.status !== "offline") return;
    this.video = videoId;
    this.goAt = null;
    this.clearTimer();
    this.seen = [];
    this.lastPlayed = 0;
    this.fadeFrom = null;
    if (this.p && this.live) {
      this.p.mute();
      this.p.cueVideoById(videoId);
      this.go("cue", "loading");
      return;
    }
    if (this.making) return;
    this.making = true;
    this.set("loading");
    const slot = document.createElement("div");
    this.box.replaceChildren(slot);
    loadYt().then(
      (YT) => {
        this.p = new YT.Player(slot, {
          videoId: this.video,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: () => {
              this.live = true;
              this.making = false;
              this.p!.mute();
              this.go("cue", "loading");
            },
            onError: (e) => {
              if (FOR_GOOD.has(e.data)) this.set("bad");
            },
            onAutoplayBlocked: () => {
              if (this.step === "start") this.set("tap");
            },
          },
        });
      },
      () => {
        this.making = false;
        this.set("offline");
      },
    );
  }

  /** Play so that the video's 0:00 is at speaker time `zeroAt` (now, or soon). */
  playAt(zeroAt: number) {
    if (this.goAt !== null && Math.abs(this.goAt - zeroAt) < 30) return;
    // (already playing this run: the room follows the video, the video doesn't jump)
    if (this.step === "on" || this.step === "start") return;
    this.goAt = zeroAt;
    this.arm();
  }

  /** Back to 0:00, held (the dance stopped, or it'll be danced again). */
  stop() {
    this.goAt = null;
    this.clearTimer();
    this.seen = [];
    this.lastPlayed = 0;
    this.fadeFrom = null;
    if (!this.p || !this.live || !this.video) return;
    this.p.pauseVideo();
    this.p.seekTo(0, true);
    this.p.setVolume(100);
    this.go("hold", "buffering");
  }

  /**
   * The dance is over: the song fades out and stops (it doesn't play on without the coach). Its
   * sound comes back for the next time it's played. Where a browser won't let a page set the
   * volume (an iPhone), it plays to the end of the fade and stops.
   */
  fadeOut() {
    if (!this.p || !this.live || this.fadeFrom !== null || (this.step !== "on" && this.step !== "start")) return;
    this.fadeFrom = performance.now();
  }

  /**
   * How long (ms) the song's video hasn't been playing although its moment has come: stalled, an
   * ad, or stopped till someone taps it. 0 while it plays, before its moment, or paused on purpose.
   */
  stuckMs(): number {
    if (this.goAt === null || !this.p || !this.live || this.step === "paused" || this.fadeFrom !== null) return 0;
    const due = pageClock() - this.goAt;
    if (due <= 0) return 0;
    const st = this.p.getPlayerState();
    if (st === ENDED || (this.step === "on" && st === PLAYING)) return 0;
    const local = performance.now();
    return local - Math.max(this.lastPlayed, local - due);
  }

  /**
   * 暂停: held where it is, sound on. playAt starts it again: for a moment gone by, from as far into
   * the song as that moment is.
   */
  pause() {
    if (!this.p || !this.live || !this.video || (this.step !== "on" && this.step !== "start")) return;
    this.p.pauseVideo();
    this.clearTimer();
    this.goAt = null;
    this.seen = [];
    this.go("paused", "ready");
  }

  /** Stop and forget the video (back to the lobby). */
  unload() {
    this.stop();
    this.video = "";
    this.go("none", "idle");
  }

  /** The video's length (ms) as its player says, or null before it knows. */
  durationMs(): number | null {
    const d = this.p && this.live ? this.p.getDuration() : 0;
    return d > 0 ? Math.round(d * 1000) : null;
  }

  get ready(): boolean {
    return this.status === "ready";
  }
  get playing(): boolean {
    return this.status === "playing";
  }

  /**
   * When the video's 0:00 was, on the speaker's clock, as measured while it plays; null until
   * `spanMs` of measuring (a second and a half; less to start a dance held for its video again).
   */
  zero(spanMs = 1500): number | null {
    if (this.status !== "playing" || this.seen.length < 2) return null;
    if (this.seen[this.seen.length - 1]!.local - this.seen[0]!.local < spanMs) return null;
    let z = Infinity;
    for (const s of this.seen) z = Math.min(z, s.zero);
    return z;
  }

  /** Look at the player (every 25 ms or so): get it ready, start it, measure it. */
  tick() {
    const p = this.p;
    if (!p || !this.live || this.status === "bad") return;
    const st = p.getPlayerState();
    const t = p.getCurrentTime();
    const local = performance.now();
    switch (this.step) {
      case "cue":
        if (st === CUED || st === PAUSED || st === -1) {
          p.mute();
          p.playVideo();
          this.go("buffer", "buffering");
        }
        break;
      case "buffer":
        // playing muted till its own picture moves (past any ad), then back to its start
        if (st === PLAYING && t > 0.25) {
          p.pauseVideo();
          p.seekTo(0, true);
          this.go("hold", "buffering");
        } else if (local - this.stepAt > 1500 && st !== PLAYING && st !== BUFFERING) p.playVideo();
        break;
      case "ready":
        // someone tapped the held video (Safari's one tap): it may start by itself from now on;
        // back to its start
        if (st === PLAYING && !p.isMuted() && this.goAt === null) {
          this.armed = true;
          p.pauseVideo();
          p.seekTo(0, true);
          this.go("hold", "buffering");
        }
        break;
      case "hold":
        if ((st === PAUSED || st === CUED) && t < 0.3) {
          p.unMute();
          this.go("ready", "ready");
          this.arm();
        } else if (local - this.stepAt > 2000) {
          p.pauseVideo();
          p.seekTo(0, true);
          this.stepAt = local;
        }
        break;
      case "start":
        if (this.fadeFrom !== null) {
          p.pauseVideo();
          this.stop();
          break;
        }
        if (st === PLAYING && !p.isMuted()) {
          this.seen = [];
          this.armed = true;
          this.go("on", "playing");
        } else if (local - this.stepAt > TAP_AFTER_MS && this.status !== "tap") this.set("tap");
        break;
      case "paused":
        // (someone tapped the paused video: it waits for 继续)
        if (st === PLAYING) p.pauseVideo();
        break;
      case "on":
        if (this.fadeFrom !== null) {
          // the dance is over: the song fades out, then stops
          const k = (local - this.fadeFrom) / FADE_MS;
          if (k >= 1) {
            p.pauseVideo();
            this.stop();
          } else p.setVolume(Math.round(100 * (1 - k)));
          break;
        }
        if (st === PLAYING) {
          this.lastPlayed = local;
          this.measure();
        } else if (st === BUFFERING) this.seen = [];
        else if (st === PAUSED && this.goAt !== null) {
          // (paused by someone tapping the video, or by the phone: play on)
          p.playVideo();
        }
        break;
    }
  }

  /**
   * One look at the video's clock while it plays. The player's clock is a copy that YouTube's page
   * refreshes a few times a second, so it's looked at every few milliseconds (a fresh copy is seen
   * soon after it comes), and the earliest 0:00 of the last few seconds is the one that was fresh.
   */
  private measure() {
    const p = this.p;
    if (!p || this.step !== "on" || p.getPlayerState() !== PLAYING) return;
    const local = performance.now();
    const zero = pageClock() - p.getCurrentTime() * 1000;
    this.seen.push({ local, zero });
    while (this.seen.length && local - this.seen[0]!.local > MEASURE_MS) this.seen.shift();
    // (a jump: a stall or a seek. The old measurements are of another start)
    const last = this.seen[this.seen.length - 2];
    if (last && Math.abs(zero - last.zero) > 250) this.seen = [{ local, zero }];
  }

  /** Ask it to play at its moment, once it's held ready (or now, from cold, if the moment's here). */
  private arm() {
    this.clearTimer();
    const at = this.goAt;
    if (at === null || !this.p || !this.live) return;
    const wait = at - pageClock() - START_LEAD_MS;
    if (this.step === "ready" || wait <= 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.goAt === null || !this.p) return;
        const late = pageClock() - this.goAt;
        // (a moment gone by: from as far into the song as it should be)
        if (late > 300) this.p.seekTo(late / 1000, true);
        this.p.setVolume(100);
        this.p.unMute();
        this.p.playVideo();
        this.go("start", "starting");
      }, Math.max(0, wait));
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private go(step: Tube["step"], status: TubeStatus) {
    this.step = step;
    this.stepAt = performance.now();
    // while it plays, its clock is looked at every few milliseconds (measure)
    if (step === "on" && !this.fast) this.fast = setInterval(() => this.measure(), 4);
    else if (step !== "on" && this.fast) {
      clearInterval(this.fast);
      this.fast = null;
    }
    this.set(status);
  }

  private set(s: TubeStatus) {
    if (s === this.status) return;
    this.status = s;
    this.onChange();
  }
}
