// What each place's floor has on it beyond its repeating pattern (2026-11-18, the big upgrade: the floor
// filled most of the screen and read as one flat colour). Drawn once on a canvas over the part of the
// floor any screen sees, laid just over the floor and under the rules' marks; nothing on it moves.
// * The seawall: its paved path along the railing (a cycling side and a walking side, as the real one
//   has), a gravel footpath cutting across the lawn to it, grass worn pale where feet go, the cedars'
//   dappled shade, and November's fallen leaves.
// * The transit hall: around the walkways, the way out painted on the floor (in both languages), the
//   yellow guide strip with its bars, steel drain covers and scuffs.
// * The courtyard: a path of big slabs from the gate to the stage, a carved lotus in the middle, moss
//   in the joints by the side galleries, ginkgo leaves, drain grates and the stage's shadow.
// * The night market: puddles from the afternoon's rain holding the stalls' colours and their bulbs,
//   the lot's repairs, its worn arrows and its "slow" (in both languages), oil stains, tyre marks,
//   cracks, a manhole, and the litter of a good night.
// Every mark comes from fixed dice, so every screen has the same floor.
import * as THREE from "three";
import type { ArenaId } from "../../engine";

export interface FloorArtPalette {
  lawn: string;
  lawn2: string;
  lawnLight: string;
  tile: string;
  tile2: string;
  stone: string;
  stone2: string;
  petal: string;
  daisy: string;
  /** the seawall's paving, light and dark; the footpath's gravel; tree shade on the lawn */
  path: string;
  path2: string;
  gravel: string;
  shade: string;
  /** fallen leaves: the seawall's maples, the courtyard's ginkgo */
  leaves: readonly string[];
  ginkgo: string;
  moss: string;
  steel: string;
  /** the transit hall's yellow guide strip */
  tactile: string;
  asphalt: string;
  asphalt2: string;
  dusk: string;
  paint: string;
  bulb: string;
  stalls: readonly string[];
  /** paint on the floors (the white of road markings), and the floors' dark (shadows, stains, joints) */
  white: string;
  dark: string;
  font: string;
}

/** the part of the floor the art covers, in scene units: what any screen sees in front of the sets */
export const FLOOR_ART_AREA = { x0: -14.5, z0: -8.2, width: 29, depth: 13.6 } as const;
const AREA = FLOOR_ART_AREA;
const PX = 60;

/** A fixed sequence of numbers between 0 and 1 (the same floor on every screen). */
function dice(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (value: string, alpha: number) => {
  const color = new THREE.Color(value);
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
};
const mix = (a: string, b: string, amount: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), amount).getHexString();

/** a scene point's place on the canvas */
const cx = (x: number) => (x - AREA.x0) * PX;
const cz = (z: number) => (z - AREA.z0) * PX;

type Draw = CanvasRenderingContext2D;

function bezier(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], t: number): [number, number] {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * d[0], w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * d[1]];
}

/** a soft round patch, fading out at its edge */
function patch(context: Draw, x: number, z: number, rx: number, rz: number, color: string, alpha: number) {
  context.save();
  context.translate(cx(x), cz(z));
  context.scale(1, rz / rx);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx * PX);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.55, rgba(color, alpha * 0.65));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, rx * PX, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/** a soft band (a shadow along the foot of something long), fading out above and below */
function band(context: Draw, x0: number, x1: number, z: number, reach: number, color: string, alpha: number) {
  const gradient = context.createLinearGradient(0, cz(z - reach), 0, cz(z + reach));
  gradient.addColorStop(0, rgba(color, 0));
  gradient.addColorStop(0.5, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(cx(x0), cz(z - reach), (x1 - x0) * PX, 2 * reach * PX);
}

/** a blob with a ragged edge (a puddle, a stain) */
function blob(context: Draw, x: number, z: number, rx: number, rz: number, random: () => number, points = 14) {
  const wobble = Array.from({ length: points }, () => 0.8 + random() * 0.3);
  context.beginPath();
  for (let index = 0; index <= points; index++) {
    const angle = (index / points) * Math.PI * 2;
    const reach = wobble[index % points];
    const px = cx(x + Math.cos(angle) * rx * reach);
    const pz = cz(z + Math.sin(angle) * rz * reach);
    if (index === 0) context.moveTo(px, pz);
    else context.lineTo(px, pz);
  }
  context.closePath();
}

function leaf(context: Draw, x: number, z: number, size: number, turn: number, color: string, kind: "maple" | "ginkgo", dark: string) {
  context.save();
  context.translate(cx(x), cz(z));
  context.rotate(turn);
  context.fillStyle = color;
  context.beginPath();
  if (kind === "ginkgo") {
    // a fan on a short stalk
    context.moveTo(0, 0);
    context.arc(0, 0, size, -Math.PI * 0.86, -Math.PI * 0.14);
    context.closePath();
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, size * 0.16);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, size * 0.55);
    context.stroke();
  } else {
    // a pointed oval, curled a little, with its midrib and stalk
    context.moveTo(-size, 0);
    context.quadraticCurveTo(-size * 0.2, -size * 0.62, size, -size * 0.08);
    context.quadraticCurveTo(-size * 0.1, size * 0.5, -size, 0);
    context.fill();
    context.strokeStyle = rgba(dark, 0.3);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-size * 1.3, size * 0.06);
    context.lineTo(size * 0.8, -size * 0.1);
    context.stroke();
  }
  context.restore();
}

/** a rounded rectangle's path (by hand: older Safari has no roundRect) */
function rounded(context: Draw, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/** a painted pictogram on a path: someone walking, or a bicycle */
function pictogram(context: Draw, x: number, z: number, kind: "walk" | "bike", color: string) {
  context.save();
  context.translate(cx(x), cz(z));
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  const s = PX * 0.24;
  if (kind === "bike") {
    for (const wheel of [-1, 1]) {
      context.beginPath();
      context.arc(wheel * s * 0.95, s * 0.3, s * 0.55, 0, Math.PI * 2);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(-s * 0.95, s * 0.3);
    context.lineTo(-s * 0.2, -s * 0.4);
    context.lineTo(s * 0.6, -s * 0.4);
    context.lineTo(s * 0.95, s * 0.3);
    context.moveTo(-s * 0.2, -s * 0.4);
    context.lineTo(0, s * 0.3);
    context.lineTo(s * 0.6, -s * 0.4);
    context.moveTo(-s * 0.35, -s * 0.62);
    context.lineTo(-s * 0.05, -s * 0.62);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(0, -s * 0.85, s * 0.2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(0, -s * 0.55);
    context.lineTo(-s * 0.08, s * 0.12);
    context.lineTo(-s * 0.42, s * 0.78);
    context.moveTo(-s * 0.08, s * 0.12);
    context.lineTo(s * 0.32, s * 0.78);
    context.moveTo(-s * 0.04, -s * 0.36);
    context.lineTo(s * 0.38, -s * 0.06);
    context.moveTo(-s * 0.04, -s * 0.36);
    context.lineTo(-s * 0.42, -0.02 * s);
    context.stroke();
  }
  context.restore();
}

function seawall(context: Draw, palette: FloorArtPalette, random: () => number) {
  const left = AREA.x0;
  const right = AREA.x0 + AREA.width;
  // the lawn isn't one green: lusher here, thinner there, in big soft patches
  for (let index = 0; index < 14; index++) {
    const lush = random() < 0.5;
    patch(context, -11 + random() * 22, -4.6 + random() * 9.6, 1.6 + random() * 2.2, 0.9 + random() * 1.2, lush ? palette.lawn2 : palette.lawnLight, 0.14 + random() * 0.1);
  }
  // the cedars' shade, dappled, at both sides
  for (const side of [-1, 1]) {
    for (let index = 0; index < 16; index++) {
      patch(context, side * (10.4 + random() * 3.4), -3.6 + random() * 8.4, 0.5 + random() * 0.9, 0.35 + random() * 0.6, palette.shade, 0.16 + random() * 0.12);
    }
  }
  // a gravel footpath across the lawn, from the bottom left up to the seawall's path
  const curve = [
    [left - 0.5, 2.9],
    [-6.5, 3.6],
    [-2.8, -1.2],
    [1.4, -3.4],
    [3.4, -4.5],
    [5.4, -5.2],
    [6.4, -6.4]
  ] as const;
  const footpath = new Path2D();
  footpath.moveTo(cx(curve[0][0]), cz(curve[0][1]));
  footpath.bezierCurveTo(cx(curve[1][0]), cz(curve[1][1]), cx(curve[2][0]), cz(curve[2][1]), cx(curve[3][0]), cz(curve[3][1]));
  footpath.bezierCurveTo(cx(curve[4][0]), cz(curve[4][1]), cx(curve[5][0]), cz(curve[5][1]), cx(curve[6][0]), cz(curve[6][1]));
  context.lineCap = "round";
  context.lineJoin = "round";
  // (the grass trodden pale along its edges, its rim, then the gravel)
  context.strokeStyle = rgba(palette.lawnLight, 0.45);
  context.lineWidth = PX * 1.35;
  context.stroke(footpath);
  context.strokeStyle = mix(palette.gravel, palette.lawn2, 0.35);
  context.lineWidth = PX * 0.98;
  context.stroke(footpath);
  context.strokeStyle = palette.gravel;
  context.lineWidth = PX * 0.84;
  context.stroke(footpath);
  for (let speck = 0; speck < 3_200; speck++) {
    const t = random();
    const [x, z] = t < 0.7 ? bezier(curve[0], curve[1], curve[2], curve[3], t / 0.7) : bezier(curve[3], curve[4], curve[5], curve[6], (t - 0.7) / 0.3);
    const off = (random() - 0.5) * 0.74;
    context.fillStyle = random() < 0.5 ? rgba(palette.path2, 0.8) : rgba(palette.daisy, 0.7);
    const grain = 2 + random() * 2.5;
    context.fillRect(cx(x + off * 0.55), cz(z + off * 0.55), grain, grain);
  }
  // the benches' and the planters' shadows on the grass
  for (const side of [-1, 1]) {
    patch(context, side * 10.0, -0.3, 1.05, 0.38, palette.dark, 0.3);
    patch(context, side * 9.95, 2.05, 0.85, 0.55, palette.dark, 0.28);
  }
  // grass worn pale where people cut the corner, and in front of the benches
  patch(context, 2.0, -4.4, 1.6, 0.8, palette.lawnLight, 0.5);
  patch(context, -6.9, 3.4, 1.3, 0.6, palette.lawnLight, 0.42);
  for (const side of [-1, 1]) patch(context, side * 9.7, 0.55, 1.4, 0.55, palette.gravel, 0.32);
  // the seawall's path, along the railing: paving with a cycling side and a walking side
  const top = -7.6;
  const bottom = -6.0;
  const middle = (top + bottom) / 2;
  context.fillStyle = mix(palette.path2, palette.dark, 0.25);
  context.fillRect(cx(left), cz(top), AREA.width * PX, (bottom - top) * PX);
  const rows = 5;
  const rowDepth = ((bottom - top) * PX) / rows;
  for (let row = 0; row < rows; row++) {
    let x = -(row % 2) * 30;
    while (x < AREA.width * PX) {
      const width = 54 + Math.floor(random() * 3) * 10;
      context.fillStyle = mix(palette.path, palette.path2, random() * 0.55);
      context.fillRect(x + 2, cz(top) + row * rowDepth + 2, width - 4, rowDepth - 4);
      x += width;
    }
  }
  // the kerb where the path meets the lawn, and its shadow on the grass
  context.fillStyle = mix(palette.path, palette.white, 0.35);
  context.fillRect(cx(left), cz(bottom) - 7, AREA.width * PX, 7);
  band(context, left, right, bottom + 0.06, 0.12, palette.dark, 0.25);
  // the line between the two sides, the pictograms on each
  context.fillStyle = rgba(palette.white, 0.9);
  for (let x = 0; x < AREA.width * PX; x += 70) context.fillRect(x, cz(middle) - 3, 40, 6);
  for (let x = left + 1.6; x < right; x += 6.2) {
    pictogram(context, x, (top + middle) / 2, "bike", rgba(palette.white, 0.85));
    pictogram(context, x + 3.1, (middle + bottom) / 2, "walk", rgba(palette.white, 0.85));
  }
  // November: fallen leaves, most of them under the cedars, a few blown onto the path
  for (let index = 0; index < 240; index++) {
    const roll = random();
    const x = roll < 0.78 ? (random() < 0.5 ? -1 : 1) * (9.2 + Math.sqrt(random()) * 5.3) : left + random() * AREA.width;
    const z = roll < 0.92 ? -4.6 + random() * 9.6 : top + random() * (bottom - top);
    leaf(context, x, z, 7 + random() * 4, random() * Math.PI * 2, palette.leaves[Math.floor(random() * palette.leaves.length)], "maple", palette.dark);
  }
}

function transit(context: Draw, palette: FloorArtPalette, random: () => number) {
  const left = AREA.x0;
  const right = AREA.x0 + AREA.width;
  // the yellow guide strip with its bars, along the front of the hall
  const strip = { top: 4.7, bottom: 5.15 };
  context.fillStyle = palette.tactile;
  context.fillRect(cx(left), cz(strip.top), AREA.width * PX, (strip.bottom - strip.top) * PX);
  context.fillStyle = mix(palette.tactile, palette.dark, 0.2);
  for (let x = cx(left) + 6; x < cx(right); x += 16) context.fillRect(x, cz(strip.top) + 5, 7, (strip.bottom - strip.top) * PX - 10);
  // the way out, painted on the floor at both sides, in both languages, with arrows outward
  context.textBaseline = "middle";
  context.textAlign = "center";
  for (const side of [-1, 1]) {
    // (between the walkways' ends and the screen's edge, on a dark decal so it reads on the pale tiles)
    const x = side * 10.85;
    context.fillStyle = mix(palette.steel, palette.dark, 0.72);
    rounded(context, cx(x - 0.8), cz(-1.55), 1.6 * PX, 3.1 * PX, 0.18 * PX);
    context.fill();
    for (const [z, words, size] of [
      [-1.0, "出口", 0.62],
      [-0.2, "EXIT", 0.5]
    ] as const) {
      context.font = `800 ${Math.round(PX * size)}px ${palette.font}`;
      context.fillStyle = palette.white;
      context.fillText(words, cx(x), cz(z));
    }
    // an arrow pointing out of the hall
    context.save();
    context.translate(cx(x), cz(0.85));
    context.scale(side * 0.8, 0.8);
    context.fillStyle = palette.tactile;
    context.beginPath();
    context.moveTo(PX * 0.85, 0);
    context.lineTo(PX * 0.2, -PX * 0.5);
    context.lineTo(PX * 0.2, -PX * 0.2);
    context.lineTo(-PX * 0.8, -PX * 0.2);
    context.lineTo(-PX * 0.8, PX * 0.2);
    context.lineTo(PX * 0.2, PX * 0.2);
    context.lineTo(PX * 0.2, PX * 0.5);
    context.closePath();
    context.fill();
    context.restore();
  }
  // steel drain covers, and scuffs where people stand waiting
  for (const [x, z] of [
    [-11.2, 3.2],
    [11.2, 3.2],
    [-11.2, -3.4],
    [11.2, -3.4]
  ] as const) {
    context.fillStyle = mix(palette.steel, palette.dark, 0.25);
    context.fillRect(cx(x) - 36, cz(z) - 14, 72, 28);
    context.fillStyle = palette.steel;
    context.fillRect(cx(x) - 33, cz(z) - 11, 66, 22);
    context.fillStyle = mix(palette.steel, palette.dark, 0.5);
    for (let slot = -27; slot <= 27; slot += 6) context.fillRect(cx(x) + slot - 1, cz(z) - 8, 2, 16);
  }
  for (let index = 0; index < 90; index++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (10 + random() * 4.4);
    const z = -4.6 + random() * 9.6;
    context.strokeStyle = rgba(palette.dark, 0.06 + random() * 0.08);
    context.lineWidth = 2 + random() * 3;
    context.beginPath();
    context.moveTo(cx(x), cz(z));
    context.quadraticCurveTo(cx(x + 0.25), cz(z + (random() - 0.5) * 0.2), cx(x + 0.4 + random() * 0.5), cz(z + (random() - 0.5) * 0.15));
    context.stroke();
  }
}

function courtyard(context: Draw, palette: FloorArtPalette, random: () => number) {
  const stageFront = -5.25;
  // the stage's shadow on the courtyard
  band(context, -10.6, 10.6, stageFront + 0.12, 0.5, palette.dark, 0.32);
  // the stone blocks' shadows by the side galleries
  for (const side of [-1, 1]) patch(context, side * 10.1, -1.0, 0.85, 0.6, palette.dark, 0.3);
  // a path of big slabs from the gate (the bottom) to the stage
  const half = 1.3;
  for (let z = AREA.z0 + AREA.depth; z > stageFront; z -= 0.96) {
    const top = Math.max(stageFront, z - 0.92);
    const fill = mix(palette.stone, palette.daisy, 0.12 + random() * 0.22);
    context.fillStyle = mix(palette.stone2, palette.dark, 0.18);
    context.fillRect(cx(-half) - 3, cz(top) - 3, 2 * half * PX + 6, (z - top) * PX + 6);
    context.fillStyle = fill;
    context.fillRect(cx(-half) + 2, cz(top) + 2, 2 * half * PX - 4, (z - top) * PX - 4);
    // worn smooth in the middle, where feet go
    context.fillStyle = rgba(palette.daisy, 0.16);
    context.fillRect(cx(-half * 0.45), cz(top) + 6, half * 0.9 * PX, (z - top) * PX - 12);
  }
  // a carved lotus in the middle: rings, eight petals, a seed head
  const middle = { x: 0, z: 0.15 };
  const rings: Array<[number, string]> = [
    [2.5, mix(palette.stone2, palette.dark, 0.22)],
    [2.38, mix(palette.stone, palette.daisy, 0.3)],
    [1.98, mix(palette.stone2, palette.dark, 0.12)],
    [1.86, mix(palette.stone, palette.daisy, 0.16)]
  ];
  for (const [radius, color] of rings) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx(middle.x), cz(middle.z), radius * PX, 0, Math.PI * 2);
    context.fill();
  }
  for (const [count, reach, width, length, color] of [
    [8, 1.08, 0.36, 0.7, mix(palette.stone2, palette.petal, 0.2)],
    [8, 0.78, 0.26, 0.48, mix(palette.stone, palette.petal, 0.28)]
  ] as const) {
    for (let petal = 0; petal < count; petal++) {
      context.save();
      context.translate(cx(middle.x), cz(middle.z));
      context.rotate((petal / count) * Math.PI * 2 + (reach < 1 ? Math.PI / count : 0));
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(0, -reach * PX, width * PX, length * PX, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = rgba(palette.dark, 0.18);
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    }
  }
  context.fillStyle = mix(palette.stone2, palette.dark, 0.1);
  context.beginPath();
  context.arc(cx(middle.x), cz(middle.z), 0.42 * PX, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = mix(palette.stone, palette.ginkgo, 0.25);
  for (let seed = 0; seed < 7; seed++) {
    const angle = (seed / 7) * Math.PI * 2;
    const reach = seed === 0 ? 0 : 0.22;
    context.beginPath();
    context.arc(cx(middle.x + Math.cos(angle) * reach), cz(middle.z + Math.sin(angle) * reach), 0.07 * PX, 0, Math.PI * 2);
    context.fill();
  }
  // drain grates along the side galleries
  for (const side of [-1, 1]) {
    const x = side * 9.15;
    context.fillStyle = mix(palette.stone2, palette.dark, 0.5);
    context.fillRect(cx(x) - 10, cz(-4.8), 20, 9.9 * PX);
    context.fillStyle = mix(palette.stone2, palette.dark, 0.2);
    for (let z = cz(-4.8) + 4; z < cz(5.1) - 4; z += 10) context.fillRect(cx(x) - 7, z, 14, 4);
  }
  // moss by the side galleries, where the sun reaches least: soft patches, and sprigs in the joints
  for (let index = 0; index < 26; index++) {
    const side = random() < 0.5 ? -1 : 1;
    patch(context, side * (10 + random() * 4.2), -4.6 + random() * 9.6, 0.5 + random() * 0.8, 0.25 + random() * 0.35, palette.moss, 0.16 + random() * 0.14);
  }
  for (let index = 0; index < 140; index++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (9.8 + random() * 4.6);
    // (along the flagstones' rows: one every 1.5 units)
    const z = -4 + 1.5 * Math.floor(random() * 7) + (random() - 0.5) * 0.04;
    context.strokeStyle = rgba(palette.moss, 0.35 + random() * 0.3);
    context.lineWidth = 2 + random() * 2;
    context.beginPath();
    context.moveTo(cx(x), cz(z));
    context.lineTo(cx(x + 0.2 + random() * 0.5), cz(z));
    context.stroke();
  }
  // ginkgo leaves, gathered by the galleries and the stage, a few blown across
  for (let index = 0; index < 200; index++) {
    const roll = random();
    const x = roll < 0.55 ? (random() < 0.5 ? -1 : 1) * (8.2 + random() * 6) : -9 + random() * 18;
    const z = roll < 0.55 ? -4.9 + random() * 10 : roll < 0.75 ? stageFront + random() * 0.8 : -4.5 + random() * 9.5;
    leaf(context, x, z, 7 + random() * 4, random() * Math.PI * 2, random() < 0.8 ? palette.ginkgo : mix(palette.ginkgo, palette.stone2, 0.5), "ginkgo", palette.dark);
  }
}

function nightMarket(context: Draw, palette: FloorArtPalette, random: () => number) {
  const stallX = [-5.25, -1.75, 1.75, 5.25];
  // the stalls' and the tables' shadows
  band(context, -6.9, 6.9, -4.05, 0.3, palette.dark, 0.35);
  for (const side of [-1, 1]) {
    for (const z of [-2.1, 1.3]) patch(context, side * 10.4, z, 1.3, 0.85, palette.dark, 0.32);
  }
  // the lot's repairs: patches of newer asphalt, sealed at their seams
  for (const [x, z, width, depth] of [
    [-5.4, 3.5, 2.4, 1.3],
    [6.3, -1.9, 2.0, 1.6],
    [1.4, 3.2, 1.6, 1.0]
  ] as const) {
    context.fillStyle = rgba(palette.dark, 0.2);
    context.fillRect(cx(x - width / 2), cz(z - depth / 2), width * PX, depth * PX);
    context.strokeStyle = rgba(palette.dark, 0.38);
    context.lineWidth = 3;
    context.strokeRect(cx(x - width / 2), cz(z - depth / 2), width * PX, depth * PX);
  }
  // the lot's traffic arrows and its "slow", worn by the day's cars
  for (const [x, z, way] of [
    [-9.7, 0.6, -1],
    [9.6, 1.4, 1]
  ] as const) {
    context.save();
    context.translate(cx(x), cz(z));
    context.scale(1, way);
    context.fillStyle = rgba(palette.white, 0.32);
    context.beginPath();
    context.moveTo(0, -0.95 * PX);
    context.lineTo(0.42 * PX, -0.4 * PX);
    context.lineTo(0.15 * PX, -0.4 * PX);
    context.lineTo(0.15 * PX, 0.8 * PX);
    context.lineTo(-0.15 * PX, 0.8 * PX);
    context.lineTo(-0.15 * PX, -0.4 * PX);
    context.lineTo(-0.42 * PX, -0.4 * PX);
    context.closePath();
    context.fill();
    context.restore();
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${Math.round(PX * 0.62)}px ${palette.font}`;
  context.fillStyle = rgba(palette.white, 0.3);
  context.fillText("慢  SLOW", cx(-4.4), cz(4.3));
  // oil stains where the cars stood all day
  for (let index = 0; index < 22; index++) {
    context.fillStyle = rgba(palette.dark, 0.14 + random() * 0.12);
    blob(context, -12 + random() * 24, -3 + random() * 8, 0.25 + random() * 0.6, 0.15 + random() * 0.32, random, 11);
    context.fill();
  }
  // tyre marks, curving
  context.lineCap = "round";
  for (let index = 0; index < 8; index++) {
    const x = -12 + random() * 20;
    const z = -1 + random() * 5.5;
    context.strokeStyle = rgba(palette.dark, 0.12);
    context.lineWidth = 0.2 * PX;
    for (const offset of [-0.4, 0.4]) {
      context.beginPath();
      context.moveTo(cx(x + offset), cz(z));
      context.bezierCurveTo(cx(x + offset + 1), cz(z - 0.6), cx(x + offset + 2.2), cz(z - 0.2), cx(x + offset + 3.4), cz(z + 0.5));
      context.stroke();
    }
  }
  // cracks, and their dark seams
  for (let index = 0; index < 22; index++) {
    let x = -13 + random() * 26;
    let z = -4 + random() * 9;
    context.strokeStyle = rgba(palette.dark, 0.7);
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(cx(x), cz(z));
    for (let step = 0; step < 7; step++) {
      x += (random() - 0.4) * 0.42;
      z += (random() - 0.5) * 0.32;
      context.lineTo(cx(x), cz(z));
    }
    context.stroke();
  }
  // a manhole
  const hole = { x: -7.3, z: 3.4 };
  context.fillStyle = mix(palette.asphalt, palette.dark, 0.35);
  context.beginPath();
  context.arc(cx(hole.x), cz(hole.z), 0.46 * PX, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = mix(palette.asphalt2, palette.paint, 0.12);
  context.lineWidth = 3;
  for (let ring = 0.12; ring < 0.44; ring += 0.08) {
    context.beginPath();
    context.arc(cx(hole.x), cz(hole.z), ring * PX, 0, Math.PI * 2);
    context.stroke();
  }
  // puddles from the afternoon's rain: dark water with the dusk in it, the stalls' colours glowing in
  // it and a few of their bulbs, each puddle two or three lobes run together
  const puddles: Array<[number, number, number, number]> = [
    [-3.3, 1.3, 1.0, 0.5],
    [3.9, 2.5, 0.85, 0.42],
    [-7.6, -1.2, 0.75, 0.38],
    [0.7, -2.0, 0.65, 0.34],
    [7.8, -0.4, 0.8, 0.4],
    [-0.9, 4.1, 0.9, 0.42],
    [10.6, 3.4, 0.6, 0.3]
  ];
  for (const [x, z, rx, rz] of puddles) {
    const shape = dice(Math.round((x + 20) * 1000 + z * 10));
    const lobes: Array<[number, number, number, number]> = [[x, z, rx, rz]];
    for (let lobe = 0; lobe < 2; lobe++) {
      lobes.push([x + (shape() - 0.5) * rx * 1.3, z + (shape() - 0.5) * rz * 0.9, rx * (0.45 + shape() * 0.3), rz * (0.6 + shape() * 0.4)]);
    }
    const outline = (grow: number) => {
      const path = new Path2D();
      for (const [lx, lz, lrx, lrz] of lobes) path.ellipse(cx(lx), cz(lz), lrx * grow * PX, lrz * grow * PX, 0, 0, Math.PI * 2);
      return path;
    };
    // (its wet rim first, soft, then the water)
    context.fillStyle = rgba(palette.dark, 0.18);
    context.fill(outline(1.28));
    context.fillStyle = rgba(palette.dark, 0.3);
    context.fill(outline(1.12));
    const water = outline(1);
    const deep = context.createLinearGradient(0, cz(z - rz * 1.2), 0, cz(z + rz * 1.2));
    // (darker than the dry asphalt: still water at night, with only the dusk's blue in it)
    deep.addColorStop(0, mix(palette.dusk, palette.dark, 0.6));
    deep.addColorStop(1, mix(palette.asphalt, palette.dark, 0.72));
    context.fillStyle = deep;
    context.fill(water);
    context.save();
    context.clip(water);
    // the stalls' colours: soft glows, stretched toward the viewer
    stallX.forEach((sx, index) => {
      const reach = Math.abs(sx - x);
      if (reach > 5.5) return;
      const gx = cx(x + (sx - x) * 0.3);
      const gz = cz(z - rz * 0.2);
      context.save();
      context.translate(gx, gz);
      context.scale(0.3, 1);
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, rz * 1.5 * PX);
      glow.addColorStop(0, rgba(palette.stalls[index], 0.8 * (1 - reach / 5.5)));
      glow.addColorStop(0.5, rgba(palette.stalls[index], 0.35 * (1 - reach / 5.5)));
      glow.addColorStop(1, rgba(palette.stalls[index], 0));
      context.fillStyle = glow;
      context.fillRect(-rz * 1.5 * PX, -rz * 1.5 * PX, rz * 3 * PX, rz * 3 * PX);
      context.restore();
    });
    // a few of the bulbs
    const bulbs = 2 + Math.floor(shape() * 3);
    for (let bulb = 0; bulb < bulbs; bulb++) {
      const bx = cx(x + (shape() - 0.5) * rx * 1.4);
      const bz = cz(z - rz * (0.15 + shape() * 0.5));
      const spark = context.createRadialGradient(bx, bz, 0, bx, bz, 7);
      spark.addColorStop(0, rgba(palette.bulb, 1));
      spark.addColorStop(0.3, rgba(palette.bulb, 0.75));
      spark.addColorStop(1, rgba(palette.bulb, 0));
      context.fillStyle = spark;
      context.fillRect(bx - 7, bz - 7, 14, 14);
    }
    context.restore();
    // the far rim catching the light
    context.save();
    context.beginPath();
    context.rect(cx(x - rx * 2), cz(z - rz * 2), rx * 4 * PX, rz * 1.6 * PX);
    context.clip();
    context.strokeStyle = rgba(palette.paint, 0.12);
    context.lineWidth = 1.5;
    context.stroke(water);
    context.restore();
  }
  // the litter of a good night near the stalls: napkins, skewers, a dropped cup
  for (let index = 0; index < 34; index++) {
    const stall = stallX[Math.floor(random() * 4)];
    const x = stall + (random() - 0.5) * 3.2;
    const z = -3.4 + random() * 2.6;
    const kind = random();
    context.save();
    context.translate(cx(x), cz(z));
    context.rotate(random() * Math.PI);
    if (kind < 0.35) {
      // a crumpled napkin
      context.fillStyle = rgba(palette.white, 0.7);
      // (round the canvas origin: the context has been moved to the napkin)
      blob(context, AREA.x0, AREA.z0, 0.07, 0.06, random, 7);
      context.fill();
    } else if (kind < 0.85) {
      context.strokeStyle = rgba(palette.gravel, 0.85);
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-10, 0);
      context.lineTo(10, 0);
      context.stroke();
    } else {
      context.fillStyle = rgba(palette.stalls[Math.floor(random() * 4)], 0.85);
      context.beginPath();
      context.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = rgba(palette.white, 0.7);
      context.beginPath();
      context.arc(6, 0, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}

export interface FloorArt {
  dispose(): void;
}

/** Lay the place's floor art over its floor (just above it; the rules' marks draw over it). */
export function addFloorArt(scene: THREE.Scene, arena: ArenaId, palette: FloorArtPalette, maxAnisotropy: number): FloorArt {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(AREA.width * PX);
  canvas.height = Math.round(AREA.depth * PX);
  const context = canvas.getContext("2d");
  if (context) {
    const random = dice(arena === "plaza" ? 101 : arena === "metro" ? 203 : arena === "gallery" ? 307 : 409);
    if (arena === "plaza") seawall(context, palette, random);
    else if (arena === "metro") transit(context, palette, random);
    else if (arena === "gallery") courtyard(context, palette, random);
    else nightMarket(context, palette, random);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const geometry = new THREE.PlaneGeometry(AREA.width, AREA.depth);
  // (as rough as the floors: a shine from the key light would grey the puddles and the paint)
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.92, metalness: 0, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "floor art";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(AREA.x0 + AREA.width / 2, 0.004, AREA.z0 + AREA.depth / 2);
  // (first of everything see-through: the shadows and the rules' marks go over it)
  mesh.renderOrder = -2;
  scene.add(mesh);
  return {
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  };
}
