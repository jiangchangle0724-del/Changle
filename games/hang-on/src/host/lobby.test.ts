// Exercise the actual host module's button listeners and the real Room phase machine.
// Only browser surfaces (DOM, drawing, audio and transport) are replaced; no browser install is needed by npm test.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostAction, RoomView } from '../net/protocol';
import type { Sim } from '../physics/world';

const harness = vi.hoisted(() => {
  class Element extends EventTarget {
    hidden = false;
    textContent = '';
    innerHTML = '';
    className = '';
    title = '';
    style = {};
    dataset = {};
    childNodes: Element[] = [];
    classList = { toggle(): void {}, add(): void {}, remove(): void {}, contains: (): boolean => false };
    disabled = false;
    width = 0;
    height = 0;
    append(): void {}
    remove(): void {}
    setAttribute(): void {}
    querySelector(): Element { return new Element(); }
    querySelectorAll(): Element[] { return []; }
    click(): void { this.dispatchEvent(new Event('click')); }
  }
  return {
    Element,
    elements: new Map<string, Element>(),
    send: (_action: HostAction): void => {},
    /** 页面地址的 ?…（手机局的测试改它）。 */
    search: '?level=table-01',
    /** openRoom 收到的选项。 */
    opened: null as { hostPlays?: boolean } | null,
    bodyClasses: new Set<string>(),
  };
});
vi.mock('../net/host-link', async () => {
  const { Room } = await import('../server/room');
  return {
    openRoom: async (_base: string, opts: { hostPlays?: boolean } = {}) => {
      harness.opened = opts;
      return 'ABCD';
    },
    HostLink: class {
      peers = new Map();
      forceRelay = false;
      socketOpen = true;
      room = new Room(Room.create('ABCD', 1000, { hostPlays: !!harness.opened?.hostPlays }), () => 1000);
      constructor(_code: string, private ev: { onRoom?(r: RoomView): void }) {
        this.room.connect({ role: 'host', seat: null });
        this.room.connect({ role: 'pad', seat: 'pad-00000001' }, '阿一');
        this.room.flush();
        harness.send = action => this.act(action);
        queueMicrotask(() => this.ev.onRoom?.(this.room.view()));
      }
      act(action: HostAction): void {
        this.room.handle({ role: 'host', seat: null }, { t: 'act', action });
        for (const out of this.room.flush().out) {
          if ('msg' in out && out.msg.t === 'room') this.ev.onRoom?.(out.msg.room);
        }
      }
      close(): void {}
    },
  };
});
vi.mock('../i18n', () => ({ applyStatic() {}, langButton() {}, onLang() {},
  tr: (zh: string) => zh, pickLang: (name: { zh: string } | undefined, fallback: string) => name?.zh ?? fallback }));
vi.mock('../audio/sfx', () => ({ sfx: { attach() {}, countdown() {}, tick() {}, setVoice() {}, muted: true }, heardBy: () => true }));
vi.mock('../pad/look-preview', () => ({ drawLook() {} }));
vi.mock('../render/stage', () => ({ Stage: { create: async () => ({
  setLevel() {}, syncPlayers() {}, setPlayerStyle() {}, reset() {},
}) } }));

type Host = { phase: string; level: { id: string }; sim: Sim; phoneMode: boolean; localIndex: number; link: { room: { view(): RoomView } } };
let host: Host;
/** 照这个地址把主机页的模块从头跑一遍（电脑上：鼠标、大屏幕）。 */
async function boot(search: string): Promise<void> {
  vi.resetModules();
  harness.elements.clear();
  harness.bodyClasses.clear();
  harness.opened = null;
  vi.stubGlobal('document', {
    getElementById(id: string) {
      if (!harness.elements.has(id)) harness.elements.set(id, new harness.Element());
      return harness.elements.get(id);
    },
    createElement: () => new harness.Element(),
    addEventListener: () => {},
    documentElement: {},
    body: {
      dataset: {},
      classList: { toggle: (c: string, on: boolean) => (on ? harness.bodyClasses.add(c) : harness.bodyClasses.delete(c)), contains: (c: string) => harness.bodyClasses.has(c) },
    },
  });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { origin: 'http://localhost', search });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('screen', { width: 1920, height: 1080 });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('addEventListener', vi.fn());
  await import('./main');
  await Promise.resolve();
  host = (window as unknown as { hangOn: Host }).hangOn;
}
beforeEach(async () => {
  vi.useFakeTimers();
  await boot(harness.search);
});
afterEach(() => {
  host?.sim.destroy();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('真实开始按钮经过房间阶段机进入倒数，顶栏回大厅返回 lobby', async () => {
  expect(host.phase).toBe('lobby');
  harness.elements.get('startBtn')!.click();
  expect(host.phase).toBe('countdown');
  expect(harness.elements.get('countLevel')!.textContent).toMatch(/^1\./);
  harness.elements.get('lobbyBtn')!.click();
  await Promise.resolve();
  expect(host.phase).toBe('lobby');
});

// C4 found nextBtn went back to the lobby; it now starts the next level's countdown straight from results.
it('结算页点下一关直接开始第 2 关倒数', async () => {
  harness.elements.get('startBtn')!.click();
  harness.send({ type: 'PLAY' });
  harness.send({ type: 'FINISH' });
  expect(host.phase).toBe('results');
  harness.elements.get('nextBtn')!.click();
  await Promise.resolve();
  expect(host.level.id).toBe('table-02');
  expect(host.phase).toBe('countdown');
});

it('结算页点再来一次直接重开同一关的倒数', async () => {
  harness.elements.get('startBtn')!.click();
  harness.send({ type: 'PLAY' });
  harness.send({ type: 'FINISH' });
  expect(host.phase).toBe('results');
  harness.elements.get('againBtn')!.click();
  await Promise.resolve();
  expect(host.level.id).toBe('table-01');
  expect(host.phase).toBe('countdown');
});

it('手机局（?phone=1）：开的是房主也玩的房间，房主排在手柄后面拿 0 号颜色，倒数时出触屏手柄', async () => {
  host.sim.destroy();
  await boot('?level=table-01&phone=1');
  expect(host.phoneMode).toBe(true);
  expect(harness.bodyClasses.has('phone')).toBe(true);
  expect(harness.opened).toEqual({ hostPlays: true });
  // 一部手机进来了：房间给它 1 号颜色（0 号留给房主），房主排最后、草莓粉
  expect(host.link.room.view().seats.map((s) => s.color)).toEqual([1]);
  expect(host.sim.players).toHaveLength(2);
  expect(host.localIndex).toBe(1);
  expect(host.sim.players[1]!.color).toBe('#F28CA6');
  harness.elements.get('startBtn')!.click();
  expect(host.phase).toBe('countdown');
  expect(harness.elements.get('touch')!.hidden).toBe(false);
  harness.send({ type: 'PLAY' });
  expect(harness.elements.get('touch')!.hidden).toBe(false);
  harness.send({ type: 'FINISH' });
  expect(host.phase).toBe('results');
  expect(harness.elements.get('touch')!.hidden).toBe(true);
});

it('电脑上打开不是手机局', () => {
  expect(host.phoneMode).toBe(false);
  expect(harness.bodyClasses.has('phone')).toBe(false);
  expect(harness.opened).toEqual({ hostPlays: false });
  expect(host.localIndex).toBe(-1);
});
