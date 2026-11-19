// The camera's shake (src/client/ui/shake.ts): a blow adds to it and it always ends on its own; a light
// blow barely moves the camera and a heavy one punches; two blows add up but never past the most;
// with reduced motion there is none.
import assert from "node:assert/strict";
import test from "node:test";
import { Shake, SHAKE_REACH, SHAKE_ROLL, TRAUMA, TRAUMA_DRAIN } from "../src/client/ui/shake";

const FRAME = 1000 / 60;
/** how far the camera goes over the shake's life, and how long it lasts (ms) */
function life(amount: number) {
  const shake = new Shake();
  shake.add(amount);
  let most = 0;
  let ms = 0;
  while (shake.left > 0 && ms < 5_000) {
    const jolt = shake.step(FRAME, false);
    most = Math.max(most, Math.abs(jolt.x), Math.abs(jolt.y));
    assert.ok(Math.abs(jolt.x) <= SHAKE_REACH && Math.abs(jolt.y) <= SHAKE_REACH && Math.abs(jolt.roll) <= SHAKE_ROLL);
    ms += FRAME;
  }
  return { most, ms, after: shake.step(FRAME, false) };
}

test("a blow shakes the camera, and the shake always ends on its own", () => {
  const tag = life(TRAUMA.tag);
  assert.ok(tag.most > 0.1, `a tag shakes (${tag.most.toFixed(3)})`);
  assert.ok(tag.ms <= (TRAUMA.tag / TRAUMA_DRAIN) * 1000 + FRAME, `over in ${tag.ms.toFixed(0)} ms`);
  assert.deepEqual(tag.after, { x: 0, y: 0, roll: 0 });
});

test("a light blow barely moves the camera, a heavy one punches", () => {
  const swing = life(TRAUMA.swing);
  const tag = life(TRAUMA.tag);
  assert.ok(tag.most > swing.most * 4, `${tag.most.toFixed(3)} against ${swing.most.toFixed(3)}`);
  assert.equal(life(TRAUMA.hide).most, 0, "blending in shakes nothing");
});

test("two blows close together add up, but never past the most there is", () => {
  const shake = new Shake();
  shake.add(TRAUMA.tag);
  shake.step(30, false);
  shake.add(TRAUMA.bang);
  assert.equal(shake.left, 1);
});

test("with reduced motion there is no shake", () => {
  const shake = new Shake();
  shake.add(TRAUMA.tag);
  assert.deepEqual(shake.step(FRAME, true), { x: 0, y: 0, roll: 0 });
  assert.equal(shake.left, 0);
});
