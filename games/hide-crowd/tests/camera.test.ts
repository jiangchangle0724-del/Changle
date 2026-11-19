import assert from "node:assert/strict";
import test from "node:test";
import { frameFloor } from "../src/client/camera";
import { FLOOR_ART_AREA } from "../src/client/ui/floorArt";

// the floor a phone or a big screen frames: x across, z from the back row to the front, a person's height
const FLOOR = { halfWidth: 8.8, near: 4.03, far: -4.03, height: 3.1 };
const MARGINS = { top: 0.12, bottom: 0.07, side: 0.02 };

/** Where a point lands on screen (-1..1) for a framing, as three.js would draw it. */
function onScreen(framing: ReturnType<typeof frameFloor>, aspect: number, x: number, y: number, z: number) {
  const [px, py, pz] = framing.position;
  const [tx, ty, tz] = framing.target;
  const forward = [tx - px, ty - py, tz - pz];
  const length = Math.hypot(...forward);
  const f = forward.map((v) => v / length);
  // right = forward x up(0,1,0); up = right x forward
  const right = [-f[2], 0, f[0]];
  const rightLength = Math.hypot(...right);
  const r = right.map((v) => v / rightLength);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [x - px, y - py, z - pz];
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const tanY = Math.tan((framing.fov * Math.PI) / 360);
  return { x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (depth * tanY * aspect), y: (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (depth * tanY) };
}

test("the floor fills the screen: front row on the bottom margin, everyone inside the sides and under the top bar", () => {
  for (const aspect of [844 / 390, 852 / 393, 932 / 430, 16 / 9, 4 / 3]) {
    const framing = frameFloor(aspect, FLOOR, MARGINS);
    const front = onScreen(framing, aspect, 0, 0, FLOOR.near);
    assert.ok(Math.abs(front.y - (-1 + 2 * MARGINS.bottom)) < 0.01, `${aspect}: the front row's feet sit on the bottom margin (${front.y})`);
    const back = onScreen(framing, aspect, 0, FLOOR.height, FLOOR.far);
    assert.ok(back.y <= 1 - 2 * MARGINS.top + 1e-6, `${aspect}: the back row's heads are under the top bar (${back.y})`);
    for (const [x, y, z] of [[FLOOR.halfWidth, 0, FLOOR.near], [FLOOR.halfWidth, FLOOR.height, FLOOR.near], [-FLOOR.halfWidth, FLOOR.height, FLOOR.far]]) {
      const point = onScreen(framing, aspect, x, y, z);
      assert.ok(Math.abs(point.x) <= 1 - 2 * MARGINS.side + 1e-6, `${aspect}: (${x}, ${y}, ${z}) is inside the sides (${point.x})`);
    }
    // and it's tight: one way or the other the floor reaches the edge it's allowed to
    const side = Math.abs(onScreen(framing, aspect, FLOOR.halfWidth, FLOOR.height, FLOOR.near).x);
    assert.ok(side > 1 - 2 * MARGINS.side - 0.02 || back.y > 1 - 2 * MARGINS.top - 0.02, `${aspect}: the floor is as big as the screen allows`);
  }
});

test("a phone held sideways sees the floor reach the bottom of the screen, not an empty half", () => {
  const aspect = 844 / 390;
  const framing = frameFloor(aspect, FLOOR, MARGINS);
  const front = onScreen(framing, aspect, 0, 0, FLOOR.near);
  const back = onScreen(framing, aspect, 0, 0, FLOOR.far);
  // the floor people stand on covers more than half the screen's height
  assert.ok((back.y - front.y) / 2 > 0.5, `${back.y - front.y}`);
});

test("the framing stays finite for odd screens", () => {
  for (const aspect of [0, Number.NaN, 0.3, 9]) {
    const framing = frameFloor(aspect, FLOOR, MARGINS);
    assert.ok([...framing.position, ...framing.target, framing.fov].every(Number.isFinite), String(aspect));
  }
});

/** Where the ray through a point on screen (-1..1) meets the floor, or null when it looks above it. */
function onFloor(framing: ReturnType<typeof frameFloor>, aspect: number, sx: number, sy: number) {
  const [px, py, pz] = framing.position;
  const [tx, ty, tz] = framing.target;
  const forward = [tx - px, ty - py, tz - pz];
  const length = Math.hypot(...forward);
  const f = forward.map((v) => v / length);
  const right = [-f[2], 0, f[0]];
  const rightLength = Math.hypot(...right);
  const r = right.map((v) => v / rightLength);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tanY = Math.tan((framing.fov * Math.PI) / 360);
  const ray = [0, 1, 2].map((axis) => f[axis] + r[axis] * sx * tanY * aspect + u[axis] * sy * tanY);
  if (ray[1] >= 0) return null;
  const t = -py / ray[1];
  return { x: px + ray[0] * t, z: pz + ray[2] * t };
}

test("what lies on the floor (its paths, leaves, puddles) reaches every edge of every screen in front of the sets", () => {
  const TV = { top: 0.15, bottom: 0.1, side: 0.04 };
  for (const [aspect, margins] of [[844 / 390, MARGINS], [852 / 393, MARGINS], [932 / 430, MARGINS], [4 / 3, MARGINS], [16 / 9, TV]] as const) {
    const framing = frameFloor(aspect, FLOOR, margins);
    for (let sx = -1; sx <= 1.0001; sx += 0.05) {
      for (let sy = -1; sy <= 1.0001; sy += 0.05) {
        const point = onFloor(framing, aspect, sx, sy);
        // (behind the sets' front, z < the area's back edge, the sets stand: the train, the stage, the stalls, the sea)
        if (!point || point.z < FLOOR_ART_AREA.z0) continue;
        assert.ok(point.z <= FLOOR_ART_AREA.z0 + FLOOR_ART_AREA.depth, `${aspect}: (${sx.toFixed(2)}, ${sy.toFixed(2)}) sees z ${point.z.toFixed(2)}, past the art's front`);
        assert.ok(point.x >= FLOOR_ART_AREA.x0 && point.x <= FLOOR_ART_AREA.x0 + FLOOR_ART_AREA.width, `${aspect}: (${sx.toFixed(2)}, ${sy.toFixed(2)}) sees x ${point.x.toFixed(2)}, past the art's side`);
      }
    }
  }
});
