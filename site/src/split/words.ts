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
  preview: {
    zh: "小样：账本存在云端，这部手机上留一份。在账本右上角的 ⋯ 里邀请朋友一起记。",
    en: "A first look: ledgers are kept online, with a copy on this phone. Invite friends from the ⋯ menu of a ledger.",
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
  noExpensesBody: { zh: "点下面的「记一笔」，记下第一笔。", en: "Tap Add an expense below to record the first one." },
  inviteHint: { zh: "想和朋友一起记，点右上角的 ⋯。", en: "To record together, invite friends from ⋯ at the top." },
  addExpense: { zh: "记一笔", en: "Add an expense" },
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
  troubleGone: { zh: "云端没有这个账本了，现在只在这部手机上。", en: "This ledger is no longer online. It's only on this phone now." },
  troubleKey: { zh: "这部手机打不开云端的这个账本了，这里记的发不上去。", en: "This phone can no longer open this ledger online. What's recorded here can't be sent." },
  troubleTaken: { zh: "这个账本存不到云端，只在这部手机上。重开一个账本就好。", en: "This ledger can't be kept online, so it's only on this phone. Starting a new one fixes it." },
  troubleStuck: {
    zh: "云端没收下这部手机发去的改动，先留在手机上。过一会儿再打开试试。",
    en: "The server didn't take what this phone sent, so it stays on this phone. Try opening it again in a while.",
  },
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
  deleteYes: { zh: "移除", en: "Remove" },
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
  editExpense: { zh: "改这一笔", en: "Edit the expense" },
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
