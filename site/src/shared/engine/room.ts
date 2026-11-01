import type { T } from "../../i18n";
import {
  INK_COLORS,
  MAX_SEATS,
  ONLINE_GAMES,
  ONLINE_MIN,
  REACTIONS,
  type Action,
  type ErrorCode,
  type Fx,
  type GameId,
  type PenaltyKind,
  type RoomEvent,
  type RoomView,
  type SpinScope,
  type Stroke,
  type StrokeOp,
} from "../protocol";
import { clean, intIn, num, t, type Api, type GameDef } from "./api";
import { GAMES } from "./games";

/**
 * `fg`: the version of the seat's figure cut out for the stages (0 or missing: none). `owner`: signed
 * in with one of the site owner's accounts, as the rooms server found (`setOwner`); never sent to
 * a phone (the DJ booth's private Lyria test listens to it).
 */
export type SeatData = { id: string; name: string; on: boolean; at: number; uid?: string; av?: number; ac?: number; fg?: number; fr?: string; watch?: boolean; owner?: boolean };
export type Profile = { uid: string; name: string; av: number; ac: number; fg?: number; fr?: string };
export type GameRecord = { game: string; room: string; started: number; ended: number; players: { pid: string; uid?: string; name: string; drinks: number }[] };
export type TimerData = { at: number; key: string; data?: unknown };
export type PenRecord = { id: string; who: string[]; buddy?: string; buddyUsed?: boolean; drank: string[]; at: number };

export type RoomData = {
  code: string;
  host: string;
  seats: SeatData[];
  banned: string[];
  penalty: string;
  front: number;
  game: { id: GameId; s: unknown } | null;
  timers: TimerData[];
  pens: PenRecord[];
  strokes: Stroke[];
  /** the game being played now: when it started and how many penalties each seat took */
  play?: { game: GameId; started: number; tally: Record<string, number> } | null;
  /** a big screen opened this table (it can exist before anyone sits down) */
  tv?: { id: string; at: number } | null;
  /** big screens connected right now */
  screens?: number;
  v: number;
  seq: number;
  created: number;
  touched: number;
};

export interface Host {
  now(): number;
  rand(): number;
}

export type Output = {
  /** Room state changed: persist and send fresh views to everyone. */
  changed: boolean;
  /**
   * Changed, but only in a way that can wait for the next save (a 🔥 tap, which comes many times a
   * minute): send fresh views now, keep it in storage with the next save.
   */
  light: boolean;
  /** Persist only (drawing finished a stroke). */
  persist: boolean;
  events: RoomEvent[];
  /** Drawing ops to relay to everyone except `from`. */
  relay: { op: StrokeOp; from: string }[];
  /** Everyone should reload the full stroke list (cleared). */
  strokesReset: boolean;
  /** Players removed by the host: close their sockets. */
  kicked: string[];
  /** Finished games to write into the players' histories. */
  records: GameRecord[];
};

const HOST_GRACE = 25_000;
/** Coordinates (two per point) kept for one drawing: about 240 KB of JSON at most. */
const MAX_INK = 40_000;
const REUSE_AFTER = 10 * 60_000;
const N_LOBBY = ONLINE_GAMES.length;

const BUDDY_NOTE: T = t("陪酒：谢谢老板！", "Drinking buddy: thank you, boss!");
const BUDDY_NOTE_CUSTOM: T = t("陪罚：谢谢老板！", "Penalty buddy: thank you, boss!");

/**
 * Player ids become keys in the games' score and vote maps, so they are plain letters, digits,
 * "-" and "_", and never a name that objects already have ("constructor", "__proto__", ...).
 */
export function validPid(pid: unknown): pid is string {
  return typeof pid === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(pid) && !(pid in Object.prototype);
}

function blankOut(): Output {
  return { changed: false, light: false, persist: false, events: [], relay: [], strokesReset: false, kicked: [], records: [] };
}

export function freshRoom(code: string, now: number): RoomData {
  return {
    code,
    host: "",
    seats: [],
    banned: [],
    penalty: "",
    front: 0,
    game: null,
    timers: [],
    pens: [],
    strokes: [],
    v: 0,
    seq: 0,
    created: now,
    touched: now,
  };
}

/**
 * The whole table, as pure logic. The Durable Object (or a test) owns the IO:
 * it calls these methods, then reads `flush()` to persist, broadcast views and relay events.
 */
export class RoomEngine {
  private out: Output = blankOut();
  private lastReact = new Map<string, number>();
  /** the game action being run asked to be light (see Output.light) */
  private lightAct = false;

  constructor(
    public d: RoomData,
    private h: Host,
  ) {}

  flush(): Output {
    const o = this.out;
    this.out = blankOut();
    if (o.changed) o.light = false;
    if (o.changed || o.light) {
      this.d.v += 1;
      this.d.touched = this.h.now();
    }
    return o;
  }

  get exists() {
    return this.d.seats.length > 0 || !!this.d.tv;
  }

  onlineCount() {
    return this.d.seats.filter((s) => s.on).length;
  }

  /* ---------------- seats ---------------- */

  hello(pid: string, rawName: string, create: boolean, who?: Profile | null): ErrorCode | null {
    const d = this.d;
    const now = this.h.now();
    const name = clean(rawName, 14) || "?";
    if (!validPid(pid)) return "bad";
    if (d.banned.includes(pid)) return "kicked";

    if (create) {
      const others = d.seats.filter((s) => s.id !== pid);
      const busy = others.some((s) => s.on) || (others.length > 0 && now - d.touched < REUSE_AFTER);
      if (busy) return "exists";
      if (!d.seats.some((s) => s.id === pid)) {
        // a new table (or an abandoned one being reused)
        const code = d.code;
        Object.assign(d, freshRoom(code, now));
      }
    } else if (!this.exists) {
      return "no-room";
    }

    let seat = d.seats.find((s) => s.id === pid);
    let back = false;
    if (!seat) {
      if (d.seats.length >= MAX_SEATS) return "full";
      seat = { id: pid, name, on: true, at: now };
      if (who) Object.assign(seat, { uid: who.uid, av: who.av, ac: who.ac, fg: who.fg ?? 0, fr: who.fr });
      d.seats.push(seat);
      this.event({ k: "join", pid });
      const g = this.gameDef();
      if (g && d.game) g.def.join?.(d.game.s, pid, this.api());
    } else {
      back = !seat.on;
      seat.on = true;
      seat.name = name;
      if (who) Object.assign(seat, { uid: who.uid, av: who.av, ac: who.ac, fg: who.fg ?? 0, fr: who.fr });
      else if (seat.uid) Object.assign(seat, { uid: undefined, av: undefined, ac: undefined, fg: undefined, fr: undefined });
    }
    if (!d.host || !d.seats.some((s) => s.id === d.host)) d.host = pid;
    if (pid === d.host) this.clearTimer("host-away");
    if (back) this.presence(pid, true);
    this.out.changed = true;
    return null;
  }

  /**
   * A big screen (a TV or a computer) shows the table: no seat, no say in the game. It can open
   * a fresh table, with a game queued up front; the first phone to sit down hosts.
   */
  screenHello(sid: string, create: boolean, game?: string): ErrorCode | null {
    const d = this.d;
    const now = this.h.now();
    if (!validPid(sid)) return "bad";
    if (d.banned.includes(sid)) return "kicked";
    if (create && d.tv?.id !== sid) {
      const busy = d.seats.some((s) => s.on) || (d.seats.length > 0 && now - d.touched < REUSE_AFTER) || (d.screens ?? 0) > 0;
      if (busy) return "exists";
      Object.assign(d, freshRoom(d.code, now));
      d.tv = { id: sid, at: now };
      const gi = ONLINE_GAMES.indexOf(game as GameId);
      if (gi >= 0) d.front = gi;
      // a game the screen runs by itself (the DJ booth) is on before anyone sits down
      if (gi >= 0 && GAMES[game as GameId]?.auto) this.startGame(game as GameId);
    } else if (!create && !this.exists) {
      return "no-room";
    }
    this.out.changed = true;
    return null;
  }

  /** How many big screens are watching (the phones go quiet and point at the TV). */
  setScreens(n: number) {
    if ((this.d.screens ?? 0) === n) return;
    this.d.screens = n;
    this.out.changed = true;
  }

  /** Whether a seat is signed in with one of the site owner's accounts (the rooms server checks). */
  setOwner(pid: string, owner: boolean) {
    const seat = this.d.seats.find((s) => s.id === pid);
    if (!seat || !!seat.owner === owner) return;
    if (owner) seat.owner = true;
    else delete seat.owner;
    this.out.changed = true;
  }

  setOnline(pid: string, on: boolean) {
    const seat = this.d.seats.find((s) => s.id === pid);
    if (!seat || seat.on === on) return;
    seat.on = on;
    if (!on && pid === this.d.host) this.setTimer("host-away", this.h.now() + HOST_GRACE);
    if (on && pid === this.d.host) this.clearTimer("host-away");
    this.presence(pid, on);
    this.out.changed = true;
  }

  /** The game in play hears when a phone drops or comes back (a turn it waits on can stop waiting). */
  private presence(pid: string, on: boolean) {
    const g = this.gameDef();
    if (g && this.d.game) g.def.presence?.(this.d.game.s, pid, on, this.api());
  }

  /**
   * The site owner takes someone off the table (from the back office): their seat goes, as if
   * they had left, and banned, they can't sit at this table again.
   */
  adminKick(pid: string, ban: boolean): boolean {
    const d = this.d;
    if (ban && validPid(pid) && !d.banned.includes(pid)) d.banned.push(pid);
    if (!d.seats.some((s) => s.id === pid)) return false;
    const g = this.gameDef();
    d.seats = d.seats.filter((s) => s.id !== pid);
    if (g && d.game) g.def.leave?.(d.game.s, pid, this.api());
    this.out.kicked.push(pid);
    this.event({ k: "left", pid });
    if (d.host === pid) {
      const next = d.seats.find((s) => s.on) ?? d.seats[0];
      d.host = next?.id ?? "";
      this.clearTimer("host-away");
      if (next) this.event({ k: "host", pid: next.id });
    }
    if (!d.seats.length && d.game && !this.screenRun()) {
      this.finishPlay();
      d.game = null;
      this.clearGameTimers();
    }
    this.out.changed = true;
    return true;
  }

  /* ---------------- actions ---------------- */

  act(pid: string, a: Action) {
    const d = this.d;
    const seat = d.seats.find((s) => s.id === pid);
    if (!seat || !a || typeof a !== "object") return;
    const host = pid === d.host;
    switch (a.a) {
      case "spin": {
        if (a.scope === "lobby") {
          if (!host || d.game) return;
          const index = intIn(a.index, 0, N_LOBBY - 1);
          const duration = num(a.duration, 0.2, 6.5);
          const delta = num(a.delta, -4000, 4000);
          if (index === null || duration === null || delta === null) return;
          d.front = index;
          this.event({ k: "spin", scope: "lobby", by: pid, index, delta, duration });
          this.out.changed = true;
          return;
        }
        // in-game spins go to the game
        this.gameAct(pid, { x: "spin", index: a.index, delta: a.delta, duration: a.duration, scope: a.scope });
        return;
      }
      case "start": {
        if (!host || !(a.game in GAMES)) return;
        if (this.players().length < ONLINE_MIN[a.game]) return;
        this.startGame(a.game);
        return;
      }
      case "end": {
        if (!host || !d.game) return;
        this.finishPlay();
        d.game = null;
        this.clearGameTimers();
        d.strokes = [];
        this.out.strokesReset = true;
        this.out.changed = true;
        return;
      }
      case "watch": {
        // just watching: still at the table, out of the games (no turns, no penalties); the phone
        // shows the big screen's view. Anyone for themselves, the host for anyone.
        const target = d.seats.find((x) => x.id === (a.pid ?? pid));
        if (!target || (target.id !== pid && !host) || !!target.watch === !!a.on) return;
        target.watch = !!a.on || undefined;
        const g = this.gameDef();
        if (g && d.game) {
          if (a.on) g.def.leave?.(d.game.s, target.id, this.api());
          else g.def.join?.(d.game.s, target.id, this.api());
        }
        this.out.changed = true;
        return;
      }
      case "kick": {
        if (!host || a.pid === pid) return;
        const target = d.seats.find((s) => s.id === a.pid);
        if (!target) return;
        const g = this.gameDef();
        d.seats = d.seats.filter((s) => s.id !== a.pid);
        if (!d.banned.includes(a.pid)) d.banned.push(a.pid);
        if (g && d.game) g.def.leave?.(d.game.s, a.pid, this.api());
        this.out.kicked.push(a.pid);
        this.event({ k: "left", pid: a.pid });
        this.out.changed = true;
        return;
      }
      case "leave": {
        // a player gives up their seat (not banned: the link still works later)
        const g = this.gameDef();
        d.seats = d.seats.filter((s) => s.id !== pid);
        if (g && d.game) g.def.leave?.(d.game.s, pid, this.api());
        this.event({ k: "left", pid });
        if (d.host === pid) {
          const next = d.seats.find((s) => s.on) ?? d.seats[0];
          d.host = next?.id ?? "";
          this.clearTimer("host-away");
          if (next) this.event({ k: "host", pid: next.id });
        }
        // the last one out ends the game, except one a big screen runs (the DJ booth plays on)
        if (!d.seats.length && !this.screenRun()) {
          this.finishPlay();
          d.game = null;
          this.clearGameTimers();
        }
        this.out.changed = true;
        return;
      }
      case "makeHost": {
        if (!host || !d.seats.some((s) => s.id === a.pid)) return;
        d.host = a.pid;
        this.event({ k: "host", pid: a.pid });
        this.out.changed = true;
        return;
      }
      case "rename": {
        const name = clean(a.name, 14);
        if (!name) return;
        seat.name = name;
        this.out.changed = true;
        return;
      }
      case "react": {
        if (!REACTIONS.includes(a.r)) return;
        const now = this.h.now();
        if (now - (this.lastReact.get(pid) ?? 0) < 350) return;
        this.lastReact.set(pid, now);
        this.event({ k: "react", pid, r: a.r });
        return;
      }
      case "drank": {
        const pen = d.pens.find((p) => p.id === a.pen);
        if (!pen || !pen.who.includes(pid) || pen.drank.includes(pid)) return;
        pen.drank.push(pid);
        this.event({ k: "drank", pid, pen: pen.id });
        this.out.persist = true;
        return;
      }
      case "buddy": {
        const pen = d.pens.find((p) => p.id === a.pen);
        if (!pen || !pen.who.includes(pid) || !pen.buddy || pen.buddyUsed) return;
        if (!d.seats.some((s) => s.id === pen.buddy)) return;
        pen.buddyUsed = true;
        this.penalty([pen.buddy], "sip", (d.penalty ?? "").trim() ? BUDDY_NOTE_CUSTOM : BUDDY_NOTE);
        this.out.persist = true;
        return;
      }
      case "penalty": {
        if (!host) return;
        d.penalty = clean(a.text, 24);
        this.out.changed = true;
        return;
      }
      case "g": {
        if (!a.g || typeof a.g !== "object" || typeof a.g.x !== "string") return;
        this.gameAct(pid, a.g);
        return;
      }
    }
  }

  /**
   * A big screen talks to the game it shows: only games that listen to screens (the DJ booth's
   * speaker saying the music has started), and only game actions; it can't touch the table.
   */
  screenAct(sid: string, g: unknown): boolean {
    const d = this.d;
    if (!validPid(sid) || d.banned.includes(sid) || d.seats.some((s) => s.id === sid)) return false;
    if (!g || typeof g !== "object" || typeof (g as { x?: unknown }).x !== "string") return false;
    const gd = this.gameDef();
    if (!gd?.def.screen || !d.game) return false;
    // a screen can't be kicked and anyone with the code can open one: only what the game took counts
    if (!gd.def.screen(d.game.s, sid, g as { x: string; [k: string]: unknown }, this.api())) return false;
    this.out.changed = true;
    return true;
  }

  /** The game on now is one a big screen runs (it stays on with nobody seated). */
  private screenRun() {
    const g = this.d.game;
    return !!g && !!(GAMES[g.id] as GameDef<unknown> | undefined)?.auto;
  }

  private startGame(id: GameId) {
    const d = this.d;
    const def = GAMES[id] as GameDef<unknown>;
    this.clearGameTimers();
    this.finishPlay();
    d.strokes = [];
    this.out.strokesReset = true;
    d.game = { id, s: null };
    d.play = { game: id, started: this.h.now(), tally: {} };
    d.game.s = def.init(this.api());
    d.front = Math.max(0, ONLINE_GAMES.indexOf(id));
    // (the DJ booth's phones stay silent: its sound is the speaker's)
    if (!def.auto) this.fx("start");
    this.out.changed = true;
  }

  private gameAct(pid: string, g: { x: string; [k: string]: unknown }) {
    const gd = this.gameDef();
    if (!gd || !this.d.game) return;
    this.lightAct = false;
    gd.def.act(this.d.game.s, pid, g, this.api());
    // games mutate in place; assume a change whenever an action reached them (a light one if the
    // game said so)
    if (this.lightAct) this.out.light = true;
    else this.out.changed = true;
    this.lightAct = false;
  }

  /* ---------------- drawing ---------------- */

  stroke(pid: string, op: StrokeOp) {
    const gd = this.gameDef();
    if (!gd || !this.d.game || !gd.def.canStroke?.(this.d.game.s, pid)) return;
    const list = this.d.strokes;
    // the whole drawing travels in every save: keep it well under the storage value limit
    const full = () => list.reduce((n, s) => n + s.p.length, 0) > MAX_INK;
    switch (op?.o) {
      case "b": {
        if (list.length >= 400 || full()) return;
        const c = INK_COLORS.includes(op.c) ? op.c : INK_COLORS[0];
        const w = num(op.w, 0.003, 0.06) ?? 0.012;
        const p = points(op.p, 2);
        if (!p.length || typeof op.id !== "string") return;
        const s: Stroke = { id: op.id.slice(0, 16), c, w, p };
        list.push(s);
        this.out.relay.push({ op: { o: "b", id: s.id, c, w, p }, from: pid });
        return;
      }
      case "p": {
        const s = list.find((x) => x.id === op.id);
        if (!s || s.p.length > 6000 || full()) return;
        const p = points(op.p, 400);
        if (!p.length) return;
        s.p.push(...p);
        this.out.relay.push({ op: { o: "p", id: s.id, p }, from: pid });
        return;
      }
      case "e": {
        this.out.persist = true;
        this.out.relay.push({ op: { o: "e", id: String(op.id).slice(0, 16) }, from: pid });
        return;
      }
      case "u": {
        list.pop();
        this.out.persist = true;
        this.out.relay.push({ op: { o: "u" }, from: pid });
        return;
      }
      case "c": {
        this.d.strokes = [];
        this.out.persist = true;
        this.out.relay.push({ op: { o: "c" }, from: pid });
        return;
      }
    }
  }

  /* ---------------- time ---------------- */

  nextAlarm(): number | null {
    if (!this.d.timers.length) return null;
    return Math.min(...this.d.timers.map((x) => x.at));
  }

  /** Run every timer that is due. */
  due() {
    const now = this.h.now();
    for (let guard = 0; guard < 50; guard++) {
      const ready = this.d.timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!ready) return;
      this.d.timers = this.d.timers.filter((x) => x !== ready);
      this.out.changed = true;
      if (ready.key === "host-away") {
        const cur = this.d.seats.find((s) => s.id === this.d.host);
        if (cur?.on) continue;
        const next = this.d.seats.find((s) => s.on);
        if (next) {
          this.d.host = next.id;
          this.event({ k: "host", pid: next.id });
        }
        continue;
      }
      if (ready.key.startsWith("pen:")) {
        const p = ready.data as { who: string[]; kind: PenaltyKind; note?: T; buddy?: string; say?: T };
        this.penalty(p.who, p.kind, p.note, { buddy: p.buddy, say: p.say });
        continue;
      }
      if (ready.key.startsWith("g:")) {
        const gd = this.gameDef();
        if (gd && this.d.game) gd.def.timer?.(this.d.game.s, ready.key.slice(2), ready.data, this.api());
      }
    }
  }

  /* ---------------- views ---------------- */

  view(pid: string): RoomView {
    const d = this.d;
    const gd = this.gameDef();
    // a big screen has no seat: every game's view is drawn for one id, and a watcher's id is
    // nobody's, so it sees what the table sees and no one's secrets (each game's view keeps a
    // phone's own word, token, hand or pick to that phone)
    const detail = !!gd && !!d.game;
    return {
      code: d.code,
      you: pid,
      host: d.host,
      seats: d.seats.map((s) => ({
        ...(s.uid ? { id: s.id, name: s.name, on: s.on, uid: s.uid, av: s.av ?? 0, ac: s.ac ?? 0, fg: s.fg ?? 0, ...(s.fr ? { fr: s.fr } : {}) } : { id: s.id, name: s.name, on: s.on }),
        ...(s.watch ? { watch: true } : {}),
      })),
      penalty: d.penalty,
      front: d.front,
      game: detail && gd && d.game ? gd.def.view(d.game.s, pid, this.api()) : null,
      playing: d.game?.id ?? null,
      screens: d.screens ?? 0,
      v: d.v,
    };
  }

  info() {
    const d = this.d;
    const hostSeat = d.seats.find((s) => s.id === d.host);
    return { exists: this.exists, seated: d.seats.length, online: this.onlineCount(), host: hostSeat?.name ?? "", game: d.game?.id ?? null, full: d.seats.length >= MAX_SEATS };
  }

  /* ---------------- internals ---------------- */

  private gameDef(): { def: GameDef<unknown> } | null {
    const g = this.d.game;
    if (!g) return null;
    const def = GAMES[g.id] as GameDef<unknown> | undefined;
    return def ? { def } : null;
  }

  private event(e: RoomEvent) {
    this.out.events.push(e);
  }

  private fx(fx: Fx, pid?: string, data?: number[]) {
    this.event({ k: "fx", fx, pid, data });
  }

  private setTimer(key: string, at: number, data?: unknown) {
    this.d.timers = this.d.timers.filter((x) => x.key !== key);
    this.d.timers.push({ key, at, data });
  }

  private clearTimer(key: string) {
    this.d.timers = this.d.timers.filter((x) => x.key !== key);
  }

  /** Close the books on the game in progress: anyone signed in gets it in their history. */
  private finishPlay() {
    const d = this.d;
    const p = d.play;
    d.play = null;
    if (!p) return;
    const now = this.h.now();
    if (now - p.started < 60_000 || !d.seats.some((s) => s.uid)) return;
    this.out.records.push({
      game: p.game,
      room: d.code,
      started: p.started,
      ended: now,
      players: this.players().map((s) => ({ pid: s.id, uid: s.uid, name: s.name, drinks: p.tally[s.id] ?? 0 })),
    });
  }

  private clearGameTimers() {
    this.d.timers = this.d.timers.filter((x) => !x.key.startsWith("g:") && !x.key.startsWith("pen:"));
  }

  private penalty(who: string[], kind: PenaltyKind, note?: T, opts?: { buddy?: string; delay?: number; say?: T }) {
    const d = this.d;
    // (only players: someone just watching never drinks)
    const ids = new Set(this.players().map((s) => s.id));
    const list = [...new Set(who)].filter((id) => ids.has(id));
    if (!list.length) return;
    if (opts?.delay && opts.delay > 0) {
      this.setTimer(`pen:${++d.seq}`, this.h.now() + opts.delay, { who: list, kind, note, buddy: opts.buddy, say: opts.say });
      this.out.changed = true;
      return;
    }
    if (kind !== "safe" && d.play) for (const pid of list) d.play.tally[pid] = (d.play.tally[pid] ?? 0) + 1;
    const id = `p${++d.seq}`;
    const buddy = opts?.buddy && ids.has(opts.buddy) && !list.includes(opts.buddy) && kind !== "safe" ? opts.buddy : undefined;
    d.pens.push({ id, who: list, buddy, drank: [], at: this.h.now() });
    if (d.pens.length > 30) d.pens = d.pens.slice(-30);
    this.event({ k: "penalty", id, who: list, kind, note, buddy, ...(opts?.say ? { say: opts.say } : {}) });
    this.out.persist = true;
  }

  /** The seats in the games: everyone at the table except those just watching. */
  private players() {
    return this.d.seats.filter((s) => !s.watch);
  }

  private api(): Api {
    const h = this.h;
    const ids = () => this.players().map((s) => s.id);
    const step = (from: string | null, among: string[] | undefined, dir: 1 | -1) => {
      // turns pass over phones that are away; if everyone is away, nobody is skipped
      const pool = ids().filter((id) => !among || among.includes(id));
      const here = pool.filter((id) => this.d.seats.some((s) => s.id === id && s.on));
      const order = here.length ? here : pool;
      if (!order.length) return from ?? "";
      if (from === null) return order[0];
      const all = ids();
      const pos = all.indexOf(from);
      if (pos < 0) return order[0];
      for (let i = 1; i <= all.length; i++) {
        const cand = all[(pos + dir * i + all.length * 2) % all.length];
        if (order.includes(cand)) return cand;
      }
      return order[0];
    };
    return {
      now: h.now(),
      customPenalty: !!(this.d.penalty ?? "").trim(),
      rand: () => h.rand(),
      int: (n: number) => Math.floor(h.rand() * n),
      shuffle: <X>(a: X[]) => {
        const b = a.slice();
        for (let i = b.length - 1; i > 0; i--) {
          const j = Math.floor(h.rand() * (i + 1));
          [b[i], b[j]] = [b[j], b[i]];
        }
        return b;
      },
      ids,
      has: (pid: string) => this.d.seats.some((s) => s.id === pid),
      online: (pid: string) => this.d.seats.some((s) => s.id === pid && s.on),
      isHost: (pid: string) => pid === this.d.host,
      isOwner: (pid: string) => this.d.seats.some((s) => s.id === pid && !!s.owner),
      next: (after, among) => step(after, among, 1),
      prev: (before, among) => step(before, among, -1),
      penalty: (who, kind, note, opts) => this.penalty(who, kind, note, opts),
      fx: (fx, pid, data) => this.fx(fx, pid, data),
      spin: (scope: SpinScope, by: string, index: number, delta: number, duration: number) => this.event({ k: "spin", scope, by, index, delta, duration }),
      timer: (key, at, data) => this.setTimer(`g:${key}`, at, data),
      clear: (key) => this.clearTimer(`g:${key}`),
      resetStrokes: () => {
        this.d.strokes = [];
        this.out.strokesReset = true;
      },
      light: () => {
        this.lightAct = true;
      },
    };
  }
}

function points(raw: unknown, max: number): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (let i = 0; i + 1 < raw.length && out.length < max * 2; i += 2) {
    const x = Number(raw[i]);
    const y = Number(raw[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push(Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000);
  }
  return out;
}
