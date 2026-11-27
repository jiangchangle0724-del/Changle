// Home: what's open now, to browse and search. The group buys open at the shops that are shown
// here (a merchant can keep theirs off: ShopEdit.tsx), soonest to close first, as cards with their
// first picture; the shops; this phone's own orders; the way in for merchants and for anyone with
// an order code. A buyer mostly arrives by a merchant's link; this is where the site's Tools tab
// leads, and where someone looks for what else is on.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { HomeOffer, HomePage, HomeShop } from "../../api";
import { BASE } from "../../base";
import { ORDER_RE, tidyOrderCode } from "../../engine/ids";
import type { ShopKind } from "../../engine/types";
import { getHome, myOrders, photoUrl } from "../api";
import { leftText, t, whenText, type Key } from "../i18n";
import { IconNext, money, TopBar, useLang, useTitle } from "./common";

const KINDS: Record<ShopKind, Key> = { leader: "kindLeader", kitchen: "kindKitchen", farm: "kindFarm" };
const DAY = 24 * 60 * 60 * 1000;

/** Whether what's typed is in any of these words (case and width set aside, as a buyer types). */
const has = (query: string, ...words: string[]) => words.some((word) => word.normalize("NFKC").toLowerCase().includes(query));

export function Home() {
  useLang();
  const [page, setPage] = useState<HomePage | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ShopKind | null>(null);
  const hero = useRef<HTMLElement>(null);
  /** Searching from further down: back up to where what's found begins, under the search. */
  const toFound = () => {
    const top = (hero.current?.getBoundingClientRect().bottom ?? 0) + scrollY;
    if (scrollY > top) scrollTo({ top });
  };

  useEffect(() => {
    getHome().then(setPage, () => setFailed(true));
  }, []);

  const q = query.normalize("NFKC").trim().toLowerCase();
  const offers = useMemo(() => (page?.offers ?? []).filter((offer) => (!kind || offer.shop.kind === kind) && (!q || has(q, offer.title, offer.shop.name, ...offer.goods))), [page, kind, q]);
  const shops = useMemo(() => (page?.shops ?? []).filter((shop) => (!kind || shop.kind === kind) && (!q || has(q, shop.name, shop.about))), [page, kind, q]);
  // (a kind is offered only where there's something of it)
  const kinds = (Object.keys(KINDS) as ShopKind[]).filter((each) => page?.shops.some((shop) => shop.kind === each));
  // (nothing open and no shop: nothing to search)
  const bare = page !== null && !page.offers.length && !page.shops.length;

  return (
    <div class="page page-home">
      <TopBar />
      <section class="hero" ref={hero}>
        <h1>{t("homeTitle")}</h1>
        <p>{t("homeLine")}</p>
      </section>

      {!bare && (
        <div class="finder">
          <label class="search">
            <IconSearch />
            <input
              type="search"
              name="q"
              enterKeyHint="search"
              autocomplete="off"
              aria-label={t("homeSearch")}
              placeholder={t("homeSearch")}
              value={query}
              onInput={(event) => {
                toFound();
                setQuery(event.currentTarget.value);
              }}
              // (the keyboard's search key puts the keyboard away: what's found is already there)
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            />
          </label>
          {kinds.length > 1 && (
            <div class="tabs home-kinds" role="group" aria-label={t("homeKinds")}>
              <button
                type="button"
                class="tab"
                aria-pressed={kind === null}
                onClick={() => {
                  toFound();
                  setKind(null);
                }}
              >
                {t("homeAll")}
              </button>
              {kinds.map((each) => (
                <button
                  key={each}
                  type="button"
                  class="tab"
                  aria-pressed={kind === each}
                  onClick={() => {
                    toFound();
                    setKind(kind === each ? null : each);
                  }}
                >
                  {t(KINDS[each])}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Mine />

      <section class="home-block" aria-labelledby="home-open">
        <h2 class="home-title" id="home-open">
          {t("homeOpen")}
          {page && offers.length > 0 && <span class="home-count">{offers.length}</span>}
        </h2>
        {!page ? (
          failed ? (
            <p class="problem">{t("homeFailed")}</p>
          ) : (
            // (the shape of what's coming, while it comes)
            <div class="deck" role="status" aria-label={t("loading")}>
              <span class="deal-ghost" />
              <span class="deal-ghost" />
            </div>
          )
        ) : offers.length ? (
          <ul class="deck">
            {offers.map((offer, at) => (
              <Deal key={offer.id} offer={offer} now={page.now} at={at} />
            ))}
          </ul>
        ) : q || kind ? (
          <p class="hint home-none">{t("homeNothing")}</p>
        ) : (
          <div class="home-empty">
            <IconBasket />
            <strong>{t("homeEmptyTitle")}</strong>
            <p class="hint">{page.shops.length ? t("homeEmptyShops") : t("homeEmptyBody")}</p>
          </div>
        )}
      </section>

      {shops.length > 0 && (
        <section class="home-block" aria-labelledby="home-shops">
          <h2 class="home-title" id="home-shops">
            {t("homeShops")}
          </h2>
          <ul class="shops">
            {shops.map((shop) => (
              <ShopRow key={shop.slug} shop={shop} />
            ))}
          </ul>
        </section>
      )}

      <section class="panel home-cta">
        <h2 class="panel-title">{t("homeCta")}</h2>
        <p>{t("homeCtaLine")}</p>
        <a class="btn btn-primary" href={`${BASE}/my`}>
          {t("homeCtaButton")}
        </a>
        <a class="link-btn" href={`${BASE}/my`}>
          {t("myLink")}
        </a>
      </section>

      <FindOrder />

      <p class="foot">{t("footMoney")}</p>
    </div>
  );
}

/** A group buy open now: its first picture across the top, what it is, whose, when it closes, how it gets to you. `at`: its place in the list (the first few come up one after another). */
function Deal({ offer, now, at }: { offer: HomeOffer; now: number; at: number }) {
  const left = offer.closesAt - now;
  const goods = offer.goods.slice(0, 4).join(t("homeAnd"));
  return (
    <li style={{ "--at": Math.min(at, 6) }}>
      <a class="deal-link" href={`${BASE}/t/${offer.id}`}>
        <span class={offer.photo ? "deal-cover" : "deal-cover deal-cover-plain"}>
          {offer.photo ? (
            <img src={photoUrl(offer.photo, false)} alt="" loading="lazy" decoding="async" />
          ) : (
            <span class="deal-initial" aria-hidden="true">
              {[...offer.shop.name.trim()][0] ?? ""}
            </span>
          )}
          <span class="deal-badges">
            {left < DAY && <span class="badge badge-soon">{t("closesIn", { left: leftText(left) })}</span>}
            {offer.freeFrom !== null && <span class="badge">{t("homeFree", { amount: money(offer.freeFrom) })}</span>}
          </span>
        </span>
        <span class="deal-body">
          <strong class="deal-title">{offer.title}</strong>
          <span class="deal-shop">
            {offer.shop.name} · {t(KINDS[offer.shop.kind])}
          </span>
          <span class="deal-meta">
            {t("closesAt", { when: whenText(offer.closesAt) })}
            {offer.orders !== null && offer.orders > 0 && ` · ${t("homeOrders", { n: offer.orders })}`}
          </span>
          {goods && <span class="deal-goods">{offer.items > 4 ? t("homeGoodsMore", { goods, n: offer.items }) : goods}</span>}
          <span class="deal-tags">
            {offer.pickups > 0 && <span class="item-tag">{t("homePickups", { n: offer.pickups })}</span>}
            {offer.areas.length > 0 && <span class="item-tag">{t("homeDelivers", { areas: offer.areas.slice(0, 3).join(t("homeAnd")) + (offer.areas.length > 3 ? "…" : "") })}</span>}
            {offer.weighed && <span class="item-tag">{t("homeWeighed")}</span>}
          </span>
        </span>
      </a>
    </li>
  );
}

function ShopRow({ shop }: { shop: HomeShop }) {
  const first = shop.about.split("\n").find((line) => line.trim()) ?? "";
  return (
    <li>
      <a class="shop-row" href={`${BASE}/s/${shop.slug}`}>
        <span class="shop-initial" aria-hidden="true">
          {[...shop.name.trim()][0] ?? ""}
        </span>
        <span class="shop-what">
          <strong>{shop.name}</strong>
          {first && <span class="shop-about">{first}</span>}
          <span class="hint">
            {t(KINDS[shop.kind])} · {shop.open ? t("homeShopOpen", { n: shop.open }) : t("homeShopQuiet")}
          </span>
        </span>
        <IconNext />
      </a>
    </li>
  );
}

/** This phone's orders, newest first, sideways: the way back to each. */
function Mine() {
  const orders = myOrders();
  if (!orders.length) return null;
  return (
    <section class="home-block" aria-labelledby="home-mine">
      <h2 class="home-title" id="home-mine">
        {t("myOrders")}
      </h2>
      <ul class="again">
        {orders.map((order) => (
          <li key={order.code}>
            <a class="again-card" href={`${BASE}/o/${order.code}`}>
              <strong>{order.title}</strong>
              <span class="hint">
                {order.shop} · {whenText(order.at)}
              </span>
              <span class="code again-code">{order.code}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FindOrder() {
  const [code, setCode] = useState("");
  const tidy = tidyOrderCode(code);
  return (
    <form
      class="panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (ORDER_RE.test(tidy)) location.assign(`${BASE}/o/${tidy}`);
      }}
    >
      <h2 class="panel-title">{t("findOrder")}</h2>
      <label class="field">
        <span class="field-label">{t("codeLabel")}</span>
        <input type="text" name="code" maxLength={8} autocomplete="off" autocapitalize="characters" class="code-input" value={code} onInput={(event) => setCode(event.currentTarget.value)} />
        <span class="hint">{t("findHint")}</span>
      </label>
      <button type="submit" class="btn btn-quiet" disabled={!ORDER_RE.test(tidy)}>
        {t("open")}
      </button>
    </form>
  );
}

function IconBasket() {
  return (
    <svg class="home-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 10l3-6M18 10l-3-6" />
      <path d="M3 10h18l-1.8 8.4A2 2 0 0 1 17.2 20H6.8a2 2 0 0 1-2-1.6z" />
      <path d="M9 14v2.5M12 14v2.5M15 14v2.5" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function NotFound() {
  useLang();
  useTitle(t("notFoundTitle"));
  return (
    <div class="page">
      <TopBar />
      <div class="empty">
        <h1>{t("notFoundTitle")}</h1>
        <p>{t("notFoundBody")}</p>
        <a class="btn btn-quiet" href={`${BASE}/`}>
          {t("brand")}
        </a>
      </div>
    </div>
  );
}
