/**
 * 观众玩法（11-26，14 样的第 9 样）：没在玩的人拿手机当观众（`/hang-on/watch/`），
 * 押谁先掉、起哄、投票给玩的人帮一把或捣个乱。
 *
 * 观众不走 WebRTC：话都经房间转（`LinkMsg { k: 'crowd' }` 观众 → 主机，`{ k: 'crowdState' }` 主机 → 所有观众），
 * 量很小（押一下、起哄一下、投一票），房间限速。主机记账（这里的 `CrowdBook`，纯逻辑，有测试），
 * 变轻、变重、刮风、力气满进物理（`Sim.startCrowd`），慢动作是主机自己放慢。
 * 这里只放数据、收拾和账，不碰 DOM。契约见 CONTRACTS.md「观众契约」。
 */
import type { GameMode } from './physics/world';
import type { Phase } from './net/protocol';

// ---------------------------------------------------------------- 起哄

export const CHEERS = [
  { id: 'clap', emoji: '👏', zh: '加油', en: 'Go!' },
  { id: 'lol', emoji: '😂', zh: '哈哈哈', en: 'LOL' },
  { id: 'gasp', emoji: '😱', zh: '小心！', en: 'Look out!' },
  { id: 'fire', emoji: '🔥', zh: '厉害', en: 'Nice!' },
  { id: 'peek', emoji: '🙈', zh: '不敢看', en: "Can't look" },
  { id: 'melon', emoji: '🍉', zh: '吃瓜', en: 'Popcorn' },
] as const;

export type CheerId = (typeof CHEERS)[number]['id'];
const CHEER_IDS: readonly string[] = CHEERS.map((c) => c.id);

/** 同一个观众两下起哄至少隔这么久（观众页先挡，主机再挡一次）。 */
export const CHEER_GAP_MS = 700;

export function cheerOf(id: CheerId): (typeof CHEERS)[number] {
  return CHEERS.find((c) => c.id === id) ?? CHEERS[0];
}

// ---------------------------------------------------------------- 帮一把、捣个乱

/**
 * 投票的几样。help 是帮一把（左边，绿），不是就是捣个乱（右边，红）。
 * secs：物理里起作用几秒（模拟时间）；慢动作是大屏上的真秒数。力气满是一下子的事。
 */
export const FX = {
  float: { emoji: '🪶', zh: '变轻', en: 'Feather', help: true, secs: 5 },
  slow: { emoji: '🐢', zh: '慢动作', en: 'Slow-mo', help: true, secs: 5 },
  strong: { emoji: '💪', zh: '力气满', en: 'Full strength', help: true, secs: 0 },
  wind: { emoji: '🌬️', zh: '刮风', en: 'Wind', help: false, secs: 3 },
  heavy: { emoji: '🪨', zh: '变重', en: 'Heavy', help: false, secs: 4 },
} as const;

export type FxId = keyof typeof FX;
/** 进物理的那几样（慢动作不进）。 */
export type SimFx = Exclude<FxId, 'slow'>;
const FX_IDS = Object.keys(FX) as FxId[];
const HELP: FxId[] = FX_IDS.filter((f) => FX[f].help);
const MESS: FxId[] = FX_IDS.filter((f) => !FX[f].help);

/** 慢动作：大屏放慢到几成。 */
export const SLOW_SCALE = 0.5;

/** 起作用时大家看到的那一句（刮风说往哪边）。 */
export function fxBanner(fx: FxId, dir = 1): { zh: string; en: string } {
  const f = FX[fx];
  switch (fx) {
    case 'float':
      return { zh: `${f.emoji} 观众让大家变轻了！`, en: `${f.emoji} The crowd made everyone light!` };
    case 'slow':
      return { zh: `${f.emoji} 观众给了个慢动作`, en: `${f.emoji} The crowd slowed time down` };
    case 'strong':
      return { zh: `${f.emoji} 观众给大家加满了力气`, en: `${f.emoji} The crowd refilled everyone's strength` };
    case 'wind':
      return dir < 0 ? { zh: `${f.emoji} 观众刮起大风，往左吹！`, en: `${f.emoji} The crowd whipped up a wind, blowing left!` } : { zh: `${f.emoji} 观众刮起大风，往右吹！`, en: `${f.emoji} The crowd whipped up a wind, blowing right!` };
    case 'heavy':
      return { zh: `${f.emoji} 观众让大家变重了！`, en: `${f.emoji} The crowd made everyone heavy!` };
  }
}

// ---------------------------------------------------------------- 话

/** 观众 → 主机。 */
export type CrowdIn =
  /** 观众（重新）连上房间就说一声，主机回一份账。 */
  | { do: 'hello' }
  /** 押谁先掉（玩家的 key：座位 id，主机自己玩的是 'local'）。 */
  | { do: 'bet'; on: string }
  | { do: 'cheer'; e: CheerId }
  /** 投票：0 帮一把（左），1 捣个乱（右）。 */
  | { do: 'vote'; v: 0 | 1 };

/** 收拾观众发来的：不认识的不要。 */
export function cleanCrowdIn(x: unknown): CrowdIn | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as Record<string, unknown>;
  switch (m.do) {
    case 'hello':
      return { do: 'hello' };
    case 'bet':
      return typeof m.on === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(m.on) ? { do: 'bet', on: m.on } : null;
    case 'cheer':
      return typeof m.e === 'string' && CHEER_IDS.includes(m.e) ? { do: 'cheer', e: m.e as CheerId } : null;
    case 'vote':
      return m.v === 0 || m.v === 1 ? { do: 'vote', v: m.v } : null;
    default:
      return null;
  }
}

/** 主机 → 所有观众：一份账，变了就发（同一份大家都收，各人从里面找自己）。 */
export interface CrowdState {
  phase: Phase;
  mode: GameMode;
  /** 关名（中英都给，观众页按自己的语言显示）。 */
  level: { zh: string; en: string };
  /** 在玩的人：key（押的时候用）、名字、颜色。 */
  players: { key: string; name: string; color: string }[];
  /** 押谁先掉：能不能押（开局前能押，开局就锁上）；每个观众押了谁（观众 id → 玩家 key）。 */
  open: boolean;
  bets: Record<string, string>;
  /** 这一局谁先掉的（还没人掉是 null）。 */
  first: string | null;
  /** 每个观众一共押中几次（这个房间开了以后）。 */
  hits: Record<string, number>;
  /** 正在投票：左边帮一把、右边捣个乱，还剩几毫秒，各几票，每个观众投了哪边。 */
  vote: { a: FxId; b: FxId; left: number; n: [number, number]; mine: Record<string, 0 | 1> } | null;
  /** 正在起作用的。 */
  fx: FxId | null;
}

// ---------------------------------------------------------------- 主机的账

/** 开局后过多久第一次投票、一次投完到下一次隔多久、一次投多久（都是大屏上的真毫秒）。 */
export const VOTE_FIRST_MS = 20_000;
export const VOTE_GAP_MS = 35_000;
export const VOTE_OPEN_MS = 10_000;

export interface VoteDone {
  /** 赢的那样（没人投是 null）。 */
  fx: FxId | null;
  n: [number, number];
}

/**
 * 主机这头的账：谁押了谁、这一局谁先掉、谁押中几次、投票。时间从外面传进来（毫秒），随机数也是，测试好驱动。
 * 押的一直留着：下一局还押同一个人，改了才变；开局那一刻锁下来，开局以后押的算下一局。
 */
export class CrowdBook {
  /** 观众 id → 押的玩家 key。 */
  readonly bets = new Map<string, string>();
  /** 观众 id → 一共押中几次。 */
  readonly hits = new Map<string, number>();
  /** 这一局开局时锁下的。 */
  private locked = new Map<string, string>();
  /** 这一局第一个掉的。 */
  first: string | null = null;
  /** 能押（不在玩的时候）。 */
  open = true;
  vote: { a: FxId; b: FxId; endsAt: number; votes: Map<string, 0 | 1> } | null = null;
  private nextVoteAt = Infinity;
  private readonly cheerAt = new Map<string, number>();

  constructor(private readonly random: () => number = Math.random) {}

  /** 押：不在玩的时候、押的是在玩的人才算。变了返回 true。 */
  bet(id: string, key: string, players: readonly string[]): boolean {
    if (!this.open || !players.includes(key) || this.bets.get(id) === key) return false;
    this.bets.set(id, key);
    return true;
  }

  /** 起哄挡太密的：能起返回 true。 */
  cheer(id: string, now: number): boolean {
    if (now - (this.cheerAt.get(id) ?? -Infinity) < CHEER_GAP_MS - 200) return false;
    this.cheerAt.set(id, now);
    return true;
  }

  /** 开局：押的锁上（押的人走了的不算），还没人掉，过一会儿第一次投票。 */
  start(now: number, players: readonly string[]): void {
    this.open = false;
    this.first = null;
    this.locked = new Map([...this.bets].filter(([, k]) => players.includes(k)));
    this.vote = null;
    this.nextVoteAt = now + VOTE_FIRST_MS;
  }

  /** 这一局完了（结算、回大厅）：又能押，不投票了。 */
  stop(): void {
    this.open = true;
    this.vote = null;
    this.nextVoteAt = Infinity;
  }

  /**
   * 有人掉了。这一局第一个掉的才算：返回押中的观众 id（没人押中是空的）；不是第一个、不在玩是 null。
   */
  fell(key: string): string[] | null {
    if (this.open || this.first !== null) return null;
    this.first = key;
    const hit = [...this.locked].filter(([, k]) => k === key).map(([id]) => id);
    for (const id of hit) this.hits.set(id, (this.hits.get(id) ?? 0) + 1);
    return hit;
  }

  /** 这一局押了的人数（锁下来的）。 */
  get betCount(): number {
    return this.locked.size;
  }

  /**
   * 玩的时候每帧问一下：到点了开一轮投票（open：左边帮一把、右边捣个乱）；投票到点了数票（done）。
   * watchers 是在线的观众有几个（没有就不投，过一阵再看）；can 问这一样这一关有没有用（力气满要有手酸）。
   */
  tick(now: number, watchers: number, can: (fx: FxId) => boolean = () => true): { open?: [FxId, FxId]; done?: VoteDone } {
    if (this.open) return {};
    if (this.vote) {
      if (now < this.vote.endsAt) return {};
      const n = this.count();
      const v = this.vote;
      this.vote = null;
      this.nextVoteAt = now + VOTE_GAP_MS;
      const fx = n[0] === 0 && n[1] === 0 ? null : n[0] > n[1] ? v.a : n[1] > n[0] ? v.b : this.random() < 0.5 ? v.a : v.b;
      return { done: { fx, n } };
    }
    if (now < this.nextVoteAt) return {};
    if (watchers <= 0) {
      this.nextVoteAt = now + VOTE_GAP_MS;
      return {};
    }
    const help = HELP.filter(can);
    const mess = MESS.filter(can);
    if (!help.length || !mess.length) {
      this.nextVoteAt = now + VOTE_GAP_MS;
      return {};
    }
    const a = help[Math.min(help.length - 1, Math.floor(this.random() * help.length))] as FxId;
    const b = mess[Math.min(mess.length - 1, Math.floor(this.random() * mess.length))] as FxId;
    this.vote = { a, b, endsAt: now + VOTE_OPEN_MS, votes: new Map() };
    return { open: [a, b] };
  }

  /** 调试口（联机检查脚本）用：玩着的时候下一帧就开一轮投票。 */
  voteNow(now: number): void {
    if (!this.open && !this.vote) this.nextVoteAt = now;
  }

  /** 投一票（可以改）：变了返回 true。 */
  castVote(id: string, v: 0 | 1, now: number): boolean {
    if (!this.vote || now >= this.vote.endsAt || this.vote.votes.get(id) === v) return false;
    this.vote.votes.set(id, v);
    return true;
  }

  /** 两边各几票。 */
  count(): [number, number] {
    const n: [number, number] = [0, 0];
    for (const v of this.vote?.votes.values() ?? []) n[v]++;
    return n;
  }

  /** 押中最多的观众（至少押中一次），一样多先到的在前。 */
  best(): { id: string; hits: number } | null {
    let top: { id: string; hits: number } | null = null;
    for (const [id, hits] of this.hits) if (hits > 0 && (!top || hits > top.hits)) top = { id, hits };
    return top;
  }

  /** 给观众的那份账。 */
  state(now: number, base: Pick<CrowdState, 'phase' | 'mode' | 'level' | 'players'>, fx: FxId | null): CrowdState {
    const v = this.vote;
    return {
      ...base,
      open: this.open,
      bets: Object.fromEntries(this.bets),
      first: this.first,
      hits: Object.fromEntries(this.hits),
      vote: v ? { a: v.a, b: v.b, left: Math.max(0, v.endsAt - now), n: this.count(), mine: Object.fromEntries(v.votes) } : null,
      fx,
    };
  }
}
