// One restaurant as a card: photo (with who took it), name, lists it is on, why it was picked,
// Google's one-line description, the numbers, a pick with food-blogger links, wait, call and map.
import { CUISINES, type SoloReason } from "../../engine";
import type { CardView } from "../../room/protocol";
import { t, tx, type Key } from "../i18n";

export function waitKey(level: number): Key {
  return level === 2 ? "wait2" : level === 1 ? "wait1" : "wait0";
}

/** How many of our own post-meal ratings before we show them on the card. */
const OURS_MIN = 3;

export function PlaceCard({ c, reasons, children }: { c: CardView; reasons?: SoloReason[]; children?: preact.ComponentChildren }) {
  const p = c.place;
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  return (
    <article class="place" data-id={p.id}>
      {p.photo && (
        <figure class="photo">
          <img src={p.photo} alt="" loading="lazy" referrerpolicy="no-referrer" />
          {p.photoBy && (
            <figcaption>
              📷{" "}
              {p.photoBy.uri ? (
                <a href={p.photoBy.uri} target="_blank" rel="noopener">
                  {p.photoBy.name}
                </a>
              ) : (
                p.photoBy.name
              )}
            </figcaption>
          )}
        </figure>
      )}
      <div class="body">
        <h3>{p.name}</h3>
        {!!p.badges?.length && (
          <p class="badges">
            {p.badges.map((b, i) => {
              const label = `🏅 ${tx(b.label)}${b.year ? ` ${b.year}` : ""}`;
              return b.url ? (
                <a key={i} class="badge" href={b.url} target="_blank" rel="noopener">
                  {label}
                </a>
              ) : (
                <span key={i} class="badge">
                  {label}
                </span>
              );
            })}
          </p>
        )}
        {!!reasons?.length && (
          <p class="reasons">
            {reasons.map((r) => (
              <span key={r} class="reason">
                {t(`why_${r}` as Key)}
              </span>
            ))}
          </p>
        )}
        {p.about && <p class="about">{p.about}</p>}
        <p class="meta">
          <span>
            {CUISINES[p.cuisine].emoji} {tx(CUISINES[p.cuisine])}
          </span>
          {p.rating !== undefined && (
            <span>
              ★ {p.rating.toFixed(1)} <small class="muted">({t("ratings", { n: p.ratings ?? 0 })})</small>
            </span>
          )}
          {p.priceLabel && <span>{p.priceLabel}</span>}
          <span>
            {t(c.drive ? "drive" : "walk")} {t("min", { n: c.minutes })}
          </span>
        </p>
        {o && total >= OURS_MIN && <p class="ours small">{t("oursRating", { pct: Math.round((100 * o.up) / total), n: total })}</p>}
        <p class="wait">
          {t(waitKey(c.wait.level))}
          {c.wait.ours !== undefined && <small> {t("waitOurs", { n: c.wait.ours })}</small>}
          {c.wait.reasons.length > 0 && <small class="muted"> · {c.wait.reasons.map((r) => t(`waitWhy_${r}` as Key)).join("、")}</small>}
        </p>
        {p.waitQuote && (
          <blockquote class="quote">
            “{p.waitQuote.text}” <cite>— {p.waitQuote.author}, Google</cite>
          </blockquote>
        )}
        {p.recommend && (
          <div class="recommend">
            <p>
              <b>⭐ {t("recommendBy", { by: p.recommend.by ?? "changle" })}</b> {tx(p.recommend.note)}
            </p>
            {p.recommend.links.length > 0 && (
              <p class="rlinks">
                {p.recommend.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener">
                    {l.platform}
                    {l.title ? ` · ${l.title}` : ""} ↗
                  </a>
                ))}
              </p>
            )}
          </div>
        )}
        <p class="meta">
          {c.lastOrder !== undefined && <span>{c.lastOrder > 180 ? t("closesLate") : t("lastOrder", { n: Math.max(0, c.lastOrder) })}</span>}
          {p.reservable && <span>{t("reservable")}</span>}
        </p>
        {p.openNow === undefined && <p class="warn small">{t("hoursUnknown")}</p>}
        {c.relaxed && <p class="warn small">{t("relaxed")}</p>}
        {c.warnings
          .filter((w) => w.k !== "allergy" && w.k !== "custom")
          .map((w, i) => (
            <p key={i} class="warn small">
              {t(`warn_${w.k}` as Key)}
            </p>
          ))}
        <p class="links">
          {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{t("call")}</a>}
          {p.mapsUrl && (
            <a href={p.mapsUrl} target="_blank" rel="noopener">
              {t("map")}
            </a>
          )}
        </p>
        {children}
      </div>
    </article>
  );
}
