/** The words membership shows in both languages (the member page, the account page, the back office). */
import type { Lang } from "../i18n";
import { COUNTED, type Counted, type Tier } from "../shared/member";

export const TOOL_NAMES: Record<Counted, { zh: string; en: string }> = {
  suibian: { zh: "随便", en: "Whatever's Fine" },
  split: { zh: "两清", en: "All Square" },
  moneylens: { zh: "MoneyLens", en: "MoneyLens" },
};

/** what one use of each tool is */
export const TOOL_USE: Record<Counted, { zh: string; en: string }> = {
  suibian: { zh: "开一桌", en: "opening a table" },
  split: { zh: "开一个账本", en: "starting a ledger" },
  moneylens: { zh: "导入一份账单", en: "importing a statement" },
};

export function tierName(t: Tier, lang: Lang): string {
  const zh = lang === "zh";
  if (t === "month") return zh ? "月付" : "Monthly";
  if (t === "year") return zh ? "年付" : "Yearly";
  if (t === "life") return zh ? "终身" : "Lifetime";
  return zh ? "站长送的" : "A gift";
}

export function dayText(ms: number, lang: Lang): string {
  return new Date(ms).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Vancouver" });
}

export function untilText(until: number | null, lang: Lang): string {
  if (until === null) return lang === "zh" ? "终身有效" : "For life";
  return lang === "zh" ? `到 ${dayText(until, lang)}` : `Until ${dayText(until, lang)}`;
}

/** free uses left of each tool, in one line */
export function leftText(left: Record<Counted, number>, lang: Lang): string {
  const zh = lang === "zh";
  const parts = COUNTED.map((t) => (zh ? `${TOOL_NAMES[t].zh} ${left[t]} 次` : `${TOOL_NAMES[t].en} ${left[t]}`));
  return zh ? `免费还剩：${parts.join("，")}` : `Free uses left: ${parts.join(", ")}`;
}

export function cad(n: number): string {
  return `C$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** what came back when paying didn't go ahead (worker/stripe.ts, hub.ts stripeRoute) */
export function payWhy(code: string, lang: Lang): string {
  const zh = lang === "zh";
  switch (code) {
    case "closed":
      return zh ? "付款暂时没开" : "Payments aren't open right now";
    case "life":
      return zh ? "你已经是终身会员了" : "You're already a lifetime member";
    case "subscribed":
      return zh ? "你已经在订阅了。换方案或取消，点“管理付款”" : "You already subscribe. To switch or cancel, tap Manage payments";
    case "full":
      return zh ? "终身的 5 个都卖完了" : "All 5 lifetime memberships are taken";
    case "pending":
      return zh ? "你的终身会员付款还在确认" : "Your lifetime payment is still being confirmed";
    case "none":
      return zh ? "还没有付款记录" : "No payments yet";
    case "slow-down":
      return zh ? "点得太快了，等一下再试" : "Too many tries. Wait a moment";
    default:
      return code.startsWith("stripe") ? (zh ? "付款服务没连上，过一会儿再试" : "Couldn't reach the payment service. Try again shortly") : zh ? "没成功，再试一次" : "That didn't go through. Try again";
  }
}

/** a subscription's next step, after the membership's end date */
export function renewText(sub: { status: string; cancelAtEnd: boolean }, lang: Lang): string {
  const zh = lang === "zh";
  if (sub.status === "past_due") return zh ? "续费没付上，点“管理付款”换一张卡" : "The renewal didn't go through. Tap Manage payments to change your card";
  if (sub.cancelAtEnd) return zh ? "到期不再续费" : "Won't renew";
  return zh ? "到期自动续费" : "Renews automatically";
}
