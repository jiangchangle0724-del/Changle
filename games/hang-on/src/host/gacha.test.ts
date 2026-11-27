/** 红包扭蛋机（11-25）：钱不够不扭，扭出来的不重复，12 样扭完就没了；没扭到的样子选不了、主机画默认。 */
import { describe, expect, test } from 'vitest';
import { choices, cleanGacha, cleanLook, DEFAULT_LOOK, GACHA, isLocked, LOOK_LISTS, lockLook, randomLook, stepLook } from '../look';
import { coins, GACHA_PRICE, leftToWin, pull, type GachaSave } from './gacha';

describe('红包扭蛋机', () => {
  test('红包不够不扭，说还差几个；够了扭一样，花掉 6 个', () => {
    const s: GachaSave = { spent: 0, got: [] };
    expect(pull(s, GACHA_PRICE - 2)).toEqual({ ok: false, why: 'poor', need: 2 });
    const r = pull(s, 20, () => 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe(GACHA[0].id);
    expect(r.save).toEqual({ spent: GACHA_PRICE, got: [GACHA[0].id] });
    expect(coins(r.save, 20)).toBe(20 - GACHA_PRICE);
    expect(s, '原来的不改').toEqual({ spent: 0, got: [] });
  });

  test('扭出来的不重复，12 样扭完就说扭完了', () => {
    let s: GachaSave = { spent: 0, got: [] };
    const seen = new Set<string>();
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let k = 0; k < GACHA.length; k++) {
      const r = pull(s, 1000, random);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(seen.has(r.id), r.id).toBe(false);
      seen.add(r.id);
      s = r.save;
    }
    expect(leftToWin(s)).toBe(0);
    expect(pull(s, 1000)).toEqual({ ok: false, why: 'done' });
    expect(s.spent).toBe(GACHA.length * GACHA_PRICE);
  });

  test('扭蛋机里的每样都在那一项的单子里，名字不重', () => {
    const ids = new Set<string>();
    for (const g of GACHA) {
      expect((LOOK_LISTS[g.key] as readonly string[]).includes(g.id), `${g.key}.${g.id}`).toBe(true);
      ids.add(g.id);
    }
    expect(ids.size).toBe(GACHA.length);
    expect(cleanGacha(['tiger', 'nope', 'tiger', 3, 'caishen'])).toEqual(['caishen', 'tiger']);
  });

  test('没扭到的：选不了、随机不出、主机换回默认；扭到了就能选', () => {
    const none = new Set<string>();
    const some = new Set<string>(['tiger', 'meow']);
    expect(isLocked('hat', 'tiger', none)).toBe(true);
    expect(isLocked('hat', 'tiger', some)).toBe(false);
    expect(isLocked('voice', 'opera', none), '老的歌剧嗓子不是扭蛋机里的').toBe(false);
    expect(choices('hat', none)).not.toContain('tiger');
    expect(choices('hat', some)).toContain('tiger');
    const wearing = cleanLook({ ...DEFAULT_LOOK, hat: 'tiger', glasses: 'heart', voice: 'meow' });
    expect(lockLook(wearing, some)).toEqual({ ...DEFAULT_LOOK, hat: 'tiger', voice: 'meow' });
    expect(lockLook(wearing, none)).toEqual(DEFAULT_LOOK);
    // 一个一个往后翻：没扭到的跳过
    let look = DEFAULT_LOOK;
    const hats: string[] = [];
    for (let k = 0; k < 20; k++) {
      look = stepLook(look, 'hat', 1, some);
      hats.push(look.hat);
    }
    expect(hats).toContain('tiger');
    expect(hats.some((h) => ['caishen', 'lion', 'helmet', 'party'].includes(h))).toBe(false);
    // 戴着别处扭到的：往后一个是第一个
    expect(stepLook(wearing, 'hat', 1, none).hat).toBe('none');
    for (let k = 0; k < 100; k++) {
      const r = randomLook(Math.random, none);
      expect(lockLook(r, none)).toEqual(r);
    }
  });
});
