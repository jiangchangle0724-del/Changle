/**
 * The two performers on Name That Tune's stage: drawn in SVG with real joints (shoulder, elbow, wrist,
 * hip, knee, ankle), posed by aiming hands and feet at points and letting a two-bone solver bend the
 * limbs, with a face that blinks, winks, smiles, sings and cries.
 *
 * A Performer owns one <svg>. Moves tween `pose` and `face` (plain numbers); `render()` turns them into
 * transforms once a frame. Nothing here knows about songs or beats: lib moves.ts decides what to do.
 */
import { gsap } from "../../lib/anim";

export type Kind = "m" | "f";

/* ------------------------------------------------------------------ geometry */

// Avatar space: 200 x 300, ground at y = 292, the pelvis at (100, 206).
export const PELVIS = { x: 100, y: 206 };
const NECK = { x: 100, y: 144 };
const THIGH = 38, SHIN = 36;
const ANKLE_Y = 280;

type Look = {
  skin: string; skinShade: string; hair: string; hairHi: string; hairShade: string;
  cloth: string; clothShade: string; clothHi: string; trim: string; legs: string; legsShade: string;
  shoe: string; shoeSole: string; iris: string; irisDeep: string; lip: string; brow: string;
  shoulderX: number; upper: number; fore: number; hip: number;
};
const LOOKS: Record<Kind, Look> = {
  m: {
    skin: "#f3c9a6", skinShade: "#dda283", hair: "#241c3d", hairHi: "#5a4c8c", hairShade: "#140f26",
    cloth: "#2e9cff", clothShade: "#1f5fd0", clothHi: "#8ad8ff", trim: "#e9f6ff", legs: "#2a3566", legsShade: "#1a2148",
    shoe: "#f4f6ff", shoeSole: "#31b9ff", iris: "#4a7cf0", irisDeep: "#18245e", lip: "#b04a5e", brow: "#241c3d",
    shoulderX: 27, upper: 30, fore: 28, hip: 10,
  },
  f: {
    skin: "#f9d6bd", skinShade: "#e8b095", hair: "#4b2342", hairHi: "#9a5584", hairShade: "#2c1027",
    cloth: "#ff5fa2", clothShade: "#d63f83", clothHi: "#ffb3d2", trim: "#ffffff", legs: "#f9d6bd", legsShade: "#e8b095",
    shoe: "#c2345f", shoeSole: "#7a1a3a", iris: "#b9579a", irisDeep: "#4d1640", lip: "#d2506f", brow: "#4b2342",
    shoulderX: 23, upper: 29, fore: 27, hip: 9,
  },
};

/* ------------------------------------------------------------------ state */

/** Where the body is. Hands are in the torso's own space (they ride along when it leans and bounces);
 *  feet are on the floor. */
export type Pose = {
  px: number; py: number; lean: number; spin: number;
  headTilt: number; headNod: number; headTurn: number;
  hLx: number; hLy: number; hRx: number; hRy: number; wristL: number; wristR: number;
  fLx: number; fLy: number; fRx: number; fRy: number;
};
export type Face = {
  /** 0 open .. 1 shut, each eye */
  lidL: number; lidR: number;
  /** -1 down .. 1 up */
  brow: number;
  /** 0 .. 1: inner ends up (worry, sorrow) */
  browSad: number;
  /** -1 frown .. 1 grin */
  smile: number;
  /** 0 shut .. 1 wide; set every frame while singing */
  open: number;
  /** 0.8 narrow ("oo") .. 1.3 wide ("ah") */
  wide: number;
  blush: number;
  /** ^ ^ eyes */
  happy: number;
  /** where the irises look: -1 left .. 1 right */
  gaze: number;
};

export function restPose(kind: Kind): Pose {
  const L = LOOKS[kind];
  return {
    px: 0, py: 0, lean: 0, spin: 1, headTilt: 0, headNod: 0, headTurn: 0,
    hLx: PELVIS.x - L.shoulderX - 3, hLy: 200, hRx: PELVIS.x + L.shoulderX + 3, hRy: 200, wristL: 0, wristR: 0,
    fLx: PELVIS.x - L.hip - 1, fLy: ANKLE_Y, fRx: PELVIS.x + L.hip + 1, fRy: ANKLE_Y,
  };
}
export function restFace(): Face {
  return { lidL: 0, lidR: 0, brow: 0, browSad: 0, smile: 0.35, open: 0, wide: 1, blush: 0.25, happy: 0, gaze: 0 };
}

/* ------------------------------------------------------------------ the two-bone solver */

const DEG = 180 / Math.PI;
/** Aim a two-bone limb from (sx, sy) at (tx, ty). `out` picks the bend: the elbow/knee goes the way that
 *  scores higher. Returns both bones' directions (radians, 0 = +x, y down). */
function solve(sx: number, sy: number, tx: number, ty: number, a: number, b: number, out: (x: number, y: number) => number) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  if (d < 1e-4) {
    dx = 0; dy = 1; d = 1e-4;
  }
  const dc = Math.min(a + b - 0.05, Math.max(Math.abs(a - b) + 0.05, d));
  const ux = dx / d, uy = dy / d;
  const A = Math.acos(Math.max(-1, Math.min(1, (a * a + dc * dc - b * b) / (2 * a * dc))));
  const base = Math.atan2(uy, ux);
  const e1x = sx + a * Math.cos(base + A), e1y = sy + a * Math.sin(base + A);
  const e2x = sx + a * Math.cos(base - A), e2y = sy + a * Math.sin(base - A);
  const [ex, ey] = out(e1x, e1y) >= out(e2x, e2y) ? [e1x, e1y] : [e2x, e2y];
  const hx = sx + ux * dc, hy = sy + uy * dc;
  return { a1: Math.atan2(ey - sy, ex - sx), a2: Math.atan2(hy - ey, hx - ex) };
}
/** A bone drawn pointing down (+y) turned to direction `ang`. */
const boneRot = (ang: number) => ang * DEG - 90;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

/* ------------------------------------------------------------------ the drawing */

/*
 * THE DRAWING CONTRACT. markup() may be redrawn freely (more detail, better shapes, other
 * clothes) as long as these stay true, because render() and moves.ts drive the parts by name:
 *
 * - Avatar space is 200 x 300, the floor at y = 292; the stage shows viewBox "44 10 112 286"
 *   (arms and hair may reach outside it). The pelvis is at (100, 206), the neck at (100, 144),
 *   the shoulders at (100 -/+ shoulderX, 149).
 * - Limbs are nested groups, each bone drawn pointing straight DOWN (+y) from its own joint at
 *   (0, 0): legL/R > thighL/R (knee at y = THIGH) > shinL/R (ankle at y = SHIN) > footL/R (toe
 *   pointing outward: -x on L, +x on R, sole near y = +12). armL/R > upperL/R (elbow at y = upper)
 *   > foreL/R (wrist at y = fore) > handL/R (fingers toward +y, thumb toward the body). Joints are
 *   round so a bent limb has no gaps. Nothing is held: no microphone, nothing in the hands.
 * - The head is drawn around the neck at (0, 0): the face spans about x -41..41, y -111..-14.
 *   Eyes are centred at (-15, -56) and (15, -56) with radii rx 9 / ry 10.6 (him) and 9.6 / 11.4
 *   (her); the eye clip paths (#id-eyeL/R) use exactly those. The brows sit around y -72 and turn
 *   about their inner ends (-8, -72) and (8, -72). The mouth is centred at (0, -31), about 6.5 wide
 *   each side; its paths (mfill, mline, mclip), the teeth (rect, y set by code) and tongue
 *   (ellipse, cy and rx set by code) are reshaped every frame.
 * - Elements the code moves get their `transform` (or `d`, `opacity`, `display`) set every frame,
 *   so they must not carry a transform of their own (wrap the drawing inside them instead):
 *   root, torso, head, headIn, headBack, tail (her ponytail, pivot at its translate), skirt (her
 *   skirt, pivot 100,186), feat, hairFront, the bones above, lidL/R (a skin rect above each eye,
 *   inside the eye clip, slid down to shut it), lashPL/PR (the lash line, its d is rewritten),
 *   joyL/R (^ ^ eyes, shown instead of the open eyes), irisL/R (slid by the gaze), browL/R,
 *   blushL/R and shine (opacity). fx and tears are empty layers the code fills.
 * - Gradients and clip paths are prefixed with `${id}-` (two performers share a page); the tear
 *   gradient keeps the id suffix "-tear".
 * - It is seen small (about 200 px tall on a phone) on a dark stage: bold readable shapes, a light
 *   rim on the edges, no blur filters on moving parts, and a modest element count.
 */

let uid = 0;

function markup(kind: Kind, id: string) {
  const L = LOOKS[kind];
  const isF = kind === "f";
  const defs = `
  <defs>
    <linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="${L.clothHi}"/><stop offset="0.28" stop-color="${L.cloth}"/><stop offset="1" stop-color="${L.clothShade}"/></linearGradient>
    <linearGradient id="${id}-sleeve" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${L.cloth}"/><stop offset="1" stop-color="${L.clothShade}"/></linearGradient>
    <linearGradient id="${id}-legs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${L.legs}"/><stop offset="1" stop-color="${L.legsShade}"/></linearGradient>
    <radialGradient id="${id}-face" cx="0.42" cy="0.38" r="0.75"><stop offset="0" stop-color="${L.skin}"/><stop offset="0.75" stop-color="${L.skin}"/><stop offset="1" stop-color="${L.skinShade}"/></radialGradient>
    <linearGradient id="${id}-hair" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${L.hairHi}"/><stop offset="0.35" stop-color="${L.hair}"/><stop offset="1" stop-color="${L.hairShade}"/></linearGradient>
    <radialGradient id="${id}-iris" cx="0.5" cy="0.62" r="0.62"><stop offset="0" stop-color="${L.iris}" stop-opacity="0.95"/><stop offset="0.55" stop-color="${L.iris}"/><stop offset="1" stop-color="${L.irisDeep}"/></radialGradient>
    <linearGradient id="${id}-tear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f9ff"/><stop offset="1" stop-color="#7fd0ff"/></linearGradient>
    <clipPath id="${id}-eyeL"><ellipse cx="-15" cy="-56" rx="${isF ? 9.6 : 9}" ry="${isF ? 11.4 : 10.6}"/></clipPath>
    <clipPath id="${id}-eyeR"><ellipse cx="15" cy="-56" rx="${isF ? 9.6 : 9}" ry="${isF ? 11.4 : 10.6}"/></clipPath>
    <clipPath id="${id}-mouth"><path class="mclip" d="M-6,-31 L6,-31 L6,-30 L-6,-30 Z"/></clipPath>
  </defs>`;

  /* ---- legs (floor space): thigh > shin > foot, each drawn pointing down from its joint ---- */
  const leg = (side: "L" | "R") => {
    const dir = side === "L" ? -1 : 1;
    const thigh = isF
      ? `<path d="M-5.5,-2 L5.5,-2 L5,${THIGH} L-5,${THIGH} Z" fill="url(#${id}-legs)"/>`
      : `<path d="M-8.5,-3 C-9,12 -8,26 -7.2,${THIGH} L7.2,${THIGH} C8,26 9,12 8.5,-3 Z" fill="url(#${id}-legs)"/><path d="M${dir * 2},4 L${dir * 1.5},${THIGH - 4}" stroke="${L.legsShade}" stroke-width="1" opacity=".6"/>`;
    const knee = `<circle cx="0" cy="0" r="${isF ? 5 : 7.2}" fill="${L.legs}"/>`;
    const shin = isF
      ? `<path d="M-5,0 L5,0 L4.4,${SHIN} L-4.4,${SHIN} Z" fill="url(#${id}-legs)"/><path d="M-4.9,${SHIN - 15} L4.9,${SHIN - 15} L4.5,${SHIN + 1} L-4.5,${SHIN + 1} Z" fill="#fff"/><path d="M-4.9,${SHIN - 15} L4.9,${SHIN - 15}" stroke="#ffd0e4" stroke-width="1.6"/>`
      : `<path d="M-7.2,0 L7.2,0 L7,${SHIN - 2} L-7,${SHIN - 2} Z" fill="url(#${id}-legs)"/><path d="M-7.4,${SHIN - 6} L7.4,${SHIN - 6} L7.6,${SHIN} L-7.6,${SHIN} Z" fill="${L.legsShade}"/>`;
    const foot = isF
      ? `<path d="M-5.5,-1 C-7,3 -6,9 -1,9.5 L${dir * 9},9.5 C${dir * 12},9.5 ${dir * 12.5},4 ${dir * 8},1 L${dir * 4},-1 Z" fill="${L.shoe}"/><path d="M-4.6,1.5 L4.6,1.5" stroke="${L.shoeSole}" stroke-width="1.4"/><path d="M-6,9.5 L${dir * 11},9.5" stroke="${L.shoeSole}" stroke-width="2"/>`
      : `<path d="M-8,-2 C-10,4 -9,11 -2,12 L${dir * 11},12 C${dir * 16},12 ${dir * 16},5 ${dir * 11},1 L${dir * 6},-2 Z" fill="${L.shoe}"/><path d="M-9,12 L${dir * 14},12" stroke="${L.shoeSole}" stroke-width="2.6" stroke-linecap="round"/><path d="M${dir * -3},3 L${dir * 6},3 M${dir * -3},6.5 L${dir * 7},6.5" stroke="#c9d2ff" stroke-width="1.1"/>`;
    return `<g class="leg${side}"><g class="thigh${side}">${thigh}<g class="shin${side}" transform="translate(0 ${THIGH})">${knee}${shin}<g class="foot${side}" transform="translate(0 ${SHIN})">${foot}</g></g></g></g>`;
  };

  /* ---- arms (torso space): upper > fore > hand ---- */
  const arm = (side: "L" | "R") => {
    const thumb = side === "L" ? 1 : -1; // the thumb faces the body at rest
    const upper = isF
      ? `<path d="M-4.6,4 L4.6,4 L4.2,${L.upper} L-4.2,${L.upper} Z" fill="${L.skin}"/><path d="M-9,-3 C-10,6 -6,11 0,11 C6,11 10,6 9,-3 C6,-7 -6,-7 -9,-3 Z" fill="url(#${id}-sleeve)"/><path d="M-8,8.5 C-3,11.5 3,11.5 8,8.5" stroke="${L.trim}" stroke-width="1.6" fill="none"/>`
      : `<path d="M-7.6,-3 C-8.2,10 -7.4,20 -6.4,${L.upper} L6.4,${L.upper} C7.4,20 8.2,10 7.6,-3 Z" fill="url(#${id}-sleeve)"/>`;
    const elbow = `<circle cx="0" cy="0" r="${isF ? 4.2 : 6.4}" fill="${isF ? L.skin : L.cloth}"/>`;
    const fore = isF
      ? `<path d="M-4.2,0 L4.2,0 L3.6,${L.fore} L-3.6,${L.fore} Z" fill="${L.skin}"/><path d="M-3.8,${L.fore - 4} L3.8,${L.fore - 4}" stroke="${L.clothHi}" stroke-width="2.4"/>`
      : `<path d="M-6.4,0 L6.4,0 L5.8,${L.fore - 3} L-5.8,${L.fore - 3} Z" fill="url(#${id}-sleeve)"/><rect x="-6.2" y="${L.fore - 5}" width="12.4" height="5.5" rx="2" fill="${L.trim}"/>`;
    const s = isF ? 0.86 : 1;
    const hand = `<g transform="scale(${s})"><path d="M-5.8,-0.5 C-7.4,4 -7.2,11.5 -2.2,13.6 C2,15.2 6.6,12.4 6.4,7.4 L6.2,0 Z" fill="${L.skin}"/><ellipse cx="${thumb * 5.6}" cy="4.6" rx="2.5" ry="4.2" transform="rotate(${-thumb * 24} ${thumb * 5.6} 4.6)" fill="${L.skin}"/><path d="M${thumb * -2.5},6 L${thumb * -2.2},12 M0,6.5 L0.2,13" stroke="${L.skinShade}" stroke-width="0.8" opacity=".7"/></g>`;
    return `<g class="arm${side}"><g class="upper${side}">${upper}<g class="fore${side}" transform="translate(0 ${L.upper})">${elbow}${fore}<g class="hand${side}" transform="translate(0 ${L.fore})">${hand}</g></g></g></g>`;
  };

  /* ---- torso (torso space, around the pelvis at 100,206) ---- */
  const torso = isF
    ? `<g class="skirt">
        <path d="M83,186 C92,183.5 108,183.5 117,186 L141,232 C121,243 79,243 59,232 Z" fill="url(#${id}-cloth)"/>
        <path d="M91,190 L80,238 M100,191 L100,241 M109,190 L120,238" stroke="${L.clothShade}" stroke-width="1.3" opacity=".55"/>
        <path d="M59,232 C79,243 121,243 141,232" stroke="${L.trim}" stroke-width="2.4" fill="none" stroke-dasharray="1 5.2" stroke-linecap="round"/>
      </g>
      <path d="M78.5,150 C86,143 114,143 121.5,150 L117.5,185 C108,189 92,189 82.5,185 Z" fill="url(#${id}-cloth)"/>
      <path d="M100,152 L100,182" stroke="${L.clothShade}" stroke-width="1" opacity=".5"/>
      <rect x="81.5" y="181" width="37" height="7.5" rx="3" fill="#ffd0e4"/>
      <path d="M110,184.5 l7,-5 l0,10 Z M110,184.5 l-7,-5 l0,10 Z" fill="#ffffff"/><circle cx="110" cy="184.5" r="2.2" fill="#ffd0e4"/>
      <path d="M88,147 C88,155 99,156 100,149 C101,156 112,155 112,147 C106,144 94,144 88,147 Z" fill="#ffffff"/>`
    : `<path d="M71.5,149 C80,141 120,141 128.5,149 L133.5,203 C120,211 80,211 66.5,203 Z" fill="url(#${id}-cloth)"/>
      <path d="M83,147 C89,137 111,137 117,147 C111,152 89,152 83,147 Z" fill="${L.clothShade}"/>
      <path d="M100,151 L100,206" stroke="${L.trim}" stroke-width="1.4" opacity=".85"/>
      <path d="M94.5,150 L93.5,167 M105.5,150 L106.5,167" stroke="${L.trim}" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="93.4" cy="168.4" r="1.8" fill="${L.trim}"/><circle cx="106.6" cy="168.4" r="1.8" fill="${L.trim}"/>
      <path d="M83,184 L117,184 L121,199 L79,199 Z" fill="none" stroke="${L.clothShade}" stroke-width="1.6"/>
      <path d="M67,200 C80,207 120,207 133,200 L133.6,205 C120,212 80,212 66.4,205 Z" fill="${L.clothShade}"/>`;

  /* ---- head: back layer (behind the body) and face layer; origin at the neck ---- */
  const backHair = isF
    ? `<path d="M-46,-62 C-55,-108 -26,-126 0,-126 C26,-126 55,-108 46,-62 L49,-8 C44,6 30,8 25,-2 L24,-30 L-24,-30 L-25,-2 C-30,8 -44,6 -49,-8 Z" fill="url(#${id}-hair)"/>
       <g class="tail" transform="translate(31 -108)"><path d="M0,0 C20,4 30,28 24,62 C21,78 10,86 2,90 C10,66 10,40 -3,14 Z" fill="url(#${id}-hair)"/><path d="M6,12 C14,26 16,44 12,62" stroke="${L.hairHi}" stroke-width="1.6" fill="none" opacity=".55"/><circle r="5.5" fill="${L.cloth}"/><circle r="2.2" cx="-1.4" cy="-1.4" fill="${L.clothHi}"/></g>`
    : `<path d="M-43,-60 C-50,-106 -24,-126 2,-124 C30,-124 50,-104 43,-60 Z" fill="url(#${id}-hair)"/>`;

  const eye = (side: "L" | "R") => {
    const cx = side === "L" ? -15 : 15;
    const rx = isF ? 9.6 : 9, ry = isF ? 11.4 : 10.6;
    return `<g class="eye${side}">
      <g clip-path="url(#${id}-eye${side})">
        <ellipse cx="${cx}" cy="-56" rx="${rx}" ry="${ry}" fill="#ffffff"/>
        <g class="iris${side}"><circle cx="${cx}" cy="-54.5" r="${isF ? 7.6 : 7.2}" fill="url(#${id}-iris)"/><circle cx="${cx}" cy="-54" r="3.5" fill="#120c22"/>
          <circle cx="${cx + 2.6}" cy="-58.2" r="2.7" fill="#ffffff"/><circle cx="${cx - 2.6}" cy="-50.6" r="1.25" fill="#ffffff" opacity=".9"/></g>
        <rect class="lid${side}" x="${cx - 13}" y="${-56 - ry - 26}" width="26" height="26" fill="${L.skin}"/>
      </g>
      <g class="lash${side}"><path class="lashP${side}" d="M0,0" stroke="#1c1430" stroke-width="${isF ? 2.8 : 2.4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      <path class="lower${side}" d="M${cx - 6},${-56 + ry - 0.5} Q${cx},${-56 + ry + 1.4} ${cx + 6},${-56 + ry - 0.5}" stroke="${L.skinShade}" stroke-width="1" fill="none" opacity=".8"/>
      <path class="joy${side}" d="M${cx - 8},-54 Q${cx},-63 ${cx + 8},-54" stroke="#1c1430" stroke-width="2.6" fill="none" stroke-linecap="round" style="display:none"/>
    </g>`;
  };
  const brow = (side: "L" | "R") => {
    const cx = side === "L" ? -15 : 15;
    const inner = side === "L" ? cx + 7 : cx - 7, outer = side === "L" ? cx - 7 : cx + 7;
    return `<g class="brow${side}"><path d="M${outer},-71 Q${cx},${isF ? -76.5 : -75.5} ${inner},-72.5" stroke="${L.brow}" stroke-width="${isF ? 2.2 : 3.4}" fill="none" stroke-linecap="round"/></g>`;
  };
  const frontHair = isF
    ? `<path d="M-45,-62 C-48,-104 -18,-122 8,-120 C35,-118 50,-98 45,-64 C40,-84 30,-94 15,-96 C6,-86 -9,-81 -23,-86 C-31,-81 -38,-74 -45,-62 Z" fill="url(#${id}-hair)"/>
       <path d="M-45,-68 C-50,-46 -46,-24 -38,-14 C-38,-30 -39,-46 -37,-62 Z" fill="url(#${id}-hair)"/>
       <path d="M45,-70 C50,-46 47,-26 40,-16 C40,-32 40,-48 38,-64 Z" fill="url(#${id}-hair)"/>
       <path d="M-26,-106 C-14,-114 8,-115 22,-108" stroke="#ffffff" stroke-width="3" fill="none" opacity=".28" stroke-linecap="round"/>
       <path d="M-30,-100 l3.2,-7 l3.2,7 l-6.4,-4.4 l6.4,0 Z" fill="#ffd84d" transform="rotate(-14 -27 -103)"/>`
    : `<path d="M-42,-70 C-45,-102 -20,-120 4,-118 C30,-118 47,-100 42,-72 L37,-84 L31,-74 L24,-90 L14,-79 L4,-92 L-6,-79 L-17,-91 L-25,-77 L-33,-88 Z" fill="url(#${id}-hair)"/>
       <path d="M-42,-72 C-44,-62 -43,-54 -40,-48 L-38,-66 Z M42,-74 C44,-62 43,-54 40,-48 L38,-66 Z" fill="url(#${id}-hair)"/>
       <path d="M-22,-110 C-8,-117 10,-117 22,-110" stroke="#ffffff" stroke-width="2.6" fill="none" opacity=".22" stroke-linecap="round"/>`;

  const face = `
    <path d="M-8.5,-22 L-8.5,3 L8.5,3 L8.5,-22 Z" fill="${L.skin}"/>
    <ellipse cx="0" cy="-15" rx="12" ry="5" fill="${L.skinShade}" opacity=".45"/>
    <ellipse cx="-41" cy="-56" rx="6.5" ry="9.5" fill="${L.skin}"/><ellipse cx="41" cy="-56" rx="6.5" ry="9.5" fill="${L.skin}"/>
    <path d="M-41,-60 q-3,4 0,8 M41,-60 q3,4 0,8" stroke="${L.skinShade}" stroke-width="1.4" fill="none"/>
    ${isF ? `<circle cx="-42" cy="-46" r="2.2" fill="#ffd84d"/><circle cx="42" cy="-46" r="2.2" fill="#ffd84d"/>` : ""}
    <path d="M-41,-66 C-42,-97 -21,-111 0,-111 C21,-111 42,-97 41,-66 C41,-40 25,-16 0,-14 C-25,-16 -41,-40 -41,-66 Z" fill="url(#${id}-face)"/>
    <g class="feat">
      <ellipse class="blushL" cx="-25" cy="-40" rx="7" ry="4" fill="#ff7aa8" opacity=".3"/><ellipse class="blushR" cx="25" cy="-40" rx="7" ry="4" fill="#ff7aa8" opacity=".3"/>
      <path d="M-29,-42.5 l2,-2.6 M-25,-42.5 l2,-2.6 M21,-42.5 l2,-2.6 M25,-42.5 l2,-2.6" class="shine" stroke="#ffffff" stroke-width="1" opacity="0"/>
      ${eye("L")}${eye("R")}${brow("L")}${brow("R")}
      <path d="M-1.6,-42 Q0.4,-38.8 2.4,-41.2" stroke="${L.skinShade}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <g class="mouth">
        <path class="mfill" d="M-6,-31 L6,-31 L6,-30 L-6,-30 Z" fill="#6e1b32"/>
        <g clip-path="url(#${id}-mouth)"><rect class="teeth" x="-12" y="-40" width="24" height="7.6" fill="#ffffff"/><ellipse class="tongue" cx="0" cy="-22" rx="6" ry="4" fill="#ff7b93"/></g>
        <path class="mline" d="M-6,-31 L6,-31" stroke="${L.lip}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="tears"></g>
    </g>`;

  return `${defs}
  <g class="root">
    ${leg("L")}${leg("R")}
    <g class="torso">
      <g class="headBack">${backHair}</g>
      ${torso}
      <g class="head"><g class="headIn">${face}<g class="hairFront">${frontHair}</g><g class="fx"></g></g></g>
      ${arm("L")}${arm("R")}
    </g>
  </g>`;
}

/* ------------------------------------------------------------------ the performer */

const SVGNS = "http://www.w3.org/2000/svg";

export class Performer {
  readonly kind: Kind;
  readonly look: Look;
  readonly pose: Pose;
  readonly face: Face;
  /** which way "toward the other performer" is: +1 right, -1 left */
  readonly inward: number;
  private el: Record<string, SVGGElement | SVGPathElement | SVGElement>;
  private tailAng = 0;
  private tailVel = 0;
  private skirtAng = 0;
  private skirtVel = 0;
  private lastHeadX = 0;
  private lastPx = 0;
  private wet = 0;

  constructor(readonly svg: SVGSVGElement, kind: Kind, inward: number) {
    this.kind = kind;
    this.look = LOOKS[kind];
    this.inward = inward;
    const id = `pf${++uid}${kind}`;
    svg.innerHTML = markup(kind, id);
    const q = (s: string) => svg.querySelector(s) as SVGGElement;
    this.el = {} as Record<string, SVGGElement>;
    for (const name of [
      "root", "torso", "head", "headIn", "headBack", "tail", "skirt", "feat", "hairFront", "fx", "tears",
      "thighL", "shinL", "footL", "thighR", "shinR", "footR",
      "upperL", "foreL", "handL", "upperR", "foreR", "handR",
      "lidL", "lidR", "lashL", "lashR", "lashPL", "lashPR", "joyL", "joyR", "irisL", "irisR", "browL", "browR",
      "mfill", "mline", "mclip", "teeth", "tongue", "blushL", "blushR", "shine",
    ]) {
      const node = q("." + name);
      if (node) this.el[name] = node;
    }
    this.pose = restPose(kind);
    this.face = restFace();
    this.render(0);
  }

  /** Turn pose and face into the drawing. dt in seconds (for the hair and the skirt). */
  render(dt: number) {
    const p = this.pose, F = this.face, L = this.look, e = this.el;
    const px = p.px, py = p.py;

    // whole body: a spin is a squeeze to nothing and back, mirrored halfway
    e.root.setAttribute("transform", `translate(100 0) scale(${f2(p.spin)} 1) translate(-100 0)`);

    // legs: hips ride the pelvis, feet stay where the move puts them
    for (const side of ["L", "R"] as const) {
      const dir = side === "L" ? -1 : 1;
      const hx = PELVIS.x + px + dir * L.hip, hy = PELVIS.y + py;
      const fx = side === "L" ? p.fLx : p.fRx, fy = side === "L" ? p.fLy : p.fRy;
      const s = solve(hx, hy, fx, fy, THIGH, SHIN, (x) => dir * x);
      const r1 = boneRot(s.a1), r2 = wrap(boneRot(s.a2) - r1);
      e["thigh" + side].setAttribute("transform", `translate(${f2(hx)} ${f2(hy)}) rotate(${f2(r1)})`);
      e["shin" + side].setAttribute("transform", `translate(0 ${THIGH}) rotate(${f2(r2)})`);
      e["foot" + side].setAttribute("transform", `translate(0 ${SHIN}) rotate(${f2(-(r1 + r2))})`);
    }

    // torso: carried by the pelvis, leaning about it
    e.torso.setAttribute("transform", `translate(${f2(px)} ${f2(py)}) rotate(${f2(p.lean)} ${PELVIS.x} ${PELVIS.y})`);

    // arms: hands aimed in the torso's own space, elbows out
    for (const side of ["L", "R"] as const) {
      const dir = side === "L" ? -1 : 1;
      const sx = PELVIS.x + dir * L.shoulderX, sy = 149;
      const tx = side === "L" ? p.hLx : p.hRx, ty = side === "L" ? p.hLy : p.hRy;
      const s = solve(sx, sy, tx, ty, L.upper, L.fore, (x, y) => dir * x + y * 0.15);
      const r1 = boneRot(s.a1), r2 = wrap(boneRot(s.a2) - r1);
      e["upper" + side].setAttribute("transform", `translate(${f2(sx)} ${sy}) rotate(${f2(r1)})`);
      e["fore" + side].setAttribute("transform", `translate(0 ${L.upper}) rotate(${f2(r2)})`);
      e["hand" + side].setAttribute("transform", `translate(0 ${L.fore}) rotate(${f2(side === "L" ? p.wristL : p.wristR)})`);
    }

    // head: tilt about the neck, nod, a little turn (features slide, the hair follows less)
    const head = `translate(${NECK.x} ${NECK.y + p.headNod}) rotate(${f2(p.headTilt)})`;
    e.head.setAttribute("transform", head);
    e.headBack.setAttribute("transform", head);
    e.feat.setAttribute("transform", `translate(${f2(p.headTurn * 4)} 0)`);
    e.hairFront.setAttribute("transform", `translate(${f2(p.headTurn * 1.6)} 0)`);

    // springs: the ponytail and the skirt lag behind the motion
    if (dt > 0) {
      const headX = px + Math.sin(p.lean / DEG) * 60 + p.headTilt * 0.6;
      const vHead = (headX - this.lastHeadX) / dt, vPel = (px - this.lastPx) / dt;
      this.lastHeadX = headX;
      this.lastPx = px;
      const step = (ang: number, vel: number, target: number, k: number, damp: number) => {
        const acc = (target - ang) * k - vel * damp;
        vel += acc * dt;
        return [ang + vel * dt, vel];
      };
      [this.tailAng, this.tailVel] = step(this.tailAng, this.tailVel, Math.max(-38, Math.min(38, -vHead * 0.5 - p.lean * 0.6 - p.headTilt * 0.4)), 90, 7);
      [this.skirtAng, this.skirtVel] = step(this.skirtAng, this.skirtVel, Math.max(-14, Math.min(14, -vPel * 0.25 - p.lean * 0.35)), 140, 9);
    }
    if (e.tail) e.tail.setAttribute("transform", `translate(31 -108) rotate(${f2(this.tailAng)})`);
    if (e.skirt) e.skirt.setAttribute("transform", `rotate(${f2(this.skirtAng)} 100 186)`);

    // face: lids, joy eyes, gaze, brows, blush
    const joy = F.happy > 0.5;
    for (const side of ["L", "R"] as const) {
      const lid = Math.max(0, Math.min(1, side === "L" ? F.lidL : F.lidR));
      const ry = this.kind === "f" ? 11.4 : 10.6;
      e["lid" + side].setAttribute("transform", `translate(0 ${f2(lid * (2 * ry + 1))})`);
      // the lash line rides the lid down and turns from an arch (open) into a soft dip (shut)
      const cx = side === "L" ? -15 : 15, rx = this.kind === "f" ? 9.6 : 9, out = side === "L" ? -1 : 1;
      const yc = -55.5 + lid * 3, yk = (-56.5 - 2 * ry) * (1 - lid) + -47.5 * lid;
      let d = `M${f2(cx - rx - 1)},${f2(yc)} Q${cx},${f2(yk)} ${f2(cx + rx + 1)},${f2(yc)}`;
      if (this.kind === "f") {
        const ox = cx + out * (rx + 0.6);
        d += ` M${f2(ox)},${f2(yc - 1.5)} l${out * 4},${f2(-3.4 * (1 - lid * 0.6))} M${f2(ox - out * 1.8)},${f2(yc - 4.5 * (1 - lid))} l${out * 3.2},${f2(-3.8 * (1 - lid * 0.6))}`;
      }
      e["lashP" + side].setAttribute("d", d);
      (e["lid" + side].parentNode as SVGGElement).style.display = joy ? "none" : "";
      (e["lash" + side] as SVGGElement).style.display = joy ? "none" : "";
      (e["joy" + side] as SVGGElement).style.display = joy ? "" : "none";
      e["iris" + side].setAttribute("transform", `translate(${f2(F.gaze * 2.6)} 0)`);
      // sorrow lifts the inner ends, anger (brow below 0) pulls them down into a V: each brow turns
      // about its inner end
      const angry = Math.max(0, -F.brow);
      const tilt = (side === "L" ? -1 : 1) * (F.browSad * 19 - angry * 16);
      const inner = side === "L" ? -8 : 8;
      e["brow" + side].setAttribute("transform", `translate(0 ${f2(-Math.max(0, F.brow) * 3.2 + angry * 1.6 - F.browSad * 2)}) rotate(${f2(tilt)} ${inner} -72)`);
    }
    const blush = (0.18 + 0.6 * Math.max(0, F.blush)).toFixed(2);
    e.blushL.setAttribute("opacity", blush);
    e.blushR.setAttribute("opacity", blush);
    e.shine.setAttribute("opacity", (Math.max(0, F.blush - 0.5) * 1.6).toFixed(2));

    // mouth: corners up with a smile, open with the voice
    const open = Math.max(0, Math.min(1, F.open));
    const smile = Math.max(-1, Math.min(1, F.smile));
    const w = (this.kind === "f" ? 6.2 : 6.8) * F.wide * (1 + 0.25 * Math.max(0, smile)) * (1 - open * 0.18);
    const cy = -31, corner = cy - smile * 2.4;
    if (open < 0.05) {
      const d = `M${f2(-w)},${f2(corner)} Q0,${f2(cy + smile * 3.6)} ${f2(w)},${f2(corner)}`;
      e.mline.setAttribute("d", d);
      e.mfill.setAttribute("d", "M0,0");
      e.mclip.setAttribute("d", "M0,0");
      (e.mline as SVGPathElement).style.display = "";
    } else {
      const h = 2 + open * 11, top = cy - 0.6 - open * 1.4, bot = cy + h + Math.max(0, smile) * 1.6;
      const d = `M${f2(-w)},${f2(corner)} C${f2(-w * 0.55)},${f2(top - 1)} ${f2(w * 0.55)},${f2(top - 1)} ${f2(w)},${f2(corner)} C${f2(w * 0.8)},${f2(bot)} ${f2(-w * 0.8)},${f2(bot)} ${f2(-w)},${f2(corner)} Z`;
      e.mfill.setAttribute("d", d);
      e.mclip.setAttribute("d", d);
      e.mline.setAttribute("d", d);
      e.teeth.setAttribute("y", f2(top - 7.6 + Math.min(3.2, open * 4)));
      e.tongue.setAttribute("cy", f2(bot - 1.2));
      e.tongue.setAttribute("rx", f2(w * 0.62));
    }
    e.mline.setAttribute("stroke-width", open < 0.05 ? "2.2" : "1.4");

    // wet cheeks fade after a tear
    if (this.wet > 0 && dt > 0) this.wet = Math.max(0, this.wet - dt * 0.25);
  }

  /** A tear wells up under one eye and runs down the cheek. */
  tear(side: "L" | "R" = Math.random() < 0.5 ? "L" : "R") {
    const layer = this.el.tears as SVGGElement;
    const x0 = (side === "L" ? -15 : 15) + (side === "L" ? -5 : 5), y0 = -47;
    const drop = document.createElementNS(SVGNS, "path");
    drop.setAttribute("d", "M0,-3.6 C2.6,0.6 3.8,3 3.8,5.2 C3.8,7.9 2,9.6 0,9.6 C-2,9.6 -3.8,7.9 -3.8,5.2 C-3.8,3 -2.6,0.6 0,-3.6 Z");
    drop.setAttribute("fill", `url(#${(this.svg.querySelector("linearGradient[id$='-tear']") as SVGElement).id})`);
    drop.setAttribute("stroke", "#5bb8f0");
    drop.setAttribute("stroke-width", "0.6");
    const streak = document.createElementNS(SVGNS, "path");
    streak.setAttribute("stroke", "#bfeaff");
    streak.setAttribute("stroke-width", "2");
    streak.setAttribute("stroke-linecap", "round");
    streak.setAttribute("fill", "none");
    streak.setAttribute("opacity", "0.7");
    layer.append(streak, drop);
    const st = { y: 0, s: 0, o: 1 };
    const drift = side === "L" ? -2.5 : 2.5;
    const draw = () => {
      drop.setAttribute("transform", `translate(${f2(x0 + drift * (st.y / 26))} ${f2(y0 + st.y)}) scale(${f2(st.s)})`);
      drop.setAttribute("opacity", f2(st.o));
      streak.setAttribute("d", `M${x0},${y0 + 2} Q${f2(x0 + drift * 0.4)},${f2(y0 + st.y * 0.5)} ${f2(x0 + drift * (st.y / 26))},${f2(y0 + st.y)}`);
    };
    draw();
    gsap
      .timeline({ onUpdate: draw, onComplete: () => { drop.remove(); gsap.to(streak, { opacity: 0, duration: 2.4, onComplete: () => streak.remove() }); } })
      .to(st, { s: 1, duration: 0.45, ease: "back.out(2)" })
      .to(st, { y: 26, duration: 1.5, ease: "power1.in" })
      .to(st, { o: 0, duration: 0.3 }, "-=0.25");
    this.wet = 1;
  }

  /** A four-point sparkle by an eye (a wink, a grin). */
  sparkle(side: "L" | "R") {
    const fx = this.el.fx as SVGGElement;
    const star = document.createElementNS(SVGNS, "path");
    star.setAttribute("d", "M0,-7 C0.9,-1.4 1.4,-0.9 7,0 C1.4,0.9 0.9,1.4 0,7 C-0.9,1.4 -1.4,0.9 -7,0 C-1.4,-0.9 -0.9,-1.4 0,-7 Z");
    star.setAttribute("fill", "#fff6c2");
    const x = side === "L" ? -30 : 30, y = -70;
    fx.append(star);
    const st = { s: 0, r: 0 };
    const draw = () => star.setAttribute("transform", `translate(${x} ${y}) rotate(${f2(st.r)}) scale(${f2(st.s)})`);
    draw();
    gsap.timeline({ onUpdate: draw, onComplete: () => star.remove() }).to(st, { s: 1.25, r: 45, duration: 0.25, ease: "back.out(3)" }).to(st, { s: 0, r: 90, duration: 0.35, ease: "power2.in" }, "+=0.15");
  }

  /** A drop of sweat at the temple (a wrong answer). */
  sweat() {
    const fx = this.el.fx as SVGGElement;
    const drop = document.createElementNS(SVGNS, "path");
    drop.setAttribute("d", "M0,-5 C3,0 4.4,3 4.4,5.6 C4.4,8.4 2.4,10 0,10 C-2.4,10 -4.4,8.4 -4.4,5.6 C-4.4,3 -3,0 0,-5 Z");
    drop.setAttribute("fill", "#9fe3ff");
    drop.setAttribute("stroke", "#4aa8e0");
    drop.setAttribute("stroke-width", "0.8");
    const x = this.inward > 0 ? -36 : 36;
    fx.append(drop);
    const st = { y: -92, o: 0 };
    const draw = () => {
      drop.setAttribute("transform", `translate(${x} ${f2(st.y)})`);
      drop.setAttribute("opacity", f2(st.o));
    };
    draw();
    gsap.timeline({ onUpdate: draw, onComplete: () => drop.remove() }).to(st, { o: 1, duration: 0.2 }).to(st, { y: -78, duration: 0.9, ease: "power1.in" }).to(st, { o: 0, duration: 0.3 });
  }

  /** A heart floating up from the chest (love songs). */
  heart() {
    const fx = this.el.fx as SVGGElement;
    const h = document.createElementNS(SVGNS, "path");
    h.setAttribute("d", "M0,3 C-6,-2 -9,-6 -6,-9 C-3.6,-11.4 -0.8,-10 0,-7.6 C0.8,-10 3.6,-11.4 6,-9 C9,-6 6,-2 0,3 Z");
    h.setAttribute("fill", this.kind === "f" ? "#ff7aa8" : "#8ad8ff");
    fx.append(h);
    // beside the head (on the partner's side), never across the face
    const st = { y: -34, x: this.inward * 52, s: 0.4, o: 0 };
    const draw = () => {
      h.setAttribute("transform", `translate(${f2(st.x)} ${f2(st.y)}) scale(${f2(st.s)})`);
      h.setAttribute("opacity", f2(st.o));
    };
    draw();
    gsap
      .timeline({ onUpdate: draw, onComplete: () => h.remove() })
      .to(st, { o: 1, s: 1, duration: 0.3, ease: "back.out(2)" })
      .to(st, { y: -150, x: st.x + this.inward * 14, duration: 2, ease: "sine.out" }, 0)
      .to(st, { o: 0, duration: 0.5 }, 1.5);
  }

  destroy() {
    gsap.killTweensOf([this.pose, this.face]);
    this.svg.innerHTML = "";
  }
}
