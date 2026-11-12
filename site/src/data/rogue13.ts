import type { T } from "../i18n";

export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Suit = "spade" | "heart" | "club" | "diamond";
export type Card = { rank: Rank; suit: Suit };

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS: Suit[] = ["spade", "heart", "club", "diamond"];

export const SUIT_GLYPH: Record<Suit, string> = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
export const SUIT_RED: Record<Suit, boolean> = { spade: false, heart: true, club: false, diamond: true };

export type RuleKind =
  | "pick" // choose a player to drink
  | "self-sip"
  | "self-full"
  | "left"
  | "right"
  | "group" // a table game starts, loser drinks
  | "hold"; // the holder keeps a standing power

/** The five standing powers (the `hold` cards), by name: who holds each, and each one's sound. */
export type Power = "buddy" | "camera" | "nose" | "wc" | "trouble";

export type Rule = {
  rank: Rank;
  title: T;
  rule: T;
  kind: RuleKind;
  /** For standing powers: which one this card gives. */
  power?: Power;
  /** For standing powers: the short badge shown next to the holder's name. */
  badge?: T;
  /** The card when the table plays for its own penalty instead of drinks (what it leaves out stays). */
  custom?: { title?: T; rule: T; badge?: T };
};

/** The powers' clocks, in ms: the camera's freeze, then how long its holder has to say who moved (after that nobody did), and the nose's window. */
export const ROGUE_MS = { freeze: 3500, judge: 20000, nose: 6000, cool: 60000 };

/** The line under a penalty a power or a round handed out (the same words on one phone and online). */
export const ROGUE_NOTES = {
  garden: { zh: "逛三园：说不出或重复", en: "Three Gardens: stalled or repeated" },
  gardenSlow: { zh: "逛三园：没接上", en: "Three Gardens: too slow" },
  grabLast: { zh: "抢数字：最后一个", en: "Grab the Number: last one left" },
  grabCollide: { zh: "抢数字：撞数了", en: "Grab the Number: same number" },
  grabNone: { zh: "抢数字：没抢到", en: "Grab the Number: never grabbed" },
  sevensWrong: { zh: "逢七过：说错了", en: "Sevens: wrong call" },
  sevensSlow: { zh: "逢七过：没接上", en: "Sevens: too slow" },
  camera: { zh: "照相机：动了", en: "Camera: you moved" },
  noseSlow: { zh: "摸鼻子：最慢", en: "Nose: last one" },
  noseMiss: { zh: "摸鼻子：没摸", en: "Nose: never touched it" },
  trouble: { zh: "神经病：接了话", en: "Troublemaker: you answered" },
  wc: { zh: "没有 WC 票：先喝再去", en: "No bathroom pass: drink first" },
  wcCustom: { zh: "没有 WC 票：先受罚再去", en: "No bathroom pass: penalty first" },
} satisfies Record<string, T>;

/** A card's words for the table's penalty: drinking, or the host's own (`custom`). */
export function ruleWords(r: Rule, custom: boolean): { title: T; rule: T; badge?: T } {
  if (!custom || !r.custom) return r;
  return { title: r.custom.title ?? r.title, rule: r.custom.rule, badge: r.custom.badge ?? r.badge };
}

export const RULES: Rule[] = [
  {
    rank: "A",
    kind: "pick",
    title: { zh: "指定", en: "Point" },
    rule: { zh: "指定在座任何一个人喝一口。", en: "Point at anyone at the table. They drink." },
    custom: { rule: { zh: "指定在座任何一个人受罚。", en: "Point at anyone at the table. They take the penalty." } },
  },
  {
    rank: "2",
    kind: "hold",
    power: "buddy",
    title: { zh: "陪酒", en: "Drinking Buddy" },
    badge: { zh: "陪酒", en: "Buddy" },
    rule: {
      zh: "从现在起你负责陪酒：谁被罚酒时喊一声“陪酒”，你就得起身双手举杯，大声说“谢谢老板！”，陪着一起喝。直到下一张 2 被抽出。",
      en: "You're the drinking buddy. Whenever someone is penalized and shouts “buddy!”, you stand, raise your glass with both hands, shout “thank you, boss!” and drink with them. Lasts until the next 2 is drawn.",
    },
    custom: {
      title: { zh: "陪罚", en: "Penalty Buddy" },
      badge: { zh: "陪罚", en: "Buddy" },
      rule: {
        zh: "从现在起你负责陪罚：谁受罚时喊一声“陪罚”，你就得起身大声说“谢谢老板！”，陪他一起受罚。直到下一张 2 被抽出。",
        en: "You're the penalty buddy. Whenever someone is penalized and shouts “buddy!”, you stand, shout “thank you, boss!” and take the penalty with them. Lasts until the next 2 is drawn.",
      },
    },
  },
  {
    rank: "3",
    kind: "group",
    title: { zh: "逛三园", en: "Three Gardens" },
    rule: {
      zh: "你选一个园：蔬菜园、水果园或动物园。从下一个人开始，每人说出园里的一样东西，说不出或重复别人说过的，喝。",
      en: "Choose a garden: vegetables, fruits or animals. Starting with the next player, each person names one thing from it. Stall or repeat and you drink.",
    },
    custom: {
      rule: {
        zh: "你选一个园：蔬菜园、水果园或动物园。从下一个人开始，每人说出园里的一样东西，说不出或重复别人说过的，受罚。",
        en: "Choose a garden: vegetables, fruits or animals. Starting with the next player, each person names one thing from it. Stall or repeat and you take the penalty.",
      },
    },
  },
  {
    rank: "4",
    kind: "group",
    title: { zh: "抢数字", en: "Grab the Number" },
    rule: {
      zh: "你喊“1”，其他人抢着喊“2”、“3”……往下数。两个人同时喊同一个数，两个都喝；最后一个始终没开口的，也喝。",
      en: "You shout “1”. Everyone else races to shout “2”, “3” and so on. Two voices on one number both drink; the last person who never spoke drinks too.",
    },
    custom: {
      rule: {
        zh: "你喊“1”，其他人抢着喊“2”、“3”……往下数。两个人同时喊同一个数，两个都受罚；最后一个始终没开口的，也受罚。",
        en: "You shout “1”. Everyone else races to shout “2”, “3” and so on. Two voices on one number both take the penalty, and so does the last person who never spoke.",
      },
    },
  },
  {
    rank: "5",
    kind: "hold",
    power: "camera",
    title: { zh: "照相机", en: "Camera" },
    badge: { zh: "照相机", en: "Camera" },
    rule: {
      zh: "在这副牌发完之前，你随时可以喊“照相机”。所有人立刻定格不动，动了的喝。",
      en: "Until this deck runs out, you may shout “camera!” at any moment. Everyone freezes. Whoever moves drinks.",
    },
    custom: {
      rule: {
        zh: "在这副牌发完之前，你随时可以喊“照相机”。所有人立刻定格不动，动了的受罚。",
        en: "Until this deck runs out, you may shout “camera!” at any moment. Everyone freezes. Whoever moves takes the penalty.",
      },
    },
  },
  {
    rank: "6",
    kind: "hold",
    power: "nose",
    title: { zh: "摸鼻子", en: "Nose" },
    badge: { zh: "摸鼻子", en: "Nose" },
    rule: {
      zh: "在这副牌发完之前，你随时可以喊“摸鼻子”。所有人都得摸鼻子，最后一个摸到的喝。",
      en: "Until this deck runs out, you may shout “nose!” at any moment. Everyone touches their nose. The last one drinks.",
    },
    custom: {
      rule: {
        zh: "在这副牌发完之前，你随时可以喊“摸鼻子”。所有人都得摸鼻子，最后一个摸到的受罚。",
        en: "Until this deck runs out, you may shout “nose!” at any moment. Everyone touches their nose. The last one takes the penalty.",
      },
    },
  },
  {
    rank: "7",
    kind: "group",
    title: { zh: "逢七过", en: "Sevens" },
    rule: {
      zh: "你从 1 到 20 之间任选一个数开始，大家依次往下数。遇到 7 的倍数或带 7 的数（7、14、17、21……）要说“过”。说错了或把数报出来的，喝。",
      en: "Start counting from any number between 1 and 20, going around the table. On multiples of 7 or numbers containing 7 (7, 14, 17, 21…) say “pass” instead. Slip up and you drink.",
    },
    custom: {
      rule: {
        zh: "你从 1 到 20 之间任选一个数开始，大家依次往下数。遇到 7 的倍数或带 7 的数（7、14、17、21……）要说“过”。说错了或把数报出来的，受罚。",
        en: "Start counting from any number between 1 and 20, going around the table. On multiples of 7 or numbers containing 7 (7, 14, 17, 21…) say “pass” instead. Slip up and you take the penalty.",
      },
    },
  },
  {
    rank: "8",
    kind: "hold",
    power: "wc",
    title: { zh: "WC 票", en: "Bathroom Pass" },
    badge: { zh: "WC票", en: "WC pass" },
    rule: {
      zh: "你拿到了唯一一张上厕所的票。其他人想去厕所，得先喝一口。",
      en: "You hold the only bathroom pass. Anyone else who needs to go drinks first.",
    },
    custom: {
      rule: {
        zh: "你拿到了唯一一张上厕所的票。其他人想去厕所，得先受罚。",
        en: "You hold the only bathroom pass. Anyone else who needs to go takes the penalty first.",
      },
    },
  },
  {
    rank: "9",
    kind: "self-sip",
    title: { zh: "自己喝", en: "Your Round" },
    rule: { zh: "自己喝一口。", en: "You take a sip." },
    custom: { title: { zh: "自罚", en: "On You" }, rule: { zh: "你自己受罚。", en: "You take the penalty." } },
  },
  {
    rank: "10",
    kind: "hold",
    power: "trouble",
    title: { zh: "神经病", en: "Troublemaker" },
    badge: { zh: "神经病", en: "Trouble" },
    rule: {
      zh: "在这副牌发完之前，你可以随时搭讪任何人。谁接了你的话，谁喝。",
      en: "Until this deck runs out, you may strike up a conversation with anyone at any time. Whoever answers you drinks.",
    },
    custom: {
      rule: {
        zh: "在这副牌发完之前，你可以随时搭讪任何人。谁接了你的话，谁受罚。",
        en: "Until this deck runs out, you may strike up a conversation with anyone at any time. Whoever answers you takes the penalty.",
      },
    },
  },
  {
    rank: "J",
    kind: "left",
    title: { zh: "左边", en: "Left" },
    rule: { zh: "你左边的人喝一口。", en: "The person on your left drinks." },
    custom: { rule: { zh: "你左边的人受罚。", en: "The person on your left takes the penalty." } },
  },
  {
    rank: "Q",
    kind: "right",
    title: { zh: "右边", en: "Right" },
    rule: { zh: "你右边的人喝一口。", en: "The person on your right drinks." },
    custom: { rule: { zh: "你右边的人受罚。", en: "The person on your right takes the penalty." } },
  },
  {
    rank: "K",
    kind: "self-full",
    title: { zh: "国王", en: "King" },
    rule: { zh: "自己喝一杯。", en: "You finish your drink." },
    // a sip and a whole glass are the same penalty once it isn't drinking
    custom: { rule: { zh: "你自己受罚。", en: "You take the penalty." } },
  },
];

export const RULE_BY_RANK: Record<Rank, Rule> = Object.fromEntries(RULES.map((r) => [r.rank, r])) as Record<Rank, Rule>;

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}
