// Every word on screen, in Chinese and English. A third entry is the English singular, used when
// {n} is 1. No em dashes or curly quotes in anything a player reads (tests/strings.test.ts checks).

import type { Lang } from "../room/protocol";

const S = {
  title: ["藏在人群里", "Hide in the Crowd"],
  tagline: ["走得像路人，出手要果断。", "Walk like a passer-by. Strike when you're sure."],
  // rules
  rulesTitle: ["玩法", "How to play"],
  rule1: ["每人用自己的手机控制人群里的一个人。人群里还有 18 个电脑带着走的路人。", "Everyone steers one person in the crowd from their own phone. The other 18 are passers-by the computer walks around."],
  rule2: ["走得像路人：他们走走停停、东张西望，有时跟着别人走，偶尔小跑几步，旁边有人被打倒会停下来看。跟上他们的节奏，别人就认不出你。按「融入」会放慢脚步、东张西望几秒。", "Walk like them: they stop and go, look around, tag along behind someone, now and then break into a run, and stop to stare when someone near them is knocked down. Keep to their rhythm and nobody can tell it's you. Blend in slows you down and looks around for a few seconds."],
  rule3: ["认出对手就出拳：打中玩家得 1 分，他爬起来后会换进人群里另一个身体，接着藏。打到路人，路人会摔倒，你也会愣一下，大家都看见了。", "Spot a rival, then punch: hitting a player scores a point, and once they get up they slip into another body in the crowd. Hit a passer-by and they go down, you're stunned for a moment, and everyone sees it."],
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
  plazaRule: ["渡轮一鸣笛，路人都停下来看海。跟着停，往上轻推一下摇杆，你也在看海。", "When the ferry horn sounds, the passers-by stop and look out to sea. Stop with them: a light nudge up turns you to the sea too."],
  metroRule: ["传送带每隔几秒换方向，人人都被带着走。街头艺人一开唱，路人都原地跳舞：站着别动，你也会跟着跳。", "The moving walkways switch direction every few seconds and carry everyone along. When the busker strikes up, everyone dances on the spot: stand still and you dance too."],
  galleryRule: ["聚光灯里走得更快也更显眼。锣一响，路人都停下看戏台：跟着停，往上轻推一下。", "You move faster in the spotlight, and everyone can see you. When the gong sounds, the crowd stops to watch the stage: stop too, with a light nudge up."],
  momentHorn: ["渡轮鸣笛：路人都停下来看海", "Ferry horn: the crowd stops to look at the sea"],
  momentGong: ["锣响了：路人都停下看戏台", "The gong: the crowd stops to watch the stage"],
  momentDance: ["街头艺人开唱：大家原地跳舞", "The busker strikes up: everyone dances on the spot"],
  awards: ["这局的称号", "This round's titles"],
  awardEagleEye: ["火眼金睛", "Eagle Eye"],
  awardEagleEyeWhy: ["认出的人最多", "Spotted the most rivals"],
  awardGhost: ["隐身大师", "Ghost"],
  awardGhostWhy: ["一次都没被认出来", "Never spotted"],
  awardFriendlyFire: ["误伤专业户", "Friendly Fire"],
  awardFriendlyFireWhy: ["打路人打得最多", "Punched the most passers-by"],
  awardAirPunch: ["空气拳手", "Air Puncher"],
  awardAirPunchWhy: ["挥空最多", "Punched the most air"],
  awardPunchingBag: ["人肉沙包", "Punching Bag"],
  awardPunchingBagWhy: ["被认出最多次", "Spotted the most times"],
  sound: ["声音", "Sound"],
  soundHint: ["出拳、鸣笛、锣声、街头艺人和倒计时", "Punches, the horn, the gong, the busker and the countdown"],
  music: ["音乐", "Music"],
  musicHint: ["大屏和练习里每个场地的背景音乐", "Each place's background music, on the big screen and in practice"],
  tvSound: ["点一下开声音", "Click for sound"],
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
  endPractice: ["结束练手", "End practice"],
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
  tvStep1: ["走得像路人，别人就认不出你", "Walk like a passer-by and nobody can tell it's you"],
  tvStep2: ["认出对手就出拳；打到路人，你会愣一下", "Spot a rival and punch. Hit a passer-by and you're stunned"],
  tvStep3: ["先到 3 分的赢；被认出最多的喝一口", "First to 3 wins; whoever's spotted most takes a sip"],
  tvStep3Custom: ["先到 3 分的赢；被认出最多的受罚", "First to 3 wins; whoever's spotted most takes the penalty"],
  tvStep3Off: ["先到 3 分的赢，或者 75 秒后分最多的赢", "First to 3 wins, or the most tags after 75 seconds"],
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
  // held upright: the game is played sideways
  turnTitle: ["横过来玩", "Turn your phone sideways"],
  turnBody: ["这个游戏只能横着玩：画面更大，两只手各管一边。", "This game is played sideways: a bigger view, a thumb on each side."],
  turnLockApple: ["转不过来？从右上角往下滑打开控制中心，关掉竖排方向锁定。", "Won't turn? Swipe down from the top right for Control Center and turn off Portrait Orientation Lock."],
  turnLockOther: ["转不过来？在手机的快捷设置里打开自动旋转。", "Won't turn? Turn on auto-rotate in your phone's quick settings."],
  // an iPhone: the game without Safari's bars (hide the toolbar, or open it from the Home Screen)
  homeTitle: ["iPhone 上全屏玩", "Full screen on an iPhone"],
  homeWhy: ["iPhone 的 Safari 不让网页自己全屏，有两个办法。", "Safari on an iPhone won't let a page go full screen by itself. There are two ways round it."],
  homeQuickTitle: ["最快：隐藏 Safari 的工具栏", "Quickest: hide Safari's toolbar"],
  homeQuick: ["点地址栏左边的「页面菜单」（三条横线），选「隐藏工具栏」。旧版 iOS 是地址栏里的「aA」或「···」。想把栏叫回来，点一下屏幕边上那条小网址。", "Tap the page menu at the left of the address bar (three lines), then Hide Toolbar. On older iOS it's the aA or the ··· in the address bar. To bring the bars back, tap the little address at the edge of the screen."],
  homeFullTitle: ["完全全屏：加到主屏幕（只要一次）", "All the screen: add it to your Home Screen (once)"],
  homeSafari: ["先点右上角的 ···，选在 Safari 中打开。", "First tap ··· at the top right and open this page in Safari."],
  homeStep1: ["点 Safari 的「共享」：在地址栏旁边的 ··· 或菜单里（旧版 iOS 在底部工具栏）。", "Tap Share in Safari: it's in the ··· or the menu beside the address bar (on older iOS, in the bottom toolbar)."],
  homeStep2: ["往下滑，点「添加到主屏幕」。", "Scroll down and tap Add to Home Screen."],
  homeStep3: ["打开「作为网页 App 打开」，再点「添加」。", "Turn on Open as Web App, then tap Add."],
  homeStep4: ["以后点主屏幕上的「开席」图标进来：没有 Safari 的栏，整个屏幕都是游戏。", "From now on, open the changle.ca icon on your Home Screen: no Safari bars, the whole screen is the game."],
  homeShow: ["怎么做", "Show me"],
  homeTip: ["iPhone 想全屏玩：隐藏 Safari 的工具栏，或者把 changle.ca 加到主屏幕", "Full screen on an iPhone: hide Safari's toolbar, or add changle.ca to your Home Screen"],
  // in a round, while Safari's bars take part of the screen
  barsHintA: ["全屏玩：点地址栏左边的", "Full screen: tap"],
  barsHintB: ["，选「隐藏工具栏」", "at the left of the address bar, then Hide Toolbar"],
  barsMore: ["更多办法", "More ways"],
  homeGotIt: ["知道了", "Got it"],
  // (the guide's little iPhone, labelled as iOS labels it)
  homeShare: ["共享", "Share"],
  homeAdd: ["添加到主屏幕", "Add to Home Screen"],
  homeWebApp: ["作为网页 App 打开", "Open as Web App"],
  homeAddButton: ["添加", "Add"],
  homeCopy: ["拷贝", "Copy"],
  homeBookmark: ["添加书签", "Add Bookmark"],
  homeIcon: ["开席", "changle"],
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
  creditsBackdrops: ["大厅里三个场地的小图", "The lobby's pictures of the three arenas"],
  creditsBackdropsBody: ["AI 画的：从用 ChatGPT 的图像生成（OpenAI）画的三张场地全景图上截下来的，没有用照片，也没有用别的游戏的美术。我们缩小并压缩成了 WebP。OpenAI 的条款把生成的图交给使用者。", "AI-made: cropped from panoramas drawn with ChatGPT's image generation (OpenAI). No photos, and no art from other games. We shrank and compressed them to WebP. OpenAI's terms give the images to the person who made them."],
  creditsPeople: ["人群里的人", "The people in the crowd"],
  creditsPeopleBody: ["两个人体模型和他们的动作来自 Quaternius 的 Universal Animation Library 1 和 2（CC0，公共领域）。我们用 Blender 脚本精简、剪辑，给六种打扮上了颜色；头发、帽子、包和眼睛是脚本自己做的（游戏代码里的 tools/blender）。", "The two bodies and their moves are from Quaternius's Universal Animation Library 1 and 2 (CC0, public domain). A Blender script slims and trims them and paints on six outfits; the hair, caps, bags and eyes are made by the script itself (tools/blender in the game's code)."],
  creditsSets: ["场地里的立体布景", "The 3D set dressing"],
  creditsSetsBody: ["用 Blender 脚本从零搭出来的（游戏代码里的 tools/blender），没有导入别人的模型或贴图。地面、传送带、聚光灯和海是游戏代码自己画的。", "Built from scratch by a Blender script (tools/blender in the game's code), with no outside models or textures. The floors, the walkways, the spotlight and the sea are drawn by the game's own code."],
  creditsFonts: ["字体", "Fonts"],
  creditsFontsBody: ["Unbounded 和 Figtree，SIL Open Font License 1.1。中文用手机自己的字体。", "Unbounded and Figtree, under the SIL Open Font License 1.1. Chinese uses the phone's own font."],
  creditsCode: ["程序库", "Code libraries"],
  creditsCodeBody: ["Preact、three.js、qrcode-generator，都是 MIT 许可。全文在 licences.txt。", "Preact, three.js and qrcode-generator, all under the MIT licence. The full texts are in licences.txt."],
  licences: ["许可全文", "Licence texts"],
  // the frame meter (?fps=1 on a room's address), for measuring a real phone
  fpsStats: ["FPS {fps} · 均 {avg}ms · P95 {p95}ms · 峰 {slow}ms · {quality} {dpr}× · 绘制 {draws} · 脚本 {js}ms", "FPS {fps} · avg {avg}ms · P95 {p95}ms · max {slow}ms · {quality} {dpr}× · draws {draws} · js {js}ms"],
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
