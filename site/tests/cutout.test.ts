/* Lifting a drawn figure off its flat backdrop (src/account/avatar/cutout.ts). Run with `npx tsx tests/cutout.test.ts` */
import { keyOut } from "../src/account/avatar/cutout";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

type RGB = [number, number, number];
function picture(w: number, h: number, bg: (x: number, y: number) => RGB) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(px, w, x, y, bg(x, y));
  return px;
}
function set(px: Uint8ClampedArray, w: number, x: number, y: number, c: RGB) {
  const i = (y * w + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}
function rect(px: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(px, w, x, y, c);
}
const alpha = (px: Uint8ClampedArray, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3];

const PINK: RGB = [255, 156, 197];
const INK: RGB = [28, 26, 40];
const SKIN: RGB = [250, 220, 190];

// a figure: an outlined body, and an arm that closes a pocket of backdrop against the body
{
  const w = 120;
  const h = 160;
  const px = picture(w, h, () => PINK);
  rect(px, w, 40, 30, 80, 150, INK);
  rect(px, w, 42, 32, 78, 148, SKIN);
  // the arm: an outlined loop beside the body, with backdrop inside it
  rect(px, w, 81, 60, 100, 90, INK);
  rect(px, w, 84, 63, 97, 87, PINK);
  const box = keyOut(px, w, h);
  ok(alpha(px, w, 2, 2) === 0 && alpha(px, w, 117, 157) === 0, "the backdrop at the edges is see-through");
  ok(alpha(px, w, 60, 90) === 255 && alpha(px, w, 40, 100) === 255, "the figure and its outline stay solid");
  ok(alpha(px, w, 90, 75) === 0, "a pocket of backdrop shut inside (between arm and body) is see-through too");
  ok(!!box && box.x0 === 40 && box.x1 === 100 && box.y0 === 30 && box.y1 === 150, `the box is the figure's (${JSON.stringify(box)})`);
}

// a backdrop that isn't quite flat (a gentle vignette): still all backdrop
{
  const w = 100;
  const h = 140;
  const px = picture(w, h, (x, y) => {
    const t = Math.hypot(x - 50, y - 70) / 86;
    return [255 - Math.round(t * 30), 156 - Math.round(t * 22), 197 - Math.round(t * 26)];
  });
  rect(px, w, 35, 30, 65, 120, INK);
  rect(px, w, 37, 32, 63, 118, SKIN);
  keyOut(px, w, h);
  ok(alpha(px, w, 50, 10) === 0 && alpha(px, w, 20, 70) === 0 && alpha(px, w, 1, 1) === 0, "a gentle vignette is still backdrop");
  ok(alpha(px, w, 50, 70) === 255, "the figure stays");
}

// clothes close to the backdrop's colour but not the same, inside the outline: kept
{
  const w = 100;
  const h = 140;
  const px = picture(w, h, () => PINK);
  rect(px, w, 30, 30, 70, 120, INK);
  rect(px, w, 32, 32, 68, 118, [236, 140, 182]);
  keyOut(px, w, h);
  ok(alpha(px, w, 50, 80) === 255, "a pink shirt on a pink backdrop keeps its colour (it's inside the outline, and not flat backdrop)");
}

// a soft edge: an anti-aliased pixel between the backdrop and a light figure turns part
// see-through, and the backdrop's pink is taken back out of its colour (no pink halo)
{
  const w = 60;
  const h = 60;
  const px = picture(w, h, () => PINK);
  rect(px, w, 20, 20, 40, 40, [250, 240, 230]);
  for (let y = 20; y <= 40; y++) set(px, w, 19, y, [252, 198, 213]);
  keyOut(px, w, h);
  const i = (30 * w + 19) * 4;
  ok(px[i + 3] > 40 && px[i + 3] < 230, `the edge pixel is partly see-through (${px[i + 3]})`);
  ok(px[i + 1] > 198, `and its colour moves away from the pink, toward the figure (green ${px[i + 1]})`);
  ok(alpha(px, w, 30, 30) === 255, "the light figure itself stays solid");
}

// nothing but backdrop
{
  const px = picture(20, 20, () => PINK);
  ok(keyOut(px, 20, 20) === null, "a picture that is all backdrop has no figure");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
