/** A point at `deg` degrees (0 = right, 90 = down) on a circle of radius r around (cx, cy). */
export function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
