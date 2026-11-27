/**
 * 表情（11-25，Steve：「手柄上点一下，大屏上自己头顶冒一句」）。
 * 手柄上的表情键（😀）打开一排，点一句：经房间发给主机（`LinkMsg { k: 'emote' }`，要可靠），主机把它当成一件事
 * （`SimEvent { type: 'emote' }`）塞进局面：大屏上那个人头顶冒气泡、响一声，手机局跟着快照发到每部手机上照样冒。
 * 这里只放数据和收拾，不碰 DOM，物理那边只拿类型。
 */
export const EMOTES = [
  { id: 'help', zh: '救命！', en: 'Help!' },
  { id: 'haha', zh: '哈哈哈', en: 'Haha' },
  { id: 'wait', zh: '等等我', en: 'Wait!' },
  { id: 'up', zh: '上来！', en: 'Come up!' },
  { id: 'grab', zh: '抓住我', en: 'Grab me' },
  { id: 'sorry', zh: '对不起', en: 'Sorry' },
  { id: 'nice', zh: '厉害！', en: 'Nice!' },
  { id: 'go', zh: '冲！', en: 'Go!' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

const IDS: readonly string[] = EMOTES.map((e) => e.id);

/** 同一个人两次表情至少隔这么久（手柄先挡，主机再挡一次）。 */
export const EMOTE_GAP_MS = 1200;
/** 气泡在头顶挂几秒。 */
export const EMOTE_SHOW_S = 2.6;

/** 收拾手柄发来的：不认识的不要。 */
export function cleanEmote(x: unknown): EmoteId | null {
  return typeof x === 'string' && IDS.includes(x) ? (x as EmoteId) : null;
}

/** 这一句的中文、英文。 */
export function emoteWords(id: EmoteId): { zh: string; en: string } {
  const e = EMOTES.find((q) => q.id === id) ?? EMOTES[0];
  return { zh: e.zh, en: e.en };
}

// ---------------------------------------------------------------- 放屁键（11-25，14 样的第 2 样）

/**
 * 手柄顶栏的 💨：噗一声，屁股底下冒一团黄绿的烟，旁边的人眯眼皱嘴。只是好玩，不推人、不进物理和回放。
 * 走房间（`LinkMsg { k: 'fart' }`），主机挑一种声音（`kind`），做 `SimEvent { type: 'fart' }`，和表情一样交给画面、声音和手机局的快照。
 */
/** 同一个人两下至少隔这么久（手柄先挡，主机再挡一次）。 */
export const FART_GAP_MS = 1500;
/** 几种声音：短的「噗」、长的「噗噜噜」、尖的「噗～」。 */
export const FART_KINDS = 3;
/** 离放屁的人这么近（像素，身体中心到身体中心）的人眯眼皱嘴。 */
export const FART_REACH = 150;
/** 旁边的人皱多久（秒）。 */
export const FART_STINK_S = 1.4;
/** 大厅里座位卡上挂的那一下。 */
export const FART_WORDS = { zh: '💨 噗', en: '💨 Pfft' } as const;

/** 主机挑这一下用哪种声音：大家听到的是同一种。 */
export function fartKind(rand: () => number = Math.random): number {
  return Math.min(FART_KINDS - 1, Math.floor(rand() * FART_KINDS));
}
