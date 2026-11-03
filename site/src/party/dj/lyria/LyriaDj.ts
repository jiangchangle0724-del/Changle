/**
 * 打碟 · DJ Booth: the DJ when Lyria RealTime plays (A2), in place of the recorded stand-in, with the
 * same face to the rest of the booth (FakeDj's): it follows the night's stretch, feeds the speaker
 * a few seconds ahead, and gives the beat and the stretch the speakers are sounding now.
 *
 * Lyria streams through the table's own Durable Object (worker/lyria.ts): the speaker never sees
 * Google's key. Lyria sends its music as fast as it makes it, not in real time, so this keeps a few
 * seconds in hand and pauses Lyria when it gets ahead. When Lyria can't or won't play (not one of
 * the owner's tables, the month's cap, the connection gone for good), `onFail` says why and the
 * booth goes back to the stand-in.
 *
 * A song asked for by name brings its clip (clip/clip.ts): it plays over the stream from the next
 * bar line once it's on the air, at its own speed, Lyria quiet under it until it ends.
 */
import { playing } from "../../../shared/dj/curve";
import type { DjPhase, Mix } from "../../../shared/dj/types";
import { ClipDeck, type Clip } from "../clip/clip";
import type { Speaker } from "../speaker/speaker";
import { KickClock } from "./beat";
import { lyriaFor } from "./prompts";

/** Why Lyria stopped or never started (the relay's reasons, and the network's). */
export type LyriaWhy = "screen" | "game" | "private" | "off" | "cap" | "lost" | "set" | "replaced" | "busy" | "net";
/**
 * Reasons that won't change by trying again at this table (until it stops being the owner's and
 * becomes it again): another screen took the stream, too many starts, no key, the month's cap.
 */
export const FINAL: LyriaWhy[] = ["private", "off", "cap", "replaced", "busy"];

const RATE = 48000;
/** frames per push, as the stand-in sends them */
const CHUNK = RATE / 4;
/** seconds kept waiting in the speaker */
const AHEAD_S = 4;
/** enough in hand to start (and switch over from the stand-in) */
const READY_S = 3;
/** Lyria gets ahead: pause it past this many seconds in hand, play it again under the other */
const HIGH_S = 8;
const LOW_S = 3;
/** a change of stretch is heard this long after it's sent, about (Lyria's own lag) */
const LAG_MS = 1500;
const RETRY_MS = [500, 1000, 2000, 4000];
/** Lyria hears the mix at most this often */
const ASK_GAP_MS = 500;

type Part = { l: Float32Array; r: Float32Array };

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Interleaved 16-bit little-endian stereo at `rate`, as planar floats at 48 kHz. */
export function pcmChunk(buf: ArrayBuffer, rate: number): Part {
  const v = new DataView(buf);
  const n = Math.floor(buf.byteLength / 4);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = v.getInt16(i * 4, true) / 32768;
    r[i] = v.getInt16(i * 4 + 2, true) / 32768;
  }
  if (rate === RATE || n < 2) return { l, r };
  // Lyria says 48 kHz; if a chunk ever says otherwise, bring it to 48 (linear is plenty here)
  const m = Math.round((n * RATE) / rate);
  const l2 = new Float32Array(m);
  const r2 = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const x = (i * rate) / RATE;
    const j = Math.min(n - 2, Math.floor(x));
    const f = x - j;
    l2[i] = l[j] + (l[j + 1] - l[j]) * f;
    r2[i] = r[j] + (r[j + 1] - r[j]) * f;
  }
  return { l: l2, r: r2 };
}

export class LyriaDj {
  bpm = 125;
  /** one stream: the beginner deck's crossfader stays on A (the fader moves Lyria's prompts instead) */
  readonly decks = false;
  private goes = 0;
  /** there is enough music in hand to start playing it */
  onReady: (() => void) | null = null;
  /** Lyria can't or won't play any more; the booth goes back to the stand-in */
  onFail: ((why: LyriaWhy) => void) | null = null;
  /** a prompt Lyria's filter turned down (the relay says which, and why) */
  onFiltered: ((text: string, why: string) => void) | null = null;

  private ws: WebSocket | null = null;
  private queue: Part[] = [];
  private queued = 0;
  /** frames received so far: where the next chunk sits in the stream */
  private got = 0;
  private speaker: Speaker | null = null;
  private start = 0;
  private stopTick: (() => void) | null = null;
  private timer = 0;
  private phase: DjPhase = "wait";
  private mix: Mix | null = null;
  private pausedLyria = false;
  private relayReady = false;
  private tries = 0;
  private retry = 0;
  private done = false;
  private heldUntil = 0;
  private clock = new KickClock(RATE, 125);
  private marks: { frame: number; id: string; phase: DjPhase }[] = [];
  private pendingPhase: { phase: DjPhase; at: number } | null = null;
  private said = false;
  private pausedAt = 0;
  private lastAsk = -Infinity;
  private askTimer = 0;
  private askedPhase: DjPhase = "wait";
  /** a song asked for by name: its clip over the stream */
  private clip = new ClipDeck();

  constructor(private url: string) {}

  /** The clip of the song asked for that's on the air (null: none): it starts on the next bar line. */
  setClip(clip: Clip | null) {
    const sp = this.speaker;
    this.clip.set(clip, sp?.sentFrames ?? 0);
    if (!sp || !this.clip.waiting) return;
    const beatF = (RATE * 60) / this.bpm;
    let at = sp.sentFrames + 0.05 * RATE;
    const b0 = this.beatFrame(0);
    if (b0 !== null) at = b0 + Math.ceil((at - b0) / (4 * beatF)) * 4 * beatF;
    this.clip.start(at, this.bpm, sp.sentFrames, false);
  }

  /** Seconds of music in hand, not yet given to the speaker. */
  get inHand() {
    return this.queued / RATE;
  }

  /** Enough is in hand to start. */
  get ready() {
    return this.inHand >= READY_S || !!this.speaker;
  }

  /** Playing into the speaker now. */
  get live() {
    return !!this.speaker;
  }

  /** Connect and gather music for this stretch; nothing reaches the speaker before `go`. */
  begin(phase: DjPhase, mix: Mix) {
    this.phase = phase;
    this.mix = mix;
    this.bpm = mix.bpm;
    this.clock.setBpm(mix.bpm);
    this.connect();
  }

  /** Play into the speaker from now on, after whatever it already has waiting. */
  go(speaker: Speaker) {
    if (this.done) return;
    this.speaker = speaker;
    this.start = speaker.sentFrames;
    this.goes += 1;
    this.marks = [{ frame: speaker.sentFrames, id: `lyria-${this.phase}`, phase: this.phase }];
    this.stopTick?.();
    this.stopTick = speaker.onTick(() => this.feed());
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.feed(), 200);
    speaker.restore();
    this.feed();
  }

  setPhase(phase: DjPhase, mix: Mix) {
    const changed = phase !== this.phase || JSON.stringify(mix) !== JSON.stringify(this.mix);
    this.phase = phase;
    this.mix = mix;
    if (mix.bpm !== this.bpm) {
      this.bpm = mix.bpm;
      this.clock.setBpm(mix.bpm);
    }
    if (!changed) return;
    if (phase === this.askedPhase) {
      // the same stretch, a new blend (the fader): soon
      this.askSoon();
      return;
    }
    // a new stretch of the night: at once
    if (playing(phase)) this.pendingPhase = { phase, at: performance.now() };
    window.clearTimeout(this.askTimer);
    this.askTimer = 0;
    this.ask();
  }

  /** The beginner deck's fader moves the mix many times a second: Lyria hears the latest, twice a second at most. */
  private askSoon() {
    const wait = ASK_GAP_MS - (performance.now() - this.lastAsk);
    if (wait <= 0) this.ask();
    else if (!this.askTimer)
      this.askTimer = window.setTimeout(() => {
        this.askTimer = 0;
        this.ask();
      }, wait);
  }

  /** Counts the beat clocks: a new stream, or the kick found for the first time, starts the bars over. */
  get epoch() {
    return this.goes * 2 + (this.clock.offset() === null ? 0 : 1);
  }

  /** The frame (the speaker's count) where beat `b` falls, once the kick has given the beat's place. */
  beatFrame(b: number): number | null {
    const off = this.clock.offset();
    if (!this.speaker || off === null) return null;
    return this.start + off + b * ((RATE * 60) / this.bpm);
  }

  /** Beats since the stream's first beat, at what the speakers sound now. */
  beat(): number {
    const sp = this.speaker;
    if (!sp) return 0;
    const b = (RATE * 60) / this.bpm;
    const off = this.clock.offset() ?? 0;
    return (sp.heardFrame() - this.start - off) / b;
  }

  /** The stretch the speakers are sounding now (the change is heard a moment after it's asked). */
  heardSection(): { id: string; phase: DjPhase } | null {
    const sp = this.speaker;
    if (!sp) return null;
    const at = sp.heardFrame();
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].frame <= at) return this.marks[i];
    return null;
  }

  /** Stop sending for a while, as a dropped connection would (the test page's button). */
  holdFor(ms: number) {
    this.heldUntil = performance.now() + ms;
  }

  /** Done: close the stream (the booth went back to the stand-in, or the set ended). */
  stop() {
    this.done = true;
    window.clearTimeout(this.askTimer);
    this.stopTick?.();
    this.stopTick = null;
    window.clearInterval(this.timer);
    window.clearTimeout(this.retry);
    this.speaker = null;
    const ws = this.ws;
    this.ws = null;
    try {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ play: "STOP" }));
      ws?.close(1000, "done");
    } catch {
      /* gone */
    }
  }

  private connect() {
    if (this.done || this.ws) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.fail("net");
      return;
    }
    this.ws = ws;
    this.relayReady = false;
    ws.onmessage = (e) => this.message(typeof e.data === "string" ? e.data : "");
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.relayReady = false;
      if (this.done) return;
      // the relay keeps the stream for a moment: come straight back
      if (this.tries >= RETRY_MS.length) {
        this.fail("net");
        return;
      }
      this.retry = window.setTimeout(() => this.connect(), RETRY_MS[this.tries++]);
    };
  }

  private send(msg: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.relayReady) return;
    ws.send(JSON.stringify(msg));
  }

  /** What Lyria should play for the stretch now, and play or stop. */
  private ask() {
    if (!this.mix) return;
    this.lastAsk = performance.now();
    this.askedPhase = this.phase;
    if (!playing(this.phase)) {
      this.send({ play: "STOP" });
      return;
    }
    const a = lyriaFor(this.phase, this.mix);
    this.send({ config: a.config });
    this.send({ prompts: a.prompts });
    if (!this.pausedLyria) this.send({ play: "PLAY" });
  }

  private message(data: string) {
    if (!data) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    const content = msg.serverContent as { audioChunks?: { data?: string; mimeType?: string }[] } | undefined;
    if (content) {
      for (const c of content.audioChunks ?? []) if (c.data) this.audio(c.data, c.mimeType ?? "");
      return;
    }
    switch (msg.t) {
      case "ready":
        this.relayReady = true;
        this.tries = 0;
        this.ask();
        return;
      case "state":
        if (msg.s === "live") this.tries = 0;
        return;
      case "filtered":
        this.onFiltered?.(String(msg.text ?? ""), String(msg.why ?? ""));
        return;
      case "no":
        // this screen isn't back at the table yet (a reload, the network): the socket closes and
        // it tries again in a moment
        if (msg.why === "screen") return;
        this.fail((msg.why as LyriaWhy) ?? "lost");
        return;
      case "end":
        // the set is over: what's in hand plays out, and the booth fades it with the night's end
        if (msg.why === "set") {
          this.closeQuietly();
          return;
        }
        this.fail((msg.why as LyriaWhy) ?? "lost");
        return;
    }
  }

  private audio(b64: string, mime: string) {
    if (this.done) return;
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || RATE;
    const part = pcmChunk(decode(b64), rate);
    if (!part.l.length) return;
    // a change of stretch, heard from about here on
    const p = this.pendingPhase;
    if (p && performance.now() - p.at >= LAG_MS) {
      this.pendingPhase = null;
      const frame = this.start + this.got;
      this.marks = [...this.marks.slice(-5), { frame, id: `lyria-${p.phase}`, phase: p.phase }];
    }
    this.clock.feed(part.l, part.r, this.got);
    this.got += part.l.length;
    this.queue.push(part);
    this.queued += part.l.length;
    if (!this.said && this.inHand >= READY_S) {
      this.said = true;
      this.onReady?.();
    }
    this.pace();
    this.feed();
  }

  /** Lyria makes music faster than it plays: hold it while plenty is in hand. */
  private pace() {
    const now = performance.now();
    if (!this.pausedLyria && this.inHand > HIGH_S) {
      this.pausedLyria = true;
      this.pausedAt = now;
      this.send({ play: "PAUSE" });
    } else if (this.pausedLyria && this.inHand > HIGH_S + 4 && now - this.pausedAt > 5000) {
      // still coming: say it again (a pause lost on the way)
      this.pausedAt = now;
      this.send({ play: "PAUSE" });
    } else if (this.pausedLyria && this.inHand < LOW_S && playing(this.phase)) {
      this.pausedLyria = false;
      this.send({ play: "PLAY" });
    }
  }

  /** The relay is done with this set: stop asking, keep playing out what's in hand. */
  private closeQuietly() {
    window.clearTimeout(this.retry);
    const ws = this.ws;
    this.ws = null;
    this.tries = RETRY_MS.length;
    try {
      ws?.close(1000, "done");
    } catch {
      /* gone */
    }
  }

  private feed() {
    const sp = this.speaker;
    if (!sp || this.done || performance.now() < this.heldUntil) return;
    for (let guard = 0; guard < 40 && sp.buffered() < AHEAD_S && this.queue.length; guard++) {
      const head = this.queue[0];
      const n = Math.min(CHUNK, head.l.length);
      const l = head.l.slice(0, n);
      const r = head.r.slice(0, n);
      if (n === head.l.length) this.queue.shift();
      else this.queue[0] = { l: head.l.subarray(n), r: head.r.subarray(n) };
      this.queued -= n;
      if (this.clip.live(sp.sentFrames, n)) this.clip.mix(l, r, sp.sentFrames, null);
      sp.push(l, r);
    }
    this.pace();
  }

  private fail(why: LyriaWhy) {
    if (this.done) return;
    this.stop();
    this.onFail?.(why);
  }
}
