import {
  BLEND_COOLDOWN_MS,
  SIMULATION_STEP_MS,
  SCORE_TO_WIN,
  characterMaxSpeed,
  environmentalDrift,
  advanceMatch,
  characterForOwner,
  createMatch,
  normalizeVector,
  nextMatchWake,
  startBlend,
  startPunch,
  type ArenaId,
  type MatchState,
  type Vector
} from "../engine";
import type { ClientMsg, Lang, Role, RoomView } from "./protocol";

const ROOM_TTL_MS = 3 * 60 * 60_000;
const INPUT_STALE_MS = SIMULATION_STEP_MS * 4;
const MAX_PLAYERS = 8;
const ARENAS: ArenaId[] = ["plaza", "metro", "gallery"];

export interface Member {
  id: string;
  name: string;
  role: Role;
  lang: Lang;
  online: boolean;
  joinedAt: number;
}

export interface RoomState {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  hostId: string | null;
  members: Member[];
  game: MatchState | null;
  inputs: Record<string, Vector>;
  inputUpdatedAt: Record<string, number>;
  arenaVotes: Record<string, ArenaId>;
  seed: number;
}

export class Room {
  constructor(readonly st: RoomState) {
    this.st.arenaVotes ??= {};
    this.st.inputUpdatedAt ??= {};
    if (this.st.game) {
      this.st.game.arena ??= "plaza";
      for (const character of this.st.game.characters) {
        character.recoil ??= { x: 0, y: 0 };
        character.velocity ??= { x: 0, y: 0 };
      }
    }
  }

  static create(code: string, now: number, seed = Math.floor(Math.random() * 0x7fffffff)): Room {
    return new Room({
      code,
      createdAt: now,
      lastActivityAt: now,
      hostId: null,
      members: [],
      game: null,
      inputs: {},
      inputUpdatedAt: {},
      arenaVotes: {},
      seed
    });
  }

  info(now = Date.now()) {
    if (this.expired(now)) return { exists: false as const };
    const players = this.st.members.filter((member) => member.role === "player").length;
    const phase = this.st.game?.phase ?? "lobby";
    return { exists: true as const, phase, players, full: players >= MAX_PLAYERS };
  }

  join(id: string, name: string, lang: Lang, role: Role, now: number): boolean {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id) || this.expired(now)) return false;
    const existing = this.st.members.find((member) => member.id === id);
    if (existing && existing.role !== role) return false;
    if (!existing && role === "player" && this.st.game?.phase === "playing") return false;
    if (!existing && role === "player" && this.st.members.filter((member) => member.role === "player").length >= MAX_PLAYERS) return false;
    const safeName = name.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18) || "Guest";
    if (existing) {
      existing.name = safeName;
      existing.lang = lang;
      existing.role = role;
      existing.online = true;
    } else {
      this.st.members.push({ id, name: safeName, role, lang, online: true, joinedAt: now });
    }
    if (role === "player" && this.st.hostId === null) this.st.hostId = id;
    this.st.lastActivityAt = now;
    return true;
  }

  presence(id: string, online: boolean, now: number): void {
    const member = this.st.members.find((item) => item.id === id);
    if (!member) return;
    member.online = online;
    if (!online) {
      delete this.st.inputs[id];
      delete this.st.inputUpdatedAt[id];
    }
    if (!this.st.members.some((item) => item.id === this.st.hostId && item.role === "player" && item.online)) {
      this.st.hostId = this.st.members.find((item) => item.role === "player" && item.online)?.id ?? null;
    }
    this.st.lastActivityAt = now;
  }

  presenceFromSockets(connectedIds: string[], now: number): void {
    const connected = new Set(connectedIds);
    for (const member of this.st.members) {
      member.online = connected.has(member.id);
      if (!member.online) {
        delete this.st.inputs[member.id];
        delete this.st.inputUpdatedAt[member.id];
      }
    }
    if (!this.st.members.some((item) => item.id === this.st.hostId && item.role === "player" && item.online)) {
      this.st.hostId = this.st.members.find((item) => item.role === "player" && item.online)?.id ?? null;
    }
    this.st.lastActivityAt = now;
  }

  handle(id: string, message: ClientMsg, now: number): void {
    const member = this.st.members.find((item) => item.id === id && item.online);
    if (!member) return;
    this.st.lastActivityAt = now;
    if (message.t === "ping") return;
    if (message.t === "leave") {
      this.presence(id, false, now);
      return;
    }
    if (message.t === "vote") {
      if (member.role === "player" && !this.st.game && ARENAS.includes(message.arena)) this.st.arenaVotes[id] = message.arena;
      return;
    }
    if (message.t === "move") {
      if (member.role !== "player" || !this.st.game || this.st.game.phase !== "playing") return;
      this.st.inputs[id] = normalizeVector({ x: message.x, y: message.y });
      this.st.inputUpdatedAt[id] = now;
      return;
    }
    if (message.t === "start") {
      if (id !== this.st.hostId || this.st.game?.phase === "playing") return;
      const players = this.st.members.filter((item) => item.role === "player" && item.online);
      if (players.length < 2 || players.length > MAX_PLAYERS) return;
      this.st.seed = (this.st.seed * 48271 + now) % 0x7fffffff;
      this.st.inputs = {};
      const totals: Record<ArenaId, number> = { plaza: 0, metro: 0, gallery: 0 };
      for (const player of players) {
        const vote = this.st.arenaVotes[player.id];
        if (vote && ARENAS.includes(vote)) totals[vote]++;
      }
      const highest = Math.max(...Object.values(totals));
      const leaders = ARENAS.filter((arena) => totals[arena] === highest);
      const arena = highest === 0 ? "plaza" : leaders[this.st.seed % leaders.length];
      this.st.game = createMatch(players.map((player) => ({ id: player.id, name: player.name })), now, this.st.seed, arena);
      return;
    }
    if (message.t === "again") {
      if (id !== this.st.hostId || this.st.game?.phase !== "over") return;
      this.st.game = null;
      this.st.inputs = {};
      return;
    }
    if (!this.st.game || this.st.game.phase !== "playing" || member.role !== "player") return;
    this.advance(now);
    if (message.t === "punch") this.st.game = startPunch(this.st.game, id, now);
    if (message.t === "blend") this.st.game = startBlend(this.st.game, id, now);
  }

  advance(now: number): void {
    if (!this.st.game || this.st.game.phase !== "playing") return;
    for (const [id, updatedAt] of Object.entries(this.st.inputUpdatedAt)) {
      if (now - updatedAt > INPUT_STALE_MS) {
        delete this.st.inputs[id];
        delete this.st.inputUpdatedAt[id];
      }
    }
    for (const id of Object.keys(this.st.inputs)) {
      if (this.st.inputUpdatedAt[id] === undefined && now - this.st.game.lastTickAt > INPUT_STALE_MS) delete this.st.inputs[id];
    }
    this.st.game = advanceMatch(this.st.game, now, this.st.inputs);
  }

  view(id: string, role: Role, now = Date.now()): RoomView {
    const me = this.st.members.find((member) => member.id === id);
    const game = this.st.game;
    const players = this.st.members.filter((member) => member.role === "player").map((member) => ({
      name: member.name,
      online: member.online,
      host: member.id === this.st.hostId,
      score: game?.characters.find((character) => character.ownerId === member.id)?.score ?? 0
    }));
    const arenaVotes: Record<ArenaId, number> = { plaza: 0, metro: 0, gallery: 0 };
    for (const member of this.st.members) {
      const vote = this.st.arenaVotes[member.id];
      if (member.role === "player" && member.online && vote && ARENAS.includes(vote)) arenaVotes[vote]++;
    }
    let gameView: RoomView["game"] = null;
    if (game) {
      const mine = game.characters.find((character) => character.ownerId === id);
      const mineMember = this.st.members.find((member) => member.id === id);
      const winner = game.characters.find((character) => character.ownerId === game.winnerId);
      const winnerName = winner ? this.st.members.find((member) => member.id === winner.ownerId)?.name ?? null : null;
      gameView = {
        phase: game.phase,
        arena: game.arena,
        environmentalDrift: environmentalDrift(game.arena, game.startedAt, now),
        endsAt: game.endsAt,
        remainingMs: Math.max(0, game.endsAt - now),
        scoreToWin: SCORE_TO_WIN,
        winnerName,
        youWon: game.winnerId !== null && game.winnerId === id,
        avatars: game.characters.map((character) => ({
          x: character.x,
          y: character.y,
          facing: character.facing,
          velocity: character.velocity ?? { x: 0, y: 0 },
          maxSpeed: characterMaxSpeed(character, game.arena, now),
          pose: character.pose,
          isMine: character.id === mine?.id && role === "player"
        })),
        events: game.events.map((event) => ({ id: event.id, t: event.t, byYou: event.actor !== null && event.actor === id })),
        blendReadyAt: mine?.blendCooldownUntil ?? 0,
        punchReadyAt: mine?.cooldownUntil ?? 0
      };
      void mineMember;
    }
    return {
      code: this.st.code,
      phase: game?.phase ?? "lobby",
      you: { role, host: me?.id === this.st.hostId, vote: role === "player" ? this.st.arenaVotes[id] ?? null : null },
      arenaVotes,
      players,
      screenCount: this.st.members.filter((member) => member.role === "screen" && member.online).length,
      game: gameView
    };
  }

  nextWake(): number | null {
    if (!this.st.game || this.st.game.phase !== "playing") return null;
    return nextMatchWake(this.st.game);
  }

  expired(now: number): boolean {
    return this.st.members.every((member) => !member.online) && now - this.st.lastActivityAt > ROOM_TTL_MS;
  }

  setInput(id: string, vector: Vector, now = Date.now()): void {
    this.st.inputs[id] = normalizeVector(vector);
    this.st.inputUpdatedAt[id] = now;
  }
}

export function createRoomView(state: RoomState, id: string, role: Role, now = Date.now()): RoomView {
  return new Room(state).view(id, role, now);
}

export const ROOM_MAX_PLAYERS = MAX_PLAYERS;
export const ROOM_BLEND_COOLDOWN_MS = BLEND_COOLDOWN_MS;

