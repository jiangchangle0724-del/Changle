// Every word on screen, in Chinese and English. A third entry is the English singular, used when
// {n} is 1. No em dashes or curly quotes in anything a player reads (tests/strings.test.ts checks).

import type { Lang } from "../room/protocol";

const S = {
  title: ["藏在人群里", "Hide in the Crowd"],
  tagline: ["走得像路人，出手要果断。", "Walk like a passer-by. Strike when you're sure."],
  // rules
  rulesTitle: ["玩法", "How to play"],
  rule1: ["每人用自己的手机控制人群里的一个人。人群里还有 18 个电脑带着走的路人。", "Everyone steers one person in the crowd from their own phone. The other 18 are passers-by the computer walks around."],
  rule2: ["走得像路人：跟着他们的节奏走走停停，别人就认不出你。按「融入」会放慢脚步、东张西望几秒，像个真路人。", "Walk like them: stop and go to their rhythm and nobody can tell it's you. Blend in slows you down and looks around for a few seconds, like a real passer-by."],
  rule3: ["认出对手就出拳：打中玩家得 1 分，他爬起来后会换进人群里另一个身体，接着藏。打到路人，你会愣一下，大家也都看见了。", "Spot a rival, then punch: hitting a player scores a point, and once they get up they slip into another body in the crowd. Hit a passer-by and you're stunned for a moment, in front of everyone."],
  rule4: ["先拿到 {n} 分的赢，或者 75 秒后分最多的赢。", "First to {n} tags wins, or the most tags after 75 seconds."],
  rulePenalty: ["每局结束，被认出来次数最多的人喝一口；谁都没被认出来，全桌一起喝。", "At the end of each round, whoever got spotted most takes a sip. If nobody got spotted, the whole table drinks."],
  rulePenaltyCustom: ["每局结束，被认出来次数最多的人受罚；谁都没被认出来，全桌一起受罚。", "At the end of each round, whoever got spotted most takes the penalty. If nobody got spotted, the whole table takes it."],
  ruleScreen: ["大屏放在电视或电脑上，看得到整个人群，但不会标出谁是真人。", "Put the big screen on a TV or a computer: it shows the whole crowd and never marks who's human."],
  ruleControls: ["电脑上：方向键或 WASD 走，空格出拳，Shift 融入。手柄：左摇杆走，A 出拳，X 融入。", "On a computer: arrow keys or WASD to walk, Space to punch, Shift to blend in. A gamepad: left stick to walk, A to punch, X to blend in."],
  // arenas
  arena: ["场地", "Arena"],
  plaza: ["温哥华海堤公园", "Vancouver Seawall Park"],
  metro: ["温哥华交通站厅", "Vancouver Transit Hall"],
  gallery: ["中式庭院戏台", "Courtyard Theatre"],
  plazaRule: ["海边的草地，没有机关，只看你藏得好不好。", "A lawn by the bay. No tricks, only the crowd."],
  metroRule: ["传送带每隔几秒换方向，人人都被带着走。", "The moving walkways switch direction every few seconds and carry everyone along."],
  galleryRule: ["戏台中间的聚光灯里走得更快，也更显眼。", "You move faster in the spotlight on the stage, and everyone can see you."],
  // lobby
  pickArena: ["选场地", "Pick an arena"],
  votes: ["{n} 票", "{n} votes", "{n} vote"],
  noVotes: ["没人选就轮着来", "No votes: each round takes the next one"],
  players: ["在场的人", "Players"],
  host: ["主人", "Host"],
  away: ["暂时离开", "Away"],
  nextRound: ["下一局加入", "Plays next round"],
  you: ["你", "You"],
  penalty: ["惩罚", "Penalty"],
  penaltyOn: ["每局被认出最多的人喝一口", "Each round, whoever's spotted most takes a sip"],
  penaltyOnCustom: ["每局被认出最多的人受罚：{text}", "Each round, whoever's spotted most takes the penalty: {text}"],
  penaltyOff: ["这桌不罚", "No penalties at this table"],
  penaltySwitch: ["每局结束的惩罚", "The penalty after each round"],
  bigScreen: ["大屏", "Big screen"],
  screensOn: ["{n} 块大屏在看", "{n} big screens watching", "{n} big screen watching"],
  screenHowTable: ["在电视或电脑上打开 {host}/tv，输入桌号 {table}。", "On a TV or a computer, open {host}/tv and enter table {table}."],
  screenHowRoom: ["在电视或电脑上打开这一页的大屏。", "Open this game's big screen on a TV or a computer."],
  openScreenHere: ["在这台设备上开大屏", "Make this device the big screen"],
  start: ["开始", "Start"],
  needMore: ["还差 {n} 人", "Need {n} more"],
  waitHost: ["等主人开始", "Waiting for the host to start"],
  table: ["桌号", "Table"],
  room: ["房间", "Room"],
  backToTable: ["回到这桌", "Back to the table"],
  endTitle: ["大家一起回到这桌？", "Take everyone back to the table?"],
  endBody: ["这个游戏会结束，每台手机和大屏都回到桌上。", "This ends the game: every phone and the big screen go back to the table."],
  endYes: ["一起回去", "Everyone back"],
  stay: ["留下", "Stay"],
  // playing
  seconds: ["{n} 秒", "{n}s"],
  secondsLeft: ["还剩 {n} 秒", "{n}s left"],
  firstTo: ["先到 {n} 分", "First to {n}"],
  punch: ["出拳", "Punch"],
  blend: ["融入", "Blend in"],
  wait: ["稍等", "Wait"],
  stick: ["移动", "Move"],
  hit: ["打中了！+1", "Got one! +1"],
  foul: ["打到路人了，愣一下", "That was a passer-by. Stunned!"],
  swing: ["没打中", "Missed"],
  spotted: ["你被认出来了！", "You've been spotted!"],
  hidden: ["换了个身体，找找你在哪", "New body. Find yourself!"],
  turn: ["横过来，画面更大", "Turn sideways for a bigger view"],
  watching: ["这一局你在看，下一局加入", "You're watching this round. You're in the next one."],
  marker: ["你", "You"],
  nobodyMarked: ["没有人被标出来：看谁走得不像路人", "Nobody is marked. Watch who doesn't walk like a passer-by."],
  score: ["得分", "Score"],
  // result
  roundOver: ["第 {n} 局结束", "Round {n} over"],
  wins: ["{name} 赢了！", "{name} wins!"],
  youWin: ["你赢了！", "You win!"],
  draw: ["平局", "It's a draw"],
  noScore: ["没人得分", "Nobody scored"],
  tags: ["打中", "Tags"],
  spottedCol: ["被认出", "Spotted"],
  again: ["再来一局", "Play again"],
  otherArena: ["换个场地", "Pick another arena"],
  waitNext: ["等主人开下一局", "Waiting for the host to start the next round"],
  // the penalty stamp
  drink: ["喝", "Drink"],
  sip: ["喝一口", "One sip"],
  everyone: ["全桌", "Everyone"],
  everyoneSip: ["全桌 · 喝一口", "Everyone · One sip"],
  spottedMost: ["被认出 {n} 次，最多", "Spotted {n} times, the most", "Spotted once, the most"],
  nobodySpotted: ["这局谁都没被认出来", "Nobody got spotted this round"],
  continue: ["继续", "Continue"],
  // the big screen
  scanToJoin: ["扫码上桌", "Scan to join the table"],
  orEnter: ["或在 {host} 输入桌号", "or enter the table code at {host}"],
  orRoom: ["或在 {host} 输入房间号", "or enter the room code at {host}"],
  joinPhones: ["每人用自己的手机加入", "Everyone joins on their own phone"],
  nextWhenReady: ["下一局等主人开", "Next round when the host is ready"],
  wentBack: ["主人带大家回到桌上了", "The host took everyone back to the table"],
  // menu and settings
  menu: ["更多", "More"],
  close: ["关闭", "Close"],
  back: ["返回", "Back"],
  language: ["English", "中文"],
  languageName: ["语言", "Language"],
  reduceMotion: ["减弱动效", "Reduce motion"],
  fullscreen: ["全屏", "Full screen"],
  exitFullscreen: ["退出全屏", "Exit full screen"],
  fullscreenHelp: ["这台 iPhone 不让网页全屏：在 Safari 里点分享，选「添加到主屏幕」，再从主屏幕打开。", "This iPhone doesn't let a page go full screen: in Safari, tap Share, choose Add to Home Screen, and open it from there."],
  credits: ["素材来源", "Credits"],
  on: ["开", "On"],
  off: ["关", "Off"],
  // connection
  connecting: ["正在连接…", "Connecting…"],
  reconnecting: ["正在重新连接…", "Reconnecting…"],
  noRoom: ["这个游戏已经散了。回到桌上再开一局吧。", "This game has ended. Open a new one from the table."],
  full: ["这个游戏满 8 人了。", "This game already has 8 players."],
  identity: ["这台设备进不了这个游戏，刷新一下再试。", "This device couldn't get into the game. Reload and try again."],
  ended: ["这个游戏结束了，正在回到桌上…", "This game is over. Going back to the table…"],
  // the computer's own start page (npm run dev, tests)
  standalone: ["本机试玩：开一个房间，别的窗口用房间号加入。", "Playing on this computer: open a room, then join it from another window with its code."],
  yourName: ["你的名字", "Your name"],
  create: ["开一个房间", "Open a room"],
  roomCode: ["4 位房间号", "4-digit room code"],
  join: ["加入", "Join"],
  emptyName: ["先写个名字", "Add a name first"],
  badCode: ["房间号是 4 位数字", "Room codes have 4 digits"],
  offline: ["连不上，网络好一点再试。", "Can't connect. Try again in a moment."],
  // practice
  practice: ["一个人练手", "Practise on your own"],
  practiceHint: ["你和三个电脑对手藏在人群里，谁先打中三次", "You and three computer rivals hide in the crowd: first to three tags"],
  practiceTitle: ["练手", "Practice"],
  practiceOver: ["练完了", "Practice over"],
  playOnline: ["和朋友玩要每人一部手机：在 changle.ca 开一桌。", "To play with friends, everyone uses their own phone: open a table on changle.ca."],
  computer: ["电脑 {n}", "Computer {n}"],
  // credits page
  creditsIntro: ["这个游戏里每张图、每个模型从哪里来，能不能用。没有声音文件。", "Where every picture and model in this game comes from, and why we may use it. There are no sound files."],
  creditsBackdrops: ["三个场地的背景", "The three arena backdrops"],
  creditsBackdropsBody: ["AI 画的：用 ChatGPT 的图像生成（OpenAI）画成的全景图，没有用照片，也没有用别的游戏的美术。我们缩小并压缩成了 WebP。OpenAI 的条款把生成的图交给使用者。", "AI-made: panoramas drawn with ChatGPT's image generation (OpenAI). No photos, and no art from other games. We shrank and compressed them to WebP. OpenAI's terms give the images to the person who made them."],
  creditsPeople: ["人群里的三种人", "The three kinds of people in the crowd"],
  creditsPeopleBody: ["AI 画的：同样用 ChatGPT 的图像生成（OpenAI）画的三个人物，每人四个方向、四个动作，拼成一张图。我们压缩成了 WebP。", "AI-made: three characters drawn with the same image generation (OpenAI), each in four directions and four poses, packed into one sheet. We compressed it to WebP."],
  creditsSets: ["场地里的立体布景", "The 3D set dressing"],
  creditsSetsBody: ["用 Blender 脚本从零搭出来的（游戏代码里的 tools/blender），没有导入别人的模型或贴图。", "Built from scratch by a Blender script (tools/blender in the game's code). No outside models or textures."],
  creditsFonts: ["字体", "Fonts"],
  creditsFontsBody: ["Unbounded 和 Figtree，SIL Open Font License 1.1。中文用手机自己的字体。", "Unbounded and Figtree, under the SIL Open Font License 1.1. Chinese uses the phone's own font."],
  creditsCode: ["程序库", "Code libraries"],
  creditsCodeBody: ["Preact、three.js、qrcode-generator，都是 MIT 许可。全文在 licences.txt。", "Preact, three.js and qrcode-generator, all under the MIT licence. The full texts are in licences.txt."],
  licences: ["许可全文", "Licence texts"],
  // the frame meter (?fps=1 on a room's address), for measuring a real phone
  fpsStats: ["FPS {fps} · 均 {avg}ms · P95 {p95}ms · 峰 {slow}ms · {quality} {dpr}×", "FPS {fps} · avg {avg}ms · P95 {p95}ms · max {slow}ms · {quality} {dpr}×"],
  qualityHigh: ["高", "High"],
  qualityBalanced: ["中", "Balanced"],
  qualityEfficient: ["省", "Efficient"]
} as const satisfies Record<string, readonly [string, string] | readonly [string, string, string]>;

export type Key = keyof typeof S;
export const STRINGS: Record<string, readonly string[]> = S;

let lang: Lang = "zh";
export const currentLang = () => lang;

export function setLang(value: Lang): void {
  lang = value;
  if (typeof document !== "undefined") {
    document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
    document.title = value === "zh" ? `${S.title[0]} · ${S.title[1]}` : `${S.title[1]} · ${S.title[0]}`;
  }
}

export function t(key: Key, vars: Record<string, string | number> = {}, as: Lang = lang): string {
  const entry = S[key] as readonly string[];
  const value = as === "en" && vars.n === 1 && entry.length > 2 ? entry[2] : entry[as === "zh" ? 0 : 1];
  return value.replace(/\{(\w+)\}/g, (_match, name: string) => (name in vars ? String(vars[name]) : "{" + name + "}"));
}

/** The other language's word, for the small second line of a bilingual title. */
export const other = (key: Key, vars: Record<string, string | number> = {}) => t(key, vars, lang === "zh" ? "en" : "zh");
