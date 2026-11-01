import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, Club, Crown, Dices, Disc3, Drama, Hand, Luggage, MessageSquareQuote, Music, PenLine, ShipWheel, Snowflake, Spade, StickyNote, Trophy, VenetianMask, Wine } from "lucide-react";
import type { T } from "../i18n";

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
  | "tune"
  | "punchline"
  | "draw"
  | "trip"
  | "dj";

export type GameMeta = {
  id: GameId;
  name: T;
  blurb: T;
  /** two or three lines for the game card */
  how: T;
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
  isNew?: boolean;
  /** one-phone play needs a different number of names, or works differently */
  solo?: { min: number; hint: T };
};

const t = (zh: string, en: string): T => ({ zh, en });

/** In spectrum order: the grid reads as one sweep of stage light. */
export const GAMES: GameMeta[] = [
  {
    id: "truth",
    name: t("真心话大冒险", "Truth or Dare"),
    blurb: t("转瓶子，指到谁谁选", "Spin the bottle. It points, you choose."),
    how: t("瓶子停在谁面前，谁就选真心话或大冒险。不想答也不想做，就认罚。", "Whoever the bottle stops at picks truth or dare. Won't do either? Take the penalty."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#ff5fa2",
    icon: Wine,
    ready: true,
  },

  {
    id: "rogue",
    name: t("流氓十三张", "Rogue Thirteen"),
    blurb: t("抽一张牌，牌面说了算", "Draw a card. The card is the law."),
    how: t("轮流抽牌，A 到 K 每张都有一条规矩：指定喝、陪酒、厕所券、摸鼻子……", "Take turns drawing. Ace to King, every card carries a rule: make someone drink, a drinking buddy, a bathroom pass, touch your nose…"),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#ff6b5e",
    icon: Club,
    ready: true,
  },
  {
    id: "trip",
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
    ready: true,
    isNew: true,
    solo: { min: 1, hint: t("一台手机轮流玩，可以加电脑队", "Pass one phone round, with computer teams if you like") },
  },
  {
    id: "superlatives",
    name: t("最佳称号", "Superlatives"),
    blurb: t("谁最可能……投票颁奖", "Who's most likely to… Vote, then hand out awards."),
    how: t("每轮一个称号，大家投票选人，票最多的拿奖也喝。最后有颁奖典礼。", "One title a round. Everyone votes for a person; the winner takes the award and the drink. Awards ceremony at the end."),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#ff8c42",
    icon: Trophy,
    ready: true,
    isNew: true,
    solo: { min: 3, hint: t("传手机偷偷投票，或者一起指", "Pass it round for secret votes, or point together") },
  },
  {
    id: "king",
    name: t("国王游戏", "King's Game"),
    blurb: t("抽签，国王说了算", "Draw a stick. The king decides."),
    how: t("每人抽一支签，抽到王冠的是国王。国王点号码下命令，被点到的号码必须照做。", "Everyone draws a stick. The crown is the king, who calls out numbers and gives orders. Numbers must obey."),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#ffb82e",
    icon: Crown,
    ready: true,
  },
  {
    id: "drama",
    name: t("戏精大赏", "Drama Queens"),
    blurb: t("演一出狗血剧，揪出谁是小三", "Act out a soap opera. Find the culprit."),
    how: t(
      "每轮几个人上台演一段狗血剧情，其中一个人偷偷是小三或凶手。观众猜是谁，再给每个人的演技打星。被识破的、演得最差的受罚。",
      "Each round a few players act out a soap-opera scene, and one of them is secretly the culprit. The audience guesses who, then gives every actor stars. Get caught, or act worst, and you pay.",
    ),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#ffcf6b",
    icon: Drama,
    ready: true,
    isNew: true,
    solo: { min: 3, hint: t("手机传着看身份牌，演完再传着投票", "Pass it round to read the cards, then again to vote") },
  },
  {
    id: "postit",
    name: t("额头便利贴", "Post-it Note"),
    blurb: t("贴在额头上，猜我是谁", "Stuck to your forehead. Who am I?"),
    how: t("每个人额头上一张便利贴，别人都看得到，只有你看不到。轮流问是非题，猜错喝一口，最后一个猜出来的喝一杯。一部手机就举到额头上，大家给提示。", "A note on every forehead that everyone sees except you. Take turns asking yes or no questions; a wrong guess is a sip, the last to get it drinks a glass. On one phone, hold it to your forehead while the room gives clues."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#f5df3b",
    icon: StickyNote,
    ready: true,
    isNew: true,
    solo: { min: 0, hint: t("举到额头上，大家给提示", "Hold it to your forehead, the room gives clues") },
  },
  {
    id: "limbo",
    name: t("林波舞", "Limbo"),
    blurb: t("音乐响起，横杆越来越低", "Music on, bar goes lower."),
    how: t("手机贴在胸口往后仰，它测你仰了多少度，过了这一杆横杆再降。没过的出局喝一口。也可以拉一根真杆子，手机放音乐记分。", "Hold the phone to your chest and lean back: it measures how far you go. Clear the bar and it drops again. Miss and you're out (drink). Or use a real bar, and the phone does the music and the score."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#b6e83a",
    icon: ArrowDownToLine,
    ready: true,
    isNew: true,
    solo: { min: 1, hint: t("手机测你后仰的角度，或者配真杆子", "The phone measures your lean, or use a real bar") },
  },
  {
    id: "prompts",
    name: t("我从来没有", "Never Have I Ever"),
    blurb: t("做过的喝，谁最有可能", "Done it? Drink. Plus Most Likely To."),
    how: t("念一句“我从来没有……”，做过的人喝。也可以换成“谁最有可能”，大家一起指人。", "Read “Never have I ever…”. Anyone who has, drinks. Switch to Most Likely To and everyone points at once."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#4be38f",
    icon: Hand,
    ready: true,
  },
  {
    id: "euchre",
    name: t("尤克牌", "Euchre"),
    blurb: t("四人两队，抢五墩", "Two teams of two. Win the tricks."),
    how: t("24 张牌，叫主、跟牌、抢墩，先到 10 分的队赢。人不够四个，电脑补位。", "24 cards. Call trump, follow suit, take tricks. First team to 10 wins. Short of four? Bots fill the seats."),
    minPlayers: 2,
    maxPlayers: 4,
    gel: "#22d3a6",
    icon: Spade,
    ready: true,
    isNew: true,
    solo: { min: 0, hint: t("你和三个电脑玩家", "You and three computer players") },
  },
  {
    id: "dice",
    name: t("七八九", "Seven Eight Nine"),
    blurb: t("两颗骰子，一个公杯", "Two dice, one shared glass."),
    how: t("掷出七往公杯里倒酒，八喝一半，九全喝，双一指定别人喝完。", "Roll a seven, top up the shared glass. Eight, drink half. Nine, drink it all. Snake eyes, pick someone to finish it."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#2ed3d9",
    icon: Dices,
    ready: true,
  },
  {
    id: "freeze",
    name: t("木头人蹦迪", "Freeze Dance"),
    blurb: t("音乐一停，全场定住", "When the music stops, freeze."),
    how: t("音乐响就跳，突然停下时所有人定住不动。动了的人喝。联机时每部手机同时停。", "Dance while it plays. When it cuts out, everyone freezes. Whoever moves, drinks. Online, every phone stops at the same moment."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#31b9ff",
    icon: Snowflake,
    ready: true,
    isNew: true,
    solo: { min: 2, hint: t("手机放音乐，一个人当裁判", "The phone plays the music, one person judges") },
  },
  {
    id: "wheel",
    name: t("命运转盘", "Wheel of Fate"),
    blurb: t("惩罚由转盘定", "The wheel sets the penalty."),
    how: t("转盘上写满惩罚，可以自己改。转到什么做什么。", "The wheel is loaded with penalties you can edit. Spin it, do what it lands on."),
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#5b9bff",
    icon: ShipWheel,
    ready: true,
  },
  {
    id: "undercover",
    name: t("谁是卧底", "Undercover"),
    blurb: t("一个词不一样，找出那个人", "One word is different. Find the one."),
    how: t("每人拿到一个词，卧底的词和大家不同。轮流描述，投票找出卧底。", "Everyone gets a word; the undercover's is slightly different. Describe yours in turn, then vote out the undercover."),
    minPlayers: 4,
    maxPlayers: 15,
    gel: "#8c86ff",
    icon: VenetianMask,
    ready: true,
  },
  {
    id: "tune",
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
    ready: true,
    isNew: true,
    solo: { min: 1, hint: t("手机放真歌或旋律，也能当抢答器", "The phone plays real songs or melodies, or becomes the buzzers") },
  },
  {
    id: "punchline",
    name: t("神回复", "Punchline"),
    blurb: t("写最好笑的答案，大家投票", "Write the funniest answer. Everyone votes."),
    how: t("每个题目两个人各写一个答案，其他人投票。票少的喝，全票通过有加分。", "Two players answer each prompt, everyone else votes. Fewer votes, you drink. A clean sweep scores a bonus."),
    minPlayers: 3,
    maxPlayers: 15,
    gel: "#e765f0",
    icon: MessageSquareQuote,
    ready: true,
    isNew: true,
    solo: { min: 3, hint: t("手机传一圈，偷偷写答案", "Pass it round and write in secret") },
  },
  {
    id: "draw",
    name: t("你画我猜", "Draw & Guess"),
    blurb: t("画出来，一分钟内猜", "Draw it, guess it in a minute."),
    how: t("轮到的人看词作画，其他人猜。一分钟没人猜中，画的人喝。", "The drawer sees a word and draws it; everyone else guesses. Nobody gets it in a minute? The drawer drinks."),
    minPlayers: 2,
    maxPlayers: 15,
    gel: "#ff9cc5",
    icon: PenLine,
    ready: true,
  },
  {
    id: "dj",
    name: t("打碟", "DJ Booth"),
    blurb: t("电视当音箱，AI 当 DJ，手机是旋钮", "The TV is the speaker, the AI is the DJ, your phone is a knob."),
    how: t(
      "电视或电脑打开 changle.ca/dj 当音箱，点「开始派对」放歌。大家扫码入座，手机按 🔥 给 DJ 加油，大屏上看得到谁在嗨。主人可以把整晚拖到暖场、推高、顶点、收尾。",
      "Open changle.ca/dj on a TV or computer: that's the speaker. Press Start the party and the music begins. Everyone scans in; press 🔥 on your phone to push the DJ, and the big screen shows who's into it. The host can move the night between warm-up, build, peak and wind-down.",
    ),
    minPlayers: 1,
    maxPlayers: 15,
    gel: "#ff5ad8",
    icon: Disc3,
    ready: false,
    hidden: true,
  },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

export const isGameId = (s: string): s is GameId => s in GAME_BY_ID;
