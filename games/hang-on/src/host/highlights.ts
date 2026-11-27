/**
 * 精彩回放（11-26，14 样的第 8 样）。玩的时候主机每 0.05 秒（局里的时间）录一张画面快照（和手机局发给手机的一样，
 * `encodeSnap`），最近 3.5 秒留着；出了值得回放的事（松手害人、召唤队友、被撞飞、送到大元宝、掉下去、到顶……）
 * 就从那件事前 3 秒录到后 1.5 秒，留一段。一局里只留最好的一段：更要紧的事换掉不那么要紧的，一样要紧的留后来的。
 * 结算页上点「▶ 精彩回放」，主机用手机局那一套（`RemoteSim`）把这一段慢放一遍。不重跑物理，回放、关卡都不变。
 */
import type { Snap } from '../net/protocol';
import type { SimEvent } from '../physics/world';

/** 一件值得回放的事：多要紧、在局里第几秒、中英文怎么说。 */
export interface Moment {
  priority: number;
  at: number;
  zh: string;
  en: string;
}

/** 录下的一段：一张张快照（局里的时间）和是什么事。 */
export interface Clip {
  snaps: { t: number; s: Snap }[];
  moment: Moment;
}

/** 事前录几秒、事后录几秒、多久录一张（秒）。 */
export const CLIP_BEFORE = 3;
export const CLIP_AFTER = 1.5;
export const SNAP_EVERY = 0.05;
/** 一段至少这么多张才算（太短的不要）。 */
const MIN_SNAPS = 10;

export class Highlights {
  private ring: { t: number; s: Snap }[] = [];
  private pending: Clip | null = null;
  private pendingEnd = 0;
  /** 这一局最好的一段（还没有是 null）。 */
  best: Clip | null = null;

  /** 新的一局：都不要了。 */
  reset(): void {
    this.ring = [];
    this.pending = null;
    this.best = null;
  }

  /** 录一张（t 是局里的时间）。 */
  push(t: number, s: Snap): void {
    this.ring.push({ t, s });
    while (this.ring.length && (this.ring[0] as { t: number }).t < t - CLIP_BEFORE - 0.5) this.ring.shift();
    if (!this.pending) return;
    this.pending.snaps.push({ t, s });
    if (t >= this.pendingEnd) this.finish();
  }

  /** 出了一件值得回放的事。正在录的时候来了更要紧的：换成它，多录一会儿。 */
  mark(m: Moment): void {
    if (this.pending) {
      if (m.priority > this.pending.moment.priority) {
        this.pending.moment = m;
        this.pendingEnd = Math.max(this.pendingEnd, m.at + CLIP_AFTER);
      }
      return;
    }
    if (this.best && this.best.moment.priority > m.priority) return;
    this.pending = { snaps: this.ring.filter((x) => x.t >= m.at - CLIP_BEFORE), moment: m };
    this.pendingEnd = m.at + CLIP_AFTER;
  }

  /** 这一局完了：还在录的就这么收下。 */
  close(): void {
    if (this.pending) this.finish();
  }

  private finish(): void {
    const c = this.pending;
    this.pending = null;
    if (!c || c.snaps.length < MIN_SNAPS) return;
    if (!this.best || c.moment.priority >= this.best.moment.priority) this.best = c;
  }
}

/** 这件事值不值得回放、多要紧、叫什么（name 是第几个人的名字）。 */
export function momentOf(ev: SimEvent, at: number, name: (i: number) => string): Moment | null {
  switch (ev.type) {
    case 'betrayal':
      return { priority: 6, at, zh: `${name(ev.by)} 松手了`, en: `${name(ev.by)} lets go` };
    case 'summon':
      return ev.who.length ? { priority: 5, at, zh: `${name(ev.player)} 把队友拉了回来`, en: `${name(ev.player)} pulls a teammate back` } : null;
    case 'escort':
      return ev.phase === 'home' ? { priority: 4, at, zh: '大元宝送到顶了', en: 'The big gold ingot makes it' } : null;
    case 'bonk':
      return { priority: 4, at, zh: `${name(ev.player)} 被撞飞了`, en: `${name(ev.player)} gets bonked` };
    case 'tray':
      return ev.phase === 'spill' ? { priority: 3, at, zh: '点心翻了', en: 'The dim sum spills' } : null;
    case 'death':
      // 卷屏（11-26）：落在后面被屏幕甩掉
      if (ev.cause === 'scroll') return { priority: 3, at, zh: `${name(ev.player)} 被甩掉了`, en: `${name(ev.player)} gets left behind` };
      return { priority: ev.cause ? 3 : 2, at, zh: `${name(ev.player)} 掉下去了`, en: `${name(ev.player)} falls` };
    case 'finish':
      return ev.place === 1 ? { priority: 2, at, zh: `${name(ev.player)} 第一个到`, en: `${name(ev.player)} finishes first` } : null;
    case 'win':
      return { priority: 1, at, zh: '到顶的那一下', en: 'The finish' };
    default:
      return null;
  }
}
