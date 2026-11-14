/**
 * 坐不住（A7）的场地：一屏大，没有终点和检查点。平台按 until 一块块塌（提前 2 秒抖），最后什么都不剩，
 * 一个地方抓久了手还会滑（CFG.lastGripMax），所以总有人先掉，最后还挂着的赢。
 * 大家都从中间那块出发，6 个人也站得下；中间那块最先塌。
 */
import type { Level } from './level';

/** 终点放在关卡外面：场地不用它（画面也不画旗子）。 */
const NO_GOAL = { x: -1000, y: -1000, w: 10, h: 10 };

export function arenaLevels(): Level[] {
  return [
    {
      id: 'arena-01',
      world: 'table',
      name: { zh: '转盘', en: 'Lazy Susan' },
      arena: true,
      w: 1280,
      h: 720,
      spawn: { x: 470, y: 446 },
      goal: NO_GOAL,
      checkpoints: [],
      rects: [
        { kind: 'ground', x: 440, y: 470, w: 400, h: 28, material: 'ceramic', until: 22 },
        { kind: 'step', x: 120, y: 560, w: 200, h: 24, material: 'wood', until: 34 },
        { kind: 'step', x: 960, y: 560, w: 200, h: 24, material: 'wood', until: 34 },
        { kind: 'peg', x: 180, y: 300, w: 150, h: 18, material: 'wood', until: 46 },
        { kind: 'peg', x: 950, y: 300, w: 150, h: 18, material: 'wood', until: 46 },
        { kind: 'step', x: 560, y: 170, w: 160, h: 22, material: 'ceramic', until: 60 },
      ],
      spinners: [{ pivot: { x: 640, y: 340 }, arms: 2, len: 110, spin: 0.7, material: 'wood', until: 75 }],
      fading: [
        { x: 30, y: 420, w: 90, h: 20, on: 3, off: 2, until: 85 },
        { x: 1160, y: 420, w: 90, h: 20, on: 3, off: 2, phase: 2.5, until: 85 },
      ],
      // 底下一整锅红油：掉下去就烫死
      hazards: [{ x: 0, y: 680, w: 1280, h: 40, kind: 'hot' }],
      deathY: 800,
    },
    {
      id: 'arena-02',
      world: 'van',
      name: { zh: '海湾浮台', en: 'Harbour Floats' },
      arena: true,
      w: 1280,
      h: 720,
      spawn: { x: 490, y: 456 },
      goal: NO_GOAL,
      checkpoints: [],
      rects: [
        { kind: 'ground', x: 460, y: 480, w: 360, h: 26, material: 'metal', until: 18 },
        { kind: 'step', x: 140, y: 540, w: 180, h: 24, material: 'metal', until: 28 },
        { kind: 'step', x: 960, y: 540, w: 180, h: 24, material: 'metal', until: 28 },
        { kind: 'peg', x: 230, y: 330, w: 140, h: 18, material: 'wood', until: 40 },
        { kind: 'peg', x: 910, y: 330, w: 140, h: 18, material: 'wood', until: 40 },
      ],
      movers: [{ x: 360, y: 220, w: 140, h: 20, material: 'metal', path: [{ x: 780, y: 220 }], speed: 120, wait: 0.6, until: 62 }],
      spinners: [{ pivot: { x: 640, y: 380 }, arms: 3, len: 85, spin: -0.9, material: 'metal', until: 74 }],
      fading: [
        { x: 40, y: 400, w: 90, h: 20, on: 3, off: 2, until: 85 },
        { x: 1150, y: 400, w: 90, h: 20, on: 3, off: 2, phase: 1.5, until: 85 },
      ],
      deathY: 800,
    },
  ];
}

/**
 * 抢金元宝（A9d）的场地：不塌。中间一块台子上放金元宝，左右两块台子是各人站的地方（摔了也回那），
 * 上面几根横杆、一块会动的台子（温哥华）好绕着抢。底下是红油锅（桌上）或者海水（温哥华）：掉下去一秒多以后回自己那边。
 */
export function goldArenas(): Level[] {
  const sides = (y: number): { x: number; y: number }[] => [
    { x: 130, y },
    { x: 1150, y },
    { x: 200, y },
    { x: 1080, y },
    { x: 270, y },
    { x: 1010, y },
  ];
  return [
    {
      id: 'gold-01',
      world: 'table',
      name: { zh: '元宝席', en: 'Gold Banquet' },
      arena: true,
      w: 1280,
      h: 720,
      spawn: { x: 130, y: 496 },
      goal: NO_GOAL,
      checkpoints: [],
      rects: [
        { kind: 'ground', x: 500, y: 430, w: 280, h: 26, material: 'ceramic' },
        { kind: 'step', x: 90, y: 520, w: 220, h: 24, material: 'wood' },
        { kind: 'step', x: 970, y: 520, w: 220, h: 24, material: 'wood' },
        { kind: 'peg', x: 300, y: 300, w: 140, h: 18, material: 'wood' },
        { kind: 'peg', x: 840, y: 300, w: 140, h: 18, material: 'wood' },
        { kind: 'step', x: 560, y: 170, w: 160, h: 22, material: 'ceramic' },
      ],
      hazards: [{ x: 0, y: 680, w: 1280, h: 40, kind: 'hot' }],
      ingot: { x: 640, y: 415 },
      spawns: sides(496),
      deathY: 800,
    },
    {
      id: 'gold-02',
      world: 'van',
      name: { zh: '金元宝浮台', en: 'Gold on the Floats' },
      arena: true,
      w: 1280,
      h: 720,
      spawn: { x: 130, y: 516 },
      goal: NO_GOAL,
      checkpoints: [],
      rects: [
        { kind: 'ground', x: 520, y: 450, w: 240, h: 26, material: 'metal' },
        { kind: 'step', x: 90, y: 540, w: 220, h: 24, material: 'metal' },
        { kind: 'step', x: 970, y: 540, w: 220, h: 24, material: 'metal' },
        { kind: 'peg', x: 250, y: 330, w: 140, h: 18, material: 'wood' },
        { kind: 'peg', x: 890, y: 330, w: 140, h: 18, material: 'wood' },
      ],
      movers: [{ x: 360, y: 210, w: 140, h: 20, material: 'metal', path: [{ x: 780, y: 210 }], speed: 110, wait: 0.8 }],
      ingot: { x: 640, y: 435 },
      spawns: sides(516),
      deathY: 800,
    },
  ];
}
