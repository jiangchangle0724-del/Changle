// One restaurant on the list: its place on it, photo (with who took it), name, a short intro
// (cuisine, what it mainly serves, price), how far on foot and by car, what speaks for it and why it
// may be further down (with what can still be ordered), Google's descriptions, wait, call and map,
// and ordering it in. Further down the list a card starts short (`compact`) and opens with "More".
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CUISINES, DISHES, avoidTip, type Place } from "../../engine";
import type { CardView } from "../../room/protocol";
import { getLang, t, tx, type Key } from "../i18n";
import { serverNow } from "../store";
import { timeLabel } from "../when";
import { allergenWord } from "./common";
import { Delivery } from "./Delivery";

export function waitKey(level: number): Key {
  return level === 2 ? "wait2" : level === 1 ? "wait1" : "wait0";
}

/** How many of our own post-meal ratings before we show them on the card. */
const OURS_MIN = 3;

/** "650 米", "1.2 公里", "18 公里". */
export function distance(m: number): string {
  if (m < 1000) return t("distM", { n: m });
  return t("distKm", { n: m < 10_000 ? (m / 1000).toFixed(1) : Math.round(m / 1000) });
}

/** "人均 $15–25", "人均 $100 起", or Google's "$$" when it gives no numbers. */
function price(p: Place): string | undefined {
  if (p.price !== undefined && p.priceTo !== undefined) return t("priceRange", { a: p.price, b: p.priceTo });
  if (p.priceLabel) return p.priceLabel;
  if (p.price !== undefined) return t("priceFrom", { a: p.price });
  return undefined;
}

/** The short intro: cuisine, what it mainly serves (unless the cuisine already says it), price. */
function intro(p: Place): string {
  const cu = CUISINES[p.cuisine];
  const kind = tx(cu);
  const parts = [`${cu.emoji} ${kind}`];
  const dishes = (p.dishes ?? []).flatMap((d) => (DISHES[d] ? [tx(DISHES[d])] : [])).filter((d) => !kind.toLowerCase().includes(d.toLowerCase()));
  if (dishes.length) parts.push(t("mainly", { what: dishes.join(getLang() === "zh" ? "、" : ", ") }));
  const pr = price(p);
  if (pr) parts.push(pr);
  return parts.join(" · ");
}

/** Why it is further down for this table, and what can still be ordered there. */
function notes(c: CardView): { text: string; severe: boolean }[] {
  const out: { text: string; severe: boolean }[] = [];
  for (const x of c.concerns) {
    if (x.k === "allergy") {
      const what = allergenWord(x.allergen);
      if (x.level === "severe") out.push({ text: t("note_severe", { what }), severe: true });
      else out.push({ text: t("note_avoid", { what, tip: tx(avoidTip(x.allergen, c.place.cuisine)) }), severe: false });
    } else if (x.k === "halal") out.push({ text: t(x.likely ? "note_halalLikely" : "note_halal"), severe: false });
    else out.push({ text: t(x.known ? "note_vegNone" : "note_vegUnsure"), severe: false });
  }
  if (c.bans > 0) out.push({ text: c.bans === 1 ? t("note_ban1") : t("note_banN", { n: c.bans }), severe: false });
  return out;
}

export function PlaceCard({ c, ranked, compact, children }: { c: CardView; ranked?: boolean; compact?: boolean; children?: ComponentChildren }) {
  const [open, setOpen] = useState(!compact);
  const p = c.place;
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  const walk = c.walkMin > 60 ? t("walkFar") : t("walkMin", { n: c.walkMin });
  const drive = t("driveMin", { n: c.driveMin });
  // Now: minutes until last orders. Planned: when it closes then.
  const last = c.at === undefined && c.lastOrderAt !== undefined ? Math.round((c.lastOrderAt - serverNow()) / 60_000) : undefined;
  const until = c.at !== undefined ? c.closesAt : undefined;
  const lines = notes(c);
  return (
    <article class={`place${compact ? " compact" : ""}`} data-id={p.id} data-rank={c.rank}>
      {open && p.photo && (
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
        <div class="head">
          {ranked && (
            <span class="rank num" role="img" aria-label={t("rank", { n: c.rank })}>
              {c.rank}
            </span>
          )}
          <h3>{p.name}</h3>
        </div>
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
        <p class="intro">{intro(p)}</p>
        <p class="meta facts">
          {p.rating !== undefined && (
            <span>
              ★ {p.rating.toFixed(1)} <small class="muted">({t("ratings", { n: p.ratings ?? 0 })})</small>
            </span>
          )}
          <span>📍 {distance(c.meters)}</span>
          <span>{c.drive ? drive : walk}</span>
          <span>{c.drive ? walk : drive}</span>
        </p>
        {!!c.reasons.length && (
          <p class="reasons">
            {c.reasons.map((r) => (
              <span key={r} class="reason">
                {r === "liked" ? (c.likes === 1 ? t("why_liked1") : t("why_likedN", { n: c.likes })) : t(`why_${r}` as Key)}
              </span>
            ))}
          </p>
        )}
        {lines.map((l, i) => (
          <p key={i} class={`note small${l.severe ? " severe" : ""}`}>
            {l.text}
          </p>
        ))}
        {open && (
          <>
            {p.about && <p class="about">{p.about}</p>}
            {p.summary && (
              <div class="summary">
                <p>{p.summary.text}</p>
                <p class="small muted">
                  ✨ {p.summary.disclosure}
                  {p.summary.flag && (
                    <>
                      {" · "}
                      <a class="flag" href={p.summary.flag} target="_blank" rel="noopener">
                        {t("flagSummary")}
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}
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
            {(last !== undefined || until !== undefined || p.reservable) && (
              <p class="meta">
                {last !== undefined && <span>{last > 180 ? t("closesLate") : t("lastOrder", { n: Math.max(0, last) })}</span>}
                {until !== undefined && <span>{t("openUntil", { time: timeLabel(until) })}</span>}
                {p.reservable && <span>{t("reservable")}</span>}
              </p>
            )}
            {c.open === undefined && <p class="warn small">{t(c.at !== undefined ? "hoursUnknownThen" : "hoursUnknown")}</p>}
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
            <Delivery name={p.name} />
          </>
        )}
        {compact && (
          <button type="button" class="btn quiet more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? `${t("lessInfo")} ▴` : `${t("moreInfo")} ▾`}
          </button>
        )}
        {children}
      </div>
    </article>
  );
}
