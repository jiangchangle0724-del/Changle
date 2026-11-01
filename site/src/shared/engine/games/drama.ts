import { PENALTIES, PK_LINES, PK_STYLES, SCENES, TASKS, type DramaDiff, type DramaLevel, type DramaScene } from "../../../data/drama";
import type { T } from "../../../i18n";
import type { DramaCard, DramaView } from "../../protocol";
import { intIn, t, type Api, type GameDef } from "../api";

/**
 * 戏精大赏 · Drama Queens. Each round a few players act: in a scene, one of them is secretly the
 * culprit (the other woman, the killer, the mole) and everyone has a private card and a secret
 * task; in a duel, two players say the same line in two styles. The audience then guesses the
 * culprit and gives each actor 1 to 5 stars for how convincing they were.
 *
 * Points: a right guess 1; a culprit nobody pins 3; each actor their average stars, rounded.
 * The penalty: the actor(s) with the fewest stars, plus the culprit if caught, or else everyone
 * the culprit fooled. Best actor (most stars) takes a trophy.
 */

type Mode = "show" | "pk";
type Pen = "drink" | "move" | "prank";
type Vote = { guess: string | null; stars: Record<string, number> };
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
  scene: number | null;
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

const BRIEF_MS = 60_000;
const ACT_MS: Record<DramaDiff, number> = { easy: 90_000, hard: 120_000 };
const PK_MS = 45_000;
const VOTE_MS = 50_000;

/** How many act at once: at least two, and keep two people watching once the table allows. */
export function castSize(n: number) {
  return Math.max(2, Math.min(4, n - 2));
}

const scenesFor = (level: DramaLevel, diff: DramaDiff) => SCENES.map((s, i) => ({ s, i })).filter(({ s }) => s.diff === diff && (level === "spicy" || s.level === "all"));

function pickScene(s: S, n: number, api: Api): number {
  const max = castSize(n);
  let pool = scenesFor(s.level, s.diff);
  if (!pool.length) pool = SCENES.map((x, i) => ({ s: x, i }));
  const fits = pool.filter(({ s: sc }) => sc.roles.length <= max);
  let fresh = (fits.length ? fits : pool).filter(({ s: sc }) => !s.used.includes(sc.id));
  if (!fresh.length) {
    // everything has been played: start the library over
    s.used = s.used.filter((id) => !pool.some(({ s: sc }) => sc.id === id));
    fresh = fits.length ? fits : pool;
  }
  const { s: sc, i } = fresh[api.int(fresh.length)];
  s.used.push(sc.id);
  return i;
}

/** Whoever has acted least goes on next (ties at random). */
function pickCast(s: S, k: number, api: Api): string[] {
  const ids = api.shuffle(api.ids());
  ids.sort((a, b) => (s.acted[a] ?? 0) - (s.acted[b] ?? 0));
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
    const idx = pickScene(s, n, api);
    const scene = SCENES[idx];
    const k = Math.min(scene.roles.length, castSize(n));
    s.scene = idx;
    s.cast = pickCast(s, k, api);
    // which roles are on tonight (all of them, unless the table is too small), in a random order
    s.roles = api.shuffle(scene.roles.map((_, i) => i)).slice(0, k).sort((a, b) => a - b);
    s.cast = api.shuffle(s.cast);
    s.culprit = s.cast[api.int(s.cast.length)];
    const tasks = api.shuffle(TASKS[s.diff].map((_, i) => i));
    s.cast.forEach((pid, j) => (s.tasks[pid] = tasks[j % tasks.length]));
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
  if (s.scene === null) return null;
  const scene: DramaScene = SCENES[s.scene];
  const role = scene.roles[s.roles[s.cast.indexOf(pid)]];
  const culprit = s.culprit === pid;
  return { secret: culprit ? scene.culpritCard : role.alibi, culprit, task: TASKS[s.diff][s.tasks[pid] ?? 0] };
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
    const note = s.mode === "show" && s.scene !== null ? SCENES[s.scene].title : PK_LINES[s.pk?.line ?? 0];
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
    const scene = s.scene !== null ? SCENES[s.scene] : null;
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
      twist: scene && (s.twisted || s.phase === "vote" || s.phase === "reveal") ? scene.twist : null,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      result: s.phase === "reveal" ? s.result : null,
      scores: s.scores,
      awards: s.awards,
    };
  },
};
