// A merchant's home: their shops and the group buys in each, with what's waiting. Signed in with
// their changle.ca account (the site keeps the sign-in on the phone; these pages share its
// storage). Not signed in: a button to the site's sign-in, and the page looks again on return.
// An account that runs no shop asks for one here (Apply.tsx); a shop it asked for says where the
// asking stands. The site's owner answers the applications at the top (Review.tsx), and also gets
// the panel that sets shops up and starts group buys by hand (Owner.tsx).
import { useEffect, useState } from "preact/hooks";
import type { Application, MyHome, MyOffer, MyShop } from "../../api";
import { BASE } from "../../base";
import { ApiFail, getMy, session } from "../api";
import { t, whenText, type Key } from "../i18n";
import { ApplyPanel, Asked } from "./Apply";
import { IconNext, IconPlus, money, TopBar, useLang, useTitle } from "./common";
import { OwnerPanel } from "./Owner";
import { Review } from "./Review";

/** Why a merchant's page can't show what it's for. `signin`: nobody is signed in on this phone; `stale`: the sign-in it has is no longer good. */
export type Trouble = "signin" | "stale" | "forbidden" | "notfound" | "down" | "limit" | "network" | "failed";
export function troubleOf(e: unknown): Trouble {
  const code = e instanceof ApiFail ? e.code : "failed";
  return code === "signin" ? "stale" : code === "forbidden" || code === "notfound" || code === "down" || code === "limit" || code === "network" ? code : "failed";
}
/** Is this trouble about who's asking (so nothing they were shown should stay on the screen)? */
export const shutOut = (trouble: Trouble): boolean => trouble === "signin" || trouble === "stale" || trouble === "forbidden" || trouble === "notfound";

/** Run `again` whenever this page is looked at again: back from signing in, back from another app. Returns how to stop. */
export function onReturn(again: () => void): () => void {
  const seen = () => document.visibilityState === "visible" && again();
  const shown = (event: PageTransitionEvent) => event.persisted && again();
  document.addEventListener("visibilitychange", seen);
  window.addEventListener("pageshow", shown);
  return () => {
    document.removeEventListener("visibilitychange", seen);
    window.removeEventListener("pageshow", shown);
  };
}

/** What a merchant's page says in place of its content. `home`: it's the merchant's home, where a shop is asked for. */
export function TroublePanel({ trouble, onRetry, home = false }: { trouble: Trouble; onRetry: () => void; home?: boolean }) {
  if (trouble === "signin" || trouble === "stale") {
    return (
      <section class="panel">
        <h2 class="panel-title">{t("signInTitle")}</h2>
        {trouble === "stale" && (
          <p class="problem" role="alert">
            {t("signInStale")}
          </p>
        )}
        <p>{t("signInBody")}</p>
        {home && <p class="hint">{t("signInApply")}</p>}
        <a class="btn btn-primary" href="/login">
          {t("signInGo")}
        </a>
      </section>
    );
  }
  return (
    <div class="empty">
      <p>{t(trouble === "forbidden" ? "troubleForbidden" : trouble === "notfound" ? "troubleMissing" : trouble === "down" ? "troubleDown" : trouble === "limit" ? "limit" : trouble === "network" ? "netDown" : "failed")}</p>
      {trouble === "forbidden" || trouble === "notfound" ? (
        <a class="btn btn-quiet" href={`${BASE}/my`}>
          {t("myTitle")}
        </a>
      ) : (
        <button type="button" class="btn btn-quiet" onClick={onRetry}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}

/** Draft, taking orders, or closed (by the merchant or by the clock). */
export const offerState = (offer: Pick<MyOffer, "status" | "closesAt">, now: number): "draft" | "open" | "closed" => (offer.status === "draft" ? "draft" : offer.status === "open" && now < offer.closesAt ? "open" : "closed");
export const stateWord = (state: "draft" | "open" | "closed"): string => t(state === "draft" ? "stateDraft" : state === "open" ? "stateOpen" : "stateClosed");

/** The chip on a shop that isn't taking orders: paused, or still asking (waiting, sent back, turned down). */
function chipOf(shop: MyShop, asked: Application | undefined): Key | null {
  if (shop.status === "live") return null;
  if (shop.status === "paused") return "shopPaused";
  if (asked?.state === "returned") return "applyChipReturned";
  if (asked?.state === "declined") return "applyChipDeclined";
  return "shopPending";
}

/** One shop on the merchant's home: where its asking stands, if it asked; its group buys; starting one; what it says. */
function ShopPanel({ shop, asked, email, now, onChange }: { shop: MyShop; asked: Application | undefined; email: string; now: number; onChange: () => void }) {
  const chip = chipOf(shop, asked);
  const declined = asked?.state === "declined";
  return (
    <section class="panel">
      <div class="row-between">
        <h2 class="panel-title">{shop.name}</h2>
        {chip && <span class="chip chip-bad">{t(chip)}</span>}
      </div>
      {asked && <Asked application={asked} email={email} onSent={onChange} />}
      {declined ? null : shop.offers.length === 0 ? (
        <p class="hint">{t("noOffers")}</p>
      ) : (
        <ul class="mine">
          {shop.offers.map((offer) => {
            const state = offerState(offer, now);
            return (
              <li key={offer.id}>
                <a href={`${BASE}/my/t/${offer.id}`}>
                  <span class="mine-what">
                    <strong>{offer.title}</strong>
                    <span class="hint">
                      {stateWord(state)} · {t("closesAt", { when: whenText(offer.closesAt) })}
                    </span>
                    <span class="hint">
                      {t("offerRow", { n: offer.orders, m: money(offer.total) })}
                      {offer.fresh > 0 && <strong class="fresh"> · {t("offerFresh", { n: offer.fresh })}</strong>}
                    </span>
                  </span>
                  <IconNext />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {!declined && (
        <a class="btn btn-quiet btn-block" href={`${BASE}/my/new/${shop.slug}`}>
          <IconPlus size={18} />
          {t("editNew")}
        </a>
      )}
      {/* (a shop still asking has no page yet, and what it says is changed in the asking itself) */}
      {!asked && (
        <div class="row">
          <a class="btn btn-quiet btn-sm" href={`${BASE}/my/s/${shop.slug}`}>
            {t("shopEditTitle")}
          </a>
          {shop.status !== "pending" && (
            <a class="btn btn-quiet btn-sm" href={`${BASE}/s/${shop.slug}`}>
              {t("shopViewPublic")}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export function My() {
  useLang();
  useTitle(t("myTitle"));
  const [home, setHome] = useState<MyHome | null>(null);
  const [trouble, setTrouble] = useState<Trouble | null>(null);

  async function load() {
    if (!session()) {
      setHome(null);
      setTrouble("signin");
      return;
    }
    try {
      setHome(await getMy());
      setTrouble(null);
    } catch (e) {
      const why = troubleOf(e);
      if (shutOut(why)) setHome(null);
      setTrouble(why);
    }
  }
  useEffect(() => {
    void load();
    return onReturn(() => void load());
  }, []);

  return (
    <div class="page">
      <TopBar />
      <section class="hero">
        <h1>{t("myTitle")}</h1>
        {home && <p class="hint">{t("signedInAs", { name: home.me.name, email: home.me.email })}</p>}
      </section>

      {trouble && (!home || shutOut(trouble)) ? <TroublePanel trouble={trouble} onRetry={() => void load()} home /> : !home && <p class="loading">{t("loading")}</p>}

      {home?.applications && home.applications.length > 0 && <Review applications={home.applications} onChange={() => void load()} />}
      {home && home.shops.length === 0 && (home.me.owner ? <p class="hint">{t("noShops", { email: home.me.email })}</p> : <ApplyPanel onSent={() => void load()} />)}
      {home?.shops.map((shop) => (
        // (the asking, as the merchant who sent it sees it: the owner answers it in the list above)
        <ShopPanel key={shop.slug} shop={shop} asked={home.me.owner ? undefined : shop.application} email={home.me.email} now={home.now} onChange={() => void load()} />
      ))}

      {home?.me.owner && <OwnerPanel home={home} onChange={() => void load()} />}
      <p class="foot">{t("footMoney")}</p>
    </div>
  );
}
