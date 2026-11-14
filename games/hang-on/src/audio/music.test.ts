/**
 * 背景音乐（11-13）：曲子写得对不对、紧张怎么变成各层和速度、局面怎么算紧张、合成的声音音高对不对。
 * 都是纯函数，node 里跑，不用 WebAudio。
 */
import { describe, expect, test } from 'vitest';
import { levelById } from '../levels';
import type { Level } from '../physics/level';
import type { PlayerView, SimView } from '../render/view';
import { bpmFor, degreeMidi, degreeOf, layersFor, notesAt, transposeOf } from './composer';
import { drumSamples, partials, pluck, toneSamples } from './music';
import { dropBelow, moodOf, playerDanger, rawIntensity, Tension } from './tension';
import { seedOf, themeFor, THEMES } from './themes';

const themes = Object.values(THEMES);

describe('曲子', () => {
  test('每段旋律两小节、每小节 16 格，只用认得的字；伴奏、低音、鼓都是 16 格', () => {
    for (const t of themes) {
      expect(t.chords.length).toBe(4);
      expect(t.scale.length).toBe(5);
      for (const [a, b] of t.melody) for (const bar of [a, b]) expect(bar, `${t.id} ${bar}`).toMatch(/^[0-9a-e.-]{16}$/);
      for (const p of [t.arp.calm, t.arp.groove]) expect(p, t.id).toMatch(/^[0-4.]{16}$/);
      for (const p of [t.bass.groove, t.bass.crisis]) expect(p, t.id).toMatch(/^[rfo.-]{16}$/);
      for (const set of [t.drums.groove, t.drums.crisis]) for (const p of Object.values(set)) expect(p, t.id).toMatch(/^[xo.]{16}$/);
      expect(t.bpm[1]).toBeGreaterThan(t.bpm[0]);
    }
  });

  test('旋律的音都在调里（每关调高调低以后也是）', () => {
    for (const t of themes)
      for (const seed of [0, 1, 2]) {
        const tr = transposeOf(seed);
        const pcs = new Set(t.scale.map((s) => (((t.root + tr + s) % 12) + 12) % 12));
        for (let bar = 0; bar < 16; bar++)
          for (let step = 0; step < 16; step++)
            for (const n of notesAt(t, bar, step, layersFor(0.5), seed))
              if (n.part === 'lead') expect(pcs.has((((n.midi as number) % 12) + 12) % 12), `${t.id} ${n.midi}`).toBe(true);
      }
  });

  test('音域：旋律、琶音、低音都在听着舒服的地方', () => {
    for (const t of themes)
      for (const seed of [0, 1, 2])
        for (let bar = 0; bar < 16; bar++)
          for (let step = 0; step < 16; step++)
            for (const n of notesAt(t, bar, step, layersFor(0.95), seed)) {
              if (n.part === 'lead') expect(n.midi).toBeGreaterThanOrEqual(52), expect(n.midi).toBeLessThanOrEqual(96);
              if (n.part === 'arp') expect(n.midi).toBeGreaterThanOrEqual(40), expect(n.midi).toBeLessThanOrEqual(90);
              if (n.part === 'bass') expect(n.midi).toBeGreaterThanOrEqual(26), expect(n.midi).toBeLessThanOrEqual(64);
              if (n.part === 'pad') for (const m of n.chord ?? []) expect(m).toBeGreaterThanOrEqual(40), expect(m).toBeLessThanOrEqual(80);
            }
  });

  test('旋律的字：0 是主音，5 是高八度，a 是低八度的主音', () => {
    const t = THEMES.table!;
    expect(degreeOf('0')).toBe(0);
    expect(degreeOf('a')).toBe(-5);
    expect(degreeOf('.')).toBeNull();
    expect(degreeMidi(t, 0)).toBe(t.root);
    expect(degreeMidi(t, 5)).toBe(t.root + 12);
    expect(degreeMidi(t, -5)).toBe(t.root - 12);
  });

  test('每个场景有自己的曲子：难关和坐不住是小调版，没写的场景先用年夜饭桌', () => {
    const lv = (id: string): Level => levelById(id) as Level;
    expect(themeFor(lv('table-01'), false).id).toBe('table');
    expect(themeFor(lv('van-07'), false).id).toBe('van');
    expect(themeFor(lv('table-13'), true).id).toBe('table-hard');
    expect(themeFor(lv('van-21'), true).id).toBe('van-hard');
    expect(themeFor({ world: 'van', arena: true }, false).id).toBe('van-hard');
    expect(themeFor({ world: 'kitchen' }, false).id).toBe('kitchen');
    expect(themeFor({ world: 'kitchen' }, true).id).toBe('kitchen-hard');
    expect(themeFor({ world: 'snow' }, false).id).toBe('snow');
    expect(themeFor({ world: 'snow', arena: true }, false).id).toBe('snow-hard');
    expect(themeFor({ world: 'space' }, false).id).toBe('table');
    expect(seedOf('table-01')).not.toBe(seedOf('table-02'));
  });
});

describe('紧张 → 音乐', () => {
  test('安静时只有铺底和慢琶音；平常在爬有旋律和低音；危险时整套鼓；危机时加密、速度到最快', () => {
    const calm = layersFor(0.06);
    expect(calm.lead + calm.bass + calm.groove + calm.crisis).toBe(0);
    expect(calm.pad).toBe(1);
    const climb = layersFor(0.42);
    expect(climb.lead).toBe(1);
    expect(climb.bass).toBe(1);
    expect(climb.crisis).toBe(0);
    expect(layersFor(0.7).groove).toBe(1);
    expect(layersFor(0.95).crisis).toBe(1);
    for (const t of themes) {
      expect(bpmFor(t, 0.4)).toBe(t.bpm[0]);
      expect(bpmFor(t, 1)).toBe(t.bpm[1]);
      expect(bpmFor(t, 0.8)).toBeGreaterThan(t.bpm[0]);
    }
  });

  test('危机时鼓比平常密，琵琶轮指（一格两下）', () => {
    const t = THEMES.table!;
    const count = (i: number): number => {
      let n = 0;
      for (let step = 0; step < 16; step++) n += notesAt(t, 0, step, layersFor(i), 0).filter((x) => ['kick', 'snare', 'hat', 'perc', 'cym', 'tom'].includes(x.part)).length;
      return n;
    };
    expect(count(0.95)).toBeGreaterThan(count(0.6) + 4);
    const arp = notesAt(t, 0, 1, layersFor(0.95), 0).find((n) => n.part === 'arp');
    expect(arp?.repeat).toBe(2);
  });
});

/** 一个人：在 (x, y)，抓着几只手，往下多快。 */
function who(x: number, y: number, grips: number, vy = 0, extra: Partial<PlayerView> = {}): PlayerView {
  const arm = (on: boolean, side: -1 | 1) => ({ side, hand: { x, y }, pts: [], grip: on ? { t: 1 } : null });
  return { id: 0, color: '#fff', body: { x, y, vx: 0, vy }, arms: [arm(grips > 0, -1), arm(grips > 1, 1)], aim: { x, y }, dead: false, deadT: 0, deaths: 0, face: 'calm' as PlayerView['face'], ...extra };
}

/** 左边一块地，右边深坑，坑边上一排尖刺。 */
const field: Level = {
  id: 'music-test',
  w: 2000,
  h: 1000,
  spawn: { x: 100, y: 500 },
  goal: { x: 1800, y: 100, w: 150, h: 150 },
  rects: [{ x: 0, y: 540, w: 600, h: 200, kind: 'ground' }],
  hazards: [{ x: 1200, y: 500, w: 100, h: 40, kind: 'spike' }],
  deathY: 1100,
};

describe('局面 → 紧张', () => {
  test('脚下多远：站在地上是 0 左右，坑上面是到摔死线', () => {
    expect(dropBelow(field, 300, 516)).toBeLessThan(30);
    expect(dropBelow(field, 900, 300)).toBeGreaterThanOrEqual(600);
  });

  test('站在地上不危险；两只手挂在坑上有点危险；一只手更危险；往下掉、贴着尖刺最危险；冻住算安全', () => {
    const stand = playerDanger(field, who(300, 516, 0));
    const two = playerDanger(field, who(900, 300, 2));
    const one = playerDanger(field, who(900, 300, 1));
    const fall = playerDanger(field, who(900, 300, 0, 900));
    const spike = playerDanger(field, who(1250, 470, 2));
    const frozen = playerDanger(field, who(900, 300, 0, 0, { itemOn: 'freeze' }));
    expect(stand).toBe(0);
    expect(two).toBeGreaterThan(0.2);
    expect(one).toBeGreaterThan(two);
    expect(fall).toBeGreaterThan(0.9);
    expect(spike).toBeGreaterThan(0.6);
    expect(frozen).toBeLessThanOrEqual(0.05);
  });

  const view = (players: PlayerView[], extra: Partial<SimView> = {}): SimView =>
    ({ level: field, time: 10, won: false, checkpoint: -1, players, ropes: [], props: [], fadings: [], springs: [], ...extra }) as SimView;

  test('最危险的那个人为主；比谁先有人到了、坐不住剩两个人、准时的星快没了都会催', () => {
    const safe = moodOf(view([who(300, 516, 0), who(320, 516, 0)]));
    const oneInDanger = moodOf(view([who(300, 516, 0), who(900, 300, 1)]));
    expect(safe.danger).toBe(0);
    expect(oneInDanger.danger).toBeGreaterThan(0.45);
    expect(moodOf(view([who(300, 516, 0), who(320, 516, 0, 0, { done: true })], { rules: { mode: 'race' } })).push).toBe(0.8);
    expect(moodOf(view([who(300, 516, 0), who(320, 516, 0)], { rules: { mode: 'last' } })).push).toBe(0.85);
    expect(moodOf(view([who(300, 516, 0)], { time: 95 }), { timeTarget: 100 }).push).toBeGreaterThan(0.5);
    expect(rawIntensity({ danger: 0, push: 0 })).toBeCloseTo(0.3);
    expect(rawIntensity({ danger: 1, push: 1 })).toBe(1);
  });

  test('平滑：紧张起来快（一秒内），放松慢；摔死往上顶，过检查点松一口气', () => {
    const t = new Tension();
    t.reset(0.3);
    for (let i = 0; i < 60; i++) t.update(0.95, 1 / 60);
    expect(t.level).toBeGreaterThan(0.85);
    for (let i = 0; i < 60; i++) t.update(0.3, 1 / 60);
    expect(t.level).toBeGreaterThan(0.6);
    const before = t.level;
    t.events([{ type: 'death', player: 0, x: 0, y: 0 } as never]);
    expect(t.level).toBeGreaterThan(before + 0.2);
    t.reset(0.5);
    t.events([{ type: 'checkpoint', index: 0, x: 0, y: 0 } as never]);
    expect(t.level).toBeLessThan(0.35);
  });
});

/** 估一个音的频率：在预计的周期附近（0.8 到 1.25 倍）找自相关最大的那个滞后，抛物线插值。 */
function pitchNear(d: Float32Array, sr: number, f: number): number {
  const from = Math.floor(sr * 0.05);
  const len = Math.floor(sr * 0.2);
  const P = sr / f;
  const corr = (lag: number): number => {
    let s = 0;
    for (let i = from; i < from + len; i++) s += (d[i] as number) * (d[i + lag] as number);
    return s;
  };
  let best = Math.round(0.8 * P);
  let bestV = -Infinity;
  for (let lag = Math.round(0.8 * P); lag <= Math.round(1.25 * P); lag++) {
    const v = corr(lag);
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  const a = corr(best - 1);
  const c = corr(best + 1);
  const shift = (a - c) / (2 * (a - 2 * bestV + c) || 1);
  return sr / (best + shift);
}

describe('合成的声音', () => {
  const sr = 48000;
  test('拨弦（古筝、琵琶）的音高对（高音也差不到 5 音分），会衰减', () => {
    for (const [kind, midi] of [['zheng', 62], ['zheng', 81], ['zheng', 97], ['pipa', 57], ['bass-cny', 38]] as const) {
      const d = toneSamples(sr, kind, midi);
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      expect(Math.abs(pitchNear(d, sr, f) / f - 1), `${kind} ${midi}`).toBeLessThan(0.003);
      const head = d.slice(0, sr * 0.1).reduce((s, v) => s + v * v, 0);
      const tail = d.slice(d.length - sr * 0.1).reduce((s, v) => s + v * v, 0);
      expect(tail).toBeLessThan(head / 20);
    }
  });

  test('马林巴、卡林巴、圆低音的音高对', () => {
    for (const [kind, midi] of [['marimba', 64], ['kalimba', 76], ['bass-coast', 40]] as const) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      expect(Math.abs(pitchNear(toneSamples(sr, kind, midi), sr, f) / f - 1), `${kind} ${midi}`).toBeLessThan(0.01);
    }
  });

  test('两套鼓的每一样都是有限的数，不爆（峰值 ≤ 0.9）', () => {
    for (const kit of ['cny', 'coast'] as const)
      for (const drum of ['kick', 'snare', 'hat', 'perc', 'cym', 'tom'] as const) {
        const d = drumSamples(sr, kit, drum);
        let peak = 0;
        for (const v of d) {
          expect(Number.isFinite(v)).toBe(true);
          peak = Math.max(peak, Math.abs(v));
        }
        expect(peak, `${kit} ${drum}`).toBeGreaterThan(0.3);
        expect(peak).toBeLessThanOrEqual(0.9001);
      }
  });

  test('拨弦和泛音的底子也能单独用', () => {
    expect(pluck(sr, 220, 0.2, 1, 0.5).length).toBe(sr * 0.2);
    expect(partials(sr, 220, 0.2, [[1, 1, 1]]).length).toBe(sr * 0.2);
  });
});
