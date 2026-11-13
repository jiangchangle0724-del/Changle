// 藏在人群里 · Hide in the Crowd: the rules of one round, the same code on the server (the room's
// Durable Object), in the tests and in the browser (prediction for your own character). Pure: no
// clocks, no randomness except the round's seed, so the same inputs always give the same crowd.
//
// The arena is 100 by 58 units. 18 passers-by wander it the way people do (each its own pace, stops
// to look around or at someone, tags along behind someone, now and then breaks into a run); 2 to 8
// players hide among them. Every place has a moment the whole crowd reacts to (the ferry horn, the
// busker, the opera gong): the passers-by stop and look, or dance on the spot, and a player who
// doesn't stands out. Anyone knocked down draws the looks of the people near them for a second or
// two. A punch that lands on a rival scores; one that lands on a passer-by knocks the passer-by down
// and stuns you. A tagged player slips back into the crowd: once they get up, they swap bodies with a
// passer-by far away, so nobody can keep hitting the same one. At the night market there is a second
// way to score (like the side quests in some places of the Steam game this one was modelled on, where
// collecting things scores): taste the four snack stalls along the back, lingering a moment at each,
// for 2 points. Passers-by browse the stalls too, but only a player's bite makes a stall light up for
// everyone. Twice a round a player can distract everyone (as in the Steam game): a passer-by across the
// crowd throws a punch at nothing, and every eye goes there. First to 3 points, or the most after 75 s.

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
/** The night market's four snack stalls along the back, left to right (their middles). */
export const STALLS: readonly number[] = [20, 40, 60, 80];
/** In front of a stall, how far either side of its middle, and how far into the floor from the back, you can eat. */
export const STALL_REACH = { halfWidth: 4.5, depth: 6 } as const;
/** How long a player stands at a stall to taste it. */
export const BITE_MS = 1_200;
/** All four stalls tasted. */
export const FEAST_POINTS = 2;
/** How many times a round a player can distract everyone (a passer-by across the crowd throws a punch at nothing). */
export const DISTRACTS = 2;
/** The passer-by who throws it is at least this far from the player. */
export const DECOY_DISTANCE = 22;
/** The passer-by's swing: the wind-up, the punch, and a beat standing after it, as a player's would look. */
export const DECOY_MS = PUNCH_WINDUP_MS + 220 + 420;
const ALL_STALLS = (1 << 4) - 1;

/** The stall a spot is in front of, or -1. */
export function stallAt(x: number, y: number): number {
  if (y > ARENA.marginY + STALL_REACH.depth) return -1;
  return STALLS.findIndex((middle) => Math.abs(x - middle) <= STALL_REACH.halfWidth);
}

export type Pose = "idle" | "walk" | "glance" | "windup" | "punch" | "stunned" | "dance";
/** the moments the whole crowd reacts to: the ferry horn by the seawall, the busker in the transit hall, the gong at the theatre, the night market's fireworks */
export type MomentKind = "horn" | "dance" | "gong" | "fireworks";
export type ArenaId = "plaza" | "metro" | "gallery" | "market";
export const ARENAS: readonly ArenaId[] = ["plaza", "metro", "gallery", "market"];
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
  /** how many times this player punched the air this round */
  swings: number;
  /** the night market: the stalls tasted since the last feast (one bit each), how many bites and feasts this round */
  bites: number;
  snacks: number;
  feasts: number;
  /** the stall this body is standing at to taste, and since when (-1: none) */
  biteStall: number;
  biteSince: number;
  /** a player: distractions left this round */
  distracts: number;
  /** a passer-by throwing a punch at nothing for someone's distraction: since when (null: not) */
  decoyAt: number | null;
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
  /** what a passer-by is up to (a player's is never used) */
  plan: Plan;
}

/**
 * What a passer-by is doing: walking somewhere at its own pace, standing (looking around, or at
 * someone), or tagging along behind someone. Each passer-by rolls its own dice (the round's seed,
 * its id and how many plans it has made), so the same round always plays the same.
 */
export interface Plan {
  /** browse: (the night market) walk up to a stall and look it over for a while */
  mode: "walk" | "wait" | "follow" | "browse";
  /** where it's walking to */
  x: number;
  y: number;
  /** a share of a passer-by's top speed: a stroll, a brisk walk, now and then a run (a player's top speed) */
  pace: number;
  /** when it started, and when it moves on at the latest */
  since: number;
  until: number;
  /** the body it looks at (wait) or follows (follow) */
  other: string | null;
  count: number;
  /** browse: when it reached the stall, and how long it stays */
  arrivedAt?: number;
  dwell?: number;
}

/**
 * tag: a rival was hit; foul: a passer-by was hit; swing: a miss; hide: a tagged player slipped away;
 * bite: a player tasted a stall (which one is public, who isn't); feast: all four, for 2 points;
 * decoy: a player's distraction (only they hear of it); over: the round ended
 */
export interface MatchEvent {
  id: number;
  t: "tag" | "foul" | "swing" | "hide" | "bite" | "feast" | "decoy" | "over";
  actor: string | null;
  target: string | null;
  /** bite: the stall */
  stall?: number;
}

/** Someone knocked down: where, when, and who (they don't stare at themselves). */
export interface Commotion {
  x: number;
  y: number;
  at: number;
  who: string;
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
  /** the knockdowns the people nearby are still looking at (a round saved before there were any has none) */
  commotions?: Commotion[];
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
  "swings",
  "bites",
  "snacks",
  "feasts",
  "distracts",
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
    swings: 0,
    bites: 0,
    snacks: 0,
    feasts: 0,
    biteStall: -1,
    biteSince: 0,
    distracts: fields.kind === "player" ? DISTRACTS : 0,
    decoyAt: null,
    pose: "idle",
    attackResolveAt: null,
    attackResolved: false,
    cooldownUntil: 0,
    stunnedUntil: 0,
    recoil: { x: 0, y: 0 },
    blendUntil: 0,
    blendCooldownUntil: 0,
    hideAt: null,
    plan: restingPlan(fields.x, fields.y)
  };
}

/** a plan that has run out: the next tick makes a new one */
function restingPlan(x: number, y: number): Plan {
  return { mode: "wait", x, y, pace: 1, since: 0, until: 0, other: null, count: 0 };
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
    nextEventId: 1,
    commotions: []
  };
}

export function characterForOwner(state: MatchState, ownerId: string): Character | undefined {
  return state.characters.find((character) => character.ownerId === ownerId);
}

function addEvent(state: MatchState, t: MatchEvent["t"], actor: string | null, target: string | null, stall?: number): void {
  state.events.push(stall === undefined ? { id: state.nextEventId++, t, actor, target } : { id: state.nextEventId++, t, actor, target, stall });
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

/**
 * A distraction: a passer-by well away from the player (DECOY_DISTANCE or more) throws a punch at
 * nothing, so every eye in the room goes there. Twice a round; only the player hears of it.
 */
export function startDistract(state: MatchState, ownerId: string, now: number): MatchState {
  if (state.phase !== "playing") return state;
  const actor = characterForOwner(state, ownerId);
  if (!actor || (actor.distracts ?? 0) <= 0 || now < actor.stunnedUntil || actor.hideAt !== null) return state;
  const free = (body: Character) => body.decoyAt === null || body.decoyAt === undefined || now > body.decoyAt + DECOY_MS;
  const candidates = state.characters.filter(
    (body) => body.kind === "npc" && now >= body.stunnedUntil && free(body) && Math.hypot(body.x - actor.x, body.y - actor.y) >= DECOY_DISTANCE
  );
  if (!candidates.length) return state;
  const pick = candidates[Math.floor(seeded(Math.imul(state.seed, 31) + now)() * candidates.length)];
  const next = { ...state, events: [...state.events], characters: state.characters.map((character) => (character.id === actor.id || character.id === pick.id ? { ...character } : character)) };
  const copy = characterForOwner(next, ownerId)!;
  copy.distracts = (copy.distracts ?? 0) - 1;
  const decoy = next.characters.find((character) => character.id === pick.id)!;
  decoy.decoyAt = now;
  decoy.pose = "windup";
  addEvent(next, "decoy", ownerId, null);
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

/** A body's id as a number, for its own dice and its own reaction time. */
function idHash(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** How a passer-by's walk is paced: three kinds of people, from strollers to the ones in a hurry. */
const PACES = [
  [0.7, 0.86],
  [0.8, 0.95],
  [0.9, 1.0]
] as const;
/** a run: a passer-by catching a bus, as fast as a player (so running alone gives nobody away) */
export const RUN_PACE = PLAYER_SPEED / NPC_SPEED;

/** Inside the walls, with room to turn. */
function clampGoal(x: number, y: number): Vector {
  return {
    x: bounded(x, ARENA.marginX + 3, ARENA.width - ARENA.marginX - 3),
    y: bounded(y, ARENA.marginY + 3, ARENA.height - ARENA.marginY - 3)
  };
}

/** The next thing a passer-by does, rolled with its own dice. */
type Neighbour = Pick<Character, "id" | "x" | "y" | "velocity" | "stunnedUntil" | "plan">;

export function nextPlan(body: Pick<Character, "id" | "x" | "y" | "npcStyle" | "plan">, others: readonly Neighbour[], seed: number, now: number, arena: ArenaId = "plaza"): Plan {
  const previous = body.plan ?? restingPlan(body.x, body.y);
  const count = previous.count + 1;
  const random = seeded(Math.imul(seed, 7) + Math.imul(idHash(body.id), 131) + count * 7919);
  const roll = random();
  const near = (radius: number, moving: boolean) =>
    others.filter((other) => {
      if (other.id === body.id || now < other.stunnedUntil) return false;
      if (Math.hypot(other.x - body.x, other.y - body.y) > radius) return false;
      return !moving || Math.hypot(other.velocity?.x ?? 0, other.velocity?.y ?? 0) > 1.5;
    });
  if (previous.mode !== "wait" && roll < 0.48) {
    // stop: half the time to look at whoever is closest (a chat, or just a look), else to look around
    const close = near(7, false).sort((a, b) => Math.hypot(a.x - body.x, a.y - body.y) - Math.hypot(b.x - body.x, b.y - body.y));
    const other = random() < 0.5 ? close[0]?.id ?? null : null;
    return { mode: "wait", x: body.x, y: body.y, pace: 1, since: now, until: now + 700 + random() * 2_600, other, count };
  }
  if (previous.mode !== "follow" && roll < 0.57) {
    // someone walking by on their own: not a queue (nobody follows a follower, or someone already followed)
    const walking = near(18, true).filter(
      (other) => other.plan?.mode !== "follow" && !others.some((item) => item.id !== body.id && item.plan?.mode === "follow" && item.plan.other === other.id)
    );
    if (walking.length > 0) {
      const other = walking[Math.floor(random() * walking.length)].id;
      return { mode: "follow", x: body.x, y: body.y, pace: 1, since: now, until: now + 2_200 + random() * 3_000, other, count };
    }
  }
  const [low, high] = PACES[((body.npcStyle % 3) + 3) % 3];
  if (arena === "market" && previous.mode !== "browse" && roll < 0.66) {
    // the night market: up to a stall, to look it over (about a third of the crowd is at one, so a player
    // tasting has company)
    const middle = STALLS[Math.floor(random() * STALLS.length)];
    const x = middle + (random() * 2 - 1) * (STALL_REACH.halfWidth - 1);
    const y = ARENA.marginY + 1.5 + random() * (STALL_REACH.depth - 2.5);
    return { mode: "browse", x, y, pace: low + random() * (high - low), since: now, until: now + 14_000, other: null, count, dwell: 1_200 + random() * 2_600 };
  }
  const run = random() < 0.1;
  const angle = random() * Math.PI * 2;
  const distance = run ? 9 + random() * 10 : 10 + random() * 28;
  const goal = clampGoal(body.x + Math.cos(angle) * distance, body.y + Math.sin(angle) * distance);
  return { mode: "walk", x: goal.x, y: goal.y, pace: run ? RUN_PACE : low + random() * (high - low), since: now, until: now + 9_000, other: null, count };
}

/** The ferry horn, the busker and the gong: when, for how long, and where the crowd looks (nowhere: it dances). */
const MOMENTS: Record<ArenaId, { kind: MomentKind; first: number; every: number; lasts: number; look: Vector | null }> = {
  // the sea beyond the seawall's railing (far behind the crowd: everyone looks the same way)
  plaza: { kind: "horn", first: 9_000, every: 15_000, lasts: 2_600, look: { x: 50, y: -400 } },
  // a busker strikes up and the whole hall dances on the spot (always in one of the walkway's quiet
  // spells, which come every 6 s: nobody dances while the floor carries them)
  metro: { kind: "dance", first: 8_800, every: 18_000, lasts: 2_700, look: null },
  // the stage, just behind the back row
  gallery: { kind: "gong", first: 12_000, every: 17_000, lasts: 2_600, look: { x: 50, y: -6 } },
  // fireworks going up from behind the stalls: everyone turns round to watch
  market: { kind: "fireworks", first: 10_000, every: 16_000, lasts: 2_800, look: { x: 50, y: -400 } }
};

export interface CrowdMoment {
  kind: MomentKind;
  startsAt: number;
  endsAt: number;
  /** where everyone looks; null while they dance */
  look: Vector | null;
}

/** The moment the crowd is reacting to now, if any (the same for everyone, from the round's start). */
export function crowdMoment(arena: ArenaId, startedAt: number, now: number): CrowdMoment | null {
  const rule = MOMENTS[arena];
  if (!rule) return null;
  const elapsed = now - startedAt - rule.first;
  if (elapsed < 0) return null;
  const into = elapsed % rule.every;
  if (into >= rule.lasts) return null;
  const startsAt = now - into;
  return { kind: rule.kind, startsAt, endsAt: startsAt + rule.lasts, look: rule.look };
}

/** How long a body takes to react to a moment: people don't all turn at once. */
export const reactionDelay = (id: string) => 120 + (idHash(id) % 520);

/** How far a knockdown draws the looks of the people around it, and for how long (ms). */
export const COMMOTION_RADIUS = 15;
export const COMMOTION_MS = 1_900;

/** The knockdown this body is looking at now, if any: the nearest, from a beat after it until it's old news. */
export function commotionFor(body: Pick<Character, "id" | "x" | "y">, commotions: readonly Commotion[] | undefined, now: number): Commotion | null {
  let nearest: Commotion | null = null;
  let best = COMMOTION_RADIUS;
  for (const fuss of commotions ?? []) {
    if (fuss.who === body.id || now < fuss.at + reactionDelay(body.id) * 0.5 || now >= fuss.at + COMMOTION_MS) continue;
    const distance = Math.hypot(fuss.x - body.x, fuss.y - body.y);
    if (distance < best) {
      nearest = fuss;
      best = distance;
    }
  }
  return nearest;
}

/** What a passer-by (or a computer rival copying one) does this tick: which way, how fast, where it faces when still. */
export interface CrowdStep {
  plan: Plan;
  /** a unit direction, or zero to stand */
  heading: Vector;
  /** a share of a passer-by's top speed */
  pace: number;
  /** where to face while standing (radians), or null */
  face: number | null;
  /** looking around while standing */
  glance: boolean;
}

export function crowdStep(
  body: Pick<Character, "id" | "x" | "y" | "npcStyle" | "plan" | "facing">,
  others: readonly Neighbour[],
  game: Pick<MatchState, "arena" | "startedAt" | "seed" | "commotions">,
  now: number
): CrowdStep {
  const moment = crowdMoment(game.arena, game.startedAt, now);
  let plan = body.plan ?? restingPlan(body.x, body.y);
  if (moment && now >= moment.startsAt + reactionDelay(body.id)) {
    // everyone stops and looks, or dances where they stand (and picks up where they were once it's over)
    const face = moment.look ? Math.atan2(moment.look.y - body.y, moment.look.x - body.x) : null;
    return { plan, heading: { x: 0, y: 0 }, pace: 0, face, glance: false };
  }
  // someone knocked down nearby: stop and look
  const fuss = commotionFor(body, game.commotions, now);
  if (fuss) return { plan, heading: { x: 0, y: 0 }, pace: 0, face: Math.atan2(fuss.y - body.y, fuss.x - body.x), glance: false };
  const done = (current: Plan) => {
    if (now >= current.until) return true;
    if (current.mode === "walk") return Math.hypot(current.x - body.x, current.y - body.y) < 1.6;
    if (current.mode === "browse") return current.arrivedAt !== undefined && now >= current.arrivedAt + (current.dwell ?? 0);
    if (current.mode === "follow") {
      const other = others.find((item) => item.id === current.other);
      // (and nobody keeps following someone who has started following someone else)
      return !other || now < other.stunnedUntil || other.plan?.mode === "follow";
    }
    return false;
  };
  if (done(plan)) plan = nextPlan(body, others, game.seed, now, game.arena);
  if (plan.mode === "browse") {
    const dx = plan.x - body.x;
    const dy = plan.y - body.y;
    const distance = Math.hypot(dx, dy);
    if (plan.arrivedAt === undefined && distance > 1.4) {
      return { plan, heading: { x: dx / (distance || 1), y: dy / (distance || 1) }, pace: plan.pace * Math.min(1, 0.45 + distance / 6), face: null, glance: false };
    }
    if (plan.arrivedAt === undefined) plan = { ...plan, arrivedAt: now };
    // at the counter, looking it over (and around, now and then)
    const middle = STALLS.reduce((best, item) => (Math.abs(item - body.x) < Math.abs(best - body.x) ? item : best), STALLS[0]);
    const glance = now - plan.arrivedAt! > (plan.dwell ?? 0) * 0.6;
    return { plan, heading: { x: 0, y: 0 }, pace: 0, face: glance ? null : Math.atan2(ARENA.marginY - 3 - body.y, middle - body.x), glance };
  }
  if (plan.mode === "walk") {
    const dx = plan.x - body.x;
    const dy = plan.y - body.y;
    const distance = Math.hypot(dx, dy) || 1;
    // easing in to a stop, as people do
    return { plan, heading: { x: dx / distance, y: dy / distance }, pace: plan.pace * Math.min(1, 0.45 + distance / 6), face: null, glance: false };
  }
  const other = plan.other ? others.find((item) => item.id === plan.other) : undefined;
  if (plan.mode === "follow" && other) {
    const dx = other.x - body.x;
    const dy = other.y - body.y;
    const distance = Math.hypot(dx, dy) || 1;
    // a step or two behind, keeping up but never running
    if (distance > 4.2) return { plan, heading: { x: dx / distance, y: dy / distance }, pace: Math.min(1, 0.6 + (distance - 4.2) / 8), face: null, glance: false };
    return { plan, heading: { x: 0, y: 0 }, pace: 0, face: Math.atan2(dy, dx), glance: false };
  }
  // standing: at someone, or looking around for the second half of the wait
  const face = other ? Math.atan2(other.y - body.y, other.x - body.x) : null;
  const glance = !other && now - plan.since > (plan.until - plan.since) * 0.45;
  return { plan, heading: { x: 0, y: 0 }, pace: 0, face, glance };
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
    attacker.swings = (attacker.swings ?? 0) + 1;
    addEvent(state, "swing", attacker.ownerId, null);
    return;
  }
  state.commotions = [...(state.commotions ?? []), { x: target.x, y: target.y, at: now, who: target.id }];
  if (target.kind === "npc") {
    // the passer-by goes down (everyone sees who was punched), and the puncher is stunned
    target.stunnedUntil = now + STUN_MS;
    target.velocity = { x: 0, y: 0 };
    target.recoil = { x: Math.cos(attacker.facing) * 12, y: Math.sin(attacker.facing) * 12 };
    target.pose = "stunned";
    target.plan = restingPlan(target.x, target.y);
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
    events: [...state.events],
    commotions: (state.commotions ?? []).filter((fuss) => now - fuss.at < COMMOTION_MS)
  };
  const dt = bounded(now - state.lastTickAt, 0, 120) / 1_000;
  const laneDrift = environmentalDrift(state.arena, state.startedAt, now).x;
  // while the busker plays, anyone standing still dances (players too: it's how they blend in)
  const dancing = crowdMoment(state.arena, state.startedAt, now)?.kind === "dance";
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
    let rawInput: Vector;
    let pace = 1;
    let step: CrowdStep | null = null;
    // a passer-by throwing a punch at nothing (someone's distraction) stands where it is to throw it
    const decoying = character.decoyAt !== null && character.decoyAt !== undefined && now < character.decoyAt + DECOY_MS;
    if (character.decoyAt !== null && character.decoyAt !== undefined && !decoying) character.decoyAt = null;
    if (character.kind === "npc") {
      step = crowdStep(character, state.characters, state, now);
      character.plan = step.plan;
      rawInput = decoying ? { x: 0, y: 0 } : step.heading;
      pace = step.pace;
    } else rawInput = inputs[character.ownerId ?? ""] ?? { x: 0, y: 0 };
    const vector = normalizeVector(rawInput);
    const blended = character.kind === "player" && now < character.blendUntil;
    const speed = characterMaxSpeed(character, state.arena, now) * pace;
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
    // (moving on the floor, not just carried by the walkway)
    const walking = Math.hypot(moveX - laneDrift, moveY) > 0.65;
    // a passer-by standing still turns (gently) to what it's looking at, even while the crowd jostles it
    const looking = step !== null && step.face !== null && step.heading.x === 0 && step.heading.y === 0;
    if (looking) character.facing = turnToward(character.facing, step!.face!, TURN_RATE * 0.45 * dt);
    else if (moving) character.facing = turnToward(character.facing, Math.atan2(moveY, moveX), TURN_RATE * dt);
    const nextX = character.x + moveX * dt;
    const nextY = character.y + moveY * dt;
    character.x = bounded(nextX, ARENA.marginX, ARENA.width - ARENA.marginX);
    character.y = bounded(nextY, ARENA.marginY, ARENA.height - ARENA.marginY);
    if (character.x !== nextX) character.velocity.x = 0;
    if (character.y !== nextY) character.velocity.y = 0;
    // (a player standing at a stall tastes it however the crowd jostles them: it's the stick that counts)
    if (next.arena === "market" && character.kind === "player" && next.phase === "playing") taste(next, character, Math.hypot(vector.x, vector.y) > 0.2, now);
    if (character.attackResolveAt !== null && now < character.attackResolveAt) character.pose = "windup";
    else if (character.attackResolveAt !== null && !character.attackResolved && now >= character.attackResolveAt) {
      character.attackResolved = true;
      character.pose = "punch";
      resolvePunch(next, character, now);
    } else if (character.attackResolved && character.attackResolveAt !== null && now <= character.attackResolveAt + 220) character.pose = "punch";
    else if (decoying) character.pose = now < character.decoyAt! + PUNCH_WINDUP_MS ? "windup" : now <= character.decoyAt! + PUNCH_WINDUP_MS + 220 ? "punch" : "idle";
    else if (dancing && !walking) character.pose = "dance";
    else if (blended) character.pose = "glance";
    else if (moving) character.pose = "walk";
    else if (step?.glance) character.pose = "glance";
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

/**
 * The night market: a player standing at a stall they haven't tasted yet tastes it after a moment
 * (the stall lights up on every screen: only a player's bite does that). All four is a feast: 2
 * points, and they can start again.
 */
function taste(state: MatchState, body: Character, steering: boolean, now: number): void {
  const stall = !steering && now >= body.stunnedUntil && body.hideAt === null ? stallAt(body.x, body.y) : -1;
  if (stall < 0 || (body.bites ?? 0) & (1 << stall)) {
    body.biteStall = -1;
    return;
  }
  if (body.biteStall !== stall) {
    body.biteStall = stall;
    body.biteSince = now;
    return;
  }
  if (now - body.biteSince < BITE_MS) return;
  body.biteStall = -1;
  body.bites = (body.bites ?? 0) | (1 << stall);
  body.snacks = (body.snacks ?? 0) + 1;
  addEvent(state, "bite", body.ownerId, null, stall);
  if (body.bites !== ALL_STALLS) return;
  body.bites = 0;
  body.feasts = (body.feasts ?? 0) + 1;
  body.score += FEAST_POINTS;
  addEvent(state, "feast", body.ownerId, null);
  if (body.score >= SCORE_TO_WIN) {
    state.phase = "over";
    state.winnerId = body.ownerId;
    addEvent(state, "over", body.ownerId, null);
  }
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

/** The round's nicknames, from what each player did (each gets one at most, the first that fits). */
export type AwardKey = "eagleEye" | "foodie" | "ghost" | "friendlyFire" | "airPunch" | "punchingBag";

export function roundAwards(state: Pick<MatchState, "characters">): { owner: string; award: AwardKey }[] {
  const players = state.characters.filter((character) => character.kind === "player" && character.ownerId);
  const given = new Map<string, AwardKey>();
  const most = (value: (player: Character) => number, least: number, award: AwardKey) => {
    const top = Math.max(0, ...players.map(value));
    if (top < least) return;
    for (const player of players) if (value(player) === top && !given.has(player.ownerId!)) given.set(player.ownerId!, award);
  };
  // (spotting: the points from tags, not from the night market's stalls)
  most((player) => player.score - (player.feasts ?? 0) * FEAST_POINTS, 1, "eagleEye");
  most((player) => player.snacks ?? 0, 3, "foodie");
  for (const player of players) if (player.tagged === 0 && player.fouls === 0 && !given.has(player.ownerId!)) given.set(player.ownerId!, "ghost");
  most((player) => player.fouls, 1, "friendlyFire");
  most((player) => player.swings ?? 0, 2, "airPunch");
  most((player) => player.tagged, 2, "punchingBag");
  const order: AwardKey[] = ["eagleEye", "foodie", "ghost", "friendlyFire", "airPunch", "punchingBag"];
  return players
    .filter((player) => given.has(player.ownerId!))
    .map((player) => ({ owner: player.ownerId!, award: given.get(player.ownerId!)! }))
    .sort((a, b) => order.indexOf(a.award) - order.indexOf(b.award));
}

export function roundPenalty(state: Pick<MatchState, "characters">): RoundPenalty {
  const players = state.characters.filter((character) => character.kind === "player");
  const most = Math.max(0, ...players.map((player) => player.tagged));
  if (most === 0) return { kind: "everyone", who: [], times: 0 };
  return { kind: "sip", who: players.filter((player) => player.tagged === most).map((player) => player.ownerId!), times: most };
}
