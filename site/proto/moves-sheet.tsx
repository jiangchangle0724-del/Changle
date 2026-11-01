/* Dev only: every dance move and singer's gesture, beat by beat, as the poses they land on, for both
 * performers. ?kind=f for her, ?s=-1 to lead with the other hand, ?only=kpop,jump for a few. */
import { gesture, MOVES, type Ctx, type Gesture, type Key } from "../src/party/tune/moves";
import { Performer, restAim, type Kind } from "../src/party/tune/performer";

const q = new URLSearchParams(location.search);
const kind = (q.get("kind") === "f" ? "f" : "m") as Kind;
const s = Number(q.get("s") ?? 1);
const only = q.get("only")?.split(",");
const size = Number(q.get("h") ?? 150);
const look = { m: { sx: 27, hip: 10 }, f: { sx: 23, hip: 9 } }[kind];
const ctx: Ctx = { kind, sx: look.sx, hip: look.hip, s, inw: kind === "m" ? 1 : -1 };
const GESTS: Gesture[] = ["chest", "reach", "open", "up", "point", "fist", "pray", "chop", "ear"];
const rows: [string, (b: number) => Key[]][] = [
  ...Object.keys(MOVES).map((id) => [id, (b: number) => MOVES[id].beat(b, ctx)] as [string, (b: number) => Key[]]),
  ...GESTS.map((g) => [`sing: ${g}`, (b: number) => gesture(g, b, ctx)] as [string, (b: number) => Key[]]),
].filter(([name]) => !only || only.some((o) => name.includes(o)));

const root = document.getElementById("root")!;
const mk = (tag: string, css: string, text = "") => {
  const el = document.createElement(tag);
  el.style.cssText = css;
  el.textContent = text;
  return el;
};
root.append(mk("div", "color:#fff;font:600 14px sans-serif;padding:8px 12px", `${kind === "m" ? "him" : "her"}, leading with ${s > 0 ? "the right" : "the left"} hand (screen)`));
for (const [name, beat] of rows) {
  const row = mk("div", "display:flex;gap:4px;padding:4px 12px;align-items:flex-end");
  row.append(mk("div", "color:#fff;font:600 12px sans-serif;width:90px", name));
  // each cell replays the move from rest up to its beat and shows where it lands
  for (let b = 0; b < 8; b++) {
    const cell = mk("div", "display:flex;flex-direction:column;align-items:center;background:#241640;border-radius:8px;padding:2px");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "20 0 160 300");
    svg.style.cssText = `height:${size}px;overflow:visible`;
    cell.append(svg, mk("div", "color:#cbb8ff;font:11px sans-serif", `beat ${b + 1}`));
    row.append(cell);
    const p = new Performer(svg, kind, ctx.inw);
    p.place(restAim(kind));
    for (let i = 0; i <= b; i++) for (const k of beat(i)) if (k.to) p.place(k.to);
  }
  root.append(row);
}
