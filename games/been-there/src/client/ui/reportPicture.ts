// The report card (战报) as a picture to keep or send: 1080 × 1350 (the shape of a phone's photo), drawn
// on a canvas in the game's own fonts and colours, from the same standings, awards and dice as the card
// on the finale. Made only when someone asks for it.
import type { RoomView } from "../../room/protocol";
import { money, t, type Key } from "../i18n";
import { TEAM_COLORS, TEAM_LETTERS, seatName, teamOf } from "./common";
import { LONG_RUN, awards, diceOf, type Award } from "./tripReport";

export const PICTURE = { w: 1080, h: 1350 };

/** Today, the way the exit stamp prints it. */
function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}·${p(d.getMonth() + 1)}·${p(d.getDate())}`;
}

/** A rounded rectangle's path (a plain one where the canvas is too old for rounded ones). */
function box(x: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, r: number) {
  x.beginPath();
  if (typeof x.roundRect === "function") x.roundRect(left, top, w, h, r);
  else x.rect(left, top, w, h);
}

/** Cut `text` to `max` pixels wide with an ellipsis, in the context's font. */
function fit(x: CanvasRenderingContext2D, text: string, max: number) {
  if (x.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && x.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** The picture, or null where a canvas can't be had. `awardText` says what an award was for. */
export async function drawReport(v: RoomView, awardText: (a: Award) => string): Promise<HTMLCanvasElement | null> {
  const g = v.game;
  if (!g?.tally) return null;
  const css = getComputedStyle(document.documentElement);
  const font = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const display = font("--display", "sans-serif");
  const displayZh = font("--display-zh", "sans-serif");
  const text = font("--font", "sans-serif");
  const ui = font("--ui", "sans-serif");
  const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const night = color("--night", "#0e0c22");
  const dusk = color("--dusk", "#181633");
  const moon = color("--moon", "#f5f4fd");
  const haze = color("--haze", "#b6b4d0");
  const dim = color("--dim", "#7f7c9d");
  const gel = color("--gel", "#ff8a6b");
  // (the fonts a page hasn't used yet load first, or the canvas would draw in the fallback)
  await Promise.all(
    [`800 96px ${displayZh}`, `800 56px ${display}`, `700 40px ${text}`, `400 30px ${text}`, `700 32px ${ui}`].map((f) =>
      document.fonts ? document.fonts.load(f).catch(() => []) : Promise.resolve([]),
    ),
  );
  const c = document.createElement("canvas");
  c.width = PICTURE.w;
  c.height = PICTURE.h;
  const x = c.getContext("2d");
  if (!x) return null;
  const { w, h } = PICTURE;
  const left = 80;
  const right = w - 80;

  // The night, with the game's warm light from the top.
  x.fillStyle = night;
  x.fillRect(0, 0, w, h);
  const glow = x.createRadialGradient(w / 2, -120, 40, w / 2, -120, 900);
  glow.addColorStop(0, "rgba(255, 138, 107, 0.34)");
  glow.addColorStop(1, "rgba(255, 138, 107, 0)");
  x.fillStyle = glow;
  x.fillRect(0, 0, w, h);

  // The title, and the day.
  x.textBaseline = "alphabetic";
  x.fillStyle = moon;
  x.font = `800 96px ${displayZh}`;
  x.fillText(t("title"), left, 150);
  x.fillStyle = gel;
  x.font = `800 44px ${display}`;
  x.fillText(`${t("reportTitle")} · ${today()}`, left, 212);

  // The standings, the winners first.
  const s = g.s;
  const order = s.ps.map((_, seat) => seat).sort((a, b) => (b === s.winner ? 1 : 0) - (a === s.winner ? 1 : 0) || g.worth[b] - g.worth[a]);
  let y = 270;
  const row = order.length > 4 ? 84 : 96;
  order.forEach((seat, rank) => {
    const team = teamOf(v, seat);
    const won = seat === s.winner;
    x.fillStyle = won ? "rgba(255, 138, 107, 0.16)" : dusk;
    box(x, left - 20, y, right - left + 40, row - 14, 22);
    x.fill();
    const mid = y + (row - 14) / 2;
    x.fillStyle = won ? gel : haze;
    x.font = `800 48px ${display}`;
    x.textBaseline = "middle";
    x.fillText(String(rank + 1), left, mid + 2);
    x.fillStyle = TEAM_COLORS[team?.color ?? 0];
    x.beginPath();
    x.arc(left + 92, mid, 28, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = night;
    x.font = `700 30px ${ui}`;
    x.textAlign = "center";
    x.fillText(TEAM_LETTERS[team?.color ?? 0], left + 92, mid + 2);
    x.textAlign = "left";
    x.fillStyle = moon;
    x.font = `700 40px ${text}`;
    const worth = money(g.worth[seat]);
    x.font = `800 52px ${display}`;
    const worthW = x.measureText(worth).width;
    x.font = `700 40px ${text}`;
    x.fillText(fit(x, seatName(v, seat), right - worthW - (left + 140) - 30), left + 140, mid + 2);
    x.font = `800 52px ${display}`;
    x.textAlign = "right";
    x.fillStyle = won ? gel : moon;
    x.fillText(worth, right, mid + 4);
    x.textAlign = "left";
    y += row;
  });

  // The awards.
  y += 24;
  x.textBaseline = "alphabetic";
  for (const a of awards(g.tally)) {
    x.fillStyle = gel;
    x.font = `700 34px ${text}`;
    const kind = t(`award_${a.kind}` as Key);
    x.fillText(kind, left, y + 34);
    const kindW = x.measureText(kind).width;
    x.fillStyle = moon;
    x.font = `400 32px ${text}`;
    const who = a.seats.map((seat) => seatName(v, seat)).join("、");
    x.fillText(fit(x, `${who} · ${awardText(a)}`, right - left - kindW - 24), left + kindW + 24, y + 34);
    y += 60;
  }

  // How the dice fell: a bar for each total, a dot where the long run would have it.
  const dice = diceOf(g.tally);
  const chartTop = Math.max(y + 90, h - 300);
  x.fillStyle = gel;
  x.font = `700 34px ${text}`;
  x.fillText(t("reportDiceTitle"), left, chartTop - 34);
  const chartH = 120;
  const bw = 58;
  const gap = (right - left - bw * 11) / 10;
  const expected = LONG_RUN.map((p) => p * dice.throws);
  const top = Math.max(1, ...dice.totals, ...expected);
  dice.totals.forEach((n, i) => {
    const bx = left + i * (bw + gap);
    const bh = Math.max(2, (n / top) * chartH);
    x.fillStyle = haze;
    box(x, bx, chartTop + chartH - bh, bw, bh, 8);
    x.fill();
    x.fillStyle = gel;
    x.beginPath();
    x.arc(bx + bw / 2, chartTop + chartH - (expected[i] / top) * chartH, 7, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = dim;
    x.font = `700 26px ${ui}`;
    x.textAlign = "center";
    x.fillText(String(i + 2), bx + bw / 2, chartTop + chartH + 38);
    x.textAlign = "left";
  });
  x.fillStyle = haze;
  x.font = `400 28px ${text}`;
  x.fillText(fit(x, t("reportDiceShort", { n: dice.throws, avg: dice.avg.toFixed(1), d: dice.doubles }), right - left), left, chartTop + chartH + 92);

  // Where it's from.
  x.fillStyle = dim;
  x.font = `700 26px ${ui}`;
  x.textAlign = "right";
  x.fillText("changle.ca/trip", right, h - 40);
  x.textAlign = "left";
  return c;
}
