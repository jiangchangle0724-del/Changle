import test from "node:test";
import assert from "node:assert/strict";
import { spriteBatchIndex, spriteDirectionRow, spritePoseColumn } from "../src/client/spriteAtlas";

test("sprite orientation chooses front, right, back, and left atlas rows", () => {
  assert.equal(spriteDirectionRow(0), 0);
  assert.equal(spriteDirectionRow(Math.PI / 2), 1);
  assert.equal(spriteDirectionRow(Math.PI), 2);
  assert.equal(spriteDirectionRow(-Math.PI / 2), 3);
  assert.equal(spriteDirectionRow(Number.NaN), 0);
});

test("sprite pose picks idle, alternating walk, and punch frames", () => {
  assert.equal(spritePoseColumn("idle", 0, 0.5), 0);
  assert.equal(spritePoseColumn("walk", 0.8, 0.5), 1);
  assert.equal(spritePoseColumn("walk", 0.8, 3.5), 2);
  assert.equal(spritePoseColumn("windup", 0.8, 0.5), 0);
  assert.equal(spritePoseColumn("stunned", 0.8, 0.5), 0);
  assert.equal(spritePoseColumn("punch", 0, 0), 3);
});

test("sprite atlas batches remain distinct across archetype, direction, and frame", () => {
  assert.equal(spriteBatchIndex(0, 0, 0), 0);
  assert.equal(spriteBatchIndex(0, 1, 0), 4);
  assert.equal(spriteBatchIndex(1, 0, 0), 16);
  assert.equal(spriteBatchIndex(2, 3, 3), 47);
  assert.equal(spriteBatchIndex(3, 4, 4), 0);
});
