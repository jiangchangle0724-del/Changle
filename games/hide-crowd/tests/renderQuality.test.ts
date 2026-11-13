import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_RENDER_QUALITY,
  observeRenderQuality,
  percentile95,
  pixelRatioForQuality,
  type RenderQualityState
} from "../src/client/renderQuality";

test("P95 frame time ignores invalid samples and picks the upper tail", () => {
  assert.equal(percentile95([10, 11, 12, 13, 100, Number.NaN]), 100);
  assert.equal(percentile95([]), 0);
});

test("render quality drops one tier after two slow windows", () => {
  const first = observeRenderQuality(INITIAL_RENDER_QUALITY, 25);
  assert.equal(first.level, "high");
  assert.equal(first.slowWindows, 1);

  const second = observeRenderQuality(first, 26);
  assert.equal(second.level, "balanced");
  assert.equal(second.slowWindows, 0);
});

test("severe frame stalls enter efficient mode immediately", () => {
  const state = observeRenderQuality(INITIAL_RENDER_QUALITY, 36);
  assert.equal(state.level, "efficient");
  assert.equal(state.slowWindows, 0);
});

test("quality recovers only after five fast windows and never jumps two tiers", () => {
  let state: RenderQualityState = { level: "efficient", slowWindows: 0, fastWindows: 0 };
  for (let index = 0; index < 4; index++) state = observeRenderQuality(state, 16);
  assert.equal(state.level, "efficient");
  state = observeRenderQuality(state, 17);
  assert.equal(state.level, "balanced");
  assert.equal(state.fastWindows, 0);
});

test("pixel density respects device resolution and each quality budget", () => {
  assert.equal(pixelRatioForQuality(3, "high"), 2.25);
  assert.equal(pixelRatioForQuality(3, "efficient"), 1.15);
  assert.equal(pixelRatioForQuality(1.2, "balanced"), 1.2);
  assert.equal(pixelRatioForQuality(0, "high"), 1);
});
