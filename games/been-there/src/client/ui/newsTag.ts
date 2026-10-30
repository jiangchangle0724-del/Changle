// A piece of travel news in a few characters, for its tag on the city's square ("×2", "−25%").
import type { NewsItem } from "../../engine";

export function newsTag(item: NewsItem): string {
  if (item.fee) return `+$${item.fee}`;
  if (item.buy) return `−${Math.round((1 - item.buy) * 100)}%`;
  if (item.rent === 0.5) return "½";
  return `×${item.rent}`;
}
