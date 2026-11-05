// 藏在人群里 · Hide in the Crowd: the rules of one round, the same code on the server (the room's
// Durable Object), in the tests and in the browser (prediction for your own character). Pure: no
// clocks, no randomness except the round's seed, so the same inputs always give the same crowd.
//
// The arena is 100 by 58 units. 18 passers-by walk the computer's routes; 2 to 8 players hide among
// them. A punch that lands on a rival scores; one that lands on a passer-by stuns you instead. A
// tagged player slips back into the crowd: once they get up, they swap bodies with a passer-by far
// away, so nobody can keep hitting the same one. First to 3 tags, or the most tags after 75 s.

export const ARENA = { width: 100, height: 58, marginX: 5, marginY: 6 } as const;
export const MATCH_MS = 75_000;
export const SCORE_TO_WIN = 3;
export const NPC_COUNT = 18;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const PLAYER_SPEED = 13;
export const NPC_SPEED = 7.4;
export const SIMULATION_STEP_MS = 50;
export const CHARACTER_COLLISION_DIAMETER = 2.4;
export const PLAYER_ACCELERATION = 46;
export const NPC_ACCELERATION = 32;
export const PLAYER_BRAKING = 60;
export const TURN_RATE = 10;
export const PUNCH_RANGE = 8.5;
export const PUNCH_ARC = Math.PI / 2.8;
export const PUNCH_WINDUP_MS = 160;
export const PUNCH_COOLDOWN_MS = 820;
export const STUN_MS = 1_150;
export const NPC_FOUL_STUN_MS = 620;
export const BLEND_MS = 1_450;
export const BLEND_COOLDOWN_MS = 6_000;
/** A tagged player's new body is at least this far from whoever tagged them (when the crowd allows). */
export const HIDE_AWAY_DISTANCE = 24;

export type Pose = "idle" | "walk" | "glance" | "windup" | "punch" | "stunned";
export type ArenaId = "plaza" | "metro" | "gallery";
export const ARENAS: readonly ArenaId[] = ["plaza", "metro", "gallery"];
export interface Vector { x: number; y: number }
export interface PlayerSeed { id: string; name: string }

/**
 * One body in the crowd. Who it is (a player or a passer-by, their score and timers) and where it
 * is (position, facing, speed, pose) are kept apart in the code below, because a tagged player
 * swaps "who" with a passer-by while every body stays where it is.
 */
export interface Character {
  id: string;
  ownerId: string | null;
  name: string;
  kind: "player" | "npc";
  x: number;
  y: number;
  facing: number;
  velocity: Vector;
  score: number;
  /** how many times this player was tagged this round */
  tagged: number;
  /** how many times this player punched a passer-by this round */
  fouls: number;
  pose: Pose;
  npcStyle: number;
  npcOffset: number;
  attackResolveAt: number | null;
  attackResolved: boolean;
  cooldownUntil: number;
  stunnedUntil: number;
  recoil: Vector;
  blendUntil: number;
  blendCooldownUntil: number;
  /** a tagged player gets up and slips into another body at this time */
  hideAt: number | null;
}

/** tag: a rival was hit; foul: a passer-by was hit; swing: a miss; hide: a tagged player slipped away; over: the round ended */
export interface MatchEvent {
  id: number;
  t: "tag" | "foul" | "swing" | "hide" | "over";
  actor: string | null;
  target: string | null;
}

export interface MatchState {
  phase: "playing" | "over";
  arena: ArenaId;
  startedAt: number;
  endsAt: number;
  lastTickAt: number;
  seed: number;
  characters: Character[];
  winnerId: string | null;
  events: MatchEvent[];
  nextEventId: number;
}

/** The fields that say who a body is; everything else says where and how it moves. */
const IDENTITY = [
  "id",
  "ownerId",
  "name",
  "kind",
  "score",
  "tagged",
  "fouls",
  "npcStyle",
  "npcOffset",
  "attackResolveAt",
  "attackResolved",
  "cooldownUntil",
  "blendUntil",
  "blendCooldownUntil",
  "hideAt"
] as const satisfies readonly (keyof Character)[];

export function characterMaxSpeed(character: Pick<Character, "kind" | "blendUntil" | "x" | "y">, arena: ArenaId, now: number): number {
  const blended = character.kind === "player" && now < character.blendUntil;
  const spotlightBoost = arena === "gallery" && Math.abs(character.x - 50) <= 14 && Math.abs(character.y - 29) <= 17 ? 1.3 : 1;
  return (character.kind === "npc" || blended ? NPC_SPEED : PLAYER_SPEED) * spotlightBoost;
}

export function steerVelocity(current: Vector, target: Vector, dt: number, acceleration: number, braking = PLAYER_BRAKING): Vector {
  const elapsed = Math.max(0, Math.min(0.15, Number.isFinite(dt) ? dt : 0));
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001 || elapsed === 0) return { x: current.x, y: current.y };
  const targetSpeed = Math.hypot(target.x, target.y);
  const reversing = current.x * target.x + current.y * target.y < 0;
  const rate = targetSpeed < 0.05 || reversing ? Math.max(acceleration, braking) : acceleration;
  const amount = Math.min(distance, rate * elapsed);
  return { x: current.x + dx / distance * amount, y: current.y + dy / distance * amount };
}

export function normalizeVector(value: Vector): Vector {
  const x = Number.isFinite(value.x) ? Math.max(-1, Math.min(1, value.x)) : 0;
  const y = Number.isFinite(value.y) ? Math.max(-1, Math.min(1, value.y)) : 0;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

export function crowdSeparationVelocity(
  character: Pick<Character, "id" | "x" | "y">,
  others: readonly Pick<Character, "id" | "x" | "y">[]
): Vector {
  let x = 0;
  let y = 0;
  for (const other of others) {
    if (other.id === character.id) continue;
    let dx = character.x - other.x;
    let dy = character.y - other.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= 4.5) continue;
    if (distance < 0.0001) {
      const pair = character.id < other.id ? character.id + ":" + other.id : other.id + ":" + character.id;
      let hash = 2166136261;
      for (let index = 0; index < pair.length; index++) hash = Math.imul(hash ^ pair.charCodeAt(index), 16777619);
      const angle = ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
      const direction = character.id < other.id ? 1 : -1;
      dx = Math.cos(angle) * direction;
      dy = Math.sin(angle) * direction;
    } else {
      dx /= distance;
      dy /= distance;
    }
    const proximity = (4.5 - distance) / 4.5;
    const overlap = Math.max(0, (CHARACTER_COLLISION_DIAMETER - distance) / CHARACTER_COLLISION_DIAMETER);
    const force = proximity * proximity * 1.9 + overlap * 4.8;
    x += dx * force;
    y += dy * force;
  }
  const length = Math.hypot(x, y);
  if (length > 3.4) return { x: x / length * 3.4, y: y / length * 3.4 };
  return { x, y };
}

function slots(): Vector[] {
  const result: Vector[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 10; col++) result.push({ x: 6 + col * 9.8, y: 6.5 + row * 15 });
  }
  return result;
}

/** A small deterministic generator (mulberry32), so a seed always gives the same crowd, and seeds next to each other give different ones. */
function seeded(seed: number): () => number {
  let state = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function blankCharacter(fields: Pick<Character, "id" | "ownerId" | "name" | "kind" | "x" | "y" | "facing" | "npcStyle" | "npcOffset">): Character {
  return {
    ...fields,
    velocity: { x: 0, y: 0 },
    score: 0,
    tagged: 0,
    fouls: 0,
    pose: "idle",
    attackResolveAt: null,
    attackResolved: false,
    cooldownUntil: 0,
    stunnedUntil: 0,
    recoil: { x: 0, y: 0 },
    blendUntil: 0,
    blendCooldownUntil: 0,
    hideAt: null
  };
}

export function createMatch(players: PlayerSeed[], now = 0, seed = 1, arena: ArenaId = "plaza"): MatchState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new RangeError("A match needs 2 to 8 players");
  const random = seeded(seed);
  const positions = slots();
  // the players take random spots on the grid, and the passers-by fill the rest in order
  const free = positions.map((_, index) => index);
  const occupied = new Set<number>();
  const characters: Character[] = [];
  players.forEach((player, index) => {
    const pick = free.splice(Math.floor(random() * free.length), 1)[0];
    occupied.add(pick);
    const point = positions[pick];
    characters.push(blankCharacter({
      id: "human-" + player.id,
      ownerId: player.id,
      name: player.name,
      kind: "player",
      x: point.x,
      y: point.y,
      facing: index % 2 === 0 ? 0 : Math.PI,
      npcStyle: 0,
      npcOffset: 0
    }));
  });
  let nextSlot = 0;
  for (let i = 0; i < NPC_COUNT; i++) {
    while (occupied.has(nextSlot)) nextSlot++;
    const point = positions[nextSlot];
    occupied.add(nextSlot);
    characters.push(blankCharacter({
      id: "npc-" + String(i + 1).padStart(2, "0"),
      ownerId: null,
      name: "",
      kind: "npc",
      x: point.x,
      y: point.y,
      facing: i % 2 === 0 ? 0 : Math.PI,
      npcStyle: i % 3,
      npcOffset: (i * 379 + seed * 17) % 4_600
    }));
  }
  // The order is what every screen draws by (each place in the list keeps its look), so it must not
  // tell players from passers-by: shuffle it.
  for (let index = characters.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [characters[index], characters[other]] = [characters[other], characters[index]];
  }
  return {
    phase: "playing",
    arena,
    startedAt: now,
    endsAt: now + MATCH_MS,
    lastTickAt: now,
    seed,
    characters,
    winnerId: null,
    events: [],
    nextEventId: 1
  };
}

export function characterForOwner(state: MatchState, ownerId: string): Character | undefined {
  return state.characters.find((character) => character.ownerId === ownerId);
}

function addEvent(state: MatchState, t: MatchEvent["t"], actor: string | null, target: string | null): void {
  state.events.push({ id: state.nextEventId++, t, actor, target });
  if (state.events.length > 18) state.events.splice(0, state.events.length - 18);
}

export function startPunch(state: MatchState, ownerId: string, now: number): MatchState {
  if (state.phase !== "playing") return state;
  const actor = characterForOwner(state, ownerId);
  if (!actor || now < actor.cooldownUntil || now < actor.stunnedUntil || actor.attackResolveAt !== null || actor.hideAt !== null) return state;
  const next = { ...state, characters: state.characters.map((character) => character.id === actor.id ? { ...character } : character) };
  const copy = characterForOwner(next, ownerId)!;
  copy.attackResolveAt = now + PUNCH_WINDUP_MS;
  copy.attackResolved = false;
  copy.cooldownUntil = now + PUNCH_COOLDOWN_MS;
  copy.pose = "windup";
  return next;
}

export function startBlend(state: MatchState, ownerId: string, now: number): MatchState {
  if (state.phase !== "playing") return state;
  const actor = characterForOwner(state, ownerId);
  if (!actor || now < actor.blendCooldownUntil || now < actor.stunnedUntil) return state;
  const next = { ...state, characters: state.characters.map((character) => character.id === actor.id ? { ...character } : character) };
  const copy = characterForOwner(next, ownerId)!;
  copy.blendUntil = now + BLEND_MS;
  copy.blendCooldownUntil = now + BLEND_COOLDOWN_MS;
  return next;
}

function npcPhase(character: Character, now: number): number {
  return (now + character.npcOffset) % 6_800;
}

function npcGlancing(character: Character, now: number): boolean {
  const beat = Math.floor(npcPhase(character, now) / 850);
  return beat === 2 || beat === 5;
}

function botVector(character: Character, now: number): Vector {
  const beat = Math.floor(npcPhase(character, now) / 850);
  if (beat === 2 || beat === 5) return { x: 0, y: 0 };
  const route = (Math.floor(character.npcOffset / 379) + character.npcStyle * 2) % 8;
  const turn = Math.floor(beat / 3) * (Math.PI / 2);
  const angle = route * (Math.PI / 4) + turn;
  let x = Math.cos(angle);
  let y = Math.sin(angle);
  if ((character.x <= ARENA.marginX + 2 && x < 0) || (character.x >= ARENA.width - ARENA.marginX - 2 && x > 0)) x *= -1;
  if ((character.y <= ARENA.marginY + 2 && y < 0) || (character.y >= ARENA.height - ARENA.marginY - 2 && y > 0)) y *= -1;
  return { x, y };
}

function angleDifference(a: number, b: number): number {
  let difference = Math.abs(a - b) % (Math.PI * 2);
  if (difference > Math.PI) difference = Math.PI * 2 - difference;
  return difference;
}

function resolvePunch(state: MatchState, attacker: Character, now: number): void {
  const candidates = state.characters
    .filter((character) => character.id !== attacker.id && now >= character.stunnedUntil && character.hideAt === null)
    .map((character) => {
      const dx = character.x - attacker.x;
      const dy = character.y - attacker.y;
      return { character, distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
    })
    .filter((candidate) => candidate.distance <= PUNCH_RANGE && angleDifference(candidate.angle, attacker.facing) <= PUNCH_ARC / 2)
    .sort((a, b) => a.distance - b.distance);
  const target = candidates[0]?.character;
  if (!target) {
    addEvent(state, "swing", attacker.ownerId, null);
    return;
  }
  if (target.kind === "npc") {
    attacker.fouls++;
    attacker.stunnedUntil = now + NPC_FOUL_STUN_MS;
    attacker.velocity = { x: 0, y: 0 };
    attacker.recoil = { x: -Math.cos(attacker.facing) * 8, y: -Math.sin(attacker.facing) * 8 };
    attacker.pose = "stunned";
    addEvent(state, "foul", attacker.ownerId, null);
    return;
  }
  attacker.score++;
  target.tagged++;
  target.stunnedUntil = now + STUN_MS;
  target.hideAt = now + STUN_MS;
  target.blendUntil = 0;
  target.attackResolveAt = null;
  target.attackResolved = false;
  target.velocity = { x: 0, y: 0 };
  target.recoil = { x: Math.cos(attacker.facing) * 17, y: Math.sin(attacker.facing) * 17 };
  target.pose = "stunned";
  addEvent(state, "tag", attacker.ownerId, target.ownerId);
  if (attacker.score >= SCORE_TO_WIN) {
    state.phase = "over";
    state.winnerId = attacker.ownerId;
    addEvent(state, "over", attacker.ownerId, target.ownerId);
  }
}

/**
 * A tagged player gets up as a passer-by and carries on in a passer-by's body far away: the two
 * swap who they are, and every body stays where it is, so no screen shows anyone jump. The new body
 * is picked from the passers-by at least HIDE_AWAY_DISTANCE from whoever tagged them (else the
 * farthest one), by the round's seed.
 */
function hideAway(state: MatchState, index: number, now: number): void {
  const tagged = state.characters[index];
  const tag = [...state.events].reverse().find((event) => event.t === "tag" && event.target === tagged.ownerId);
  const hunter = tag?.actor ? characterForOwner(state, tag.actor) : undefined;
  const npcs = state.characters
    .map((character, at) => ({ character, at }))
    .filter(({ character }) => character.kind === "npc" && now >= character.stunnedUntil);
  if (npcs.length === 0) {
    tagged.hideAt = null;
    return;
  }
  const from = hunter ?? tagged;
  const distance = (character: Character) => Math.hypot(character.x - from.x, character.y - from.y);
  const far = npcs.filter(({ character }) => distance(character) >= HIDE_AWAY_DISTANCE);
  let pick: (typeof npcs)[number];
  if (far.length > 0) {
    const random = seeded(state.seed + state.nextEventId * 7919 + index);
    pick = far[Math.floor(random() * far.length)];
  } else pick = npcs.reduce((best, item) => distance(item.character) > distance(best.character) ? item : best);
  const body = state.characters[pick.at];
  const record = tagged as unknown as Record<string, unknown>;
  const other = body as unknown as Record<string, unknown>;
  for (const field of IDENTITY) {
    const held = record[field];
    record[field] = other[field];
    other[field] = held;
  }
  body.hideAt = null;
  addEvent(state, "hide", body.ownerId, null);
}

function resolveCrowdCollisions(characters: Character[]): void {
  const diameter = CHARACTER_COLLISION_DIAMETER;
  for (let pass = 0; pass < 2; pass++) {
    for (let first = 0; first < characters.length; first++) {
      const a = characters[first];
      for (let second = first + 1; second < characters.length; second++) {
        const b = characters[second];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= diameter) continue;
        if (distance < 0.0001) {
          dx = a.id < b.id ? 1 : -1;
          dy = 0;
          distance = 0;
        } else {
          dx /= distance;
          dy /= distance;
        }
        const correction = (diameter - distance) * 0.5;
        a.x = bounded(a.x + dx * correction, ARENA.marginX, ARENA.width - ARENA.marginX);
        a.y = bounded(a.y + dy * correction, ARENA.marginY, ARENA.height - ARENA.marginY);
        b.x = bounded(b.x - dx * correction, ARENA.marginX, ARENA.width - ARENA.marginX);
        b.y = bounded(b.y - dy * correction, ARENA.marginY, ARENA.height - ARENA.marginY);
        const closing = (a.velocity.x - b.velocity.x) * dx + (a.velocity.y - b.velocity.y) * dy;
        if (closing < 0) {
          const impulse = -closing * 0.48;
          a.velocity.x += dx * impulse;
          a.velocity.y += dy * impulse;
          b.velocity.x -= dx * impulse;
          b.velocity.y -= dy * impulse;
        }
      }
    }
  }
}

function bounded(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function turnToward(current: number, target: number, maxStep: number): number {
  const turn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + bounded(turn, -maxStep, maxStep);
}

function metroDrift(startedAt: number, now: number): number {
  const phase = (now - startedAt) % 12_000;
  if (phase < 2_600) return 4.5;
  if (phase >= 6_000 && phase < 8_600) return -4.5;
  return 0;
}

export function environmentalDrift(arena: ArenaId, startedAt: number, now: number): Vector {
  return { x: arena === "metro" ? metroDrift(startedAt, now) : 0, y: 0 };
}

export function advanceMatch(state: MatchState, now: number, inputs: Record<string, Vector>): MatchState {
  if (state.phase !== "playing") return state;
  const next: MatchState = {
    ...state,
    lastTickAt: now,
    characters: state.characters.map((character) => ({
      ...character,
      velocity: { ...(character.velocity ?? { x: 0, y: 0 }) },
      recoil: { ...character.recoil }
    })),
    events: [...state.events]
  };
  const dt = bounded(now - state.lastTickAt, 0, 120) / 1_000;
  const laneDrift = environmentalDrift(state.arena, state.startedAt, now).x;
  // tagged players who are back on their feet slip into the crowd first
  next.characters.forEach((character, index) => {
    if (character.kind === "player" && character.hideAt !== null && now >= character.hideAt) hideAway(next, index, now);
  });
  for (const character of next.characters) {
    if (now < character.stunnedUntil) {
      character.x = bounded(character.x + character.recoil.x * dt, ARENA.marginX, ARENA.width - ARENA.marginX);
      character.y = bounded(character.y + character.recoil.y * dt, ARENA.marginY, ARENA.height - ARENA.marginY);
      character.velocity = { x: 0, y: 0 };
      const drag = Math.exp(-dt * 6);
      character.recoil.x *= drag;
      character.recoil.y *= drag;
      character.pose = "stunned";
      continue;
    }
    character.recoil = { x: 0, y: 0 };
    const rawInput = character.kind === "npc" ? botVector(character, now) : inputs[character.ownerId ?? ""] ?? { x: 0, y: 0 };
    const vector = normalizeVector(rawInput);
    const blended = character.kind === "player" && now < character.blendUntil;
    const speed = characterMaxSpeed(character, state.arena, now);
    const separation = crowdSeparationVelocity(character, state.characters);
    const desired = { x: vector.x * speed + laneDrift + separation.x, y: vector.y * speed + separation.y };
    const desiredSpeed = Math.hypot(desired.x, desired.y);
    const speedLimit = speed + Math.abs(laneDrift);
    if (desiredSpeed > speedLimit) {
      desired.x *= speedLimit / desiredSpeed;
      desired.y *= speedLimit / desiredSpeed;
    }
    character.velocity = steerVelocity(
      character.velocity ?? { x: 0, y: 0 },
      desired,
      dt,
      character.kind === "npc" ? NPC_ACCELERATION : PLAYER_ACCELERATION,
      PLAYER_BRAKING
    );
    const moveX = character.velocity.x;
    const moveY = character.velocity.y;
    const moving = Math.hypot(moveX, moveY) > 0.65;
    if (moving) character.facing = turnToward(character.facing, Math.atan2(moveY, moveX), TURN_RATE * dt);
    const nextX = character.x + moveX * dt;
    const nextY = character.y + moveY * dt;
    character.x = bounded(nextX, ARENA.marginX, ARENA.width - ARENA.marginX);
    character.y = bounded(nextY, ARENA.marginY, ARENA.height - ARENA.marginY);
    if (character.x !== nextX) character.velocity.x = 0;
    if (character.y !== nextY) character.velocity.y = 0;
    if (character.attackResolveAt !== null && now < character.attackResolveAt) character.pose = "windup";
    else if (character.attackResolveAt !== null && !character.attackResolved && now >= character.attackResolveAt) {
      character.attackResolved = true;
      character.pose = "punch";
      resolvePunch(next, character, now);
    } else if (character.attackResolved && character.attackResolveAt !== null && now <= character.attackResolveAt + 220) character.pose = "punch";
    else if (blended) character.pose = "glance";
    else if (moving) character.pose = "walk";
    else if (character.kind === "npc" && npcGlancing(character, now)) character.pose = "glance";
    else character.pose = "idle";
    if (character.attackResolved && character.attackResolveAt !== null && now > character.attackResolveAt + 220) {
      character.attackResolveAt = null;
      character.attackResolved = false;
    }
  }
  resolveCrowdCollisions(next.characters);
  if (next.phase === "playing" && now >= next.endsAt) {
    const players = next.characters.filter((character) => character.kind === "player");
    const maxScore = Math.max(...players.map((player) => player.score));
    const winners = players.filter((player) => player.score === maxScore);
    next.winnerId = winners.length === 1 && maxScore > 0 ? winners[0].ownerId : null;
    next.phase = "over";
    addEvent(next, "over", next.winnerId, null);
  }
  return next;
}

export function nextMatchWake(state: MatchState): number | null {
  if (state.phase !== "playing") return null;
  const attacks = state.characters
    .filter((character) => character.attackResolveAt !== null && !character.attackResolved)
    .map((character) => character.attackResolveAt as number);
  return Math.min(state.endsAt, state.lastTickAt + SIMULATION_STEP_MS, ...attacks);
}

/**
 * The round's penalty: whoever was spotted (tagged) the most takes one sip, everyone tied with them
 * too. A round where nobody got spotted at all: the whole table drinks.
 */
export interface RoundPenalty {
  kind: "sip" | "everyone";
  /** the players it lands on (owner ids); empty for everyone */
  who: string[];
  /** how many times they were spotted */
  times: number;
}

export function roundPenalty(state: Pick<MatchState, "characters">): RoundPenalty {
  const players = state.characters.filter((character) => character.kind === "player");
  const most = Math.max(0, ...players.map((player) => player.tagged));
  if (most === 0) return { kind: "everyone", who: [], times: 0 };
  return { kind: "sip", who: players.filter((player) => player.tagged === most).map((player) => player.ownerId!), times: most };
}
