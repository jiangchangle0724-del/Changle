/**
 * 糯米团的样子（换装）：帽子、眼镜、眼睛、脸上的小东西、袖子、嗓子。手柄页选，经房间发给主机，主机画、主机出声。
 * 手套颜色不在这里：左蓝右橙是辨左右用的，不能换（3 米外要分得清）。馅儿色跟座位走。
 * 这个文件手柄页也要用，不能 import Pixi。
 */

export const HATS = ['none', 'knob', 'chef', 'bow', 'crown', 'ears', 'bun', 'beanie', 'halo'] as const;
export const GLASSES = ['none', 'round', 'shades', 'monocle', 'star'] as const;
export const EYES = ['round', 'happy', 'sleepy', 'wink', 'big'] as const;
export const FACES = ['none', 'mustache', 'freckles', 'bandage', 'beard'] as const;
/** 袖子（胳膊）的颜色。没有蓝和橙：那是手套的颜色，袖子用了就分不清左右手。 */
export const ARMS = ['noodle', 'chili', 'matcha', 'sesame', 'taro'] as const;
/** 嗓子：摔下去时怎么叫。auto = 按座位分四个音高。 */
export const VOICES = ['auto', 'high', 'low', 'duck', 'robot', 'opera'] as const;

export type Hat = (typeof HATS)[number];
export type Glasses = (typeof GLASSES)[number];
export type Eyes = (typeof EYES)[number];
export type Face = (typeof FACES)[number];
export type Arms = (typeof ARMS)[number];
export type Voice = (typeof VOICES)[number];

export interface Look {
  hat: Hat;
  glasses: Glasses;
  eyes: Eyes;
  face: Face;
  arms: Arms;
  voice: Voice;
}

/** 手套：左蓝右橙，不能换。主机画、手柄页的抓键和预览都用这两个色。 */
export const GLOVES = ['#63b3ed', '#f6ad55'] as const;

export const DEFAULT_LOOK: Look = { hat: 'none', glasses: 'none', eyes: 'round', face: 'none', arms: 'noodle', voice: 'auto' };

/** 换装的几项，按手柄页上的顺序。 */
export const LOOK_KEYS = ['hat', 'glasses', 'eyes', 'face', 'arms', 'voice'] as const;
export type LookKey = (typeof LOOK_KEYS)[number];
export const LOOK_LISTS: { [K in LookKey]: readonly Look[K][] } = { hat: HATS, glasses: GLASSES, eyes: EYES, face: FACES, arms: ARMS, voice: VOICES };

/** 袖子的颜色（内芯；外面一圈深色描边不变）。 */
export const ARM_COLORS: Record<Arms, string> = {
  noodle: '#f6e7c8',
  chili: '#e8584a',
  matcha: '#8fc77a',
  sesame: '#5a5048',
  taro: '#a98bd6',
};

type Name = { zh: string; en: string };

/** 玩家看得到的名字，中英都有。 */
export const LOOK_NAMES: { [K in LookKey]: Record<Look[K], Name> } & { label: Record<LookKey, Name> } = {
  label: {
    hat: { zh: '帽子', en: 'Hat' },
    glasses: { zh: '眼镜', en: 'Glasses' },
    eyes: { zh: '眼睛', en: 'Eyes' },
    face: { zh: '脸', en: 'Face' },
    arms: { zh: '袖子', en: 'Sleeves' },
    voice: { zh: '嗓子', en: 'Voice' },
  },
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
    round: { zh: '圆眼镜', en: 'Round' },
    shades: { zh: '墨镜', en: 'Shades' },
    monocle: { zh: '单片镜', en: 'Monocle' },
    star: { zh: '星星镜', en: 'Stars' },
  },
  eyes: {
    round: { zh: '圆眼', en: 'Round' },
    happy: { zh: '眯眯眼', en: 'Happy' },
    sleepy: { zh: '困困眼', en: 'Sleepy' },
    wink: { zh: '眨一只', en: 'Wink' },
    big: { zh: '大眼', en: 'Big' },
  },
  face: {
    none: { zh: '素颜', en: 'Plain' },
    mustache: { zh: '八字胡', en: 'Mustache' },
    freckles: { zh: '雀斑', en: 'Freckles' },
    bandage: { zh: '创可贴', en: 'Band-aid' },
    beard: { zh: '络腮胡', en: 'Beard' },
  },
  arms: {
    noodle: { zh: '面条', en: 'Noodle' },
    chili: { zh: '辣椒', en: 'Chili' },
    matcha: { zh: '抹茶', en: 'Matcha' },
    sesame: { zh: '芝麻', en: 'Sesame' },
    taro: { zh: '芋头', en: 'Taro' },
  },
  voice: {
    auto: { zh: '默认', en: 'Default' },
    high: { zh: '尖嗓', en: 'Squeaky' },
    low: { zh: '粗嗓', en: 'Deep' },
    duck: { zh: '鸭子', en: 'Duck' },
    robot: { zh: '机器人', en: 'Robot' },
    opera: { zh: '歌剧', en: 'Opera' },
  },
};

/** 把网上来的东西收拾成合法的 Look（不认识的值回默认）。 */
export function cleanLook(raw: unknown): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
  return {
    hat: pick(HATS, r.hat, DEFAULT_LOOK.hat),
    glasses: pick(GLASSES, r.glasses, DEFAULT_LOOK.glasses),
    eyes: pick(EYES, r.eyes, DEFAULT_LOOK.eyes),
    face: pick(FACES, r.face, DEFAULT_LOOK.face),
    arms: pick(ARMS, r.arms, DEFAULT_LOOK.arms),
    voice: pick(VOICES, r.voice, DEFAULT_LOOK.voice),
  };
}

export function randomLook(random: () => number = Math.random): Look {
  const one = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  return { hat: one(HATS), glasses: one(GLASSES), eyes: one(EYES), face: one(FACES), arms: one(ARMS), voice: one(VOICES) };
}

/** 换到这一项的上一个 / 下一个。 */
export function stepLook(look: Look, key: LookKey, dir: number): Look {
  const list = LOOK_LISTS[key] as readonly string[];
  const i = (list.indexOf(look[key]) + dir + list.length * 4) % list.length;
  return { ...look, [key]: list[i] } as Look;
}
