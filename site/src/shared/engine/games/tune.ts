import { LISTEN_MS, STAGE_GAPS, TUNES } from "../../../data/tunes";
import { SONG_ROWS } from "../../../data/songs";
import type { TuneView } from "../../protocol";
import { cardOf, checkRow, decoysFor, DEFAULT_HOOK_MS, DEFAULT_POOL, fromRow, HOOK_MAX_MS, moodOf, pickSong, poolSize, previewUrl, samePool, shownChoices, SNAP_GAPS, SNAP_MS, SNAP_QUIZ_MS, specialOf, type Song, type SongPool } from "../../songs";
import { range, t, type Api, type GameDef } from "../api";

/**
 * Name That Tune. Songs mode: every phone plays the same 30-second preview of a real song at the
 * same moment, streamed from Apple. Melody mode: the same, with public-domain tunes on the
 * built-in synth (works with no internet). Buzz in, pick the title from four; the sooner, the
 * more points. A wrong answer costs a sip and locks you out of that song. DJ mode: the host plays
 * songs from their own music app, everyone else buzzes, the host says right or wrong.
 * Quiz: no buzzer; the four titles show from the start and everyone picks one on their own phone,
 * the sooner the more points; at the reveal whoever missed it drinks.
 * Hard: the four titles come without their singers, and the wrong ones are the same singer's.
 * One second (snap): every phone plays one second of the song, then three, then the rest, each from
 * the same spot (the hook the host's phone found in the preview); the points go 3, 2, 1 with them.
 * A singer special (pool "@<singer>"): only that singer's songs, the four titles all theirs (so no
 * singer on them). A game never plays a title twice, so a game of a small pool (one singer, a decade
 * in one category) is no longer than the songs it has.
 */

type Mode = TuneView["mode"];

type S = {
  mode: Mode;
  pool: SongPool;
  /** how many songs (by title) the pool has: a game of real songs is no longer than that */
  size?: number;
  /** everyone answers at once from four titles (no buzzer) */
  quiz: boolean;
  /** the four titles without their singers, the wrong ones by the same singer */
  hard: boolean;
  /** one second first, then three, then the rest */
  snap: boolean;
  /** ms into this song's preview where its snippets start, and the next song's once the host's phone has worked it out */
  hook: number;
  nextHook: { id: number; at: number } | null;
  /** quiz: each phone's pick and when it came in */
  answers: Record<string, { c: number; at: number }>;
  /** quiz: everyone who got the last one */
  right: string[];
  phase: TuneView["phase"];
  round: number;
  total: number;
  deck: number[];
  tune: number;
  stageAt: number[];
  endsAt: number;
  buzzer: string | null;
  answerEndsAt: number;
  options: number[] | null;
  locked: string[];
  correct: string | null;
  scores: Record<string, number>;
  last: { pid: string; ok: boolean } | null;
  pausedAt: number | null;
  /** songs mode: the song playing, the next one (picked early so phones can load it), the four choices */
  song: Song | null;
  next: Song | null;
  choices: Song[] | null;
  /** server time the preview's first second plays; moves on with every pause */
  startAt: number;
  /** where the preview picks up for the reveal, ms into it */
  revealPos: number;
  /** played at this table, and heard lately on the phones here: both kept off the playlist */
  played: number[];
  /** this game's songs: a game never plays one twice (missing in rooms from before) */
  game?: number[];
  heard: number[];
  /** today's chart songs, handed in by the host's phone with the first song */
  extra: Song[];
  /** the pool the host picked has no songs (yet): the game waits for another pick */
  noSongs: boolean;
};

const LEAD_MS = 1500;
const SONG_LEAD_MS = 2500;
/** Apple previews run 30 seconds */
const SONG_MS = 29_500;
/** a quiz round: the four titles are up from the start, so it needn't run the whole preview */
const QUIZ_MS = 20_000;
const QUIZ_MELODY_MS = 16_000;
const ANSWER_MS = 10_000;
const DJ_ANSWER_MS = 30_000;
const DJ_LISTEN_MS = 120_000;
const NEXT_MS = 7500;
/** a real song gets a little longer at the reveal: it keeps playing */
const SONG_NEXT_MS = 9500;
const HEARD_MAX = 1500;

const CATALOG: Song[] = SONG_ROWS.map(fromRow);
const CATALOG_IDS = new Set(CATALOG.map((x) => x.id));
const EXTRA_EACH = 12;
const PLAYED_MAX = 600;

const players = (s: S, api: Api) => api.ids().filter((pid) => s.mode !== "dj" || !api.isHost(pid));
const songsOf = (s: S) => (s.extra.length ? CATALOG.concat(s.extra) : CATALOG);

function pick(s: S, api: Api, exclude: number[] = []) {
  const played = new Set([...s.played, ...exclude]);
  const game = new Set([...(s.game ?? []), ...exclude]);
  return pickSong(songsOf(s), s.pool, new Set(s.heard), played, () => api.rand(), undefined, game);
}

/** the songs a game plays: as many as the host picked, or all the pool has if fewer (one singer, a small decade) */
const roundsOf = (s: S) => (s.mode === "songs" && s.size ? Math.min(s.total, s.size) : s.total);
const sizeOf = (s: S) => poolSize(songsOf(s), s.pool);

/**
 * One second, before the first song: pick it already, so every phone loads it while the table sets
 * up and the host's phone can find its spot. (A phone still loading when it starts would miss the
 * first second, the one worth 3 points; later songs load during the one before.)
 */
function pickFirst(s: S, api: Api) {
  if (s.phase === "ready" && s.mode === "songs" && s.snap && !s.next) s.next = pick(s, api);
}

function go(s: S, api: Api) {
  api.clear("next");
  if (s.round >= roundsOf(s)) return finish(s, api);
  s.round += 1;
  s.locked = [];
  s.buzzer = null;
  s.correct = null;
  s.last = null;
  s.pausedAt = null;
  s.answers = {};
  s.right = [];
  s.phase = "listen";
  if (s.mode === "songs") {
    if (s.round === 1) s.game = [];
    const song = s.next && !s.played.includes(s.next.id) && !(s.game ?? []).includes(s.next.id) ? s.next : pick(s, api);
    // a pool with no song left for this game: that's the game
    if (!song && s.round > 1) {
      s.round -= 1;
      return finish(s, api);
    }
    if (!song) {
      // nothing in this pool: back to the setup screen, with a word about it
      s.round -= 1;
      s.phase = s.round === 0 ? "ready" : "reveal";
      s.noSongs = true;
      return;
    }
    s.noSongs = false;
    s.song = song;
    s.played.push(song.id);
    if (s.played.length > PLAYED_MAX) s.played = s.played.slice(-PLAYED_MAX);
    s.game = [...(s.game ?? []), song.id];
    s.next = pick(s, api);
    s.choices = api.shuffle([song, ...decoysFor(song, songsOf(s), () => api.rand(), !!s.hard, s.pool)]);
    s.options = null;
    s.tune = -1;
    const t0 = api.now + SONG_LEAD_MS;
    s.startAt = t0;
    s.stageAt = (s.snap ? SNAP_GAPS : STAGE_GAPS).map((g) => t0 + g);
    s.endsAt = t0 + (s.snap ? (s.quiz ? SNAP_QUIZ_MS : SNAP_MS) : s.quiz ? QUIZ_MS : SONG_MS);
    s.hook = s.snap ? (s.nextHook?.id === song.id ? s.nextHook.at : DEFAULT_HOOK_MS) : 0;
    s.nextHook = null;
  } else if (s.mode === "melody") {
    if (!s.deck.length) s.deck = api.shuffle(range(TUNES.length));
    s.tune = s.deck.pop()!;
    const decoys = api.shuffle(range(TUNES.length).filter((i) => i !== s.tune)).slice(0, 3);
    s.options = api.shuffle([s.tune, ...decoys]);
    const t0 = api.now + LEAD_MS;
    s.stageAt = STAGE_GAPS.map((g) => t0 + g);
    s.endsAt = t0 + (s.quiz ? Math.max(LISTEN_MS, QUIZ_MELODY_MS) : LISTEN_MS);
  } else {
    s.tune = -1;
    s.options = null;
    s.stageAt = [api.now];
    s.endsAt = api.now + DJ_LISTEN_MS;
  }
  api.timer("listen", s.endsAt);
}

function reveal(s: S, api: Api) {
  api.clear("listen");
  api.clear("answer");
  s.phase = "reveal";
  s.buzzer = null;
  // (one second: the reveal plays from the hook, the part everyone has heard bits of)
  if (s.mode === "songs") s.revealPos = s.snap ? (s.hook ?? 0) : Math.max(0, Math.min(22_000, (s.pausedAt ?? api.now) - s.startAt));
  if (s.quiz && s.mode !== "dj") settleQuiz(s, api);
  if (s.mode !== "dj") api.timer("next", api.now + (s.mode === "songs" ? SONG_NEXT_MS : NEXT_MS));
}

/** A quiz round is over: the right answers score by how soon they came, everyone else drinks. */
function settleQuiz(s: S, api: Api) {
  const ids = players(s, api);
  const answer = s.mode === "songs" ? s.song?.id ?? -1 : s.tune;
  const right = ids.filter((pid) => s.answers[pid]?.c === answer).sort((a, b) => s.answers[a].at - s.answers[b].at);
  for (const pid of right) s.scores[pid] = (s.scores[pid] ?? 0) + points(s, s.answers[pid].at);
  s.right = right;
  s.correct = right[0] ?? null;
  s.last = null;
  const missed = ids.filter((pid) => !right.includes(pid));
  if (right.length) api.fx("correct", right[0]);
  else api.fx("wrong");
  if (missed.length && missed.length < ids.length + 1) api.penalty(missed, "sip", t("猜歌名：没猜中", "Name That Tune: missed it"), { delay: 900 });
}

function finish(s: S, api: Api) {
  api.clear("listen");
  api.clear("answer");
  api.clear("next");
  s.phase = "end";
  const ids = players(s, api);
  const vals = ids.map((pid) => s.scores[pid] ?? 0);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  api.fx("win");
  if (lo < hi) api.penalty(ids.filter((pid) => (s.scores[pid] ?? 0) === lo), "two", t("猜歌名：最后一名", "Name That Tune: last place"), { delay: 2200 });
}

function points(s: S, at: number) {
  if (s.mode === "dj") return 1;
  return at < s.stageAt[1] ? 3 : at < s.stageAt[2] ? 2 : 1;
}

/** The music picks up where it stopped: everything still ahead moves on by the pause (one second: the
 *  snippet that was playing too, so it carries on from where it stopped). */
function resume(s: S, api: Api) {
  const paused = s.pausedAt ?? api.now;
  const shift = api.now - paused;
  const playing = s.stageAt.reduce((cur, at, i) => (at <= paused ? i : cur), -1);
  const snippet = s.snap && s.mode === "songs";
  s.stageAt = s.stageAt.map((at, i) => (at > paused || (snippet && i === playing) ? at + shift : at));
  s.endsAt += shift;
  if (s.mode === "songs") s.startAt += shift;
  s.pausedAt = null;
}

function resolve(s: S, api: Api, ok: boolean) {
  const pid = s.buzzer;
  if (!pid) return;
  api.clear("answer");
  s.last = { pid, ok };
  if (ok) {
    s.scores[pid] = (s.scores[pid] ?? 0) + points(s, s.pausedAt ?? api.now);
    s.correct = pid;
    api.fx("correct", pid);
    reveal(s, api);
    return;
  }
  api.fx("wrong", pid);
  api.penalty([pid], "sip", t("猜歌名：猜错了", "Name That Tune: wrong answer"), { delay: 700 });
  s.locked.push(pid);
  s.buzzer = null;
  resume(s, api);
  if (players(s, api).every((p) => s.locked.includes(p))) {
    reveal(s, api);
    return;
  }
  s.phase = "listen";
  api.timer("listen", s.endsAt);
}

/** Drop a buzz without judging it: the music picks up where it stopped. */
function unbuzz(s: S, api: Api) {
  api.clear("answer");
  s.buzzer = null;
  resume(s, api);
  s.phase = "listen";
  api.timer("listen", s.endsAt);
}

export const tune: GameDef<S> = {
  id: "tune",
  min: 2,
  init(api) {
    return {
      mode: "songs",
      pool: DEFAULT_POOL,
      quiz: false,
      hard: false,
      snap: false,
      hook: 0,
      nextHook: null,
      answers: {},
      right: [],
      phase: "ready",
      round: 0,
      total: 8,
      deck: api.shuffle(range(TUNES.length)),
      tune: -1,
      stageAt: [],
      endsAt: 0,
      buzzer: null,
      answerEndsAt: 0,
      options: null,
      locked: [],
      correct: null,
      scores: Object.fromEntries(api.ids().map((pid) => [pid, 0])),
      last: null,
      pausedAt: null,
      song: null,
      next: null,
      choices: null,
      startAt: 0,
      revealPos: 0,
      played: [],
      heard: [],
      extra: [],
      noSongs: false,
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "mode": {
        if (!host || (s.phase !== "ready" && s.phase !== "reveal") || (g.mode !== "songs" && g.mode !== "melody" && g.mode !== "dj")) return;
        s.mode = g.mode;
        pickFirst(s, api);
        return;
      }
      case "pool": {
        const pool = samePool(g.pool);
        if (!host || (s.phase !== "ready" && s.phase !== "reveal") || !pool) return;
        if (s.pool !== pool) s.next = null;
        s.pool = pool;
        s.size = sizeOf(s);
        s.noSongs = false;
        pickFirst(s, api);
        return;
      }
      case "quiz": {
        if (!host || (s.phase !== "ready" && s.phase !== "reveal")) return;
        s.quiz = !!g.on;
        return;
      }
      case "hard": {
        if (!host || (s.phase !== "ready" && s.phase !== "reveal")) return;
        s.hard = !!g.on;
        return;
      }
      case "snap": {
        if (!host || (s.phase !== "ready" && s.phase !== "reveal")) return;
        s.snap = !!g.on;
        pickFirst(s, api);
        return;
      }
      case "hook": {
        // the host's phone found where a preview's snippets should start: for the next song, or for
        // this one while it hasn't started yet (every phone then plays the same spot)
        const at = Number(g.at);
        if (!host || !s.snap || s.mode !== "songs" || typeof g.p !== "string" || !Number.isInteger(at) || at < 0 || at > HOOK_MAX_MS) return;
        if (s.next && previewUrl(s.next.p) === g.p) s.nextHook = { id: s.next.id, at };
        else if (s.song && previewUrl(s.song.p) === g.p && s.phase === "listen" && api.now < s.stageAt[0] - 300) s.hook = at;
        return;
      }
      case "heard": {
        // each phone says which songs it played lately, so the table hears new ones
        if (!Array.isArray(g.ids)) return;
        const have = new Set(s.heard);
        for (const x of g.ids.slice(0, 400)) if (typeof x === "number" && Number.isSafeInteger(x) && x > 0 && !have.has(x)) {
          have.add(x);
          s.heard.push(x);
        }
        if (s.heard.length > HEARD_MAX) s.heard = s.heard.slice(-HEARD_MAX);
        if (s.next && have.has(s.next.id)) s.next = null;
        pickFirst(s, api);
        return;
      }
      case "total": {
        const n = Number(g.n);
        if (!host || s.phase !== "ready" || ![5, 8, 12, 20].includes(n)) return;
        s.total = n;
        return;
      }
      case "go": {
        if (!host || (s.phase !== "ready" && s.phase !== "reveal")) return;
        // the host's phone brings today's charts from Apple; every row is checked, and only Apple's preview links play
        if (Array.isArray(g.charts) && g.charts.length) {
          // keep a few dozen of each language: the whole room is saved on every move
          const avoid = new Set([...s.heard, ...s.played]);
          const fresh = g.charts
            .slice(0, 1000)
            .map(checkRow)
            .filter((x): x is Song => !!x && !CATALOG_IDS.has(x.id) && !avoid.has(x.id));
          const langs = [...new Set(fresh.map((x) => x.l))];
          s.extra = langs.flatMap((l) => api.shuffle(fresh.filter((x) => x.l === l)).slice(0, EXTRA_EACH));
          s.size = sizeOf(s);
        }
        go(s, api);
        return;
      }
      case "buzz": {
        if (s.quiz || s.phase !== "listen" || s.locked.includes(pid) || !players(s, api).includes(pid)) return;
        if (s.mode !== "dj" && api.now < s.stageAt[0] - 300) return;
        s.buzzer = pid;
        s.phase = "answer";
        s.pausedAt = api.now;
        s.answerEndsAt = api.now + (s.mode === "dj" ? DJ_ANSWER_MS : ANSWER_MS);
        api.clear("listen");
        api.timer("answer", s.answerEndsAt);
        api.fx("buzz", pid, [Math.max(0, api.ids().indexOf(pid))]);
        return;
      }
      case "answer": {
        const choice = Number(g.choice);
        const onList = s.mode === "melody" ? !!s.options?.includes(choice) : s.mode === "songs" && !!s.song && !!s.choices?.some((c) => c.id === choice);
        if (s.quiz && s.mode !== "dj") {
          // everyone answers once, on their own phone; the round ends when the last one is in
          if (s.phase !== "listen" || !onList || s.answers[pid] || !players(s, api).includes(pid)) return;
          if (api.now < s.stageAt[0] - 300) return;
          s.answers[pid] = { c: choice, at: api.now };
          if (players(s, api).every((p) => s.answers[p])) reveal(s, api);
          return;
        }
        if (s.phase !== "answer" || pid !== s.buzzer) return;
        if (s.mode === "melody" && s.options?.includes(choice)) resolve(s, api, choice === s.tune);
        else if (s.mode === "songs" && s.song && s.choices?.some((c) => c.id === choice)) resolve(s, api, choice === s.song.id);
        return;
      }
      case "judge": {
        if (s.mode !== "dj" || !host || s.phase !== "answer" || pid === s.buzzer) return;
        resolve(s, api, !!g.ok);
        return;
      }
      case "skip": {
        if (!host || s.phase !== "listen") return;
        reveal(s, api);
        return;
      }
      case "end": {
        if (!host || s.phase === "end" || s.phase === "ready") return;
        finish(s, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        s.round = 0;
        s.scores = Object.fromEntries(api.ids().map((p) => [p, 0]));
        s.phase = "ready";
        pickFirst(s, api);
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "listen" && s.phase === "listen") reveal(s, api);
    else if (key === "answer" && s.phase === "answer") {
      // DJ mode with the buzzer now holding the host's seat: nobody can judge, so no penalty
      if (s.mode === "dj" && s.buzzer && api.isHost(s.buzzer)) unbuzz(s, api);
      else resolve(s, api, false);
    } else if (key === "next" && s.phase === "reveal") go(s, api);
  },

  join(s, pid) {
    s.scores[pid] ??= 0;
  },

  leave(s, pid, api) {
    if (s.buzzer === pid && s.phase === "answer") resolve(s, api, false);
    s.locked = s.locked.filter((p) => p !== pid);
    delete s.answers[pid];
    if (s.quiz && s.phase === "listen" && s.mode !== "dj" && players(s, api).length && players(s, api).every((p) => s.answers[p])) reveal(s, api);
  },

  view(s, pid): TuneView {
    const done = s.phase === "reveal" || s.phase === "end";
    const songs = s.mode === "songs";
    const live = s.phase === "listen" || s.phase === "answer" || s.phase === "reveal";
    const quiz = s.quiz && s.mode !== "dj";
    const showAnswers = s.phase === "answer" || done || (quiz && s.phase === "listen");
    return {
      id: "tune",
      mode: s.mode,
      pool: s.pool,
      quiz,
      hard: !!s.hard,
      snap: !!s.snap,
      phase: s.phase,
      round: s.round,
      // (the setup shows the host's pick; a game of one singer's songs says how many it really is)
      total: s.phase === "ready" ? s.total : roundsOf(s),
      // phones get the notes to play; which tune it is stays on the server until the reveal
      tune: done && s.mode === "melody" ? s.tune : -1,
      clip: s.mode === "melody" && s.tune >= 0 ? { bpm: TUNES[s.tune].bpm, notes: TUNES[s.tune].notes, up: TUNES[s.tune].up ?? 0 } : null,
      stageAt: s.stageAt,
      endsAt: s.endsAt,
      buzzer: s.buzzer,
      answerEndsAt: s.answerEndsAt,
      options: s.mode === "melody" && showAnswers ? s.options : null,
      locked: s.locked,
      correct: s.correct,
      scores: s.scores,
      last: s.last,
      pausedAt: s.pausedAt,
      // songs mode: the preview to play (not what it is), the next one to load early, and at the reveal the song itself
      audio: songs && live && s.song ? previewUrl(s.song.p) : null,
      startAt: s.startAt,
      hook: songs && s.snap ? (s.hook ?? DEFAULT_HOOK_MS) : 0,
      revealPos: s.revealPos,
      pre: songs && s.next && s.phase !== "end" ? previewUrl(s.next.p) : null,
      // (a singer special's four titles are all theirs: no singer on them)
      choices: songs && s.choices && showAnswers ? shownChoices(s.choices, !!s.hard || !!specialOf(s.pool)) : null,
      song: songs && done && s.song ? cardOf(s.song) : null,
      singer: songs && live && s.song ? s.song.g : 0,
      // how the song feels, from its title and categories: the stage plays it (tears for a sad one)
      mood: songs && live && s.song ? moodOf(s.song) : "",
      noSongs: s.noSongs,
      answered: quiz ? Object.keys(s.answers) : [],
      mine: quiz ? (s.answers[pid]?.c ?? null) : null,
      right: quiz && done ? s.right : [],
    };
  },
};
