/**
 * 红包扭蛋机（11-25，14 样的第 5 样）：闯关攒的红包（这台主机上一共拿到过几个，src/host/progress.ts）当钱，
 * 6 个扭一次，扭出一样还没有的（帽子、眼镜、脸、袖子、嗓子，`GACHA` 在 src/look.ts），扭完 12 样就没了。
 * 扭到的这台设备上的人都能选：记在这台设备上（localStorage `hang-on:gacha`：花了几个、扭到了哪些），菜单发给手柄。
 */
import { cleanGacha, GACHA, type GachaId } from '../look';

/** 扭一次几个红包。 */
export const GACHA_PRICE = 6;
const KEY = 'hang-on:gacha';

export interface GachaSave {
  /** 一共花了几个红包。 */
  spent: number;
  got: GachaId[];
}

export function loadGacha(): GachaSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { spent?: unknown; got?: unknown } | null;
    const spent = typeof raw?.spent === 'number' && Number.isFinite(raw.spent) && raw.spent > 0 ? Math.floor(raw.spent) : 0;
    return { spent, got: cleanGacha(raw?.got) };
  } catch {
    return { spent: 0, got: [] };
  }
}

export function saveGacha(s: GachaSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 浏览器不让存
  }
}

/** 手上还有几个红包能扭（攒的减花的）。 */
export function coins(s: GachaSave, total: number): number {
  return Math.max(0, total - s.spent);
}

/** 还剩几样没扭到。 */
export function leftToWin(s: GachaSave): number {
  return GACHA.length - s.got.length;
}

export type Pull = { ok: true; id: GachaId; save: GachaSave } | { ok: false; why: 'poor'; need: number } | { ok: false; why: 'done' };

/** 扭一个：扭完了、红包不够都不扭；不然从还没有的里随便出一样（不会重复）。 */
export function pull(s: GachaSave, total: number, random: () => number = Math.random): Pull {
  const left = GACHA.map((g) => g.id).filter((id) => !s.got.includes(id));
  if (!left.length) return { ok: false, why: 'done' };
  const have = coins(s, total);
  if (have < GACHA_PRICE) return { ok: false, why: 'poor', need: GACHA_PRICE - have };
  const id = left[Math.min(left.length - 1, Math.floor(random() * left.length))] as GachaId;
  return { ok: true, id, save: { spent: s.spent + GACHA_PRICE, got: cleanGacha([...s.got, id]) } };
}
