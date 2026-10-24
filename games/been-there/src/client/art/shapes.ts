// Region shapes as SVG paths centred on (0, 0): colour is never the only cue on the board.
import type { Shape } from "../../engine";

export function shapePath(shape: Shape, r: number): string {
  const pts = (n: number, rr: (i: number) => number, rot = -Math.PI / 2) =>
    "M" +
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return `${(Math.cos(a) * rr(i)).toFixed(2)} ${(Math.sin(a) * rr(i)).toFixed(2)}`;
    }).join("L") +
    "Z";
  switch (shape) {
    case "triangle":
      return `M0 ${-r}L${r * 0.95} ${r * 0.72}H${-r * 0.95}Z`;
    case "circle":
      return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    case "diamond":
      return `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`;
    case "square":
      return `M${-r * 0.82} ${-r * 0.82}h${r * 1.64}v${r * 1.64}h${-r * 1.64}Z`;
    case "star":
      return pts(10, (i) => (i % 2 ? r * 0.45 : r));
    case "hexagon":
      return pts(6, () => r, 0);
    case "plus": {
      const a = r * 0.34;
      return `M${-a} ${-r}h${2 * a}v${r - a}h${r - a}v${2 * a}h${a - r}v${r - a}h${-2 * a}v${a - r}h${a - r}v${-2 * a}h${r - a}Z`;
    }
    default:
      return `M${-r} ${r * 0.1}q${r / 2} ${-r} ${r} 0t${r} 0v${r * 0.8}h${-2 * r}Z`;
  }
}
