/**
 * 打碟 · DJ Booth: the Lyria RealTime relay (A2).
 *
 * Google's key never leaves Cloudflare, and Lyria takes no short-lived browser tokens (they work
 * only with the Live API), so a table's speaker streams through its own table's Durable Object:
 * one Lyria session per table, its audio passed to the speaker as it comes, the speaker's controls
 * checked and passed on to Google. Only for a table with one of the site owner's accounts at it (a
 * private test: Google's terms keep experimental models out of production), and never past the
 * month's cap (the model has no published price: the cap is the guard). CONTRACTS.md, "Lyria".
 */

export type LyriaEnv = {
  GEMINI_API_KEY?: string;
  /** a key for Lyria alone, if it should be billed apart (otherwise the avatars' key) */
  LYRIA_API_KEY?: string;
  LYRIA_MODEL?: string;
  /** local runs only: a fake Lyria server (scripts/fake_lyria.mjs) instead of Google; no key */
  DEV_LYRIA_URL?: string;
};

/** Why a table can't have Lyria, or why its stream stopped. */
export type LyriaWhy = "screen" | "game" | "private" | "off" | "cap" | "lost" | "set" | "replaced" | "busy";

/** What the relay tells the speaker; Google's own audio messages (`serverContent`) pass as they are. */
export type RelayMsg =
  | { t: "ready" }
  | { t: "no"; why: LyriaWhy }
  | { t: "end"; why: LyriaWhy }
  | { t: "state"; s: "reconnecting" | "live" }
  | { t: "filtered"; text: string; why: string };

export const LYRIA_MODEL = "models/lyria-realtime-exp";
const GOOGLE_WS = "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateMusic";

const SCALES = [
  "C_MAJOR_A_MINOR",
  "D_FLAT_MAJOR_B_FLAT_MINOR",
  "D_MAJOR_B_MINOR",
  "E_FLAT_MAJOR_C_MINOR",
  "E_MAJOR_D_FLAT_MINOR",
  "F_MAJOR_D_MINOR",
  "G_FLAT_MAJOR_E_FLAT_MINOR",
  "G_MAJOR_E_MINOR",
  "A_FLAT_MAJOR_F_MINOR",
  "A_MAJOR_G_FLAT_MINOR",
  "B_FLAT_MAJOR_G_MINOR",
  "B_MAJOR_A_FLAT_MINOR",
  "SCALE_UNSPECIFIED",
];
const PLAYS = ["PLAY", "PAUSE", "STOP", "RESET_CONTEXT"];
const MODES = ["QUALITY", "DIVERSITY", "VOCALIZATION"];

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A speaker's control message (`{ prompts }`, `{ config }` or `{ play }`) as Lyria's own, or null
 * for anything else. Nothing passes unchecked: at most 8 prompts of 120 characters, weights never
 * 0, every setting inside Lyria's documented range, only the known playback controls.
 */
export function toGoogle(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (Array.isArray(m.prompts)) {
    const weightedPrompts: { text: string; weight: number }[] = [];
    for (const p of m.prompts.slice(0, 8)) {
      if (!p || typeof p !== "object") continue;
      const text = String((p as { text?: unknown }).text ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      const w = finite((p as { weight?: unknown }).weight);
      if (!text || w === null || w === 0) continue;
      weightedPrompts.push({ text, weight: Math.round(clamp(w, -10, 10) * 1000) / 1000 || 0.001 });
    }
    return weightedPrompts.length ? { clientContent: { weightedPrompts } } : null;
  }
  if (m.config && typeof m.config === "object") {
    const c = m.config as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const n = (k: string, lo: number, hi: number, int = false) => {
      const v = finite(c[k]);
      if (v !== null) out[k] = int ? Math.round(clamp(v, lo, hi)) : clamp(v, lo, hi);
    };
    n("bpm", 60, 200, true);
    n("density", 0, 1);
    n("brightness", 0, 1);
    n("guidance", 0, 6);
    n("temperature", 0, 3);
    n("topK", 1, 1000, true);
    n("seed", 0, 2_147_483_647, true);
    if (typeof c.scale === "string" && SCALES.includes(c.scale)) out.scale = c.scale;
    for (const k of ["muteBass", "muteDrums", "onlyBassAndDrums"]) if (typeof c[k] === "boolean") out[k] = c[k];
    if (typeof c.musicGenerationMode === "string" && MODES.includes(c.musicGenerationMode)) out.musicGenerationMode = c.musicGenerationMode;
    return Object.keys(out).length ? { musicGenerationConfig: out } : null;
  }
  if (typeof m.play === "string" && PLAYS.includes(m.play)) return { playbackControl: m.play };
  return null;
}

/** How long a stream waits for its speaker to come back before it closes. */
const GRACE_MS = 20_000;
/** Reconnecting to Google: these waits, then it gives up. */
const RETRY_MS = [300, 800, 1600, 3200, 6400];
/** A session that lived this long before it dropped starts the waits over (a short one doesn't). */
const LIVED_MS = 30_000;
/** At most this many new sessions a table in this long (a speaker opening and closing in a loop). */
const STARTS = { max: 12, perMs: 10 * 60_000 };
/** The meter and the checks run this often while a stream is open. */
const TICK_MS = 60_000;
/** Controls a speaker may send a second (a dragged knob is sent at most every 250 ms). */
const CTL_PER_S = 10;

export type RelayHooks = {
  /** why this table (and this speaker, by its screen id) may not stream now; null when it may */
  whyNot(sid: string): LyriaWhy | null;
  /** the month's meter: adds seconds streamed, says what's used of the cap */
  meter(add: number): Promise<{ used: number; cap: number }>;
};

/** Google may send its JSON as binary frames (its own SDK reads both): always text from here on.
 *  (The socket asks for binary frames as an ArrayBuffer: see connect.) */
function asText(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return null;
}

/** The key in a header, where logs and traces don't keep it; in the URL only if Google won't take the header. */
let keyInUrl = false;

/** One table's Lyria session and the speaker listening to it. Lives as long as its Durable Object. */
export class LyriaRelay {
  private google: WebSocket | null = null;
  private speaker: WebSocket | null = null;
  private sid = "";
  private ready = false;
  private opening = false;
  /** the latest of each control: what a fresh session is set up with (older ones don't matter) */
  private last: { prompts?: string; config?: string; play?: string } = {};
  private tries = 0;
  private upAt = 0;
  private starts: number[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;
  private grace: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private since = 0;
  private unmetered = 0;
  private sent: number[] = [];
  private closed = false;

  constructor(
    private env: LyriaEnv,
    private hooks: RelayHooks,
  ) {}

  /** Lyria is set up for this Worker (a key, or the local fake). */
  static configured(env: LyriaEnv) {
    return !!(env.DEV_LYRIA_URL || env.LYRIA_API_KEY || env.GEMINI_API_KEY);
  }

  get open() {
    return !!this.google;
  }

  /** A speaker's socket (already accepted, and checked by the table). It replaces any before it. */
  join(ws: WebSocket, sid: string) {
    // a speaker opening and closing in a loop can't start session after session
    const now = Date.now();
    this.starts = this.starts.filter((t) => now - t < STARTS.perMs);
    if (!this.google && !this.opening && this.starts.length >= STARTS.max) {
      this.bye(ws, { t: "no", why: "busy" });
      return;
    }
    if (this.speaker && this.speaker !== ws) this.bye(this.speaker, { t: "end", why: "replaced" });
    this.speaker = ws;
    this.sid = sid;
    this.closed = false;
    if (this.grace) clearTimeout(this.grace);
    this.grace = null;
    ws.addEventListener("message", (e) => this.fromSpeaker(ws, e.data));
    ws.addEventListener("close", (e) => this.left(ws, e.code));
    ws.addEventListener("error", () => this.left(ws, 1011));
    if (this.ready) this.say({ t: "ready" });
    else void this.connect();
  }

  /** Stop everything (the booth closed, the set ended, the cap): tells the speaker why. */
  end(why: LyriaWhy) {
    this.closed = true;
    if (this.speaker) this.bye(this.speaker, { t: "end", why });
    this.speaker = null;
    this.shut();
  }

  private say(msg: RelayMsg) {
    try {
      this.speaker?.send(JSON.stringify(msg));
    } catch {
      /* gone */
    }
  }

  private bye(ws: WebSocket, msg: RelayMsg) {
    try {
      ws.send(JSON.stringify(msg));
      ws.close(1000, msg.t);
    } catch {
      /* gone */
    }
  }

  private fromSpeaker(ws: WebSocket, data: unknown) {
    if (ws !== this.speaker || typeof data !== "string" || data.length > 8_000) return;
    // a speaker can't flood Google: CTL_PER_S a second
    const now = Date.now();
    this.sent = this.sent.filter((t) => now - t < 1000);
    if (this.sent.length >= CTL_PER_S) return;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const msg = toGoogle(raw);
    if (!msg) return;
    this.sent.push(now);
    const text = JSON.stringify(msg);
    if ("clientContent" in msg) this.last.prompts = text;
    else if ("musicGenerationConfig" in msg) this.last.config = text;
    else if (msg.playbackControl !== "RESET_CONTEXT") this.last.play = text;
    // before Google is ready the latest of each is kept (above) and sent when it is
    if (this.google && this.ready) {
      try {
        this.google.send(text);
      } catch {
        /* the close handler reconnects */
      }
    }
  }

  private left(ws: WebSocket, code: number) {
    if (ws !== this.speaker) return;
    this.speaker = null;
    if (this.grace) clearTimeout(this.grace);
    // the speaker said it's done (the booth went back to the stand-in): no need to wait
    if (code === 1000) {
      this.shut();
      return;
    }
    // a speaker dropping for a moment (a reload, the network) finds its stream still there
    this.grace = setTimeout(() => {
      if (!this.speaker) this.shut();
    }, GRACE_MS);
  }

  private async open1(): Promise<WebSocket> {
    const key = this.env.LYRIA_API_KEY || this.env.GEMINI_API_KEY || "";
    if (this.env.DEV_LYRIA_URL) {
      const res = await fetch(this.env.DEV_LYRIA_URL.replace(/^ws/, "http"), { headers: { Upgrade: "websocket" } });
      if (!res.webSocket) throw new Error(`no websocket (${res.status})`);
      return res.webSocket;
    }
    if (!keyInUrl) {
      const res = await fetch(GOOGLE_WS, { headers: { Upgrade: "websocket", "x-goog-api-key": key } });
      if (res.webSocket) return res.webSocket;
      if (![400, 401, 403].includes(res.status)) throw new Error(`no websocket (${res.status})`);
      keyInUrl = true;
    }
    const res = await fetch(`${GOOGLE_WS}?key=${encodeURIComponent(key)}`, { headers: { Upgrade: "websocket" } });
    if (!res.webSocket) throw new Error(`no websocket (${res.status})`);
    return res.webSocket;
  }

  private async connect() {
    if (this.google || this.opening || this.closed || !this.speaker) return;
    this.opening = true;
    this.starts.push(Date.now());
    try {
      const ws = await this.open1();
      ws.accept();
      // binary frames as bytes, read at once and in order (by default they come as a Blob,
      // which only reads asynchronously)
      ws.binaryType = "arraybuffer";
      // nobody waiting for it any more (the set ended, the speaker left, while it opened)
      if (this.closed || !this.speaker) {
        ws.close(1000, "not needed");
        return;
      }
      this.google = ws;
      this.ready = false;
      ws.addEventListener("message", (e) => this.fromGoogle(ws, e.data));
      ws.addEventListener("close", (e) => this.lost(ws, e.code, e.reason));
      ws.addEventListener("error", () => this.lost(ws, 1011));
      ws.send(JSON.stringify({ setup: { model: this.env.LYRIA_MODEL || LYRIA_MODEL } }));
      if (!this.tick) {
        this.since = Date.now();
        this.tick = setInterval(() => void this.check(), TICK_MS);
      }
    } catch (e) {
      // never the URL or the key
      console.error("lyria connect", e instanceof Error ? e.message.replace(/key=[^&\s]+/g, "key=…") : "error");
      this.google = null;
      this.again();
    } finally {
      this.opening = false;
    }
  }

  private fromGoogle(ws: WebSocket, raw: unknown) {
    if (ws !== this.google) return;
    const data = asText(raw);
    if (!data) return;
    // audio, the bulk of it: straight through, unread
    if (data.startsWith('{"serverContent"') || data.includes('"audioChunks"')) {
      try {
        this.speaker?.send(data);
      } catch {
        /* gone */
      }
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    if ("setupComplete" in msg) {
      const again = this.upAt > 0 || this.tries > 0;
      this.ready = true;
      this.upAt = Date.now();
      // a fresh session (after a drop too) is set up the way the speaker last left it: the
      // latest prompts, config and play, in that order
      try {
        for (const t of [this.last.config, this.last.prompts, this.last.play]) if (t) ws.send(t);
      } catch {
        /* closed meanwhile: the close handler reconnects */
      }
      this.say(again ? { t: "state", s: "live" } : { t: "ready" });
      return;
    }
    if ("serverContent" in msg) {
      try {
        this.speaker?.send(data);
      } catch {
        /* gone */
      }
      return;
    }
    const f = msg.filteredPrompt as { text?: unknown; filteredReason?: unknown } | undefined;
    if (f) this.say({ t: "filtered", text: String(f.text ?? "").slice(0, 120), why: String(f.filteredReason ?? "").slice(0, 200) });
  }

  private lost(ws: WebSocket, code: number, reason = "") {
    if (ws !== this.google) return;
    this.google = null;
    this.ready = false;
    // Google says why in the reason (a wrong model, a bad message): the first thing to read in the
    // logs when the test doesn't start (never the key)
    console.log("lyria closed", code, reason.slice(0, 200).replace(/key=[^&\s]+/g, "key=…"));
    // only a session that lived a while starts the waits over: one Google keeps closing at once
    // runs out of tries
    if (this.upAt && Date.now() - this.upAt >= LIVED_MS) this.tries = 0;
    this.upAt = 0;
    if (this.closed || !this.speaker) return;
    this.again();
  }

  private again() {
    if (this.closed || !this.speaker || this.retry) return;
    if (this.tries >= RETRY_MS.length) {
      this.end("lost");
      return;
    }
    this.say({ t: "state", s: "reconnecting" });
    const wait = RETRY_MS[this.tries++];
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, wait);
  }

  /** Once a minute while streaming: count it, and stop at the cap or when the table may not stream. */
  private async check() {
    if (!this.google && !this.retry) return;
    const now = Date.now();
    this.unmetered += (now - this.since) / 1000;
    this.since = now;
    const why = this.hooks.whyNot(this.sid);
    if (why) {
      this.end(why);
      return;
    }
    try {
      const m = await this.hooks.meter(this.unmetered);
      this.unmetered = 0;
      if (m.used >= m.cap) this.end("cap");
    } catch {
      /* counted with the next minute; the meter is a guard, not a reason to cut the music */
    }
  }

  private shut() {
    if (this.retry) clearTimeout(this.retry);
    if (this.grace) clearTimeout(this.grace);
    if (this.tick) clearInterval(this.tick);
    this.retry = this.grace = null;
    this.tick = null;
    // the last part-minute counts too
    if (this.since) this.unmetered += (Date.now() - this.since) / 1000;
    if (this.unmetered > 0) {
      const add = this.unmetered;
      this.unmetered = 0;
      void this.hooks.meter(add).catch(() => {});
    }
    this.since = 0;
    const g = this.google;
    this.google = null;
    this.ready = false;
    this.last = {};
    this.tries = 0;
    this.upAt = 0;
    try {
      g?.close(1000, "done");
    } catch {
      /* gone */
    }
  }
}
