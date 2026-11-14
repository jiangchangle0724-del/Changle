/**
 * 打碟 · DJ Booth: 弹幕 (Steve on Nov 13: "再加一个玩家可以发弹幕的功能，可以推荐几个弹幕表情之类的，也可以
 * 自定义"). A line a player sends from their phone flies across the big screen, with their face and
 * name: a ready one (`DANMU_READY`, an emoji or a short line, each screen showing it in its own
 * language) or their own words (`DANMU.chars` at most, the worst words masked: `maskDanmu`). The
 * host can turn them off. Pure: the room, the phones and the big screen all use it.
 */

/** One line: `n`, the room's count of them (a screen shows each once); `p`, a ready one, or `t`, their own words. */
export type DanmuLine = { n: number; pid: string; at: number; p?: number; t?: string };

export const DANMU = {
  /** the most characters a line of one's own has */
  chars: 24,
  /** a phone's lines: one per gapMs */
  gapMs: 1500,
  /** the room's latest lines kept (the screens fly the new ones) */
  keep: 30,
  /** how long after it was sent a line still flies (a screen opened later doesn't replay old ones) */
  freshMs: 5000,
};

/** The ready ones: emoji, and short lines in both languages. */
export const DANMU_READY: { zh: string; en: string }[] = [
  { zh: "🔥🔥🔥", en: "🔥🔥🔥" },
  { zh: "好听！", en: "Love this!" },
  { zh: "再来一首！", en: "One more!" },
  { zh: "嗨起来！", en: "Let's go!" },
  { zh: "👏👏👏", en: "👏👏👏" },
  { zh: "💃🕺💃", en: "💃🕺💃" },
  { zh: "哈哈哈哈哈", en: "Hahaha" },
  { zh: "DJ 太牛了", en: "DJ rocks" },
  { zh: "这首我的！", en: "That's my song!" },
  { zh: "🎉🎉🎉", en: "🎉🎉🎉" },
  { zh: "干杯 🥂", en: "Cheers 🥂" },
  { zh: "下一首！", en: "Next one!" },
];

/** What a line says, in a screen's language. */
export function danmuText(l: Pick<DanmuLine, "p" | "t">, zh: boolean): string {
  if (l.t) return l.t;
  const r = l.p !== undefined ? DANMU_READY[l.p] : undefined;
  return r ? (zh ? r.zh : r.en) : "";
}

// the worst words (slurs and the crudest swearing), masked on the big screen: a party's TV, often
// with someone's parents in the room. Matched in lower case, whatever the spacing, dots or
// full-width letters; a word inside a longer one counts too (fucking, 傻逼们). (No word that's also
// part of an everyday one: spicy, 生日你, 一支那么.)
const WORST = [
  "fuck",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "kike",
  "tranny",
  "whore",
  "操你",
  "草泥马",
  "傻逼",
  "傻b",
  "傻屄",
  "煞笔",
  "妈逼",
  "妈的逼",
  "鸡巴",
  "婊子",
  "狗日的",
  "肏",
  "屌你",
  "黑鬼",
];

/** A line of one's own with the worst words starred out (as long as they were). */
export function maskDanmu(text: string): string {
  const chars = Array.from(text);
  // each character as matched (lower case, a full-width letter as a plain one, spaces and dots
  // skipped), and which of the line's characters it came from
  const keys: string[] = [];
  const from: number[] = [];
  chars.forEach((c, i) => {
    for (const k of Array.from(c.normalize("NFKC").toLowerCase())) {
      if (!k.trim() || k === "." || k === "·" || k === "_" || k === "-") continue;
      keys.push(k);
      from.push(i);
    }
  });
  const hit = new Set<number>();
  for (const w of WORST) {
    const word = Array.from(w);
    for (let p = 0; p + word.length <= keys.length; p++) {
      if (word.every((k, j) => keys[p + j] === k)) for (let j = 0; j < word.length; j++) hit.add(from[p + j]);
    }
  }
  return hit.size ? chars.map((c, i) => (hit.has(i) ? "*" : c)).join("") : text;
}
