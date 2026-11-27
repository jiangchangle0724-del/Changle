/*
 * 林波舞's measuring, in the small (src/party/sensors.ts, src/party/limbo/measure.ts). Run with
 * `npx tsx tests/limbo-measure.test.ts`.
 *  1. eulerOf gives upOf back, beta's half and all: a phone tipped forward past upright stays over 90.
 *  2. The 1€ smoother: a reading held still comes through as it is; a shake rides on it an eighth as
 *     big; a lean of 30° is there within half a second; the smoothed phone leans forward too.
 *  3. At the bar with a little give: reached at the bar, kept to two degrees back up, lost under that;
 *     a tilt the same, either side.
 *  4. The hold fills in the hold's time, drains twice as fast rather than emptying, never past 0 or 1.
 */
import { atBar, atSide, holdAfter, HYST_DEG } from "../src/party/limbo/measure";
import { eulerOf, leanOf, smoother, upOf } from "../src/party/sensors";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// 1. eulerOf is upOf backwards
{
  let worst = 0;
  for (let beta = -175; beta <= 175; beta += 5) {
    for (let gamma = -85; gamma <= 85; gamma += 5) {
      const e = eulerOf(upOf(beta, gamma));
      worst = Math.max(worst, Math.abs(e.beta - beta), Math.abs(e.gamma - gamma));
    }
  }
  ok(worst < 1e-6, `eulerOf(upOf(beta, gamma)) is beta and gamma again, beta from -175 to 175, gamma within ±85 (worst off ${worst.toExponential(1)}°)`);
  const up = eulerOf(upOf(90, 0));
  ok(close(up.beta, 90) && close(up.gamma, 0), "straight up: beta 90, gamma 0");
  ok(close(eulerOf(upOf(100, 0)).beta, 100), "tipped forward past upright: beta stays 100, so the lean reads 0, not 10");
}

// 2. the smoother
{
  const sm = smoother();
  let out = { beta: 0, gamma: 0 };
  for (let i = 0; i < 60; i++) out = sm(50, 0, i / 60);
  ok(close(out.beta, 50, 1e-9) && close(out.gamma, 0, 1e-9), "held still at beta 50: it reads 50 exactly");

  // a shake of ±2° at 8 a second on top of 40°, at 60 readings a second: what comes through
  const shaky = smoother();
  let lo = 90;
  let hi = 0;
  for (let i = 0; i < 240; i++) {
    const t = i / 60;
    const b = 40 + 2 * Math.sin(2 * Math.PI * 8 * t);
    const r = shaky(b, 0, t);
    if (t > 1) {
      lo = Math.min(lo, r.beta);
      hi = Math.max(hi, r.beta);
    }
  }
  const ride = (hi - lo) / 4;
  ok(ride < 0.25, `a ±2° shake at 8 a second comes through ${(ride * 100).toFixed(0)}% as big (under 25%)`);

  // a lean from upright to 30° back, as a step: how long until it reads within 1°
  const step = smoother();
  let at = -1;
  for (let i = 0; i < 120; i++) {
    const t = i / 60;
    const r = step(t < 0.5 ? 90 : 60, 0, t);
    if (t >= 0.5 && at < 0 && leanOf(r.beta) >= 29) at = t - 0.5;
  }
  ok(at >= 0 && at <= 0.5, `a lean to 30° reads 29° or more ${at >= 0 ? (at * 1000).toFixed(0) + " ms" : "never"} after it happens (within half a second)`);

  // the same step at the stand-in sensor's 20 readings a second (scripts/party_test.py)
  const slow = smoother();
  let at20 = -1;
  for (let i = 0; i < 60; i++) {
    const t = i / 20;
    const r = slow(t < 0.5 ? 90 : 60, 0, t);
    if (t >= 0.5 && at20 < 0 && leanOf(r.beta) >= 29) at20 = t - 0.5;
  }
  ok(at20 >= 0 && at20 <= 0.6, `and at 20 a second, ${at20 >= 0 ? (at20 * 1000).toFixed(0) + " ms" : "never"} after (within 0.6 s)`);

  // leaning forward smoothed stays a forward lean
  const fwd = smoother();
  let f = { beta: 0, gamma: 0 };
  for (let i = 0; i < 60; i++) f = fwd(100, 0, i / 60);
  ok(close(f.beta, 100, 1e-6) && leanOf(f.beta) === 0, "a forward lean (beta 100) smoothed is still beta 100: a lean of 0");

  // a sideways tilt near upright, where gamma itself jumps about, comes through steady
  const tilt = smoother();
  let g = { beta: 0, gamma: 0 };
  for (let i = 0; i < 60; i++) g = tilt(70, 20, i / 60);
  ok(close(g.beta, 70, 1e-6) && close(g.gamma, 20, 1e-6), "a tilt held at beta 70, gamma 20 reads just that");
}

// 3. at the bar, with give
{
  ok(!atBar(false, 29.9, 30) && atBar(false, 30, 30), "not at a 30° bar at 29.9°, at it at 30°");
  ok(atBar(true, 30 - HYST_DEG, 30) && !atBar(true, 30 - HYST_DEG - 0.1, 30), `once there, still there ${HYST_DEG}° back up, gone under that`);
  ok(atSide(false, 0, 0) && atSide(true, -40, 0), "a bar that asks for no tilt is always satisfied");
  ok(!atSide(false, 14.9, 15) && atSide(false, 15, 15) && atSide(true, 13, 15) && !atSide(true, 12.9, 15), "tilt right 15: reached at 15, kept to 13, lost under that");
  ok(!atSide(false, -14.9, -15) && atSide(false, -15, -15) && atSide(true, -13, -15) && !atSide(true, -12.9, -15), "tilt left 15: the same the other way");
}

// 4. the hold fills and drains
{
  let h = 0;
  for (let i = 0; i < 24; i++) h = holdAfter(h, true, 50, 1200);
  ok(close(h, 1), "at the bar for 1.2 s at 20 readings a second: the hold is full");
  h = holdAfter(h, true, 50, 1200);
  ok(h === 1, "and stays at 1");
  let d = 0.5;
  d = holdAfter(d, false, 100, 1200);
  ok(close(d, 0.5 - 200 / 1200), "off the bar for 100 ms: the hold drains 200 ms' worth, not to nothing");
  let e = 0.1;
  for (let i = 0; i < 10; i++) e = holdAfter(e, false, 50, 1200);
  ok(e === 0, "and never below 0");
  // a dip of 150 ms in a 1.2 s hold costs 300 ms, not the 1.2 s it used to
  let f = 0;
  let ms = 0;
  while (f < 1 - 1e-9 && ms < 5000) {
    const at = !(ms >= 600 && ms < 750);
    f = holdAfter(f, at, 50, 1200);
    ms += 50;
  }
  ok(ms === 1200 + 150 + 300, `a 150 ms dip in the middle of a hold: through at ${ms} ms (1650)`);
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
