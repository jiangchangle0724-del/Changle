/**
 * 观众玩法（11-26）的账：押谁先掉、起哄挡太密、投票开票数票、收拾观众发来的。
 */
import { describe, expect, test } from 'vitest';
import { CHEER_GAP_MS, cleanCrowdIn, CrowdBook, FX, fxBanner, VOTE_FIRST_MS, VOTE_GAP_MS, VOTE_OPEN_MS } from './crowd';

const P = ['seatA0001', 'seatB0002', 'local'];

describe('押谁先掉', () => {
  test('开局前押、开局锁上，第一个掉的才算，押中的记一次', () => {
    const b = new CrowdBook(() => 0);
    expect(b.bet('w1', 'seatA0001', P)).toBe(true);
    expect(b.bet('w2', 'seatB0002', P)).toBe(true);
    expect(b.bet('w3', 'seatA0001', P)).toBe(true);
    expect(b.bet('w3', 'seatA0001', P)).toBe(false); // 没变
    expect(b.bet('w4', 'nobody', P)).toBe(false); // 不在玩的人
    b.start(0, P);
    expect(b.betCount).toBe(3);
    expect(b.bet('w2', 'seatA0001', P)).toBe(false); // 开局了不能改
    expect(b.fell('seatA0001')).toEqual(['w1', 'w3']);
    expect(b.fell('seatB0002')).toBeNull(); // 第二个掉的不算
    expect(b.first).toBe('seatA0001');
    expect(Object.fromEntries(b.hits)).toEqual({ w1: 1, w3: 1 });
  });

  test('押的留到下一局；押的人走了这一局不算；没人押中是空的', () => {
    const b = new CrowdBook(() => 0);
    b.bet('w1', 'seatB0002', P);
    b.start(0, P);
    expect(b.fell('local')).toEqual([]);
    b.stop();
    expect(b.open).toBe(true);
    expect(b.bets.get('w1')).toBe('seatB0002');
    b.start(0, ['seatA0001', 'local']); // 二号走了
    expect(b.betCount).toBe(0);
    expect(b.fell('seatA0001')).toEqual([]);
    expect(b.best()).toBeNull();
  });

  test('不在玩的时候掉的不算；最准的观众', () => {
    const b = new CrowdBook(() => 0);
    expect(b.fell('seatA0001')).toBeNull();
    b.bet('w1', 'seatA0001', P);
    b.bet('w2', 'seatA0001', P);
    b.start(0, P);
    b.fell('seatA0001');
    b.stop();
    b.bet('w2', 'local', P);
    b.start(0, P);
    b.fell('local');
    expect(b.best()).toEqual({ id: 'w2', hits: 2 });
  });
});

describe('起哄', () => {
  test('同一个观众太密的挡掉，别人不挡', () => {
    const b = new CrowdBook();
    expect(b.cheer('w1', 1000)).toBe(true);
    expect(b.cheer('w1', 1100)).toBe(false);
    expect(b.cheer('w2', 1100)).toBe(true);
    expect(b.cheer('w1', 1000 + CHEER_GAP_MS)).toBe(true);
  });
});

describe('投票', () => {
  test('开局 20 秒开一轮：左边帮一把、右边捣个乱；10 秒后数票，多的赢，隔 35 秒再来', () => {
    const b = new CrowdBook(() => 0);
    b.start(0, P);
    expect(b.tick(VOTE_FIRST_MS - 1, 2)).toEqual({});
    const o = b.tick(VOTE_FIRST_MS, 2).open!;
    expect(FX[o[0]].help).toBe(true);
    expect(FX[o[1]].help).toBe(false);
    expect(b.castVote('w1', 1, VOTE_FIRST_MS + 10)).toBe(true);
    expect(b.castVote('w2', 1, VOTE_FIRST_MS + 20)).toBe(true);
    expect(b.castVote('w3', 0, VOTE_FIRST_MS + 30)).toBe(true);
    expect(b.castVote('w3', 0, VOTE_FIRST_MS + 40)).toBe(false); // 没变
    expect(b.count()).toEqual([1, 2]);
    expect(b.tick(VOTE_FIRST_MS + VOTE_OPEN_MS - 1, 2)).toEqual({});
    expect(b.tick(VOTE_FIRST_MS + VOTE_OPEN_MS, 2)).toEqual({ done: { fx: o[1], n: [1, 2] } });
    expect(b.castVote('w1', 0, VOTE_FIRST_MS + VOTE_OPEN_MS + 1)).toBe(false); // 投完了
    const at = VOTE_FIRST_MS + VOTE_OPEN_MS;
    expect(b.tick(at + VOTE_GAP_MS - 1, 2)).toEqual({});
    expect(b.tick(at + VOTE_GAP_MS, 2).open).toBeDefined();
  });

  test('没人投什么都不发生；一样多随机挑；没有观众不开；力气满要有手酸', () => {
    const b = new CrowdBook(() => 0.99);
    b.start(0, P);
    expect(b.tick(VOTE_FIRST_MS, 0)).toEqual({}); // 没有观众
    expect(b.tick(VOTE_FIRST_MS + VOTE_GAP_MS, 1, (fx) => fx !== 'strong').open?.[0]).not.toBe('strong');
    expect(b.tick(VOTE_FIRST_MS + VOTE_GAP_MS + VOTE_OPEN_MS, 1)).toEqual({ done: { fx: null, n: [0, 0] } });
    const t = VOTE_FIRST_MS + 2 * VOTE_GAP_MS + VOTE_OPEN_MS;
    const o = b.tick(t, 1).open!;
    b.castVote('w1', 0, t);
    b.castVote('w2', 1, t);
    expect(b.tick(t + VOTE_OPEN_MS, 1).done).toEqual({ fx: o[1], n: [1, 1] }); // 0.99 挑右边
  });

  test('结算了就不投了，开着的那轮作废', () => {
    const b = new CrowdBook(() => 0);
    b.start(0, P);
    b.tick(VOTE_FIRST_MS, 1);
    expect(b.vote).not.toBeNull();
    b.stop();
    expect(b.vote).toBeNull();
    expect(b.tick(VOTE_FIRST_MS + VOTE_OPEN_MS, 1)).toEqual({});
  });

  test('给观众的账：还剩几毫秒、各几票、谁投了哪边', () => {
    const b = new CrowdBook(() => 0);
    b.bet('w1', 'local', P);
    b.start(0, P);
    const o = b.tick(VOTE_FIRST_MS, 1).open!;
    b.castVote('w1', 0, VOTE_FIRST_MS + 4000);
    const s = b.state(VOTE_FIRST_MS + 4000, { phase: 'playing', mode: 'climb', level: { zh: '一', en: 'One' }, players: [] }, null);
    expect(s.vote).toEqual({ a: o[0], b: o[1], left: VOTE_OPEN_MS - 4000, n: [1, 0], mine: { w1: 0 } });
    expect(s.bets).toEqual({ w1: 'local' });
    expect(s.open).toBe(false);
  });
});

describe('收拾', () => {
  test('认识的留下，别的不要', () => {
    expect(cleanCrowdIn({ do: 'hello' })).toEqual({ do: 'hello' });
    expect(cleanCrowdIn({ do: 'bet', on: 'seatA0001' })).toEqual({ do: 'bet', on: 'seatA0001' });
    expect(cleanCrowdIn({ do: 'bet', on: '<script>' })).toBeNull();
    expect(cleanCrowdIn({ do: 'cheer', e: 'lol' })).toEqual({ do: 'cheer', e: 'lol' });
    expect(cleanCrowdIn({ do: 'cheer', e: 'boo' })).toBeNull();
    expect(cleanCrowdIn({ do: 'vote', v: 1 })).toEqual({ do: 'vote', v: 1 });
    expect(cleanCrowdIn({ do: 'vote', v: 2 })).toBeNull();
    expect(cleanCrowdIn(null)).toBeNull();
    expect(cleanCrowdIn({ do: 'start' })).toBeNull();
  });

  test('每样都有中英文的横幅，刮风说往哪边', () => {
    for (const fx of Object.keys(FX) as (keyof typeof FX)[]) {
      const t = fxBanner(fx);
      expect(t.zh.length).toBeGreaterThan(3);
      expect(t.en.length).toBeGreaterThan(3);
    }
    expect(fxBanner('wind', -1).zh).toContain('往左');
    expect(fxBanner('wind', 1).en).toContain('right');
  });
});
