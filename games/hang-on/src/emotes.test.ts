/** 表情（11-25）：认得的才收，字短得能装进头顶的气泡，手机局跟着快照走到每部手机。 */
import { describe, expect, test } from 'vitest';
import { cleanEmote, EMOTES, emoteWords, FART_KINDS, FART_WORDS, fartKind } from './emotes';
import { LEVELS } from './levels';
import type { Level } from './physics/level';
import { createSim, type SimEvent } from './physics/world';
import { encodeSnap, EventWindow, RemoteSim } from './net/snap';

describe('表情', () => {
  test('认得的才收，别的都不要', () => {
    for (const e of EMOTES) expect(cleanEmote(e.id)).toBe(e.id);
    for (const bad of ['', 'HELP', 'boom', 1, null, undefined, {}, ['help']]) expect(cleanEmote(bad)).toBeNull();
  });

  test('每句中文、英文都有，短得能装进头顶的气泡', () => {
    const ids = new Set<string>();
    for (const e of EMOTES) {
      ids.add(e.id);
      const w = emoteWords(e.id);
      expect(w.zh.length, e.id).toBeGreaterThan(0);
      expect(w.en.length, e.id).toBeGreaterThan(0);
      expect([...w.zh].length, `${e.id} 中文`).toBeLessThanOrEqual(4);
      expect(w.en.length, `${e.id} English`).toBeLessThanOrEqual(10);
    }
    expect(ids.size, '没有重复的').toBe(EMOTES.length);
    expect(EMOTES.length, '手柄上两行四个').toBe(8);
  });

  test('手机局：表情跟着快照走到每部手机，只冒一次', async () => {
    const level = LEVELS[0] as Level;
    const sim = await createSim(level, 2);
    const win = new EventWindow();
    const view = new RemoteSim(() => level, level);
    const say: SimEvent = { type: 'emote', player: 1, emote: 'help', x: 100.26, y: 50 };
    win.push([say]);
    const got = view.apply(encodeSnap(sim, 1, win.take()), 1000);
    expect(got).toEqual([{ ...say, x: 100.3 }]);
    win.sent();
    expect(view.apply(encodeSnap(sim, 2, win.take()), 1050), '下一张还带着，不再冒').toEqual([]);
    sim.destroy();
  });

  test('放屁键：主机挑的声音在 0 到 FART_KINDS-1 之间；大厅里那一下中英都有', () => {
    for (const r of [0, 0.2, 0.34, 0.5, 0.67, 0.99, 0.999999]) {
      const k = fartKind(() => r);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(FART_KINDS);
    }
    expect(new Set([0, 0.5, 0.9].map((r) => fartKind(() => r))).size, '三种都挑得到').toBe(FART_KINDS);
    expect(FART_WORDS.zh.length).toBeGreaterThan(0);
    expect(FART_WORDS.en.length).toBeGreaterThan(0);
  });

  test('手机局：放屁跟着快照走到每部手机，声音种类不变，只响一次', async () => {
    const level = LEVELS[0] as Level;
    const sim = await createSim(level, 2);
    const win = new EventWindow();
    const view = new RemoteSim(() => level, level);
    const toot: SimEvent = { type: 'fart', player: 0, kind: 2, x: 40, y: 80.04 };
    win.push([toot]);
    expect(view.apply(encodeSnap(sim, 1, win.take()), 1000)).toEqual([{ ...toot, y: 80 }]);
    win.sent();
    expect(view.apply(encodeSnap(sim, 2, win.take()), 1050)).toEqual([]);
    sim.destroy();
  });
});
