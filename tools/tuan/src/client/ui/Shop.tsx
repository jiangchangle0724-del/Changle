// A shop's own page (/tuan/s/<shop>), for buyers: who the shop is (what kind, about them, how to
// reach them and pay them, their permit, on the first screen), and their group buys: the ones
// taking orders, then the earlier ones.
import { useEffect, useState } from "preact/hooks";
import type { ShopPage } from "../../api";
import { BASE } from "../../base";
import { ApiFail, getShop } from "../api";
import { t, whenText } from "../i18n";
import { Copyable, emailIn, IconNext, Lines, TopBar, useLang, useTitle } from "./common";

const kindWord = (kind: ShopPage["shop"]["kind"]) => t(kind === "kitchen" ? "kindKitchen" : kind === "farm" ? "kindFarm" : "kindLeader");

export function ShopView({ slug }: { slug: string }) {
  useLang();
  const [page, setPage] = useState<ShopPage | null>(null);
  const [problem, setProblem] = useState<"gone" | "network" | "failed" | null>(null);
  useTitle(problem === "gone" ? t("shopGoneTitle") : page ? page.shop.name : null);

  async function load() {
    try {
      setPage(await getShop(slug));
      setProblem(null);
    } catch (e) {
      const why = e instanceof ApiFail ? e.code : "failed";
      setProblem(why === "notfound" ? "gone" : why === "network" ? "network" : "failed");
    }
  }
  useEffect(() => void load(), []);

  if (problem === "gone") {
    return (
      <div class="page">
        <TopBar />
        <div class="empty">
          <h1>{t("shopGoneTitle")}</h1>
          <p>{t("shopGoneBody")}</p>
          <a class="btn btn-quiet" href={`${BASE}/`}>
            {t("brand")}
          </a>
        </div>
      </div>
    );
  }
  if (!page) {
    return (
      <div class="page">
        <TopBar />
        {problem ? (
          <div class="empty">
            <p>{t(problem === "network" ? "netDown" : "failed")}</p>
            <button type="button" class="btn btn-quiet" onClick={() => void load()}>
              {t("retry")}
            </button>
          </div>
        ) : (
          <p class="loading">{t("loading")}</p>
        )}
      </div>
    );
  }

  const { shop } = page;
  // the one that closes soonest first; the earlier ones, the latest first (as they come)
  const open = page.offers.filter((offer) => offer.state === "open").sort((a, b) => a.closesAt - b.closesAt);
  const past = page.offers.filter((offer) => offer.state !== "open");
  const row = (offer: ShopPage["offers"][number]) => (
    <li key={offer.id}>
      <a href={`${BASE}/t/${offer.id}`}>
        <span class="mine-what">
          <strong>{offer.title}</strong>
          <span class="hint">{offer.state === "open" ? t("closesAt", { when: whenText(offer.closesAt) }) : offer.state === "paused" ? t("paused") : t("closed")}</span>
        </span>
        <IconNext />
      </a>
    </li>
  );
  return (
    <div class="page">
      <TopBar />
      <section class="hero">
        <p class="shop-name">{kindWord(shop.kind)}</p>
        <h1>{shop.name}</h1>
        {shop.about && <Lines text={shop.about} class="offer-note" />}
      </section>

      <section class="panel">
        {shop.permit && (
          <div class="fact">
            <h3>{t("permit")}</h3>
            <Lines text={shop.permit} />
          </div>
        )}
        {shop.contact && (
          <div class="fact">
            <h3>{t("contact")}</h3>
            <Copyable text={shop.contact} label={t("copyContact")} />
          </div>
        )}
        {shop.pay && (
          <div class="fact">
            <h3>{t("howToPay")}</h3>
            <Copyable text={shop.pay} copy={emailIn(shop.pay) ?? shop.pay} label={t(emailIn(shop.pay) ? "copyEmail" : "copyPay")} />
          </div>
        )}
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("shopOpen")}</h2>
        {open.length ? <ul class="mine">{open.map(row)}</ul> : <p class="hint">{t("shopNone")}</p>}
      </section>
      {past.length > 0 && (
        <section class="panel">
          <h2 class="panel-title">{t("shopPast")}</h2>
          <ul class="mine">{past.map(row)}</ul>
        </section>
      )}

      <p class="foot">{t("footMoney")}</p>
    </div>
  );
}
