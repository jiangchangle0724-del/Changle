/**
 * 表情从哪来（A14）：物理给五种（idle、grab、fly、scream、win），画面再看处境加几种：
 * 被摆锤撞晕、底下的水快淹到了吓、手酸了累、在刮着的风里眯眼、过检查点乐。
 * 这里不引 Pixi，主机和手机都用，测试也直接测。
 */
import { CFG } from '../physics/config';
import type { Level } from '../physics/level';
import { windDir, windState } from '../physics/motion';
import type { Face } from '../physics/world';

/** 一个人这一帧的处境：在刮着的风里（lean 是往哪边歪，-1 到 1）、底下的水快淹到了。 */
export interface Mood {
  windy?: boolean;
  lean?: number;
  scared?: boolean;
}

export type Expr = Face | 'dizzy' | 'scared' | 'tired' | 'windy' | 'cheer';

/** 水面离脚不到这么多像素就吓。 */
export const SCARED_GAP = 230;

/**
 * 身体在哪、什么时候、水面在哪 → 处境。风：身体在一块正刮着的风里（歪的方向按风的左右，刮起来那 0.2 秒慢慢歪）；
 * 吓：水面在脚下 SCARED_GAP 像素以内（已经淹到身子一半以上的不算，那时候人已经死了）。
 */
export function moodOf(level: Pick<Level, 'winds'>, time: number, tideY: number | null | undefined, body: { x: number; y: number }, dead: boolean): Mood {
  if (dead) return {};
  const mood: Mood = {};
  for (const w of level.winds ?? []) {
    if (body.x < w.x || body.x > w.x + w.w || body.y < w.y || body.y > w.y + w.h) continue;
    const st = windState(w, time);
    if (!st.on) continue;
    mood.windy = true;
    mood.lean = windDir(w).x * st.k;
    break;
  }
  if (tideY !== undefined && tideY !== null) {
    const gap = tideY - (body.y + CFG.bodyR);
    if (gap < SCARED_GAP && gap > -CFG.bodyR) mood.scared = true;
  }
  return mood;
}

/** 这一帧的表情：摔了、赢了照物理的；不然晕 > 吓 > 累 > 风里 > 乐 > 物理给的。 */
export function pickExpression(face: Face, dead: boolean, s: { dizzy: number; cheer: number; stamina: number; mood: Mood }): Expr {
  if (face === 'scream' || face === 'win' || dead) return face;
  if (s.dizzy > 0) return 'dizzy';
  if (s.mood.scared) return 'scared';
  if (s.stamina < CFG.staminaWarn) return 'tired';
  if (s.mood.windy) return 'windy';
  if (s.cheer > 0) return 'cheer';
  return face;
}
