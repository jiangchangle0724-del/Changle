/** "just now", "5 min ago", "yesterday"... in either language. */
export function ago(at: number, lang: "zh" | "en") {
  const s = Math.max(0, (Date.now() - at) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  if (s < 60) return lang === "zh" ? "刚刚" : "just now";
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (s < 86400 * 7) return rtf.format(-Math.round(s / 86400), "day");
  return new Date(at).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-CA", { month: "short", day: "numeric", year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Clock time for a chat bubble. */
export function clockOf(at: number, lang: "zh" | "en") {
  return new Date(at).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-CA", { hour: "numeric", minute: "2-digit" });
}
