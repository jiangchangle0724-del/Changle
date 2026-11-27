/** 扭蛋机那 12 样（src/look-art.ts）的笔接到 Pixi 的 Graphics 上：主机游戏里、手机局的画面里画。 */
import type { Graphics } from 'pixi.js';
import type { Pen } from '../look-art';

export function pixiPen(g: Graphics): Pen {
  const pen: Pen = {
    poly(points, close = true) {
      g.moveTo(points[0] ?? 0, points[1] ?? 0);
      for (let i = 2; i + 1 < points.length; i += 2) g.lineTo(points[i] as number, points[i + 1] as number);
      if (close) g.closePath();
      return pen;
    },
    circle(x, y, r) {
      g.circle(x, y, r);
      return pen;
    },
    ellipse(x, y, rx, ry) {
      g.ellipse(x, y, rx, ry);
      return pen;
    },
    rect(x, y, w, h, radius = 0) {
      if (radius > 0) g.roundRect(x, y, w, h, radius);
      else g.rect(x, y, w, h);
      return pen;
    },
    arc(x, y, r, a0, a1, close = false) {
      g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a1);
      if (close) g.closePath();
      return pen;
    },
    curve(x0, y0, cx, cy, x1, y1) {
      g.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1);
      return pen;
    },
    fill(color, alpha = 1) {
      g.fill({ color, alpha });
      return pen;
    },
    stroke(width, color, alpha = 1) {
      g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
      return pen;
    },
  };
  return pen;
}
