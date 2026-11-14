/**
 * 单人、多人和三档难度（11-13）：哪关在哪档、几个人能开、大厅里写什么。
 */
import { describe, expect, test } from 'vitest';
import { LEVELS, levelsFor, MULTI_LEVELS, tierOfLevel } from './levels';
import { notReadyText } from './mode-text';
import { maxPlayers, minPlayers, SIDE_MODES, sideFor, tiered } from './sides';

describe('难度', () => {
  test('简单 1 到 6 关和彩蛋关，中等 7 到 12 关，困难 13 号往后；三档加起来就是全部', () => {
    const ids = (t: 0 | 1 | 2) => levelsFor('climb', t).map((l) => l.id);
    expect(ids(0)).toEqual(['table-01', 'table-02', 'table-03', 'table-04', 'table-05', 'table-06', 'bonus-01']);
    expect(ids(1)).toEqual(['van-07', 'van-08', 'van-09', 'van-10', 'van-11', 'van-12']);
    expect(ids(2)[0]).toBe('table-13');
    expect(ids(2).at(-1)).toBe('van-24');
    expect(ids(0).length + ids(1).length + ids(2).length).toBe(LEVELS.length);
    for (const l of LEVELS) expect(levelsFor('climb', tierOfLevel(l))).toContain(l);
  });

  test('多人的一起闯关：这一档有多人的关（levels/multi/）就用多人的，没有就和单人一样', () => {
    for (const t of [0, 1, 2] as const) {
      const multi = MULTI_LEVELS.filter((l) => tierOfLevel(l) === t);
      expect(levelsFor('climb', t, 'multi')).toEqual(multi.length ? multi : levelsFor('climb', t, 'solo'));
      // 比谁先还是单人那一串（一个人过得去的关）
      expect(levelsFor('race', t, 'multi')).toEqual(levelsFor('climb', t, 'solo'));
    }
    expect(tierOfLevel({ ...LEVELS[0]!, tier: 2 })).toBe(2);
  });

  test('闯关、比谁先分难度，坐不住、大团队不分（给了难度也是整串）', () => {
    expect(tiered('climb') && tiered('race')).toBe(true);
    expect(tiered('last') || tiered('team')).toBe(false);
    expect(levelsFor('last', 2)).toBe(levelsFor('last'));
    expect(levelsFor('race', 1)).toEqual(levelsFor('climb', 1));
  });
});

describe('单人和多人', () => {
  test('单人只有闯关、只能一个人；多人至少两个，大团队至少四个', () => {
    expect(SIDE_MODES.solo).toEqual(['climb']);
    expect(SIDE_MODES.multi).toEqual(expect.arrayContaining(['climb', 'race', 'last', 'team']));
    expect([minPlayers('solo', 'climb'), maxPlayers('solo')]).toEqual([1, 1]);
    expect([minPlayers('multi', 'climb'), minPlayers('multi', 'race'), minPlayers('multi', 'last'), minPlayers('multi', 'team')]).toEqual([2, 2, 2, 4]);
    expect(maxPlayers('multi')).toBe(6);
  });

  test('没人点过：一个人是单人，两个人以上是多人', () => {
    expect([0, 1, 2, 6].map(sideFor)).toEqual(['solo', 'solo', 'multi', 'multi']);
  });

  test('开不了的时候大厅里说为什么，中英都有；能开是 null', () => {
    expect(notReadyText(1, 'solo', 'climb')).toBeNull();
    expect(notReadyText(3, 'multi', 'race')).toBeNull();
    expect(notReadyText(2, 'solo', 'climb')?.zh).toContain('单人只能一个人玩');
    expect(notReadyText(1, 'multi', 'climb')).toEqual({ zh: '1 个人。多人至少要 2 个人。', en: '1 player. Multiplayer needs at least 2.' });
    expect(notReadyText(3, 'multi', 'team')?.zh).toContain('至少要 4 个人');
    for (const t of [notReadyText(2, 'solo', 'climb'), notReadyText(1, 'multi', 'last')]) expect(t?.en).toMatch(/[A-Za-z]/);
  });
});
