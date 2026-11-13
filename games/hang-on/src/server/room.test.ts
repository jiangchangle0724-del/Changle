/**
 * 房间逻辑，用手拨的时钟直接驱动：进出房、座位、阶段、转发、主机 30 秒不回来房间作废、座位宽限。
 */
import { describe, expect, test } from 'vitest';
import { HOST_GRACE_MS, PAD_GRACE_MS, type ServerMsg } from '../net/protocol';
import { cleanName, makeCode, Room, type From, type Out } from './room';

const HOST: From = { role: 'host', seat: null };
const WATCH: From = { role: 'watch', seat: null };
const ANN: From = { role: 'pad', seat: 'ann-00000001' };
const BOB: From = { role: 'pad', seat: 'bob-00000002' };
const pad = (n: number): From => ({ role: 'pad', seat: `pad-${String(n).padStart(8, '0')}` });

function room() {
  let now = 1_000_000;
  const r = new Room(Room.create('ABCD', now), () => now);
  return { r, clock: { advance: (ms: number) => (now += ms), get now() { return now; } } };
}
const msgs = (out: Out[]) => out.flatMap((o) => ('msg' in o ? [o] : []));
const closes = (out: Out[]) => out.flatMap((o) => ('close' in o ? [o] : []));
const lastRoom = (out: Out[]) => {
  const m = msgs(out).map((o) => o.msg).filter((m): m is Extract<ServerMsg, { t: 'room' }> => m.t === 'room');
  return m.at(-1)?.room;
};

describe('进出房', () => {
  test('主机进来，手柄分到座位和颜色，观众只计数', () => {
    const { r } = room();
    expect(r.connect(HOST)).toBeNull();
    expect(r.connect(ANN, '  Ann  ')).toBeNull();
    expect(r.connect(BOB)).toBeNull();
    expect(r.connect(WATCH)).toBeNull();
    const v = lastRoom(r.flush().out)!;
    expect(v.hostConnected).toBe(true);
    expect(v.seats.map((s) => [s.name, s.color])).toEqual([['Ann', 0], ['糯米团', 1]]);
    expect(v.watchers).toBe(1);
    expect(v.phase).toBe('lobby');
  });

  test('第 7 个手柄进不来，掉线的座位回来还是原来的颜色', () => {
    const { r, clock } = room();
    for (let i = 1; i <= 6; i++) expect(r.connect(pad(i))).toBeNull();
    expect(r.connect(pad(7))).toBe('full');
    r.disconnect(pad(2));
    clock.advance(1000);
    expect(r.connect(pad(7))).toBe('full'); // 座位还留着等 2 号回来
    expect(r.connect(pad(2))).toBeNull();
    const v = lastRoom(r.flush().out)!;
    expect(v.seats.find((s) => s.id === pad(2).seat)).toMatchObject({ color: 1, connected: true });
  });

  test('座位空够久就让出来', () => {
    const { r, clock } = room();
    for (let i = 1; i <= 6; i++) r.connect(pad(i));
    r.disconnect(pad(3));
    clock.advance(PAD_GRACE_MS + 1);
    r.tick();
    expect(r.connect(pad(7))).toBeNull();
    expect(lastRoom(r.flush().out)!.seats.map((s) => s.id)).not.toContain(pad(3).seat);
  });

  test('没有身份的手柄被拒', () => {
    const { r } = room();
    expect(r.connect({ role: 'pad', seat: null })).toBe('badRequest');
  });
});

describe('阶段', () => {
  test('主机按顺序走：lobby → countdown → playing → results → lobby，乱来的动作报错不动', () => {
    const { r } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.flush();
    r.handle(HOST, { t: 'act', action: { type: 'PLAY' } });
    let out = r.flush().out;
    expect(msgs(out).some((o) => o.msg.t === 'error')).toBe(true);
    expect(lastRoom(out)).toBeUndefined();
    for (const [type, phase] of [['START', 'countdown'], ['PLAY', 'playing'], ['FINISH', 'results'], ['LOBBY', 'lobby']] as const) {
      r.handle(HOST, { t: 'act', action: { type } });
      out = r.flush().out;
      expect(lastRoom(out)!.phase).toBe(phase);
    }
  });

  test('结算页可以直接 START 开下一局，不用先回大厅', () => {
    const { r } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.flush();
    for (const type of ['START', 'PLAY', 'FINISH'] as const) r.handle(HOST, { t: 'act', action: { type } });
    expect(r.d.phase).toBe('results');
    r.handle(HOST, { t: 'act', action: { type: 'START' } });
    expect(lastRoom(r.flush().out)!.phase).toBe('countdown');
  });

  test('手柄不能改阶段', () => {
    const { r } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.flush();
    r.handle(ANN, { t: 'act', action: { type: 'START' } });
    expect(r.flush().out).toEqual([]);
    expect(r.d.phase).toBe('lobby');
  });

  test('END 结束房间，所有人被关掉', () => {
    const { r } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.connect(BOB);
    r.flush();
    r.handle(HOST, { t: 'act', action: { type: 'END' } });
    const out = r.flush().out;
    expect(closes(out).map((c) => c.close)).toEqual(['host', { seat: ANN.seat }, { seat: BOB.seat }]);
    expect(r.expired()).toBe(true);
    expect(r.connect(pad(9))).toBe('ended');
  });

  test('踢人：座位没了，手柄被关', () => {
    const { r } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.connect(BOB);
    r.flush();
    r.handle(HOST, { t: 'act', action: { type: 'KICK', seat: ANN.seat! } });
    const out = r.flush().out;
    expect(closes(out)).toEqual([{ close: { seat: ANN.seat }, key: 'kicked' }]);
    expect(lastRoom(out)!.seats.map((s) => s.id)).toEqual([BOB.seat]);
  });
});

describe('主机掉线', () => {
  test('30 秒内回来没事，30 秒不回来房间作废', () => {
    const { r, clock } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.flush();
    r.disconnect(HOST);
    expect(lastRoom(r.flush().out)!.hostConnected).toBe(false);
    clock.advance(HOST_GRACE_MS - 1000);
    r.tick();
    expect(r.d.phase).toBe('lobby');
    r.connect(HOST);
    r.flush();
    expect(r.nextWake()).toBeGreaterThan(clock.now + HOST_GRACE_MS); // 只剩闲置期限
    r.disconnect(HOST);
    clock.advance(HOST_GRACE_MS);
    r.tick();
    expect(r.d.phase).toBe('ended');
    expect(closes(r.flush().out).length).toBe(2);
  });
});

describe('转发', () => {
  test('主机 → 座位，手柄 → 主机；观众和没座位的不能说，内容原样过去', () => {
    const { r } = room();
    r.connect(HOST);
    r.connect(ANN);
    r.connect(WATCH);
    r.flush();
    r.handle(HOST, { t: 'relay', to: { seat: ANN.seat! }, data: { k: 'ping', id: 7, at: 123.4 } });
    r.handle(ANN, { t: 'relay', to: 'host', data: { k: 'pong', id: 7, at: 123.4 } });
    r.handle(WATCH, { t: 'relay', to: 'host', data: { k: 'hello' } });
    r.handle(BOB, { t: 'relay', to: 'host', data: { k: 'hello' } });
    r.handle(HOST, { t: 'relay', to: { seat: 'nobody-000' }, data: { k: 'hello' } });
    const out = msgs(r.flush().out);
    expect(out).toEqual([
      { to: { seat: ANN.seat }, msg: { t: 'relay', from: 'host', data: { k: 'ping', id: 7, at: 123.4 } } },
      { to: 'host', msg: { t: 'relay', from: { seat: ANN.seat }, data: { k: 'pong', id: 7, at: 123.4 } } },
    ]);
  });

  test('ping 得到房间时钟的 pong', () => {
    const { r, clock } = room();
    r.connect(ANN);
    r.flush();
    r.handle(ANN, { t: 'ping', id: 3 });
    expect(msgs(r.flush().out)).toEqual([{ to: { seat: ANN.seat }, msg: { t: 'pong', id: 3, at: clock.now } }]);
  });
});

describe('杂', () => {
  test('名字和房间码', () => {
    expect(cleanName('  小  明 ')).toBe('小 明');
    expect(cleanName('')).toBe('糯米团');
    expect(cleanName('一二三四五六七八九十十一十二十三')).toBe('一二三四五六七八九十十一');
    expect(makeCode('AB', () => 1)).toBe('BBBB');
  });
});

describe('手机局', () => {
  test('房主自己也玩：手柄从 1 号颜色排起，最多 5 个，房间告诉大家这是手机局', () => {
    const now = 1_000_000;
    const r = new Room(Room.create('ABCD', now, { hostPlays: true }), () => now);
    expect(r.connect(HOST)).toBeNull();
    for (let i = 1; i <= 5; i++) expect(r.connect(pad(i), `P${i}`)).toBeNull();
    expect(r.connect(pad(6), 'P6')).toBe('full');
    const view = r.view();
    expect(view.hostPlays).toBe(true);
    expect(view.seats.map((s) => s.color)).toEqual([1, 2, 3, 4, 5]);
  });

  test('电视局：6 个手柄，颜色从 0 排，房间里没有 hostPlays', () => {
    const { r } = room();
    r.connect(HOST);
    for (let i = 1; i <= 6; i++) expect(r.connect(pad(i), `P${i}`)).toBeNull();
    const view = r.view();
    expect(view.hostPlays).toBeUndefined();
    expect(view.seats.map((s) => s.color)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
