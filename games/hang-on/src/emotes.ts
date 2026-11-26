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
