// Every word a person reads, in Chinese and in English. The language is the one this phone last
// chose here, else the phone's own; the switch at the top right changes it at any time. What a
// merchant wrote (names, notes, how to pay) shows as they wrote it.
import type { Unit } from "../engine/types";

export type Lang = "zh" | "en";

const STRINGS = {
  brand: { zh: "跟一单", en: "Count Me In" },
  switchLang: { zh: "English", en: "中文" },
  close: { zh: "关闭", en: "Close" },
  loading: { zh: "正在打开", en: "Opening" },
  retry: { zh: "再试一次", en: "Try again" },
  copyCode: { zh: "复制订单号", en: "Copy the code" },
  copyEmail: { zh: "复制收款邮箱", en: "Copy the email" },
  copyPay: { zh: "复制付款方式", en: "Copy this" },
  copyContact: { zh: "复制联系方式", en: "Copy this" },
  copied: { zh: "复制好了", en: "Copied" },
  copyByHand: { zh: "按住下面这一行，全选再复制", en: "Press and hold the line below, select all, and copy" },
  netDown: { zh: "连不上，看看网络再试一次", en: "Can't connect. Check the network and try again." },
  failed: { zh: "出了点问题，稍后再试", en: "Something went wrong. Try again in a moment." },
  limit: { zh: "这个网络今天试得太多了，明天再来", en: "Too many tries from this network today. Come back tomorrow." },

  // ---------- home ----------
  homeLine: { zh: "团长开团，你跟一单。不用注册，钱直接付给商家。", en: "A merchant starts a group buy, you add your order. No sign-up, and you pay the merchant directly." },
  previewNote: { zh: "预览版：还在试用，先不对外。", en: "Preview: still being tried out, not public yet." },
  homeHow: { zh: "怎么跟单", en: "How it works" },
  homeHow1: { zh: "点开商家发在群里的链接", en: "Open the link a merchant posted in the group" },
  homeHow2: { zh: "选好东西，填称呼和电话，下单", en: "Pick what you want, leave a name and a phone number, place the order" },
  homeHow3: { zh: "按商家写的方式付款，到时间自提或等送货", en: "Pay the way the merchant says, then pick up or wait for delivery" },
  myOrders: { zh: "这部手机下过的单", en: "Orders from this phone" },
  noOrders: { zh: "还没有。点开商家发来的链接就能下单。", en: "None yet. Open a merchant's link to place one." },
  findOrder: { zh: "用订单号查单", en: "Look up an order" },
  findHint: { zh: "订单号是 6 位，在你下单后的那一页上。", en: "The code has 6 characters. It's on the page you saw after ordering." },
  codeLabel: { zh: "订单号", en: "Order code" },
  open: { zh: "打开", en: "Open" },
  footMoney: { zh: "钱直接付给商家，本站不经手，也不抽成。", en: "You pay the merchant directly. This site never touches the money and takes no cut." },
  notFoundTitle: { zh: "没有这一页", en: "No such page" },
  notFoundBody: { zh: "链接可能不全。回到商家发的那条消息，再点一次。", en: "The link may be incomplete. Go back to the merchant's message and tap it again." },

  // ---------- a group buy ----------
  goneTitle: { zh: "找不到这个团", en: "Can't find this group buy" },
  goneBody: { zh: "链接可能不全，或者商家还没开团。", en: "The link may be incomplete, or the merchant hasn't opened it yet." },
  closesAt: { zh: "截单 {when}", en: "Closes {when}" },
  closesIn: { zh: "还剩 {left}", en: "{left} left" },
  closed: { zh: "已截单", en: "Closed" },
  closedLine: { zh: "这个团已经截单，不再接新订单。", en: "This group buy has closed and takes no more orders." },
  paused: { zh: "暂停接单", en: "Not taking orders" },
  pausedLine: { zh: "这家店现在不接单。", en: "This shop isn't taking orders right now." },
  days: { zh: "{n} 天", en: "{n}d" },
  hours: { zh: "{n} 小时", en: "{n}h" },
  minutes: { zh: "{n} 分钟", en: "{n}m" },
  howToGet: { zh: "怎么拿", en: "Pickup and delivery" },
  pickupCount: { zh: "自提 {n} 处", en: "{n} pickup point(s)" },
  deliveryCount: { zh: "送货 {n} 个区", en: "{n} delivery area(s)" },
  pickup: { zh: "自提", en: "Pickup" },
  delivery: { zh: "送货", en: "Delivery" },
  minLine: { zh: "满 {m} 起送", en: "from {m} of goods" },
  feeLine: { zh: "运费 {m}", en: "{m} delivery" },
  freeFromLine: { zh: "满 {m} 免运费", en: "free from {m}" },
  freeLine: { zh: "免运费", en: "free delivery" },
  all: { zh: "全部", en: "All" },
  left: { zh: "还剩 {n}", en: "{n} left" },
  soldOut: { zh: "卖完了", en: "Sold out" },
  perBuyer: { zh: "每人限 {n}", en: "{n} each at most" },
  leastLine: { zh: "{n} 起", en: "from {n}" },
  allergens: { zh: "含：{a}", en: "Contains: {a}" },
  add: { zh: "加一份 {name}", en: "Add one {name}" },
  less: { zh: "减少 {name}", en: "Less {name}" },
  more: { zh: "增加 {name}", en: "More {name}" },
  choose: { zh: "选重量：{name}", en: "Choose a weight: {name}" },
  byWeight: { zh: "按磅称重，下单是预估，称重后多退少补。", en: "Sold by weight. The order is an estimate; you pay what the scale says." },
  estimate: { zh: "预估", en: "about" },
  addToCart: { zh: "加入 · {m}", en: "Add · {m}" },
  update: { zh: "更新 · {m}", en: "Update · {m}" },
  remove: { zh: "不要了", en: "Remove" },
  roster: { zh: "接龙名单", en: "Who's in" },
  rosterCount: { zh: "已有 {n} 单", en: "{n} order(s) so far" },
  rosterEmpty: { zh: "还没有人下单，你来第一单。", en: "Nobody yet. Be the first." },
  rosterRow: { zh: "{n} 件", en: "{n} item(s)" },
  rosterAnon: { zh: "一位买家", en: "A buyer" },
  rosterMore: { zh: "展开全部 {n} 单", en: "Show all {n}" },
  contact: { zh: "联系商家", en: "Contact" },
  howToPay: { zh: "怎么付款", en: "How to pay" },
  permit: { zh: "许可", en: "Permit" },
  kindLeader: { zh: "团长", en: "Group-buy leader" },
  kindKitchen: { zh: "私厨", en: "Home kitchen" },
  kindFarm: { zh: "农场", en: "Farm" },

  // ---------- the cart ----------
  cart: { zh: "购物车", en: "Your order" },
  cartCount: { zh: "{n} 件", en: "{n} item(s)" },
  cartEmpty: { zh: "还没选东西", en: "Nothing picked yet" },
  checkout: { zh: "去结算", en: "Check out" },
  clear: { zh: "清空", en: "Clear" },
  cleared: { zh: "清空了", en: "Cleared" },
  undo: { zh: "撤销", en: "Undo" },
  goods: { zh: "商品", en: "Goods" },
  goodsEstimate: { zh: "商品（预估）", en: "Goods (estimate)" },
  fee: { zh: "运费", en: "Delivery" },
  free: { zh: "免费", en: "Free" },
  total: { zh: "合计", en: "Total" },
  totalEstimate: { zh: "合计（预估）", en: "Total (estimate)" },
  weighNote: { zh: "按磅的商品称重后多退少补。", en: "Anything sold by weight is settled once it's weighed." },

  // ---------- checkout ----------
  checkoutTitle: { zh: "确认订单", en: "Check out" },
  changeTitle: { zh: "改订单 {code}", en: "Change order {code}" },
  leaveAsIs: { zh: "不改了，回到订单", en: "Leave it as it is" },
  back: { zh: "返回", en: "Back" },
  howLabel: { zh: "怎么拿", en: "How you'll get it" },
  whereLabel: { zh: "在哪里取", en: "Where to pick up" },
  areaLabel: { zh: "送到哪个区", en: "Which area" },
  addressLabel: { zh: "送货地址", en: "Delivery address" },
  addressPlaceholder: { zh: "门牌号、街道、城市、邮编", en: "Number, street, city, postal code" },
  short: { zh: "还差 {m} 起送", en: "{m} more for delivery here" },
  toFree: { zh: "再买 {m} 免运费", en: "{m} more for free delivery" },
  contactLabel: { zh: "联系人", en: "Your details" },
  name: { zh: "称呼", en: "Name" },
  namePlaceholder: { zh: "怎么称呼你", en: "What to call you" },
  nameShown: { zh: "称呼会出现在接龙名单里。", en: "Your name shows on the list of who's in." },
  phone: { zh: "电话", en: "Phone" },
  phonePlaceholder: { zh: "例如 6045550123", en: "e.g. 6045550123" },
  phoneFixed: { zh: "电话是查单用的，不能改。", en: "The phone number opens the order, so it stays." },
  wechat: { zh: "微信号（选填）", en: "WeChat ID (optional)" },
  wechatPlaceholder: { zh: "方便商家联系你", en: "So the merchant can reach you" },
  note: { zh: "备注（选填）", en: "Note (optional)" },
  notePlaceholder: { zh: "有什么要交代商家的", en: "Anything the merchant should know" },
  payNow: { zh: "现在不用付钱。下单后按商家写的方式付款。", en: "Nothing to pay now. After ordering, pay the way the merchant says." },
  place: { zh: "提交订单 · {m}", en: "Place order · {m}" },
  saveChange: { zh: "保存修改 · {m}", en: "Save changes · {m}" },
  placing: { zh: "正在提交", en: "Sending" },
  needName: { zh: "请填称呼", en: "Add a name" },
  needPhone: { zh: "请填能联系到你的电话，至少 10 位数字", en: "Add a phone number we can reach, at least 10 digits" },
  needWhere: { zh: "请选一个自提点", en: "Choose a pickup point" },
  needArea: { zh: "请选送到哪个区", en: "Choose an area" },
  needAddress: { zh: "请填送货地址", en: "Add the delivery address" },
  errClosed: { zh: "这个团刚刚截单了。", en: "This group buy has just closed." },
  errSoldout: { zh: "有东西不够了，已经按剩下的改好，请再看一眼。", en: "Some things ran short. Your order was adjusted to what's left: please look again." },
  errPerbuyer: { zh: "有东西超过了每人限购，已经改好，请再看一眼。", en: "Some things passed the limit per buyer. Your order was adjusted: please look again." },
  errMany: { zh: "这个电话在这个团里的订单已经到上限了。可以改之前的单。", en: "This phone number has as many orders here as one may. You can change an earlier one." },
  errFull: { zh: "这个团的订单满了。", en: "This group buy is full." },
  errBusy: { zh: "这会儿下单的人多，没排上。请再点一次。", en: "Lots of orders came in at once and yours didn't get through. Please tap again." },
  errGone: { zh: "有东西已经下架了，请重新选。", en: "Something is no longer offered. Please pick again." },
  errPaid: { zh: "这一单已经付款或取货，要改请联系商家。", en: "This order is paid for or handed over. Ask the merchant to change it." },
  errCancelled: { zh: "这一单已经取消了。", en: "This order was cancelled." },

  // ---------- an order ----------
  orderTitle: { zh: "订单 {code}", en: "Order {code}" },
  placed: { zh: "下单成功", en: "Order placed" },
  placedLine: { zh: "商家收到了。记下订单号，付款时写在备注里。", en: "The merchant has it. Keep the code, and put it in the payment note." },
  seq: { zh: "第 {n} 位", en: "No. {n}" },
  statusNew: { zh: "待商家确认", en: "Waiting for the merchant" },
  statusConfirmed: { zh: "商家已确认", en: "Confirmed" },
  statusCancelled: { zh: "已取消", en: "Cancelled" },
  paidYes: { zh: "已收款", en: "Paid" },
  paidNo: { zh: "未付款", en: "Not paid yet" },
  pickedYes: { zh: "已取货", en: "Handed over" },
  tailTitle: { zh: "打开订单 {code}", en: "Open order {code}" },
  tailLabel: { zh: "下单电话的后四位", en: "Last four digits of the phone number you ordered with" },
  tailWrong: { zh: "订单号或电话后四位不对。", en: "The code or the last four digits don't match." },
  tailLocked: { zh: "试错太多次，这一单今天打不开了。明天再试，或者联系商家。", en: "Too many wrong tries: this order stays shut today. Try tomorrow, or ask the merchant." },
  payTitle: { zh: "付款", en: "Paying" },
  payMemo: { zh: "付款时在备注里写订单号", en: "Put the order code in the payment note" },
  payWait: { zh: "有按磅的商品：等商家称重后告诉你实际金额再付。", en: "Something here is sold by weight: wait for the merchant to weigh it and tell you the amount." },
  finalAmount: { zh: "实际金额", en: "Final amount" },
  weighed: { zh: "实称 {w}", en: "weighed {w}" },
  whereTitle: { zh: "取货", en: "Getting it" },
  itemsTitle: { zh: "商品", en: "What's in it" },
  change: { zh: "改订单", en: "Change it" },
  cancel: { zh: "取消订单", en: "Cancel it" },
  cancelAsk: { zh: "取消这一单？", en: "Cancel this order?" },
  cancelBody: { zh: "取消后东西会放回去，别人可以买。", en: "What it holds goes back for others to order." },
  cancelYes: { zh: "取消订单", en: "Cancel the order" },
  cancelNo: { zh: "先不取消", en: "Keep it" },
  cancelled: { zh: "取消了", en: "Cancelled" },
  noChange: { zh: "团已截单，或者这一单已经付款：要改请联系商家。", en: "The group buy has closed, or this order is paid for: ask the merchant to change it." },
  toOffer: { zh: "回到这个团", en: "Back to the group buy" },
  orderedAt: { zh: "下单时间 {when}", en: "Ordered {when}" },

  // ---------- a merchant ----------
  myTitle: { zh: "我的团", en: "My group buys" },
  myLink: { zh: "商家入口：我的团", en: "Merchants: my group buys" },
  signedInAs: { zh: "已登录：{name}（{email}）", en: "Signed in as {name} ({email})" },
  signInTitle: { zh: "商家请先登录", en: "Merchants sign in first" },
  signInBody: { zh: "用 changle.ca 的账号登录（邮箱验证码）。登录后回到这一页。", en: "Sign in with your changle.ca account (a code by email), then come back to this page." },
  signInGo: { zh: "去 changle.ca 登录", en: "Sign in at changle.ca" },
  signInStale: { zh: "登录过期了，请重新登录。", en: "Your sign-in has expired. Please sign in again." },
  troubleDown: { zh: "账号服务暂时连不上，稍后再试。", en: "The account service can't be reached right now. Try again in a moment." },
  troubleForbidden: { zh: "这个账号不管这个团。", en: "This account doesn't run this group buy." },
  troubleMissing: { zh: "没有这个团。", en: "No such group buy." },
  noShops: { zh: "这个账号（{email}）还没有店铺。想开团请联系站长。", en: "This account ({email}) has no shop yet. Ask the site's owner to set one up." },
  noOffers: { zh: "还没有开过团。", en: "No group buys yet." },
  shopPaused: { zh: "暂停中", en: "Paused" },
  shopPending: { zh: "待审核", en: "Awaiting review" },
  stateDraft: { zh: "草稿", en: "Draft" },
  stateOpen: { zh: "接单中", en: "Taking orders" },
  stateClosed: { zh: "已截单", en: "Closed" },
  offerRow: { zh: "{n} 单 · {m}", en: "{n} order(s) · {m}" },
  offerFresh: { zh: "{n} 单待确认", en: "{n} to confirm" },
  refresh: { zh: "刷新", en: "Refresh" },
  viewPublic: { zh: "看开团页", en: "See its page" },
  copyLink: { zh: "复制开团链接", en: "Copy the link" },
  closeNow: { zh: "现在截单", en: "Close it now" },
  closeAsk: { zh: "现在截单？", en: "Close it now?" },
  closeBody: { zh: "截单后买家不能再下单、改单。截单时间没到之前还可以重新接单。", en: "Buyers can no longer order or change their orders. Until its closing time you can open it again." },
  closeYes: { zh: "截单", en: "Close it" },
  closeNo: { zh: "先不截", en: "Keep it open" },
  reopen: { zh: "重新接单", en: "Open it again" },
  openDraft: { zh: "开始接单", en: "Start taking orders" },
  statOrders: { zh: "订单", en: "Orders" },
  statFresh: { zh: "待确认", en: "To confirm" },
  statPaid: { zh: "已收款", en: "Paid" },
  statPicked: { zh: "已取货", en: "Handed over" },
  statWeigh: { zh: "待称重", en: "To weigh" },
  due: { zh: "应收", en: "To collect" },
  dueEstimate: { zh: "应收（预估）", en: "To collect (estimate)" },
  tabOrders: { zh: "订单", en: "Orders" },
  tabGoods: { zh: "备货单", en: "To get ready" },
  tabPlaces: { zh: "分拣单", en: "What goes where" },
  filterAll: { zh: "全部 {n}", en: "All {n}" },
  filterNew: { zh: "待确认 {n}", en: "To confirm {n}" },
  filterUnpaid: { zh: "未收款 {n}", en: "Unpaid {n}" },
  filterUnpicked: { zh: "未取货 {n}", en: "Not handed over {n}" },
  filterCancelled: { zh: "已取消 {n}", en: "Cancelled {n}" },
  placeLabel: { zh: "地点", en: "Where" },
  placeAll: { zh: "全部地点", en: "Everywhere" },
  placeOrders: { zh: "{n} 单", en: "{n} order(s)" },
  noOrdersYet: { zh: "还没有订单。把开团链接发到群里。", en: "No orders yet. Post the link in your group." },
  noneMatch: { zh: "没有符合的订单。", en: "No orders match." },
  confirm: { zh: "确认", en: "Confirm" },
  doneConfirm: { zh: "已确认", en: "Confirmed" },
  goodsAsOrdered: { zh: "商品（按下单量）", en: "Goods (as ordered)" },
  weigh: { zh: "称重", en: "Weigh" },
  weighTitle: { zh: "称重：{name}", en: "Weigh: {name}" },
  weighHint: { zh: "填秤上的重量（磅）。留空表示还没称。", en: "Enter what the scale says, in pounds. Leave it empty if it isn't weighed yet." },
  weighOrdered: { zh: "订了 {w}", en: "ordered {w}" },
  weighSave: { zh: "保存", en: "Save" },
  weighBad: { zh: "请填 0 到 999 之间的数字，最多三位小数。", en: "Enter a number from 0 to 999, with at most three decimals." },
  cancelOrderAsk: { zh: "取消 {name} 的订单？", en: "Cancel {name}'s order?" },
  cancelOrderBody: { zh: "取消后东西会放回去，买家的订单页会显示已取消。", en: "What it holds goes back on the shelf, and the buyer's page will say cancelled." },
  orderNote: { zh: "备注：{note}", en: "Note: {note}" },
  callPhone: { zh: "打电话给 {name}", en: "Call {name}" },
  copyWechat: { zh: "微信 {id}", en: "WeChat {id}" },
  copyAddress: { zh: "复制地址", en: "Copy the address" },
  copySheet: { zh: "复制这张表", en: "Copy this sheet" },
  errMoveBusy: { zh: "这一单刚被改过，已经刷新，请再点一次。", en: "This order just changed. It's been refreshed: please tap again." },
  colItem: { zh: "商品", en: "Item" },
  colQty: { zh: "数量", en: "Amount" },
  colOrders: { zh: "单数", en: "Orders" },
  colAmount: { zh: "金额", en: "Comes to" },
  sheetFees: { zh: "运费合计", en: "Delivery fees" },
  sheetAddress: { zh: "地址", en: "Address" },
  sheetEmpty: { zh: "还没有订单，表是空的。", en: "No orders yet: nothing to list." },

  // ---------- starting a group buy, and changing one ----------
  editNew: { zh: "开一个团", en: "Start a group buy" },
  editChange: { zh: "改这个团", en: "Change this group buy" },
  editAgain: { zh: "再开一团", en: "Start another like it" },
  editLikeLast: { zh: "照上一团「{title}」来", en: "Start from the last one, “{title}”" },
  editLikeLastHint: { zh: "商品、自提点和送货区照搬过来，改几个字就能开。", en: "Its goods, pickup points and delivery areas are copied over: change a few words and it's ready." },
  editPicked: { zh: "上次没填完的还在。", en: "What you were writing last time is still here." },
  editStartOver: { zh: "清空重来", en: "Clear it and start over" },
  editStep1: { zh: "1 · 团名", en: "1 · Its name" },
  editTitle: { zh: "团名", en: "Name" },
  editTitleHint: { zh: "比如：本周大米团 · 周五到货", en: "e.g. This week's rice run, here Friday" },
  editNote: { zh: "说明（选填）", en: "Note (optional)" },
  editNoteHint: { zh: "写在开团页最上面：什么时候到货、要注意什么。", en: "Shown at the top of the group buy's page: when it arrives, what to know." },
  editStep2: { zh: "2 · 商品", en: "2 · Goods" },
  editNoItems: { zh: "还没有商品。", en: "No goods yet." },
  editAddItem: { zh: "加商品", en: "Add an item" },
  editItem: { zh: "改商品", en: "Change the item" },
  editRowStock: { zh: "共 {n}", en: "{n} in all" },
  editStep3: { zh: "3 · 截单和取货", en: "3 · Closing and pickup" },
  editPoints: { zh: "自提点", en: "Pickup points" },
  editNoPoints: { zh: "还没有自提点。", en: "No pickup points yet." },
  editAddPoint: { zh: "加自提点", en: "Add a pickup point" },
  editPoint: { zh: "改自提点", en: "Change the pickup point" },
  editRules: { zh: "送货区（不送货就不用加）", en: "Delivery areas (none if you don't deliver)" },
  editNoRules: { zh: "还没有送货区。", en: "No delivery areas yet." },
  editAddRule: { zh: "加送货区", en: "Add a delivery area" },
  editRule: { zh: "改送货区", en: "Change the delivery area" },
  editRowMin: { zh: "满 {m} 起送", en: "from {m}" },
  editRowFee: { zh: "运费 {m}", en: "{m} delivery" },
  editRowNoFee: { zh: "免运费", en: "free delivery" },
  editRowFree: { zh: "满 {m} 免运费", en: "free from {m}" },
  editRosterHint: { zh: "开团页上谁跟了单的名单。", en: "The list on the group buy's page of who has ordered." },
  editRosterNames: { zh: "显示称呼", en: "Show names" },
  editRosterAnon: { zh: "只显示第几位", en: "Numbers only" },
  editRosterOff: { zh: "不显示", en: "Don't show it" },
  editSummary: { zh: "商品 {n} 样 · 自提点 {p} 个 · 送货区 {r} 个", en: "Goods: {n} · Pickup points: {p} · Delivery areas: {r}" },
  editKeepDraft: { zh: "存成草稿，先不接单", en: "Keep it as a draft for now" },
  editSave: { zh: "保存", en: "Save" },
  editName: { zh: "名称", en: "Name" },
  editPrice: { zh: "价格（加元）", en: "Price (CAD)" },
  editUnit: { zh: "怎么卖", en: "Sold" },
  editUnitWeighed: { zh: "买家选重量，看到的是预估金额；称重以后在订单里填实际重量。", en: "Buyers choose a weight and see an estimate; after weighing, enter the real weight on the order." },
  editStep: { zh: "每次加减", en: "In steps of" },
  editLeast: { zh: "最少买几磅", en: "Least per order, in lb" },
  editOptional: { zh: "选填", en: "Optional" },
  editSection: { zh: "分类", en: "Section" },
  editSectionHint: { zh: "选填。同一类的排在一起，比如：牛肉、蔬菜。", en: "Optional. Items in one section are listed together: Beef, Vegetables." },
  editDetail: { zh: "说明（选填）", en: "Details (optional)" },
  editStock: { zh: "一共有多少（{unit}）", en: "How much there is ({unit})" },
  editStockHint: { zh: "选填。不填就是不限量。", en: "Optional. Empty means no limit." },
  editPerBuyer: { zh: "每人最多买（{unit}）", en: "Most per buyer ({unit})" },
  editAllergens: { zh: "过敏原", en: "Allergens" },
  editAllergensHint: { zh: "选填。比如：花生、小麦。", en: "Optional. e.g. peanuts, wheat." },
  editMoveUp: { zh: "上移", en: "Move up" },
  editMoveDown: { zh: "下移", en: "Move down" },
  editRemove: { zh: "删掉", en: "Remove" },
  editDone: { zh: "确定", en: "Done" },
  editUsedItem: { zh: "已经有人下单了：不能删，「怎么卖」也不能改。不想再卖，就把「一共有多少」改成 {sold}。", en: "Someone has ordered it: it can't be removed, and how it's sold can't change. To stop selling it, set “How much there is” to {sold}." },
  editUsedPlace: { zh: "已经有订单用到这里：不能删，字可以改。", en: "An order uses this: it can't be removed, but its words can change." },
  editPointHint: { zh: "比如：温哥华西区、某某超市门口", en: "e.g. Vancouver West, outside the market" },
  editAddress: { zh: "地址（选填）", en: "Address (optional)" },
  editHours: { zh: "时间", en: "When" },
  editHoursHint: { zh: "选填。比如：周五 4–7pm", en: "Optional. e.g. Friday 4–7pm" },
  editArea: { zh: "送到哪里", en: "Where" },
  editAreaHint: { zh: "比如：列治文", en: "e.g. Richmond" },
  editMin: { zh: "起送金额（加元）", en: "Least order to deliver (CAD)" },
  editMinHint: { zh: "不填就是不限。", en: "Empty means none." },
  editFee: { zh: "运费（加元）", en: "Delivery fee (CAD)" },
  editFeeHint: { zh: "不填就是免运费。", en: "Empty means free." },
  editFreeFrom: { zh: "满多少免运费（加元）", en: "Free delivery from (CAD)" },
  editErrName: { zh: "这里要写。", en: "This is needed." },
  editErrPrice: { zh: "写成 12 或 12.50 这样。", en: "Write it like 12 or 12.50." },
  editErrSteps: { zh: "要是 {step} 的整数倍。", en: "It goes in steps of {step}." },
  editErrWhole: { zh: "要写整数。", en: "A whole number, please." },
  editErrStockLow: { zh: "已经卖出 {sold}，不能比这个少。", en: "{sold} already ordered: it can't be less." },
  editErrPerBuyerLow: { zh: "不能比最少买的还少。", en: "It can't be less than the least per order." },
  editErrTitle: { zh: "先写团名。", en: "Give it a name first." },
  editErrCloses: { zh: "截单时间要在现在以后、90 天以内。", en: "The closing time has to be ahead of now, within 90 days." },
  editErrItems: { zh: "至少要有一样商品。", en: "It needs at least one item." },
  editErrPlaces: { zh: "至少要有一个自提点或者送货区。", en: "It needs a pickup point or a delivery area." },
  editErrItem: { zh: "第 {n} 样商品「{name}」有地方不对，点开看看。", en: "Item {n}, “{name}”, has something wrong: open it and look." },
  editErrPlace: { zh: "有一个自提点或送货区不对，点开看看。", en: "A pickup point or a delivery area has something wrong: open it and look." },
  editErrSold: { zh: "「{name}」卖出的已经比你写的多了。重新打开这一页再改。", en: "More of “{name}” has been ordered than the limit you set. Open this page again and change it." },
  editErrBusy: { zh: "这个团刚刚有变化（有人下单，或者别处改过）。重新打开这一页再改。", en: "This group buy has just changed (an order came in, or it was changed elsewhere). Open this page again and change it." },
  editErrFailed: { zh: "没存上，再试一次。", en: "It didn't save. Try again." },
  editNoShop: { zh: "这个账号没有这家店。", en: "This account has no such shop." },

  // ---------- the site's owner ----------
  ownerTitle: { zh: "站长", en: "Site owner" },
  ownerFile: { zh: "从文件导入", en: "Fill in from a file" },
  ownerFileRead: { zh: "读到了：店铺「{shop}」，团「{title}」，{n} 样商品，{p} 个自提点，{r} 个送货区。还没有提交，看一眼再点下面的按钮。", en: "Read: shop “{shop}”, group buy “{title}”, {n} goods, {p} pickup point(s), {r} delivery area(s). Nothing is sent yet: look it over, then press the button below." },
  ownerFileBig: { zh: "文件太大了。", en: "That file is too big." },
  ownerBoth: { zh: "建店并开团", en: "Save the shop and start the group buy" },
  ownerShopTitle: { zh: "建店或改店", en: "Set up or change a shop" },
  ownerNote: { zh: "保存会整个覆盖这家店：介绍、联系方式、付款说明、管店的账号都以这次填的为准。", en: "Saving replaces the whole shop: about, contact, how to pay and the accounts are what you enter here." },
  ownerSlug: { zh: "店铺地址（小写字母、数字、短横线）", en: "Shop address (lower-case letters, digits, hyphens)" },
  ownerName: { zh: "店名", en: "Shop name" },
  ownerKind: { zh: "类型", en: "Kind" },
  ownerAbout: { zh: "介绍", en: "About" },
  ownerContact: { zh: "联系方式（买家看得到）", en: "Contact (buyers see it)" },
  ownerPay: { zh: "付款说明（买家看得到）", en: "How to pay (buyers see it)" },
  ownerMembers: { zh: "管店的账号邮箱，一行一个", en: "Emails of the accounts that run it, one a line" },
  ownerSave: { zh: "保存店铺", en: "Save the shop" },
  ownerSaved: { zh: "店铺保存好了。", en: "Shop saved." },
  ownerOfferTitle: { zh: "开一个团", en: "Start a group buy" },
  ownerShop: { zh: "哪家店", en: "Which shop" },
  ownerCloses: { zh: "截单时间（温哥华时间）", en: "Closes (Vancouver time)" },
  ownerDoc: { zh: "团的内容（JSON）", en: "The group buy (JSON)" },
  ownerSample: { zh: "填入样例", en: "Fill in a sample" },
  ownerStart: { zh: "开团", en: "Start it" },
  ownerStarted: { zh: "开好了。", en: "Started." },
  ownerBadJson: { zh: "这不是合法的 JSON。", en: "That isn't valid JSON." },
  ownerErr: { zh: "没成：{why}", en: "It didn't go: {why}" },
} as const;

type Key = keyof typeof STRINGS;

const stored = (): Lang | null => {
  try {
    const value = localStorage.getItem("tuan.lang");
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
    localStorage.setItem("tuan.lang", next);
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

/** A line in the reader's language, with {placeholders} filled in. In English, "(s)" follows {n}: 1 item, 2 items. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return STRINGS[key][lang].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? "")).replace(/\(s\)/g, vars.n === 1 ? "" : "s");
}

const UNITS: Record<Unit, { zh: string; en: string }> = {
  each: { zh: "个", en: "each" },
  box: { zh: "盒", en: "box" },
  bag: { zh: "袋", en: "bag" },
  pack: { zh: "包", en: "pack" },
  portion: { zh: "份", en: "portion" },
  lb: { zh: "磅", en: "lb" },
};
/** "袋", "lb" */
export const unitName = (unit: Unit): string => UNITS[unit][lang];

const SOLD_BY: Record<Unit, { zh: string; en: string }> = {
  each: { zh: "按个卖", en: "One at a time" },
  box: { zh: "按盒卖", en: "By the box" },
  bag: { zh: "按袋卖", en: "By the bag" },
  pack: { zh: "按包卖", en: "By the pack" },
  portion: { zh: "按份卖", en: "By the portion" },
  lb: { zh: "按磅卖（称重）", en: "By the pound (weighed)" },
};
/** How an item is sold, as a merchant chooses it: "按袋卖", "By the pound (weighed)". */
export const soldBy = (unit: Unit): string => SOLD_BY[unit][lang];

const WEEKDAYS = { zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A moment as Vancouver's clock shows it (UTC-7 all year, src/engine/time.ts): "11月18日 周三 20:00", "Wed, Nov 18, 20:00". */
export function whenText(ms: number): string {
  const d = new Date(ms - 7 * 3_600_000);
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return lang === "zh" ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${WEEKDAYS.zh[d.getUTCDay()]} ${time}` : `${WEEKDAYS.en[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${time}`;
}
/** How long is left: "2 天 3 小时", "45 分钟". */
export function leftText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes >= 48 * 60) return t("days", { n: Math.floor(minutes / 1440) });
  if (minutes >= 24 * 60) return `${t("days", { n: 1 })} ${t("hours", { n: Math.floor((minutes - 1440) / 60) })}`;
  if (minutes >= 120) return t("hours", { n: Math.floor(minutes / 60) });
  if (minutes >= 60) return `${t("hours", { n: 1 })} ${t("minutes", { n: minutes - 60 })}`;
  return t("minutes", { n: minutes });
}

document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
