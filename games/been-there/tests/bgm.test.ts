// The game's music (bgm.ts, ui/bgmPlan.ts, scripts/music.mjs): the files and their loop, which device
// plays it, when it comes down out of the way, and the player.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { CITY_SPACE, type GameEvent } from "../src/engine";
import type { FeedItem, MemberView, RoomView, TeamView } from "../src/room/protocol";
import META from "../src/client/bgm.json";
import { FADE_OUT, FINALE_VOLUME, THEME_VOLUME, createBgm, finaleFile, themeFile, type BgmDeps } from "../src/client/bgm";
import { FINALE_AFTER, RECORDING_FROM, RECORDING_TO, UNDER_RECORDING, bgmDevice, bgmPlan } from "../src/client/ui/bgmPlan";
import { songCue } from "../src/client/ui/localSong";

// ---------- the files ----------

test("the music's files are small, and the theme loops on exactly 64 bars at 125 a minute, a second inside each end", () => {
  const kb = (f: string) => statSync(`src/client/media/music/${f}`).size / 1024;
  // (decoded, the stereo theme is about 48 MB on the big screen; a phone gets the mono one, about 24 MB)
  assert.ok(kb(META.theme.stereo) < 2000, `theme ${kb(META.theme.stereo)} KB`);
  assert.ok(kb(META.theme.mono) < 1100, `mono theme ${kb(META.theme.mono)} KB`);
  assert.ok(kb(META.finale.file) < 250, `finale ${kb(META.finale.file)} KB`);
  for (const f of [META.theme.stereo, META.theme.mono, META.finale.file]) {
    const head = readFileSync(`src/client/media/music/${f}`).subarray(0, 3);
    // an MP3: its ID3 tag, or straight into a frame
    assert.ok(head.toString("latin1") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `${f} isn't an MP3`);
  }
  assert.equal(META.bpm, 125);
  assert.ok(Math.abs(META.theme.loopEnd - META.theme.loopStart - (64 * 4 * 60) / 125) < 1e-6);
  assert.ok(META.theme.loopStart >= 0.5 && META.theme.length - META.theme.loopEnd >= 0.5);
  assert.ok(META.finale.length > 8 && META.finale.length < 15);
});

test("the music ships beside the game and is credited, with the instruments' licence in licences.txt", () => {
  const build = readFileSync("scripts/build.mjs", "utf8");
  assert.match(build, /\["photos", "sounds", "map", "music"\]/);
  assert.match(build, /GeneralUser GS v2\.0\.3[\s\S]*scripts\/music\/GeneralUser-GS-LICENSE\.txt/);
  assert.match(readFileSync("scripts/music/GeneralUser-GS-LICENSE.txt", "utf8"), /use GeneralUser GS without restriction for your own music creation,\s+private or commercial/);
  assert.match(readFileSync("src/client/ui/Credits.tsx", "utf8"), /creditsMusic/);
});

// ---------- which device, and when ----------

const NOW = Date.now();
let fid = 0;
const ev = (e: GameEvent, ago = 100): FeedItem => ({ id: ++fid, at: NOW - ago, t: "game", e });
const PARIS = CITY_SPACE.paris;

interface Opts {
  feed?: FeedItem[];
  pos?: number;
  landings?: number;
  members?: Partial<MemberView>[];
  teams?: Partial<TeamView>[];
  host?: string;
  phase?: RoomView["phase"];
  game?: Record<string, unknown>;
}

/** A room's view: seat 0 on `pos` (Paris), two teams of one phone each, the game on. */
function view(o: Opts = {}): RoomView {
  const pos = o.pos ?? PARIS;
  const landings = Array(40).fill(0);
  landings[pos] = o.landings ?? 1;
  const ps = [0, 1].map((seat) => ({ pos: seat === 0 ? pos : 0, out: false, jail: false, turns: 2 }));
  return {
    code: "1234",
    now: NOW,
    phase: o.phase ?? "playing",
    you: { id: "a1", name: "", team: "t1", role: "player", host: true, seats: [0], lang: "zh" },
    hostId: o.host ?? "a1",
    table: null,
    settings: { mode: "target", party: false, hotseat: false },
    members: (o.members ?? [{ id: "a1", team: "t1", role: "player", online: true }, { id: "b1", team: "t2", role: "player", online: true }]).map((m) => ({ name: m.id!, score: 0, team: null, ...m })) as MemberView[],
    teams: (o.teams ?? [
      { id: "t1", seat: 0, members: ["a1"] },
      { id: "t2", seat: 1, members: ["b1"] },
    ]) as TeamView[],
    game: { s: { turn: 0, over: false, ps, stats: { landings } }, startedAt: 1000, paused: false, silenceUntil: null, dance: null, forfeit: null, ...o.game } as unknown as RoomView["game"],
    feed: o.feed ?? [],
  };
}

/** Seat 0 throws to Paris `ago` ms ago; a first visit stamps the passport. */
const toParis = (first: boolean, ago = 2000) => [
  ev({ t: "turn", p: 0 }, ago + 500),
  ev({ t: "roll", p: 0, dice: [3, 5], steps: 8 }, ago),
  ev({ t: "move", p: 0, from: PARIS - 8, to: PARIS }, ago),
  ev({ t: "land", p: 0, at: PARIS }, ago),
  ...(first ? [ev({ t: "stamp", p: 0, city: "paris" }, ago)] : []),
];

test("one device plays it: the big screen, else the host's phone, else the first phone online", () => {
  const tv = { id: "tv", role: "screen" as const, online: true };
  assert.equal(bgmDevice(view({ members: [{ id: "a1", role: "player", online: true }, tv] })), "tv");
  assert.equal(bgmDevice(view({ members: [{ id: "a1", role: "player", online: true }, { ...tv, online: false }] })), "a1");
  assert.equal(bgmDevice(view({ host: "b1" })), "b1");
  assert.equal(bgmDevice(view({ host: "b1", members: [{ id: "a1", role: "player", online: true }, { id: "b1", role: "player", online: false }] })), "a1");
  assert.equal(bgmDevice(view({ members: [{ id: "a1", role: "player", online: false }] })), null);
});

test("the theme plays through the game and nothing plays in the lobby", () => {
  assert.equal(bgmPlan({ ...view(), game: null }, NOW), null);
  assert.equal(bgmPlan(view({ phase: "lobby" }), NOW), null);
  assert.deepEqual(bgmPlan(view(), NOW), { piece: "theme", level: 1, next: 0 });
});

test("it's held right down for a pause, a party forfeit, Rio's samba to the scores, Seoul's silence and a local hit", () => {
  const level = (o: Opts, now = NOW) => bgmPlan(view(o), now)!.level;
  assert.equal(level({ game: { paused: true } }), 0);
  assert.equal(level({ game: { forfeit: { seat: 1 } } }), 0);
  assert.equal(level({ game: { dance: { seat: 0, at: null, count: 5000, ms: 40_000, short: false, auto: NOW + 50_000 } } }), 0);
  const silent = bgmPlan(view({ game: { silenceUntil: NOW + 5000 } }), NOW)!;
  assert.equal(silent.level, 0);
  assert.equal(silent.next, NOW + 5000, "it looks again when the silence ends");
  assert.equal(level({ game: { silenceUntil: NOW - 10 } }), 1);
  // A second visit's song: down from when it comes in (after the stamp), not before.
  const feed = toParis(false);
  const cue = songCue(view({ feed, landings: 2 }), NOW)!;
  assert.ok(cue);
  const before = bgmPlan(view({ feed, landings: 2 }), cue.at - 100)!;
  assert.equal(before.level, 1);
  assert.equal(before.next, cue.at);
  assert.equal(level({ feed, landings: 2 }, cue.at + 10), 0);
});

test("a first visit's recording: most of the way down while it plays", () => {
  const feed = toParis(true, 100);
  const stamp = feed[feed.length - 1].at;
  const at = (ms: number) => bgmPlan(view({ feed }), stamp + ms)!;
  assert.equal(at(500).level, 1);
  assert.equal(at(500).next, stamp + RECORDING_FROM);
  assert.equal(at(RECORDING_FROM + 100).level, UNDER_RECORDING);
  assert.equal(at(RECORDING_FROM + 100).next, stamp + RECORDING_TO);
  assert.equal(at(RECORDING_TO + 100).level, 1);
});

test("when the game ends, the ending plays once from the exit stamp, and then nothing", () => {
  const over = ev({ t: "over", winner: 0, reason: "target" }, 0);
  const v = { ...view({ feed: [over] }), phase: "over" as const };
  const plan = bgmPlan(v, over.at + 100)!;
  assert.equal(plan.piece, "finale");
  assert.equal(plan.at, over.at + FINALE_AFTER);
  assert.equal(plan.next, over.at + FINALE_AFTER + META.finale.length * 1000);
  assert.equal(bgmPlan(v, over.at + FINALE_AFTER + META.finale.length * 1000 + 10), null);
});

// ---------- the player ----------

class Param {
  value = 1;
  log: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.log.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.log.push(["ramp", v, t]);
  }
  cancelScheduledValues(t: number) {
    this.log.push(["cancel", 0, t]);
  }
}
class AudioNode {
  constructor(public context: Ctx) {}
  connect<T>(n: T) {
    return n;
  }
  disconnect() {}
}
class Gain extends AudioNode {
  gain = new Param();
}
class Source extends AudioNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: [number, number] | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(t: number, offset = 0) {
    this.started = [t, offset];
  }
  stop(t: number) {
    this.stopped = t;
  }
}
class Ctx {
  currentTime = 10;
  state = "running";
  gains: Gain[] = [];
  sources: Source[] = [];
  createGain() {
    const g = new Gain(this);
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new Source(this);
    this.sources.push(s);
    return s;
  }
  decodeAudioData(_: ArrayBuffer, ok?: (b: unknown) => void) {
    const b = { duration: 120 };
    ok?.(b);
    return Promise.resolve(b);
  }
}

function rig(o: { muted?: boolean; now?: number } = {}) {
  const ctx = new Ctx();
  const asked: string[] = [];
  let live = false;
  let muted = !!o.muted;
  const deps: BgmDeps = {
    ctx: () => ctx as unknown as AudioContext,
    out: () => ctx.createGain() as unknown as globalThis.AudioNode,
    muted: () => muted,
    fetch: async (url: string) => {
      asked.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    },
    now: () => o.now ?? 50_000,
    live: (on) => (live = on),
  };
  return { ctx, asked, live: () => live, mute: (m: boolean) => (muted = m), player: createBgm(deps) };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const ramps = (g: Gain) => g.gain.log.filter(([k]) => k === "ramp");

test("the player fetches the theme for the device (mono on a phone), loops it between its points and fades it in", async () => {
  const { ctx, asked, player, live } = rig();
  player.want({ piece: "theme", level: 1, mono: true });
  await settle();
  assert.deepEqual(asked, [themeFile(true)]);
  assert.equal(player.state(), "playing");
  assert.equal(live(), true, "the game's sounds duck it");
  const src = ctx.sources[0];
  assert.equal(src.loop, true);
  assert.equal(src.loopStart, META.theme.loopStart);
  assert.equal(src.loopEnd, META.theme.loopEnd);
  assert.deepEqual(src.started, [10.05, META.theme.loopStart], "from the start of the loop");
  assert.ok(ctx.gains.some((g) => ramps(g).some(([, v]) => v === THEME_VOLUME)), "it comes in to its volume");
  // The same want again changes nothing; a lower level brings it down without stopping it.
  player.want({ piece: "theme", level: 1, mono: true });
  assert.equal(ctx.sources.length, 1);
  player.want({ piece: "theme", level: 0, mono: true });
  assert.ok(ctx.gains.some((g) => ramps(g).some(([, v]) => v === 0)), "held down");
  assert.equal(src.stopped, null);
  assert.equal(player.state(), "playing");
  // Over: it fades out.
  player.want(null);
  assert.equal(player.state(), "off");
  assert.ok(src.stopped !== null && src.stopped <= 10 + FADE_OUT + 0.1);
  assert.equal(live(), false);
});

test("the big screen gets the stereo file; nothing is fetched or played while the sound is off", async () => {
  const a = rig();
  a.player.want({ piece: "theme", level: 1, mono: false });
  await settle();
  assert.deepEqual(a.asked, [themeFile(false)]);
  const b = rig({ muted: true });
  b.player.want({ piece: "theme", level: 1, mono: true });
  await settle();
  assert.deepEqual(b.asked, []);
  assert.equal(b.ctx.sources.length, 0);
  assert.equal(b.player.state(), "off");
});

test("the ending takes over from the theme, plays once at its moment, and isn't played when its moment has long gone", async () => {
  const { ctx, asked, player } = rig({ now: 50_000 });
  player.want({ piece: "theme", level: 1, mono: true });
  await settle();
  player.want({ piece: "finale", level: 1, at: 50_500 });
  await settle();
  assert.deepEqual(asked, [themeFile(true), finaleFile()]);
  assert.ok(ctx.sources[0].stopped !== null, "the theme stops");
  const end = ctx.sources[1];
  assert.equal(end.loop, false);
  assert.deepEqual(end.started, [10.5, 0], "at its moment, half a second from now");
  assert.ok(ctx.gains.some((g) => ramps(g).some(([, v]) => v === FINALE_VOLUME)));
  // Asked again for the same ending (every new view does): it isn't started twice.
  player.want({ piece: "finale", level: 1, at: 50_500 });
  await settle();
  assert.equal(ctx.sources.length, 2);
  // A phone back from its lock screen long after: no ending.
  const late = rig({ now: 60_000 });
  late.player.want({ piece: "finale", level: 1, at: 50_000 });
  await settle();
  assert.equal(late.ctx.sources.length, 0);
  assert.deepEqual(late.asked, []);
});

test("before a tap has allowed sound, it waits, and starts on a later look", async () => {
  let allowed: Ctx | null = null;
  const asked: string[] = [];
  const player = createBgm({
    ctx: () => allowed as unknown as AudioContext | null,
    out: () => (allowed ? (allowed.createGain() as unknown as globalThis.AudioNode) : null),
    muted: () => false,
    fetch: async (url) => {
      asked.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    },
    now: () => 50_000,
    live: () => {},
  });
  player.want({ piece: "theme", level: 1, mono: true });
  assert.equal(player.state(), "blocked");
  assert.deepEqual(asked, [], "nothing fetched yet");
  // A tap: the next view asks again.
  allowed = new Ctx();
  player.want({ piece: "theme", level: 1, mono: true });
  await settle();
  assert.equal(player.state(), "playing");
  assert.equal(allowed.sources.length, 1);
});
