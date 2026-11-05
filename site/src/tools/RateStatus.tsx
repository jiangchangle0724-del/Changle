import { WifiOff } from "lucide-react";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import type { FxState } from "./fx";

/** The same connection notice for both tools; cached conversions stay on screen below it. */
export function RateStatus({ fx, showAge = false }: { fx: FxState & { refresh: () => void }; showAge?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (fx.error) return <EmptyState icon={WifiOff} tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} body={showAge && fx.at ? updatedText(fx.at, lang) : undefined} action={{ label: zh ? "再试一次" : "Try again", onClick: fx.refresh }} />;
  if (fx.loading && !fx.rates) return <Skeleton lang={lang} lines={3} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />;
  return null;
}

export function updatedText(at: number, lang: "zh" | "en") {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return lang === "zh" ? "刚刚更新" : "Updated just now";
  const rtf = new Intl.RelativeTimeFormat(lang === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  const when = mins < 60 ? rtf.format(-mins, "minute") : mins < 60 * 48 ? rtf.format(-Math.round(mins / 60), "hour") : rtf.format(-Math.round(mins / 1440), "day");
  return lang === "zh" ? `${when}更新` : `Updated ${when}`;
}
