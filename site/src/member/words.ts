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
