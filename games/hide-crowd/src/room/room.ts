// One game room: who's in it, the lobby (arena votes, the penalty switch), the round that's on, its
// result and penalty, and what each phone or big screen is shown. No networking and no clock of its
// own (every call says what time it is), so the tests drive it directly; the Durable Object in
// src/server/worker.ts runs it.
import {
  ARENA,
  ARENAS,
  BITE_MS,
  GLANCE_MS,
  MATCH_PLACES,
  THIN_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCORE_TO_WIN,
  SIMULATION_STEP_MS,
  STALLS,
  advanceMatch,
  characterForOwner,
  characterMaxSpeed,
  createMatch,
  crowdMoment,
  environmentalDrift,
  normalizeVector,
  rideBike,
  roundAwards,
  roundPenalty,
  sweepSpot,
  startBlend,
  startDistract,
  startPunch,
  type ArenaId,
  type AwardKey,
  type Character,
  type MatchState,
  type RoundPenalty,
  type Vector
} from "../engine";
import type { AvatarView, ClientMsg, EventView, Lang, Role, RoomInfo, RoomView, TallyView } from "./protocol";

const ROOM_TTL_MS = 3 * 60 * 60_000;
/** a room nobody ever came into is let go sooner */
const EMPTY_TTL_MS = 30 * 60_000;
/** a held stick is resent at least every 150 ms; older than this, the body brakes */
const INPUT_STALE_MS = SIMULATION_STEP_MS * 5;
/** How long a room opened from a changle.ca table keeps the host role for the table's host. */
export const HOST_HOLD = 90_000;
/** How long a host who drops off (a reload, a tunnel) stays the host. */
export const HOST_GRACE = 30_000;
const MAX_SCREENS = 6;
const TABLE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const r2 = (value: number) => Math.round(value * 100) / 100;
const r1 = (value: number) => Math.round(value * 10) / 10;

/** Who opened the room from a changle.ca table, which table, and its own penalty. Anything that doesn't look right is ignored. */
export interface Opening {
  host?: unknown;
  table?: unknown;
  penalty?: unknown;
}

/**
 * For the browser tests only (the Worker accepts it with ALLOW_TEST_SETTINGS=1, never set on
 * changle.ca): a short round, the first two players starting face to face, or the first player
 * starting at one of the night market's stalls (0 to 3) with nobody else near it.
 */
export interface TestSettings {
  roundMs?: number;
  duel?: boolean;
  stall?: number;
}

export interface Member {
  id: string;
  name: string;
  role: Role;
  lang: Lang;
  online: boolean;
  joinedAt: number;
  lastSeen: number;
}

export interface RoundResult {
  round: number;
  winnerId: string | null;
  penalty: RoundPenalty | null;
  /** the round's nicknames (missing in a room saved before they existed) */
  awards?: { owner: string; award: AwardKey }[];
  /** who spotted whom (engine MatchState.spottedBy; missing in a room saved before it existed) */
  spottedBy?: Record<string, Record<string, number>>;
}

/** A player's match so far, added up over its rounds, for the match's titles. */
export interface MatchStats {
  score: number;
  feasts: number;
  tagged: number;
  fouls: number;
  swings: number;
  snacks: number;
  /** the best row of tags in any of its rounds */
  best: number;
}

/** A match under way: its places in order, how many have been played, everyone's points and stats so far. */
export interface MatchProgress {
  places: ArenaId[];
  played: number;
  totals: Record<string, number>;
  stats: Record<string, MatchStats>;
}

/** The match's titles: the round's titles, worked out over everything its players did in it. */
export function matchAwards(stats: Record<string, MatchStats>): { owner: string; award: AwardKey }[] {
  const characters = Object.entries(stats).map(([owner, item]) => ({ kind: "player", ownerId: owner, score: item.score, feasts: item.feasts, tagged: item.tagged, fouls: item.fouls, swings: item.swings, snacks: item.snacks }) as unknown as Character);
  const runs = Object.fromEntries(Object.entries(stats).map(([owner, item]) => [owner, { streak: 0, chain: 0, until: 0, best: item.best }]));
  return roundAwards({ characters, runs });
}

export interface RoomState {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  hostId: string | null;
  /** until when a host chosen at the start keeps the role before they arrive */
  hostHold?: number;
  table: string | null;
  members: Member[];
  game: MatchState | null;
  inputs: Record<string, Vector>;
  inputUpdatedAt: Record<string, number>;
  arenaVotes: Record<string, ArenaId>;
  seed: number;
  settings: { penalties: boolean; custom: string; match?: boolean };
  /** the match under way (settings.match), or null */
  match?: MatchProgress | null;
  round: number;
  result: RoundResult | null;
  ended: boolean;
  test?: TestSettings;
}

export type JoinResult = "ok" | "full" | "identity" | "noRoom";

export function cleanName(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) : "";
  return text || fallback;
}

export class Room {
  /** something that must be stored changed (not a frame of movement) */
  private dirty = false;

  constructor(readonly st: RoomState) {
    this.st.arenaVotes ??= {};
    this.st.inputUpdatedAt ??= {};
    this.st.settings ??= { penalties: true, custom: "" };
    // (a whole match unless the host turns it off; a room saved before matches existed gets one too)
    this.st.settings.match ??= true;
    this.st.match ??= null;
    this.st.round ??= 0;
    this.st.result ??= null;
    this.st.ended ??= false;
    this.st.table ??= null;
  }

  static create(code: string, now: number, seed = Math.floor(Math.random() * 0x7fffffff), opening: Opening = {}, test?: TestSettings): Room {
    const host = typeof opening.host === "string" && ID_RE.test(opening.host) ? opening.host : null;
    const table = typeof opening.table === "string" && TABLE_RE.test(opening.table) ? opening.table : null;
    const custom = typeof opening.penalty === "string" ? opening.penalty.replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) : "";
    const room = new Room({
      code,
      createdAt: now,
      lastActivityAt: now,
      hostId: host,
      ...(host ? { hostHold: now + HOST_HOLD } : {}),
      table,
      members: [],
      game: null,
      inputs: {},
      inputUpdatedAt: {},
      arenaVotes: {},
      seed,
      settings: { penalties: true, custom, match: true },
      match: null,
      round: 0,
      result: null,
      ended: false,
      ...(test ? { test } : {})
    });
    room.dirty = true;
    return room;
  }

  /** Whether something worth storing changed since the last call. */
  takeDirty(): boolean {
    const dirty = this.dirty;
    this.dirty = false;
    return dirty;
  }

  get playing(): boolean {
    return this.st.game?.phase === "playing";
  }

  info(now = Date.now()): RoomInfo {
    if (this.expired(now)) return { exists: false };
    const players = this.st.members.filter((member) => member.role === "player").length;
    // (for the table: "over" means the host took everyone back; between rounds is the lobby)
    const phase = this.st.ended ? "over" : this.playing ? "playing" : "lobby";
    return { exists: true, phase, players, full: players >= MAX_PLAYERS };
  }

  private member(id: string | null | undefined): Member | undefined {
    return id ? this.st.members.find((member) => member.id === id) : undefined;
  }

  private inRound(id: string): boolean {
    return !!this.st.game && !!characterForOwner(this.st.game, id);
  }

  join(id: string, name: string, lang: Lang, role: Role, now: number): JoinResult {
    if (this.expired(now)) return "noRoom";
    if (!ID_RE.test(id)) return "identity";
    const existing = this.member(id);
    if (existing && existing.role !== role) return "identity";
    if (!existing) {
      const same = this.st.members.filter((member) => member.role === role);
      if (role === "screen" && same.length >= MAX_SCREENS) {
        const gone = same.find((member) => !member.online);
        if (!gone) return "full";
        this.st.members = this.st.members.filter((member) => member !== gone);
      }
      if (role === "player" && same.length >= MAX_PLAYERS) {
        // a seat left by someone who went away (and isn't in the round on now) is free again
        const gone = same.filter((member) => !member.online && !this.inRound(member.id)).sort((a, b) => a.lastSeen - b.lastSeen)[0];
        if (!gone) return "full";
        this.st.members = this.st.members.filter((member) => member !== gone);
        delete this.st.arenaVotes[gone.id];
      }
    }
    const fallback = lang === "zh" ? "玩家" : "Player";
    const safeName = role === "screen" ? "TV" : cleanName(name, fallback);
    if (existing) {
      existing.name = safeName;
      existing.lang = lang;
      existing.online = true;
      existing.lastSeen = now;
    } else {
      this.st.members.push({ id, name: safeName, role, lang, online: true, joinedAt: now, lastSeen: now });
    }
    this.st.lastActivityAt = now;
    this.claimHost(now);
    this.dirty = true;
    return "ok";
  }

  presence(id: string, online: boolean, now: number): void {
    const member = this.member(id);
    if (!member) return;
    if (member.online === online) return;
    member.online = online;
    member.lastSeen = now;
    if (!online) {
      delete this.st.inputs[id];
      delete this.st.inputUpdatedAt[id];
    }
    this.st.lastActivityAt = now;
    this.claimHost(now);
    this.dirty = true;
  }

  /** After a restart: who is actually connected. */
  presenceFromSockets(connectedIds: string[], now: number): void {
    const connected = new Set(connectedIds);
    for (const member of this.st.members) {
      const online = connected.has(member.id);
      if (member.online && !online) member.lastSeen = now;
      member.online = online;
      if (!online) {
        delete this.st.inputs[member.id];
        delete this.st.inputUpdatedAt[member.id];
      }
    }
    this.claimHost(now);
  }

  /**
   * The host is the table's host when the room came from a table (they have HOST_HOLD to arrive),
   * else the first player in. A host who has been gone HOST_GRACE hands over to the player who has
   * been here longest.
   */
  claimHost(now: number): void {
    const host = this.member(this.st.hostId);
    if (this.st.hostId && !host && now < (this.st.hostHold ?? 0)) return;
    if (host && host.role === "player" && (host.online || now - host.lastSeen < HOST_GRACE)) return;
    const next = this.st.members.filter((member) => member.role === "player" && member.online).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next && next.id !== this.st.hostId) {
      this.st.hostId = next.id;
      this.dirty = true;
    }
  }

  /** The next moment the room must look at itself with nobody saying anything (a host to hand over). */
  nextCheck(now: number): number | null {
    const host = this.member(this.st.hostId);
    if (this.st.hostId && !host && this.st.hostHold && now < this.st.hostHold) return this.st.hostHold;
    if (host && !host.online && now - host.lastSeen < HOST_GRACE) return host.lastSeen + HOST_GRACE;
    return null;
  }

  handle(id: string, message: ClientMsg, now: number): void {
    const member = this.st.members.find((item) => item.id === id && item.online);
    if (!member || !message || typeof message !== "object") return;
    this.st.lastActivityAt = now;
    member.lastSeen = now;
    if (message.t === "ping") return;
    if (message.t === "leave") {
      if (member.role === "player" && !this.inRound(id)) {
        this.st.members = this.st.members.filter((item) => item !== member);
        delete this.st.arenaVotes[id];
        this.claimHost(now);
        this.dirty = true;
      } else this.presence(id, false, now);
      return;
    }
    if (member.role !== "player") return;
    const host = id === this.st.hostId;
    switch (message.t) {
      case "move": {
        if (!this.playing || !this.inRound(id)) return;
        this.st.inputs[id] = normalizeVector({ x: Number(message.x), y: Number(message.y) });
        this.st.inputUpdatedAt[id] = now;
        return;
      }
      case "punch":
      case "blend":
      case "distract": {
        if (!this.playing || !this.inRound(id)) return;
        this.advance(now);
        if (!this.st.game || this.st.game.phase !== "playing") return;
        const start = message.t === "punch" ? startPunch : message.t === "blend" ? startBlend : startDistract;
        this.st.game = start(this.st.game, id, now);
        return;
      }
      case "vote": {
        if (this.playing || !ARENAS.includes(message.arena)) return;
        this.st.arenaVotes[id] = message.arena;
        this.dirty = true;
        return;
      }
      case "penalties": {
        if (!host) return;
        this.st.settings.penalties = message.on === true;
        this.dirty = true;
        return;
      }
      case "match": {
        if (!host || this.playing) return;
        this.st.settings.match = message.on === true;
        // (turning it off, or on again, starts over: the next round is a fresh start)
        this.st.match = null;
        this.dirty = true;
        return;
      }
      case "start": {
        if (!host || this.playing || this.st.ended) return;
        this.startRound(now);
        return;
      }
      case "lobby": {
        if (!host || this.playing) return;
        this.st.game = null;
        this.st.result = null;
        // (back to the lobby: a match under way is over)
        this.st.match = null;
        this.st.inputs = {};
        this.st.inputUpdatedAt = {};
        this.dirty = true;
        return;
      }
      case "end": {
        if (!host) return;
        this.st.ended = true;
        if (this.st.game?.phase === "playing") this.st.game = null;
        this.dirty = true;
        return;
      }
    }
  }

  private startRound(now: number): void {
    const players = this.st.members
      .filter((item) => item.role === "player" && item.online)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .slice(0, MAX_PLAYERS);
    if (players.length < MIN_PLAYERS) return;
    this.st.seed = (this.st.seed * 48271 + now) % 0x7fffffff;
    this.st.inputs = {};
    this.st.inputUpdatedAt = {};
    const totals: Record<ArenaId, number> = { plaza: 0, metro: 0, gallery: 0, market: 0 };
    for (const player of players) {
      const vote = this.st.arenaVotes[player.id];
      if (vote && ARENAS.includes(vote)) totals[vote]++;
    }
    const highest = Math.max(...Object.values(totals));
    const leaders = ARENAS.filter((arena) => totals[arena] === highest);
    // nobody voted: each round goes to the next arena, so a table sees all four
    const voted = highest === 0 ? ARENAS[this.st.round % ARENAS.length] : leaders[this.st.seed % leaders.length];
    // a match: its next place; a new one starts where the lobby picked, then goes where it hasn't been
    const going = this.st.match && this.st.match.played < this.st.match.places.length ? this.st.match : null;
    let arena = voted;
    if (!this.st.settings.match) this.st.match = null;
    else if (going) arena = going.places[going.played];
    else {
      const rest = ARENAS.filter((place) => place !== voted);
      let pick = this.st.seed;
      for (let index = rest.length - 1; index > 0; index--) {
        pick = (pick * 48271) % 0x7fffffff;
        const other = pick % (index + 1);
        [rest[index], rest[other]] = [rest[other], rest[index]];
      }
      this.st.match = { places: [voted, ...rest].slice(0, MATCH_PLACES), played: 0, totals: {}, stats: {} };
    }
    this.st.game = createMatch(players.map((player) => ({ id: player.id, name: player.name })), now, this.st.seed, arena);
    const test = this.st.test;
    if (test?.roundMs) this.st.game.endsAt = now + test.roundMs;
    if (test?.duel) {
      const [one, two] = players.map((player) => characterForOwner(this.st.game!, player.id)!);
      Object.assign(one, { x: 40, y: 29, facing: 0 });
      Object.assign(two, { x: 45, y: 29, facing: Math.PI });
      for (const other of this.st.game.characters) if (other !== one && other !== two && Math.hypot(other.x - 42, other.y - 29) < 12) other.y = other.y < 29 ? 8 : 50;
    }
    if (test?.stall !== undefined && arena === "market") {
      const taster = characterForOwner(this.st.game, players[0].id)!;
      Object.assign(taster, { x: STALLS[test.stall], y: ARENA.marginY + 2, velocity: { x: 0, y: 0 }, facing: -Math.PI / 2 });
      for (const other of this.st.game.characters) if (other !== taster && Math.abs(other.x - taster.x) < 14) other.y = Math.max(other.y, 40);
      // (and the other players start well clear of every stall: one standing still at one would taste it)
      for (const player of players.slice(1)) {
        const body = characterForOwner(this.st.game, player.id);
        if (body) body.y = Math.max(body.y, 40);
      }
    }
    this.st.round++;
    this.st.result = null;
    this.dirty = true;
  }

  /** Move the round on to `now`. A tag, or the end of the round, is worth storing. */
  advance(now: number): void {
    const game = this.st.game;
    if (!game || game.phase !== "playing") return;
    for (const [id, updatedAt] of Object.entries(this.st.inputUpdatedAt)) {
      if (now - updatedAt > INPUT_STALE_MS) {
        delete this.st.inputs[id];
        delete this.st.inputUpdatedAt[id];
      }
    }
    const before = game.nextEventId;
    const next = advanceMatch(game, now, this.st.inputs);
    this.st.game = next;
    if (next.events.some((event) => event.id >= before && (event.t === "tag" || event.t === "over" || event.t === "hide"))) this.dirty = true;
    if (next.phase === "over") {
      this.st.inputs = {};
      this.st.inputUpdatedAt = {};
      this.st.result = {
        round: this.st.round,
        winnerId: next.winnerId,
        penalty: this.st.settings.penalties ? roundPenalty(next) : null,
        awards: roundAwards(next),
        spottedBy: next.spottedBy ?? {}
      };
      // a match: the round's points and doings add up
      const match = this.st.match;
      if (match) {
        for (const player of next.characters) {
          if (player.kind !== "player" || !player.ownerId) continue;
          const id = player.ownerId;
          const so = match.stats[id] ?? { score: 0, feasts: 0, tagged: 0, fouls: 0, swings: 0, snacks: 0, best: 0 };
          match.totals[id] = (match.totals[id] ?? 0) + player.score;
          match.stats[id] = {
            score: so.score + player.score,
            feasts: so.feasts + (player.feasts ?? 0),
            tagged: so.tagged + player.tagged,
            fouls: so.fouls + player.fouls,
            swings: so.swings + (player.swings ?? 0),
            snacks: so.snacks + (player.snacks ?? 0),
            best: Math.max(so.best, next.runs?.[id]?.best ?? 0)
          };
        }
        match.played++;
      }
      this.dirty = true;
    }
  }

  view(id: string, role: Role, now = Date.now()): RoomView {
    const me = this.member(id);
    const game = this.st.game;
    const asPlayer = role === "player" && me?.role === "player";
    const nameOf = (owner: string | null) => (owner ? this.member(owner)?.name ?? null : null);
    const match = this.st.match ?? null;
    const players = this.st.members
      .filter((member) => member.role === "player")
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((member) => {
        const body = game ? characterForOwner(game, member.id) : undefined;
        return {
          name: member.name,
          online: member.online,
          host: member.id === this.st.hostId,
          inRound: !!body,
          you: asPlayer && member.id === id,
          score: body?.score ?? 0,
          tagged: body?.tagged ?? 0,
          ...(match ? { total: match.totals[member.id] ?? 0 } : {})
        };
      });
    const arenaVotes: Record<ArenaId, number> = { plaza: 0, metro: 0, gallery: 0, market: 0 };
    for (const member of this.st.members) {
      const vote = this.st.arenaVotes[member.id];
      if (member.role === "player" && member.online && vote && ARENAS.includes(vote)) arenaVotes[vote]++;
    }
    let gameView: RoomView["game"] = null;
    if (game) {
      const mine = asPlayer ? characterForOwner(game, id) : undefined;
      // (whoever just tagged this phone's player: named over the body they punched from, on this phone
      // only, for a moment, and only while that body is still theirs)
      const tagger = mine && game.phase === "playing" ? game.taggers?.[id] : undefined;
      const taggerBody = tagger && now < tagger.until && game.characters[tagger.body]?.ownerId === tagger.by ? tagger.body : -1;
      const taggerName = tagger && taggerBody >= 0 ? nameOf(tagger.by) : null;
      gameView = {
        phase: game.phase,
        arena: game.arena,
        drift: environmentalDrift(game.arena, game.startedAt, now),
        moment: (() => {
          const moment = game.phase === "playing" ? crowdMoment(game.arena, game.startedAt, now) : null;
          if (!moment) return null;
          if (moment.kind === "spot") {
            // (the theatre's follow spot: its sweep, by the round's dice, and how far along it is)
            const sweep = sweepSpot(game.seed, game.startedAt, moment.startsAt);
            return { kind: moment.kind, endsInMs: Math.max(0, moment.endsAt - now), spot: { dir: sweep.dir, y: r2(sweep.y), wave: r2(sweep.wave), phase: r2(sweep.phase), sinceMs: now - sweep.startsAt } };
          }
          if (moment.kind === "bike") {
            // (the seawall's bike: its line, by the round's dice, and how far along it is)
            const ride = rideBike(game.seed, game.startedAt, moment.startsAt);
            return { kind: moment.kind, endsInMs: Math.max(0, moment.endsAt - now), bike: { y: r2(ride.y), dir: ride.dir, sinceMs: now - ride.startsAt } };
          }
          if (moment.kind !== "crackers") return { kind: moment.kind, endsInMs: Math.max(0, moment.endsAt - now) };
          const crackers = (game.crackers ?? []).map((cracker) => ({
            x: r2(cracker.x),
            y: r2(cracker.y),
            landsInMs: cracker.landsAt - now,
            bangsInMs: cracker.bangsAt - now
          }));
          return { kind: moment.kind, endsInMs: Math.max(0, moment.endsAt - now), crackers };
        })(),
        // (a distraction turns every camera but its maker's: theirs stays on the whole floor, to slip away)
        glance:
          game.phase === "playing" && game.glance && now < game.glance.at + GLANCE_MS && game.glance.by !== id
            ? { x: r2(game.glance.x), y: r2(game.glance.y), endsInMs: game.glance.at + GLANCE_MS - now }
            : null,
        endsAt: game.endsAt,
        remainingMs: game.phase === "playing" ? Math.max(0, game.endsAt - now) : 0,
        scoreToWin: SCORE_TO_WIN,
        thinning: game.phase === "playing" && game.endsAt - game.startedAt >= THIN_MS * 2 && now >= game.endsAt - THIN_MS,
        avatars: game.characters.map((character, index) => {
          const avatar: AvatarView = {
            x: r2(character.x),
            y: r2(character.y),
            f: r2(character.facing),
            vx: r1(character.velocity?.x ?? 0),
            vy: r1(character.velocity?.y ?? 0),
            p: character.pose
          };
          if (mine && character === mine) avatar.me = 1;
          if (index === taggerBody && taggerName) avatar.by = taggerName;
          if (character.gone) avatar.o = 1;
          // the round is over: every screen finds out who was who (the next round shuffles the crowd
          // again), and the winner dances
          if (game.phase === "over" && character.kind === "player") {
            avatar.n = nameOf(character.ownerId) ?? character.name;
            if (character.ownerId === game.winnerId) {
              avatar.w = 1;
              avatar.p = "dance";
            }
          }
          return avatar;
        }),
        // (a distraction is heard of only by whoever made it: everyone else just sees a passer-by swing)
        events: game.events.filter((event) => event.t !== "decoy" || (!!mine && event.actor === id)).map((event) => {
          // (a blast tells each phone only whether it knocked down this phone's player)
          const onYou = !!mine && (event.target === id || (event.targets ?? []).includes(id));
          const item: EventView = { id: event.id, t: event.t, byYou: !!mine && event.actor === id, onYou };
          // (a tag names the other player on the two phones it concerns: who did it, whom it was)
          if (event.t === "tag" && (item.onYou || item.byYou)) {
            const other = nameOf(item.onYou ? event.actor : event.target);
            if (other) item.name = other;
          }
          // (the announcer: every screen, with who it was, as everyone sees the score go up anyway)
          if (event.call) {
            item.call = event.call;
            const who = nameOf(event.actor);
            if (who) item.who = who;
          }
          // (which stall was tasted is for everyone; who tasted it, only for them)
          if (event.stall !== undefined) item.stall = event.stall;
          return item;
        }),
        me: mine
          ? {
              punchReadyAt: mine.cooldownUntil,
              blendReadyAt: mine.blendCooldownUntil,
              maxSpeed: r2(characterMaxSpeed(mine, game.arena, now)),
              distracts: mine.distracts ?? 0,
              bites: mine.bites ?? 0,
              at: mine.biteStall ?? -1,
              tasting: mine.biteStall >= 0 && mine.biteStall !== undefined ? r2(Math.min(1, (now - mine.biteSince) / BITE_MS)) : 0
            }
          : null
      };
    }
    const result = this.st.result;
    // (a match's place: once its round is over, the one just played)
    const matchView = match ? { index: Math.min(match.played + (game?.phase === "playing" ? 1 : 0), match.places.length) || 1, of: match.places.length } : null;
    const done = !!match && match.played >= match.places.length;
    const top = match ? Math.max(0, ...Object.values(match.totals)) : 0;
    const leaders = match ? Object.keys(match.totals).filter((owner) => match.totals[owner] === top) : [];
    const matchWinner = done && top > 0 && leaders.length === 1 ? leaders[0] : null;
    return {
      code: this.st.code,
      table: this.st.table,
      phase: game?.phase ?? "lobby",
      round: this.st.round,
      you: { role, host: asPlayer && id === this.st.hostId, vote: asPlayer ? this.st.arenaVotes[id] ?? null : null },
      arenaVotes,
      players,
      screens: this.st.members.filter((member) => member.role === "screen" && member.online).length,
      settings: { penalties: this.st.settings.penalties, custom: this.st.settings.custom, match: this.st.settings.match !== false },
      match: matchView,
      game: gameView,
      result: result
        ? {
            round: result.round,
            winner: nameOf(result.winnerId),
            youWon: asPlayer && result.winnerId === id,
            penalty: result.penalty
              ? { kind: result.penalty.kind, who: result.penalty.who.map((owner) => nameOf(owner) ?? "?"), times: result.penalty.times }
              : null,
            awards: (result.awards ?? []).map((item) => ({ name: nameOf(item.owner) ?? "?", award: item.award, you: asPlayer && item.owner === id })),
            mine: asPlayer ? tallies(result.spottedBy ?? {}, id, nameOf) : null,
            match: match
              ? {
                  index: matchView!.index,
                  of: matchView!.of,
                  next: done ? null : match.places[match.played],
                  done,
                  winner: nameOf(matchWinner),
                  youWon: asPlayer && matchWinner === id,
                  awards: done ? matchAwards(match.stats).map((item) => ({ name: nameOf(item.owner) ?? "?", award: item.award, you: asPlayer && item.owner === id })) : []
                }
              : null
          }
        : null,
      ended: this.st.ended,
      now
    };
  }

  expired(now: number): boolean {
    if (this.st.members.length === 0) return now - this.st.createdAt > EMPTY_TTL_MS && now - this.st.lastActivityAt > EMPTY_TTL_MS;
    return this.st.members.every((member) => !member.online) && now - this.st.lastActivityAt > ROOM_TTL_MS;
  }

  setInput(id: string, vector: Vector, now: number): void {
    this.st.inputs[id] = normalizeVector(vector);
    this.st.inputUpdatedAt[id] = now;
  }
}

/** A player's round in tags: who spotted them and whom they spotted, most first (then by name). */
function tallies(spottedBy: Record<string, Record<string, number>>, id: string, nameOf: (owner: string | null) => string | null): { by: TallyView[]; got: TallyView[] } {
  const order = (a: TallyView, b: TallyView) => b.n - a.n || a.name.localeCompare(b.name);
  const by = Object.entries(spottedBy[id] ?? {}).map(([owner, n]) => ({ name: nameOf(owner) ?? "?", n }));
  const got = Object.entries(spottedBy)
    .filter(([victim, hunters]) => victim !== id && hunters[id])
    .map(([victim, hunters]) => ({ name: nameOf(victim) ?? "?", n: hunters[id] }));
  return { by: by.sort(order), got: got.sort(order) };
}

export function createRoomView(state: RoomState, id: string, role: Role, now = Date.now()): RoomView {
  return new Room(state).view(id, role, now);
}

export const ROOM_MAX_PLAYERS = MAX_PLAYERS;
