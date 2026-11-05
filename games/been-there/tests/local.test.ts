// Being there (issue #44): the local hits (the list, which visit plays what, on which device, and the
// player itself, muted and not), how to say each city's hello, the local time, and prices in local money.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CITIES, CITY_SPACE, type GameEvent } from "../src/engine";
import type { FeedItem, MemberView, RoomView, TeamView } from "../src/room/protocol";
import { TIME_ZONE, localClock } from "../src/client/art/places";
import { CURRENCY, HELLO, RATES, localMoney, rateLine } from "../src/client/local";
import { FADE_OUT, SONG_VOLUME, createPlayer, type MusicDeps } from "../src/client/music";
import { AFTER_STAMP, CITY_SONGS, songCue, songHushed, songPlayer, songText } from "../src/client/ui/localSong";
import { timesFor, planMove } from "../src/client/ui/ridePlan";

/** What a player may never read: em dashes and curly quotes. */
const TYPOGRAPHY = /[—“”‘’]/;

test("every city has 3 to 5 local hits, each a checked, clean, original Apple Music track", () => {
  const ids = new Set<number>();
  for (const c of CITIES) {
    const songs = CITY_SONGS[c.id];
    assert.ok(songs && songs.length >= 3 && songs.length <= 5, `${c.id}: ${songs?.length ?? 0} songs`);
    for (const s of songs) {
      const where = `${c.id}: ${s.title}`;
      assert.ok(Number.isSafeInteger(s.id) && s.id > 0, `${where}: track id`);
      assert.ok(!ids.has(s.id), `${where}: the same track twice`);
      ids.add(s.id);
      assert.match(s.cc, /^[a-z]{2}$/, `${where}: storefront`);
      assert.ok(s.title.trim() && s.artist.trim(), `${where}: title and artist`);
      assert.equal(s.explicitness, "notExplicit", `${where}: explicit`);
      assert.match(s.preview, /^https:\/\/audio-ssl\.itunes\.apple\.com\//, `${where}: preview`);
      assert.match(s.url, new RegExp(`^https://music\\.apple\\.com/${s.cc}/`), `${where}: Apple Music link`);
      assert.ok(s.year >= 1900 && s.year <= 2026, `${where}: year ${s.year}`);
      assert.doesNotMatch(s.title, /(?<![a-z])live(?![a-z])|remix|karaoke|instrumental|cover|acoustic|re-?record|sped up/i, `${where}: not the original`);
      for (const lang of ["zh", "en"] as const) {
        const { title, artist } = songText(s, lang);
        assert.ok(title && artist, `${where}: what a ${lang} reader sees`);
        assert.doesNotMatch(`${title} ${artist}`, TYPOGRAPHY, `${where} (${lang}): em dash or curly quote`);
        // Simplified Chinese for Chinese readers of the mainland cities' songs, Latin letters for English readers of any.
        if (lang === "en") assert.doesNotMatch(`${title} ${artist}`, /[぀-ヿ一-鿿가-힯฀-๿؀-ۿ]/, `${where}: unreadable for an English reader`);
      }
    }
  }
  assert.deepEqual(Object.keys(CITY_SONGS).sort(), CITIES.map((c) => c.id).sort());
});

// ---------- which visit plays what ----------

const NOW = Date.now();
let fid = 0;
const ev = (e: GameEvent, ago = 100): FeedItem => ({ id: ++fid, at: NOW - ago, t: "game", e });

interface Opts {
  feed: FeedItem[];
  pos: number;
  turn?: number;
  landings?: number;
  members?: Partial<MemberView>[];
  teams?: Partial<TeamView>[];
  you?: string;
  host?: string;
  game?: Record<string, unknown>;
  jail?: boolean;
}

/** A room's view: seat `turn` (0) on `pos`, two teams. */
function view(o: Opts): RoomView {
  const landings = Array(40).fill(0);
  landings[o.pos] = o.landings ?? 2;
  const ps = [0, 1].map((seat) => ({ pos: seat === (o.turn ?? 0) ? o.pos : 0, out: false, jail: seat === (o.turn ?? 0) && !!o.jail, turns: 2 }));
  return {
    code: "1234",
    now: NOW,
    phase: "playing",
    you: { id: o.you ?? "a1", name: "", team: "t1", role: "player", host: false, seats: [0], lang: "zh" },
    hostId: o.host ?? "a1",
    table: null,
    settings: { mode: "target", party: false, hotseat: false },
    members: (o.members ?? [{ id: "a1", team: "t1", role: "player", online: true }, { id: "b1", team: "t2", role: "player", online: true }]).map((m) => ({ name: m.id!, score: 0, team: null, ...m })) as MemberView[],
    teams: (o.teams ?? [
      { id: "t1", seat: 0, members: ["a1"] },
      { id: "t2", seat: 1, members: ["b1"] },
    ]) as TeamView[],
    game: { s: { turn: o.turn ?? 0, over: false, ps, stats: { landings } }, startedAt: 1000, paused: false, silenceUntil: null, dance: null, ...o.game } as unknown as RoomView["game"],
    feed: o.feed,
  };
}

const PARIS = CITY_SPACE.paris;
/** A throw by seat 0 to Paris, two seconds ago: the first visit stamps the passport. */
const toParis = (first: boolean, ago = 2000) => [
  ev({ t: "turn", p: 0 }, ago + 500),
  ev({ t: "roll", p: 0, dice: [3, 5], steps: 8 }, ago),
  ev({ t: "move", p: 0, from: PARIS - 8, to: PARIS }, ago),
  ev({ t: "land", p: 0, at: PARIS }, ago),
  ...(first ? [ev({ t: "stamp", p: 0, city: "paris" }, ago)] : []),
];

test("a first visit plays the city's recording, not a song; a second visit plays one of the city's own songs", () => {
  assert.equal(songCue(view({ feed: toParis(true), pos: PARIS }), NOW), null);
  const feed = toParis(false);
  const cue = songCue(view({ feed, pos: PARIS }), NOW);
  assert.ok(cue);
  assert.equal(cue.city, "paris");
  assert.equal(cue.seat, 0);
  assert.equal(cue.key, feed[3].id);
  assert.ok(CITY_SONGS.paris.includes(cue.song));
  // It comes in just after the stamp: the throw's own beat.
  const plan = planMove(view({ feed, pos: PARIS }), [0], NOW)!;
  assert.equal(cue.at, plan.start + timesFor(plan.legs, plan.jail, plan.pace, plan.rolled).land + AFTER_STAMP);
});

test("the song stops when the turn ends, when the team moves on, and goes on in the same turn", () => {
  const feed = toParis(false);
  // The next team's turn: nothing.
  assert.equal(songCue(view({ feed: [...feed, ev({ t: "turn", p: 1 }, 10)], pos: PARIS, turn: 1 }), NOW), null);
  // Still seat 0's turn, a decision later (it bought a house): still on.
  assert.ok(songCue(view({ feed: [...feed, ev({ t: "manage", p: 0, k: "build", at: PARIS }, 10)], pos: PARIS }), NOW));
  // Doubles: thrown again, and gone from Paris (the view's position has moved on).
  const again = [...feed, ev({ t: "roll", p: 0, dice: [1, 2], steps: 3 }, 10), ev({ t: "move", p: 0, from: PARIS, to: PARIS + 3 }, 10), ev({ t: "land", p: 0, at: PARIS + 3 }, 10)];
  assert.equal(songCue(view({ feed: again, pos: PARIS + 3 }), NOW), null);
  // Sent to Immigration from there.
  assert.equal(songCue(view({ feed, pos: PARIS, jail: true }), NOW), null);
  // Another team landing in Paris isn't this team's song.
  const theirs = [ev({ t: "turn", p: 1 }, 2500), ev({ t: "land", p: 1, at: PARIS }, 2000)];
  assert.equal(songCue(view({ feed: theirs, pos: 5, turn: 0 }), NOW), null);
  // The game over: nothing.
  assert.equal(songCue({ ...view({ feed, pos: PARIS }), phase: "over" }, NOW), null);
  // A computer team (or a team the computer is covering for) is done before its token is down: no song.
  assert.equal(songCue(view({ feed, pos: PARIS, teams: [{ id: "t1", seat: 0, members: [], bot: "balanced" }] }), NOW), null);
  assert.equal(songCue(view({ feed, pos: PARIS, teams: [{ id: "t1", seat: 0, members: ["a1"], covered: true }] }), NOW), null);
});

test("each landing in a city moves its songs on by one, the same on every device", () => {
  const feed = toParis(false);
  const picks = [2, 3, 4, 5, 6].map((n) => songCue(view({ feed, pos: PARIS, landings: n }), NOW)!.song.id);
  for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1], "the same song twice running");
  assert.equal(new Set(picks).size, Math.min(5, CITY_SONGS.paris.length));
  // Another landing on Paris since (a tango, Tokyo's push) doesn't change this landing's song.
  const later = [...feed, ev({ t: "land", p: 1, at: PARIS }, 10)];
  assert.equal(songCue(view({ feed: later, pos: PARIS, landings: 3 }), NOW)!.song.id, songCue(view({ feed, pos: PARIS, landings: 2 }), NOW)!.song.id);
});

test("one device plays it: the big screen, else the landing team's first phone online, else the host's", () => {
  const feed = toParis(false);
  const screen = { id: "tv", role: "screen" as const, online: true };
  assert.equal(songPlayer(view({ feed, pos: PARIS, members: [{ id: "a1", role: "player", online: true }, screen] }), 0), "tv");
  // (a big screen that has gone away doesn't count)
  assert.equal(songPlayer(view({ feed, pos: PARIS, members: [{ id: "a1", role: "player", online: true }, { ...screen, online: false }] }), 0), "a1");
  // A team of three: its first phone that's online.
  const three = [
    { id: "a1", role: "player" as const, online: false },
    { id: "a2", role: "player" as const, online: true },
    { id: "a3", role: "player" as const, online: true },
  ];
  assert.equal(songPlayer(view({ feed, pos: PARIS, members: three, teams: [{ id: "t1", seat: 0, members: ["a1", "a2", "a3"] }] }), 0), "a2");
  // A computer team (no phones): the host's.
  assert.equal(songPlayer(view({ feed, pos: PARIS, host: "b1", teams: [{ id: "t1", seat: 0, members: [] }, { id: "t2", seat: 1, members: ["b1"] }] }), 0), "b1");
});

test("the song is held down through a pause, Seoul's silence and Rio's samba", () => {
  const feed = toParis(false);
  assert.equal(songHushed(view({ feed, pos: PARIS }), NOW), false);
  assert.equal(songHushed(view({ feed, pos: PARIS, game: { paused: true } }), NOW), true);
  assert.equal(songHushed(view({ feed, pos: PARIS, game: { silenceUntil: NOW + 5000 } }), NOW), true);
  assert.equal(songHushed(view({ feed, pos: PARIS, game: { dance: { seat: 0, at: NOW - 1000, ms: 10_600 } } }), NOW), true);
  assert.equal(songHushed(view({ feed, pos: PARIS, game: { dance: { seat: 0, at: NOW - 20_000, ms: 10_600 } } }), NOW), false);
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
class Node {
  constructor(public context: Ctx) {}
  connect<T>(n: T) {
    return n;
  }
  disconnect() {}
}
class Gain extends Node {
  gain = new Param();
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  started: number | null = null;
  stopped: number | null = null;
  start(t: number) {
    this.started = t;
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
    const b = { duration: 30 };
    ok?.(b);
    return Promise.resolve(b);
  }
}

function rig(o: { muted?: boolean; lookup?: "ok" | "fails" } = {}) {
  const ctx = new Ctx();
  const asked: string[] = [];
  let live = false;
  const deps: MusicDeps = {
    ctx: () => ctx as unknown as AudioContext,
    out: () => ctx.createGain() as unknown as AudioNode,
    muted: () => !!o.muted,
    fetch: async (url: string) => {
      asked.push(url);
      if (url.startsWith("https://itunes.apple.com/lookup")) {
        if (o.lookup === "fails") throw new Error("offline");
        const id = Number(new URL(url).searchParams.get("id"));
        return { ok: true, json: async () => ({ results: [{ trackId: id, previewUrl: "https://audio-ssl.itunes.apple.com/now.m4a" }] }) } as Response;
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    },
    now: () => 50_000,
    live: (on) => (live = on),
  };
  return { ctx, asked, deps, live: () => live, player: createPlayer(deps) };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const want = (key: string, at = 51_000) => ({ key, id: 591787216, cc: "fr", preview: "https://audio-ssl.itunes.apple.com/then.m4a", at });

test("the player looks the preview up, plays it from its moment, and fades it out over 2 s when it's over", async () => {
  const { ctx, asked, player, live } = rig();
  player.want(want("a"));
  await settle();
  assert.deepEqual(asked, ["https://itunes.apple.com/lookup?id=591787216&country=fr&entity=song", "https://audio-ssl.itunes.apple.com/now.m4a"]);
  assert.equal(player.state("a"), "playing");
  assert.equal(live(), true, "the game's sounds duck it");
  const src = ctx.sources[0];
  // Wanted for a second from now (on this device's clock): a second from now on the audio clock.
  assert.equal(src.started, 11);
  const volume = ctx.gains.find((g) => g.gain.log.some(([k, v]) => k === "ramp" && v === SONG_VOLUME))!;
  assert.ok(volume, "it comes in to its volume");
  // The same want again changes nothing.
  player.want(want("a"));
  assert.equal(ctx.sources.length, 1);
  // The turn ends.
  ctx.currentTime = 20;
  player.want(null);
  assert.equal(player.state("a"), "off");
  assert.deepEqual(volume.gain.log.slice(-1)[0], ["ramp", 0, 20 + FADE_OUT]);
  assert.ok(src.stopped !== null && src.stopped <= 20 + FADE_OUT + 0.1);
  assert.equal(live(), false);
});

test("nothing is fetched or played while the sound is off", async () => {
  const { ctx, asked, player } = rig({ muted: true });
  player.want(want("a"));
  await settle();
  assert.deepEqual(asked, []);
  assert.equal(ctx.sources.length, 0);
  assert.equal(player.state("a"), "off");
});

test("a lookup that fails falls back to the preview found when the list was made", async () => {
  const { asked, player } = rig({ lookup: "fails" });
  player.want(want("a"));
  await settle();
  assert.equal(asked[1], "https://audio-ssl.itunes.apple.com/then.m4a");
  assert.equal(player.state("a"), "playing");
  player.want(null);
});

test("a new landing's song takes over, and a hush holds the song down without stopping it", async () => {
  const { ctx, player } = rig();
  player.want(want("a"));
  await settle();
  player.want({ ...want("a"), hush: true });
  // (down to nothing in 0.4 s, now: not a pass's own fade at its end)
  assert.ok(ctx.gains.some((g) => g.gain.log.some(([k, v, t]) => k === "ramp" && v === 0 && Math.abs(t - 10.4) < 1e-9)), "held down");
  assert.equal(player.state("a"), "playing");
  player.want(want("b"));
  await settle();
  assert.equal(player.state("a"), "off");
  assert.equal(player.state("b"), "playing");
  assert.equal(ctx.sources.length, 2);
  assert.ok(ctx.sources[0].stopped !== null);
  player.want(null);
});

// ---------- the arrival's local part ----------

test("every city's hello says what it means, and how to say it where that helps, in both languages", () => {
  for (const c of CITIES) {
    const h = HELLO[c.id];
    assert.ok(h, `${c.id}: no hello`);
    assert.ok(h.means.zh && h.means.en, `${c.id}: what it means, in both languages`);
    // Not Latin letters: always how to say it (a Chinese reader reads Beijing's 您好 already).
    if (c.greeting.roman) assert.ok(h.say.en && (h.say.zh || c.id === "beijing"), `${c.id}: how to say it`);
    for (const s of [h.means.zh, h.means.en, h.say.zh ?? "", h.say.en ?? ""]) assert.doesNotMatch(s, TYPOGRAPHY, `${c.id}: ${s}`);
  }
});

test("every city has a time zone the browser knows: its local time now", () => {
  for (const c of CITIES) {
    assert.ok(TIME_ZONE[c.id], c.id);
    assert.match(localClock(c.id, NOW)?.time ?? "", /^([01]\d|2[0-3]):[0-5]\d$/, c.id);
  }
  // 12:00 UTC is 21:00 in Tokyo and 07:00 in New York (in November).
  const noon = Date.UTC(2026, 10, 2, 12, 0);
  assert.equal(localClock("tokyo", noon)?.time, "21:00");
  assert.equal(localClock("newyork", noon)?.time, "07:00");
});

test("prices in local money: every city's currency has a rate, rounded and written for each language", () => {
  for (const c of CITIES) assert.ok(RATES[CURRENCY[c.id]], `${c.id}: no rate for ${CURRENCY[c.id]}`);
  assert.equal(localMoney("tokyo", 250, "en"), "≈ ¥39,000");
  assert.equal(localMoney("tokyo", 250, "zh"), "约 3.9 万日元");
  assert.equal(localMoney("paris", 360, "en"), "≈ €320");
  assert.equal(localMoney("paris", 360, "zh"), "约 320 欧元");
  assert.equal(localMoney("seoul", 420, "zh"), "约 56 万韩元");
  assert.equal(localMoney("hongkong", 18, "en"), "≈ HK$140");
  // The game's $ is the dollar already in Las Vegas and New York: nothing to add.
  assert.equal(localMoney("lasvegas", 200, "en"), null);
  assert.equal(rateLine("newyork", "zh"), null);
  assert.equal(rateLine("istanbul", "en"), "$1 ≈ ₺50");
  for (const c of CITIES) for (const lang of ["zh", "en"] as const) assert.doesNotMatch(localMoney(c.id, 123, lang) ?? "", TYPOGRAPHY);
});
