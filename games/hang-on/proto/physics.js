/**
 * 抓紧了 · Hang On — feel prototype physics.
 * Position-based (Verlet) soft bodies: a round body with two noodle arms, hands that grab
 * static terrain, a swinging rope, or other players. No DOM, no deps; runs in node for tests.
 * Units: pixels, seconds. y grows downward.
 *
 * This is a prototype to validate the feel. The production plan uses Rapier2D for rigid
 * bodies and joints; the control model (aim both arms, grab per hand, pull body) is the same.
 */

export const CFG = {
  gravity: 1700,          // px/s² on the body
  armGravity: 0.55,       // fraction of gravity on arm particles (noodles droop less)
  substeps: 4,
  iterations: 14,
  bodyR: 24,
  armSegs: 6,
  segLen: 15,
  shoulderDX: 14,
  shoulderDY: -8,
  handR: 10,
  armPtR: 6,
  grabPad: 7,             // how close a hand must be to latch (px beyond its radius)
  reach: 88,              // where the hand springs to, relative to the shoulder
  reachK: 140,            // hand spring (px/s² per px)
  pullK: 48,              // body spring toward (anchor + aim·reach) while hanging
  swingBoost: 1100,       // extra sideways push while hanging, so pumping a swing feels snappy
  bodyDamp: 0.35,         // per-second exponential damping
  armDamp: 7,
  groundFriction: 0.85,   // tangential velocity kept per substep while pressed into a floor
  deathY: 1040,
};

const V = {
  len: (x, y) => Math.hypot(x, y),
  norm: (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; },
};

function particle(x, y, r, invMass, gravScale = 1) {
  return { x, y, px: x, py: y, r, inv: invMass, g: gravScale, ground: false };
}

/** Closest point on an axis-aligned rect {x,y,w,h} to point (px,py). */
export function closestOnRect(rect, px, py) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  return [cx, cy];
}

export function createLevel() {
  // All rects are grabbable terrain unless `grab: false`.
  const rects = [
    { x: -200, y: 640, w: 560, h: 400, kind: 'ground' },      // start ledge
    { x: 470, y: 600, w: 180, h: 440, kind: 'ground' },       // ledge 2 (reach across a 110 px gap)
    { x: 600, y: 500, w: 50, h: 100, kind: 'step' },          // step at its edge, to reach the rope
    { x: 980, y: 560, w: 240, h: 480, kind: 'ground' },       // landing after the rope swing
    { x: 1220, y: 200, w: 120, h: 840, kind: 'wall' },        // cliff to climb
    { x: 1198, y: 476, w: 24, h: 16, kind: 'peg' },
    { x: 1198, y: 386, w: 24, h: 16, kind: 'peg' },
    { x: 1198, y: 296, w: 24, h: 16, kind: 'peg' },
    { x: 1340, y: 200, w: 560, h: 840, kind: 'ground' },      // summit with the flag
  ];
  const rope = makeRope(720, 120, 8, 38);
  return {
    w: 1900, h: 1040,
    rects, rope,
    spawn: { x: 120, y: 600 },
    goal: { x: 1560, y: 60, w: 160, h: 140 },
    flag: { x: 1620, y: 200 },
  };
}

function makeRope(ax, ay, n, spacing) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(particle(ax, ay + i * spacing, i === n ? 9 : 3, i === 0 ? 0 : 1.5, 1));
  const cons = [];
  for (let i = 0; i < n; i++) cons.push({ a: pts[i], b: pts[i + 1], len: spacing });
  return { anchor: { x: ax, y: ay }, pts, cons, handle: pts[n] };
}

export function createPlayer(id, spawn, color) {
  const p = {
    id, color,
    spawn: { ...spawn },
    body: particle(spawn.x, spawn.y, CFG.bodyR, 1, 1),
    arms: [makeArm(spawn, -1), makeArm(spawn, +1)],
    aim: { x: 0, y: 0 },          // unit vector or zero
    grab: [false, false],         // button held: left, right
    dead: false, deadT: 0, deaths: 0,
    face: 'idle',                 // idle | grab | fly | scream | win
    landedT: 0,
  };
  return p;
}

function makeArm(spawn, side) {
  const pts = [];
  for (let i = 0; i <= CFG.armSegs; i++) {
    const isHand = i === CFG.armSegs;
    pts.push(particle(spawn.x + side * CFG.shoulderDX + side * i * 4, spawn.y + CFG.shoulderDY + i * 6, isHand ? CFG.handR : CFG.armPtR, isHand ? 3 : 4, CFG.armGravity));
  }
  return { side, pts, hand: pts[CFG.armSegs], grip: null, gripT: 0 };
}

export function createWorld(level, nPlayers = 1) {
  const colors = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8'];
  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    players.push(createPlayer(i, { x: level.spawn.x + i * 44, y: level.spawn.y }, colors[i % colors.length]));
  }
  return { level, players, time: 0, won: false, winT: 0, events: [] };
}

export function setPlayers(world, n) {
  const colors = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8'];
  while (world.players.length < n) {
    const i = world.players.length;
    world.players.push(createPlayer(i, { x: world.level.spawn.x + i * 44, y: world.level.spawn.y }, colors[i % colors.length]));
  }
  while (world.players.length > n) {
    const gone = world.players.pop();
    for (const p of world.players) for (const arm of p.arms) if (arm.grip && arm.grip.owner === gone) arm.grip = null;
  }
}

export function setInput(player, aimX, aimY, grabL, grabR) {
  const l = Math.hypot(aimX, aimY);
  if (l > 1) { aimX /= l; aimY /= l; }
  player.aim.x = l < 0.12 ? 0 : aimX;
  player.aim.y = l < 0.12 ? 0 : aimY;
  player.grab[0] = !!grabL;
  player.grab[1] = !!grabR;
}

function allParticles(world) {
  const out = [];
  for (const p of world.players) {
    out.push(p.body);
    for (const arm of p.arms) for (const q of arm.pts) out.push(q);
  }
  for (const q of world.level.rope.pts) out.push(q);
  return out;
}

/** Try to latch a hand onto terrain, the rope handle, or another player. */
function tryGrab(world, player, arm) {
  const h = arm.hand;
  const R = h.r + CFG.grabPad;
  let best = null, bestD = Infinity;
  for (const rect of world.level.rects) {
    if (rect.grab === false) continue;
    const [cx, cy] = closestOnRect(rect, h.x, h.y);
    const d = V.len(cx - h.x, cy - h.y);
    if (d < R && d < bestD) { bestD = d; best = { kind: 'static', x: cx, y: cy, rect }; }
  }
  const rope = world.level.rope;
  for (let i = 1; i < rope.pts.length; i++) {
    const q = rope.pts[i];
    const d = V.len(q.x - h.x, q.y - h.y);
    if (d < R + q.r && d < bestD) { bestD = d; best = { kind: 'particle', p: q, owner: null }; }
  }
  for (const other of world.players) {
    if (other === player || other.dead) continue;
    const cands = [other.body, ...other.arms.flatMap((a) => a.pts)];
    for (const q of cands) {
      const d = V.len(q.x - h.x, q.y - h.y);
      if (d < R + q.r && d < bestD) { bestD = d; best = { kind: 'particle', p: q, owner: other }; }
    }
  }
  if (best) { arm.grip = best; arm.gripT = 0; world.events.push({ type: 'grab', player: player.id, kind: best.kind, x: h.x, y: h.y }); }
}

function respawn(world, player) {
  const s = player.spawn;
  const place = (q, x, y) => { q.x = x; q.y = y; q.px = x; q.py = y; };
  place(player.body, s.x, s.y);
  player.arms.forEach((arm) => {
    arm.grip = null;
    arm.pts.forEach((q, i) => place(q, s.x + arm.side * (CFG.shoulderDX + i * 4), s.y + CFG.shoulderDY + i * 6));
  });
  for (const other of world.players) for (const arm of other.arms) {
    if (arm.grip && arm.grip.owner === player) arm.grip = null;
  }
  player.dead = false; player.deadT = 0; player.face = 'idle';
}

export function stepWorld(world, dt) {
  if (world.won) { world.winT += dt; return; }
  world.events.length = 0;
  world.time += dt;
  const sub = dt / CFG.substeps;
  for (let s = 0; s < CFG.substeps; s++) substep(world, sub);

  // death & respawn
  for (const p of world.players) {
    if (!p.dead && p.body.y > CFG.deathY) {
      p.dead = true; p.deadT = 0; p.deaths++; p.face = 'scream';
      world.events.push({ type: 'death', player: p.id });
      for (const arm of p.arms) arm.grip = null;
      for (const other of world.players) for (const arm of other.arms) if (arm.grip && arm.grip.owner === p) arm.grip = null;
    }
    if (p.dead) { p.deadT += dt; if (p.deadT > 0.7) respawn(world, p); }
  }
  // goal: every living player inside the zone
  const g = world.level.goal;
  const alive = world.players.filter((p) => !p.dead);
  const allIn = alive.length === world.players.length && alive.every((p) => p.body.x > g.x && p.body.x < g.x + g.w && p.body.y > g.y && p.body.y < g.y + g.h);
  if (allIn) { world.won = true; world.winT = 0; world.events.push({ type: 'win' }); for (const p of world.players) p.face = 'win'; }
}

function substep(world, dt) {
  const { level } = world;
  const bodyKeep = Math.exp(-CFG.bodyDamp * dt);
  const armKeep = Math.exp(-CFG.armDamp * dt);
  const ropeKeep = Math.exp(-1.2 * dt);

  // 1. forces + integrate
  for (const p of world.players) {
    if (p.dead) continue;
    const gripping = p.arms.filter((a) => a.grip);
    // body
    let ax = 0, ay = CFG.gravity;
    if (gripping.length && (p.aim.x || p.aim.y)) {
      // While holding on, the stick says where the BODY should go (up = climb over, sideways = swing),
      // never where the hand points: that keeps the controls from feeling inverted when hanging.
      let tx = 0, ty = 0;
      for (const arm of gripping) {
        tx += arm.hand.x + p.aim.x * CFG.reach * 0.9 - arm.side * CFG.shoulderDX;
        ty += arm.hand.y + p.aim.y * CFG.reach * 0.9 - CFG.shoulderDY;
      }
      tx /= gripping.length; ty /= gripping.length;
      ax += CFG.pullK * (tx - p.body.x) + CFG.swingBoost * p.aim.x;
      ay += CFG.pullK * (ty - p.body.y);
    }
    integrate(p.body, ax, ay, dt, bodyKeep);
    // arms
    for (const arm of p.arms) {
      const sx = p.body.x + arm.side * CFG.shoulderDX, sy = p.body.y + CFG.shoulderDY;
      for (let i = 1; i < arm.pts.length; i++) {
        const q = arm.pts[i];
        let fx = 0, fy = CFG.gravity * q.g;
        if (q === arm.hand && !arm.grip) {
          const hasAim = p.aim.x || p.aim.y;
          const tx = sx + (hasAim ? p.aim.x : arm.side * 0.35) * CFG.reach;
          const ty = sy + (hasAim ? p.aim.y : 0.75) * CFG.reach;
          fx += CFG.reachK * (tx - q.x); fy += CFG.reachK * (ty - q.y);
        }
        integrate(q, fx, fy, dt, armKeep);
      }
      arm.pts[0].x = sx; arm.pts[0].y = sy; arm.pts[0].px = sx; arm.pts[0].py = sy;
    }
  }
  for (let i = 1; i < level.rope.pts.length; i++) integrate(level.rope.pts[i], 0, CFG.gravity, dt, ropeKeep);

  // 2. grabs: latch while the button is held, release when it is not
  for (const p of world.players) {
    if (p.dead) continue;
    p.arms.forEach((arm, i) => {
      if (p.grab[i] && !arm.grip) tryGrab(world, p, arm);
      if (!p.grab[i] && arm.grip) { arm.grip = null; world.events.push({ type: 'release', player: p.id }); }
      if (arm.grip) arm.gripT += dt;
    });
  }

  // 3. constraints
  for (let it = 0; it < CFG.iterations; it++) {
    for (const c of level.rope.cons) distance(c.a, c.b, c.len);
    level.rope.pts[0].x = level.rope.anchor.x; level.rope.pts[0].y = level.rope.anchor.y;
    for (const p of world.players) {
      if (p.dead) continue;
      for (const arm of p.arms) {
        // shoulder: arm[0] rides on the body (and pulls it)
        const sx = p.body.x + arm.side * CFG.shoulderDX, sy = p.body.y + CFG.shoulderDY;
        const q0 = arm.pts[0];
        const dx = sx - q0.x, dy = sy - q0.y;
        q0.x += dx * 0.8; q0.y += dy * 0.8;
        p.body.x -= dx * 0.2; p.body.y -= dy * 0.2;
        // segments, solved from the hand inward when gripping so the pull reaches the body
        if (arm.grip) {
          pin(arm);
          // long-range tether: the body can never be farther than one arm from what it holds.
          // This is what keeps a hanging body (or a chain of bodies) from stretching the noodles.
          const g = arm.grip;
          const anchor = g.kind === 'static' ? { x: g.x, y: g.y, inv: 0 } : g.p;
          maxDistance(p.body, anchor, CFG.armSegs * CFG.segLen + CFG.shoulderDX + 2);
          for (let i = arm.pts.length - 1; i > 0; i--) distance(arm.pts[i - 1], arm.pts[i], CFG.segLen);
        } else {
          for (let i = 0; i < arm.pts.length - 1; i++) distance(arm.pts[i], arm.pts[i + 1], CFG.segLen);
        }
      }
      // collisions
      collide(p.body, level.rects, true, dt);
      for (const arm of p.arms) for (let i = 1; i < arm.pts.length; i++) if (!(arm.grip && i === arm.pts.length - 1)) collide(arm.pts[i], level.rects, false, dt);
    }
  }
  for (const p of world.players) updateFace(p);
}

function integrate(q, ax, ay, dt, keep) {
  if (q.inv === 0) return;
  const vx = (q.x - q.px) * keep, vy = (q.y - q.py) * keep;
  q.px = q.x; q.py = q.y;
  q.x += vx + ax * dt * dt;
  q.y += vy + ay * dt * dt;
}

function distance(a, b, len) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const diff = (d - len) / d;
  const wa = a.inv / (a.inv + b.inv || 1), wb = b.inv / (a.inv + b.inv || 1);
  if (a.inv + b.inv === 0) return;
  a.x += dx * diff * wa; a.y += dy * diff * wa;
  b.x -= dx * diff * wb; b.y -= dy * diff * wb;
}

/** Rope-style constraint: only acts when a and b are farther apart than maxLen. */
function maxDistance(a, b, maxLen) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxLen || d < 1e-6) return;
  const diff = (d - maxLen) / d;
  const sum = a.inv + b.inv;
  if (sum === 0) return;
  const wa = a.inv / sum, wb = b.inv / sum;
  a.x += dx * diff * wa; a.y += dy * diff * wa;
  if (b.inv) { b.x -= dx * diff * wb; b.y -= dy * diff * wb; }
}

function pin(arm) {
  const g = arm.grip, h = arm.hand;
  if (g.kind === 'static') { h.x = g.x; h.y = g.y; h.px = g.x; h.py = g.y; }
  else distance(h, g.p, 0);
}

function collide(q, rects, isBody, dt) {
  q.ground = false;
  for (const rect of rects) {
    const [cx, cy] = closestOnRect(rect, q.x, q.y);
    let dx = q.x - cx, dy = q.y - cy;
    let d = Math.hypot(dx, dy);
    if (d >= q.r) continue;
    if (d < 1e-6) {
      // centre inside the rect: push out through the nearest face
      const toL = q.x - rect.x, toR = rect.x + rect.w - q.x, toT = q.y - rect.y, toB = rect.y + rect.h - q.y;
      const m = Math.min(toL, toR, toT, toB);
      if (m === toT) { dy = -1; dx = 0; d = -toT; } else if (m === toB) { dy = 1; dx = 0; d = -toB; } else if (m === toL) { dx = -1; dy = 0; d = -toL; } else { dx = 1; dy = 0; d = -toR; }
      q.x += dx * (q.r - d); q.y += dy * (q.r - d);
    } else {
      const nx = dx / d, ny = dy / d, push = q.r - d;
      q.x += nx * push; q.y += ny * push;
      if (ny < -0.5) q.ground = true;
      // friction: damp tangential velocity while touching, scaled by how hard we are pressed in,
      // and much lighter against walls (|ny| small) so a body can slide up a face while climbing
      const vx = q.x - q.px, vy = q.y - q.py;
      const vn = vx * nx + vy * ny;
      let tx = vx - vn * nx, ty = vy - vn * ny;
      const onFloor = ny < -0.5;
      const base = onFloor ? (isBody ? CFG.groundFriction : 0.6) : 0.97;
      const pressed = Math.min(1, push / 1.5);
      const keep = 1 - (1 - base) * pressed;
      tx *= keep; ty *= keep;
      const vn2 = Math.min(vn, 0) * 0.1; // kill inward velocity, tiny bounce
      q.px = q.x - (tx + vn2 * nx); q.py = q.y - (ty + vn2 * ny);
    }
  }
}

function updateFace(p) {
  if (p.dead) { p.face = 'scream'; return; }
  const vy = p.body.y - p.body.py;
  const gripping = p.arms.some((a) => a.grip);
  if (gripping) p.face = 'grab';
  else if (vy > 2.2) p.face = 'scream';
  else if (Math.abs(vy) > 0.8 || Math.abs(p.body.x - p.body.px) > 1.5) p.face = 'fly';
  else p.face = 'idle';
}

/** Speed in px/s, for juice (trails, squash) and tests. */
export function speed(q, dt) {
  return Math.hypot(q.x - q.px, q.y - q.py) / dt;
}
