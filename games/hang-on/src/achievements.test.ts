/** 成就（11-25）：认得的才收，中英都有，一局里谁做了什么就拿什么，同一局只报一次。 */
import { describe, expect, test } from 'vitest';
import { ACHIEVEMENTS, AchvRound, CHATTY_N, cleanAchv, cleanAchvList, type Award, type RoundEnd } from './achievements';
import { LEVELS } from './levels';
import type { Level } from './physics/level';
import { createSim, type SimEvent } from './physics/world';
import { encodeSnap, EventWindow, RemoteSim } from './net/snap';

const ids = (list: Award[]): string[] => list.map((a) => `${a.player}:${a.id}`).sort();
const end = (o: Partial<RoundEnd> = {}): RoundEnd => ({ players: 3, deaths: 2, envelopes: { got: 1, of: 3 }, goals: [{ ok: true }, { ok: false }], ...o });

describe('成就', () => {
  test('每个都有图标、中英文的名字和怎么拿，编号不重复', () => {
    const seen = new Set<string>();
    for (const a of ACHIEVEMENTS) {
      seen.add(a.id);
      for (const t of [a.icon, a.zh, a.en, a.howZh, a.howEn]) expect(t.length, a.id).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(ACHIEVEMENTS.length);
  });

  test('认得的才收；单子去重、按表里的顺序', () => {
    expect(cleanAchv('savior')).toBe('savior');
    for (const bad of ['', 'SAVIOR', 'boom', 1, null, {}]) expect(cleanAchv(bad)).toBeNull();
    expect(cleanAchvList(['gold', 'savior', 'nope', 'gold', 7])).toEqual(['savior', 'gold']);
    expect(cleanAchvList('savior')).toEqual([]);
  });

  test('玩的时候：松手、召唤、接住队友、红包、道具、被撞晕、掉进汤里；别的不算；同一局只报一次', () => {
    const r = new AchvRound({ mode: 'climb', tier: 0, long: false });
    const evs: SimEvent[] = [
      { type: 'betrayal', by: 1, victim: 0 },
      { type: 'summon', player: 2, who: [0] },
      { type: 'summon', player: 0, who: [] },
      { type: 'grab', player: 0, kind: 'player', x: 0, y: 0 },
      { type: 'grab', player: 1, kind: 'terrain', x: 0, y: 0 },
      { type: 'envelope', index: 0, player: 2, x: 0, y: 0 },
      { type: 'item', player: 1, item: 'freeze', ok: true, x: 0, y: 0 },
      { type: 'item', player: 2, item: 'noodle', ok: false, x: 0, y: 0 },
      { type: 'bonk', player: 0, x: 0, y: 0 },
      { type: 'death', player: 1, x: 0, y: 0, cause: 'tide' },
      { type: 'death', player: 2, x: 0, y: 0, cause: 'spike' },
      { type: 'death', player: 2, x: 0, y: 0 },
      { type: 'checkpoint', index: 0 },
    ];
    expect(ids(evs.flatMap((ev) => r.onEvent(ev)))).toEqual(['0:catch', '0:dizzy', '1:gadget', '1:soup', '1:traitor', '2:lucky', '2:savior']);
    expect(evs.flatMap((ev) => r.onEvent(ev)), '同一局第二次不报').toEqual([]);
  });

  test('话痨：一局里第 10 句表情；放屁旁边有人才算熏到', () => {
    const r = new AchvRound({ mode: 'climb', tier: 0, long: false });
    for (let k = 1; k < CHATTY_N; k++) expect(r.onEmote(1)).toEqual([]);
    expect(r.onEmote(0)).toEqual([]);
    expect(r.onEmote(1)).toEqual([{ player: 1, id: 'chatty' }]);
    expect(r.onEmote(1)).toEqual([]);
    expect(r.onFart(2, false)).toEqual([]);
    expect(r.onFart(2, true)).toEqual([{ player: 2, id: 'stinker' }]);
  });

  test('到顶：大家都拿到顶；没人摔、红包全拿、三颗星、困难、长关看这一局', () => {
    const plain = new AchvRound({ mode: 'climb', tier: 0, long: false });
    expect(ids(plain.onWin(undefined, end()))).toEqual(['0:summit', '1:summit', '2:summit']);
    expect(plain.onWin(undefined, end()), '同一局只报一次').toEqual([]);
    const best = new AchvRound({ mode: 'climb', tier: 2, long: true });
    const all = ids(best.onWin(undefined, end({ players: 2, deaths: 0, envelopes: { got: 3, of: 3 }, goals: [{ ok: true }, { ok: true }, { ok: true }] })));
    expect(all).toEqual(['allred', 'clean', 'hard', 'long', 'stars', 'summit'].flatMap((id) => [`0:${id}`, `1:${id}`]).sort());
    const solo = new AchvRound({ mode: 'climb', tier: 1, long: false });
    expect(ids(solo.onWin(undefined, end({ players: 1, deaths: 0, envelopes: { got: 0, of: 0 }, goals: [] }))), '一个人没摔不算「一个都没摔」，没红包的关不算红包全拿').toEqual(['0:summit']);
    const team = new AchvRound({ mode: 'team', tier: 2, long: false });
    expect(ids(team.onWin(undefined, end({ players: 2 }))), '大团队：困难只算闯关的').toEqual(['0:bigteam', '0:summit', '1:bigteam', '1:summit']);
  });

  test('比谁先、坐不住、抢元宝：只有赢的人', () => {
    expect(new AchvRound({ mode: 'race', tier: 0, long: false }).onWin([1], end())).toEqual([{ player: 1, id: 'race' }]);
    expect(ids(new AchvRound({ mode: 'race', tier: 0, long: false }).onWin([0, 2], end()))).toEqual(['0:race', '2:race']);
    expect(new AchvRound({ mode: 'last', tier: 0, long: false }).onWin([2], end())).toEqual([{ player: 2, id: 'last' }]);
    expect(new AchvRound({ mode: 'last', tier: 0, long: false }).onWin([], end()), '一个人玩摔了：没人赢').toEqual([]);
    expect(new AchvRound({ mode: 'gold', tier: 0, long: false }).onWin([0, 9], end()), '不在这一局的人不算').toEqual([{ player: 0, id: 'gold' }]);
  });

  test('手机局：解锁跟着快照走到每部手机，只冒一次', async () => {
    const level = LEVELS[0] as Level;
    const sim = await createSim(level, 2);
    const win = new EventWindow();
    const view = new RemoteSim(() => level, level);
    const got: SimEvent = { type: 'achv', player: 1, id: 'savior', x: 10, y: 20 };
    win.push([got]);
    expect(view.apply(encodeSnap(sim, 1, win.take()), 1000)).toEqual([got]);
    win.sent();
    expect(view.apply(encodeSnap(sim, 2, win.take()), 1050)).toEqual([]);
    sim.destroy();
  });
});
