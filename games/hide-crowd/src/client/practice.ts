// One phone on its own (changle.ca/hide/practice, the game card's one-phone button): the same room
// as online, run in the page, with three computer rivals hidden in the crowd. They walk the way the
// passers-by walk (the same plans, crowdStep in the rules: at the night market that takes them to the
// stalls, where they taste like a player), stop for the ferry horn, the busker, the gong or the
// fireworks a beat after it like everyone, get clear of the night market's firecrackers, punch on the
// theatre's call with the whole crowd (at whoever they suspect, if they're in reach), and turn to look
// at a knockdown near them. They go after
// anyone who gives themselves away (punching, walking on through a moment, standing still while the
// whole crowd punches on the call, being knocked down by a firecracker everyone else got clear of,
// running on and on: passers-by run too, but only for a moment, or standing at a stall just as it
// lights up), and sometimes get it wrong: a passer-by throwing a punch
// at nothing (someone's distraction) fools them as it would a person. Each uses one distraction a
// round itself. No server, no penalty.
import { ARENAS, crowdMoment, crowdStep, DRILL_GO_MS, environmentalDrift, NPC_SPEED, PLAYER_SPEED, PUNCH_ARC, PUNCH_RANGE, SIMULATION_STEP_MS, stallAt, type Character, type MatchState, type Plan, type Vector } from "../engine";
import type { ArenaId } from "../engine";
import type { ClientMsg, Lang, ServerMsg } from "../room/protocol";
import { Room } from "../room/room";
import type { ConnectionState, RoomConnection } from "./net";

const ME = "practice-you";
const RIVALS = 3;
/** a passer-by's run lasts a second or so; a body that keeps running longer looks like a player */
const LONG_RUN_MS = 1_800;
/** how often a rival takes a swing at whoever is in front of it, with nothing to go on */
const WILD_SWING = 0.12;
/**
 * The drill: a punch from this long before the call counts as the crowd's; this long after it,
 * whoever hasn't punched stands out, as much as a punch at the wrong time would (a punch's wind-up and
 * swing add a punching tell, 4, at each of about six looks)
 */
const DRILL_EARLY_MS = 400;
const DRILL_LOOK_MS = 520;
const DRILL_STOOD = 24;

interface Brain {
  id: string;
  style: number;
  /** when it uses one of its distractions (once a round, somewhere in the middle) */
  distractAt: number;
  /** what it's up to, the way a passer-by plans it */
  plan: Plan | null;
  nextLook: number;
  /** the body it is after (a place in the crowd), and until when */
  chasing: number | null;
  chaseUntil: number;
  /** the drill it is in (by its call), how long after the call it punches in it, and whether it has */
  drill: number;
  drillDelay: number;
  drillDone: boolean;
}

const angleDiff = (a: number, b: number) => {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
};

/**
 * A walk like a passer-by's, steered with the stick: the same plans (stop, look, follow, now and then a
 * run), the same stops for the crowd's moments and the same stares at a knockdown. Standing, it turns
 * to whatever a passer-by would be looking at with a light nudge, as a player would.
 */
function stroll(brain: Brain, body: Character, game: MatchState, now: number): Vector {
  const step = crowdStep({ ...body, npcStyle: brain.style, plan: brain.plan ?? body.plan }, game.characters, game, now);
  brain.plan = step.plan;
  if (step.heading.x === 0 && step.heading.y === 0) {
    return step.face !== null && angleDiff(body.facing, step.face) > 0.35 ? { x: Math.cos(step.face) * 0.07, y: Math.sin(step.face) * 0.07 } : { x: 0, y: 0 };
  }
  const scale = (step.pace * NPC_SPEED) / PLAYER_SPEED;
  return { x: step.heading.x * scale, y: step.heading.y * scale };
}

/** a rival's distraction comes 12 to 55 s into a round */
const distractDelay = () => 12_000 + Math.random() * 43_000;

export function openPractice(lang: Lang, name: string, onMessage: (message: ServerMsg) => void, onStatus: (status: ConnectionState) => void): RoomConnection {
  const start = Date.now();
  const room = Room.create("0000", start, Math.floor(Math.random() * 0x7fffffff));
  room.st.settings.penalties = false;
  room.join(ME, name, lang, "player", start);
  const brains: Brain[] = [];
  for (let index = 0; index < RIVALS; index++) {
    const id = `practice-computer-${index + 1}`;
    room.join(id, lang === "zh" ? `电脑 ${index + 1}` : `Computer ${index + 1}`, lang, "player", start + index + 1);
    brains.push({ id, style: index % 3, plan: null, nextLook: start + 1_500 + index * 400, chasing: null, chaseUntil: 0, distractAt: start + distractDelay(), drill: 0, drillDelay: 0, drillDone: false });
  }
  room.claimHost(start);
  // ?arena=market on the address practises one place every round (otherwise they take turns)
  const asked = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("arena");
  if (asked && (ARENAS as readonly string[]).includes(asked)) room.handle(ME, { t: "vote", arena: asked as ArenaId }, start);
  room.handle(ME, { t: "start" }, start);
  // how long each place in the crowd has looked like a player lately (fast, or a punch)
  const suspicion = new Map<number, number>();
  /** how long each body has been running without a break (ms) */
  const runningFor = new Map<number, number>();
  /** the latest of the round's events seen (a stall lighting up points at whoever stands at it) */
  let seenEvent = 0;
  /** the theatre's drill being watched (by its call): who has punched with it, and who couldn't (knocked down) */
  let drillWatched = 0;
  let drillLooked = false;
  const drillPunched = new Set<number>();

  const think = (now: number) => {
    const game = room.st.game;
    if (!game || game.phase !== "playing") return;
    // walking on while the crowd stops for the horn or the gong gives a body away: by 1.3 s in, every
    // passer-by has stopped (the slowest turns 0.64 s in, then slows down)
    const moment = crowdMoment(game.arena, game.startedAt, now);
    const watching = !!moment && now - moment.startsAt > 1_300;
    // the theatre's drill: on the call everyone punches, so a punch then is no tell (one during the count is)
    const drillGo = moment?.kind === "drill" ? moment.startsAt + DRILL_GO_MS : null;
    const withTheCrowd = drillGo !== null && now >= drillGo - DRILL_EARLY_MS;
    if (drillGo !== null && drillGo !== drillWatched) {
      drillWatched = drillGo;
      drillLooked = false;
      drillPunched.clear();
    }
    // (a body's own speed: the transit hall's walkway carries everyone)
    const drift = environmentalDrift(game.arena, game.startedAt, now);
    game.characters.forEach((body, at) => {
      const speed = Math.hypot(body.velocity.x - drift.x, body.velocity.y - drift.y);
      const running = speed > NPC_SPEED + 1.2 ? (runningFor.get(at) ?? 0) + SIMULATION_STEP_MS : 0;
      runningFor.set(at, running);
      const punching = body.pose === "windup" || body.pose === "punch";
      if (punching && withTheCrowd) drillPunched.add(at);
      const tell = punching && !withTheCrowd ? 4 : watching && speed > 2 ? 2 : running > LONG_RUN_MS ? 1 : 0;
      suspicion.set(at, Math.max(0, (suspicion.get(at) ?? 0) * 0.985 + tell));
    });
    // a moment after the call, whoever stood there without punching (and could have) gives themselves away
    if (drillGo !== null && !drillLooked && now >= drillGo + DRILL_LOOK_MS) {
      drillLooked = true;
      game.characters.forEach((body, at) => {
        if (!drillPunched.has(at) && body.stunnedUntil < drillGo - DRILL_EARLY_MS && body.hideAt === null) suspicion.set(at, (suspicion.get(at) ?? 0) + DRILL_STOOD);
      });
    }
    // a stall lit up: someone standing at it just tasted it (the fewer there, the surer); a firecracker
    // knocked someone down (the passers-by get clear of them: whoever didn't is likely a player)
    for (const event of game.events) {
      if (event.id <= seenEvent) continue;
      seenEvent = event.id;
      if (event.t === "blast") {
        game.characters.forEach((body, at) => {
          if (now < body.stunnedUntil && body.pose === "stunned") suspicion.set(at, (suspicion.get(at) ?? 0) + DRILL_STOOD);
        });
        continue;
      }
      if (event.t !== "bite" || event.stall === undefined) continue;
      const there = game.characters.map((body, at) => (stallAt(body.x, body.y) === event.stall ? at : -1)).filter((at) => at >= 0);
      for (const at of there) suspicion.set(at, (suspicion.get(at) ?? 0) + 3 / there.length);
    }
    for (const brain of brains) {
      const at = game.characters.findIndex((body) => body.ownerId === brain.id);
      const body = game.characters[at];
      if (!body) continue;
      // who looks most like a player (never itself)
      let best = -1;
      let bestScore = 2.5;
      game.characters.forEach((other, index) => {
        if (index === at) return;
        const score = suspicion.get(index) ?? 0;
        if (score > bestScore) {
          best = index;
          bestScore = score;
        }
      });
      if (best >= 0 && (brain.chasing === null || now > brain.chaseUntil) && !moment) {
        brain.chasing = best;
        brain.chaseUntil = now + 4_000;
      }
      let input = stroll(brain, body, game, now);
      const target = brain.chasing !== null ? game.characters[brain.chasing] : undefined;
      if (drillGo !== null) {
        // the drill: it stands with the crowd, turned to whoever it suspects most if they're in reach,
        // and punches on the call a moment after everyone (the punch goes through the passers-by)
        if (brain.drill !== drillGo) {
          brain.drill = drillGo;
          brain.drillDelay = 30 + Math.random() * 120;
          brain.drillDone = false;
        }
        const suspect = best >= 0 ? game.characters[best] : undefined;
        const dx = suspect ? suspect.x - body.x : 0;
        const dy = suspect ? suspect.y - body.y : 0;
        const reach = Math.hypot(dx, dy);
        if (suspect && reach <= PUNCH_RANGE * 0.95 && reach > 0 && now < drillGo) input = { x: (dx / reach) * 0.07, y: (dy / reach) * 0.07 };
        if (!brain.drillDone && now >= drillGo + brain.drillDelay) {
          brain.drillDone = true;
          room.handle(brain.id, { t: "punch" }, now);
        }
      } else if (moment) {
        // the horn, the busker or the gong: it does what the crowd does, a beat after the sound like
        // everyone (stops and turns to look, or stands and dances: the stroll above), and chases nobody
      } else if (target && now <= brain.chaseUntil) {
        const dx = target.x - body.x;
        const dy = target.y - body.y;
        const distance = Math.hypot(dx, dy);
        // closing in at a passer-by's pace, so it stays hidden itself
        if (distance > PUNCH_RANGE * 0.6) input = { x: (dx / distance) * 0.6, y: (dy / distance) * 0.6 };
        else input = { x: (dx / distance) * 0.25, y: (dy / distance) * 0.25 };
        if (distance <= PUNCH_RANGE * 0.9 && angleDiff(Math.atan2(dy, dx), body.facing) <= PUNCH_ARC / 2 && now >= brain.nextLook) {
          room.handle(brain.id, { t: "punch" }, now);
          brain.nextLook = now + 900 + Math.random() * 900;
          brain.chasing = null;
        }
      } else if (now >= brain.nextLook) {
        // now and then it takes a swing at whoever is in front (and sometimes hits a passer-by)
        brain.nextLook = now + 1_800 + Math.random() * 2_400;
        const front = game.characters.find((other, index) => {
          if (index === at) return false;
          const dx = other.x - body.x;
          const dy = other.y - body.y;
          return Math.hypot(dx, dy) <= PUNCH_RANGE * 0.8 && angleDiff(Math.atan2(dy, dx), body.facing) <= PUNCH_ARC / 2;
        });
        if (front && Math.random() < WILD_SWING) room.handle(brain.id, { t: "punch" }, now);
      }
      // once a round, somewhere in the middle: a distraction (a passer-by across the crowd swings at nothing)
      if (now >= brain.distractAt) {
        brain.distractAt = Infinity;
        room.handle(brain.id, { t: "distract" }, now);
      }
      room.setInput(brain.id, input, now);
    }
  };

  let stopped = false;
  const send = () => onMessage({ t: "view", view: room.view(ME, "player", Date.now()) });
  const timer = window.setInterval(() => {
    if (stopped) return;
    const now = Date.now();
    think(now);
    room.advance(now);
    send();
  }, SIMULATION_STEP_MS);
  onStatus("online");
  send();

  return {
    send(message: ClientMsg) {
      const now = Date.now();
      if (message.t === "start" && room.st.game?.phase === "over") {
        suspicion.clear();
        runningFor.clear();
        seenEvent = 0;
        for (const brain of brains) brain.distractAt = now + distractDelay();
        room.handle(ME, { t: "lobby" }, now);
        room.handle(ME, { t: "start" }, now);
      } else room.handle(ME, message, now);
      send();
    },
    close() {
      stopped = true;
      window.clearInterval(timer);
    }
  };
}
