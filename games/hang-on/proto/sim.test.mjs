// Headless feel test: drive the prototype through the level and assert the physics behaves.
import { CFG, createLevel, createWorld, setInput, stepWorld } from './physics.js';

const dt = 1 / 60;
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('ok  ', m);

function run(world, seconds, fn) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { fn?.(i * dt); stepWorld(world, dt); }
}
function finite(world) {
  for (const p of world.players) {
    for (const q of [p.body, ...p.arms.flatMap((a) => a.pts)]) if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return false;
  }
  return true;
}

// 1. rests on the start ledge
{
  const w = createWorld(createLevel(), 1);
  run(w, 2);
  const b = w.players[0].body;
  if (!finite(w)) fail('NaN at rest');
  Math.abs(b.y - (640 - CFG.bodyR)) < 2 ? ok(`rests on ledge at y=${b.y.toFixed(1)}`) : fail(`body y ${b.y}`);
  b.ground ? ok('ground flag set') : fail('ground flag');
}

// 2. reaches toward the aim without gripping; arm stays within reach
{
  const w = createWorld(createLevel(), 1);
  const p = w.players[0];
  run(w, 1.5, () => setInput(p, 1, -0.3, false, false));
  const h = p.arms[1].hand;
  const sx = p.body.x + CFG.shoulderDX, sy = p.body.y + CFG.shoulderDY;
  const d = Math.hypot(h.x - sx, h.y - sy);
  d > 60 && d <= CFG.armSegs * CFG.segLen + 1 ? ok(`right hand reaches ${d.toFixed(0)} px toward aim`) : fail(`reach distance ${d}`);
  h.x > p.body.x + 50 ? ok('hand is on the aimed side') : fail('hand side');
}

// 3. grabs the ground and pulls forward (inchworm): x advances
{
  const w = createWorld(createLevel(), 1);
  const p = w.players[0];
  const x0 = p.body.x;
  // reach forward-down, grab, pull (aim back), release, repeat
  run(w, 6, (t) => {
    const phase = (t % 1.2);
    if (phase < 0.4) setInput(p, 1, 0.6, false, false);            // reach ahead
    else if (phase < 0.9) setInput(p, 1, 0.2, true, true);           // grab and pull the body forward
    else setInput(p, 1, 0.3, false, false);                          // release
  });
  if (!finite(w)) fail('NaN while crawling');
  p.body.x > x0 + 40 ? ok(`crawled forward ${(p.body.x - x0).toFixed(0)} px`) : fail(`crawl moved ${(p.body.x - x0).toFixed(0)} px`);
}

// 4. grabs the step's face from the ledge; aiming up mantles over it
{
  const w = createWorld(createLevel(), 1);
  const p = w.players[0];
  const place = (q, x, y) => { q.x = x; q.y = y; q.px = x; q.py = y; };
  place(p.body, 556, 576);                                             // on ledge 2, left of the step (x 600..650, top 500)
  p.arms.forEach((a) => a.pts.forEach((q, i) => place(q, 556 + a.side * (CFG.shoulderDX + i * 4), 568 + i * 6)));
  run(w, 0.5, () => setInput(p, 1, -0.15, false, false));             // reach right at the step's face, no grab yet
  run(w, 0.5, () => setInput(p, 1, -0.15, false, true));              // grab it
  const grip = p.arms[1].grip;
  grip && grip.kind === 'static' && grip.rect.kind === 'step' ? ok(`grabbed the step at (${grip.x.toFixed(0)}, ${grip.y.toFixed(0)})`) : fail(`grip ${JSON.stringify(grip && [grip.kind, grip.rect?.kind, grip.x, grip.y])}`);
  const yBefore = p.body.y;
  run(w, 2.0, () => setInput(p, 0.3, -1, false, true));               // aim up: climb
  if (!finite(w)) fail('NaN while climbing');
  p.body.y < yBefore - 40 ? ok(`climbed ${(yBefore - p.body.y).toFixed(0)} px by aiming up`) : fail(`climb ${(yBefore - p.body.y).toFixed(1)}`);
  p.arms[1].grip ? ok('kept the grip while climbing') : fail('lost grip while climbing');
}

// 5. rope: grab the handle, pump in rhythm, and the rope swings wide
{
  const w = createWorld(createLevel(), 1);
  const p = w.players[0];
  const handle = w.level.rope.handle;
  const place = (q, x, y) => { q.x = x; q.y = y; q.px = x; q.py = y; };
  place(p.body, handle.x - 30, handle.y + 40);
  p.arms.forEach((a) => a.pts.forEach((q, i) => place(q, handle.x - 30 + a.side * (CFG.shoulderDX + i * 4), handle.y + 32 + i * 6)));
  const hx0 = handle.x;
  run(w, 0.6, () => setInput(p, 0.45, -0.89, false, true));          // right hand straight at the handle
  p.arms[1].grip?.kind === 'particle' ? ok('right hand latched onto the rope handle') : fail('rope grab');
  let maxSwing = 0;
  run(w, 8, (t) => { setInput(p, Math.sin((2 * Math.PI * t) / 3.0) > 0 ? 1 : -1, 0.2, false, true); maxSwing = Math.max(maxSwing, Math.abs(handle.x - hx0)); });
  maxSwing > 60 ? ok(`rope swung up to ${maxSwing.toFixed(0)} px when pumped in rhythm`) : fail(`rope swing ${maxSwing.toFixed(1)}`);
  if (!finite(w)) fail('NaN on rope');
}

// 6a. grabbing another player on the ground
{
  const w = createWorld(createLevel(), 2);
  const [a, b] = w.players;                                            // spawn 44 px apart on the start ledge
  run(w, 0.4, () => { setInput(a, 0, 0, false, false); setInput(b, -1, -0.1, false, false); });   // lift the hand first
  run(w, 0.6, () => { setInput(a, 0, 0, false, false); setInput(b, -1, -0.1, true, false); });
  b.arms[0].grip?.owner === a ? ok('P2 grabbed P1 on the ground') : fail(`ground chain grip: ${JSON.stringify(b.arms[0].grip?.kind ?? null)}`);
}

// 6b. a hanging chain holds: P1 on the rope handle, P2 on P1, 3 s
{
  const w = createWorld(createLevel(), 2);
  const [a, b] = w.players;
  const handle = w.level.rope.handle;
  const place = (q, x, y) => { q.x = x; q.y = y; q.px = x; q.py = y; };
  place(a.body, handle.x - 20, handle.y + 80);
  a.arms.forEach((arm) => arm.pts.forEach((q, i) => place(q, handle.x - 20 + arm.side * (CFG.shoulderDX + i * 4), handle.y + 72 + i * 6)));
  place(a.arms[1].hand, handle.x, handle.y); a.arms[1].grip = { kind: 'particle', p: handle, owner: null };
  place(b.body, handle.x - 20, handle.y + 180);
  b.arms.forEach((arm) => arm.pts.forEach((q, i) => place(q, handle.x - 20 + arm.side * (CFG.shoulderDX + i * 4), handle.y + 172 + i * 6)));
  place(b.arms[0].hand, a.body.x, a.body.y + CFG.bodyR); b.arms[0].grip = { kind: 'particle', p: a.body, owner: a };
  const hy0 = handle.y;
  run(w, 3.0, () => { setInput(a, 0, 0, false, true); setInput(b, 0, 0, true, false); });
  if (!finite(w)) fail('NaN in chain');
  !a.dead && !b.dead ? ok(`both still hanging after 3 s (P1 y ${a.body.y.toFixed(0)}, P2 y ${b.body.y.toFixed(0)})`) : fail('someone fell');
  a.arms[1].grip?.p === handle && b.arms[0].grip?.owner === a ? ok('grips intact') : fail('a grip was lost');
  const armLen = CFG.armSegs * CFG.segLen + CFG.shoulderDX + 2;
  Math.hypot(a.body.x - handle.x, a.body.y - handle.y) <= armLen + 6 ? ok('P1 stays within one arm of the handle') : fail(`P1 stretched to ${Math.hypot(a.body.x - handle.x, a.body.y - handle.y).toFixed(0)} px`);
  Math.hypot(b.body.x - a.body.x, b.body.y - a.body.y) <= armLen + 6 ? ok('P2 stays within one arm of P1') : fail(`P2 stretched to ${Math.hypot(b.body.x - a.body.x, b.body.y - a.body.y).toFixed(0)} px`);
  handle.y > hy0 + 2 ? ok(`rope sags ${(handle.y - hy0).toFixed(0)} px under two bodies`) : ok('rope barely sags');
}

// 7. falling off the world respawns at the spawn point and counts a death
{
  const w = createWorld(createLevel(), 1);
  const p = w.players[0];
  const place = (q, x, y) => { q.x = x; q.y = y; q.px = x; q.py = y; };
  place(p.body, 800, 900);
  p.arms.forEach((a) => a.pts.forEach((q, i) => place(q, 800 + a.side * (CFG.shoulderDX + i * 4), 892 + i * 6)));
  run(w, 2.5);
  p.deaths === 1 && !p.dead && Math.abs(p.body.x - w.level.spawn.x) < 5 ? ok('died once and respawned at start') : fail(`deaths=${p.deaths} dead=${p.dead} x=${p.body.x}`);
}

// 8. win: all players in the goal zone
{
  const w = createWorld(createLevel(), 2);
  const g = w.level.goal;
  for (const p of w.players) {
    const place = (q, x, y) => { q.x = x; q.y = y; q.px = x; q.py = y; };
    place(p.body, g.x + g.w / 2, g.y + g.h - 30);
    p.arms.forEach((a) => a.pts.forEach((q, i) => place(q, g.x + g.w / 2 + a.side * (CFG.shoulderDX + i * 4), g.y + g.h - 38 + i * 6)));
  }
  run(w, 1);
  w.won ? ok('level completes when everyone is in the goal') : fail('no win');
}

// 9. stress: 4 players mashing random inputs for 20 s stay finite and never tunnel through the ground
{
  const w = createWorld(createLevel(), 4);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let tunnelled = 0;
  run(w, 20, () => {
    for (const p of w.players) setInput(p, rnd() * 2 - 1, rnd() * 2 - 1, rnd() < 0.5, rnd() < 0.5);
    for (const p of w.players) for (const r of w.level.rects) {
      const b = p.body;
      if (b.x > r.x + 4 && b.x < r.x + r.w - 4 && b.y > r.y + 4 && b.y < r.y + r.h - 4) tunnelled++;
    }
  });
  finite(w) ? ok('20 s of 4-player mashing stays finite') : fail('NaN in stress');
  tunnelled === 0 ? ok('no body ever ended a frame inside terrain') : fail(`tunnelled frames: ${tunnelled}`);
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nall feel checks passed');
