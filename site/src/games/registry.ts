import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, Club, Crown, Dices, Disc3, Drama, Footprints, GalleryHorizontalEnd, Grab, Hand, Luggage, MessageSquareQuote, Music, PenLine, ShipWheel, Snowflake, Spade, Speech, StickyNote, Trophy, VenetianMask, Wine } from "lucide-react";
import { UsersRound } from "lucide-react";
import type { T } from "../i18n";
import { LC_CALL, LC_NAME } from "../shared/lastcard/name";
import type { Category } from "../ui/types";

export type GameId =
  | "truth"
  | "drama"
  | "rogue"
  | "superlatives"
  | "king"
  | "postit"
  | "limbo"
  | "prompts"
  | "euchre"
  | "dice"
  | "freeze"
  | "wheel"
  | "undercover"
  | "straightface"
  | "tune"
  | "punchline"
  | "draw"
  | "trip"
  | "dj"
  | "hide"
  | "lastcard"
  | "dance"
  | "hangon";

export type GameMeta = {
  id: GameId;
  /** its address: changle.ca/g/<slug>. Never change one: shared links and search results use it. */
  slug: string;
  name: T;
  blurb: T;
  /** two or three lines for the game card */
  how: T;
  /** the same lines when this phone has its own penalty instead of drinking (games whose lines say drink) */
  howCustom?: T;
  minPlayers: number;
  maxPlayers: number;
  /** stage gel: the color the room turns when this game is up */
  gel: string;
  icon: LucideIcon;
  /** built and playable today; the rest show as coming soon */
  ready: boolean;
  /**
   * not on any board yet (not even as coming soon): only its own address opens it, and a table's
   * lobby shows it only while it is the game up (the DJ booth, at changle.ca/dj)
   */
  hidden?: boolean;
  /**
   * it plays from a big screen at this address (the DJ booth's speaker, /dj): its card sends a
   * computer straight there and tells a phone where to go; there is no one-phone mode, and a
   * table's spin never lands on it (it needs that screen first)
   */
  speaker?: string;
  /**
   * it runs on its own Worker, not in this site (一起跳 at changle.ca/party): `screen` is the big
   * screen's page and `join` the phones' page. Both are whole-page loads. Its card sends a computer
   * to `screen` and tells a phone where to go; /g/<slug>/play goes to `screen` too. There is no
   * one-phone mode and no table game: a table's spin never lands on it (it isn't in ONLINE_GAMES).
   */
  stage?: {
    screen: string;
    join: string;
    /** the stage button's second line */
    note?: T;
    /** the stage is this phone or computer, mirrored to the TV (一起跳, Steve 11-11): the button and its help say so */
    mirror?: boolean;
  };
  /**
   * its kind, which colors its card (decided 2026-11-01: cards by kind, not one color per game; the
   * stage gel above stays the game's own light): drink 喝酒局, brain 动脑, body 动身体, online 线上
   */
  category: Exclude<Category, "tool">;
  /** how long a round usually takes, in minutes (on its card) */
  minutes: number;
  /** a drinking game at heart: a glass on its card, and the 不喝酒 filter leaves it out */
  drinking?: boolean;
  /** its card says 新 / New until this day (YYYY-MM-DD), about a month after it went live */
  newUntil?: string;
  /** one-phone play needs a different number of names, or works differently */
  solo?: { min: number; hint: T };
};

const t = (zh: string, en: string): T => ({ zh, en });

/** 最后一张's how-to: one text, its last words the table's penalty (kept short: the home page carries it). */
const lcHow = (zh: string, en: string) =>
  t(`每人 7 张，跟颜色、数字或符号出牌，出不了就摸。剩一张要喊「${LC_CALL.zh}」，没喊被抓到摸 2 张。先出完的赢，剩牌最多的${zh}。`, `Seven cards each: match the colour, number or symbol, or draw. Call it at one card, or draw 2 if caught. First out wins; most cards left ${en}.`);

/** In spectrum order: the grid reads as one sweep of stage light. */
export const GAMES: GameMeta[] = [
  {
    id: "truth",
    slug: "truth-or-dare",
    name: t("真心话大冒险", "Truth or Dare"),
    blurb: t("转瓶子，指到谁谁选", "Spin the bottle. It points, you choose."),
    how: t("瓶子停在谁面前，谁就选真心话或大冒险。不想答也不想做，就认罚。", "Whoever the bottle stops at picks truth or dare. Won't do either? Take the penalty."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#ff5fa2",
    icon: Wine,
    category: "drink",
    minutes: 10,
    drinking: true,
    ready: true,
  },

  {
    id: "rogue",
    slug: "rogue-thirteen",
    name: t("流氓十三张", "Rogue Thirteen"),
    blurb: t("抽一张牌，牌面说了算", "Draw a card. The card is the law."),
    how: t("轮流抽牌，A 到 K 每张都有一条规矩：指定喝、陪酒、厕所券、摸鼻子……", "Take turns drawing. Ace to King, every card carries a rule: make someone drink, a drinking buddy, a bathroom pass, touch your nose…"),
    howCustom: t("轮流抽牌，A 到 K 每张都有一条规矩：指定谁受罚、陪罚、厕所券、摸鼻子……", "Take turns drawing. Ace to King, every card carries a rule: hand someone the penalty, a penalty buddy, a bathroom pass, touch your nose…"),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#ff6b5e",
    icon: Club,
    category: "drink",
    minutes: 20,
    drinking: true,
    ready: true,
  },
  {
    id: "trip",
    slug: "been-there",
    name: t("到此一游", "Been There, Bought That"),
    blurb: t("环游世界，把城市买下来", "Travel the world. Buy the cities."),
    how: t(
      "掷骰子绕地球一圈，买下 22 座真城、盖民宿收租金。每座城都有一条按它真实特点定的规则：威尼斯涨潮租金减半，东京早高峰被挤到下一格。2 到 6 队，每队 1 到 3 人，人不够就加电脑队。",
      "Roll your way round the world: buy 22 real cities, build, collect rent. Every city has a rule from a real fact: Venice floods and rent halves, Tokyo's rush hour shoves you on a space. 2 to 6 teams of 1 to 3, with computer teams to fill in.",
    ),
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#ff8a6b",
    icon: Luggage,
    category: "online",
    minutes: 45,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 1, hint: t("一台手机轮流玩，可以加电脑队", "Pass one phone round, with computer teams if you like") },
  },
  {
    id: "superlatives",
    slug: "superlatives",
    name: t("最佳称号", "Superlatives"),
    blurb: t("谁最可能……投票颁奖", "Who's most likely to… Vote, then hand out awards."),
    how: t("每轮一个称号，大家投票选人，票最多的拿奖也喝。最后有颁奖典礼。", "One title a round. Everyone votes for a person; the winner takes the award and the drink. Awards ceremony at the end."),
    howCustom: t("每轮一个称号，大家投票选人，票最多的拿奖也受罚。最后有颁奖典礼。", "One title a round. Everyone votes for a person; the winner takes the award and the penalty. Awards ceremony at the end."),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#ff8c42",
    icon: Trophy,
    category: "brain",
    minutes: 15,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 3, hint: t("传手机偷偷投票，或者一起指", "Pass it round for secret votes, or point together") },
  },
  {
    id: "king",
    slug: "kings-game",
    name: t("国王游戏", "King's Game"),
    blurb: t("抽签，国王说了算", "Draw a stick. The king decides."),
    how: t("每人抽一支签，抽到王冠的是国王。国王点号码下命令，被点到的号码必须照做。", "Everyone draws a stick. The crown is the king, who calls out numbers and gives orders. Numbers must obey."),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#ffb82e",
    icon: Crown,
    category: "drink",
    minutes: 10,
    drinking: true,
    ready: true,
  },
  {
    id: "drama",
    slug: "drama-queens",
    name: t("戏精大赏", "Drama Queens"),
    blurb: t("演一出狗血剧，揪出谁是小三", "Act out a soap opera. Find the culprit."),
    how: t(
      "每轮几个人上台演一段狗血剧情，其中一个人偷偷是小三或凶手。观众猜是谁，再给每个人的演技打星。被识破的、演得最差的受罚。",
      "Each round a few players act out a soap-opera scene, and one of them is secretly the culprit. The audience guesses who, then gives every actor stars. Get caught, or act worst, and you pay.",
    ),
    // one person at a table can play (monologues and readings, the room guessing out loud); one phone passed round takes three
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#ffcf6b",
    icon: Drama,
    category: "brain",
    minutes: 20,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 3, hint: t("手机传着看身份牌，演完再传着投票", "Pass it round to read the cards, then again to vote") },
  },
  {
    id: "postit",
    slug: "post-it",
    name: t("额头便利贴", "Post-it Note"),
    blurb: t("贴在额头上，猜我是谁", "Stuck to your forehead. Who am I?"),
    how: t("每个人额头上一张便利贴，别人都看得到，只有你看不到。轮流问是非题，猜错喝一口，最后一个没猜出来的喝一杯。一部手机就举到额头上，大家给提示。", "A note on every forehead that everyone sees except you. Take turns asking yes or no questions; a wrong guess is a sip, and the last one still guessing drinks a glass. On one phone, hold it to your forehead while the room gives clues."),
    howCustom: t("每个人额头上一张便利贴，别人都看得到，只有你看不到。轮流问是非题，猜错受罚，最后一个没猜出来的也受罚。一部手机就举到额头上，大家给提示。", "A note on every forehead that everyone sees except you. Take turns asking yes or no questions; a wrong guess takes the penalty, and so does the last one still guessing. On one phone, hold it to your forehead while the room gives clues."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#f5df3b",
    icon: StickyNote,
    category: "brain",
    minutes: 10,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 0, hint: t("举到额头上，大家给提示", "Hold it to your forehead, the room gives clues") },
  },
  {
    id: "limbo",
    slug: "limbo",
    name: t("林波舞", "Limbo"),
    blurb: t("音乐响起，横杆越来越低", "Music on, bar goes lower."),
    how: t("手机屏幕朝外贴在胸口，往后仰，它测你仰了多少度，过了这一杆横杆再降。看不见屏幕也不怕，提示音告诉你该再仰还是回来。没过的出局喝一口。还有稳住、跟着动的杆、歪着过三种玩法，派对玩法每杆随机一种。盲仰玩法：看不到自己的角度，凭感觉仰到目标，离得最远的喝。也可以拉一根真杆子，手机放音乐记分。", "Hold the phone to your chest, screen out, and lean back: it measures how far you go, and its sounds tell you whether to go lower or come up. Clear the bar and it drops again. Miss and you're out (drink). Also hold steady, moving bar and tilt through; party mode picks one at random each bar. Blind lean: hit a target angle without seeing your own; furthest off drinks. Or use a real bar, and the phone does the music and the score."),
    howCustom: t("手机屏幕朝外贴在胸口，往后仰，它测你仰了多少度，过了这一杆横杆再降。看不见屏幕也不怕，提示音告诉你该再仰还是回来。没过的出局受罚。还有稳住、跟着动的杆、歪着过三种玩法，派对玩法每杆随机一种。盲仰玩法：看不到自己的角度，凭感觉仰到目标，离得最远的受罚。也可以拉一根真杆子，手机放音乐记分。", "Hold the phone to your chest, screen out, and lean back: it measures how far you go, and its sounds tell you whether to go lower or come up. Clear the bar and it drops again. Miss and you're out (penalty). Also hold steady, moving bar and tilt through; party mode picks one at random each bar. Blind lean: hit a target angle without seeing your own; furthest off takes the penalty. Or use a real bar, and the phone does the music and the score."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#b6e83a",
    icon: ArrowDownToLine,
    category: "body",
    minutes: 5,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 1, hint: t("手机测你后仰的角度，或者配真杆子", "The phone measures your lean, or use a real bar") },
  },
  {
    id: "prompts",
    slug: "never-have-i-ever",
    name: t("我从来没有", "Never Have I Ever"),
    blurb: t("做过的喝，谁最有可能", "Done it? Drink. Plus Most Likely To."),
    how: t("念一句“我从来没有……”，做过的人喝。也可以换成“谁最有可能”，大家一起指人。", "Read “Never have I ever…”. Anyone who has, drinks. Switch to Most Likely To and everyone points at once."),
    howCustom: t("念一句“我从来没有……”，做过的人受罚。也可以换成“谁最有可能”，大家一起指人。", "Read “Never have I ever…”. Anyone who has takes the penalty. Switch to Most Likely To and everyone points at once."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#4be38f",
    icon: Hand,
    category: "drink",
    minutes: 10,
    drinking: true,
    ready: true,
  },
  {
    id: "euchre",
    slug: "euchre",
    name: t("尤克牌", "Euchre"),
    blurb: t("四人两队，抢五墩", "Two teams of two. Win the tricks."),
    how: t("24 张牌，叫主、跟牌、抢墩，先到 10 分的队赢。人不够四个，电脑补位。", "24 cards. Call trump, follow suit, take tricks. First team to 10 wins. Short of four? Bots fill the seats."),
    minPlayers: 2,
    maxPlayers: 4,
    gel: "#22d3a6",
    icon: Spade,
    category: "brain",
    minutes: 20,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 0, hint: t("你和三个电脑玩家", "You and three computer players") },
  },
  {
    id: "dice",
    slug: "seven-eight-nine",
    name: t("七八九", "Seven Eight Nine"),
    blurb: t("两颗骰子，一个公杯", "Two dice, one shared glass."),
    how: t("掷出七往公杯里倒酒，八喝一半，九全喝，双一指定别人喝完。", "Roll a seven, top up the shared glass. Eight, drink half. Nine, drink it all. Snake eyes, pick someone to finish it."),
    howCustom: t("掷出七罚池加码，八罚一半，九全罚，双一指定别人全罚。", "Roll a seven and the shared pot grows. Eight, take half of it. Nine, take it all. Snake eyes, pick someone to take the lot."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#2ed3d9",
    icon: Dices,
    category: "drink",
    minutes: 10,
    drinking: true,
    ready: true,
  },
  {
    id: "freeze",
    slug: "freeze-dance",
    name: t("木头人蹦迪", "Freeze Dance"),
    blurb: t("音乐一停，全场定住", "When the music stops, freeze."),
    how: t("音乐响就跳，突然停下时所有人定住不动。动了的人喝。联机时每部手机同时停。", "Dance while it plays. When it cuts out, everyone freezes. Whoever moves, drinks. Online, every phone stops at the same moment."),
    howCustom: t("音乐响就跳，突然停下时所有人定住不动。动了的人受罚。联机时每部手机同时停。", "Dance while it plays. When it cuts out, everyone freezes. Whoever moves takes the penalty. Online, every phone stops at the same moment."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#31b9ff",
    icon: Snowflake,
    category: "body",
    minutes: 5,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 2, hint: t("手机放音乐，一个人当裁判", "The phone plays the music, one person judges") },
  },
  {
    id: "wheel",
    slug: "wheel-of-fate",
    name: t("命运转盘", "Wheel of Fate"),
    blurb: t("惩罚由转盘定", "The wheel sets the penalty."),
    how: t("转盘上写满惩罚，可以自己改。转到什么做什么。", "The wheel is loaded with penalties you can edit. Spin it, do what it lands on."),
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#5b9bff",
    icon: ShipWheel,
    category: "drink",
    minutes: 10,
    drinking: true,
    ready: true,
  },
  {
    id: "undercover",
    slug: "undercover",
    name: t("谁是卧底", "Undercover"),
    blurb: t("一个词不一样，找出那个人", "One word is different. Find the one."),
    how: t("每人拿到一个词，卧底的词和大家不同。轮流描述，投票找出卧底。", "Everyone gets a word; the undercover's is slightly different. Describe yours in turn, then vote out the undercover."),
    minPlayers: 4,
    maxPlayers: 15,
    gel: "#8c86ff",
    icon: VenetianMask,
    category: "brain",
    minutes: 15,
    ready: true,
  },
  {
    // 一本正经: new (2026-11-04), on the board since 2026-11-05. One phone passed round, or online with every
    // phone its own (rules on the rooms server: src/shared/engine/games/straightface.ts)
    id: "straightface",
    slug: "in-all-seriousness",
    name: t("一本正经", "In All Seriousness"),
    blurb: t("一个冷门词，只有一个人知道真意思", "One obscure word. Only one of you knows what it means."),
    how: t(
      "每轮一个裁判、一个冷门词。只有老实人看过真释义，其他人现编。大家轮流一本正经地解释，裁判追问、贴疑点，最后指认老实人。被指认的人得分，不管是不是老实人；指对了裁判也得分。裁判看走眼喝一口，骗到裁判的人指定一个人喝。",
      "Each round: a judge and an obscure word. Only the honest one has read the real meaning; everyone else makes one up. Explain it in turn with a straight face; the judge asks, tags a suspect, then names the honest one. Whoever is named scores, honest or not; a right judge scores too. A fooled judge drinks, and the bluffer who fooled them picks someone to drink.",
    ),
    howCustom: t(
      "每轮一个裁判、一个冷门词。只有老实人看过真释义，其他人现编。大家轮流一本正经地解释，裁判追问、贴疑点，最后指认老实人。被指认的人得分，不管是不是老实人；指对了裁判也得分。裁判看走眼受罚，骗到裁判的人指定一个人受罚。",
      "Each round: a judge and an obscure word. Only the honest one has read the real meaning; everyone else makes one up. Explain it in turn with a straight face; the judge asks, tags a suspect, then names the honest one. Whoever is named scores, honest or not; a right judge scores too. A fooled judge takes the penalty, and the bluffer who fooled them picks someone to take it.",
    ),
    minPlayers: 3,
    maxPlayers: 9,
    gel: "#9d7bff",
    icon: Speech,
    category: "brain",
    minutes: 15,
    ready: true,
    newUntil: "2026-12-15",
    solo: { min: 3, hint: t("4 到 9 人最好玩，手机传着看身份", "Best with 4 to 9. The phone goes round for a private peek") },
  },
  {
    id: "tune",
    slug: "name-that-tune",
    name: t("猜歌名", "Name That Tune"),
    blurb: t("几个音就能猜出来吗", "Can you name it in a few notes?"),
    how: t(
      "放真歌的 30 秒试听，抢答说出歌名，华语、英文或混着来。也可以只放旋律，或者用自己的音乐 App 放歌，这里只管抢答和计分。",
      "Real songs play as 30-second previews: buzz in and name them, in Chinese, English or both. Or play melodies, or play songs from your own music app and use this for buzzers and scores.",
    ),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#b072ff",
    icon: Music,
    category: "brain",
    minutes: 15,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 1, hint: t("手机放真歌或旋律，也能当抢答器", "The phone plays real songs or melodies, or becomes the buzzers") },
  },
  {
    id: "punchline",
    slug: "punchline",
    name: t("神回复", "Punchline"),
    blurb: t("写最好笑的答案，大家投票", "Write the funniest answer. Everyone votes."),
    how: t("每个题目两个人各写一个答案，其他人投票。票少的喝，全票通过有加分。", "Two players answer each prompt, everyone else votes. Fewer votes, you drink. A clean sweep scores a bonus."),
    howCustom: t("每个题目两个人各写一个答案，其他人投票。票少的受罚，全票通过有加分。", "Two players answer each prompt, everyone else votes. Fewer votes, you take the penalty. A clean sweep scores a bonus."),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#e765f0",
    icon: MessageSquareQuote,
    category: "online",
    minutes: 20,
    ready: true,
    newUntil: "2026-12-01",
    solo: { min: 3, hint: t("手机传一圈，偷偷写答案", "Pass it round and write in secret") },
  },
  {
    id: "draw",
    slug: "draw-and-guess",
    name: t("你画我猜", "Draw & Guess"),
    blurb: t("画出来，一分钟内猜", "Draw it, guess it in a minute."),
    how: t("轮到的人看词作画，其他人猜。一分钟没人猜中，画的人喝。", "The drawer sees a word and draws it; everyone else guesses. Nobody gets it in a minute? The drawer drinks."),
    howCustom: t("轮到的人看词作画，其他人猜。一分钟没人猜中，画的人受罚。", "The drawer sees a word and draws it; everyone else guesses. Nobody gets it in a minute? The drawer takes the penalty."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#ff9cc5",
    icon: PenLine,
    category: "brain",
    minutes: 15,
    ready: true,
  },
  {
    id: "dj",
    slug: "dj-booth",
    name: t("打碟", "DJ Booth"),
    blurb: t("电视当音箱，大家用手机一起打碟", "The TV is the speaker. Everyone DJs from their phone."),
    how: t(
      "公用手机投屏到电视当音箱（或者电视、电脑打开 changle.ca/dj），在上面点 YouTube 的歌。扫码进来，每台手机都是打碟台：推子在两个碟之间混，效果键卡在拍子上，一起狂点蓄力，跟着倒数按 DROP，踩准了就是完美 Drop。新手也不会乱。",
      "A shared phone mirrored to the TV is the speaker (or open changle.ca/dj on a TV or computer), and songs from YouTube are picked on it. Scan in and every phone is a deck: the crossfader mixes two decks, the pads land on the beat, everyone taps the build-up together and presses DROP on the count. Hit it right for a perfect drop. Nothing a beginner presses can go wrong.",
    ),
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#ff5ad8",
    icon: Disc3,
    category: "body",
    minutes: 30,
    ready: true,
    speaker: "/dj",
    newUntil: "2026-12-01",
  },
  // its own Worker at changle.ca/hide (games/hide-crowd), started from a table like 到此一游; its gel
  // fills the green gap between Limbo's lime and the mint, its card sits last so the board stays put
  {
    id: "hide",
    slug: "hide-in-the-crowd",
    name: t("藏在人群里", "Hide in the Crowd"),
    blurb: t("混进人群，认出对手先出拳", "Blend into the crowd. Spot a rival, punch first."),
    how: t(
      "每人用自己的手机控制人群里的一个人，走得像电脑带着的路人，别人就认不出你。认出对手就出拳：打中得分，打到路人你会愣一下。先到 3 分的赢，被认出最多的喝一口。电视上看全场，不标出谁是真人。",
      "Everyone steers one person in a crowd of computer-run passers-by from their own phone. Walk like them and nobody can tell it's you. Spot a rival and punch: a hit scores, a passer-by stuns you. First to 3 wins; whoever got spotted most takes a sip. The TV shows the whole crowd and never marks who's human.",
    ),
    howCustom: t(
      "每人用自己的手机控制人群里的一个人，走得像电脑带着的路人，别人就认不出你。认出对手就出拳：打中得分，打到路人你会愣一下。先到 3 分的赢，被认出最多的受罚。电视上看全场，不标出谁是真人。",
      "Everyone steers one person in a crowd of computer-run passers-by from their own phone. Walk like them and nobody can tell it's you. Spot a rival and punch: a hit scores, a passer-by stuns you. First to 3 wins; whoever got spotted most takes the penalty. The TV shows the whole crowd and never marks who's human.",
    ),
    minPlayers: 2,
    maxPlayers: 8,
    gel: "#7be55c",
    icon: UsersRound,
    category: "online",
    minutes: 10,
    ready: true,
    newUntil: "2026-12-03",
    solo: { min: 0, hint: t("一台手机：和三个电脑对手练手", "One phone: practise against three computer rivals") },
  },
  // 最后一张: new (2026-11-05), online only, hidden until Steve has played a round. Its name lives in
  // shared/lastcard/name.ts; /g/last-card/play opens a table for it (party/lastcard/Start.tsx)
  {
    id: "lastcard",
    slug: "last-card",
    name: LC_NAME,
    blurb: t("跟色跟数，出光就赢", "Match it, shed it, win."),
    how: lcHow("喝一口", "drinks"),
    howCustom: lcHow("受罚", "takes the penalty"),
    minPlayers: 2,
    maxPlayers: 10,
    gel: "#d36cff",
    icon: GalleryHorizontalEnd,
    category: "online",
    minutes: 15,
    ready: true,
    hidden: true,
    newUntil: "2026-12-20",
    solo: { min: 0, hint: t("只能联机", "Online only") },
  },
  // its own Worker at changle.ca/party (games/party-server): a TV or computer is the stage, phones
  // scan in. It went live 11-05 from "coming soon"; its card sits last so the board stays put
  {
    id: "dance",
    slug: "dance-along",
    name: t("一起跳", "Dance Along"),
    blurb: t("跟着电视一起跳，手机听拍子", "Dance with the TV. Your phone keeps the beat."),
    how: t(
      "电视或电脑打开 changle.ca/party/screen 当舞台，大家扫码进来。电视上的 3D 老师先一段一段教，再跟着音乐一起跳，手里的手机知道你有没有踩在拍子上。6 支练习舞，还有一串热歌（江南Style、APT.、爱你……），零基础也能跳完一首。",
      "Open changle.ca/party/screen on a TV or computer: that's the stage. Everyone scans in. A 3D coach on the TV teaches a few easy moves, then everyone dances to the music, and the phone in your hand knows if you're on the beat. Six practice dances and a set of hit songs (Gangnam Style, APT. and more). Anyone can finish a song.",
    ),
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#8f7bff",
    icon: Footprints,
    category: "body",
    minutes: 8,
    ready: true,
    stage: {
      screen: "/party/screen",
      join: "/party/join",
      note: t("投到电视上当舞台，这台不参与游玩；大家用自己的手机跳", "It's the stage on the TV, not a player; everyone dances with their own phone"),
      mirror: true,
    },
    newUntil: "2026-12-05",
  },
  // its own Worker at changle.ca/hang-on (games/hang-on): a TV or computer is the big screen, phones
  // scan in as controllers; opened on a phone it is a phones-only room (11-11: one phone hosts, every
  // phone shows the game). Went on the board 11-11 (before that only its address); it sits last so
  // the board stays put
  {
    id: "hangon",
    slug: "hang-on",
    name: t("抓紧了", "Hang On"),
    blurb: t("两只手轮流抓，全队一起爬到顶", "Grab with both hands and climb to the top together."),
    how: t(
      "电视或电脑打开 changle.ca/hang-on 当大屏，大家用手机扫码进来当手柄；没有电视，就在一部手机上打开，大家都在自己手机上看。每人是一个糯米团，不能跳，只有两只手：按住就抓，松开就放，摇杆管身体往哪边荡。1 到 6 个人合作，全队都到顶才算过关，摔下去会在存档点复活；可以拉着队友荡过去，也可以把队友丢过去。12 关，从年夜饭桌一路爬到温哥华海湾。开局前还能选比谁先（先到顶的赢）和坐不住（摔了不复活，最后挂着的赢）。",
      "Open changle.ca/hang-on on a TV or computer as the big screen. Everyone scans in, and each phone becomes a controller. No TV? Open it on one phone, and everyone plays on their own screen. You're a rice dumpling with two arms and no jumping: hold a button to grab, let go to drop, and the stick swings your body. 1 to 6 players work together, and the whole team has to reach the top. Fall and you come back at the last checkpoint. Swing a teammate across, or throw one. 12 levels, from a family dinner table to Vancouver's harbour. Before you start you can also pick Race (first to the top wins) or Last one hanging (no respawns: the last one still holding on wins).",
    ),
    minPlayers: 1,
    maxPlayers: 6,
    gel: "#ff9f43",
    icon: Grab,
    category: "online",
    minutes: 15,
    ready: true,
    stage: {
      screen: "/hang-on/",
      join: "/hang-on/pad/",
      note: t("游戏在大屏上，手机当手柄。没有电视，一部手机也能开", "The game plays there and phones are controllers. No TV? One phone can host."),
    },
    newUntil: "2026-12-11",
  },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

/**
 * On the board as coming soon, with no table game behind them yet: each is built in its own
 * folder and becomes a real entry in GAMES when it can be played. Tapping one shows what it is.
 */
export type SoonMeta = Pick<GameMeta, "name" | "blurb" | "how" | "gel" | "icon" | "category" | "minutes" | "minPlayers" | "maxPlayers"> & { key: string };

export const SOON: SoonMeta[] = [];

export const isGameId = (s: string): s is GameId => s in GAME_BY_ID;

/** Its card says 新 / New: playable, and still before its newUntil day. */
export const isNewGame = (g: GameMeta, now = new Date()) =>
  g.ready && !!g.newUntil && now.toISOString().slice(0, 10) < g.newUntil;
