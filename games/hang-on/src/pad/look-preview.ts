/**
 * 糯米团的小预览：2D canvas 画一个，看选的帽子、眼镜、眼睛、脸、袖子。手柄页的换装和主机大厅的座位卡都用它。
 * 和主机游戏里的 Pixi 画法是两套（手柄页不能带 Pixi），形状尽量一样。
 */
import { ARM_COLORS, GLOVES, type Look } from '../look';

const INK = '#2a1f3a';
const OUTLINE = '#3a2a2a';

export function drawLook(canvas: HTMLCanvasElement, look: Look, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const R = W * 0.22;
  ctx.translate(W / 2, H * 0.58);
  ctx.scale(R / 24, R / 24);
  const circle = (x: number, y: number, r: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  };
  // 手套和短胳膊
  ctx.lineCap = 'round';
  for (const [side, glove] of [
    [-1, GLOVES[0]],
    [1, GLOVES[1]],
  ] as const) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(side * 14, -8);
    ctx.quadraticCurveTo(side * 38, -30, side * 44, -4);
    ctx.stroke();
    ctx.strokeStyle = ARM_COLORS[look.arms] ?? ARM_COLORS.noodle;
    ctx.lineWidth = 10;
    ctx.stroke();
    circle(side * 44, -4, 12.5, OUTLINE);
    circle(side * 44, -4, 10, glove);
  }
  circle(0, 0, 26.5, OUTLINE);
  circle(0, 0, 24, color);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.beginPath();
  ctx.ellipse(-7, -10, 9, 5, 0, 0, 7);
  ctx.fill();
  circle(-14, 4, 4.2, 'rgba(240,90,110,.35)');
  circle(14, 4, 4.2, 'rgba(240,90,110,.35)');
  // 眼睛
  const eyeY = -4;
  const big = look.eyes === 'big';
  for (const side of [-1, 1]) {
    const ex = side * 8;
    if (look.eyes === 'happy' || (look.eyes === 'wink' && side === 1)) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ex - 5, eyeY + 1);
      ctx.quadraticCurveTo(ex, eyeY - 5, ex + 5, eyeY + 1);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, big ? 7 : 5.5, big ? 7.5 : 6, 0, 0, 7);
    ctx.fill();
    circle(ex, eyeY, big ? 3.6 : 3, INK);
    circle(ex - 1, eyeY - 1, 1.1, '#fff');
    if (look.eyes === 'sleepy') {
      ctx.fillStyle = color;
      ctx.fillRect(ex - 7.5, eyeY - 8, 15, 6.5);
    }
  }
  // 嘴
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-5, 9);
  ctx.quadraticCurveTo(0, 12.5, 5, 9);
  ctx.stroke();
  // 脸上的小东西
  drawExtras(ctx, look, circle);
  // 眼镜
  ctx.lineWidth = 2.2;
  if (look.glasses === 'round') {
    ctx.strokeStyle = INK;
    for (const ex of [-8, 8]) {
      ctx.beginPath();
      ctx.arc(ex, eyeY, 8, 0, 7);
      ctx.stroke();
    }
  } else if (look.glasses === 'shades') {
    ctx.fillStyle = INK;
    for (const x of [-16, 2]) {
      ctx.beginPath();
      ctx.roundRect(x, eyeY - 6, 14, 11, 4);
      ctx.fill();
    }
  } else if (look.glasses === 'monocle') {
    ctx.strokeStyle = '#f8c56d';
    ctx.beginPath();
    ctx.arc(8, eyeY, 8.5, 0, 7);
    ctx.stroke();
  } else if (look.glasses === 'star') {
    ctx.strokeStyle = '#f28ca6';
    ctx.lineWidth = 2;
    for (const ex of [-8, 8]) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 4.5 : 9.5;
        ctx.lineTo(ex + Math.cos(a) * r, eyeY + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  // 帽子
  const top = -24;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  const dome = (fill: string, y: number): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, y, 22, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  switch (look.hat) {
    case 'knob':
      dome('#2b2f5c', top + 12);
      ctx.strokeStyle = '#f8c56d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-21, top + 12);
      ctx.lineTo(21, top + 12);
      ctx.stroke();
      circle(0, top - 10, 4, '#e8413c');
      break;
    case 'chef':
      for (const [x, y, r] of [
        [-10, top - 12, 9],
        [10, top - 12, 9],
        [0, top - 18, 11],
      ] as const) {
        circle(x, y, r + 2.5, OUTLINE);
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(-15.5, top - 4.5, 31, 14, 4);
      ctx.fill();
      for (const [x, y, r] of [
        [-10, top - 12, 9],
        [10, top - 12, 9],
        [0, top - 18, 11],
      ] as const) circle(x, y, r, '#fff');
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(-13, top - 2, 26, 10, 3);
      ctx.fill();
      break;
    case 'bow':
      ctx.fillStyle = '#e8413c';
      for (const dir of [0, 1]) {
        ctx.beginPath();
        ctx.moveTo(12, top + 6);
        ctx.lineTo(dir ? 24 : 0, top + 1);
        ctx.lineTo(12, top - 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      circle(12, top, 3.5, '#ffd166');
      break;
    case 'crown':
      ctx.fillStyle = '#f8c56d';
      ctx.beginPath();
      ctx.moveTo(-14, top + 6);
      ctx.lineTo(-14, top - 10);
      ctx.lineTo(-7, top - 2);
      ctx.lineTo(0, top - 14);
      ctx.lineTo(7, top - 2);
      ctx.lineTo(14, top - 10);
      ctx.lineTo(14, top + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      circle(-7, top + 1, 2, '#e8413c');
      circle(7, top + 1, 2, '#63b3ed');
      circle(0, top - 4, 2, '#9bcf83');
      break;
    case 'ears':
      for (const s of [-1, 1]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 8, top + 6);
        ctx.lineTo(s * 20, top - 12);
        ctx.lineTo(s * 22, top + 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f6a5b5';
        ctx.beginPath();
        ctx.moveTo(s * 11, top + 5);
        ctx.lineTo(s * 18, top - 6);
        ctx.lineTo(s * 19, top + 7);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'bun':
      ctx.fillStyle = '#3a2a2a';
      ctx.beginPath();
      ctx.arc(0, top + 10, 22, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      circle(0, top - 8, 11, OUTLINE);
      circle(0, top - 8, 9, '#3a2a2a');
      break;
    case 'beanie':
      dome('#5a6ad8', top + 10);
      ctx.fillStyle = '#4553b8';
      ctx.beginPath();
      ctx.roundRect(-22, top + 6, 44, 7, 3);
      ctx.fill();
      ctx.stroke();
      circle(0, top - 13, 7.5, OUTLINE);
      circle(0, top - 13, 5.5, '#fff6e9');
      break;
    case 'halo':
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, top - 12, 15, 5, 0, 0, 7);
      ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
}

function drawExtras(ctx: CanvasRenderingContext2D, look: Look, circle: (x: number, y: number, r: number, fill: string) => void): void {
  switch (look.face) {
    case 'mustache':
      ctx.fillStyle = '#3a2a2a';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.quadraticCurveTo(s * 5, 0.5, s * 10, 4.5);
        ctx.quadraticCurveTo(s * 12.5, 7.5, s * 9, 8);
        ctx.quadraticCurveTo(s * 6, 6, 0, 7);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'freckles':
      for (const s of [-1, 1]) {
        for (const [x, y] of [
          [12, 6],
          [15.5, 8.5],
          [10.5, 9.5],
          [16, 4.5],
        ] as const) circle(s * x, y, 1.2, 'rgba(154,90,58,.75)');
      }
      break;
    case 'bandage':
      ctx.save();
      ctx.translate(12, 7);
      ctx.rotate(0.45);
      ctx.fillStyle = '#f3d0a0';
      ctx.strokeStyle = '#b08a60';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-8, -3, 16, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fbe6c8';
      ctx.fillRect(-3, -2.4, 6, 4.8);
      circle(-5.5, 0, 0.7, '#b08a60');
      circle(5.5, 0, 0.7, '#b08a60');
      ctx.restore();
      break;
    case 'beard':
      ctx.fillStyle = '#5a3a2a';
      ctx.beginPath();
      ctx.arc(0, 0, 23.5, 0.25, Math.PI - 0.25);
      ctx.arc(0, 3, 16, Math.PI - 0.45, 0.45, true);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
}
