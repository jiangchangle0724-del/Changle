// Every word a person reads, in Chinese and in English. The language follows changle.ca's (its
// Tools card hands it over in `when.lang`), then the phone's own, and the switch at the top right
// changes it at any time.
import type { Lang } from "../engine/types";

const STRINGS = {
  brand: { zh: "约时间", en: "When Works" },
  backToTools: { zh: "工具", en: "Tools" },
  switchLang: { zh: "English", en: "中文" },

  // ---------- home ----------
  homeLine: { zh: "哪天大家都有空？各点各的，一眼看出来。", en: "When is everyone free? Each taps their own times, and it shows." },
  newTitle: { zh: "约一次", en: "Plan one" },
  titleLabel: { zh: "聚会叫什么", en: "What's it called" },
  titlePlaceholder: { zh: "周末火锅", en: "Hot pot this weekend" },
  daysLabel: { zh: "哪几天可以考虑", en: "Which days are possible" },
  daysHint: { zh: "亮着的是候选的日子。点一下去掉，再点加回来。", en: "Lit days are in. Tap one to drop it, tap again to bring it back." },
  daysCount: { zh: "选了 {n} 天", en: "{n} days picked" },
  moreDays: { zh: "再往后两周", en: "Two more weeks" },
  grainLabel: { zh: "怎么问", en: "Ask by" },
  grainHalf: { zh: "按半天", en: "Half days" },
  grainHalfSub: { zh: "上午、下午、晚上", en: "morning, afternoon, evening" },
  grainDay: { zh: "按天", en: "Whole days" },
  grainDaySub: { zh: "哪天有空就行", en: "any time that day" },
  make: { zh: "生成链接", en: "Make the link" },
  making: { zh: "正在生成", en: "Making it" },
  needTitle: { zh: "先给聚会起个名字", en: "Give it a name first" },
  needDays: { zh: "至少留一天", en: "Keep at least one day" },
  tooManyDays: { zh: "最多选 31 天", en: "31 days at most" },
  makeFailed: { zh: "没建成，再试一次", en: "That didn't work. Try again." },
  makeLimit: { zh: "今天建得太多了，明天再来", en: "Too many made today. Try again tomorrow." },
  recentTitle: { zh: "这部手机上的聚会", en: "On this phone" },
  recentMine: { zh: "我发起的", en: "mine" },
  footNote: { zh: "不用登录。每个聚会建好 60 天后自动删除。", en: "No sign-in. Each gathering is deleted 60 days after it's made." },

  // ---------- a gathering ----------
  loading: { zh: "正在打开", en: "Opening" },
  goneTitle: { zh: "找不到这个聚会", en: "Can't find this gathering" },
  goneBody: { zh: "链接可能不全，或者它建好已经过了 60 天，被删掉了。", en: "The link may be incomplete, or its 60 days are up and it has been deleted." },
  goneAction: { zh: "约一次新的", en: "Plan a new one" },
  answeredNone: { zh: "还没有人填", en: "Nobody has answered yet" },
  answered: { zh: "{n} 个人填了", en: "{n} answered" },
  rangeTo: { zh: "{from} 到 {to}", en: "{from} to {to}" },
  deletedOn: { zh: "{day} 自动删除", en: "Deleted on {day}" },

  nameLabel: { zh: "你的名字", en: "Your name" },
  namePlaceholder: { zh: "大家认得出的名字", en: "A name they'll know" },
  nameStart: { zh: "开始填", en: "Start" },
  nameSave: { zh: "好了", en: "Done" },
  nameNeeded: { zh: "先写名字，再点时间", en: "Your name first, then the times" },
  youAre: { zh: "你是", en: "You're" },
  rename: { zh: "改名", en: "Rename" },
  full: { zh: "人满了，最多 40 个人", en: "It's full: 40 people at most" },

  modeFill: { zh: "我来填", en: "My times" },
  modeAll: { zh: "看大家", en: "Everyone" },
  fillHint: { zh: "点一下是有空，再点一下是「可以调」，第三下取消。", en: "Tap once for free, again for \"could move things\", a third time to clear." },
  fillHintRows: { zh: "点一下是有空，再点一下是「可以调」，第三下取消。点星期几，选上一整天。", en: "Tap once for free, again for \"could move things\", a third time to clear. Tap a day's name for the whole day." },
  quickLabel: { zh: "一键快填", en: "Quick fill" },
  quickAll: { zh: "全都行", en: "All free" },
  quickWeekends: { zh: "周末都行", en: "Weekends" },
  quickEvenings: { zh: "晚上都行", en: "Evenings" },
  quickDay: { zh: "{day}：整天都行", en: "{day}: free all day" },
  quickFilled: { zh: "选上了。没空的点一下就去掉。", en: "Filled in. Tap any you can't make to clear it." },
  quickCleared: { zh: "去掉了。", en: "Cleared." },
  clearAll: { zh: "清空", en: "Clear all" },
  undo: { zh: "撤销", en: "Undo" },
  allHint: { zh: "数字是有空的人数，+ 后面是可以调的。点一格看是谁。", en: "The number is how many are free, and + how many could move things. Tap a slot to see who." },
  legendFree: { zh: "有空", en: "Free" },
  legendMaybe: { zh: "可以调", en: "Could move things" },
  legendNo: { zh: "没空", en: "Not free" },
  cellMine: { zh: "我", en: "me" },
  saving: { zh: "正在保存", en: "Saving" },
  saved: { zh: "存好了", en: "Saved" },
  saveFailed: { zh: "没存上，会自动再试", en: "Not saved yet. Trying again." },
  offline: { zh: "连不上，正在重连", en: "Offline. Reconnecting." },

  bestTitle: { zh: "最佳前三", en: "Best three" },
  bestEmpty: { zh: "有人填了就排得出来。", en: "It fills in as people answer." },
  bestWaitMust: { zh: "必到的人能来的时段，现在还没有。", en: "No slot yet that everyone who must be there can make." },
  bestFew: { zh: "还没有哪个时段凑够 {n} 个人。", en: "No slot has {n} people yet." },
  pick: { zh: "就这个", en: "This one" },
  settledTitle: { zh: "定了", en: "It's set" },
  reopen: { zh: "重新选", en: "Choose again" },

  // ---------- the pictures to pass around ----------
  picInvite: { zh: "邀请图", en: "Invitation" },
  picResult: { zh: "结果图", en: "Result picture" },
  picAsk: { zh: "你什么时候有空？", en: "When are you free?" },
  picScanInvite: { zh: "长按识别二维码，点你有空的时间", en: "Scan the code and tap the times you're free" },
  picSet: { zh: "时间定了", en: "The time is set" },
  picScanResult: { zh: "长按识别二维码，看详情、加到日历", en: "Scan the code for the details and your calendar" },
  picHint: { zh: "长按图片，保存或者发给朋友。", en: "Press and hold the picture to save it or send it on." },
  picShare: { zh: "发给朋友", en: "Share" },
  picSave: { zh: "保存图片", en: "Save the picture" },
  picDrawing: { zh: "正在画", en: "Drawing it" },
  picFailed: { zh: "没画出来。", en: "That didn't draw." },
  picRetry: { zh: "再画一次", en: "Try again" },
  picAltInvite: { zh: "邀请图：{title}，{days}，带二维码", en: "Invitation: {title}, {days}, with a QR code" },
  picAltResult: { zh: "结果图：{title}，{when}，{who}，带二维码", en: "Result: {title}, {when}, {who}, with a QR code" },

  // ---------- once the time is set ----------
  calAdd: { zh: "加到日历", en: "Add to calendar" },
  calGoogle: { zh: "用 Google 日历", en: "Use Google Calendar" },
  calFile: { zh: "下载日历文件", en: "Get a calendar file" },
  calWeChat: { zh: "微信里加不了日历。点右上角 ···，选「在浏览器打开」，再点一次。", en: "Calendars don't open inside WeChat. Tap ···, choose Open in browser, then tap this again." },
  afterTitle: { zh: "接着定什么？", en: "What's next?" },
  afterTell: { zh: "把结果发回群里", en: "Tell the group" },
  copyZh: { zh: "复制中文", en: "Copy in Chinese" },
  copyEn: { zh: "复制英文", en: "Copy in English" },
  afterEat: { zh: "吃什么", en: "Where to eat" },
  eatGo: { zh: "去随便开一桌", en: "Open a table in Whatever's Fine" },
  eatPick: { zh: "到了随便，「什么时候吃」选 {when} {time}。", en: "Once there, set When to {time} on {when}." },
  eatWeChat: { zh: "微信里不能用 Google 登录。到了随便，点右上角 ··· → 在浏览器打开，或者复制下面的链接。", en: "Google sign-in doesn't work inside WeChat. Once there, tap ··· → Open in browser, or copy the link below." },
  eatCopy: { zh: "复制随便的链接", en: "Copy that link" },
  eatLater: { zh: "那周再来选", en: "Come back that week" },
  eatLaterNote: { zh: "随便只排一周以内的饭，{day} 起可以选。", en: "Whatever's Fine plans meals up to a week ahead. It opens for this one on {day}." },
  eatWait: { zh: "等发起人去随便开一桌。开好了，链接会发到群里，大家进去投票。", en: "The host opens a table in Whatever's Fine and sends its link to the group. Everyone votes there." },
  afterPlay: { zh: "玩什么", en: "What to play" },
  playGo: { zh: "去开席挑个游戏", en: "Pick a game on Lazy Susan" },
  playNote: { zh: "在家玩的话，开席里有一桌人玩的聚会游戏。", en: "Staying in? Lazy Susan has party games for a table of friends." },

  slotFree: { zh: "有空", en: "Free" },
  slotMaybe: { zh: "可以调", en: "Could move things" },
  slotNo: { zh: "没空，或者还没填", en: "Not free, or no answer yet" },
  slotNobody: { zh: "没有", en: "Nobody" },
  outMust: { zh: "必到的人里有人来不了，所以不进前三。", en: "Someone who must be there can't make it, so it isn't one of the best." },
  outFew: { zh: "不到 {n} 个人，所以不进前三。", en: "Fewer than {n} people, so it isn't one of the best." },

  peopleTitle: { zh: "都有谁", en: "Who's in" },
  must: { zh: "必到", en: "must be there" },
  you: { zh: "你", en: "you" },
  slotsPicked: { zh: "{n} 格", en: "{n} slots" },
  markMust: { zh: "这个人必须到", en: "Must be there" },
  unmarkMust: { zh: "不是必须到", en: "Not a must" },
  mustNote: { zh: "标了必到，最佳前三只排这个人来得了的时段。", en: "With this on, the best three only has slots this person can make." },
  remove: { zh: "删掉这一行", en: "Remove this row" },
  removeAsk: { zh: "确定删掉 {name} 填的吗？", en: "Remove what {name} filled in?" },
  removeYes: { zh: "删掉", en: "Remove" },
  cancel: { zh: "取消", en: "Cancel" },
  close: { zh: "关上", en: "Close" },

  hostTitle: { zh: "发起人", en: "Host" },
  hostNote: { zh: "这部手机能管理这个聚会。点名字可以标必到，或者删掉重复的一行。", en: "This phone manages the gathering. Tap a name to mark it as a must, or to remove a duplicate row." },
  minPeople: { zh: "至少几个人成局", en: "Least number of people" },
  fewer: { zh: "少一个", en: "One fewer" },
  more: { zh: "多一个", en: "One more" },
  iAmHost: { zh: "我是发起人", en: "I'm the host" },
  claimTitle: { zh: "输入管理码", en: "Enter the admin code" },
  claimHint: { zh: "建聚会的时候显示过的 6 位数字。", en: "The six digits shown when the gathering was made." },
  claimDo: { zh: "确认", en: "Confirm" },
  claimWrong: { zh: "管理码不对", en: "That's not the code" },
  claimLocked: { zh: "错了太多次，一小时以后再试", en: "Too many wrong tries. Try again in an hour." },
  claimLimit: { zh: "今天试得太多了，明天再试", en: "Too many tries today. Try again tomorrow." },
  claimOk: { zh: "这部手机现在是发起人了", en: "This phone is now a host" },

  share: { zh: "分享", en: "Share" },
  copyLink: { zh: "复制链接", en: "Copy link" },
  copied: { zh: "复制好了", en: "Copied" },
  copyByHand: { zh: "按住下面这行，全选再复制", en: "Press and hold the line below, select all, then copy" },
  qr: { zh: "二维码", en: "QR code" },
  qrNote: { zh: "让旁边的人用相机或微信扫一扫。", en: "Someone next to you can scan it with their camera or WeChat." },

  createdTitle: { zh: "建好了", en: "It's ready" },
  createdLine: { zh: "把链接发到群里，大家点开就能填。", en: "Send the link to the group. Everyone opens it and fills in." },
  adminLabel: { zh: "管理码", en: "Admin code" },
  adminNote: { zh: "只显示这一次。换手机管理这个聚会时要用，建议现在就发到微信的「文件传输助手」存着。", en: "Shown this once. You need it to manage this gathering from another phone, so send it to yourself now." },
  copyAdmin: { zh: "复制管理码", en: "Copy the code" },
  goFill: { zh: "去填我的时间", en: "Fill in my times" },
  failed: { zh: "没成，再试一次", en: "That didn't work. Try again." },
} as const;

export type Key = keyof typeof STRINGS;

const stored = (): Lang | null => {
  try {
    const value = localStorage.getItem("when.lang");
    return value === "zh" || value === "en" ? value : null;
  } catch {
    return null;
  }
};

let lang: Lang = stored() ?? (/^zh\b/i.test(navigator.language || "zh") ? "zh" : "en");
const listeners = new Set<() => void>();

export const getLang = (): Lang => lang;
export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem("when.lang", next);
  } catch {
    // private mode: it lasts as long as the page
  }
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  for (const listener of listeners) listener();
}
export const onLang = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** A line in the reader's language, with {placeholders} filled in. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return STRINGS[key][lang].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
