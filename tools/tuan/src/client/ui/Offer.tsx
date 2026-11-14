// A group buy's own page: the goods by section, a picker for anything sold by weight, the cart at
// the bottom, who's in, and checkout on one screen. The same page changes an order that was placed
// from this phone (…/t/<group buy>?change=<order code>).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { OfferPage, OrderInput, OrderPage, PublicItem } from "../../api";
import { BASE } from "../../base";
import { lineAmount, MILLI, QTY_MAX } from "../../engine/money";
import { deliveryFee } from "../../engine/order";
import { phoneDigits } from "../../engine/phone";
import { weighed, type DeliveryRule, type How } from "../../engine/types";
import { ApiFail, changeOrder, getOffer, getOrder, newKey, placeOrder, rememberOrder, saveCart, savedCart, savedMe, saveMe, tailOf, type Cart } from "../api";
import { leftText, t, unitName, whenText } from "../i18n";
import { Copyable, emailIn, IconBack, IconClock, IconNext, IconPin, IconPlus, Lines, money, priceText, qtyText, Sheet, Stepper, Toast, TopBar, useLang, useTitle } from "./common";

interface Line {
  item: PublicItem;
  qty: number;
  amount: number;
}

/** The most of an item this buyer can take: what's left (plus what their own order already holds), the limit per buyer, 99. */
function most(item: PublicItem, held: number): number {
  let max = QTY_MAX;
  if (item.left !== null) max = Math.min(max, item.left + held);
  if (item.perBuyer !== null) max = Math.min(max, item.perBuyer);
  return Math.floor(max / item.step) * item.step;
}
/** An amount as it can be ordered: whole steps, no more than `most`, and nothing at all under the item's least. */
function settle(item: PublicItem, qty: number, held: number): number {
  const fit = Math.min(most(item, held), Math.round(qty / item.step) * item.step);
  return fit < item.least ? 0 : fit;
}

const ruleText = (rule: DeliveryRule): string =>
  [rule.min > 0 ? t("minLine", { m: money(rule.min) }) : "", rule.fee > 0 ? t("feeLine", { m: money(rule.fee) }) : t("freeLine"), rule.fee > 0 && rule.freeFrom !== null ? t("freeFromLine", { m: money(rule.freeFrom) }) : "", rule.hours]
    .filter(Boolean)
    .join(" · ");

export function OfferView({ offerId, changeCode }: { offerId: string; changeCode: string | null }) {
  useLang();
  const [page, setPage] = useState<OfferPage | null>(null);
  const [problem, setProblem] = useState<"gone" | "network" | "failed" | null>(null);
  const [cart, setCartState] = useState<Cart>(() => (changeCode ? {} : savedCart(offerId)));
  /** the order being changed, when this page was opened to change one */
  const [changing, setChanging] = useState<OrderPage | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: Cart } | null>(null);
  const [section, setSection] = useState("");
  const chips = useRef<HTMLElement>(null);
  const [tick, setTick] = useState(0);
  const skew = useRef(0);
  /** what's been typed at checkout: kept while the buyer goes back to the goods for one more thing */
  const typed = useRef<Typed | null>(null);

  const held = useMemo(() => new Map((changing?.order.status === "cancelled" ? [] : (changing?.order.lines ?? [])).map((line) => [line.itemId, line.qty])), [changing]);
  const setCart = (next: Cart) => {
    setCartState(next);
    if (!changeCode) saveCart(offerId, next);
  };

  async function load(): Promise<OfferPage | null> {
    try {
      const got = await getOffer(offerId);
      skew.current = got.now - Date.now();
      setPage(got);
      setProblem(null);
      return got;
    } catch (e) {
      const why = e instanceof ApiFail ? e.code : "failed";
      // (once the page is showing, a reading that fails leaves it as it is)
      setProblem((was) => (page ? was : why === "notfound" ? "gone" : why === "network" ? "network" : "failed"));
      return null;
    }
  }

  useEffect(() => {
    void (async () => {
      const got = await load();
      if (!got || !changeCode) return;
      // changing an order placed from this phone: the cart starts as what the order holds
      const tail = tailOf(changeCode);
      try {
        if (!tail) throw new ApiFail("notfound");
        const order = await getOrder(changeCode, tail);
        if (order.offer.id !== offerId || !order.mayChange) throw new ApiFail("paid");
        setChanging(order);
        setCartState(Object.fromEntries(order.order.lines.map((line) => [line.itemId, line.qty])));
      } catch {
        location.replace(`${BASE}/o/${changeCode}`);
      }
    })();
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // what the cart holds is kept to what can be ordered now (something may have sold out since)
  useEffect(() => {
    if (!page) return;
    const fit: Cart = {};
    for (const item of page.items) {
      const qty = settle(item, cart[item.id] ?? 0, held.get(item.id) ?? 0);
      if (qty > 0) fit[item.id] = qty;
    }
    if (JSON.stringify(fit) !== JSON.stringify(cart)) setCart(fit);
  }, [page, held]);

  // a toast goes away by itself
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // checkout is a screen of its own: the phone's back button returns to the goods (its step in
  // the history is there the moment the screen is, as a sheet's is)
  useLayoutEffect(() => {
    if (!checkout) return;
    // (from the cart, the cart's own step in the history has already become this one)
    if (!history.state?.checkout) history.pushState({ ...history.state, checkout: true }, "");
    window.scrollTo(0, 0);
    let byBack = false;
    const back = () => {
      byBack = true;
      setCheckout(false);
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (!byBack && history.state?.checkout) history.back();
    };
  }, [checkout]);

  useTitle(problem === "gone" ? t("goneTitle") : !page ? null : changing ? t("changeTitle", { code: changing.order.code }) : checkout ? t("checkoutTitle") : `${page.offer.title} · ${page.shop.name}`);

  const sections = useMemo(() => {
    const names: string[] = [];
    for (const item of page?.items ?? []) if (!names.includes(item.section)) names.push(item.section);
    return names;
  }, [page]);

  // the section chip follows the scroll
  useEffect(() => {
    if (sections.length < 2 || checkout) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = sections[0];
        for (const name of sections) {
          const el = document.getElementById(`sec-${sections.indexOf(name)}`);
          if (el && el.getBoundingClientRect().top < 140) current = name;
        }
        setSection(current);
      });
    };
    follow();
    window.addEventListener("scroll", follow, { passive: true });
    return () => {
      window.removeEventListener("scroll", follow);
      cancelAnimationFrame(frame);
    };
  }, [sections, checkout]);

  // the lit chip stays in sight in its strip (the strip alone moves: the page keeps its place)
  useEffect(() => {
    const strip = chips.current;
    const lit = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !lit) return;
    const left = lit.offsetLeft - (strip.clientWidth - lit.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [section]);

  if (problem === "gone") {
    return (
      <div class="page">
        <TopBar />
        <div class="empty">
          <h1>{t("goneTitle")}</h1>
          <p>{t("goneBody")}</p>
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
  if (changeCode && !changing) {
    return (
      <div class="page">
        <TopBar />
        <p class="loading">{t("loading")}</p>
      </div>
    );
  }

  void tick;
  const now = Date.now() + skew.current;
  const open = page.offer.state === "open" && now < page.offer.closesAt;
  const lines: Line[] = page.items.filter((item) => (cart[item.id] ?? 0) > 0).map((item) => ({ item, qty: cart[item.id], amount: lineAmount(item.price, cart[item.id]) }));
  const goods = lines.reduce((sum, line) => sum + line.amount, 0);
  const pieces = lines.reduce((sum, line) => sum + (weighed(line.item.unit) ? 1 : line.qty / MILLI), 0);
  const estimate = lines.some((line) => weighed(line.item.unit));
  const heldOf = (item: PublicItem) => held.get(item.id) ?? 0;

  const setQty = (item: PublicItem, qty: number) => {
    const next = { ...cart };
    const fit = settle(item, qty, heldOf(item));
    if (fit > 0) next[item.id] = fit;
    else delete next[item.id];
    setCart(next);
  };
  const less = (item: PublicItem) => setQty(item, (cart[item.id] ?? 0) - item.step);
  const more = (item: PublicItem) => setQty(item, Math.max(item.least, (cart[item.id] ?? 0) + item.step));
  const canMore = (item: PublicItem) => Math.max(item.least, (cart[item.id] ?? 0) + item.step) <= most(item, heldOf(item));
  const pickingItem = page.items.find((item) => item.id === picking) ?? null;

  /** The server said some things can't be had in these amounts: take what's left, and show the goods again. */
  const adjust = async (items: { id: string; left: number }[], text: string) => {
    const next = { ...cart };
    for (const { id, left } of items) {
      const item = page.items.find((i) => i.id === id);
      const fit = item ? settle({ ...item, left: null, perBuyer: null }, left, 0) : 0;
      if (fit > 0) next[id] = Math.min(next[id] ?? 0, fit);
      else delete next[id];
    }
    setCart(next);
    setCheckout(false);
    setToast({ text });
    await load();
  };

  if (checkout) {
    return (
      <Checkout
        page={page}
        lines={lines}
        goods={goods}
        estimate={estimate}
        changing={changing}
        typed={typed.current}
        onTyped={(now) => (typed.current = now)}
        onBack={() => setCheckout(false)}
        onAdjust={adjust}
        onClosed={async () => {
          setCheckout(false);
          setToast({ text: t("errClosed") });
          await load();
        }}
        onDone={(order) => {
          rememberOrder({ code: order.order.code, tail: order.order.tail, offerId, title: order.offer.title, shop: order.shop.name, at: order.order.createdAt });
          if (!changeCode) saveCart(offerId, {});
          location.assign(`${BASE}/o/${order.order.code}${changeCode ? "" : "?new=1"}`);
        }}
      />
    );
  }

  return (
    <div class={`page${lines.length && open ? " page-with-dock" : ""}`}>
      <TopBar />

      <section class="hero hero-offer">
        <p class="shop-name">{page.shop.name}</p>
        <h1>{changing ? t("changeTitle", { code: changing.order.code }) : page.offer.title}</h1>
        {changing && <p class="hint">{page.offer.title}</p>}
        {changing && (
          <a class="link-btn" href={`${BASE}/o/${changing.order.code}`}>
            {t("leaveAsIs")}
          </a>
        )}
        <p class={`state ${open ? "state-open" : "state-shut"}`}>
          <IconClock />
          {page.offer.state === "paused" ? t("paused") : open ? `${t("closesAt", { when: whenText(page.offer.closesAt) })} · ${t("closesIn", { left: leftText(page.offer.closesAt - now) })}` : t("closed")}
        </p>
        {!open && <p class="hint">{page.offer.state === "paused" ? t("pausedLine") : t("closedLine")}</p>}
        {page.offer.note && !changing && <Lines text={page.offer.note} class="offer-note" />}
        <button type="button" class="how-chip" onClick={() => setHowOpen(true)}>
          <IconPin />
          <span>{[page.points.length ? t("pickupCount", { n: page.points.length }) : "", page.rules.length ? t("deliveryCount", { n: page.rules.length }) : ""].filter(Boolean).join(" · ")}</span>
          <IconNext size={16} />
        </button>
      </section>

      {sections.length > 1 && (
        <nav class="tabs" aria-label={t("goods")} ref={chips}>
          {sections.map((name, at) => (
            <button
              type="button"
              key={name}
              class="tab"
              aria-current={section === name ? "true" : undefined}
              onClick={() => document.getElementById(`sec-${at}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}
            >
              {name || t("all")}
            </button>
          ))}
        </nav>
      )}

      {sections.map((name, at) => (
        <section key={name} id={`sec-${at}`} class="section">
          {sections.length > 1 && <h2 class="section-title">{name || t("all")}</h2>}
          <ul class="items">
            {page.items
              .filter((item) => item.section === name)
              .map((item) => (
                <ItemRow key={item.id} item={item} qty={cart[item.id] ?? 0} room={most(item, heldOf(item))} open={open} canMore={canMore(item)} onLess={() => less(item)} onMore={() => more(item)} onPick={() => setPicking(item.id)} />
              ))}
          </ul>
        </section>
      ))}

      {page.offer.roster !== "off" && !changing && (
        <section class="panel">
          <div class="row-between">
            <h2 class="panel-title">{t("roster")}</h2>
            {page.orders > 0 && <span class="hint">{t("rosterCount", { n: page.orders })}</span>}
          </div>
          <Roster page={page} />
        </section>
      )}

      {!changing && (
        <section class="panel">
          <h2 class="panel-title">{page.shop.name}</h2>
          <p class="hint">{t(page.shop.kind === "kitchen" ? "kindKitchen" : page.shop.kind === "farm" ? "kindFarm" : "kindLeader")}</p>
          {page.shop.about && <Lines text={page.shop.about} />}
          {page.shop.contact && (
            <div class="fact">
              <h3>{t("contact")}</h3>
              <Copyable text={page.shop.contact} label={t("copyContact")} />
            </div>
          )}
          {page.shop.pay && (
            <div class="fact">
              <h3>{t("howToPay")}</h3>
              <Copyable text={page.shop.pay} copy={emailIn(page.shop.pay) ?? page.shop.pay} label={t(emailIn(page.shop.pay) ? "copyEmail" : "copyPay")} />
            </div>
          )}
          {page.shop.permit && (
            <div class="fact">
              <h3>{t("permit")}</h3>
              <Lines text={page.shop.permit} />
            </div>
          )}
        </section>
      )}

      <p class="foot">{t("footMoney")}</p>

      {lines.length > 0 && open && (
        <div class="dock">
          <button type="button" class="dock-cart" onClick={() => setCartOpen(true)}>
            <span class="dock-count">{t("cartCount", { n: pieces })}</span>
            <span class="dock-total">
              {estimate ? `${t("estimate")} ` : ""}
              {money(goods)}
            </span>
          </button>
          <button type="button" class="btn btn-primary" onClick={() => setCheckout(true)}>
            {t("checkout")}
          </button>
        </div>
      )}

      {pickingItem && <Picker item={pickingItem} qty={cart[pickingItem.id] ?? 0} max={most(pickingItem, heldOf(pickingItem))} onSet={(qty) => setQty(pickingItem, qty)} onClose={() => setPicking(null)} />}

      {cartOpen && (
        <Sheet
          title={t("cart")}
          onClose={() => setCartOpen(false)}
          footer={
            lines.length > 0 && (
              <button
                type="button"
                class="btn btn-primary btn-block btn-lg"
                onClick={() => {
                  // the cart's step in the history becomes checkout's: back from checkout shows the goods
                  history.replaceState({ ...history.state, sheet: false, checkout: true }, "");
                  setCartOpen(false);
                  setCheckout(true);
                }}
              >
                {t("checkout")} · {estimate ? `${t("estimate")} ` : ""}
                {money(goods)}
              </button>
            )
          }
        >
          {lines.length === 0 ? (
            <p class="hint">{t("cartEmpty")}</p>
          ) : (
            <>
              <ul class="cart-lines">
                {lines.map(({ item, qty, amount }) => (
                  <li key={item.id} class="cart-line">
                    <div class="cart-what">
                      <span class="cart-name">{item.name}</span>
                      <span class="hint">{priceText(item.price, item.unit)}</span>
                    </div>
                    <Stepper text={qtyText(item.unit, qty)} lessLabel={t("less", { name: item.name })} moreLabel={t("more", { name: item.name })} onLess={() => less(item)} onMore={() => more(item)} canMore={canMore(item)} />
                    <span class="cart-amount">{money(amount)}</span>
                  </li>
                ))}
              </ul>
              {estimate && <p class="hint">{t("weighNote")}</p>}
              <button
                type="button"
                class="link-btn danger"
                onClick={() => {
                  setToast({ text: t("cleared"), undo: cart });
                  setCart({});
                  setCartOpen(false);
                }}
              >
                {t("clear")}
              </button>
            </>
          )}
        </Sheet>
      )}

      {howOpen && (
        <Sheet title={t("howToGet")} onClose={() => setHowOpen(false)}>
          {page.points.length > 0 && (
            <div class="fact">
              <h3>{t("pickup")}</h3>
              <ul class="places">
                {page.points.map((point) => (
                  <li key={point.id}>
                    <strong>{point.name}</strong>
                    {point.address && <Lines text={point.address} class="hint" />}
                    {point.hours && <span class="hint">{point.hours}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {page.rules.length > 0 && (
            <div class="fact">
              <h3>{t("delivery")}</h3>
              <ul class="places">
                {page.rules.map((rule) => (
                  <li key={rule.id}>
                    <strong>{rule.label}</strong>
                    <span class="hint">{ruleText(rule)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Sheet>
      )}

      <Toast
        text={toast?.text ?? null}
        action={toast?.undo ? t("undo") : undefined}
        onAction={() => {
          if (toast?.undo) setCart(toast.undo);
          setToast(null);
        }}
      />
    </div>
  );
}

function ItemRow({ item, qty, room, open, canMore, onLess, onMore, onPick }: { item: PublicItem; qty: number; room: number; open: boolean; canMore: boolean; onLess: () => void; onMore: () => void; onPick: () => void }) {
  const byWeight = weighed(item.unit);
  const gone = room < item.least;
  return (
    <li class={`item${gone ? " item-gone" : ""}`}>
      {item.photo ? <img class="item-photo" src={item.photo} alt="" loading="lazy" decoding="async" /> : <span class="item-photo item-nophoto" aria-hidden="true">{Array.from(item.name)[0]}</span>}
      <div class="item-what">
        <h3 class="item-name">{item.name}</h3>
        {item.detail && <p class="item-detail">{item.detail}</p>}
        {item.allergens && <p class="item-note">{t("allergens", { a: item.allergens })}</p>}
        <p class="item-price">
          <strong>{money(item.price)}</strong>
          <span> / {unitName(item.unit)}</span>
          {item.least > item.step && <span class="item-tag">{t("leastLine", { n: qtyText(item.unit, item.least) })}</span>}
          {item.perBuyer !== null && <span class="item-tag">{t("perBuyer", { n: qtyText(item.unit, item.perBuyer) })}</span>}
          {gone ? <span class="item-tag item-tag-warn">{t("soldOut")}</span> : item.left !== null && item.left <= 5 * MILLI && <span class="item-tag item-tag-warn">{t("left", { n: qtyText(item.unit, item.left) })}</span>}
        </p>
      </div>
      {open &&
        !gone &&
        (byWeight ? (
          <button type="button" class={`add${qty ? " add-has" : ""}`} aria-label={t("choose", { name: item.name })} onClick={onPick}>
            {qty ? qtyText(item.unit, qty) : <IconPlus />}
          </button>
        ) : qty ? (
          <Stepper text={qtyText(item.unit, qty)} lessLabel={t("less", { name: item.name })} moreLabel={t("more", { name: item.name })} onLess={onLess} onMore={onMore} canMore={canMore} />
        ) : (
          <button type="button" class="add" aria-label={t("add", { name: item.name })} onClick={onMore}>
            <IconPlus />
          </button>
        ))}
    </li>
  );
}

/** How much of something sold by weight: half a pound at a time, a few amounts to tap, and what it comes to. */
function Picker({ item, qty, max, onSet, onClose }: { item: PublicItem; qty: number; max: number; onSet: (qty: number) => void; onClose: () => void }) {
  const [amount, setAmount] = useState(qty || item.least);
  const fit = (value: number) => Math.max(item.least, Math.min(max, Math.round(value / item.step) * item.step));
  const picks = [1000, 1500, 2000, 3000, 5000].filter((value) => value >= item.least && value <= max && value % item.step === 0);
  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        <div class="row">
          {qty > 0 && (
            <button
              type="button"
              class="btn btn-quiet"
              onClick={() => {
                onSet(0);
                onClose();
              }}
            >
              {t("remove")}
            </button>
          )}
          <button
            type="button"
            class="btn btn-primary grow"
            onClick={() => {
              onSet(amount);
              onClose();
            }}
          >
            {t(qty > 0 ? "update" : "addToCart", { m: `${t("estimate")} ${money(lineAmount(item.price, amount))}` })}
          </button>
        </div>
      }
    >
      <p class="hint">
        {priceText(item.price, item.unit)} · {t("byWeight")}
      </p>
      <div class="picker">
        <Stepper large text={qtyText(item.unit, amount)} lessLabel={t("less", { name: item.name })} moreLabel={t("more", { name: item.name })} onLess={() => setAmount(fit(amount - item.step))} onMore={() => setAmount(fit(amount + item.step))} canMore={amount + item.step <= max} />
      </div>
      {picks.length > 1 && (
        <div class="picks">
          {picks.map((value) => (
            <button type="button" key={value} class="btn btn-quiet btn-sm" aria-pressed={amount === value} onClick={() => setAmount(value)}>
              {qtyText(item.unit, value)}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function Roster({ page }: { page: OfferPage }) {
  const [all, setAll] = useState(false);
  if (page.roster.length === 0) return <p class="hint">{t("rosterEmpty")}</p>;
  const shown = all ? page.roster : page.roster.slice(-8);
  return (
    <>
      <ol class="roster">
        {shown.map((row) => (
          <li key={row.seq}>
            <span class="roster-n">{row.seq}</span>
            <span class="roster-name">{row.name ?? t("rosterAnon")}</span>
            <span class="hint">{t("rosterRow", { n: row.pieces })}</span>
          </li>
        ))}
      </ol>
      {!all && page.roster.length > shown.length && (
        <button type="button" class="link-btn" onClick={() => setAll(true)}>
          {t("rosterMore", { n: page.roster.length })}
        </button>
      )}
    </>
  );
}

type Problems = Partial<Record<"name" | "phone" | "where" | "address" | "form", string>>;

/** What a buyer fills in at checkout. */
interface Typed {
  how: How;
  pickupId: string;
  ruleId: string;
  address: string;
  name: string;
  phone: string;
  wechat: string;
  note: string;
}

/** One screen: how to get it, who you are, a note, what it comes to, and the button. */
function Checkout({
  page,
  lines,
  goods,
  estimate,
  changing,
  typed,
  onTyped,
  onBack,
  onAdjust,
  onClosed,
  onDone,
}: {
  page: OfferPage;
  lines: Line[];
  goods: number;
  estimate: boolean;
  changing: OrderPage | null;
  typed: Typed | null;
  onTyped: (typed: Typed) => void;
  onBack: () => void;
  onAdjust: (items: { id: string; left: number }[], text: string) => Promise<void>;
  onClosed: () => Promise<void>;
  onDone: (order: OrderPage) => void;
}) {
  const me = useMemo(savedMe, []);
  const was = changing?.order;
  const ways: How[] = [...(page.points.length ? (["pickup"] as const) : []), ...(page.rules.length ? (["delivery"] as const) : [])];
  // It starts as it was left a moment ago; else as the order being changed has it; else as this
  // phone last ordered. A place is chosen already only where there's just one to choose.
  const [form, setForm] = useState<Typed>(
    () =>
      typed ?? {
        how: was?.how ?? (me.how && ways.includes(me.how) ? me.how : ways[0]),
        pickupId: changing?.point?.id ?? (page.points.length === 1 ? page.points[0].id : ""),
        ruleId: changing?.rule?.id ?? (page.rules.length === 1 ? page.rules[0].id : ""),
        address: was?.address || me.address,
        name: was?.name ?? me.name,
        phone: was ? "" : me.phone,
        wechat: was?.wechat ?? me.wechat,
        note: was?.note ?? "",
      },
  );
  const { how, pickupId, ruleId, address, name, phone, wechat, note } = form;
  const [problems, setProblems] = useState<Problems>({});
  /** how many times sending it has been turned back */
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  const sheet = useRef<HTMLFormElement>(null);
  const set = (change: Partial<Typed>) => {
    const next = { ...form, ...change };
    setForm(next);
    onTyped(next);
    // what was wrong with something stops being said once it's touched
    const still = { ...problems };
    if ("how" in change || "pickupId" in change || "ruleId" in change) delete still.where;
    for (const field of ["name", "phone", "address"] as const) if (field in change) delete still[field];
    delete still.form;
    if (Object.keys(still).length !== Object.keys(problems).length) setProblems(still);
  };
  const turnBack = (found: Problems) => {
    setProblems(found);
    setTries((n) => n + 1);
  };

  // turned back: what's wrong is brought into view, and the first field to fix is ready to type in
  useEffect(() => {
    if (!tries) return;
    const field = sheet.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (field) field.focus({ preventScroll: true });
    (field ?? sheet.current?.querySelector(".problem"))?.scrollIntoView({ block: "center" });
  }, [tries]);

  const rule = how === "delivery" ? (page.rules.find((r) => r.id === ruleId) ?? null) : null;
  const short = rule && goods < rule.min ? rule.min - goods : 0;
  const fee = rule ? deliveryFee(rule, goods) : 0;
  const toFree = rule && fee > 0 && rule.freeFrom !== null ? rule.freeFrom - goods : 0;
  const total = goods + fee;

  async function submit(event: Event) {
    event.preventDefault();
    if (busy) return;
    const found: Problems = {};
    if (!name.trim()) found.name = t("needName");
    const digits = was ? "" : phoneDigits(phone);
    if (!was && !digits) found.phone = t("needPhone");
    if (how === "pickup" && !page.points.some((point) => point.id === pickupId)) found.where = t("needWhere");
    if (how === "delivery" && !rule) found.where = t("needArea");
    if (how === "delivery" && rule && short > 0) found.where = t("short", { m: money(short) });
    if (how === "delivery" && !address.trim()) found.address = t("needAddress");
    if (Object.keys(found).length) return turnBack(found);
    setProblems({});

    const order: OrderInput = { key: key.current, name, phone: was ? "" : phone, wechat, how, ...(how === "pickup" ? { pickupId } : { ruleId, address }), note, lines: lines.map(({ item, qty }) => ({ itemId: item.id, qty })) };
    setBusy(true);
    // (kept on this phone for next time, whether or not this order goes through)
    if (!was) saveMe({ name: name.trim(), phone, wechat: wechat.trim(), how, address: how === "delivery" ? address.trim() : me.address });
    try {
      onDone(was ? await changeOrder(was.code, tailOf(was.code) ?? was.tail, order) : await placeOrder(page.offer.id, order));
    } catch (e) {
      const code = e instanceof ApiFail ? e.code : "failed";
      const detail = e instanceof ApiFail ? e.detail : {};
      setBusy(false);
      if ((code === "soldout" || code === "perbuyer") && detail.items) return void onAdjust(detail.items, t(code === "soldout" ? "errSoldout" : "errPerbuyer"));
      if (code === "closed") return void onClosed();
      if (code === "item" || code === "qty" || code === "empty") return void onAdjust([], t("errGone"));
      const words: Problems =
        code === "name"
          ? { name: t("needName") }
          : code === "phone"
            ? { phone: t("needPhone") }
            : code === "address"
              ? { address: t("needAddress") }
              : code === "min"
                ? { where: t("short", { m: money((detail.min ?? goods) - goods) }) }
                : code === "how"
                  ? { where: t(how === "pickup" ? "needWhere" : "needArea") }
                  : { form: t(code === "many" ? "errMany" : code === "full" ? "errFull" : code === "paid" ? "errPaid" : code === "cancelled" ? "errCancelled" : code === "busy" ? "errBusy" : code === "limit" ? "limit" : code === "network" ? "netDown" : "failed") };
      turnBack(words);
    }
  }

  return (
    <form class="page page-with-dock" onSubmit={submit} noValidate ref={sheet}>
      <header class="bar">
        <button type="button" class="bar-back" onClick={onBack}>
          <IconBack />
          {t("back")}
        </button>
        <span class="bar-brand">{was ? t("changeTitle", { code: was.code }) : t("checkoutTitle")}</span>
      </header>

      <section class="panel">
        <h2 class="panel-title">{t("howLabel")}</h2>
        {ways.length > 1 && (
          <div class="seg" role="group" aria-label={t("howLabel")}>
            {ways.map((way) => (
              <button type="button" key={way} class="seg-btn" aria-pressed={how === way} onClick={() => set({ how: way })}>
                {t(way)}
              </button>
            ))}
          </div>
        )}
        {how === "pickup" ? (
          <fieldset class="choices">
            <legend class="field-label">{t("whereLabel")}</legend>
            {page.points.map((point) => (
              <label key={point.id} class="choice">
                <input type="radio" name="pickup" checked={pickupId === point.id} onChange={() => set({ pickupId: point.id })} />
                <span class="choice-what">
                  <strong>{point.name}</strong>
                  {point.address && <span class="hint">{point.address}</span>}
                  {point.hours && <span class="hint">{point.hours}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <fieldset class="choices">
              <legend class="field-label">{t("areaLabel")}</legend>
              {page.rules.map((r) => (
                <label key={r.id} class="choice">
                  <input type="radio" name="area" checked={ruleId === r.id} onChange={() => set({ ruleId: r.id })} />
                  <span class="choice-what">
                    <strong>{r.label}</strong>
                    <span class="hint">{ruleText(r)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {rule && short <= 0 && toFree > 0 && <p class="hint">{t("toFree", { m: money(toFree) })}</p>}
            <label class="field">
              <span class="field-label">{t("addressLabel")}</span>
              <textarea name="address" rows={2} maxLength={200} autocomplete="street-address" placeholder={t("addressPlaceholder")} value={address} aria-invalid={problems.address ? "true" : undefined} onInput={(event) => set({ address: event.currentTarget.value })} />
              {problems.address && <span class="problem">{problems.address}</span>}
            </label>
          </>
        )}
        {problems.where && (
          <p class="problem" role="alert">
            {problems.where}
          </p>
        )}
        {how === "delivery" && rule && short > 0 && !problems.where && <p class="problem">{t("short", { m: money(short) })}</p>}
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("contactLabel")}</h2>
        <label class="field">
          <span class="field-label">{t("name")}</span>
          <input type="text" name="name" maxLength={30} autocomplete="name" placeholder={t("namePlaceholder")} value={name} aria-invalid={problems.name ? "true" : undefined} onInput={(event) => set({ name: event.currentTarget.value })} />
          {problems.name ? <span class="problem">{problems.name}</span> : page.offer.roster === "names" && <span class="hint">{t("nameShown")}</span>}
        </label>
        <label class="field">
          <span class="field-label">{t("phone")}</span>
          <input type="tel" name="phone" inputMode="tel" maxLength={24} autocomplete="tel" placeholder={t("phonePlaceholder")} value={was ? `···· ${was.tail}` : phone} readOnly={!!was} aria-invalid={problems.phone ? "true" : undefined} onInput={(event) => set({ phone: event.currentTarget.value })} />
          {problems.phone ? <span class="problem">{problems.phone}</span> : was && <span class="hint">{t("phoneFixed")}</span>}
        </label>
        <label class="field">
          <span class="field-label">{t("wechat")}</span>
          <input type="text" name="wechat" maxLength={40} autocomplete="off" autocapitalize="off" placeholder={t("wechatPlaceholder")} value={wechat} onInput={(event) => set({ wechat: event.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field-label">{t("note")}</span>
          <textarea name="note" rows={2} maxLength={300} placeholder={t("notePlaceholder")} value={note} onInput={(event) => set({ note: event.currentTarget.value })} />
        </label>
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("goods")}</h2>
        <ul class="sum-lines">
          {lines.map(({ item, qty, amount }) => (
            <li key={item.id}>
              <span>
                {item.name} <span class="hint">× {qtyText(item.unit, qty)}</span>
              </span>
              <span>{money(amount)}</span>
            </li>
          ))}
        </ul>
        <dl class="sums">
          <div>
            <dt>{t(estimate ? "goodsEstimate" : "goods")}</dt>
            <dd>{money(goods)}</dd>
          </div>
          {how === "delivery" && rule && (
            <div>
              <dt>{t("fee")}</dt>
              <dd>{fee ? money(fee) : t("free")}</dd>
            </div>
          )}
          <div class="sums-total">
            <dt>{t(estimate ? "totalEstimate" : "total")}</dt>
            <dd>{money(total)}</dd>
          </div>
        </dl>
        {estimate && <p class="hint">{t("weighNote")}</p>}
        <p class="hint">{t("payNow")}</p>
        {page.shop.pay && <Lines text={page.shop.pay} class="pay-how" />}
      </section>

      {problems.form && (
        <p class="problem center" role="alert">
          {problems.form}
        </p>
      )}

      <div class="dock">
        <button type="submit" class="btn btn-primary btn-block" disabled={busy || lines.length === 0}>
          {busy ? t("placing") : t(was ? "saveChange" : "place", { m: `${estimate ? `${t("estimate")} ` : ""}${money(total)}` })}
        </button>
      </div>
    </form>
  );
}
