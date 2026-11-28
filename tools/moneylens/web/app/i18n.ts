// Every word a person reads, in Chinese and in English. The language is the one this browser was
// last switched to here, or else the browser's own; the switch at the top right changes it at any
// time. Nothing here is about anyone: the wording of what the app holds follows VAULT-6 (what may
// be said about the encryption, and what may not).
export type Lang = "zh" | "en";

const STRINGS = {
  brand: { zh: "心里有数", en: "MoneyLens" },
  backToTools: { zh: "工具", en: "Tools" },
  switchLang: { zh: "English", en: "中文" },
  retry: { zh: "再试一次", en: "Try again" },
  working: { zh: "稍等", en: "One moment" },
  licences: { zh: "字体和代码的许可", en: "Font and code licences" },

  // ---------- starting, and trouble ----------
  starting: { zh: "正在打开", en: "Opening" },
  slow: { zh: "网有点慢，马上就好", en: "Slow connection, nearly there" },
  offlineTitle: { zh: "没连上", en: "Couldn't connect" },
  offlineBody: { zh: "检查一下网络，再试一次。", en: "Check your connection, then try again." },
  serverTitle: { zh: "服务器没答上来", en: "The server didn't answer properly" },
  serverBody: { zh: "不是你的问题。过一会儿再试一次。", en: "Nothing you did. Try again in a little while." },
  busyTitle: { zh: "请求太多了", en: "Too many requests" },

  // ---------- signed out ----------
  outTitle: { zh: "把账单变成一本看得懂的账", en: "Bank statements, turned into a ledger you can read" },
  outLead: { zh: "账单在你自己的设备上读。存下来的账是加密的，钥匙只在你的设备上，网站的经营者读不了你存的交易。", en: "Statements are read on your own device. What is stored is encrypted with a key that stays on your devices; the operator cannot read your stored transactions." },
  signIn: { zh: "用 changle.ca 账号登录", en: "Sign in with your changle.ca account" },
  outBeta: { zh: "还在内测，只有受邀的账号进得来。", en: "In a closed test: invited accounts only." },
  outNotAdmitted: { zh: "这个账号还没有受邀，暂时进不来。", en: "This account hasn't been invited yet." },
  outClosed: { zh: "心里有数还没有开放。", en: "MoneyLens is not open yet." },
  outCode: { zh: "登录没有完成，再点一次。", en: "The sign-in didn't finish. Try once more." },
  outTooMany: { zh: "登录太频繁了，过一小时再试。", en: "Too many sign-ins. Try again in an hour." },
  outTryAgain: { zh: "刚才没进去，再点一次就好。", en: "That didn't go through. Once more will do it." },
  busy: { zh: "这一会儿请求太多了，过一分钟再试。", en: "Too many requests just now. Try again in a minute." },
  outLeft: { zh: "已经退出登录。", en: "You're signed out." },

  // ---------- a new vault: the passphrase ----------
  newTitle: { zh: "先定一个口令", en: "First, a passphrase" },
  newTimedOut: { zh: "超过 15 分钟没有动静，这个页面把刚才那把钥匙和恢复码丢掉了。重新定一次口令。", en: "More than 15 quiet minutes went by, so this page dropped that key and its recovery code. Choose the passphrase again." },
  newLead: { zh: "口令用来给你的账加密。我们不知道它，也没法帮你找回，所以要定一个你记得住、别人猜不到的。", en: "The passphrase encrypts your records. We never learn it and cannot recover it for you, so make it one you will remember and nobody would guess." },
  passphrase: { zh: "口令", en: "Passphrase" },
  passphraseAgain: { zh: "再输一遍", en: "Once more" },
  passphraseHint: { zh: "至少 12 个字符（中文至少 8 个字）。几个不相干的词连在一起最好记，也最难猜。", en: "At least 12 characters. A few unrelated words in a row are the easiest to remember and the hardest to guess." },
  show: { zh: "显示", en: "Show" },
  hide: { zh: "隐藏", en: "Hide" },
  next: { zh: "下一步", en: "Next" },
  makingKey: { zh: "正在生成钥匙", en: "Making your key" },
  mismatch: { zh: "两次输的不一样。", en: "The two don't match." },
  weakTooShort: { zh: "太短了。至少 12 个字符（中文至少 8 个字）。", en: "Too short. At least 12 characters." },
  weakTooLong: { zh: "太长了，最多 256 个字符。", en: "Too long: 256 characters at most." },
  weakPattern: { zh: "太有规律了：重复的字、键盘上连着的键、一串数字，都是别人最先试的。", en: "Too regular: repeats, keys in a row and strings of digits are what gets tried first." },
  weakCommon: { zh: "这是个常见的密码，换一个。", en: "That is a well-known password. Choose another." },
  weakFewWords: { zh: "只有一两个词加上数字和符号，不够。再加几个词。", en: "One or two words with digits and marks isn't enough. Add a few more words." },

  // ---------- a new vault: the recovery code ----------
  codeTitle: { zh: "把恢复码抄下来", en: "Write down your recovery code" },
  codeLead: { zh: "忘了口令的时候，只有它能打开你的账。它只显示这一次。", en: "If you forget the passphrase, this code is the only other way in. It is shown this once." },
  codeWarn: { zh: "口令和恢复码都丢了，谁也打不开你的账，我们也不行，只能清空重来。", en: "Lose both the passphrase and this code and nobody can open your records, us included: the only way forward is to start over." },
  codeLabel: { zh: "恢复码", en: "Recovery code" },
  copy: { zh: "复制", en: "Copy" },
  copied: { zh: "复制好了", en: "Copied" },
  copyByHand: { zh: "这台设备不让网页复制。按住下面这行，全选再复制。", en: "This device won't let a page copy. Press and hold the line below, select all, then copy." },
  codeKept: { zh: "我已经把恢复码抄下来，放在安全的地方了", en: "I have written the recovery code down and put it somewhere safe" },
  codeDone: { zh: "建好保险库", en: "Create my vault" },
  keeping: { zh: "正在建保险库", en: "Creating your vault" },
  keepOffline: { zh: "没连上，保险库还没建好。检查一下网络，再点一次。恢复码不变。", en: "Couldn't connect, so the vault isn't created yet. Check your connection and press again. The code stays the same." },
  keepServer: { zh: "服务器没答上来，保险库还没建好。过一会儿再点一次。恢复码不变。", en: "The server didn't answer properly, so the vault isn't created yet. Press again in a little while. The code stays the same." },
  keepBusy: { zh: "这一会儿请求太多了，保险库还没建好。过一分钟再点一次。恢复码不变。", en: "Too many requests just now, so the vault isn't created yet. Press again in a minute. The code stays the same." },
  keepAnother: { zh: "这个账号已经有一个保险库了：可能是刚在另一台设备上建的，也可能是你刚才在这里建的那一个。这一个不建了，去打开那一个，用建它时定的口令。", en: "This account already has a vault: perhaps one just made on another device, or the one you made here a moment ago. This one won't be created: open that one, with the passphrase chosen when it was made." },

  // ---------- opening a vault ----------
  openTitle: { zh: "打开你的账", en: "Open your records" },
  openLead: { zh: "输入建保险库时定的口令。", en: "Enter the passphrase you chose when the vault was made." },
  openLeadCode: { zh: "输入建保险库时抄下的恢复码。大小写、空格和横线都不要紧。", en: "Enter the recovery code you wrote down when the vault was made. Capitals, spaces and dashes don't matter." },
  openDo: { zh: "打开", en: "Open" },
  opening: { zh: "正在打开", en: "Opening" },
  useCode: { zh: "忘了口令？用恢复码", en: "Forgot it? Use the recovery code" },
  usePassphrase: { zh: "用口令", en: "Use the passphrase" },
  autoLocked: { zh: "15 分钟没有动静，已经锁上了。", en: "Locked after 15 quiet minutes." },
  wrongPassphrase: { zh: "口令不对。", en: "That's not the passphrase." },
  wrongCode: { zh: "恢复码不对。", en: "That's not the recovery code." },
  triesLeft: { zh: "还能再试 {n} 次，之后要等一阵。", en: "{n} more tries before a wait." },
  triesNone: { zh: "再错就要等一阵才能再试。", en: "One more miss and there's a wait before the next try." },
  tooManyMinutes: { zh: "试错的次数太多了。大约 {n} 分钟以后再试。", en: "Too many wrong tries. Try again in about {n} minutes." },
  tooManyHours: { zh: "试错的次数太多了。大约 {n} 小时以后再试。", en: "Too many wrong tries. Try again in about {n} hours." },
  codeMalformed: { zh: "这不是恢复码：里面有恢复码不会有的字符。", en: "That isn't a recovery code: it has characters no code has." },
  codeLength: { zh: "恢复码有 34 位，这里是 {n} 位。看看是不是抄漏了，或者多输了。", en: "A recovery code has 34 symbols; this has {n}. One may be missing, or typed twice." },
  codeTypo: { zh: "有一位抄错了。对着抄下来的那份再看一遍。", en: "One symbol was miscopied. Check it against what you wrote down." },
  noWay: { zh: "这个保险库没有这种打开方式。", en: "This vault has no way in of that kind." },
  // (never worded as a wrong passphrase, and never as a reason to start over: crypto.ts, `Unlocked`)
  unsupported: { zh: "这台设备看不懂服务器上存的钥匙。多半是页面该更新了：刷新一下再试。口令很可能是对的，先不要清空重来。", en: "This device can't read the key the server holds. Most likely the page needs updating: refresh and try again. Your passphrase may well be right, so don't start over." },
  changed: { zh: "服务器认了这个口令，但它存的钥匙用这个口令打不开，说明存的钥匙被改动过。先不要清空重来，联系我们。", en: "The server accepted this passphrase, but the key it holds doesn't open with it, which means the stored key was altered. Don't start over: contact us." },

  // ---------- the vault, open ----------
  homeTitle: { zh: "保险库打开了", en: "Your vault is open" },
  homeEmpty: { zh: "里面还没有账。导入账单的功能马上就到。", en: "Nothing in it yet. Importing statements comes next." },
  homeRecords: { zh: "里面有 {n} 条记录。", en: "{n} records inside." },
  syncDone: { zh: "已经和服务器对过。", en: "In step with the server." },
  syncPending: { zh: "有 {n} 处改动只存在这台设备上，还没送到服务器。", en: "{n} changes are saved on this device only, not yet on the server." },
  syncOffline: { zh: "没连上服务器，改动先存在这台设备上。", en: "Couldn't reach the server. Changes stay on this device for now." },
  syncTrouble: { zh: "和服务器对不上（{why}）。这台设备上的账还在。", en: "Couldn't get in step with the server ({why}). What this device holds is still here." },
  cacheTaken: { zh: "心里有数已经在这个浏览器的另一个标签页里打开了。到那一页去用，或者关掉它再回来。", en: "MoneyLens is already open in another tab of this browser. Use that one, or close it and come back." },
  cacheNone: { zh: "这个窗口不让网页存东西（比如无痕窗口），所以这台设备上什么都不会留，每次都从服务器取。", en: "This window won't let pages keep anything (a private window, for one), so nothing is kept on this device: everything comes from the server each time." },
  lockNow: { zh: "锁上", en: "Lock" },
  signOut: { zh: "退出登录", en: "Sign out" },
  signingOut: { zh: "正在退出", en: "Signing out" },
  signOutFailed: { zh: "没连上服务器，登录还在。再试一次。", en: "Couldn't reach the server, so you are still signed in. Try again." },

  // ---------- the devices that are signed in, and what has happened ----------
  devices: { zh: "设备和记录", en: "Devices and activity" },
  devicesLead: { zh: "登录着这个账号的设备，和最近发生过的事。看到不认识的设备，就让它退出。", en: "The devices signed in to this account, and what has happened lately. If there is one you don't know, sign it out." },
  back: { zh: "返回", en: "Back" },
  devicesTitle: { zh: "登录着的设备", en: "Signed-in devices" },
  deviceHere: { zh: "这台设备", en: "This device" },
  deviceOn: { zh: "{system} 上的 {browser}", en: "{browser} on {system}" },
  deviceBrowser: { zh: "浏览器", en: "Browser" },
  deviceOpen: { zh: "保险库开着", en: "Vault open" },
  deviceOpened: { zh: "打开过保险库，后来说是锁上了", en: "Opened the vault, then said it had locked" },
  deviceNotOpened: { zh: "这次登录后没打开过保险库", en: "Has not opened the vault since this sign-in" },
  openedHint: { zh: "打开过保险库的设备拿到过钥匙，它后来怎么说都一样。其中要是有你不认识的，说明口令或恢复码已经被别人知道了。", en: "A device that has opened the vault has had its key, whatever it says since. If one of them is not yours, someone else knows your passphrase or recovery code." },
  deviceMade: { zh: "登录于", en: "Signed in" },
  deviceSeen: { zh: "最近使用", en: "Last used" },
  deviceEnd: { zh: "让它退出", en: "Sign it out" },
  othersEnd: { zh: "让其他设备全部退出", en: "Sign out all other devices" },
  endedOne: { zh: "那台设备已经退出。", en: "That device is signed out." },
  endedOthers: { zh: "已经让其他设备退出，一共 {n} 台。", en: "Other devices signed out: {n}." },
  endedNone: { zh: "没有别的设备登录着。", en: "No other device is signed in." },
  endOffline: { zh: "没连上服务器，这一步没做成。检查一下网络，再试一次。", en: "Couldn't reach the server, so that wasn't done. Check your connection, then try again." },
  endServer: { zh: "服务器没答上来，这一步没做成。不是你的问题，过一会儿再试一次。", en: "The server didn't answer, so that wasn't done. Nothing you did. Try again in a little while." },
  endBusy: { zh: "这一会儿请求太多了，这一步没做成。过一分钟再试。", en: "Too many requests just now, so that wasn't done. Try again in a minute." },
  listOffline: { zh: "没连上服务器，设备和记录没读到。检查一下网络，再试一次。", en: "Couldn't reach the server, so the devices and activity could not be read. Check your connection, then try again." },
  listServer: { zh: "服务器没答上来，设备和记录没读到。不是你的问题，过一会儿再试一次。", en: "The server didn't answer, so the devices and activity could not be read. Nothing you did. Try again in a little while." },
  wrongTitle: { zh: "口令或恢复码输错的记录", en: "Wrong tries to open the vault" },
  wrongToday: { zh: "过去 24 小时里输错了 {n} 次。", en: "Wrong tries in the last 24 hours: {n}." },
  wrongNone: { zh: "过去 24 小时里没有输错。下面是更早的记录。", en: "None in the last 24 hours. The ones below are older." },
  wrongAdvice: { zh: "如果不是你输的，说明有人登录了你的 changle.ca 账号在猜口令。先到 changle.ca 上你的主页，让别的手机退出；再回到这里，让其他设备退出；并看好收登录验证码的那个邮箱。没有口令或恢复码，他们读不了你存的账。", en: "If that wasn't you, someone has signed in to your changle.ca account and is guessing. First sign out your other phones on your profile at changle.ca, then sign out the other devices here, and look after the mailbox your sign-in codes go to. Without the passphrase or the recovery code they cannot read what you have stored." },
  eventsTitle: { zh: "最近的记录", en: "Recent activity" },
  eventsEmpty: { zh: "还没有别的记录。", en: "Nothing else yet." },
  evSignIn: { zh: "登录", en: "Signed in" },
  evSignOut: { zh: "退出登录", en: "Signed out" },
  evSessionEnded: { zh: "让一台设备退出", en: "Signed a device out" },
  evSessionsEnded: { zh: "让其他设备全部退出", en: "Signed all other devices out" },
  evVaultStarted: { zh: "建了保险库", en: "Created the vault" },
  evUnlocked: { zh: "打开了保险库", en: "Opened the vault" },
  evUnlockFailed: { zh: "口令或恢复码输错", en: "Wrong passphrase or recovery code" },
  evEmailChanged: { zh: "账号的邮箱变了，所有设备都被退出", en: "The account's email changed, and every device was signed out" },
  evOther: { zh: "其他记录", en: "Something else" },
  onGone: { zh: "一台已经退出的设备", en: "a device that has since signed out" },
} as const;

export type Key = keyof typeof STRINGS;

function first(): Lang {
  try {
    const kept = localStorage.getItem("moneylens.lang");
    if (kept === "zh" || kept === "en") return kept;
  } catch {
    // (a window that keeps nothing: the browser's own language it is)
  }
  const own = (navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"])[0] ?? "en";
  return /^zh\b/i.test(own) ? "zh" : "en";
}

let lang: Lang = first();
const listeners = new Set<() => void>();
const mark = (): void => {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
};
mark();

export const getLang = (): Lang => lang;
export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem("moneylens.lang", next);
  } catch {
    // (not kept: it lasts as long as the page does)
  }
  mark();
  for (const listener of listeners) listener();
}
export function onLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
/** The words for `key` in the page's language, with `{name}` filled in. */
export function t(key: Key, values: Record<string, string | number> = {}): string {
  return STRINGS[key][lang].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
