/**
 * 观众（11-26）在画面上的东西，主机页（大屏）和手机局的手机共用：起哄从右下角往上飘、
 * 投出来的那一样起作用时盖一层（刮风的风丝、变轻的小羽毛、变重压暗、慢动作发蓝）。
 * 样式自己带（第一次用时塞一个 <style>），两页的颜色变量一样。少动画时不飘不动，只是出现、消失。
 */
import { cheerOf, FX, type CheerId, type FxId } from './crowd';
import { tr } from './i18n';

const CSS = `
.cheers { position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  width: min(340px, 46vw); height: 46vh; pointer-events: none; z-index: 26; overflow: hidden; }
.cheer { position: absolute; right: 0; bottom: 0; display: inline-flex; align-items: center; gap: 8px; max-width: 100%;
  background: var(--panel); backdrop-filter: blur(6px); color: var(--ink); border-radius: 999px; padding: 6px 14px 6px 8px;
  font-weight: 700; font-size: var(--cheer-size, 18px); white-space: nowrap; animation: cheer-up 2.6s cubic-bezier(.2, .7, .3, 1) forwards; }
.cheer .em { font-size: 1.5em; line-height: 1; }
.cheer .who { overflow: hidden; text-overflow: ellipsis; opacity: .9; }
.cheer.bet { background: var(--warn); color: var(--card-ink); }
@keyframes cheer-up { 0% { opacity: 0; transform: translate(var(--cheer-x, 0px), 20px) scale(.8); } 12% { opacity: 1; transform: translate(var(--cheer-x, 0px), 0) scale(1); }
  80% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--cheer-x, 0px), calc(-46vh + 40px)); } }
.crowd-fx { position: fixed; inset: 0; pointer-events: none; z-index: 3; opacity: 0; transition: opacity .4s; }
.crowd-fx.on { opacity: 1; }
.crowd-fx.wind { background: repeating-linear-gradient(176deg, transparent 0 46px, rgba(255,255,255,.10) 46px 49px, transparent 49px 120px);
  background-size: 360px 100%; animation: wind-blow .5s linear infinite; }
.crowd-fx.wind.left { animation-direction: reverse; }
@keyframes wind-blow { to { background-position: 360px 0; } }
.crowd-fx.float { background: radial-gradient(circle at 20% 80%, rgba(255,255,255,.34) 0 4px, transparent 5px) 0 0 / 140px 160px,
  radial-gradient(circle at 70% 30%, rgba(255,255,255,.26) 0 3px, transparent 4px) 0 0 / 190px 210px; animation: float-up 3s linear infinite; }
@keyframes float-up { to { background-position: 0 -160px, 0 -210px; } }
.crowd-fx.heavy { background: linear-gradient(to bottom, rgba(10,8,20,.55), transparent 30%, transparent 58%, rgba(10,8,20,.72)); }
.crowd-fx.slow { background: rgba(110, 160, 255, .14); box-shadow: inset 0 0 220px rgba(40, 80, 200, .5); }
@media (prefers-reduced-motion: reduce) {
  .cheer { animation: cheer-still 2.6s linear forwards; }
  @keyframes cheer-still { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
  .crowd-fx.wind, .crowd-fx.float { animation: none; }
}
`;

let styled = false;
function style(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head?.append(s);
}

/** 起哄的那一层（没有就在 body 里做一个）。 */
function layer(): HTMLElement {
  style();
  let el = document.getElementById('cheers');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cheers';
    el.className = 'cheers';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  return el;
}

/** 飘一句：表情、谁。bet 是押中、没押中那一句（黄底）。同时最多飘 12 个，多了先去掉最早的。 */
export function floatLine(emoji: string, text: string, bet = false): void {
  const box = layer();
  while (box.children.length >= 12) box.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = bet ? 'cheer bet' : 'cheer';
  // 左右错开一点，几个人一起起哄不叠在一条线上
  el.style.setProperty('--cheer-x', `${-Math.round(Math.random() * 60)}px`);
  const em = document.createElement('span');
  em.className = 'em';
  em.textContent = emoji;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = text;
  el.append(em, who);
  box.append(el);
  setTimeout(() => el.remove(), 2700);
}

/** 观众起了个哄：「😂 小王：哈哈哈」。 */
export function floatCheer(who: string, cheer: CheerId): void {
  const c = cheerOf(cheer);
  floatLine(c.emoji, `${who}：${tr(c.zh, c.en)}`);
}

/** 盖在画面上的那一层（没有就做一个），投出来的那一样起作用时换上它的样子，过了就拿掉。 */
export function setFxLayer(fx: FxId | null, dir = 1): void {
  let el = document.getElementById('crowdFx');
  if (!fx || fx === 'strong') {
    if (el) el.className = 'crowd-fx';
    return;
  }
  style();
  if (!el) {
    el = document.createElement('div');
    el.id = 'crowdFx';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  el.className = `crowd-fx on ${fx}${fx === 'wind' && dir < 0 ? ' left' : ''}`;
}

/** 起哄从多高开始往上飘（大屏右下角有观众条时飘在它上面）。 */
export function cheersAbove(px: number): void {
  const el = document.getElementById('cheers');
  if (el) el.style.bottom = `calc(${Math.round(px)}px + env(safe-area-inset-bottom, 0px))`;
}

/** 这一局第一个掉的、押中的观众：「👀 阿一 先掉！押中：小王、小李」。 */
export function betText(fell: string, hits: readonly string[]): string {
  return hits.length ? tr(`${fell} 先掉！押中的：${hits.join('、')}`, `${fell} fell first! Called it: ${hits.join(', ')}`) : tr(`${fell} 先掉，观众没押中`, `${fell} fell first. Nobody called it`);
}

/** 投票的两样：「🪶 变轻」。 */
export function fxName(fx: FxId): string {
  return `${FX[fx].emoji} ${tr(FX[fx].zh, FX[fx].en)}`;
}
