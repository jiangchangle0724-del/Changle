// One group buy as its merchant sees it: every order (who, how to reach them, what, where it
// goes, what it comes to), with the merchant's marks (confirmed, paid, handed over, cancelled,
// what the scale said), and the two sheets: what to get ready, and what goes where. Opening it
// counts as having been told of its new orders (the server stops the mail for them).
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { MyOfferPage, OfferMove, OrderMove } from "../../api";
import { BASE } from "../../base";
import { chainText, type ChainWords } from "../../engine/chain";
import { ordersCsv, type CsvWords } from "../../engine/csv";
import { ORDER_RE, tidyOrderCode } from "../../engine/ids";
import { lineAmount, MILLI } from "../../engine/money";
import { ARRIVED_NOTE_MAX } from "../../engine/offer";
import { leftOf } from "../../engine/order";
import { dueOf, summarize } from "../../engine/summary";
import { vancouverClock } from "../../engine/time";
import { UNITS, weighed, type Order, type Unit } from "../../engine/types";
import { ApiFail, getMyOffer, moveOffer, moveOrder, session } from "../api";
import { inWeChat, t, unitName, whenText } from "../i18n";
import { ArrivedNote, Copyable, CopyButton, IconBack, IconCheck, IconClock, Lines, money, Sheet, Toast, TopBar, useLang, useTitle } from "./common";
import { offerState, onReturn, shutOut, stateWord, troubleOf, TroublePanel, type Trouble } from "./My";
import { amountOf, caseText, dueAll, goodsText, ordersAt, phoneLink, phoneText, placesText } from "./sheets";

type Tab = "orders" | "goods" | "places";
type Filter = "all" | "new" | "unpaid" | "unpicked" | "cancelled";

/** Where an order goes, as "pickup:<point>" or "delivery:<area>": what the place filter chooses by. */
const placeKey = (order: Order): string => `${order.how}:${order.how === "pickup" ? order.pickupId : order.ruleId}`;

export function MyOfferView({ offerId }: { offerId: string }) {
  useLang();
  const [page, setPage] = useState<MyOfferPage | null>(null);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [filter, setFilter] = useState<Filter>("all");
  const [place, setPlace] = useState("");
  /** the order being changed right now (its code), or "offer" */
  const [busy, setBusy] = useState<string | null>(null);
  const [weighing, setWeighing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  /** in WeChat, which can't save a file: where to export it instead */
  const [elsewhere, setElsewhere] = useState(false);
  const [poster, setPoster] = useState(false);
  const [arriving, setArriving] = useState(false);
  // at the pickup point: what was typed or scanned (a buyer's pickup code opens this page with ?pick=<code>), or null
  const [picking, setPicking] = useState<string | null>(() => {
    const pick = new URLSearchParams(location.search).get("pick");
    return pick === null ? null : tidyOrderCode(pick);
  });
  useEffect(() => {
    // (the address loses it, so a reload doesn't open the sheet again)
    if (new URLSearchParams(location.search).has("pick")) history.replaceState(history.state, "", location.pathname);
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const skew = useRef(0);
  const shown = useRef(false);
  useTitle(page ? `${page.offer.title} · ${t("myTitle")}` : t("myTitle"));

  async function load() {
    if (!session()) {
      setPage(null);
      setTrouble("signin");
      return;
    }
    try {
      const got = await getMyOffer(offerId);
      skew.current = got.now - Date.now();
      shown.current = true;
      setPage(got);
      setTrouble(null);
    } catch (e) {
      const why = troubleOf(e);
      // once the orders are showing, a reading that fails for a moment leaves them and says so
      if (shown.current && !shutOut(why)) return setToast(t(why === "network" ? "netDown" : why === "down" ? "troubleDown" : "failed"));
      shown.current = false;
      setPage(null);
      setTrouble(why);
    }
  }
  useEffect(() => {
    void load();
    const stop = onReturn(() => void load());
    // new orders show up by themselves while the page is being looked at
    const timer = setInterval(() => document.visibilityState === "visible" && !document.querySelector(".sheet") && void load(), 60_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!page) {
    return (
      <div class="page">
        <TopBar />
        {trouble ? <TroublePanel trouble={trouble} onRetry={() => void load()} /> : <p class="loading">{t("loading")}</p>}
      </div>
    );
  }

  /** An order as the server now has it: into the list, and the sums done again from the orders. */
  const put = (order: Order) =>
    setPage((was) => {
      if (!was) return was;
      const orders = was.orders.map((one) => (one.code === order.code ? order : one));
      return { ...was, orders, summary: summarize(was, orders) };
    });

  async function act(order: Order, move: OrderMove): Promise<boolean> {
    setBusy(order.code);
    try {
      put((await moveOrder(order.code, move)).order);
      return true;
    } catch (e) {
      const code = e instanceof ApiFail ? e.code : "failed";
      setToast(t(code === "busy" ? "errMoveBusy" : code === "cancelled" ? "errCancelled" : code === "network" ? "netDown" : "failed"));
      if (code !== "network") void load();
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** The goods are in, said with a line on when and where (or taken back). */
  async function arrive(move: OfferMove) {
    setBusy("offer");
    try {
      setPage(await moveOffer(offerId, move));
      setArriving(false);
    } catch (e) {
      setToast(t(e instanceof ApiFail && e.code === "network" ? "netDown" : "failed"));
    }
    setBusy(null);
  }

  async function turn(what: "open" | "close") {
    setBusy("offer");
    try {
      setPage(await moveOffer(offerId, { do: what }));
    } catch (e) {
      setToast(t(e instanceof ApiFail && e.code === "network" ? "netDown" : "failed"));
    }
    setBusy(null);
    setClosing(false);
  }

  const now = Date.now() + skew.current;
  const { offer, summary } = page;
  const state = offerState(offer, now);
  const link = `${location.origin}${BASE}/t/${offer.id}`;
  const standing = page.orders.filter((order) => order.status !== "cancelled");
  const count: Record<Filter, number> = {
    all: standing.length,
    new: standing.filter((order) => order.status === "new").length,
    unpaid: standing.filter((order) => order.paidAt === null).length,
    unpicked: standing.filter((order) => order.pickedAt === null).length,
    cancelled: page.orders.length - standing.length,
  };
  /** An order's card, with what the merchant does to it: in the list, and at the pickup point. */
  const cardOf = (order: Order) => (
    <OrderCard
      key={order.code}
      order={order}
      place={placeName(order)}
      busy={busy !== null}
      onConfirm={() => void act(order, { do: "confirm" })}
      onPaid={() => void act(order, { do: "paid", on: order.paidAt === null })}
      onPicked={() => void act(order, { do: "picked", on: order.pickedAt === null })}
      onWeigh={() => setWeighing(order.code)}
      onCancel={() => setCancelling(order.code)}
    />
  );
  // items whose last case the orders haven't filled
  const short = summary.items.filter((item) => item.case !== null && item.case.part > 0).length;
  const passes = (order: Order): boolean =>
    (filter === "cancelled"
      ? order.status === "cancelled"
      : order.status !== "cancelled" && (filter === "all" || (filter === "new" && order.status === "new") || (filter === "unpaid" && order.paidAt === null) || (filter === "unpicked" && order.pickedAt === null))) &&
    (!place || placeKey(order) === place);
  const listed = page.orders.filter(passes);
  const placeName = (order: Order): string => (order.how === "pickup" ? page.points.find((point) => point.id === order.pickupId)?.name : page.rules.find((rule) => rule.id === order.ruleId)?.label) ?? "";
  const weighingOrder = page.orders.find((order) => order.code === weighing) ?? null;
  const cancellingOrder = page.orders.find((order) => order.code === cancelling) ?? null;

  return (
    <div class="page">
      <header class="bar">
        <a class="bar-back" href={`${BASE}/my`}>
          <IconBack />
          {t("myTitle")}
        </a>
        <button type="button" class="bar-lang" disabled={busy !== null} onClick={() => void load()}>
          {t("refresh")}
        </button>
      </header>

      <section class="hero hero-offer">
        <p class="shop-name">{page.shop.name}</p>
        <h1>{offer.title}</h1>
        <p class={`state ${state === "open" ? "state-open" : "state-shut"}`}>
          <IconClock />
          {stateWord(state)} · {t("closesAt", { when: whenText(offer.closesAt) })}
        </p>
        {/* a shop still waiting for the owner: its group buys aren't there for buyers yet, so there's no link to give */}
        {page.shop.status === "pending" && <p class="hint">{t("applyPendingOffer")}</p>}
        <div class="row">
          {state !== "draft" && page.shop.status !== "pending" && <CopyButton text={link} label={t("copyLink")} />}
          {/* sending it on: the text for a group chat, and a picture with a code to scan */}
          {state !== "draft" && page.shop.status !== "pending" && <CopyButton text={chainOf(page, link)} label={t("chainButton")} />}
          {state !== "draft" && page.shop.status !== "pending" && (
            <button type="button" class="btn btn-quiet btn-sm" onClick={() => setPoster(true)}>
              {t("posterButton")}
            </button>
          )}
          {state !== "draft" && page.shop.status !== "pending" && (
            <a class="btn btn-quiet btn-sm" href={`${BASE}/t/${offer.id}`}>
              {t("viewPublic")}
            </a>
          )}
          {state === "open" && (
            <button type="button" class="btn btn-quiet btn-sm" onClick={() => setClosing(true)}>
              {t("closeNow")}
            </button>
          )}
          {standing.length > 0 && (
            <button type="button" class="btn btn-quiet btn-sm" onClick={() => setPicking("")}>
              {t("pickButton")}
            </button>
          )}
          {state !== "draft" && page.shop.status !== "pending" && !offer.arrived && (
            <button type="button" class="btn btn-quiet btn-sm" onClick={() => setArriving(true)}>
              {t("arrivedButton")}
            </button>
          )}
          {state !== "open" && now < offer.closesAt && (
            <button type="button" class="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void turn("open")}>
              {t(state === "draft" ? "openDraft" : "reopen")}
            </button>
          )}
          <a class="btn btn-quiet btn-sm" href={`${BASE}/my/t/${offer.id}/edit`}>
            {t("editChange")}
          </a>
          <a class="btn btn-quiet btn-sm" href={`${BASE}/my/new/${page.shop.slug}?from=${offer.id}`}>
            {t("editAgain")}
          </a>
          <button type="button" class="btn btn-quiet btn-sm" onClick={() => (inWeChat() ? setElsewhere(true) : download(page))}>
            {t("csvButton")}
          </button>
        </div>
      </section>

      {/* buyers were told the goods are in: what they read, a note for the group, a change of words, or taking it back */}
      {offer.arrived && (
        <ArrivedNote line={t("arrivedSaid", { when: whenText(offer.arrived.at) })} note={offer.arrived.note}>
          <div class="row">
            <CopyButton text={arrivedText(page, link)} label={t("arrivedCopy")} />
            <button type="button" class="btn btn-quiet btn-sm" onClick={() => setArriving(true)}>
              {t("arrivedEdit")}
            </button>
            <button type="button" class="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => void arrive({ do: "unarrived" })}>
              {t("arrivedUndo")}
            </button>
          </div>
        </ArrivedNote>
      )}

      <dl class="stats">
        <div>
          <dt>{t("statOrders")}</dt>
          <dd>{summary.orders}</dd>
        </div>
        <div>
          <dt>{t("statFresh")}</dt>
          <dd class={count.new ? "stat-hot" : undefined}>{count.new}</dd>
        </div>
        <div>
          <dt>{t("statPaid")}</dt>
          <dd>
            {summary.paid}/{summary.orders}
          </dd>
        </div>
        <div>
          <dt>{t("statPicked")}</dt>
          <dd>
            {summary.picked}/{summary.orders}
          </dd>
        </div>
      </dl>
      <p class="hint center">
        {t(summary.unweighed ? "dueEstimate" : "due")} {money(dueAll(standing))} · {t("statPaid")} {money(summary.paidTotal)}
        {summary.unweighed > 0 && ` · ${t("statWeigh")} ${summary.unweighed}`}
      </p>
      {/* (an item that comes only by the case, its last case not full: worth a word in the group before orders close) */}
      {short > 0 && (
        <button type="button" class="link-btn case-warn" onClick={() => setTab("goods")}>
          {t("casesShort", { n: short })}
        </button>
      )}

      <div class="seg" role="group" aria-label={offer.title}>
        {(["orders", "goods", "places"] as const).map((one) => (
          <button type="button" key={one} class="seg-btn" aria-pressed={tab === one} onClick={() => setTab(one)}>
            {t(one === "orders" ? "tabOrders" : one === "goods" ? "tabGoods" : "tabPlaces")}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          <div class="filters" role="group" aria-label={t("tabOrders")}>
            {(["all", "new", "unpaid", "unpicked", "cancelled"] as const)
              .filter((one) => one !== "cancelled" || count.cancelled > 0)
              .map((one) => (
                <button type="button" key={one} class="tab" aria-pressed={filter === one} onClick={() => setFilter(one)}>
                  {t(one === "all" ? "filterAll" : one === "new" ? "filterNew" : one === "unpaid" ? "filterUnpaid" : one === "unpicked" ? "filterUnpicked" : "filterCancelled", { n: count[one] })}
                </button>
              ))}
          </div>
          {summary.places.length > 1 && (
            <label class="field">
              <span class="field-label">{t("placeLabel")}</span>
              <select name="place" value={place} onChange={(event) => setPlace(event.currentTarget.value)}>
                <option value="">{t("placeAll")}</option>
                {summary.places.map((one) => (
                  <option key={`${one.how}:${one.id}`} value={`${one.how}:${one.id}`}>
                    {t(one.how)} · {one.name} ({one.orders})
                  </option>
                ))}
              </select>
            </label>
          )}
          {page.orders.length === 0 ? (
            <p class="hint center">{t("noOrdersYet")}</p>
          ) : listed.length === 0 ? (
            <p class="hint center">{t("noneMatch")}</p>
          ) : (
            <ul class="orders">
              {listed.map(cardOf)}
            </ul>
          )}
        </>
      )}

      {tab === "goods" &&
        (summary.orders === 0 ? (
          <p class="hint center">{t("sheetEmpty")}</p>
        ) : (
          <section class="panel">
            <table class="sheet-table">
              <thead>
                <tr>
                  <th scope="col">{t("colItem")}</th>
                  <th scope="col">{t("colQty")}</th>
                  <th scope="col">{t("colOrders")}</th>
                  <th scope="col">{t("colAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item) => (
                  <tr key={item.itemId}>
                    <th scope="row">{item.name}</th>
                    <td>
                      {amountOf(item.unit, item.qty)}
                      {weighed(item.unit) && item.actual !== null && <span class="hint actual">{t("weighed", { w: amountOf(item.unit, item.actual) })}</span>}
                      {item.case && <span class={item.case.short ? "hint case-line case-line-short" : "hint case-line"}>{caseText(item.unit, item.case)}</span>}
                    </td>
                    <td>{item.orders}</td>
                    <td>{money(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl class="sums">
              <div>
                <dt>{t("goodsAsOrdered")}</dt>
                <dd>{money(summary.goods)}</dd>
              </div>
              {summary.fee > 0 && (
                <div>
                  <dt>{t("sheetFees")}</dt>
                  <dd>{money(summary.fee)}</dd>
                </div>
              )}
              <div class="sums-total">
                <dt>{t(summary.unweighed ? "dueEstimate" : "due")}</dt>
                <dd>{money(dueAll(standing))}</dd>
              </div>
            </dl>
            <CopyButton text={goodsText(page)} label={t("copySheet")} />
          </section>
        ))}

      {tab === "places" &&
        (summary.orders === 0 ? (
          <p class="hint center">{t("sheetEmpty")}</p>
        ) : (
          <>
            {summary.places.map((one) => (
              <section class="panel" key={`${one.how}:${one.id}`}>
                <div class="row-between">
                  <h2 class="panel-title">
                    {t(one.how)} · {one.name}
                  </h2>
                  <span class="hint">
                    {t("placeOrders", { n: one.orders })} · {money(dueAll(ordersAt(page, one.how, one.id)))}
                  </span>
                </div>
                <ul class="sum-lines">
                  {one.items.map((item) => (
                    <li key={item.itemId}>
                      <span>{item.name}</span>
                      <span>{amountOf(item.unit, item.qty)}</span>
                    </li>
                  ))}
                </ul>
                <ol class="who">
                  {ordersAt(page, one.how, one.id).map((order) => (
                    <li key={order.code}>
                      <span class="roster-n">{order.seq}</span>
                      <div class="who-what">
                        <strong>
                          {order.name} <span class="hint">{one.how === "pickup" ? `···· ${order.phone.slice(-4)}` : phoneText(order.phone)}</span>
                        </strong>
                        <span>{order.lines.map((line) => `${line.name} × ${amountOf(line.unit, line.qty)}`).join("、")}</span>
                        {one.how === "delivery" && <span class="hint">{order.address}</span>}
                        {order.note && <span class="hint">{t("orderNote", { note: order.note })}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            <CopyButton text={placesText(page)} label={t("copySheet")} />
          </>
        ))}

      <p class="foot">{t("footMoney")}</p>

      {weighingOrder && (
        <Weigh
          order={weighingOrder}
          busy={busy !== null}
          onClose={() => setWeighing(null)}
          onSave={async (lines) => {
            if (await act(weighingOrder, { do: "weigh", lines })) setWeighing(null);
          }}
        />
      )}

      {cancellingOrder && (
        <Sheet
          title={t("cancelOrderAsk", { name: cancellingOrder.name })}
          onClose={() => setCancelling(null)}
          footer={
            <div class="row">
              <button type="button" class="btn btn-quiet grow" onClick={() => setCancelling(null)}>
                {t("cancelNo")}
              </button>
              <button
                type="button"
                class="btn btn-danger"
                disabled={busy !== null}
                onClick={async () => {
                  await act(cancellingOrder, { do: "cancel" });
                  setCancelling(null);
                }}
              >
                {t("cancelYes")}
              </button>
            </div>
          }
        >
          <p>{t("cancelOrderBody")}</p>
        </Sheet>
      )}

      {closing && (
        <Sheet
          title={t("closeAsk")}
          onClose={() => setClosing(false)}
          footer={
            <div class="row">
              <button type="button" class="btn btn-quiet grow" onClick={() => setClosing(false)}>
                {t("closeNo")}
              </button>
              <button type="button" class="btn btn-danger" disabled={busy !== null} onClick={() => void turn("close")}>
                {t("closeYes")}
              </button>
            </div>
          }
        >
          <p>{t("closeBody")}</p>
        </Sheet>
      )}
      {poster && <PosterSheet page={page} link={link} onClose={() => setPoster(false)} />}
      {picking !== null && <PickSheet orders={page.orders} first={picking} render={cardOf} onClose={() => setPicking(null)} />}
      {arriving && <ArriveSheet first={offer.arrived?.note ?? ""} busy={busy !== null} onSend={(note) => void arrive({ do: "arrived", note })} onClose={() => setArriving(false)} />}
      {elsewhere && (
        <Sheet title={t("csvWeChatTitle")} onClose={() => setElsewhere(false)}>
          <p>{t("csvWeChat")}</p>
        </Sheet>
      )}
      <Toast text={toast} />
    </div>
  );
}

/** The words of the spreadsheet, in the reader's language. */
const chainWords = (page: MyOfferPage): ChainWords => ({
  closes: t("chainCloses", { when: whenText(page.offer.closesAt) }),
  link: (link) => t("chainLink", { link }),
  joined: (n) => t("chainJoined", { n }),
  none: t("chainNone"),
  least: (n) => t("chainLeast", { n }),
  perBuyer: (n) => t("chainPerBuyer", { n }),
  caseSize: (n) => t("chainCaseSize", { n }),
  caseShort: (n) => t("chainCaseShort", { n }),
  and: t("chainAnd"),
  unit: Object.fromEntries(UNITS.map((unit) => [unit, unitName(unit)])) as Record<Unit, string>,
});
/** A word for the group chat that the goods are in: the group buy, the merchant's line, its link. */
const arrivedText = (page: MyOfferPage, link: string): string => [`【${page.shop.name}】${page.offer.title}`, t("arrivedChain"), page.offer.arrived?.note ?? "", t("arrivedChainLink", { link })].filter(Boolean).join("\n");

/**
 * At the pickup point: an order found by its code (scanned from the buyer's pickup code, or typed) or
 * by the last digits of its phone number, as its card, to mark it paid and handed over.
 */
function PickSheet({ orders, first, render, onClose }: { orders: Order[]; first: string; render: (order: Order) => JSX.Element; onClose: () => void }) {
  const [typed, setTyped] = useState(first);
  const code = tidyOrderCode(typed);
  const digits = typed.replace(/[\s-]/g, "");
  const found =
    ORDER_RE.test(code) && orders.some((order) => order.code === code)
      ? orders.filter((order) => order.code === code)
      : /^\d{4,}$/.test(digits)
        ? orders.filter((order) => order.status !== "cancelled" && order.phone.endsWith(digits))
        : null;
  return (
    <Sheet title={t("pickTitle")} onClose={onClose}>
      <label class="field">
        <span class="field-label">{t("pickLabel")}</span>
        <input type="text" name="pick" maxLength={12} autocomplete="off" autocapitalize="characters" value={typed} onInput={(event) => setTyped(event.currentTarget.value)} />
        <span class="hint">{t("pickHint")}</span>
      </label>
      {found && (found.length ? <ul class="orders">{found.map(render)}</ul> : <p class="hint">{t("pickNone")}</p>)}
    </Sheet>
  );
}

/** Telling buyers the goods are in, with a line on when and where if there's one to say. */
function ArriveSheet({ first, busy, onSend, onClose }: { first: string; busy: boolean; onSend: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState(first);
  return (
    <Sheet
      title={t("arrivedSheetTitle")}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={() => onSend(note.trim())}>
          {t("arrivedSend")}
        </button>
      }
    >
      <label class="field">
        <span class="field-label">{t("arrivedNoteLabel")}</span>
        <textarea name="arrived-note" rows={3} maxLength={ARRIVED_NOTE_MAX} value={note} placeholder={t("arrivedNotePlaceholder")} onInput={(event) => setNote(event.currentTarget.value)} />
        <span class="hint">{t("arrivedNoteHint")}</span>
      </label>
    </Sheet>
  );
}

/** The text for a group chat (src/engine/chain.ts), in the merchant's language. */
const chainOf = (page: MyOfferPage, link: string): string => chainText(page, page.shop.name, page.orders, link, chainWords(page));

/**
 * A picture of the group buy to send on (src/client/ui/poster.ts, fetched when first asked for):
 * the first four goods that can still be had, and a code that opens the link. In WeChat it's saved
 * or sent by pressing and holding it; elsewhere also by a button.
 */
function PosterSheet({ page, link, onClose }: { page: MyOfferPage; link: string; onClose: () => void }) {
  useLang();
  const [made, setMade] = useState<{ url: string; file: File } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const { drawPoster } = await import("./poster");
        const open = page.items.filter((item) => (leftOf(item) ?? Infinity) >= item.least);
        const blob = await drawPoster({
          shop: page.shop.name,
          title: page.offer.title,
          closes: t("posterCloses", { when: whenText(page.offer.closesAt) }),
          items: open.map((item) => ({ name: item.name, price: `${money(item.price)} / ${unitName(item.unit)}`, photo: item.photo })),
          more: (n) => t("posterMore", { n }),
          link,
          scan: t("posterScan"),
          brand: t("posterBrand"),
        });
        // (a data: address, which the page's rules let a picture come from, and which WeChat saves on a long press)
        const url = await new Promise<string>((done, fail) => {
          const reader = new FileReader();
          reader.onload = () => done(String(reader.result));
          reader.onerror = () => fail(reader.error);
          reader.readAsDataURL(blob);
        });
        if (!gone) setMade({ url, file: new File([blob], `${page.offer.title} ${t("posterFile")}.png`, { type: "image/png" }) });
      } catch (e) {
        console.error("tuan poster", e);
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
    };
  }, []);
  const sendable = made !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [made.file] });
  return (
    <Sheet title={t("posterTitle")} onClose={onClose}>
      {failed ? (
        <p class="problem">{t("posterFailed")}</p>
      ) : !made ? (
        <p class="loading">{t("posterBusy")}</p>
      ) : (
        <>
          <img class="poster-img" src={made.url} alt={page.offer.title} width={1080} height={1440} />
          <p class="hint">{t("posterHold")}</p>
          {!inWeChat() && (
            <div class="row">
              <a class="btn btn-primary btn-sm" href={made.url} download={made.file.name}>
                {t("posterSave")}
              </a>
              {sendable && (
                <button type="button" class="btn btn-quiet btn-sm" onClick={() => void navigator.share({ files: [made.file], title: page.offer.title }).catch(() => undefined)}>
                  {t("posterShare")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

const csvWords = (): CsvWords => ({
  headers: t("csvHeaders").split(","),
  status: { new: t("statFresh"), confirmed: t("doneConfirm"), cancelled: t("statusCancelled") },
  how: { pickup: t("pickup"), delivery: t("delivery") },
  unit: Object.fromEntries(UNITS.map((unit) => [unit, unitName(unit)])) as Record<Unit, string>,
  yes: t("csvYes"),
});

/** Save the orders as a spreadsheet (CSV, which Excel, Numbers and Google Sheets open): "本周大米团 订单 2026-11-14.csv". */
function download(page: MyOfferPage) {
  const text = ordersCsv(page, page.orders, csvWords());
  const title = page.offer.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 60);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  link.download = `${title} ${t("csvFile")} ${vancouverClock(page.now).slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

function OrderCard({
  order,
  place,
  busy,
  onConfirm,
  onPaid,
  onPicked,
  onWeigh,
  onCancel,
}: {
  order: Order;
  place: string;
  busy: boolean;
  onConfirm: () => void;
  onPaid: () => void;
  onPicked: () => void;
  onWeigh: () => void;
  onCancel: () => void;
}) {
  const gone = order.status === "cancelled";
  const byWeight = order.lines.some((line) => weighed(line.unit));
  return (
    <li class={`order${gone ? " order-gone" : ""}`}>
      <div class="order-head">
        <span class="order-n">{order.seq}</span>
        <div class="order-who">
          <strong>{order.name}</strong>
          <span class="hint">
            {order.code} · {whenText(order.createdAt)}
          </span>
        </div>
        <span class={`chip${gone ? " chip-bad" : order.status === "confirmed" ? " chip-good" : " chip-new"}`}>{t(gone ? "statusCancelled" : order.status === "confirmed" ? "doneConfirm" : "statFresh")}</span>
      </div>

      <div class="row">
        <a class="btn btn-quiet btn-sm" href={phoneLink(order.phone)} aria-label={t("callPhone", { name: order.name })}>
          {phoneText(order.phone)}
        </a>
        {order.wechat && <CopyButton text={order.wechat} label={t("copyWechat", { id: order.wechat })} />}
      </div>

      <div class="fact">
        <h3>
          {t(order.how)} · {place}
        </h3>
        {order.how === "delivery" && <Copyable text={order.address} label={t("copyAddress")} />}
        {order.note && <Lines text={t("orderNote", { note: order.note })} />}
      </div>

      <ul class="sum-lines">
        {order.lines.map((line) => (
          <li key={line.itemId}>
            <span>
              {line.name}{" "}
              <span class="hint">
                × {amountOf(line.unit, line.qty)}
                {line.actual !== null && ` · ${t("weighed", { w: amountOf(line.unit, line.actual) })}`}
              </span>
            </span>
            <span>{money(lineAmount(line.price, line.actual ?? line.qty))}</span>
          </li>
        ))}
      </ul>
      <dl class="sums">
        {order.fee > 0 && (
          <div>
            <dt>{t("fee")}</dt>
            <dd>{money(order.fee)}</dd>
          </div>
        )}
        <div class="sums-total">
          <dt>{t(order.final === null ? "dueEstimate" : "due")}</dt>
          <dd>{money(dueOf(order))}</dd>
        </div>
      </dl>

      {!gone && (
        <div class="row">
          {order.status === "new" && (
            <button type="button" class="btn btn-primary btn-sm" disabled={busy} onClick={onConfirm}>
              {t("confirm")}
            </button>
          )}
          <button type="button" class="btn btn-quiet btn-sm" aria-pressed={order.paidAt !== null} disabled={busy} onClick={onPaid}>
            {order.paidAt !== null && <IconCheck size={18} />}
            {t("statPaid")}
          </button>
          <button type="button" class="btn btn-quiet btn-sm" aria-pressed={order.pickedAt !== null} disabled={busy} onClick={onPicked}>
            {order.pickedAt !== null && <IconCheck size={18} />}
            {t("statPicked")}
          </button>
          {byWeight && (
            <button type="button" class="btn btn-quiet btn-sm" disabled={busy} onClick={onWeigh}>
              {t("weigh")}
            </button>
          )}
          <button type="button" class="link-btn danger" disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      )}
    </li>
  );
}

/** What the scale said, for each thing in the order sold by weight. Empty means not weighed yet. */
function Weigh({ order, busy, onSave, onClose }: { order: Order; busy: boolean; onSave: (lines: { itemId: string; actual: number | null }[]) => void; onClose: () => void }) {
  const lines = order.lines.filter((line) => weighed(line.unit));
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.itemId, line.actual === null ? "" : String(line.actual / MILLI)])));
  /** thousandths of a pound, null for empty, NaN for something that isn't a weight */
  const read = (text: string): number | null => {
    const tidy = text.trim().replace(",", ".");
    if (!tidy) return null;
    const pounds = /^\d{1,3}(\.\d{0,3})?$/.test(tidy) ? Number(tidy) : NaN;
    return Number.isNaN(pounds) || pounds > 999 ? NaN : Math.round(pounds * MILLI);
  };
  const weights = lines.map((line) => ({ itemId: line.itemId, actual: read(typed[line.itemId] ?? "") }));
  const bad = weights.some((weight) => Number.isNaN(weight.actual));
  return (
    <Sheet
      title={t("weighTitle", { name: order.name })}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={busy || bad} onClick={() => onSave(weights)}>
          {t("weighSave")}
        </button>
      }
    >
      <p class="hint">{t("weighHint")}</p>
      {lines.map((line) => {
        const actual = read(typed[line.itemId] ?? "");
        const wrong = Number.isNaN(actual);
        return (
          <label class="field" key={line.itemId}>
            <span class="field-label">
              {line.name} · {t("weighOrdered", { w: amountOf(line.unit, line.qty) })}
            </span>
            <input type="text" name={`w-${line.itemId}`} inputMode="decimal" maxLength={7} autocomplete="off" placeholder="lb" value={typed[line.itemId] ?? ""} aria-invalid={wrong ? "true" : undefined} onInput={(event) => setTyped({ ...typed, [line.itemId]: event.currentTarget.value })} />
            {wrong ? <span class="problem">{t("weighBad")}</span> : actual !== null && <span class="hint">{money(lineAmount(line.price, actual))}</span>}
          </label>
        );
      })}
    </Sheet>
  );
}
