import type { T } from "../i18n";
import type { DramaLevel } from "./drama";
import { READ_BOTH } from "./dramaReadingsBoth";
import { READ_EN } from "./dramaReadingsEn";
import { READ_ZH } from "./dramaReadingsZh";

/**
 * 戏精大赏 · 朗读 (read aloud): one person reads a piece out loud, the way it asks (through tears, with
 * a straight face, in a courtier's voice, from the heart...), and the audience gives stars. A piece
 * takes a minute and a half or so out loud.
 *
 * Three sets, picked by the host: bits from the Chinese internet (`zh`: 疯狂星期四, 发疯文学, 奏折和朱批,
 * 直播带货...), from the English internet (`en`: LinkedIn posts, Notes-app apologies, slam poetry,
 * infomercials...), and pieces about things everyone knows (`both`: the Wi-Fi, the alarm clock, the
 * cat), written to work in either language. Every piece is in both languages, so a table of mixed
 * readers can share a set.
 *
 * Every word is our own, written in the style of the format; nothing is copied from the posts and
 * videos the formats come from. `lines` are read in order, one breath each.
 */

export type ReadSet = "zh" | "en" | "both";
export type ReadKind = "cry" | "deadpan" | "breakup" | "court" | "anchor" | "rant" | "melodrama" | "sell" | "sorry" | "voice" | "deep";
export type ReadPiece = {
  id: string;
  set: ReadSet;
  kind: ReadKind;
  level: DramaLevel;
  title: T;
  /** this piece's own direction, on top of its kind's */
  how: T;
  lines: T[];
};
/** A way of reading: what it's called, how to read in it, and what the audience gives stars for. */
export type ReadKindInfo = { key: ReadKind; name: T; how: T; ask: T };

const t = (zh: string, en: string): T => ({ zh, en });

export const READ_KINDS: ReadKindInfo[] = [
  {
    key: "cry",
    name: t("哭着读", "Read it in tears"),
    how: t("带着哭腔，声情并茂。读到最动情的地方哽咽一下，吸吸鼻子再接着读。", "Read it through tears, with all your heart. Choke up at the most moving bit, sniff, and carry on."),
    ask: t("哭得够不够真？", "How real were the tears?"),
  },
  {
    key: "deadpan",
    name: t("憋笑读", "Straight face"),
    how: t("一本正经，全程不许笑，笑出声就输。观众可以做鬼脸逗你，但不许出声。", "Dead serious, no laughing at all: laugh out loud and you lose. The audience may pull faces at you, but not make a sound."),
    ask: t("绷住了吗？笑出声了就给 1 星", "Did they keep a straight face? A laugh out loud gets one star."),
  },
  {
    key: "breakup",
    name: t("分手", "The breakup"),
    how: t("开头冷静克制，越读越崩溃，最后一句说得斩钉截铁。", "Calm and controlled at first, falling apart as you go, and the last line said like you mean it."),
    ask: t("像不像真的在分手？", "Did it feel like a real breakup?"),
  },
  {
    key: "court",
    name: t("上奏折", "The royal court"),
    how: t("想象自己跪在大殿上（真跪也行）。大臣腔，抑扬顿挫，每句话的最后一个字拖长。", "Picture yourself kneeling in the palace hall (or really kneel). A courtier's voice, rising and falling, stretching the last word of every line."),
    ask: t("有没有朝堂的味道？", "Fit for the royal court?"),
  },
  {
    key: "anchor",
    name: t("播音腔", "Broadcast voice"),
    how: t("字正腔圆，面无表情，像在播新闻或者纪录片。内容再离谱，语气都不能变。", "Crisp and clear, poker-faced, like the news or a documentary. However absurd it gets, the tone never changes."),
    ask: t("像不像正经播音员？", "Did they sound like the real thing?"),
  },
  {
    key: "rant",
    name: t("发疯文学", "The meltdown"),
    how: t("从平静开始，一句比一句激动，语速越来越快，最后一句喊出来，破音也没关系。", "Start calm and get more worked up with every line, faster and faster. Shout the last one; voice cracks welcome."),
    ask: t("疯得够不够彻底？", "Was that a full meltdown?"),
  },
  {
    key: "melodrama",
    name: t("霸总狗血剧", "Melodrama"),
    how: t("深情地盯着一个观众，说得很慢，尾音拖长，该咆哮的地方就咆哮。", "Gaze deeply at someone in the audience. Slow, lingering on the last word, and roar where it calls for it."),
    ask: t("够不够狗血？", "Soap-opera enough?"),
  },
  {
    key: "sell",
    name: t("直播带货", "The hard sell"),
    how: t("像直播间的主播，热情到夸张，越读越快，最后一句大喊出来。", "Like a livestream seller: over-the-top keen, faster and faster, and yell the last line."),
    ask: t("听完想不想下单？", "Would you buy it?"),
  },
  {
    key: "sorry",
    name: t("道歉声明", "The apology"),
    how: t("沉痛，眼睛看地，一句一停，读完深深鞠一躬。", "Sombre, eyes down, a pause after every line, and a deep bow at the end."),
    ask: t("道歉够不够诚恳？", "How sincere was that?"),
  },
  {
    key: "voice",
    name: t("腔调大赏", "Do the voice"),
    how: t("照这一段要的腔调读，越夸张越好，是什么腔写在下面。", "Use the voice this piece asks for, as over the top as you can. Which voice is written below."),
    ask: t("腔调像不像？", "Did they nail the voice?"),
  },
  {
    // the one kind played straight: a confession, wedding vows, a letter home, to a best friend, to yourself
    key: "deep",
    name: t("深情款款", "From the heart"),
    how: t("慢一点，轻一点。挑屋里一个人，看着对方的眼睛读，就像屋里只剩你们两个。最重要的那一句之前，停一下。", "Slow down and soften your voice. Pick one person in the room and read it to them, as if nobody else were there. Pause before the line that matters most."),
    ask: t("听得心里一软了吗？", "Did it melt your heart?"),
  },
];

export const readKind = (k: string | undefined): ReadKindInfo | undefined => READ_KINDS.find((x) => x.key === k);

/** The three sets, as the host and the playbill name them. */
export const RSET_NAME: Record<ReadSet, T> = {
  zh: t("中文网络", "Chinese internet"),
  en: t("英文网络", "English internet"),
  both: t("中英通用", "Works for both"),
};

/** For someone reading out loud for the first time: five things that get the laugh (or the tears). */
export const READ_TIPS: T[] = [
  t("先默读一遍，找到最好笑或最动情的那一句，读到那里放慢。", "Read it over once first. Find the funniest or most moving line, and slow down when you get there."),
  t("腔调比字准重要。读错一个字，就当是角色读错的，接着读。", "The voice matters more than the words. Fluff a word? That's the character's mistake. Keep going."),
  t("停顿是你的武器：最重要的那句之前，停两秒。", "Pauses are your secret weapon: wait two seconds before the big line."),
  t("眼睛时不时离开手机，看着观众读一句。", "Look up from the phone now and then, and say a line straight to the audience."),
  t("快笑场的时候，深吸一口气，盯着一个不好笑的东西，比如天花板。", "About to crack? Breathe in and stare at something unfunny, like the ceiling."),
];

/** Under this many stars on average, the reader pays. */
export const READ_PASS = 3;

export const READINGS: ReadPiece[] = [...READ_ZH, ...READ_EN, ...READ_BOTH];
