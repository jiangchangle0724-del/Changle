/**
 * 糯米团的样子（换装）：帽子、眼镜、眼睛。手柄页选，经房间发给主机，主机画。
 * 手套颜色不在这里：左蓝右橙是辨左右用的，不能换（3 米外要分得清）。馅儿色跟座位走。
 * 这个文件手柄页也要用，不能 import Pixi。
 */

export const HATS = ['none', 'knob', 'chef', 'bow', 'crown', 'ears', 'bun', 'beanie', 'halo'] as const;
export const GLASSES = ['none', 'round', 'shades', 'monocle', 'star'] as const;
export const EYES = ['round', 'happy', 'sleepy', 'wink', 'big'] as const;

export type Hat = (typeof HATS)[number];
export type Glasses = (typeof GLASSES)[number];
export type Eyes = (typeof EYES)[number];

export interface Look {
  hat: Hat;
  glasses: Glasses;
  eyes: Eyes;
}

export const DEFAULT_LOOK: Look = { hat: 'none', glasses: 'none', eyes: 'round' };

/** 玩家看得到的名字，中英都有。 */
export const LOOK_NAMES = {
  hat: {
    none: { zh: '不戴', en: 'None' },
    knob: { zh: '瓜皮帽', en: 'Skullcap' },
    chef: { zh: '厨师帽', en: 'Chef hat' },
    bow: { zh: '蝴蝶结', en: 'Bow' },
    crown: { zh: '皇冠', en: 'Crown' },
    ears: { zh: '猫耳朵', en: 'Cat ears' },
    bun: { zh: '丸子头', en: 'Hair bun' },
    beanie: { zh: '毛线帽', en: 'Beanie' },
    halo: { zh: '光环', en: 'Halo' },
  },
  glasses: {
    none: { zh: '不戴', en: 'None' },
    round: { zh: '圆眼镜', en: 'Round glasses' },
    shades: { zh: '墨镜', en: 'Shades' },
    monocle: { zh: '单片镜', en: 'Monocle' },
    star: { zh: '星星镜', en: 'Star glasses' },
  },
  eyes: {
    round: { zh: '圆眼', en: 'Round' },
    happy: { zh: '眯眯眼', en: 'Happy' },
    sleepy: { zh: '困困眼', en: 'Sleepy' },
    wink: { zh: '眨一只', en: 'Wink' },
    big: { zh: '大眼', en: 'Big' },
  },
} as const;

/** 把网上来的东西收拾成合法的 Look（不认识的值回默认）。 */
export function cleanLook(raw: unknown): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
  return {
    hat: pick(HATS, r.hat, DEFAULT_LOOK.hat),
    glasses: pick(GLASSES, r.glasses, DEFAULT_LOOK.glasses),
    eyes: pick(EYES, r.eyes, DEFAULT_LOOK.eyes),
  };
}

export function randomLook(random: () => number = Math.random): Look {
  const one = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  return { hat: one(HATS), glasses: one(GLASSES), eyes: one(EYES) };
}
