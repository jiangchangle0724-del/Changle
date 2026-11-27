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
  | "sides" // both neighbours
  | "all" // everyone
  | "group" // one of the table's own rounds starts (`play`), the loser drinks
  | "judge" // the table plays something off the screen, then the drawer names who lost (or nobody)
  | "hold"; // the holder keeps a standing power

/** The five standing powers (the `hold` cards), by name: who holds each, and each one's sound. */
export type Power = "buddy" | "camera" | "nose" | "wc" | "trouble";

/** The table's own rounds, the ones the screens run with clocks and buttons. */
export type Play = "garden" | "grab" | "sevens";

export type Rule = {
  /** which way of playing the rank this is; the table's choices (House) are kept by it, the classic one first in VARIANTS */
  id: string;
  rank: Rank;
  title: T;
  rule: T;
  kind: RuleKind;
  /** For standing powers: which one this card gives. */
  power?: Power;
  /** For the table's rounds: which one. */
  play?: Play;
  /** For standing powers: the short badge shown next to the holder's name. */
  badge?: T;
  /** A power with words of its own for the tap on the held card (the troublemaker's cousins). */
  action?: T;
  /** A power with a line of its own under the penalty it hands out. */
  note?: T;
  /** The card when the table plays for its own penalty instead of drinks (what it leaves out stays). */
  custom?: { title?: T; rule: T; badge?: T };
};

/** 每张牌可换玩法 (Steve, 11-26): the table's choice for each rank, by the variant's id; a rank left out plays the classic way. */
export type House = Partial<Record<Rank, string>>;

/** Where one phone keeps the table's house rules between games. */
export const HOUSE_KEY = "changle.rogue.house";

/** The powers' clocks, in ms: the camera's freeze, then how long its holder has to say who moved (after that nobody did), and the nose's window. */
export const ROGUE_MS = { freeze: 3500, judge: 20000, nose: 6000 };

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
    id: "point",
    rank: "A",
    kind: "pick",
    title: { zh: "指定", en: "Point" },
    rule: { zh: "指定在座任何一个人喝一口。", en: "Point at anyone at the table. They drink." },
    custom: { rule: { zh: "指定在座任何一个人受罚。", en: "Point at anyone at the table. They take the penalty." } },
  },
  {
    id: "buddy",
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
    id: "gardens",
    rank: "3",
    kind: "group",
    play: "garden",
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
    id: "grab",
    rank: "4",
    kind: "group",
    play: "grab",
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
    id: "camera",
    rank: "5",
    kind: "hold",
    power: "camera",
    title: { zh: "照相机", en: "Camera" },
    badge: { zh: "照相机", en: "Camera" },
    rule: {
      zh: "在这副牌发完之前，你有一次机会喊“照相机”，什么时候喊你挑。所有人立刻定格不动，动了的喝。",
      en: "Until this deck runs out you have one “camera!” to call, whenever you like. Everyone freezes. Whoever moves drinks.",
    },
    custom: {
      rule: {
        zh: "在这副牌发完之前，你有一次机会喊“照相机”，什么时候喊你挑。所有人立刻定格不动，动了的受罚。",
        en: "Until this deck runs out you have one “camera!” to call, whenever you like. Everyone freezes. Whoever moves takes the penalty.",
      },
    },
  },
  {
    id: "nose",
    rank: "6",
    kind: "hold",
    power: "nose",
    title: { zh: "摸鼻子", en: "Nose" },
    badge: { zh: "摸鼻子", en: "Nose" },
    rule: {
      zh: "在这副牌发完之前，你有一次机会喊“摸鼻子”，什么时候喊你挑。所有人都得摸鼻子，最后一个摸到的喝。",
      en: "Until this deck runs out you have one “nose!” to call, whenever you like. Everyone touches their nose. The last one drinks.",
    },
    custom: {
      rule: {
        zh: "在这副牌发完之前，你有一次机会喊“摸鼻子”，什么时候喊你挑。所有人都得摸鼻子，最后一个摸到的受罚。",
        en: "Until this deck runs out you have one “nose!” to call, whenever you like. Everyone touches their nose. The last one takes the penalty.",
      },
    },
  },
  {
    id: "sevens",
    rank: "7",
    kind: "group",
    play: "sevens",
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
    id: "wc",
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
    id: "me",
    rank: "9",
    kind: "self-sip",
    title: { zh: "自己喝", en: "Your Round" },
    rule: { zh: "自己喝一口。", en: "You take a sip." },
    custom: { title: { zh: "自罚", en: "On You" }, rule: { zh: "你自己受罚。", en: "You take the penalty." } },
  },
  {
    id: "trouble",
    rank: "10",
    kind: "hold",
    power: "trouble",
    title: { zh: "神经病", en: "Troublemaker" },
    badge: { zh: "神经病", en: "Trouble" },
    action: { zh: "谁接话了", en: "Who answered?" },
    note: { zh: "神经病：接了话", en: "Troublemaker: you answered" },
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
    id: "left",
    rank: "J",
    kind: "left",
    title: { zh: "左边", en: "Left" },
    rule: { zh: "你左边的人喝一口。", en: "The person on your left drinks." },
    custom: { rule: { zh: "你左边的人受罚。", en: "The person on your left takes the penalty." } },
  },
  {
    id: "right",
    rank: "Q",
    kind: "right",
    title: { zh: "右边", en: "Right" },
    rule: { zh: "你右边的人喝一口。", en: "The person on your right drinks." },
    custom: { rule: { zh: "你右边的人受罚。", en: "The person on your right takes the penalty." } },
  },
  {
    id: "king",
    rank: "K",
    kind: "self-full",
    title: { zh: "国王", en: "King" },
    rule: { zh: "自己喝一杯。", en: "You finish your drink." },
    // a sip and a whole glass are the same penalty once it isn't drinking
    custom: { rule: { zh: "你自己受罚。", en: "You take the penalty." } },
  },
];

/** The classic way of each rank (what a table plays with nothing chosen). */
export const RULE_BY_RANK: Record<Rank, Rule> = Object.fromEntries(RULES.map((r) => [r.rank, r])) as Record<Rank, Rule>;

/* ---------- the other ways a rank can play (每张牌可换玩法) ---------- */

/** The rounds the table plays off the screen, then the drawer names who lost: the same words for every rank that offers one. */
const judge = (id: string, title: T, rule: T, custom: T): Omit<Rule, "rank"> => ({ id, kind: "judge", title, rule, custom: { rule: custom } });
const RHYME = judge(
  "rhyme",
  { zh: "押韵", en: "Rhyme" },
  { zh: "你说一个词，从下一个人开始轮流说一个押韵的词，接不上或重复的，喝。", en: "Say a word. From the next player on, each says one that rhymes. Stall or repeat and you drink." },
  { zh: "你说一个词，从下一个人开始轮流说一个押韵的词，接不上或重复的，受罚。", en: "Say a word. From the next player on, each says one that rhymes. Stall or repeat and you take the penalty." },
);
const CATEGORIES = judge(
  "categories",
  { zh: "分类", en: "Categories" },
  { zh: "你出一个类别（比如汽车牌子），从下一个人开始轮流说一个，接不上或重复的，喝。", en: "Name a category (car brands, say). From the next player on, each names one. Stall or repeat and you drink." },
  { zh: "你出一个类别（比如汽车牌子），从下一个人开始轮流说一个，接不上或重复的，受罚。", en: "Name a category (car brands, say). From the next player on, each names one. Stall or repeat and you take the penalty." },
);
const HEAVEN = judge(
  "heaven",
  { zh: "举手", en: "Heaven" },
  { zh: "这张牌打完之前，你随时可以举手，大家得跟着举，最后一个举的喝。", en: "Before this card is done, raise a hand whenever you like. Everyone follows; the last hand up drinks." },
  { zh: "这张牌打完之前，你随时可以举手，大家得跟着举，最后一个举的受罚。", en: "Before this card is done, raise a hand whenever you like. Everyone follows; the last hand up takes the penalty." },
);
const FLOOR = judge(
  "floor",
  { zh: "摸地", en: "Floor" },
  { zh: "这张牌打完之前，你随时可以摸地板，大家得跟着摸，最后一个摸到的喝。", en: "Before this card is done, touch the floor whenever you like. Everyone follows; the last hand down drinks." },
  { zh: "这张牌打完之前，你随时可以摸地板，大家得跟着摸，最后一个摸到的受罚。", en: "Before this card is done, touch the floor whenever you like. Everyone follows; the last hand down takes the penalty." },
);
const TRUTH = judge(
  "truth",
  { zh: "真心话", en: "Truth" },
  { zh: "你问在座一个人一个问题，不肯答的，喝。", en: "Ask anyone at the table one question. Dodge it and you drink." },
  { zh: "你问在座一个人一个问题，不肯答的，受罚。", en: "Ask anyone at the table one question. Dodge it and you take the penalty." },
);
const WATERFALL: Omit<Rule, "rank"> = {
  id: "waterfall",
  kind: "all",
  title: { zh: "瀑布", en: "Waterfall" },
  rule: { zh: "全场一起喝：你先开始，下一个人等你开始了才能开始，等你停了才能停，依次往下传。", en: "Everyone drinks: you start; each next player starts after the one before, and may only stop once they have stopped." },
  custom: { rule: { zh: "全场一起受罚，从你开始依次往下。", en: "Everyone takes the penalty, starting with you, round the table." } },
};
const ME: Omit<Rule, "rank"> = { id: "me", kind: "self-sip", title: { zh: "自己喝", en: "Me" }, rule: { zh: "自己喝一口。", en: "You take a sip." }, custom: { title: { zh: "自罚", en: "On You" }, rule: { zh: "你自己受罚。", en: "You take the penalty." } } };

/**
 * Every way each rank can play, the classic one first. A power stays with its classic rank (two
 * ranks can't both hand out the camera), so the 10's other ways are the troublemaker's cousins:
 * the same held card, other words.
 */
export const VARIANTS: Record<Rank, Rule[]> = Object.fromEntries(
  RANKS.map((rank) => {
    const more: Omit<Rule, "rank">[] =
      rank === "A"
        ? [WATERFALL]
        : rank === "2"
          ? [{ id: "you", kind: "pick", title: { zh: "点名", en: "Two Is You" }, rule: { zh: "点一个人，他喝一口。", en: "Point at someone. They drink." }, custom: { rule: { zh: "点一个人，他受罚。", en: "Point at someone. They take the penalty." } } }]
          : rank === "3"
            ? [ME, RHYME]
            : rank === "4"
              ? [FLOOR]
              : rank === "5"
                ? [HEAVEN]
                : rank === "6"
                  ? [TRUTH]
                  : rank === "7"
                    ? [HEAVEN]
                    : rank === "8"
                      ? [{ id: "sides", kind: "sides", title: { zh: "左右", en: "Neighbours" }, rule: { zh: "你左右两边的人各喝一口。", en: "Both your neighbours drink." }, custom: { rule: { zh: "你左右两边的人都受罚。", en: "Both your neighbours take the penalty." } } }]
                      : rank === "9"
                        ? [RHYME]
                        : rank === "10"
                          ? [
                              {
                                id: "question",
                                kind: "hold",
                                power: "trouble",
                                title: { zh: "问题大师", en: "Question Master" },
                                badge: { zh: "问题大师", en: "Q-Master" },
                                action: { zh: "谁答了", en: "Who answered?" },
                                note: { zh: "问题大师：答了问题", en: "Question master: you answered" },
                                rule: { zh: "在这副牌发完之前，你是问题大师：谁回答了你的问题，谁喝。", en: "Until this deck runs out you're the question master: whoever answers a question of yours drinks." },
                                custom: { rule: { zh: "在这副牌发完之前，你是问题大师：谁回答了你的问题，谁受罚。", en: "Until this deck runs out you're the question master: whoever answers a question of yours takes the penalty." } },
                              },
                              {
                                id: "rulemaker",
                                kind: "hold",
                                power: "trouble",
                                title: { zh: "定规矩", en: "Rule Maker" },
                                badge: { zh: "规矩", en: "Rule" },
                                action: { zh: "谁犯规了", en: "Who broke it?" },
                                note: { zh: "定规矩：犯规了", en: "Rule maker: you broke the rule" },
                                rule: { zh: "你定一条规矩（比如不许叫名字），这副牌发完之前谁犯规谁喝。", en: "Make a rule (no first names, say). Until this deck runs out, break it and you drink." },
                                custom: { rule: { zh: "你定一条规矩（比如不许叫名字），这副牌发完之前谁犯规谁受罚。", en: "Make a rule (no first names, say). Until this deck runs out, break it and you take the penalty." } },
                              },
                            ]
                          : rank === "J"
                            ? [CATEGORIES]
                            : rank === "Q"
                              ? [TRUTH]
                              : [{ id: "round", kind: "all", title: { zh: "国王请客", en: "King's Round" }, rule: { zh: "全场每人喝一口。", en: "Everyone takes a sip." }, custom: { rule: { zh: "全场每人都受罚。", en: "Everyone takes the penalty." } } }];
    return [rank, [RULE_BY_RANK[rank], ...more.map((m) => ({ ...m, rank }))]];
  }),
) as Record<Rank, Rule[]>;

/** The rule a rank plays by at this table: the house's choice, or the classic one. */
export function ruleFor(rank: Rank, house?: House | null): Rule {
  const id = house?.[rank];
  return (id && VARIANTS[rank].find((r) => r.id === id)) || RULE_BY_RANK[rank];
}

/** The rank that hands out a power (powers stay with their classic rank). */
export const POWER_RANK: Record<Power, Rank> = { buddy: "2", camera: "5", nose: "6", wc: "8", trouble: "10" };

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}
