// Practice's computer rivals, played out on a fake clock with fixed dice: a player who stands still is
// left alone and the round lasts long enough to play, a player who walks on through the ferry horn is
// spotted far more often than one who stops with the crowd (the rivals stop for it too, a beat late),
// and at the theatre one who stands through the stage's call is spotted more than one who punches with
// the whole crowd.
import assert from "node:assert/strict";
import test from "node:test";
import { DRILL_GO_MS, DRILL_MS, SIMULATION_STEP_MS } from "../src/engine";
import type { ClientMsg, RoomView, ServerMsg } from "../src/room/protocol";

let now = 1_700_000_000_000;
let tick: (() => void) | null = null;
(globalThis as { window?: unknown }).window = {
  setInterval: (fn: () => void) => {
    tick = fn;
    return 1;
  },
  clearInterval: () => {}
};
Date.now = () => now;
const { openPractice } = await import("../src/client/practice");

function dice(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Player = (step: number, view: RoomView | null) => ClientMsg | null;

/** Play practice rounds (each on the seawall, its first arena): how long each lasted and how often you were spotted. */
function rounds(count: number, play: Player) {
  const out: { seconds: number; spotted: number }[] = [];
  for (let round = 0; round < count; round++) {
    Math.random = dice(round * 7_919 + 13);
    now += 600_000;
    let view: RoomView | null = null;
    const connection = openPractice("en", "Me", (message: ServerMsg) => {
      if (message.t === "view") view = message.view;
    }, () => {});
    const begin = now;
    for (let step = 0; step < 80_000 / SIMULATION_STEP_MS; step++) {
      now += SIMULATION_STEP_MS;
      const move = play(step, view);
      if (move) connection.send(move);
      tick!();
      if ((view as RoomView | null)?.game?.phase === "over") break;
    }
    const me = (view as RoomView | null)?.players.find((player) => player.you);
    out.push({ seconds: (now - begin) / 1000, spotted: me?.tagged ?? 0 });
    connection.close();
  }
  return out;
}

// a walk about the field at a stroller's pace, a new direction every two seconds
const wander = (step: number): ClientMsg => {
  const angle = Math.floor(step / 40) * 1.3;
  return { t: "move", x: Math.cos(angle) * 0.5, y: Math.sin(angle) * 0.5 };
};

test("a player who stands still is left alone, and a round lasts long enough to play", () => {
  const played = rounds(10, () => null);
  const lengths = played.map((round) => round.seconds).sort((a, b) => a - b);
  const median = (lengths[4] + lengths[5]) / 2;
  assert.ok(median >= 30, `half the rounds are over within ${median.toFixed(0)} s`);
  assert.ok(played.reduce((sum, round) => sum + round.spotted, 0) <= 2, "spotted while standing still");
});

test("walking on through the ferry horn gives a player away; stopping with the crowd doesn't", () => {
  const careless = rounds(10, (step) => (step % 4 === 0 ? wander(step) : null));
  // the same walk, but when the horn sounds: stop, and a light nudge up turns you to the sea
  const careful = rounds(10, (step, view) => (view?.game?.moment ? { t: "move", x: 0, y: -0.08 } : step % 4 === 0 ? wander(step) : null));
  const spotted = (played: { spotted: number }[]) => played.reduce((sum, round) => sum + round.spotted, 0);
  assert.ok(spotted(careless) >= 3, `walking on through the horn: spotted ${spotted(careless)} times in 10 rounds`);
  assert.ok(spotted(careless) >= 2 * spotted(careful), `walking on ${spotted(careless)} times, stopping ${spotted(careful)}`);
});

test("at the theatre, standing through the call gives a player away; punching with the crowd doesn't", () => {
  const place = globalThis as { location?: unknown };
  place.location = { search: "?arena=gallery" };
  try {
    const still = rounds(10, () => null);
    // the same, but on the call: punch with everyone (once a drill)
    let punchedIn = NaN;
    const together = rounds(10, (step, view) => {
      if (step === 0) punchedIn = NaN;
      const game = view?.game;
      const moment = game?.moment;
      if (!game || moment?.kind !== "drill" || moment.endsInMs > DRILL_MS - DRILL_GO_MS) return null;
      const drill = Math.round((game.remainingMs - moment.endsInMs) / 500);
      if (drill === punchedIn) return null;
      punchedIn = drill;
      return { t: "punch" };
    });
    const spotted = (played: { spotted: number }[]) => played.reduce((sum, round) => sum + round.spotted, 0);
    assert.ok(spotted(still) >= 3, `standing through the call: spotted ${spotted(still)} times in 10 rounds`);
    assert.ok(spotted(still) >= 2 * spotted(together), `standing ${spotted(still)} times, punching with the crowd ${spotted(together)}`);
  } finally {
    delete place.location;
  }
});
