import { ANY_SECRETS, ANY_TWISTS, PENALTIES, PK_LINES, PK_STYLES, SCENES, TASKS, type DramaDiff, type DramaLevel, type DramaScene } from "../../../data/drama";
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
 * Points: a right guess 1; a culprit nobody pins 3; each actor their average stars, rounded.
 * The penalty: the actor(s) with the fewest stars, plus the culprit if caught, or else everyone
 * the culprit fooled. Best actor (most stars) takes a trophy.
 *
 * Players can write scenes too: one written at the table is played next (its writer on stage, so
 * they never guess their own story); the host's phone also brings scenes from the public library
 * (written by players, approved by the site's owner), which mix in with the built-in ones.
 */

type Mode = "show" | "pk";
type Pen = "drink" | "move" | "prank";
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
  cast: string[];
  /** cast[i] plays roles[i] of the scene */
  roles: number[];
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
const ACT_MS: Record<DramaDiff, number> = { easy: 90_000, hard: 120_000 };
const PK_MS = 45_000;
const VOTE_MS = 50_000;

/** How many act at once: at least two, and keep two people watching once the table allows. */
export function castSize(n: number) {
  return Math.max(2, Math.min(4, n - 2));
}

/** One scene the table could play: built in (its index) or written. */
type Option = { s: DramaScene; i: number | null; w: Written | null };

const fitsTable = (sc: DramaScene, level: DramaLevel, diff: DramaDiff) => sc.diff === diff && (level === "spicy" || sc.level === "all");

/** The scene on now, wherever it came from. */
function current(s: S): DramaScene | null {
  if (s.cur) return s.cur.scene;
  return s.scene !== null ? SCENES[s.scene] : null;
}

function pickScene(s: S, n: number, api: Api): Option {
  // a scene written here tonight goes first
  const mine = s.mine.find((w) => !s.used.includes(w.id));
  if (mine) {
    s.used.push(mine.id);
    return { s: mine.scene, i: null, w: mine };
  }
  const max = castSize(n);
  const all: Option[] = [...SCENES.map((x, i) => ({ s: x, i, w: null })), ...s.lib.map((w) => ({ s: w.scene, i: null, w }))];
  const key = (o: Option) => o.w?.id ?? o.s.id;
  let pool = all.filter((o) => fitsTable(o.s, s.level, s.diff));
  if (!pool.length) pool = all;
  const fits = pool.filter((o) => o.s.roles.length <= max);
  let fresh = (fits.length ? fits : pool).filter((o) => !s.used.includes(key(o)));
  if (!fresh.length) {
    // everything has been played: start the library over
    s.used = s.used.filter((id) => !pool.some((o) => key(o) === id));
    fresh = fits.length ? fits : pool;
  }
  // a spicy table gets the spicy scenes first, then the rest
  if (s.level === "spicy") {
    const hot = fresh.filter((o) => o.s.level === "spicy");
    if (hot.length) fresh = hot;
  }
  const pick = fresh[api.int(fresh.length)];
  s.used.push(key(pick));
  return pick;
}

/** Whoever has acted least goes on next (ties at random); a scene's writer is always in it. */
function pickCast(s: S, k: number, api: Api, must: string | null = null): string[] {
  const ids = api.shuffle(api.ids());
  ids.sort((a, b) => (s.acted[a] ?? 0) - (s.acted[b] ?? 0));
  if (must && ids.includes(must)) return [must, ...ids.filter((x) => x !== must)].slice(0, k);
  return ids.slice(0, k);
}

function newRound(s: S, api: Api) {
  const n = api.ids().length;
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
  if (s.mode === "pk") {
    s.cast = pickCast(s, 2, api);
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
    const pick = pickScene(s, n, api);
    const scene = pick.s;
    const k = Math.min(scene.roles.length, castSize(n));
    s.scene = pick.i;
    s.cur = pick.w;
    // whoever wrote it plays in it, so nobody guesses a story they wrote
    const writer = pick.w?.by && api.ids().includes(pick.w.by) ? pick.w.by : null;
    s.cast = pickCast(s, k, api, writer);
    // which roles are on tonight (all of them, unless the table is too small), in a random order
    s.roles = api.shuffle(scene.roles.map((_, i) => i)).slice(0, k).sort((a, b) => a - b);
    s.cast = api.shuffle(s.cast);
    s.culprit = s.cast[api.int(s.cast.length)];
    const tasks = api.shuffle(TASKS[s.diff].map((_, i) => i));
    s.cast.forEach((pid, j) => (s.tasks[pid] = tasks[j % tasks.length]));
    // a role whose writer left its secret blank gets a generic one (no two the same)
    const secrets = api.shuffle(ANY_SECRETS.map((_, i) => i));
    s.cast.forEach((pid, j) => {
      if (!hasText(scene.roles[s.roles[j]].alibi)) s.fill[pid] = secrets[j % secrets.length];
    });
    s.twistPick = api.int(ANY_TWISTS.length);
  }
  for (const pid of s.cast) s.acted[pid] = (s.acted[pid] ?? 0) + 1;
  s.phase = "brief";
  s.endsAt = api.now + BRIEF_MS;
  api.timer("brief", s.endsAt);
  api.fx("card");
}

function startAct(s: S, api: Api) {
  api.clear("brief");
  s.phase = "act";
  s.actMs = s.mode === "pk" ? PK_MS : ACT_MS[s.diff];
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

function startVote(s: S, api: Api) {
  api.clear("act");
  api.clear("twist");
  s.twisted = s.mode === "show";
  s.phase = "vote";
  s.votes = {};
  s.endsAt = api.now + VOTE_MS;
  api.timer("vote", s.endsAt);
  api.fx("timeup");
}

function everyoneVoted(s: S, api: Api) {
  const aud = audience(s, api);
  return aud.length > 0 && aud.every((pid) => s.votes[pid]);
}

function penaltyText(s: S, api: Api): T | null {
  if (s.pen === "drink") return null;
  const list = s.pen === "move" ? PENALTIES.move[s.diff] : s.level === "spicy" ? [...PENALTIES.prank.all, ...PENALTIES.prank.spicy] : PENALTIES.prank.all;
  return list[api.int(list.length)];
}

function card(s: S, pid: string): DramaCard | null {
  if (!s.cast.includes(pid)) return null;
  if (s.mode === "pk" && s.pk) return { secret: PK_STYLES[s.pk.styles[pid]].s, culprit: false, task: t("", "") };
  const scene = current(s);
  if (!scene) return null;
  const role = scene.roles[s.roles[s.cast.indexOf(pid)]];
  const culprit = s.culprit === pid;
  const alibi = hasText(role.alibi) ? role.alibi : ANY_SECRETS[s.fill[pid] ?? 0];
  return { secret: culprit ? scene.culpritCard : alibi, culprit, task: TASKS[s.diff][s.tasks[pid] ?? 0] };
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

function reveal(s: S, api: Api) {
  api.clear("vote");
  const aud = audience(s, api);
  const counts: Record<string, number> = {};
  const sums: Record<string, { n: number; sum: number }> = {};
  for (const pid of s.cast) {
    counts[pid] = 0;
    sums[pid] = { n: 0, sum: 0 };
  }
  for (const voter of aud) {
    const v = s.votes[voter];
    if (!v) continue;
    if (v.guess && counts[v.guess] !== undefined) counts[v.guess] += 1;
    for (const pid of s.cast) {
      const st = v.stars[pid];
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
  const best = rated.length ? rated.filter((pid) => stars[pid] === hi) : [];
  // with everyone level, nobody stands out as the worst
  const worst = rated.length && lo < hi ? rated.filter((pid) => stars[pid] === lo) : [];

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
    const top = Math.max(0, ...Object.values(counts));
    caught = top > 0 && counts[s.culprit] === top;
    right = aud.filter((pid) => s.votes[pid]?.guess === s.culprit);
    for (const pid of right) add(pid, 1);
    if (caught) losers.add(s.culprit);
    else {
      add(s.culprit, 3);
      for (const pid of aud) if (s.votes[pid] && s.votes[pid].guess !== s.culprit) losers.add(pid);
    }
  }
  for (const pid of best) s.awards[pid] = (s.awards[pid] ?? 0) + 1;

  const cards: Record<string, DramaCard> = {};
  for (const pid of s.cast) {
    const c = card(s, pid);
    if (c) cards[pid] = c;
  }
  const say = losers.size ? penaltyText(s, api) : null;
  s.result = { culprit: s.culprit, caught, counts, stars, cards, best, losers: [...losers], right, penalty: say, gained };
  s.phase = "reveal";
  api.fx(caught || s.mode === "pk" ? "reveal" : "wrong", s.culprit ?? undefined);
  if (best.length) api.fx("award", best[0]);
  if (losers.size) {
    const sc = current(s);
    const note = s.mode === "show" && sc ? sc.title : PK_LINES[s.pk?.line ?? 0];
    // after the reveal has played (drum roll, mask, cards, trophy) and been read
    api.penalty([...losers], "sip", note, { delay: s.mode === "show" ? 8000 : 5500, ...(say ? { say } : {}) });
  }
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
  min: 3,
  init() {
    return {
      phase: "setup",
      mode: "show",
      level: "all",
      diff: "easy",
      pen: "drink",
      total: 5,
      round: 0,
      used: [],
      scene: null,
      cur: null,
      mine: [],
      lib: [],
      wn: 0,
      fill: {},
      twistPick: 0,
      cast: [],
      roles: [],
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
    switch (g.x) {
      case "config": {
        if (!host || s.phase !== "setup") return;
        if (g.mode === "show" || g.mode === "pk") s.mode = g.mode;
        if (g.level === "all" || g.level === "spicy") s.level = g.level;
        if (g.diff === "easy" || g.diff === "hard") s.diff = g.diff;
        if (g.pen === "drink" || g.pen === "move" || g.pen === "prank") s.pen = g.pen;
        const total = intIn(g.total, 1, 20);
        if (total !== null && g.total !== undefined) s.total = total;
        return;
      }
      case "start": {
        if (!host || s.phase !== "setup" || api.ids().length < 3) return;
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
        if (s.phase !== "vote" || s.cast.includes(pid) || !api.has(pid)) return;
        const raw = (g.stars ?? {}) as Record<string, unknown>;
        const stars: Record<string, number> = {};
        for (const c of s.cast) {
          const n = intIn(raw[c], 1, 5);
          if (n !== null && raw[c] !== undefined) stars[c] = n;
        }
        const guess = s.mode === "show" && typeof g.guess === "string" && s.cast.includes(g.guess) ? g.guess : null;
        if (s.mode === "show" && !guess) return;
        if (Object.keys(stars).length !== s.cast.length) return;
        s.votes[pid] = { guess, stars };
        if (everyoneVoted(s, api)) reveal(s, api);
        return;
      }
      case "reveal": {
        if (!host || s.phase !== "vote" || !Object.keys(s.votes).length) return;
        reveal(s, api);
        return;
      }
      case "skip": {
        // a new scene with a new cast (someone left, or nobody likes this one)
        if (!host || (s.phase !== "brief" && s.phase !== "act")) return;
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
        s.round += 1;
        newRound(s, api);
        return;
      }
      case "more": {
        if (!host || s.phase !== "end") return;
        s.total += 3;
        s.round += 1;
        newRound(s, api);
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
      else {
        // nobody voted: the scene still ends, without points
        s.result = { culprit: s.culprit, caught: false, counts: {}, stars: {}, cards: Object.fromEntries(s.cast.map((c) => [c, card(s, c)!]).filter(([, v]) => v)), best: [], losers: [], right: [], penalty: null, gained: {} };
        s.phase = "reveal";
      }
    }
  },

  leave(s, pid, api) {
    delete s.votes[pid];
    if (s.phase === "vote" && Object.keys(s.votes).length && everyoneVoted(s, api)) reveal(s, api);
    if (s.phase === "brief" && s.cast.length && s.cast.every((c) => s.ready.includes(c) || !api.has(c) || c === pid)) startAct(s, api);
  },

  view(s, pid): DramaView {
    const scene = current(s);
    const live = s.phase !== "setup" && s.phase !== "end";
    return {
      id: "drama",
      phase: s.phase,
      mode: s.mode,
      level: s.level,
      diff: s.diff,
      pen: s.pen,
      round: s.round,
      total: s.total,
      scene: live && scene ? { id: scene.id, kind: scene.kind, title: scene.title, setup: scene.setup, ask: scene.ask, culprit: scene.culprit } : null,
      cast: live ? s.cast.map((c, j) => (scene ? { pid: c, role: scene.roles[s.roles[j]].name, brief: scene.roles[s.roles[j]].brief } : { pid: c, role: s.pk ? PK_STYLES[s.pk.styles[c]].s : t("", ""), brief: t("", "") })) : [],
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
    };
  },
};
