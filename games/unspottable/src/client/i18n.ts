export type Lang = "zh" | "en";

const S = {
  title: ["藏在人群里", "Unspottable"],
  tagline: ["走得像路人，出手要果断。", "Walk like a passer-by. Strike with intent."],
  subtitle: ["手机操控，电视看全场。", "Play on phones. See the whole arena on a TV."],
  rotateTip: ["横过手机，获得完整对战视野。", "Rotate your phone for a wider arena."],
  name: ["你的名字", "Your name"],
  create: ["创建房间", "Create room"],
  join: ["加入房间", "Join room"],
  code: ["4 位房间码", "4-digit room code"],
  go: ["进入", "Go"],
  room: ["房间", "Room"],
  copyLink: ["复制电视链接", "Copy TV link"],
  copied: ["已复制", "Copied"],
  tvMode: ["电视视图", "TV view"],
  tvHint: ["在备用手机打开电视视图，再用 AirPlay 镜像到电视。", "Open the TV view on a spare phone, then mirror it to your TV."],
  openTv: ["打开电视视图", "Open TV view"],
  playerCount: ["{n} 位玩家", "{n} players"],
  host: ["房主", "Host"],
  waiting: ["等朋友加入…", "Waiting for friends to join…"],
  needTwo: ["至少需要 2 位玩家才能开局。", "At least 2 players are needed to start."],
  start: ["开始游戏", "Start game"],
  lobby: ["准备开局", "Ready room"],
  arena: ["竞技场", "Arena"],
  plaza: ["温哥华海堤公园", "Vancouver Seawall Park"],
  metro: ["温哥华交通站厅", "Vancouver Transit Hall"],
  gallery: ["中式庭院戏台", "Chinese Courtyard Theatre"],
  plazaRule: ["温哥华海堤草地与海湾步道：观察路人，认出真人再出拳。", "A Vancouver seawall lawn beside the bay: read the crowd, spot a player, then strike."],
  metroRule: ["温哥华风格的玻璃站厅里，移动步道每隔数秒换向。", "In a glassy Vancouver transit hall, walkways reverse every few seconds."],
  galleryRule: ["穿过中式庭院戏台中央的聚光灯区域会加速。", "Cross the spotlight on a Chinese courtyard stage to get a speed boost."],
  chooseArena: ["投票选场地", "Vote for an arena"],
  voteCount: ["{n} 票", "{n} votes"],
  round: ["第 {n} 局", "Round {n}"],
  timeLeft: ["剩 {n} 秒", "{n}s left"],
  targetScore: ["先拿到 {n} 分", "First to {n} tags"],
  controls: ["摇杆 / WASD 移动 · Space / A 出拳 · Shift / X 融入", "Stick / WASD to move · Space / A to punch · Shift / X to blend in"],
  fpsStats: ["帧率 {fps} · 平均 {avg} ms · 最慢 {slow} ms", "FPS {fps} · avg {avg} ms · slow {slow} ms"],
  stick: ["移动摇杆", "Move stick"],
  punch: ["出拳", "Punch"],
  blend: ["融入", "Blend"],
  blendReady: ["模仿路人", "Blend in"],
  cooldown: ["冷却中", "Cooling down"],
  score: ["分数", "Score"],
  out: ["暂时被击中", "Tagged"],
  hit: ["击中对手", "Rival tagged"],
  foul: ["打到路人，停一下", "You hit a passer-by and lost your rhythm"],
  swing: ["挥空了", "Missed"],
  winner: ["{name} 获胜！", "{name} wins!"],
  draw: ["平局！", "It's a draw!"],
  gameOver: ["本局结束", "Round over"],
  again: ["再玩一局", "Play again"],
  leave: ["离开房间", "Leave room"],
  reconnecting: ["连接断开，正在重连…", "Connection lost. Reconnecting…"],
  connecting: ["正在连接…", "Connecting…"],
  offline: ["暂时连不上房间。", "Can't reach this room right now."],
  noRoom: ["找不到这个房间码。", "That room code was not found."],
  full: ["房间已满。", "This room is full."],
  identity: ["设备身份无效，请刷新后重试。", "This device identity is invalid. Reload and try again."],
  screenJoined: ["电视已连接", "TV connected"],
  screenOnly: ["这个页面是电视视图，请用手机加入玩家房间。", "This is the TV view. Join as a player from your phone."],
  player: ["玩家", "Player"],
  passerby: ["路人", "Passer-by"],
  languageSwitch: ["English", "中文"],
  settings: ["设置", "Settings"],
  language: ["语言", "Language"],
  theme: ["主题", "Theme"],
  light: ["浅色", "Light"],
  dark: ["深色", "Dark"],
  reduceMotion: ["减少动画", "Reduce motion"],
  on: ["开", "On"],
  off: ["关", "Off"],
  help: ["玩法", "How to play"],
  helpText: ["在人群里找出真人，抢先给对手贴上标签。模仿路人的节奏能藏住身份；打错路人会让你短暂停顿。", "Spot the real players in the crowd and tag rivals first. Blend into a passer-by's rhythm to hide; hitting a passer-by briefly stuns you."],
  roomCodeLabel: ["房间码", "Room code"],
  noPlayers: ["还没有玩家", "No players yet"],
  online: ["在线", "online"],
  offlinePlayer: ["离线", "offline"],
  by: ["由 {name} 创建", "Hosted by {name}"],
  copiedError: ["复制失败，请手动抄下房间码。", "Copy failed. Please copy the room code manually."],
  titleMark: ["开席", "Lazy Susan"],
  emptyName: ["先写个名字", "Add a name first"],
  invalidCode: ["房间码是 4 位数字", "Room codes have 4 digits"],
  joinPlayer: ["用这台手机操控", "Play from this phone"],
  screenNote: ["屏幕只显示人群、动作和比分，不会标出谁是真玩家。", "The screen shows the crowd, motion and scores without revealing who is human."]
} as const satisfies Record<string, readonly [string, string]>;

export type Key = keyof typeof S;
let lang: Lang = "zh";

export function setLang(value: Lang): void {
  lang = value;
  document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
  document.title = t("title");
  try {
    localStorage.setItem("unspottable.lang", value);
  } catch {
    // Private browsing may disable local storage.
  }
}

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem("unspottable.lang");
    if (saved === "zh" || saved === "en") lang = saved;
    else lang = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    lang = "zh";
  }
  return lang;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const value = S[key][lang === "zh" ? 0 : 1];
  return value.replace(/\{(\w+)\}/g, (_match, name: string) => (name in vars ? String(vars[name]) : "{" + name + "}"));
}
