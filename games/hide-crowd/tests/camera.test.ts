import assert from "node:assert/strict";
import test from "node:test";
import { verticalFovForWidth } from "../src/client/camera";

test("perspective camera keeps the arena horizontal span at common screen ratios", () => {
  const width = 24.5;
  const distance = 25.5;
  for (const aspect of [1.55, 1.72, 1.9, 2.2]) {
    const fov = verticalFovForWidth(width, aspect, distance) * Math.PI / 180;
    const visibleWidth = 2 * distance * Math.tan(fov / 2) * aspect;
    assert.ok(Math.abs(visibleWidth - width) < 1e-9);
  }
});

test("perspective framing returns safe finite values for invalid browser dimensions", () => {
  assert.ok(Number.isFinite(verticalFovForWidth(24.5, 0, 25.5)));
  assert.ok(Number.isFinite(verticalFovForWidth(Number.NaN, 1.72, 25.5)));
  assert.ok(Number.isFinite(verticalFovForWidth(24.5, 1.72, Number.POSITIVE_INFINITY)));
});
