/**
 * Every word 两清 shows, in Chinese and English. One table, so the two languages can be read side
 * by side and nothing is said in only one. `{n}`, `{who}`, `{amount}` and the like are filled in
 * by say().
 */
import type { Lang, T } from "../i18n";

export const W = {
  name: { zh: "两清", en: "All Square" },

  // the page of ledgers
  noLedgers: { zh: "还没有账本", en: "No ledgers yet" },
  noLedgersBody: {
    zh: "一群人出去玩，谁付了什么，记一笔。最后告诉每个人该给谁多少钱。",
    en: "A group goes out. Note who paid for what, and at the end everyone sees who to pay and how much.",
  },
  start: { zh: "开一个账本", en: "Start a ledger" },
  // signed out, the same button signs in first: starting a ledger needs a changle.ca account
  startSignIn: { zh: "登录，开一个账本", en: "Sign in to start a ledger" },
  preview: {
    zh: "小样：账本存在云端，登录以后换手机也都在。在账本右上角的 ⋯ 里邀请朋友一起记。",
    en: "A first look: ledgers are kept online, and signed in they follow you to any phone. Invite friends from the ⋯ menu of a ledger.",
  },
  notKept: {
    zh: "这个浏览器不让存东西（可能开了无痕模式），关掉页面账本就没了。",
    en: "This browser won't keep anything (private mode, maybe). Close the page and the ledgers are gone.",
  },
  people: { zh: "{n} 个人", en: "{n} people" },
  spent: { zh: "共花 {amount}", en: "{amount} spent" },
  youGet: { zh: "你该收", en: "You're owed" },
  youOwe: { zh: "你该给", en: "You owe" },
  youSquare: { zh: "你两清了", en: "You're all square" },
  nothingYet: { zh: "还没记账", en: "Nothing recorded yet" },
  cardUnsent: { zh: "有改动还没发出去", en: "Changes not sent yet" },
  cardLost: { zh: "有改动没存上", en: "Some changes weren't saved" },

  // starting a ledger
  ledgerName: { zh: "账本叫什么", en: "What's it called" },
  ledgerNameHint: { zh: "惠斯勒周末", en: "Whistler weekend" },
  yourName: { zh: "你的名字", en: "Your name" },
  nameHint: { zh: "名字或外号", en: "Name or nickname" },
  whoElse: { zh: "还有谁", en: "Who else" },
  whoElseHint: { zh: "一次加一个名字", en: "One name at a time" },
  add: { zh: "加上", en: "Add" },
  moreLater: { zh: "以后还能再加人。", en: "You can add more people later." },
  settleIn: { zh: "用什么货币结算", en: "Settle in" },
  startIt: { zh: "开账本", en: "Start the ledger" },
  nameTaken: { zh: "已经有人叫这个名字了", en: "Someone already has that name" },
  full: { zh: "一个账本最多 {n} 人", en: "A ledger holds {n} people at most" },
  remove: { zh: "去掉 {who}", en: "Remove {who}" },

  // a ledger
  expenses: { zh: "账目", en: "Expenses" },
  settle: { zh: "结清", en: "Settle up" },
  views: { zh: "账目和结清", en: "Expenses and settling up" },
  noExpenses: { zh: "还没有账", en: "Nothing here yet" },
  noExpensesBody: { zh: "点下面的「记一笔」，记下第一笔。", en: "Tap Add expense below to record the first one." },
  inviteHint: { zh: "想和朋友一起记，点右上角的 ⋯。", en: "To record together, invite friends from ⋯ at the top." },
  addExpense: { zh: "记一笔", en: "Add expense" },
  paidByYou: { zh: "你付", en: "You paid" },
  paidBy: { zh: "{who}付", en: "{who} paid" },
  splitEven: { zh: "{n} 人平分", en: "split {n} ways" },
  splitOne: { zh: "{who}一个人的", en: "all {who}'s" },
  splitOneYou: { zh: "你一个人的", en: "all yours" },
  splitShares: { zh: "按份数分", en: "by shares" },
  splitExact: { zh: "按金额分", en: "by amounts" },
  noNote: { zh: "没写备注", en: "No note" },
  more: { zh: "更多", en: "More" },
  back: { zh: "返回", en: "Back" },
  close: { zh: "关闭", en: "Close" },
  missing: { zh: "这部手机上没有这个账本", en: "This ledger isn't on this phone" },
  // (a line break in a sentence or two of running text is where it may wrap first: Chinese has no spaces to say so)
  missingBody: {
    zh: "账本要用邀请链接打开。\n请账本里的人从 ⋯ 里发一条给你。",
    en: "A ledger opens with an invite link.\nAsk someone in it to send you one from its ⋯ menu.",
  },
  myLedgers: { zh: "看我的账本", en: "My ledgers" },

  // an invitation: sending one, and arriving by one
  invite: { zh: "邀请朋友", en: "Invite friends" },
  inviteVia: { zh: "链接或二维码", en: "Link or QR code" },
  inviteTitle: { zh: "邀请朋友一起记", en: "Invite friends" },
  inviteHow: { zh: "扫这个码，或者把链接发到群里。\n点开就能加入，不用注册。", en: "Scan this code, or send the link.\nIt opens straight in, with no sign-up." },
  inviteWho: { zh: "有链接的人都能看这个账本，也能改。", en: "Anyone with the link can view and edit." },
  inviteNotYet: { zh: "这个账本还没存到云端。有信号存上以后，就能邀请朋友了。", en: "This ledger isn't online yet. Once there's a signal and it is, you can invite friends." },
  copyInvite: { zh: "复制邀请链接", en: "Copy the invite link" },
  copyLink: { zh: "复制链接", en: "Copy link" },
  sendInvite: { zh: "发给朋友", en: "Share" },
  inviteLine: { zh: "来「{name}」一起记账：", en: 'Join the ledger "{name}" on All Square:' },
  qrLabel: { zh: "邀请链接的二维码", en: "QR code of the invite link" },
  whoTitle: { zh: "你是哪一位？", en: "Which one are you?" },
  whoBody: { zh: "点你的名字。\n以后这部手机上的「你」就是这个人。", en: 'Tap your name.\nFrom then on, "you" on this phone is that person.' },
  justLook: { zh: "先看看账本", en: "Just have a look" },
  whoNotListed: { zh: "名单里没有你？", en: "Not on the list?" },
  addMe: { zh: "加上我", en: "Add me" },
  whoLocked: { zh: "账本锁上了，现在加不了人。", en: "This ledger is locked, so nobody can be added right now." },
  nameListed: { zh: "名单里已经有这个名字了。是你的话，点上面的名字。", en: "That name is already on the list. If it's you, tap it above." },
  slow: { zh: "网有点慢，马上就好", en: "Slow connection, nearly there" },
  joinAway: { zh: "没连上", en: "Couldn't connect" },
  joinAwayBody: { zh: "检查一下网络，再试一次。", en: "Check your connection and try again." },
  retry: { zh: "再试一次", en: "Try again" },
  joinKey: { zh: "这条邀请链接打不开账本", en: "This invite link doesn't open the ledger" },
  joinKeyBody: { zh: "链接可能不完整，或者已经换过。\n请账本里的人再发一条。", en: "The link may be incomplete or replaced.\nAsk someone in the ledger to send it again." },
  joinGone: { zh: "找不到这个账本", en: "Can't find this ledger" },
  joinGoneBody: { zh: "链接可能不完整，或者账本已经删了。\n请朋友再发一条。", en: "The link may be incomplete, or the ledger was deleted.\nAsk your friend to send it again." },

  // in step with the server: nothing is said while it is; these are for when it isn't
  synced: { zh: "已同步到云端", en: "Saved online" },
  notMade: { zh: "这个账本还没存到云端，有信号就存。", en: "This ledger isn't online yet. It goes up when there's a signal." },
  unsentOne: { zh: "有 1 处改动还没发出去，有信号就发。", en: "1 change hasn't been sent yet. It goes when there's a signal." },
  unsent: { zh: "有 {n} 处改动还没发出去，有信号就发。", en: "{n} changes haven't been sent yet. They go when there's a signal." },
  offline: { zh: "没连上，看到的可能不是最新的。", en: "Not connected. This may not be the latest." },
  troubleLimit: {
    zh: "今天开的账本太多了，这个要到明天才能存到云端。先记在这部手机上。",
    en: "Too many ledgers started today. This one can go online tomorrow; until then it stays on this phone.",
  },
  troubleGone: { zh: "这个账本已经删掉了，现在只在这部手机上。", en: "This ledger was deleted. It's only on this phone now." },
  troubleKey: {
    zh: "邀请链接换过了，这部手机暂时打不开云端的账本。点开新的邀请链接就接上，这里记的还留着。",
    en: "The invite link was changed, so this phone can't open the ledger online for now. Open the new invite link to carry on. What's recorded here is kept.",
  },
  troubleTaken: { zh: "这个账本存不到云端，只在这部手机上。重开一个账本就好。", en: "This ledger can't be kept online, so it's only on this phone. Starting a new one fixes it." },
  // (opened signed in, and by the time it could go up the sign-in had run out, or was signed out of)
  troubleSignin: {
    zh: "要登录才能把这个账本存到云端。登录以后接着存，这里记的还留着。",
    en: "This ledger needs a sign-in to go online. Sign in to carry on. What's recorded here is kept.",
  },
  signIn: { zh: "登录", en: "Sign in" },
  troubleStuck: {
    zh: "云端没收下这部手机发去的改动，先留在手机上。过一会儿再打开试试。",
    en: "The server didn't take what this phone sent, so it stays on this phone. Try opening it again in a while.",
  },
  // locked by its owner: it can be read, and nothing can be changed
  locked: { zh: "账本锁上了，只能看。", en: "This ledger is locked. It's read-only." },
  lockedOwner: { zh: "账本锁上了，只能看。要改，先在 ⋯ 里打开。", en: "This ledger is locked. To change it, unlock it from ⋯ first." },
  lockedUnsentOne: {
    zh: "账本锁上了，这里有 1 处改动发不上去。请开账本的人打开账本。",
    en: "This ledger is locked, so 1 change here can't be sent. Ask whoever started it to unlock it.",
  },
  lockedUnsent: {
    zh: "账本锁上了，这里有 {n} 处改动发不上去。请开账本的人打开账本。",
    en: "This ledger is locked, so {n} changes here can't be sent. Ask whoever started it to unlock it.",
  },
  cardLocked: { zh: "已锁上", en: "Locked" },
  lostOne: { zh: "有 1 处改动没存上", en: "1 change wasn't saved" },
  lostMany: { zh: "有 {n} 处改动没存上", en: "{n} changes weren't saved" },
  lostWhy: { zh: "账本在别的手机上先改过，所以没存上。还需要的话，再做一次。", en: "The ledger was changed on another phone first. Redo whatever is still needed." },
  lostExpense: { zh: "记一笔：{what}", en: "New expense: {what}" },
  lostEdit: { zh: "改一笔：{what}", en: "Edit: {what}" },
  lostPaid: { zh: "标成已转：{what}", en: "Marked as paid: {what}" },
  lostAdd: { zh: "加人：{who}", en: "New person: {who}" },
  lostRename: { zh: "改名：{who} 改成 {name}", en: "Rename: {who} to {name}" },
  lostRemove: { zh: "去掉：{who}", en: "Removed: {who}" },
  lostOther: { zh: "一处别的改动", en: "Another change" },
  lostMore: { zh: "还有 {n} 处", en: "and {n} more" },
  gotIt: { zh: "知道了", en: "Got it" },
  notSaved: { zh: "没记上，账本刚变过，再看一眼。", en: "That didn't save. The ledger just changed, so take another look." },

  // the ⋯ sheet
  members: { zh: "成员", en: "People" },
  rename: { zh: "改账本名", en: "Rename the ledger" },
  language: { zh: "语言", en: "Language" },
  deleteLedger: { zh: "从这部手机上移除", en: "Remove from this phone" },
  deleteAsk: {
    zh: "移除以后，要有邀请链接才能再打开。账本本身还在云端，别人照样能用。",
    en: "Once it's off this phone, it takes an invite link to open it again. The ledger itself stays online, and the others can still use it.",
  },
  // (added for the phone that started the ledger: its owner's key goes with it)
  deleteOwner: {
    zh: "这部手机是开账本的那部。移除以后，就没有人能锁账本、换链接、删掉账本了。",
    en: "This is the phone that started the ledger. Once it's removed, nobody can lock the ledger, change its link or delete it.",
  },
  deleteYes: { zh: "移除", en: "Remove" },
  // signed in, a ledger in "my ledgers" comes off the account, on every phone
  removeMine: { zh: "从我的账本里拿掉", en: "Take off my ledgers" },
  removeMineAsk: {
    zh: "拿掉以后，你登录的哪部手机上都没有它了，要有邀请链接才能再打开。账本本身还在云端，别人照样能用。",
    en: "Once it's off your ledgers, it's on none of your phones, and it takes an invite link to open it again. The ledger itself stays online, and the others can still use it.",
  },
  removeMineOwner: {
    zh: "你是开账本的人。拿掉以后，就没有人能锁账本、换链接、删掉账本了。",
    en: "You started this ledger. Once it's off your ledgers, nobody can lock it, change its link or delete it.",
  },
  removeMineYes: { zh: "拿掉", en: "Take it off" },
  removeFailed: { zh: "没连上，没拿掉。再试一次。", en: "Couldn't connect, so it's still there. Try again." },
  // the owner's third: deleting the ledger, for everyone
  eraseIt: { zh: "删掉账本", en: "Delete the ledger" },
  eraseItHint: { zh: "所有人都打不开", en: "For everyone" },
  eraseAsk: {
    zh: "删掉以后，所有人都打不开这个账本，记的账也找不回来。",
    en: "Once deleted, nobody can open this ledger, and what's recorded in it can't be brought back.",
  },
  eraseYes: { zh: "删掉", en: "Delete" },
  eraseFailed: { zh: "没连上，没删掉。再试一次。", en: "Couldn't connect, so nothing was deleted. Try again." },
  erased: { zh: "账本删掉了", en: "Ledger deleted" },
  // the owner's: only on the phone that started the ledger
  lockIt: { zh: "锁上账本", en: "Lock the ledger" },
  lockItHint: { zh: "只能看，不能改", en: "Read-only" },
  unlockIt: { zh: "打开账本", en: "Unlock the ledger" },
  unlockItHint: { zh: "大家又能改", en: "Editable" },
  lockFailed: { zh: "没连上，没锁上。再试一次。", en: "Couldn't connect, so it isn't locked. Try again." },
  unlockFailed: { zh: "没连上，还锁着。再试一次。", en: "Couldn't connect, so it's still locked. Try again." },
  lockedPeople: { zh: "账本锁上了，成员改不了。", en: "This ledger is locked, so its people can't be changed." },
  rekey: { zh: "换邀请链接", en: "Change the link" },
  rekeyAsk: {
    zh: "换了以后，现在这条链接和二维码就作废了。\n已经加入的人，要点开新链接才能接着记。",
    en: "The link and code you have now will stop working.\nPeople already in will need the new link to carry on.",
  },
  rekeyYes: { zh: "换链接", en: "Change it" },
  rekeyNo: { zh: "不换了", en: "Keep it" },
  rekeying: { zh: "正在换链接…", en: "Changing the link…" },
  rekeyWaiting: { zh: "没连上。有信号以后自动换好。", en: "Not connected. It changes as soon as there's a signal." },
  rekeyDone: { zh: "换好了，旧链接已经作废。", en: "Changed. The old link no longer works." },
  keep: { zh: "先留着", en: "Keep it" },
  save: { zh: "存好", en: "Save" },

  // people
  you: { zh: "你", en: "You" },
  thisIsMe: { zh: "这是我", en: "This is me" },
  addPerson: { zh: "加一个人", en: "Add a person" },
  renamePerson: { zh: "改名", en: "Rename" },
  hasEntries: { zh: "记过账的人去不掉", en: "Someone with entries can't be removed" },
  lastTwo: { zh: "至少要留两个人", en: "A ledger needs at least two people" },

  // 记一笔
  editExpense: { zh: "改这一笔", en: "Edit" },
  payer: { zh: "谁付的", en: "Paid by" },
  sharedBy: { zh: "分给谁", en: "Shared by" },
  note: { zh: "备注", en: "Note" },
  noteHint: { zh: "吃的什么、买的什么", en: "What it was for" },
  everyoneEven: { zh: "全部 {n} 人平分", en: "All {n}, evenly" },
  someEven: { zh: "{n} 人平分", en: "{n} people, evenly" },
  byShares: { zh: "按份数，{n} 人", en: "By shares, {n} people" },
  byAmounts: { zh: "按金额，{n} 人", en: "By amounts, {n} people" },
  nobody: { zh: "还没选人", en: "Nobody yet" },
  done: { zh: "记好了", en: "Save" },
  saveChanges: { zh: "改好了", en: "Save changes" },
  deleteExpense: { zh: "删掉这一笔", en: "Delete this expense" },
  expenseDeleted: { zh: "这一笔删掉了", en: "Expense deleted" },
  undo: { zh: "撤销", en: "Undo" },
  backspace: { zh: "删一位", en: "Delete a digit" },
  point: { zh: "小数点", en: "Decimal point" },
  amount: { zh: "金额", en: "Amount" },

  // paid in another currency
  currency: { zh: "货币", en: "Currency" },
  paidInTitle: { zh: "用什么货币付的", en: "Paid in" },
  paidInNote: { zh: "别的货币先按汇率折成{currency}，再分。", en: "Another currency is converted to {currency} at the rate, then shared." },
  comesTo: { zh: "折合 {amount}", en: "Comes to {amount}" },
  comesToFrom: { zh: "{paid} 折合 {amount}", en: "{paid} comes to {amount}" },
  rateIs: { zh: "汇率 {rate}", en: "rate {rate}" },
  changeRate: { zh: "改汇率", en: "Change the rate" },
  rateAsking: { zh: "正在查汇率…", en: "Getting the rate…" },
  needRate: { zh: "要填汇率", en: "Needs a rate" },
  tooLittle: { zh: "折合不到一分钱，记不了", en: "Comes to less than a cent" },
  tooMuch: { zh: "折合以后太大，记不了", en: "Comes to more than one expense can be" },
  rate: { zh: "汇率", en: "Exchange rate" },
  rateFor: { zh: "1 {from}合多少{to}", en: "How many {to} for 1 {from}" },
  rateType: { zh: "填一个汇率。", en: "Type a rate." },
  rateNone: { zh: "没连上，查不到今天的汇率。自己填一个。", en: "Not connected, so today's rate isn't known. Type one in." },
  useToday: { zh: "用今天的汇率 {rate}", en: "Use today's rate, {rate}" },
  useDated: { zh: "用 {date} 的汇率 {rate}", en: "Use the rate of {date}, {rate}" },
  useLast: { zh: "用上一笔的汇率 {rate}", en: "Use the last one's rate, {rate}" },
  rateKeeps: { zh: "汇率只用在这一笔上。以后汇率变了，这一笔不变。", en: "The rate is for this expense only. If rates move later, this expense stays as it is." },
  sharedOn: { zh: "按折合的 {amount} 来分", en: "Sharing what it comes to, {amount}" },

  // sharing
  evenly: { zh: "平分", en: "Evenly" },
  shares: { zh: "按份数", en: "Shares" },
  amounts: { zh: "按金额", en: "Amounts" },
  how: { zh: "怎么分", en: "How to share it" },
  everyone: { zh: "全选", en: "Everyone" },
  sharesHint: { zh: "一家三口算 3 份。", en: "A family of three counts as 3 shares." },
  fewer: { zh: "{who}少一份", en: "One share fewer for {who}" },
  oneMore: { zh: "{who}多一份", en: "One more share for {who}" },
  sharesOf: { zh: "{n} 份", en: "{n}" },
  amountFor: { zh: "{who}出多少", en: "{who}'s amount" },
  left: { zh: "还差 {amount}", en: "{amount} still to share" },
  over: { zh: "多了 {amount}", en: "{amount} too much" },
  addsUp: { zh: "正好", en: "Adds up" },
  typeAmountFirst: { zh: "先输金额，再按金额分。", en: "Type the amount first, then share it out." },
  ok: { zh: "好了", en: "Done" },

  // settling
  noSettle: { zh: "还没有要结的账", en: "Nothing to settle yet" },
  noSettleBody: { zh: "记了账，这里会算出谁该给谁。", en: "Once there are expenses, this works out who pays whom." },
  transfers: { zh: "{n} 笔转账，全部两清", en: "{n} transfers and everyone is square" },
  transferOne: { zh: "1 笔转账，全部两清", en: "One transfer and everyone is square" },
  fewest: { zh: "最少的转法，照着转就行。", en: "The fewest it can take. Just follow the list." },
  remaining: { zh: "还剩 {n} 笔", en: "{n} to go" },
  pays: { zh: "{from} 给 {to}", en: "{from} pays {to}" },
  youPay: { zh: "你 给 {to}", en: "You pay {to}" },
  paysYou: { zh: "{from} 给 你", en: "{from} pays you" },
  paid: { zh: "已转", en: "Paid" },
  notPaid: { zh: "还没转", en: "Not yet" },
  markPaid: { zh: "标成已转", en: "Mark as paid" },
  undoPaid: { zh: "撤销已转", en: "Undo paid" },
  copyAmount: { zh: "复制金额", en: "Copy the amount" },
  copied: { zh: "复制好了", en: "Copied" },
  copyFailed: { zh: "没复制上，再点一次", en: "That didn't copy. Tap again" },
  // (on a button half the width of the screen)
  copyNot: { zh: "没复制上", en: "Not copied" },
  noMoney: {
    zh: "两清不经手钱。用 e-Transfer 或微信转完，再回来标成已转。",
    en: "All Square never touches the money. Send it by e-Transfer or WeChat, then mark it here.",
  },
  alreadyPaid: { zh: "已经转过的", en: "Already paid" },
  allSquare: { zh: "全部两清", en: "All square" },
  allSquareBody: { zh: "每个人都结清了。", en: "Everyone is settled." },
  copyPlan: { zh: "复制结清方案", en: "Copy the plan" },
  planCopied: { zh: "复制好了，去群里粘贴", en: "Copied. Paste it in the group chat" },
  planTitle: { zh: "{name} · 结清", en: "{name}: settling up" },
  planLine: { zh: "{from} 给 {to} {amount}", en: "{from} pays {to} {amount}" },
  planPaid: { zh: "（已转）", en: " (paid)" },
  planSquare: { zh: "全部两清了。", en: "Everyone is square." },
} satisfies Record<string, T>;

export type Word = keyof typeof W;

/** A line in the reader's language, with its blanks filled in. */
export function say(lang: Lang, key: Word, fill?: Record<string, string | number>): string {
  let s: string = W[key][lang];
  if (fill) for (const [k, v] of Object.entries(fill)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
