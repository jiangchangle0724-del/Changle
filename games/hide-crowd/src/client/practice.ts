// One phone on its own (changle.ca/hide/practice, the game card's one-phone button): the same room
// as online, run in the page, with three computer rivals hidden in the crowd. They walk the way the
// passers-by walk, go after anyone who gives themselves away (running, punching), and sometimes get
// it wrong. No server, no penalty.
import { ARENA, NPC_SPEED, PLAYER_SPEED, PUNCH_ARC, PUNCH_RANGE, SIMULATION_STEP_MS, type Character, type Vector } from "../engine";
import type { ClientMsg, Lang, ServerMsg } from "../room/protocol";
import { Room } from "../room/room";
import type { ConnectionState, RoomConnection } from "./net";

const ME = "practice-you";
const RIVALS = 3;

interface Brain {
  id: string;
  offset: number;
  style: number;
  nextLook: number;
  /** the body it is after (a place in the crowd), and until when */
  chasing: number | null;
  chaseUntil: number;
}

const angleDiff = (a: number, b: number) => {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
};

/** A walk like a passer-by's: stop and go on the same beat, turning every few steps. */
function stroll(brain: Brain, body: Character, now: number): Vector {
  const beat = Math.floor(((now + brain.offset) % 6_800) / 850);
  if (beat === 2 || beat === 5) return { x: 0, y: 0 };
  const route = (Math.floor(brain.offset / 379) + brain.style * 2) % 8;
  const angle = route * (Math.PI / 4) + Math.floor(beat / 3) * (Math.PI / 2);
  let x = Math.cos(angle);
  let y = Math.sin(angle);
  if ((body.x <= ARENA.marginX + 2 && x < 0) || (body.x >= ARENA.width - ARENA.marginX - 2 && x > 0)) x *= -1;
  if ((body.y <= ARENA.marginY + 2 && y < 0) || (body.y >= ARENA.height - ARENA.marginY - 2 && y > 0)) y *= -1;
  const pace = NPC_SPEED / PLAYER_SPEED;
  return { x: x * pace, y: y * pace };
}

export function openPractice(lang: Lang, name: string, onMessage: (message: ServerMsg) => void, onStatus: (status: ConnectionState) => void): RoomConnection {
  const start = Date.now();
  const room = Room.create("0000", start, Math.floor(Math.random() * 0x7fffffff));
  room.st.settings.penalties = false;
  room.join(ME, name, lang, "player", start);
  const brains: Brain[] = [];
  for (let index = 0; index < RIVALS; index++) {
    const id = `practice-computer-${index + 1}`;
    room.join(id, lang === "zh" ? `电脑 ${index + 1}` : `Computer ${index + 1}`, lang, "player", start + index + 1);
    brains.push({ id, offset: Math.floor(Math.random() * 4_600), style: index % 3, nextLook: start + 1_500 + index * 400, chasing: null, chaseUntil: 0 });
  }
  room.claimHost(start);
  room.handle(ME, { t: "start" }, start);
  // how long each place in the crowd has looked like a player lately (fast, or a punch)
  const suspicion = new Map<number, number>();

  const think = (now: number) => {
    const game = room.st.game;
    if (!game || game.phase !== "playing") return;
    game.characters.forEach((body, at) => {
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      const tell = speed > NPC_SPEED + 1.2 ? 1 : body.pose === "windup" || body.pose === "punch" ? 4 : 0;
      suspicion.set(at, Math.max(0, (suspicion.get(at) ?? 0) * 0.985 + tell));
    });
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
      if (best >= 0 && (brain.chasing === null || now > brain.chaseUntil)) {
        brain.chasing = best;
        brain.chaseUntil = now + 4_000;
      }
      let input = stroll(brain, body, now);
      const target = brain.chasing !== null ? game.characters[brain.chasing] : undefined;
      if (target && now <= brain.chaseUntil) {
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
        if (front && Math.random() < 0.18) room.handle(brain.id, { t: "punch" }, now);
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
