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
    skin: "#f6cbb0", skinShade: "#d89b86", hair: "#202b49", hairHi: "#536b97", hairShade: "#111a32",
    cloth: "#429fff", clothShade: "#275dbb", clothHi: "#a0e2ff", trim: "#eff9ff", legs: "#354664", legsShade: "#1c2945",
    shoe: "#f4f6ff", shoeSole: "#54bfe8", iris: "#418ee1", irisDeep: "#173968", lip: "#a44c60", brow: "#202b49",
    shoulderX: 27, upper: 30, fore: 28, hip: 10,
  },
  f: {
    skin: "#fbd6c2", skinShade: "#dda28e", hair: "#48213f", hairHi: "#956189", hairShade: "#29162e",
    cloth: "#f875b0", clothShade: "#c43e7e", clothHi: "#ffd0e4", trim: "#ffffff", legs: "#fbd6c2", legsShade: "#dda28e",
    shoe: "#da4361", shoeSole: "#86243f", iris: "#bb639f", irisDeep: "#5a285b", lip: "#d2506f", brow: "#48213f",
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
  const ink = isF ? "#49233f" : "#172443";
  // All paint is local to this SVG. Rims are paths, never filters on the moving rig.
  const defs = `
  <defs>
    <linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="${L.clothHi}"/><stop offset=".3" stop-color="${L.cloth}"/><stop offset="1" stop-color="${L.clothShade}"/></linearGradient>
    <linearGradient id="${id}-sleeve" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="9" y2="0"><stop stop-color="${L.clothHi}"/><stop offset=".35" stop-color="${L.cloth}"/><stop offset="1" stop-color="${L.clothShade}"/></linearGradient>
    <linearGradient id="${id}-legs" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="9" y2="0"><stop stop-color="${L.legs}"/><stop offset="1" stop-color="${L.legsShade}"/></linearGradient>
    <linearGradient id="${id}-skin" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="9" y2="0"><stop stop-color="${L.skin}"/><stop offset=".5" stop-color="${L.skin}"/><stop offset="1" stop-color="${L.skinShade}"/></linearGradient>
    <radialGradient id="${id}-face" cx=".3" cy=".28" r=".85"><stop stop-color="#fff0dd"/><stop offset=".42" stop-color="${L.skin}"/><stop offset="1" stop-color="${L.skinShade}"/></radialGradient>
    <linearGradient id="${id}-hair" x1=".15" y1="0" x2=".8" y2="1"><stop stop-color="${L.hairHi}"/><stop offset=".3" stop-color="${L.hair}"/><stop offset="1" stop-color="${L.hairShade}"/></linearGradient>
    <linearGradient id="${id}-lock" x1="0" y1="0" x2="1" y2=".75"><stop stop-color="${L.hairHi}"/><stop offset=".48" stop-color="${L.hair}"/><stop offset="1" stop-color="${L.hairShade}"/></linearGradient>
    <linearGradient id="${id}-white" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#ffffff"/><stop offset=".65" stop-color="${L.trim}"/><stop offset="1" stop-color="${isF ? "#d9c9e2" : "#b6cbea"}"/></linearGradient>
    <linearGradient id="${id}-shoe" x1=".15" y1="0" x2=".7" y2="1"><stop stop-color="${isF ? "#ff8794" : "#ffffff"}"/><stop offset=".45" stop-color="${L.shoe}"/><stop offset="1" stop-color="${isF ? "#a51f43" : "#c1d1e9"}"/></linearGradient>
    <radialGradient id="${id}-iris" cx=".4" cy=".85" r=".85"><stop stop-color="${isF ? "#ffd0db" : "#9ff2ff"}"/><stop offset=".45" stop-color="${L.iris}"/><stop offset="1" stop-color="${L.irisDeep}"/></radialGradient>
    <linearGradient id="${id}-eyeWhite" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c7c6e2"/><stop offset=".35" stop-color="#fff"/><stop offset="1" stop-color="#fff7f5"/></linearGradient>
    <radialGradient id="${id}-cheek"><stop stop-color="#ff7f98" stop-opacity=".85"/><stop offset="1" stop-color="#ff9eb3" stop-opacity=".08"/></radialGradient>
    <linearGradient id="${id}-tear" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f1fcff"/><stop offset="1" stop-color="#78cbff"/></linearGradient>
    <clipPath id="${id}-eyeL"><ellipse cx="-15" cy="-56" rx="${isF ? 9.6 : 9}" ry="${isF ? 11.4 : 10.6}"/></clipPath>
    <clipPath id="${id}-eyeR"><ellipse cx="15" cy="-56" rx="${isF ? 9.6 : 9}" ry="${isF ? 11.4 : 10.6}"/></clipPath>
    <clipPath id="${id}-mouth"><path class="mclip" d="M-6,-31 L6,-31 L6,-30 L-6,-30 Z"/></clipPath>
  </defs>`;

  // Rounded end caps overlap at every joint, even when the solver folds a limb back on itself.
  const leg = (side: "L" | "R") => {
    const dir = side === "L" ? -1 : 1;
    const thigh = isF
      ? `<path d="M0,0 V${THIGH}" stroke="url(#${id}-legs)" stroke-width="10.4" stroke-linecap="round"/><path d="M-3.5,5 V32" stroke="#fff0df" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>`
      : `<path d="M0,0 V${THIGH}" stroke="url(#${id}-legs)" stroke-width="15" stroke-linecap="round"/>
         <path d="M-7,-2 Q-10,12 -7.2,38 H7.2 Q10,12 7,-2 Z" fill="url(#${id}-legs)"/>
         <path d="M-5,2 Q-6,16 -4.6,28" stroke="#8ca0c5" stroke-width="1.2" fill="none" opacity=".55"/>
         <path d="M5,4 L4,28 M-5,31 L2,33 L-3,35" stroke="${L.legsShade}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    const shin = isF
      ? `<path d="M0,0 V${SHIN}" stroke="url(#${id}-legs)" stroke-width="9.6" stroke-linecap="round"/>
         <path d="M0,22 V${SHIN}" stroke="${L.trim}" stroke-width="10" stroke-linecap="round"/>
         <path d="M-4.7,21 H4.7 M-3.2,24 V31 M-1,24 V31" stroke="#e3d7ed" stroke-width=".9" fill="none"/>
         <path d="M-4.7,19.5 H4.7" stroke="${L.clothHi}" stroke-width="1.6" stroke-linecap="round"/>`
      : `<path d="M0,0 V${SHIN}" stroke="url(#${id}-legs)" stroke-width="14.4" stroke-linecap="round"/>
         <path d="M-4.9,5 L-4.4,27 M-4,4 L3,6 M-3,9 L3,7" stroke="#8598be" stroke-width=".9" fill="none" opacity=".65"/>
         <path d="M-7,30 Q0,32 7,30 L7.2,36 Q0,38 -7.2,36 Z" fill="${L.legsShade}"/>
         <path d="M-6,31.5 Q0,33 6,31.5" stroke="#7186b0" stroke-width=".9" fill="none"/>`;
    // Mirroring only the artwork keeps both outward toes and all animated foot origins intact.
    const foot = isF
      ? `<g transform="scale(${dir} 1)">
          <path d="M-4.5,-3 H4.5 V4 H-4.5 Z" fill="url(#${id}-white)"/>
          <path d="M-5.5,0 Q-8,6 -4,10 H10 Q15,9 12,4 Q9,1 5,0 Z" fill="url(#${id}-shoe)" stroke="${L.shoeSole}" stroke-width=".8"/>
          <path d="M-3.7,.5 Q0,5 5,.6 L7,3 Q0,8 -4.4,3 Z" fill="url(#${id}-white)"/>
          <path d="M-4.8,2 Q0,4 6.2,1" stroke="${L.shoe}" stroke-width="2.7" fill="none"/>
          <rect x="4.5" y=".6" width="2.7" height="3.2" rx=".6" fill="#ffe6a8"/>
          <path d="M-5,10 H11" stroke="${L.shoeSole}" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M7,5 Q10,5 11,6" stroke="#ffd4d7" stroke-width="1.3" stroke-linecap="round" fill="none"/>
        </g>`
      : `<g transform="scale(${dir} 1)">
          <path d="M-7,-2 H5 Q7,1 11,2 Q16,4 15,9 L12,12 H-6 Q-10,8 -7,-2 Z" fill="url(#${id}-shoe)" stroke="#8cadd1" stroke-width=".8"/>
          <path d="M-7,4 L-4,7 L-3,-1 H2 L5,5 L11,5" stroke="${L.clothShade}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
          <path d="M-2,1.5 L4,2.3 M-2,4 L5,4.7 M-2,6.5 L5,7" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M7,8 Q11,6.5 14,8" stroke="#9eb8d7" stroke-width=".8" fill="none"/>
          <path d="M-7,10.2 H14" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          <path d="M-7,12 H13" stroke="${L.shoeSole}" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M-4,11.5 V12.5 M0,11.5 V12.5 M4,11.5 V12.5 M8,11.5 V12.5" stroke="${L.clothShade}" stroke-width=".7"/>
        </g>`;
    return `<g class="leg${side}"><g class="thigh${side}">${thigh}<g class="shin${side}">${shin}<g class="foot${side}">${foot}</g></g></g></g>`;
  };

  const arm = (side: "L" | "R") => {
    const thumb = side === "L" ? 1 : -1;
    const upper = isF
      ? `<path d="M0,0 V${L.upper}" stroke="url(#${id}-skin)" stroke-width="8.6" stroke-linecap="round"/>
         <path d="M-8,-4 C-13,0 -11,9 -7,12 Q0,16 7,12 C11,9 13,0 8,-4 Q0,-9 -8,-4 Z" fill="url(#${id}-sleeve)"/>
         <path d="M-6,-3 Q-9,1 -7,5 M-2,-4 L-3,3 M5,-2 Q8,2 6,6" stroke="${L.clothHi}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
         <path d="M-7,11 Q0,14 7,11" stroke="url(#${id}-white)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
         <path d="M-2.8,17 V25" stroke="#fff0df" stroke-width="1" stroke-linecap="round" opacity=".7"/>`
      : `<path d="M0,0 V${L.upper}" stroke="url(#${id}-sleeve)" stroke-width="14" stroke-linecap="round"/>
         <path d="M-7,-1 Q-10,10 -6.5,30 H6.5 Q10,10 7,-1 Z" fill="url(#${id}-sleeve)"/>
         <path d="M-5,-1 Q-7,7 -5,17" stroke="${L.clothHi}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
         <path d="M5,9 L4,23 M-4,25 L2,27" stroke="${L.clothShade}" stroke-width="1" fill="none" stroke-linecap="round"/>`;
    const fore = isF
      ? `<path d="M0,0 V${L.fore}" stroke="url(#${id}-skin)" stroke-width="8.2" stroke-linecap="round"/>
         <path d="M-2.8,4 L-2.5,20" stroke="#fff0df" stroke-width="1" stroke-linecap="round"/>
         <path d="M-3.9,${L.fore - 4} Q0,${L.fore - 2} 3.9,${L.fore - 4}" stroke="${L.cloth}" stroke-width="2.1" fill="none"/>
         <circle cx="0" cy="${L.fore - 2.5}" r="1.3" fill="#ffe4a5"/>`
      : `<path d="M0,0 V${L.fore}" stroke="url(#${id}-sleeve)" stroke-width="12.8" stroke-linecap="round"/>
         <path d="M-4.4,4 L-4,19 M-3,5 L2,7" stroke="${L.clothHi}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
         <rect x="-6.4" y="${L.fore - 5}" width="12.8" height="6.5" rx="2.8" fill="url(#${id}-white)"/>
         <path d="M-3.5,${L.fore - 3.5} v3 M0,${L.fore - 3.5} v3 M3.5,${L.fore - 3.5} v3" stroke="#aec8e7" stroke-width=".7"/>`;
    const s = isF ? .86 : 1;
    const hand = `<g transform="scale(${thumb * s} ${s})">
      <path d="M-3.8,-1 C-5.6,1 -5.8,4.5 -5.5,7.8 L-5,11.2 Q-4.5,13.4 -2.7,12.7 Q-1.5,15 .2,13.7 Q2,15.1 3.3,12.8 Q5.4,13.1 5.6,10 L5.3,6.4 C8,7.9 10,5.5 8.4,3.5 L5.6,.4 Q4,-1 3.6,-1 Z" fill="url(#${id}-skin)" stroke="${L.skinShade}" stroke-width=".6" stroke-linejoin="round"/>
      <path d="M-3,7 L-2.7,11 M-.3,7.5 L.2,12 M2.6,7 L3.3,11 M5.4,3 Q3.8,4.5 4.2,6.3" stroke="${L.skinShade}" stroke-width=".8" fill="none" stroke-linecap="round"/>
      <path d="M-3.8,2 Q-4.2,4 -3.8,6" stroke="#fff0df" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </g>`;
    return `<g class="arm${side}"><g class="upper${side}">${upper}<g class="fore${side}">${fore}<g class="hand${side}">${hand}</g></g></g></g>`;
  };

  const torso = isF
    ? `<g class="skirt">
        <path d="M82,186 H118 L141,232 Q137,241 132,237 Q127,245 121,240 Q115,247 109,243 Q102,249 96,244 Q89,248 83,242 Q76,246 71,239 Q65,243 59,233 Z" fill="url(#${id}-white)"/>
        <path d="M83,186 Q100,181 117,186 L141,232 Q100,249 59,232 Z" fill="url(#${id}-cloth)"/>
        <path d="M87,189 L70,234 L81,237 L93,189 Z M98,189 L94,240 L104,240 L103,189 Z M108,189 L118,237 L131,235 L113,188 Z" fill="${L.clothHi}" opacity=".48"/>
        <path d="M91,191 L81,233 M101,192 L100,237 M111,191 L121,233 M117,195 L133,230" stroke="${L.clothShade}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M64,230 Q100,244 136,230" stroke="${L.clothHi}" stroke-width="1.3" fill="none"/>
        <path d="M70,237 l1.5,2 M82,241 l1,2 M95,243 v2 M109,243 v2 M122,240 l-1,2 M133,236 l-1,2" stroke="#cbbdd7" stroke-width=".9"/>
        <path d="M83,188 L64,230" stroke="#ffe4f1" stroke-width="1.2" opacity=".8"/>
      </g>
      <path d="M78.5,150 Q85,143 92,145 H108 Q115,143 121.5,150 L117.5,186 Q100,191 82.5,186 Z" fill="url(#${id}-cloth)"/>
      <path d="M81,153 L85,177 M116,153 L113,179 M100,157 V181" stroke="${L.clothShade}" stroke-width="1" fill="none" opacity=".7"/>
      <path d="M82,151 L84,171" stroke="#ffe1ef" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M88,146 Q100,141 112,146 L109,156 Q103,156 100,150 Q97,156 91,156 Z" fill="url(#${id}-white)" stroke="#e0bad5" stroke-width=".6"/>
      <path d="M97,153 L100,156 L103,153 L100,159 Z" fill="${L.clothShade}"/>
      <path d="M82,180.5 Q100,185 118,180.5 V188 Q100,192 82,188 Z" fill="url(#${id}-white)"/>
      <path d="M83,183 Q100,187 117,183" stroke="${L.clothHi}" stroke-width="1.2" fill="none"/>
      <path d="M110,186 L106,199 L111,196 L115,198 L114,187 M111,186 L118,198 L119,193 L123,194 L115,185" fill="${L.clothHi}" stroke="${L.clothShade}" stroke-width=".6"/>
      <path d="M111,184 C98,173 99,190 110,187 C124,194 125,175 113,183 Z" fill="url(#${id}-white)" stroke="${L.clothShade}" stroke-width=".7"/>
      <path d="M103,181 L109,184 M120,182 L115,185" stroke="${L.clothHi}" stroke-width="1.2" stroke-linecap="round"/>
      <ellipse cx="111.5" cy="185" rx="2.5" ry="3.3" fill="${L.cloth}"/>`
    : `<path d="M80,148 C77,133 85,128 100,130 C115,128 123,133 120,148 L110,158 H90 Z" fill="url(#${id}-cloth)" stroke="${L.clothShade}" stroke-width="1"/>
      <path d="M84,142 Q86,134 100,135 Q114,134 116,142 L108,152 H92 Z" fill="${L.clothShade}"/>
      <path d="M82,138 Q90,129 105,132" stroke="${L.clothHi}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <path d="M71.5,149 Q80,142 88,146 Q100,151 112,146 Q120,142 128.5,149 L133.5,203 Q100,216 66.5,203 Z" fill="url(#${id}-cloth)"/>
      <path d="M74,152 L72,184 M125,153 L127,189" stroke="${L.clothShade}" stroke-width="1.2" fill="none"/>
      <path d="M73,151 L70,180" stroke="#c3efff" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M88,146 L100,158 L112,146 L108,146 L100,153 L92,146 Z" fill="${L.trim}"/>
      <path d="M82,181 Q89,178 96,180 V199 H79 Q79,188 82,181 Z M104,180 Q111,178 118,181 L121,199 H104 Z" fill="${L.clothShade}" opacity=".32"/>
      <path d="M84,182 L80,192 M116,182 L120,192 M81,198 H95 M105,198 H119" stroke="${L.clothHi}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M67,200 Q100,211 133,200 L133.6,206 Q100,218 66.4,206 Z" fill="${L.clothShade}"/>
      <path d="M70,204 Q100,213 130,204" stroke="${L.clothHi}" stroke-width="1" fill="none" stroke-dasharray="1 3" opacity=".65"/>
      <path d="M100,157 V209" stroke="${L.clothShade}" stroke-width="3.7"/>
      <path d="M99.5,158 V208" stroke="#e3f7ff" stroke-width="1.5" stroke-dasharray="1 1.5"/>
      <rect x="97.7" y="158" width="4" height="6" rx="1.4" fill="url(#${id}-white)"/>
      <path d="M92,151 Q90,158 92,168 M108,151 Q110,158 108,168" stroke="${L.clothShade}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M91,150 Q89,157 91,167 M107,150 Q109,157 107,167" stroke="${L.trim}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M90.8,166 v3 M107.2,166 v3" stroke="#d2eaff" stroke-width="2.5" stroke-linecap="round"/>`;

  const backHair = isF
    ? `<path d="M-46,-63 C-54,-107 -28,-127 0,-127 C29,-127 53,-106 46,-62 L49,-8 Q44,10 30,4 L25,-4 L24,-31 H-24 L-25,-4 Q-37,12 -49,-8 Z" fill="url(#${id}-hair)" stroke="${L.hairHi}" stroke-width=".7"/>
       <path d="M-44,-67 Q-48,-25 -40,-6 L-35,-12 L-36,-47 M37,-56 Q44,-23 39,-5" stroke="${L.hairHi}" stroke-width="1.6" fill="none" opacity=".65"/>
       <path d="M-30,-52 Q-37,-15 -31,-5 M33,-45 Q30,-20 34,-5" stroke="${L.hairShade}" stroke-width="2" fill="none"/>
       <g class="tail">
         <path d="M-3,3 C10,-16 31,-4 34,22 C37,46 25,69 16,77 Q11,85 2,90 C12,67 5,52 8,34 Q10,20 -3,13 Z" fill="url(#${id}-lock)" stroke="${L.hairHi}" stroke-width=".8"/>
         <path d="M8,4 C24,3 29,20 25,39 Q21,59 13,68 C21,43 15,25 8,4 Z" fill="${L.hairHi}" opacity=".35"/>
         <path d="M13,9 Q29,26 16,57 M8,18 Q17,36 11,48" stroke="${L.hairHi}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
         <path d="M-5,-3 Q-2,-9 2,-6 Q8,-9 9,-3 Q14,0 9,5 Q9,11 3,8 Q-2,12 -5,6 Q-11,4 -7,0 Z" fill="url(#${id}-cloth)" stroke="#ffd3eb" stroke-width=".8"/>
         <ellipse cx="1" cy="1" rx="3.7" ry="5.3" fill="${L.hairShade}" transform="rotate(-25)"/>
         <path d="M-5,-2 L-3,-4 M5,-4 L7,-2 M7,5 L5,7" stroke="#ffe5f2" stroke-width="1.2" stroke-linecap="round"/>
       </g>`
    : `<path d="M-43,-58 L-48,-75 L-44,-87 L-47,-97 L-35,-103 L-36,-115 L-21,-114 L-11,-126 L2,-121 L15,-125 L23,-117 L34,-117 L35,-108 L45,-100 L42,-87 L47,-74 L42,-58 Z" fill="url(#${id}-hair)"/>
       <path d="M-44,-88 L-42,-97 L-30,-103 L-31,-112 L-20,-111 L-10,-122" stroke="#9bafd5" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".8"/>`;

  const eye = (side: "L" | "R") => {
    const cx = side === "L" ? -15 : 15;
    const rx = isF ? 9.6 : 9, ry = isF ? 11.4 : 10.6, ir = isF ? 7.8 : 7.4;
    return `<g class="eye${side}">
      <g clip-path="url(#${id}-eye${side})">
        <ellipse cx="${cx}" cy="-56" rx="${rx}" ry="${ry}" fill="url(#${id}-eyeWhite)"/>
        <g class="iris${side}">
          <ellipse cx="${cx}" cy="-54.5" rx="${ir}" ry="${ir + 1}" fill="${L.irisDeep}"/>
          <ellipse cx="${cx}" cy="-54.2" rx="${ir - 1}" ry="${ir}" fill="url(#${id}-iris)"/>
          <path d="M${cx - 4.8},-51 Q${cx},-46.8 ${cx + 4.8},-51" stroke="${isF ? "#ffc9df" : "#8aeeff"}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
          <ellipse cx="${cx}" cy="-54.5" rx="3.3" ry="4.5" fill="${ink}"/>
          <circle cx="${cx - 2.7}" cy="-58.6" r="2.8" fill="#fff"/>
          <circle cx="${cx + 3.2}" cy="-51.2" r="1.3" fill="#fff"/>
        </g>
        <rect class="lid${side}" x="${cx - 13}" y="${-56 - ry - 26}" width="26" height="26" fill="${L.skin}"/>
      </g>
      <g class="lash${side}"><path class="lashP${side}" d="M0,0" stroke="${ink}" stroke-width="${isF ? 2.8 : 2.4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      <path class="lower${side}" d="M${cx - 6},${-56 + ry - .5} Q${cx},${-56 + ry + 1.4} ${cx + 6},${-56 + ry - .5}" stroke="${L.skinShade}" stroke-width="1" fill="none" opacity=".8"/>
      <path class="joy${side}" d="M${cx - 8},-54 Q${cx},-63 ${cx + 8},-54" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round" style="display:none"/>
    </g>`;
  };
  const brow = (side: "L" | "R") => {
    const cx = side === "L" ? -15 : 15;
    const inner = side === "L" ? -8 : 8, outer = side === "L" ? -22 : 22;
    return `<g class="brow${side}"><path d="M${outer},-71 Q${cx},${isF ? -76.5 : -75.5} ${inner},-72.5" stroke="${L.brow}" stroke-width="${isF ? 2.2 : 3}" fill="none" stroke-linecap="round"/></g>`;
  };
  const frontHair = isF
    ? `<path d="M-45,-63 C-49,-103 -24,-124 5,-123 C34,-123 51,-100 45,-64 L38,-76 Q34,-91 23,-96 Q19,-85 10,-81 L13,-94 Q2,-80 -10,-82 L-8,-94 Q-18,-84 -28,-86 Q-36,-75 -45,-63 Z" fill="url(#${id}-hair)"/>
       <path d="M-42,-80 Q-48,-45 -38,-14 L-33,-22 Q-39,-45 -35,-69 Z M40,-81 Q48,-47 40,-16 L35,-24 Q39,-47 34,-70 Z" fill="url(#${id}-lock)"/>
       <path d="M-36,-88 Q-31,-110 -10,-114 Q-23,-108 -28,-94 Z M-6,-115 Q12,-119 24,-108 Q11,-111 3,-100 Z" fill="${L.hairHi}" opacity=".48"/>
       <path d="M-32,-103 Q-17,-116 3,-115 M8,-115 Q19,-115 27,-109 M-40,-57 Q-41,-34 -37,-26" stroke="#e1a5ce" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".8"/>
       <path d="M-18,-105 Q-22,-94 -28,-89 M7,-108 Q4,-94 -5,-87 M25,-104 Q27,-94 34,-90 M42,-47 L41,-28" stroke="${L.hairShade}" stroke-width="1.1" fill="none"/>
       <g transform="translate(-33 -91) rotate(-28)"><rect x="-7" y="-2" width="14" height="4" rx="2" fill="#ffe5a5" stroke="#c78761" stroke-width=".6"/><path d="M0,-6 L1.7,-1.8 L6,0 L1.7,1.7 L0,6 L-1.7,1.7 L-6,0 L-1.7,-1.8 Z" fill="#fff1be"/><circle r="1.3" fill="#fff"/></g>`
    : `<path d="M-43,-69 Q-45,-100 -24,-114 Q-8,-125 12,-119 Q31,-120 41,-102 L43,-88 L39,-70 L32,-81 L29,-73 L19,-86 L11,-79 L5,-91 L-5,-78 L-13,-88 L-25,-78 L-28,-88 Z" fill="url(#${id}-hair)"/>
       <path d="M-34,-103 Q-14,-122 9,-115 Q-5,-111 -13,-96 L-17,-88 L-20,-97 L-31,-88 Z" fill="url(#${id}-lock)"/>
       <path d="M-6,-115 Q16,-121 31,-105 L37,-91 L25,-99 L28,-84 L17,-95 L11,-86 L9,-101 L0,-92 Z" fill="url(#${id}-lock)"/>
       <path d="M-42,-72 Q-45,-56 -40,-47 L-36,-62 L-34,-79 Z M40,-74 Q45,-60 40,-47 L36,-62 L34,-82 Z" fill="url(#${id}-hair)"/>
       <path d="M-34,-104 Q-19,-117 -3,-115 Q-17,-109 -23,-99 Z M3,-114 Q17,-116 27,-107 L15,-109 L10,-104 Z" fill="#9bafd5" opacity=".42"/>
       <path d="M-36,-101 Q-24,-115 -10,-116 M-29,-95 L-33,-89 M4,-117 Q17,-119 25,-112 M-41,-63 L-40,-56" stroke="#b4cae8" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>
       <path d="M-10,-107 L-16,-95 M18,-104 L23,-97 M32,-98 L37,-87" stroke="${L.hairShade}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;

  const face = `
    <path d="M-8.5,-22 V3 Q0,9 8.5,3 V-22 Z" fill="url(#${id}-skin)"/>
    <path d="M-8.5,-20 H8.5 V-7 Q0,-3 -8.5,-10 Z" fill="${L.skinShade}" opacity=".65"/>
    <ellipse cx="-41" cy="-56" rx="6.5" ry="9.5" fill="url(#${id}-skin)"/><ellipse cx="41" cy="-56" rx="6.5" ry="9.5" fill="url(#${id}-skin)"/>
    <path d="M-42,-61 Q-46,-56 -41,-51 L-40,-55 M42,-61 Q46,-56 41,-51 L40,-55" stroke="${L.skinShade}" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <path d="M-41,-66 C-42,-97 -21,-111 0,-111 C21,-111 42,-97 41,-66 C41,-40 25,-16 0,-14 C-25,-16 -41,-40 -41,-66 Z" fill="url(#${id}-face)"/>
    <path d="M37,-64 C38,-44 22,-20 0,-17 Q19,-13 33,-34 Q44,-49 41,-68 Z" fill="${L.skinShade}" opacity=".33"/>
    <path d="M-38,-71 Q-41,-47 -26,-30" stroke="#fff2df" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".9"/>
    ${isF ? `<path d="M-44,-46 l2,-3 l2,3 l-2,3 Z M40,-46 l2,-3 l2,3 l-2,3 Z" fill="#ffe5a5"/>` : ""}
    <g class="feat">
      <ellipse class="blushL" cx="-25" cy="-40" rx="9" ry="5.5" fill="url(#${id}-cheek)"/><ellipse class="blushR" cx="25" cy="-40" rx="9" ry="5.5" fill="url(#${id}-cheek)"/>
      <path class="shine" d="M-29,-42.5 l2,-2.6 M-25,-42.5 l2,-2.6 M21,-42.5 l2,-2.6 M25,-42.5 l2,-2.6" stroke="#fff5ed" stroke-width="1" stroke-linecap="round" opacity="0"/>
      ${eye("L")}${eye("R")}${brow("L")}${brow("R")}
      <path d="M-1.6,-42 Q.4,-38.8 2.4,-41.2" stroke="${L.skinShade}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M-1.5,-43.8 L0,-44.4" stroke="#fff6e9" stroke-width="1.4" stroke-linecap="round"/>
      <g class="mouth">
        <path class="mfill" d="M-6,-31 L6,-31 L6,-30 L-6,-30 Z" fill="#591f3a"/>
        <g clip-path="url(#${id}-mouth)"><rect class="teeth" x="-12" y="-40" width="24" height="7.6" fill="#fff9f4"/><ellipse class="tongue" cx="0" cy="-22" rx="6" ry="4" fill="#ff8da3"/></g>
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
