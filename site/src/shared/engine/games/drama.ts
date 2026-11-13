import { ANY_SECRETS, ANY_TWISTS, GROUPS, PENALTIES, PK_LINES, PK_STYLES, SCENES, TASKS, type DramaDiff, type DramaGroup, type DramaLevel, type DramaScene } from "../../../data/drama";
import { CLASSICS, type ClassicScene, type ClassicSet } from "../../../data/dramaClassics";
import { READ_KINDS, READ_PASS, READINGS, readKind, type ReadKind, type ReadPiece, type ReadSet } from "../../../data/dramaReadings";
import type { T } from "../../../i18n";
import { cleanScene, hasText } from "../../dramaScene";
import type { DramaCard, DramaView } from "../../protocol";
import { clean, intIn, t, type Api, type GameDef } from "../api";

/**
 * 戏精大赏 · Drama Queens. Each round a few players act: in a scene, one of them is secretly the
 * culprit (the other woman, the killer, the mole) and everyone has a private card and a secret
 * task; in a duel, two players say the same line in two styles. The audience then guesses the
 * culprit and gives each actor 1 to 5 stars for how convincing they were.
 *
 * Who acts: each player says whether they want to go on stage or just watch (`want`, kept from
 * one scene to the next). The scene fits the volunteers, one to eight of them; a scene for one is a
 * monologue, and the audience picks the actor's real secret out of three. Nobody volunteering,
 * a few of those who don't mind go up, whoever has acted least first. With nobody left watching,
 * the actors vote on each other (never on themselves).
 *
 * Small tables (Steve on Nov 12: one person can start): with fewer than three at the table a scene
 * is a monologue, one actor and the rest guessing (two on stage voting on each other would always
 * catch the culprit), and a written scene waits for three. One person alone plays monologues and
 * readings: nobody at the table can vote, so the room guesses out loud (the big screen shows the
 * three secrets), the host reveals the answer, and nobody scores (`quietReveal`).
 *
 * 名场面 (`classic`): famous film and TV moments, from a Chinese set or an English one (the host
 * picks); no culprit, the audience gives stars, like the duel.
 *
 * 朗读 (`read`): one person reads a piece out loud, the way it asks (through tears, with a straight
 * face, as a breakup, a royal memorial...), from the Chinese internet, the English internet or a set
 * that works for both (the host picks, and can keep only some kinds). Volunteers take turns, whoever
 * has read least first. The audience gives stars: an average under three pays, five from everyone
 * takes the trophy. The lines reach the reader first, and every phone once the reading starts.
 *
 * Whose stories (`groups`): the host can pick any of the communities with scenes of their own
 * (Chinese, Canadian, South Asian, Filipino...). Their scenes come first; everyone's fill in when
 * they run out for the cast on stage. Other groups' scenes stay out.
 *
 * Points: a right guess 1; a culprit nobody pins 3; each actor their average stars, rounded.
 * The penalty: the actor(s) with the fewest stars, plus the culprit if caught, or else everyone
 * the culprit fooled. Best actor (most stars) takes a trophy.
 *
 * Players can write scenes too: one written at the table is played next (its writer on stage, so
 * they never guess their own story); the host's phone also brings scenes from the public library
 * (written by players, approved by the site's owner), which mix in with the built-in ones.
 */

type Mode = "show" | "pk" | "classic" | "read";
type Pen = "drink" | "move" | "prank";
type Want = "act" | "watch";
type Vote = { guess: string | null; stars: Record<string, number> };
/** A scene a player wrote: here at the table (`by` is their seat) or for the public library (`credit`). */
type Written = { id: string; scene: DramaScene; by: string | null; credit: string };
type S = {
  phase: DramaView["phase"];
  mode: Mode;
  level: DramaLevel;
  diff: DramaDiff;
  pen: Pen;
  total: number;
  /** how many acts the host picked: three more at the curtain call add to `total`, not to this */
  plan: number;
  round: number;
  /** scene ids already played, so none comes back until the library runs out */
  used: string[];
  /** a built-in scene (its index), or a written one in `cur` */
  scene: number | null;
  cur: Written | null;
  /** written at this table, played first, in order */
  mine: Written[];
  /** from the public library, mixed in with the built-in scenes */
  lib: Written[];
  /** how many scenes have been written here (for their ids) */
  wn: number;
  /** a generic secret for each role its writer left blank, and a generic twist */
  fill: Record<string, number>;
  twistPick: number;
  /** who wants to go on stage next, and who'd rather watch (no entry: either is fine) */
  want: Record<string, Want>;
  cast: string[];
  /** cast[i] plays roles[i] of the scene */
  roles: number[];
  /** a monologue: the order the audience sees the three secrets in (the true one is 0) */
  order: number[];
  /** 名场面: which set the host picked, and the famous scene on now (its index) */
  cset: ClassicSet;
  classic: number | null;
  /** whose stories come first (none: everyone's only) */
  groups: DramaGroup[];
  /** 朗读: which set the host picked, the kinds on (none: all), and the piece being read (its index) */
  rset: ReadSet;
  rkinds: ReadKind[];
  read: number | null;
  culprit: string | null;
  tasks: Record<string, number>;
  pk: { line: number; styles: Record<string, number> } | null;
  pkUsed: number[];
  ready: string[];
  endsAt: number;
  actMs: number;
  twistAt: number;
  twisted: boolean;
  votes: Record<string, Vote>;
  result: DramaView["result"];
  scores: Record<string, number>;
  acted: Record<string, number>;
  awards: Record<string, number>;
};

export const BRIEF_MS = 60_000;
/*
 * The most an act runs (Steve, Nov 12: every scene at least five minutes, a reading at least
 * three); the actors or the host call cut as soon as it's done. A scene, a monologue too: five
 * minutes, six when it's hard, half a minute more for each actor past four. A duel: five. A famous
 * scene: five, half a minute more for each actor past two. A reading: three (the longest piece
 * takes under two out loud).
 */
const ACT_MS: Record<DramaDiff, number> = { easy: 300_000, hard: 360_000 };
const PER_ACTOR_MS = 30_000;
const PK_MS = 300_000;
const CLASSIC_MS = 300_000;
const READ_MS = 180_000;
const VOTE_MS = 50_000;
/** the most on stage at once */
export const MAX_CAST = 8;

/**
 * How many act at once when nobody has volunteered: at least two, and keep two people watching
 * once the table allows (up to six on stage for a big table).
 */
export function castSize(n: number) {
  return Math.max(2, Math.min(6, n - 2));
}

/** The cast sizes a scene plays with: every role, or from `min` (the roles it can't do without) up. */
export function sceneSizes(sc: DramaScene): [number, number] {
  const hi = sc.roles.length;
  return [Math.max(1, Math.min(hi, sc.min ?? hi)), hi];
}

/** One scene the table could play: built in (its index) or written. */
type Option = { s: DramaScene; i: number | null; w: Written | null };

/** The scene on now, wherever it came from. */
function current(s: S): DramaScene | null {
  if (s.cur) return s.cur.scene;
  return s.scene !== null ? SCENES[s.scene] : null;
}

/** A monologue: one actor, and three secrets for the audience to choose from. */
const isSolo = (sc: DramaScene | null) => !!sc && sc.roles.length === 1 && (sc.secrets?.length ?? 0) >= 2;

/**
 * A scene for `lo` to `hi` actors: one not played yet at the table's difficulty, else at the other,
 * else one played before. Nothing written for that many (a last resort): the nearest in size. A
 * spicy table gets the spicy scenes first, then the rest. `k`: how many it is played with.
 */
function pickScene(s: S, lo: number, hi: number, api: Api): Option & { k: number } {
  // the host's groups' scenes and everyone's (another group's stay out)
  const groups = s.groups ?? [];
  const all: Option[] = [...SCENES.map((x, i) => ({ s: x, i, w: null })), ...s.lib.map((w) => ({ s: w.scene, i: null, w }))].filter((o) => !o.s.group || groups.includes(o.s.group));
  const key = (o: Option) => o.w?.id ?? o.s.id;
  const level = all.filter((o) => s.level === "spicy" || o.s.level === "all");
  const fits = (o: Option) => {
    const [a, b] = sceneSizes(o.s);
    return a <= hi && b >= lo;
  };
  // the groups' scenes first, then everyone's
  const tiers = groups.length ? [level.filter((o) => !!o.s.group), level.filter((o) => !o.s.group)] : [level];
  const same = (tier: Option[]) => tier.filter((o) => o.s.diff === s.diff && fits(o));
  const other = (tier: Option[]) => tier.filter((o) => o.s.diff !== s.diff && fits(o));
  const fresh = (list: Option[]) => list.filter((o) => !s.used.includes(key(o)));
  const again = (list: Option[]) => {
    // all of them played: start them over
    s.used = s.used.filter((id) => !list.some((o) => key(o) === id));
    return list;
  };
  let list: Option[] = [];
  for (const tier of tiers) {
    list = fresh(same(tier));
    if (!list.length) list = fresh(other(tier));
    if (list.length) break;
  }
  for (const tier of tiers) {
    if (list.length) break;
    if (same(tier).length) list = again(same(tier));
    else if (other(tier).length) list = again(other(tier));
  }
  if (!list.length) {
    const pool = level.length ? level : all;
    const gap = (o: Option) => {
      const [a, b] = sceneSizes(o.s);
      return a > hi ? a - hi : lo - b;
    };
    const best = Math.min(...pool.map(gap));
    list = pool.filter((o) => gap(o) === best);
  }
  if (s.level === "spicy") {
    const hot = list.filter((o) => o.s.level === "spicy");
    if (hot.length) list = hot;
  }
  const pick = list[api.int(list.length)];
  if (!s.used.includes(key(pick))) s.used.push(key(pick));
  // as many as the scene takes, within what the table offers (a last resort: fewer than it needs)
  return { ...pick, k: Math.min(sceneSizes(pick.s)[1], hi) };
}

/** Which of a scene's roles are on with `k` actors: the ones it can't do without, then any of the rest. */
function rolesFor(sc: DramaScene, k: number, api: Api): number[] {
  const all = sc.roles.map((_, i) => i);
  const [lo, hi] = sceneSizes(sc);
  if (k >= hi) return all;
  if (k >= lo) return [...all.slice(0, lo), ...api.shuffle(all.slice(lo)).slice(0, k - lo)].sort((a, b) => a - b);
  // fewer actors than it needs (a last resort): any k of its roles
  return api.shuffle(all).slice(0, k).sort((a, b) => a - b);
}

/** Whoever has acted least goes first (ties at random). */
function byTurns(s: S, ids: string[], api: Api): string[] {
  const out = api.shuffle(ids);
  out.sort((a, b) => (s.acted[a] ?? 0) - (s.acted[b] ?? 0));
  return out;
}

/** Who said they want to act, and who doesn't mind either way (the rest only watch). */
function lineup(s: S, api: Api) {
  const ids = api.ids();
  // (a table that started before players could choose has no choices yet)
  const want = s.want ?? {};
  return { ids, vol: ids.filter((p) => want[p] === "act"), free: ids.filter((p) => !want[p]) };
}

/**
 * The next scene written at this table, if it can be played now: its writer and at least one more.
 * `turns` false only counts them (a view mustn't roll dice).
 */
function nextWritten(s: S, api: Api, turns = true): { w: Written; order: string[] } | null {
  const w = s.mine.find((x) => !s.used.includes(x.id));
  if (!w) return null;
  const { ids, vol, free } = lineup(s, api);
  // its writer is always on stage (so nobody guesses a story they wrote), then the volunteers
  const writer = w.by && ids.includes(w.by) ? w.by : null;
  const sort = (list: string[]) => (turns ? byTurns(s, list, api) : list);
  const order = [...(writer ? [writer] : []), ...sort(vol.filter((p) => p !== writer)), ...sort(free.filter((p) => p !== writer))];
  return order.length >= 2 ? { w, order: order.slice(0, w.scene.roles.length) } : null;
}

/**
 * Who goes on next, for the setup and reveal screens: `lo` to `hi` actors (the same number, once
 * anyone has volunteered), or `ok` false when nobody can (everyone only wants to watch).
 */
function upNext(s: S, api: Api): { lo: number; hi: number; ok: boolean; auto: boolean } {
  const { ids, vol, free } = lineup(s, api);
  if (s.mode === "pk") return { lo: 2, hi: 2, ok: vol.length + free.length >= 2, auto: !vol.length };
  // one reader at a time
  if (s.mode === "read") return { lo: 1, hi: 1, ok: vol.length + free.length >= 1, auto: !vol.length };
  if (s.mode === "classic") {
    // famous scenes take two at the table (one person alone plays monologues and readings)
    if (ids.length < 2) return { lo: 1, hi: 1, ok: false, auto: true };
    // as many as the biggest famous scene takes
    const most = Math.max(...classicPool(s).map((c) => c.roles.length));
    if (vol.length) {
      const k = Math.min(most, vol.length);
      return { lo: k, hi: k, ok: true, auto: false };
    }
    const hi = Math.min(castSize(ids.length), free.length, most);
    return { lo: Math.min(2, hi), hi, ok: hi > 0, auto: true };
  }
  // fewer than three at the table: one acts a monologue, the rest guess
  const few = ids.length < 3;
  const w = few ? null : nextWritten(s, api, false);
  if (w) return { lo: w.order.length, hi: w.order.length, ok: true, auto: false };
  if (vol.length) {
    const k = few ? 1 : Math.min(MAX_CAST, vol.length);
    return { lo: k, hi: k, ok: true, auto: false };
  }
  const hi = Math.min(few ? 1 : castSize(ids.length), free.length);
  return { lo: Math.min(2, hi), hi, ok: hi > 0, auto: true };
}

/** The famous scenes this table can draw: the host's set, at its spice level. */
function classicPool(s: S): ClassicScene[] {
  const set = s.cset ?? "zh";
  const pool = CLASSICS.filter((c) => c.set === set && (s.level === "spicy" || c.level === "all"));
  return pool.length ? pool : CLASSICS.filter((c) => c.set === set);
}

/** A famous scene for `lo` to `hi` actors, not played yet if there's one left; `k`: how many play it. */
function pickClassic(s: S, lo: number, hi: number, api: Api): { i: number; k: number } {
  const pool = classicPool(s).map((c) => ({ c, i: CLASSICS.indexOf(c) }));
  const fits = pool.filter(({ c }) => Math.min(c.min ?? c.roles.length, c.roles.length) <= hi && c.roles.length >= lo);
  const list = fits.length ? fits : pool;
  let fresh = list.filter(({ c }) => !s.used.includes(c.id));
  if (!fresh.length) {
    s.used = s.used.filter((id) => !list.some(({ c }) => c.id === id));
    fresh = list;
  }
  const pick = fresh[api.int(fresh.length)];
  s.used.push(pick.c.id);
  return { i: pick.i, k: Math.max(1, Math.min(pick.c.roles.length, hi)) };
}

/** The pieces this table can draw: the host's set and kinds, at its spice level (too few: the whole set). */
function readPool(s: S): ReadPiece[] {
  const set = s.rset ?? "zh";
  const kinds = s.rkinds ?? [];
  const inSet = READINGS.filter((r) => r.set === set);
  const pool = inSet.filter((r) => (!kinds.length || kinds.includes(r.kind)) && (s.level === "spicy" || r.level === "all"));
  return pool.length ? pool : inSet;
}

/**
 * A piece not read yet at this table, from the kind read least so far (so the kinds take turns);
 * all of them read, they start over. Its index in `READINGS`.
 */
function pickReading(s: S, api: Api): number {
  const pool = readPool(s);
  let fresh = pool.filter((r) => !s.used.includes(r.id));
  if (!fresh.length) {
    s.used = s.used.filter((id) => !pool.some((r) => r.id === id));
    fresh = pool;
  }
  const read = (k: ReadKind) => s.used.filter((id) => pool.some((r) => r.id === id && r.kind === k)).length;
  const least = Math.min(...fresh.map((r) => read(r.kind)));
  const list = fresh.filter((r) => read(r.kind) === least);
  const pick = list[api.int(list.length)];
  s.used.push(pick.id);
  return READINGS.indexOf(pick);
}

/** A famous scene's parts for `k` actors: the ones it can't do without, then any of the rest. */
function rolesForClassic(c: ClassicScene, k: number, api: Api): number[] {
  const all = c.roles.map((_, i) => i);
  const lo = Math.min(c.min ?? all.length, all.length);
  if (k >= all.length) return all;
  if (k >= lo) return [...all.slice(0, lo), ...api.shuffle(all.slice(lo)).slice(0, k - lo)].sort((a, b) => a - b);
  return all.slice(0, k);
}

function newRound(s: S, api: Api) {
  s.votes = {};
  s.ready = [];
  s.result = null;
  s.twisted = false;
  s.twistAt = 0;
  s.tasks = {};
  s.culprit = null;
  s.pk = null;
  s.scene = null;
  s.cur = null;
  s.fill = {};
  s.roles = [];
  s.order = [];
  s.classic = null;
  s.read = null;
  const { ids, vol, free } = lineup(s, api);
  if (s.mode === "read") {
    // one reader: a volunteer, else one of those who don't mind; whoever has read least first
    s.cast = byTurns(s, vol.length ? vol : free, api).slice(0, 1);
    s.read = pickReading(s, api);
  } else if (s.mode === "classic") {
    // a famous scene for the volunteers (as many as it takes), else a few of those who don't mind
    const most = Math.max(...classicPool(s).map((c) => c.roles.length));
    const people = byTurns(s, vol.length ? vol : free, api);
    const hi = Math.min(vol.length ? vol.length : Math.min(castSize(ids.length), people.length), most);
    const pick = pickClassic(s, vol.length ? hi : Math.min(2, hi), hi, api);
    s.classic = pick.i;
    s.roles = rolesForClassic(CLASSICS[pick.i], pick.k, api);
    s.cast = api.shuffle(people.slice(0, s.roles.length));
  } else if (s.mode === "pk") {
    s.cast = [...byTurns(s, vol, api), ...byTurns(s, free, api)].slice(0, 2);
    let lines = PK_LINES.map((_, i) => i).filter((i) => !s.pkUsed.includes(i));
    if (!lines.length) {
      s.pkUsed = [];
      lines = PK_LINES.map((_, i) => i);
    }
    const line = lines[api.int(lines.length)];
    s.pkUsed.push(line);
    const styles = api.shuffle(PK_STYLES.map((x, i) => ({ x, i })).filter(({ x }) => s.level === "spicy" || x.level === "all")).slice(0, 2);
    s.pk = { line, styles: Object.fromEntries(s.cast.map((pid, j) => [pid, styles[j % styles.length].i])) };
  } else {
    // a scene written here tonight goes first; else one for the volunteers, all of them (up to
    // eight); else two to a few of those who don't mind. Fewer than three at the table: a monologue
    const few = ids.length < 3;
    const mine = few ? null : nextWritten(s, api);
    let pick: Option & { k: number };
    let people: string[];
    if (mine) {
      s.used.push(mine.w.id);
      pick = { s: mine.w.scene, i: null, w: mine.w, k: mine.order.length };
      people = mine.order;
    } else if (vol.length) {
      const k = few ? 1 : Math.min(MAX_CAST, vol.length);
      pick = pickScene(s, k, k, api);
      people = byTurns(s, vol, api);
    } else {
      const hi = Math.min(few ? 1 : castSize(ids.length), free.length);
      pick = pickScene(s, Math.min(2, hi), hi, api);
      people = byTurns(s, free, api);
    }
    const scene = pick.s;
    s.scene = pick.i;
    s.cur = pick.w;
    s.roles = rolesFor(scene, pick.k, api);
    s.cast = api.shuffle(people.slice(0, s.roles.length));
    s.culprit = s.cast[api.int(s.cast.length)];
    const tasks = api.shuffle(TASKS[s.diff].map((_, i) => i));
    s.cast.forEach((pid, j) => (s.tasks[pid] = tasks[j % tasks.length]));
    if (isSolo(scene)) s.order = api.shuffle(scene.secrets!.map((_, i) => i));
    else {
      // a role whose writer left its secret blank gets a generic one (no two the same)
      const secrets = api.shuffle(ANY_SECRETS.map((_, i) => i));
      s.cast.forEach((pid, j) => {
        if (!hasText(scene.roles[s.roles[j]].alibi)) s.fill[pid] = secrets[j % secrets.length];
      });
    }
    s.twistPick = api.int(ANY_TWISTS.length);
  }
  for (const pid of s.cast) s.acted[pid] = (s.acted[pid] ?? 0) + 1;
  s.phase = "brief";
  s.endsAt = api.now + BRIEF_MS;
  api.timer("brief", s.endsAt);
  api.fx("card");
}

/** How long the scene runs: a duel, a famous scene, a monologue, or a scene, longer for a big cast. */
function actLength(s: S): number {
  if (s.mode === "pk") return PK_MS;
  if (s.mode === "read") return READ_MS;
  if (s.mode === "classic") return CLASSIC_MS + Math.max(0, s.cast.length - 2) * PER_ACTOR_MS;
  return ACT_MS[s.diff] + Math.max(0, s.cast.length - 4) * PER_ACTOR_MS;
}

function startAct(s: S, api: Api) {
  api.clear("brief");
  s.phase = "act";
  s.actMs = actLength(s);
  s.endsAt = api.now + s.actMs;
  api.timer("act", s.endsAt);
  if (s.mode === "show") {
    s.twistAt = api.now + Math.round(s.actMs / 2);
    api.timer("twist", s.twistAt);
  }
  api.fx("start");
}

function audience(s: S, api: Api) {
  return api.ids().filter((pid) => !s.cast.includes(pid));
}

/** With nobody left in the audience, the actors vote on each other. */
const peerVote = (s: S, api: Api) => s.cast.length > 1 && audience(s, api).length === 0;

/** Who votes: the audience, or else the actors still at the table. */
function voters(s: S, api: Api): string[] {
  return peerVote(s, api) ? s.cast.filter((pid) => api.has(pid)) : audience(s, api);
}

function startVote(s: S, api: Api) {
  api.clear("act");
  api.clear("twist");
  s.twisted = s.mode === "show";
  // nobody here can vote (one person, alone on stage): a reading ends on the applause; a monologue
  // still leaves the room its guess, out loud, until the host reveals it
  if (!voters(s, api).length && s.mode !== "show") {
    quietReveal(s, api);
    return;
  }
  s.phase = "vote";
  s.votes = {};
  s.endsAt = api.now + VOTE_MS;
  api.timer("vote", s.endsAt);
  api.fx("timeup");
}

function everyoneVoted(s: S, api: Api) {
  const vs = voters(s, api);
  return vs.length > 0 && vs.every((pid) => s.votes[pid]);
}

function penaltyText(s: S, api: Api): T | null {
  if (s.pen === "drink") return null;
  const list = s.pen === "move" ? PENALTIES.move[s.diff] : s.level === "spicy" ? [...PENALTIES.prank.all, ...PENALTIES.prank.spicy] : PENALTIES.prank.all;
  return list[api.int(list.length)];
}

function card(s: S, pid: string): DramaCard | null {
  if (!s.cast.includes(pid)) return null;
  if (s.mode === "pk" && s.pk) return { secret: PK_STYLES[s.pk.styles[pid]].s, culprit: false, task: t("", "") };
  // a famous scene or a reading keeps nothing secret: the part (or the piece) is on every phone
  if (s.mode === "classic" || s.mode === "read") return { secret: t("", ""), culprit: false, task: t("", "") };
  const scene = current(s);
  if (!scene) return null;
  const task = TASKS[s.diff][s.tasks[pid] ?? 0];
  // a monologue: the actor's real secret, and what to do about it
  if (isSolo(scene)) return { secret: scene.culpritCard, culprit: false, task };
  const role = scene.roles[s.roles[s.cast.indexOf(pid)]];
  const culprit = s.culprit === pid;
  const alibi = hasText(role.alibi) ? role.alibi : ANY_SECRETS[s.fill[pid] ?? 0];
  return { secret: culprit ? scene.culpritCard : alibi, culprit, task };
}

/** The twist: the writer's, or a generic one. */
function twistOf(s: S, scene: DramaScene): T {
  return hasText(scene.twist) ? scene.twist : ANY_TWISTS[s.twistPick % ANY_TWISTS.length];
}

/** What a written scene arrives as from a phone (the form, or the public library). */
function written(raw: unknown, id: string, by: string | null, credit: string): Written | null {
  const r = cleanScene(raw);
  if ("error" in r) return null;
  return { id, scene: { ...r.scene, id }, by, credit };
}

/** A monologue's answer: where the true secret sits in the order the audience saw. */
const answerOf = (s: S) => (s.order?.length ? s.order.indexOf(0) : null);

function reveal(s: S, api: Api) {
  api.clear("vote");
  const vs = voters(s, api);
  const solo = isSolo(current(s));
  const counts: Record<string, number> = {};
  const sums: Record<string, { n: number; sum: number }> = {};
  for (const pid of s.cast) sums[pid] = { n: 0, sum: 0 };
  // the votes for each suspect, or in a monologue for each of the three secrets
  if (solo) s.order.forEach((_, i) => (counts[String(i)] = 0));
  else for (const pid of s.cast) counts[pid] = 0;
  for (const voter of vs) {
    const v = s.votes[voter];
    if (!v) continue;
    if (v.guess && counts[v.guess] !== undefined) counts[v.guess] += 1;
    for (const pid of s.cast) {
      const st = pid === voter ? 0 : v.stars[pid];
      if (st) {
        sums[pid].n += 1;
        sums[pid].sum += st;
      }
    }
  }
  const stars: Record<string, number> = {};
  for (const pid of s.cast) stars[pid] = sums[pid].n ? Math.round((sums[pid].sum / sums[pid].n) * 10) / 10 : 0;
  const rated = s.cast.filter((pid) => sums[pid].n > 0);
  const hi = Math.max(0, ...rated.map((pid) => stars[pid]));
  const lo = Math.min(6, ...rated.map((pid) => stars[pid]));
  const reading = s.mode === "read";
  // best actor is a contest: a monologue has nobody to beat. A reading has a bar instead: five
  // stars from everyone takes the trophy, under three pays
  const best = reading ? rated.filter((pid) => stars[pid] >= 5) : rated.length > 1 ? rated.filter((pid) => stars[pid] === hi) : [];
  // with everyone level, nobody stands out as the worst
  const worst = reading ? rated.filter((pid) => stars[pid] < READ_PASS) : rated.length && lo < hi ? rated.filter((pid) => stars[pid] === lo) : [];

  const gained: Record<string, number> = {};
  const add = (pid: string, n: number) => {
    if (!n) return;
    gained[pid] = (gained[pid] ?? 0) + n;
    s.scores[pid] = (s.scores[pid] ?? 0) + n;
  };
  for (const pid of s.cast) add(pid, Math.round(stars[pid]));

  let caught = false;
  let right: string[] = [];
  const losers = new Set(worst);
  if (s.mode === "show" && s.culprit) {
    // the culprit (in a monologue, the actor's real secret) is caught by the most votes; the
    // culprit's own vote, with the actors voting, never counts as fooled
    const target = solo ? String(answerOf(s)) : s.culprit;
    const top = Math.max(0, ...Object.values(counts));
    caught = top > 0 && counts[target] === top;
    right = vs.filter((pid) => s.votes[pid]?.guess === target);
    for (const pid of right) add(pid, 1);
    if (caught) losers.add(s.culprit);
    else {
      add(s.culprit, 3);
      for (const pid of vs) if (pid !== s.culprit && s.votes[pid] && s.votes[pid].guess !== target) losers.add(pid);
    }
  }
  for (const pid of best) s.awards[pid] = (s.awards[pid] ?? 0) + 1;

  const cards: Record<string, DramaCard> = {};
  for (const pid of s.cast) {
    const c = card(s, pid);
    if (c) cards[pid] = c;
  }
  const say = losers.size ? penaltyText(s, api) : null;
  s.result = { culprit: s.culprit, caught, counts, stars, cards, best, losers: [...losers], right, penalty: say, gained, answer: answerOf(s) };
  s.phase = "reveal";
  api.fx(caught || s.mode !== "show" ? "reveal" : "wrong", s.culprit ?? undefined);
  if (best.length) api.fx("award", best[0]);
  if (losers.size) {
    const sc = current(s);
    const note =
      s.mode === "show" && sc ? sc.title : s.mode === "classic" && s.classic !== null ? CLASSICS[s.classic].title : reading && s.read !== null ? READINGS[s.read].title : PK_LINES[s.pk?.line ?? 0];
    // after the reveal has played (drum roll, mask, cards, trophy) and been read
    api.penalty([...losers], "sip", note, { delay: s.mode === "show" ? 8000 : 5500, ...(say ? { say } : {}) });
  }
}

/**
 * The truth without a count: nobody voted, or nobody at the table could (one person, on stage).
 * The answer and every card come out; no points, no best actor, no penalty.
 */
function quietReveal(s: S, api: Api) {
  api.clear("vote");
  const cards: Record<string, DramaCard> = {};
  for (const pid of s.cast) {
    const c = card(s, pid);
    if (c) cards[pid] = c;
  }
  s.result = { culprit: s.culprit, caught: false, counts: {}, stars: {}, cards, best: [], losers: [], right: [], penalty: null, gained: {}, answer: answerOf(s), quiet: true };
  s.phase = "reveal";
  api.fx("reveal");
}

function finish(s: S, api: Api) {
  s.phase = "end";
  api.fx("win");
  const ids = api.ids();
  const lo = Math.min(...ids.map((pid) => s.scores[pid] ?? 0));
  const last = ids.filter((pid) => (s.scores[pid] ?? 0) === lo);
  if (last.length && last.length < ids.length) {
    const say = penaltyText(s, api);
    api.penalty(last, "two", t("戏精大赏：最后一名", "Drama Queens: last place"), { delay: 3000, ...(say ? { say } : {}) });
  }
}

export const drama: GameDef<S> = {
  id: "drama",
  min: 1,
  init() {
    return {
      phase: "setup",
      mode: "show",
      level: "all",
      diff: "easy",
      pen: "drink",
      total: 5,
      plan: 5,
      round: 0,
      used: [],
      scene: null,
      cur: null,
      mine: [],
      lib: [],
      wn: 0,
      fill: {},
      twistPick: 0,
      want: {},
      cast: [],
      roles: [],
      order: [],
      cset: "zh",
      classic: null,
      groups: [],
      rset: "zh",
      rkinds: [],
      read: null,
      culprit: null,
      tasks: {},
      pk: null,
      pkUsed: [],
      ready: [],
      endsAt: 0,
      actMs: 0,
      twistAt: 0,
      twisted: false,
      votes: {},
      result: null,
      scores: {},
      acted: {},
      awards: {},
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    // a table that started before players could choose who acts
    s.want ??= {};
    s.order ??= [];
    s.cset ??= "zh";
    s.classic ??= null;
    s.groups ??= [];
    s.rset ??= "zh";
    s.rkinds ??= [];
    s.read ??= null;
    s.plan ??= s.total;
    switch (g.x) {
      case "config": {
        if (!host || s.phase !== "setup") return;
        if (g.mode === "show" || g.mode === "pk" || g.mode === "classic" || g.mode === "read") s.mode = g.mode;
        if (g.cset === "zh" || g.cset === "en") s.cset = g.cset;
        if (g.rset === "zh" || g.rset === "en" || g.rset === "both") s.rset = g.rset;
        if (Array.isArray(g.rkinds)) s.rkinds = READ_KINDS.map((k) => k.key).filter((k) => (g.rkinds as unknown[]).includes(k));
        if (Array.isArray(g.groups)) s.groups = GROUPS.map((x) => x.key).filter((k) => (g.groups as unknown[]).includes(k));
        if (g.level === "all" || g.level === "spicy") s.level = g.level;
        if (g.diff === "easy" || g.diff === "hard") s.diff = g.diff;
        if (g.pen === "drink" || g.pen === "move" || g.pen === "prank") s.pen = g.pen;
        const total = intIn(g.total, 1, 20);
        if (total !== null && g.total !== undefined) s.total = s.plan = total;
        return;
      }
      case "want": {
        // on stage next, or just watching: each player says for themselves (the one phone, for anyone)
        const who = typeof g.who === "string" ? g.who : pid;
        if (!api.ids().includes(who) || (who !== pid && !host)) return;
        if (g.want === "act" || g.want === "watch") s.want[who] = g.want;
        else delete s.want[who];
        return;
      }
      case "start": {
        if (!host || s.phase !== "setup" || !upNext(s, api).ok) return;
        s.round = 1;
        newRound(s, api);
        return;
      }
      case "ready": {
        if (s.phase !== "brief" || !s.cast.includes(pid) || s.ready.includes(pid)) return;
        s.ready.push(pid);
        if (s.cast.every((c) => s.ready.includes(c) || !api.has(c))) startAct(s, api);
        return;
      }
      case "go": {
        if (!host || s.phase !== "brief") return;
        startAct(s, api);
        return;
      }
      case "cut": {
        // the scene's done before the clock: on to the vote
        if (s.phase !== "act" || (!host && !s.cast.includes(pid))) return;
        startVote(s, api);
        return;
      }
      case "vote": {
        // the audience votes; with nobody watching, the actors do, on everyone but themselves
        if (s.phase !== "vote" || !api.has(pid) || s.cast.includes(pid) !== peerVote(s, api)) return;
        const others = s.cast.filter((c) => c !== pid);
        const raw = (g.stars ?? {}) as Record<string, unknown>;
        const stars: Record<string, number> = {};
        for (const c of others) {
          const n = intIn(raw[c], 1, 5);
          if (n !== null && raw[c] !== undefined) stars[c] = n;
        }
        // a suspect (never yourself), or in a monologue one of the three secrets
        const solo = s.order.length > 0;
        const guess =
          s.mode !== "show" || typeof g.guess !== "string" ? null : solo ? (/^\d$/.test(g.guess) && Number(g.guess) < s.order.length ? g.guess : null) : others.includes(g.guess) ? g.guess : null;
        if (s.mode === "show" && !guess) return;
        if (Object.keys(stars).length !== others.length) return;
        s.votes[pid] = { guess, stars };
        if (everyoneVoted(s, api)) reveal(s, api);
        return;
      }
      case "reveal": {
        // the host needn't wait for the last votes; with nobody here able to vote, the host's tap
        // is the reveal
        if (!host || s.phase !== "vote") return;
        if (Object.keys(s.votes).length) reveal(s, api);
        else if (!voters(s, api).length) quietReveal(s, api);
        return;
      }
      case "skip": {
        // a new scene with a new cast (someone left, or nobody likes this one)
        if (!host || (s.phase !== "brief" && s.phase !== "act") || !upNext(s, api).ok) return;
        for (const c of s.cast) s.acted[c] = Math.max(0, (s.acted[c] ?? 1) - 1);
        api.clear("brief");
        api.clear("act");
        api.clear("twist");
        newRound(s, api);
        return;
      }
      case "next": {
        if (!host || s.phase !== "reveal") return;
        if (s.round >= s.total) {
          finish(s, api);
          return;
        }
        if (!upNext(s, api).ok) return;
        s.round += 1;
        newRound(s, api);
        return;
      }
      case "more": {
        if (!host || s.phase !== "end" || !upNext(s, api).ok) return;
        s.total += 3;
        s.round += 1;
        newRound(s, api);
        return;
      }
      case "setup": {
        // between acts or at the curtain call, back to the setup to play it another way: the
        // night's scores, the scenes written here and the ones already played all stay, and the
        // acts count again from the number the host picks
        if (!host || (s.phase !== "reveal" && s.phase !== "end")) return;
        for (const k of ["brief", "act", "twist", "vote"]) api.clear(k);
        Object.assign(s, { phase: "setup", round: 0, total: s.plan, scene: null, cur: null, cast: [], roles: [], order: [], classic: null, read: null, culprit: null, tasks: {}, pk: null, ready: [], endsAt: 0, actMs: 0, twistAt: 0, twisted: false, votes: {}, result: null } satisfies Partial<S>);
        return;
      }
      case "write": {
        // anyone at the table may add a scene; it's played next
        if (!api.ids().includes(pid)) return;
        const waiting = s.mine.filter((w) => !s.used.includes(w.id));
        if (waiting.length >= 8 || waiting.filter((w) => w.by === pid).length >= 4) return;
        const w = written(g.scene, `w${++s.wn}`, pid, "");
        if (!w) return;
        s.mine.push(w);
        // a long night keeps the table small: the oldest played scenes go
        while (s.mine.length > 16) {
          const old = s.mine.findIndex((x) => s.used.includes(x.id) && x !== s.cur);
          if (old < 0) break;
          s.mine.splice(old, 1);
        }
        return;
      }
      case "unwrite": {
        // its writer or the host takes back a scene that hasn't been played
        const w = s.mine.find((x) => x.id === g.id);
        if (!w || s.used.includes(w.id) || (w.by !== pid && !host)) return;
        s.mine = s.mine.filter((x) => x !== w);
        return;
      }
      case "lib": {
        // the host's phone brings scenes from the public library
        if (!host || !Array.isArray(g.scenes)) return;
        for (const raw of g.scenes.slice(0, 6)) {
          if (s.lib.length >= 16 || !raw || typeof raw !== "object") break;
          const o = raw as { id?: unknown; scene?: unknown; name?: unknown; by?: unknown };
          const id = `l${clean(o.id, 12)}`;
          if (id === "l" || s.lib.some((x) => x.id === id)) continue;
          const by = typeof o.by === "string" && api.ids().includes(o.by) ? o.by : null;
          const w = written(o.scene, id, by, clean(o.name, 24));
          if (w) s.lib.push(w);
        }
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "brief" && s.phase === "brief") startAct(s, api);
    else if (key === "twist" && s.phase === "act") {
      s.twisted = true;
      api.fx("reveal");
    } else if (key === "act" && s.phase === "act") startVote(s, api);
    else if (key === "vote" && s.phase === "vote") {
      if (Object.keys(s.votes).length) reveal(s, api);
      // nobody voted: the scene still ends, without points
      else quietReveal(s, api);
    }
  },

  leave(s, pid, api) {
    delete s.votes[pid];
    if (s.phase === "vote" && Object.keys(s.votes).length && everyoneVoted(s, api)) reveal(s, api);
    if (s.phase === "brief" && s.cast.length && s.cast.every((c) => s.ready.includes(c) || !api.has(c) || c === pid)) startAct(s, api);
  },

  view(s, pid, api): DramaView {
    const scene = current(s);
    const live = s.phase !== "setup" && s.phase !== "end";
    const ids = api.ids();
    const cl = live && s.mode === "classic" && s.classic !== null ? CLASSICS[s.classic] : null;
    const rd = live && s.mode === "read" && s.read !== null ? READINGS[s.read] : null;
    // the words: the reader has them to read over first; everyone else once the reading starts
    const words = !!rd && (s.phase !== "brief" || s.cast.includes(pid));
    return {
      id: "drama",
      phase: s.phase,
      mode: s.mode,
      level: s.level,
      diff: s.diff,
      pen: s.pen,
      round: s.round,
      total: s.total,
      scene: live && scene ? { id: scene.id, kind: scene.kind, title: scene.title, setup: scene.setup, ask: scene.ask, culprit: scene.culprit, ...(scene.group ? { group: scene.group } : {}) } : null,
      cast: live
        ? s.cast.map((c, j) => {
            if (scene) return { pid: c, role: scene.roles[s.roles[j]].name, brief: scene.roles[s.roles[j]].brief };
            // a famous scene: the part, how to play it, and the line to open with
            if (cl) return { pid: c, role: cl.roles[s.roles[j]].name, brief: cl.roles[s.roles[j]].play, first: cl.roles[s.roles[j]].first };
            // a reading: the way it's read, and this piece's own direction
            if (rd) return { pid: c, role: readKind(rd.kind)?.name ?? t("朗读", "Reading"), brief: rd.how };
            return { pid: c, role: s.pk ? PK_STYLES[s.pk.styles[c]].s : t("", ""), brief: t("", "") };
          })
        : [],
      cset: s.cset ?? "zh",
      groups: s.groups ?? [],
      classic: cl ? { id: cl.id, set: cl.set, show: cl.show, year: cl.year, title: cl.title, setup: cl.setup, beats: cl.beats, see: cl.see } : null,
      rset: s.rset ?? "zh",
      rkinds: s.rkinds ?? [],
      read: rd ? { id: rd.id, set: rd.set, kind: rd.kind, title: rd.title, how: rd.how, lines: words ? rd.lines : [] } : null,
      pk: live && s.pk ? { line: PK_LINES[s.pk.line], styles: Object.fromEntries(Object.entries(s.pk.styles).map(([c, i]) => [c, PK_STYLES[i].s])) } : null,
      me: (s.phase === "brief" || s.phase === "act" || s.phase === "vote") ? card(s, pid) : null,
      ready: s.ready,
      endsAt: s.endsAt,
      actMs: s.actMs,
      twistAt: s.twistAt,
      twist: scene && (s.twisted || s.phase === "vote" || s.phase === "reveal") ? twistOf(s, scene) : null,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      result: s.phase === "reveal" ? s.result : null,
      scores: s.scores,
      awards: s.awards,
      credit: live && s.cur ? { pid: s.cur.by, name: s.cur.credit } : null,
      // what's been written here: titles only, the cards stay secret until played
      mine: s.mine.map((w) => ({ id: w.id, title: w.scene.title, by: w.by, played: s.used.includes(w.id) })),
      lib: s.lib.length,
      want: Object.fromEntries(Object.entries(s.want ?? {}).filter(([p]) => ids.includes(p))),
      next: upNext(s, api),
      peer: live && peerVote(s, api),
      crowd: live && !voters(s, api).length,
      // a monologue's three secrets, for the audience to choose from
      options: live && isSolo(scene) && s.order?.length ? s.order.map((i) => scene!.secrets![i]) : null,
    };
  },
};
