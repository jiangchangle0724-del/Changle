/* Dev only: both performers in fixed faces and poses, side by side, for checking the drawing. */
import { Performer, restAim, type Face, type Kind, type Target } from "../src/party/tune/performer";

const FACES: [string, Partial<Face>][] = [
  ["rest", {}],
  ["blink", { lidL: 1, lidR: 1 }],
  ["wink", { lidR: 1, smile: 0.9, blush: 0.7 }],
  ["joy ^^", { happy: 1, smile: 1, open: 0.5, wide: 1.3 }],
  ["sing ah", { open: 0.9, wide: 1.25, brow: 0.4 }],
  ["sing oo", { open: 0.55, wide: 0.8 }],
  ["eyes shut", { lidL: 0.92, lidR: 0.92, open: 0.7, brow: 0.5 }],
  ["sad", { browSad: 0.9, smile: -0.45, lidL: 0.34, lidR: 0.34 }],
  ["fierce", { brow: -0.6, smile: 0.2, open: 0.25 }],
  ["love", { blush: 1, smile: 0.8, lidL: 0.2, lidR: 0.2, gaze: 0.8 }],
];
type P = Target;
const POSES = (sx: number, hip: number): [string, P][] => [
  ["rest", {}],
  ["arms up", { hLx: 100 - (sx + 30), hLy: 100, hRx: 100 + (sx + 30), hRy: 100 }],
  ["hips", { hLx: 100 - (sx + 12), hLy: 190, hRx: 100 + (sx + 12), hRy: 190 }],
  ["chest + reach", { hLx: 106, hLy: 166, fingL: -110, hRx: 100 + sx + 46, hRy: 140, fingR: -115 }],
  ["cheek heart", { hRx: 100 + sx + 20, hRy: 112, fingR: -200, hLx: 100 - (sx + 10), hLy: 192, headTilt: 10 }],
  ["self hug", { hLx: 117, hLy: 158, hRx: 83, hRy: 160, headTilt: -6, headNod: 2.5 }],
  ["kick", { fRx: 100 + hip + 47, fRy: 240, px: -6, lean: -8, hLx: 100 - (sx + 26), hLy: 140, hRx: 100 + sx + 30, hRy: 128 }],
  ["crouch", { py: 9, hLx: 100 - (sx + 16), hLy: 206, hRx: 100 + sx + 16, hRy: 206, headNod: 3 }],
  ["jump", { py: -18, fLx: 100 - (hip + 5), fLy: 258, fRx: 100 + hip + 5, fRy: 258, hLx: 100 - (sx + 30), hLy: 100, hRx: 100 + sx + 30, hRy: 100 }],
  ["point", { hRx: 100 + sx + 40, hRy: 96, hLx: 100 - (sx + 12), hLy: 190, px: -5, lean: -6, headTilt: 6 }],
];

const root = document.getElementById("root")!;
const mk = (tag: string, css: string, text = "") => {
  const el = document.createElement(tag);
  el.style.cssText = css;
  el.textContent = text;
  return el;
};
const q = new URLSearchParams(location.search);
const size = Number(q.get("h") ?? 220);
for (const kind of ["m", "f"] as Kind[]) {
  for (const [rowName, list] of [
    ["faces", FACES.map(([n, f]) => [n, f, {}] as const)],
    ["poses", POSES(kind === "m" ? 27 : 23, kind === "m" ? 10 : 9).map(([n, p]) => [n, {}, p] as const)],
  ] as const) {
    const row = mk("div", "display:flex;gap:6px;padding:8px 12px;align-items:flex-end;flex-wrap:wrap");
    row.append(mk("div", "color:#fff;font:600 13px sans-serif;width:56px", `${kind} ${rowName}`));
    for (const [name, face, pose] of list) {
      const cell = mk("div", "display:flex;flex-direction:column;align-items:center;background:#241640;border-radius:10px;padding:4px 2px");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const crop = rowName === "faces" ? "50 10 100 130" : "30 6 140 296";
      svg.setAttribute("viewBox", crop);
      svg.style.cssText = `height:${rowName === "faces" ? size * 0.62 : size}px;overflow:${rowName === "faces" ? "hidden" : "visible"}`;
      cell.append(svg, mk("div", "color:#cbb8ff;font:12px sans-serif;margin-top:2px", name));
      row.append(cell);
      const p = new Performer(svg, kind, kind === "m" ? 1 : -1);
      p.place({ ...restAim(kind), ...pose });
      Object.assign(p.face, face);
      p.render(0);
    }
    root.append(row);
  }
}
