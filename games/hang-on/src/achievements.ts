/**
 * 成就（11-25，14 样的第 4 样）。主机看着这一局（物理的事、表情、放屁、到顶、赢了）算谁拿到了什么，
 * 每个人的成就记在自己的手机上（localStorage `hang-on:achv`；这台设备上玩的人记在这台设备上）。
 * 手柄连上房间就把自己有的告诉主机（`LinkMsg { k: 'achvHave' }`），主机只报新拿到的：
 * 大屏和手机局每部手机上冒一条「🏆 阿一 解锁「救命恩人」」，拿到的人手机上记下、提示一下（`LinkMsg { k: 'achv' }`）。
 * 这里只放数据和怎么算，不碰 DOM，测试直接测。
 */
import type { GameMode, SimEvent } from './physics/world';
import type { Tier } from './sides';

export const ACHIEVEMENTS = [
  // 玩的时候一下子拿到的
  { id: 'traitor', icon: '😈', zh: '松手了', en: 'Let go', howZh: '松开队友，他摔了下去', howEn: 'Let go of a teammate, who then fell' },
  { id: 'savior', icon: '🦸', zh: '救命恩人', en: 'Lifesaver', howZh: '把摔下去的队友召唤回来', howEn: 'Summon a fallen teammate back' },
  { id: 'catch', icon: '🤝', zh: '接住了', en: 'Gotcha', howZh: '抓住一个队友', howEn: 'Grab hold of a teammate' },
  { id: 'lucky', icon: '🧧', zh: '红包到手', en: 'Lucky', howZh: '自己拿到一个红包', howEn: 'Pick up a red envelope yourself' },
  { id: 'gadget', icon: '🧊', zh: '道具达人', en: 'Gadgeteer', howZh: '用成一次道具', howEn: 'Use an item successfully' },
  { id: 'stinker', icon: '💨', zh: '熏到人了', en: 'Stinker', howZh: '放屁的时候旁边有人', howEn: 'Toot right next to someone' },
  { id: 'chatty', icon: '💬', zh: '话痨', en: 'Chatterbox', howZh: '一局里说 10 句表情', howEn: 'Send 10 emotes in one game' },
  { id: 'dizzy', icon: '💫', zh: '眼冒金星', en: 'Seeing stars', howZh: '被摆锤撞晕一次', howEn: 'Get bonked by a pendulum' },
  { id: 'soup', icon: '🍲', zh: '掉进汤里', en: 'In the soup', howZh: '被涨上来的汤（水）淹到', howEn: 'Get caught by the rising soup (or water)' },
  // 到顶、赢了才算的
  { id: 'summit', icon: '⛰️', zh: '第一次到顶', en: 'First summit', howZh: '闯关或大团队到顶', howEn: 'Reach the top of a level' },
  { id: 'clean', icon: '🛡️', zh: '一个都没摔', en: 'Nobody fell', howZh: '两个人以上，一关下来没人摔', howEn: 'Two or more players, and nobody falls all level' },
  { id: 'allred', icon: '🎁', zh: '红包全拿', en: 'Every envelope', howZh: '一关的红包一次全拿到', howEn: 'Get every red envelope of a level in one run' },
  { id: 'stars', icon: '⭐', zh: '三颗星', en: 'Three stars', howZh: '一次拿齐一关的小目标', howEn: 'Meet every goal of a level in one run' },
  { id: 'hard', icon: '🔥', zh: '困难到顶', en: 'Hard summit', howZh: '困难的关到顶', howEn: 'Reach the top of a hard level' },
  { id: 'long', icon: '🧗', zh: '长关到顶', en: 'Long haul', howZh: '长关到顶', howEn: 'Reach the top of a long level' },
  { id: 'bigteam', icon: '👥', zh: '大团队', en: 'Big team', howZh: '大团队的关到顶', howEn: 'Reach the top of a Big team level' },
  { id: 'escort', icon: '🪙', zh: '护送大元宝', en: 'Gold escort', howZh: '大厅里打开「护送大元宝」，把它扛到顶', howEn: 'Turn on Gold escort in the lobby and carry the ingot to the top' },
  { id: 'race', icon: '🏁', zh: '第一个到', en: 'First up', howZh: '比谁先赢一次', howEn: 'Win a Race' },
  { id: 'last', icon: '🪑', zh: '坐到最后', en: 'Last one hanging', howZh: '坐不住赢一次', howEn: 'Win Last one hanging' },
  { id: 'gold', icon: '🪙', zh: '元宝到手', en: 'Gold rush', howZh: '抢元宝赢一局', howEn: 'Win a round of Grab the gold' },
] as const;

export type AchvId = (typeof ACHIEVEMENTS)[number]['id'];
export type AchvInfo = (typeof ACHIEVEMENTS)[number];

const IDS: readonly string[] = ACHIEVEMENTS.map((a) => a.id);

/** 一局里说这么多句表情就是话痨。 */
export const CHATTY_N = 10;
/** 记在手机上的地方。 */
export const ACHV_KEY = 'hang-on:achv';

/** 收拾一个：不认得的不要。 */
export function cleanAchv(x: unknown): AchvId | null {
  return typeof x === 'string' && IDS.includes(x) ? (x as AchvId) : null;
}

/** 收拾一串（手柄说自己有哪些、手机上存的）：认得的，不重复，按表里的顺序。 */
export function cleanAchvList(x: unknown): AchvId[] {
  if (!Array.isArray(x)) return [];
  const have = new Set(x.map(cleanAchv));
  return ACHIEVEMENTS.map((a) => a.id).filter((id) => have.has(id));
}

export function achvInfo(id: AchvId): AchvInfo {
  return ACHIEVEMENTS.find((a) => a.id === id) ?? ACHIEVEMENTS[0];
}

/** 谁拿到了哪个（player 是这一局的玩家下标）。 */
export interface Award {
  player: number;
  id: AchvId;
}

/** 这一局是什么样的：玩法、难度、是不是长关。 */
export interface RoundInfo {
  mode: GameMode;
  tier: Tier;
  long: boolean;
}

/** 到顶那一下的账：几个人（半路进来的也算）、全队摔了几次、红包拿了几个（一共几个）、小目标（闯关、大团队才有）、大元宝送到没有。 */
export interface RoundEnd {
  players: number;
  deaths: number;
  envelopes: { got: number; of: number };
  goals: readonly { ok: boolean }[] | null;
  escort?: boolean;
}

/**
 * 一局里谁做了什么（主机边玩边记）。每个方法返回这一下拿到的；同一局里同一个人同一个成就只报一次，
 * 拿没拿过（以前的局）主机自己再对着各人的单子查。
 */
export class AchvRound {
  private readonly given = new Set<string>();
  private readonly emotes = new Map<number, number>();

  constructor(readonly info: RoundInfo) {}

  private give(list: Award[]): Award[] {
    return list.filter((a) => {
      const k = `${a.player}|${a.id}`;
      if (this.given.has(k)) return false;
      this.given.add(k);
      return true;
    });
  }

  /** 物理的一件事。 */
  onEvent(ev: SimEvent): Award[] {
    switch (ev.type) {
      case 'betrayal':
        return this.give([{ player: ev.by, id: 'traitor' }]);
      case 'summon':
        return ev.who.length ? this.give([{ player: ev.player, id: 'savior' }]) : [];
      case 'grab':
        return ev.kind === 'player' ? this.give([{ player: ev.player, id: 'catch' }]) : [];
      case 'envelope':
        return this.give([{ player: ev.player, id: 'lucky' }]);
      case 'item':
        return ev.ok ? this.give([{ player: ev.player, id: 'gadget' }]) : [];
      case 'bonk':
        return this.give([{ player: ev.player, id: 'dizzy' }]);
      case 'death':
        return ev.cause === 'tide' ? this.give([{ player: ev.player, id: 'soup' }]) : [];
      default:
        return [];
    }
  }

  /** 说了一句表情（这一局里攒着数）。 */
  onEmote(player: number): Award[] {
    const n = (this.emotes.get(player) ?? 0) + 1;
    this.emotes.set(player, n);
    return n >= CHATTY_N ? this.give([{ player, id: 'chatty' }]) : [];
  }

  /** 放了个屁；stank：旁边有人（主机量的，FART_REACH 以内活着的别人）。 */
  onFart(player: number, stank: boolean): Award[] {
    return stank ? this.give([{ player, id: 'stinker' }]) : [];
  }

  /**
   * 这一局完了（物理的 win）。闯关、大团队：在场的每个人都算到顶，再看没人摔、红包全拿、三颗星、困难、长关、大团队；
   * 比谁先、坐不住、抢元宝：赢的人（who）。
   */
  onWin(who: readonly number[] | undefined, end: RoundEnd): Award[] {
    const { mode, tier, long } = this.info;
    const players = end.players;
    const all = Array.from({ length: players }, (_, i) => i);
    const out: Award[] = [];
    if (mode === 'climb' || mode === 'team') {
      const each = (id: AchvId): void => {
        for (const player of all) out.push({ player, id });
      };
      each('summit');
      if (players >= 2 && end.deaths === 0) each('clean');
      if (end.envelopes.of > 0 && end.envelopes.got >= end.envelopes.of) each('allred');
      if (end.goals && end.goals.length > 0 && end.goals.every((g) => g.ok)) each('stars');
      if (mode === 'climb' && tier === 2) each('hard');
      if (long) each('long');
      if (mode === 'team') each('bigteam');
      if (end.escort) each('escort');
    } else {
      const id: AchvId = mode === 'race' ? 'race' : mode === 'last' ? 'last' : 'gold';
      for (const player of who ?? []) if (player >= 0 && player < players) out.push({ player, id });
    }
    return this.give(out);
  }
}
