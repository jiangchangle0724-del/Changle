// Travel news in force (the lobby switch): what's happening, what it does in the game, how long it
// has left, and the real thing behind it with its source. On phones in the play tab; on the big
// screen in the side panel.
import { newsById, type GameState, type NewsItem } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { t, tx } from "../i18n";
import { hostOf } from "./common";

/** The news in force, and the rounds it has left (counting this one). */
export function currentNews(s: GameState): { item: NewsItem; left: number } | null {
  if (!s.cfg.news || !s.news) return null;
  const item = newsById(s.news.id);
  if (!item) return null;
  const round = Math.max(1, s.ps.filter((p) => !p.out).length);
  return { item, left: Math.max(1, Math.ceil((s.news.until - s.turns) / round)) };
}

/** How the news changes a city, short enough for a tag on the board: ×2, ½, +$20, −25%. */
export function newsTag(item: NewsItem): string {
  if (item.fee) return `+$${item.fee}`;
  if (item.buy) return `−${Math.round((1 - item.buy) * 100)}%`;
  if (item.rent === 0.5) return "½";
  return `×${item.rent}`;
}

export function NewsBanner({ v, big }: { v: RoomView; big?: boolean }) {
  const now = currentNews(v.game!.s);
  if (!now) return null;
  const { item, left } = now;
  return (
    <article class={`news${big ? " big" : ""}`} key={item.id}>
      <p class="pass-strip">
        <span>{t("stripNews")}</span>
        <span>{left > 1 ? t("newsLeft", { n: left }) : t("newsLast")}</span>
      </p>
      <div class="news-body">
        <h3>
          {tx(item.title)} <b class="news-tag num">{newsTag(item)}</b>
        </h3>
        <p class="news-rule">{tx(item.text)}</p>
        <p class="news-fact">
          {tx(item.basis)}{" "}
          <a href={item.source} target="_blank" rel="noopener noreferrer">
            {t("triviaSource")} · {hostOf(item.source)}
          </a>
        </p>
      </div>
    </article>
  );
}
