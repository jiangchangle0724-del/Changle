// Every word a person reads, in Chinese and in English. The language is the one this phone last
// chose here; else Chinese inside WeChat, whatever language the phone is in (Steve, 2026-11-14:
// group buys are passed around in WeChat groups); else the phone's own. The switch at the top
// right changes it at any time. What a merchant wrote (names, notes, how to pay) shows as they
// wrote it.
//
// These are the words a buyer's pages use (the merchant's pages use some too); the ones only the
// merchant's pages use come with those pages (src/client/i18n-my.ts), so a buyer never downloads
// them.
import type { Unit } from "../engine/types";
import type { MY_STRINGS } from "./i18n-my";

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
  homeLine: { zh: "附近的私厨和团长在这里开团，点开就能下单，不用注册。", en: "Greater Vancouver's home kitchens and group buys take orders here. Open one and order, no sign-up." },
  homeTitle: { zh: "大温私厨 · 团购", en: "Home kitchens & group buys" },
  homeSearch: { zh: "搜团、店或者商品", en: "Search shops or goods" },
  homeKinds: { zh: "按店的种类看", en: "By kind of shop" },
  homeAll: { zh: "全部", en: "All" },
  homeOpen: { zh: "正在开团", en: "Open now" },
  homeFailed: { zh: "没打开，下拉刷新或者过一会儿再试。", en: "That didn't load. Refresh, or try again in a moment." },
  homeNone: { zh: "还没有开着的团。私厨和团长开团时，会把链接发到微信群里。", en: "Nothing open yet. Kitchens and group-buy organizers post their links in their WeChat groups." },
  homeNoneShops: { zh: "还没有开着的团。下面这些店开团时，会把链接发到群里。", en: "Nothing open yet. When the shops below start one, they post the link in their groups." },
  homeNothing: { zh: "没有找到。换个词，或者看看全部。", en: "Nothing found. Try another word, or look at them all." },
  homeShops: { zh: "商家", en: "Shops" },
  homeShopOpen: { zh: "{n} 个团在开", en: "{n} open" },
  homeShopQuiet: { zh: "现在没开团", en: "Nothing open now" },
  homeOrders: { zh: "已有 {n} 单", en: "{n} order(s) in" },
  homeGoodsMore: { zh: "{goods} 等 {n} 样", en: "{goods} and more ({n} in all)" },
  homeAnd: { zh: "、", en: ", " },
  homePickups: { zh: "{n} 个自提点", en: "{n} pickup point(s)" },
  homeDelivers: { zh: "送到 {areas}", en: "Delivers to {areas}" },
  homeFree: { zh: "满 {amount} 免运费", en: "Free delivery from {amount}" },
  homeWeighed: { zh: "称重计价", en: "Priced by weight" },
  homeCta: { zh: "做私厨、做团购？", en: "Run a home kitchen or group buys?" },
  homeCtaLine: { zh: "在跟一单开店：开团、收单、备货分拣都在手机上，不抽成。", en: "Open a shop here: start group buys, take orders, get ready and sort, all on your phone. No commission." },
  homeCtaButton: { zh: "申请开店", en: "Apply for a shop" },
  myOrders: { zh: "这部手机下过的单", en: "Orders from this phone" },
  findOrder: { zh: "用订单号查单", en: "Look up an order" },
  findHint: { zh: "订单号是 6 位，在你下单后的那一页上。", en: "The code has 6 characters. It's on the page you saw after ordering." },
  codeLabel: { zh: "订单号", en: "Order code" },
  open: { zh: "打开", en: "Open" },
  footMoney: { zh: "钱直接付给商家，本站不经手，也不抽成。", en: "You pay the merchant directly. This site never touches the money and takes no cut." },
  look: { zh: "看大图：{name}", en: "See the photo: {name}" },
  pickWeight: { zh: "选重量", en: "Choose the weight" },
  changeWeight: { zh: "已选 {qty} · 改重量", en: "{qty} · change the weight" },
  details: { zh: "详情：{name}", en: "Details: {name}" },
  noteMore: { zh: "展开全部", en: "Show all" },
  noteLess: { zh: "收起", en: "Show less" },
  joined: { zh: "已有 {n} 单跟团 · 看名单", en: "{n} order(s) in · see the list" },
  footOpen: { zh: "想自己开团？用跟一单，不抽成", en: "Run group buys yourself? Count Me In takes no cut" },
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
  caseSize: { zh: "整箱进货，一箱 {n}", en: "Comes in cases of {n}" },
  caseShort: { zh: "这一箱还差 {n}", en: "{n} more fills this case" },
  caseNext: { zh: "已凑满 {full} 箱，下一箱还差 {n}", en: "{full} full, {n} more fills the next" },
  caseFull: { zh: "刚好凑满 {n} 箱", en: "Exactly {n} full case(s)" },
  caseYou: { zh: "算上你的", en: "With yours" },
  arrivedTitle: { zh: "货到了", en: "The goods are in" },
  arrivedPickup: { zh: "货到了，可以来取了", en: "The goods are in: come and pick yours up" },
  pickupCodeTitle: { zh: "取货码", en: "Pickup code" },
  pickupCodeLine: { zh: "取货时给商家看这个码，商家用手机相机扫一下，就能找到你这一单。", en: "Show this when you pick up: the merchant scans it with their phone's camera to find your order." },
  arrivedDelivery: { zh: "货到了，商家会按说好的时间送到", en: "The goods are in: the merchant will deliver as arranged" },
  caseAbout: { zh: "商家按整箱进这样东西，一箱 {size}。大家的订单一起凑满一箱；截单时最后一箱没凑满的话，商家会跟你联系。", en: "The merchant gets this by the case, {size} a case. Everyone's orders fill it together; if the last case isn't full when orders close, the merchant will be in touch." },
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
  shopOpen: { zh: "正在接单", en: "Taking orders" },
  shopPast: { zh: "开过的团", en: "Earlier group buys" },
  shopNone: { zh: "现在没有在开的团。", en: "No group buy is taking orders just now." },
  shopGoneTitle: { zh: "没有这家店", en: "No such shop" },
  shopGoneBody: { zh: "地址可能抄错了，或者这家店还没开张。", en: "The address may be mistyped, or the shop isn't open yet." },
  shopMore: { zh: "这家店的其他团", en: "This shop's other group buys" },
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
  myLink: { zh: "商家入口：我的团", en: "Merchants: my group buys" },
} as const;

export type Key = keyof typeof STRINGS | keyof typeof MY_STRINGS;
type Line = { readonly zh: string; readonly en: string };
const lines: Record<string, Line> = { ...STRINGS };
/** The merchant's pages bring their own words (src/client/i18n-my.ts). */
export function addStrings(more: Record<string, Line>): void {
  Object.assign(lines, more);
}

const stored = (): Lang | null => {
  try {
    const value = localStorage.getItem("tuan.lang");
    return value === "zh" || value === "en" ? value : null;
  } catch {
    return null;
  }
};

/** WeChat's own browser, WeCom's, and a mini program's pages all say so in the user agent. */
export const inWeChat = (): boolean => /MicroMessenger/i.test(navigator.userAgent);

let lang: Lang = stored() ?? (inWeChat() || /^zh\b/i.test(navigator.language || "zh") ? "zh" : "en");
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
  // (a merchant's word on a buyer's page would show as its key: tests/design.test.mjs makes sure none is asked for there)
  return (lines[key]?.[lang] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? "")).replace(/\(s\)/g, vars.n === 1 ? "" : "s");
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
