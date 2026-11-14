// A merchant's home: their shops and the group buys in each, with what's waiting. Signed in with
// their changle.ca account (the site keeps the sign-in on the phone; these pages share its
// storage). Not signed in: a button to the site's sign-in, and the page looks again on return.
// The site's owner also gets the panel that sets shops up and starts group buys by hand (Owner.tsx).
import { useEffect, useState } from "preact/hooks";
import type { MyHome, MyOffer } from "../../api";
import { BASE } from "../../base";
import { ApiFail, getMy, session } from "../api";
import { t, whenText } from "../i18n";
import { IconNext, IconPlus, money, TopBar, useLang, useTitle } from "./common";
import { OwnerPanel } from "./Owner";

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

/** What a merchant's page says in place of its content. */
export function TroublePanel({ trouble, onRetry }: { trouble: Trouble; onRetry: () => void }) {
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

      {trouble && (!home || shutOut(trouble)) ? <TroublePanel trouble={trouble} onRetry={() => void load()} /> : !home && <p class="loading">{t("loading")}</p>}

      {home && home.shops.length === 0 && <p class="hint">{t("noShops", { email: home.me.email })}</p>}
      {home?.shops.map((shop) => (
        <section class="panel" key={shop.slug}>
          <div class="row-between">
            <h2 class="panel-title">{shop.name}</h2>
            {shop.status !== "live" && <span class="chip chip-bad">{t(shop.status === "paused" ? "shopPaused" : "shopPending")}</span>}
          </div>
          {shop.offers.length === 0 ? (
            <p class="hint">{t("noOffers")}</p>
          ) : (
            <ul class="mine">
              {shop.offers.map((offer) => {
                const state = offerState(offer, home.now);
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
          <a class="btn btn-quiet btn-block" href={`${BASE}/my/new/${shop.slug}`}>
            <IconPlus size={18} />
            {t("editNew")}
          </a>
        </section>
      ))}

      {home?.me.owner && <OwnerPanel home={home} onChange={() => void load()} />}
      <p class="foot">{t("footMoney")}</p>
    </div>
  );
}
