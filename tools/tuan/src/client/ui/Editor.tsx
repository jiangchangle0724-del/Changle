// Starting a group buy, and changing one, for its merchant. One page in three short steps: its
// name, the goods, and when it closes and where the goods go. Each item, pickup point and delivery
// area is a row; tapping one opens a sheet to write it in. Money is typed in dollars and amounts
// in the item's unit, and kept the way the server keeps them (cents; thousandths of the unit).
//
// A new group buy can start from the shop's last one (its goods and places copied, its closing
// time moved on by whole weeks), and what's typed is kept on the phone until it's sent. Changing
// one sends the whole document back, each part that stays under its id (src/engine/edit.ts): a
// part an order names can change, but it can't go.
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MyOfferDoc } from "../../api";
import { BASE } from "../../base";
import { amountText, MILLI, QTY_MAX } from "../../engine/money";
import { ITEMS_MAX, MONEY_MAX, OFFER_NOTE_MAX, OPEN_FOR_MAX_MS, PLACES_MAX, STOCK_MAX, TITLE_MAX, WEIGHED_STEPS } from "../../engine/offer";
import { fromField, toField } from "../../engine/time";
import { UNITS, weighed, type OfferStatus, type Roster, type Unit } from "../../engine/types";
import { ApiFail, dropDraft, getMy, getMyDoc, saveDraft, savedDraft, saveMyDoc, session, startOffer } from "../api";
import { soldBy, t, unitName } from "../i18n";
import { IconBack, IconNext, IconPlus, money, priceText, Sheet, useLang, useTitle } from "./common";
import { onReturn, shutOut, troubleOf, TroublePanel, type Trouble } from "./My";

interface ItemDraft {
  id?: string;
  /** an order names it: it can't go, and how it's sold can't change */
  used?: boolean;
  sold?: number;
  section: string;
  name: string;
  detail: string;
  price: number;
  unit: Unit;
  step: number;
  least: number;
  stock: number | null;
  perBuyer: number | null;
  allergens: string;
}
interface PointDraft {
  id?: string;
  used?: boolean;
  name: string;
  address: string;
  hours: string;
}
interface RuleDraft {
  id?: string;
  used?: boolean;
  label: string;
  min: number;
  fee: number;
  freeFrom: number | null;
  hours: string;
}
/** The group buy as it is on the page. `closes`: as the date-and-time field holds it (Vancouver's clock). */
interface Draft {
  title: string;
  note: string;
  closes: string;
  roster: Roster;
  items: ItemDraft[];
  points: PointDraft[];
  rules: RuleDraft[];
}

const DAY = 86_400_000;
const blank = (now: number): Draft => ({ title: "", note: "", closes: `${toField(now + 7 * DAY).slice(0, 11)}20:00`, roster: "names", items: [], points: [], rules: [] });

/** What the server read out, as the page holds it. `fresh`: for a new group buy, so no part carries an id, and the closing time moves on a week at a time until it is ahead. */
function draftFrom(doc: MyOfferDoc, fresh: boolean): Draft {
  let closesAt = doc.offer.closesAt;
  if (fresh) while (closesAt < doc.now + DAY) closesAt += 7 * DAY;
  return {
    title: doc.offer.title,
    note: doc.offer.note,
    closes: toField(closesAt),
    roster: doc.offer.roster,
    items: doc.items.map(({ id, used, sold, ...item }) => (fresh ? item : { ...item, id, used, sold })),
    points: doc.points.map(({ id, used, ...point }) => (fresh ? point : { ...point, id, used })),
    rules: doc.rules.map(({ id, used, ...rule }) => (fresh ? rule : { ...rule, id, used })),
  };
}

const written = (draft: Draft): boolean => draft.title.trim() !== "" || draft.note.trim() !== "" || draft.items.length + draft.points.length + draft.rules.length > 0;
/** What this phone kept of a group buy that wasn't sent, if it still looks like one. */
function kept(slug: string): Draft | null {
  const draft = savedDraft<Draft>(slug);
  return draft && typeof draft.title === "string" && typeof draft.note === "string" && typeof draft.closes === "string" && Array.isArray(draft.items) && Array.isArray(draft.points) && Array.isArray(draft.rules) && written(draft) ? draft : null;
}

/** "12", "12.5", "$12.50": cents. Null when it isn't an amount of money this takes. */
function cents(text: string): number | null {
  const m = /^\$?\s*(\d{1,5})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(",", "."));
  if (!m) return null;
  const value = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return value <= MONEY_MAX ? value : null;
}
const centsText = (value: number): string => (value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2));
/** "2", "1.5": thousandths of the unit. Null when it isn't an amount. */
function amount(text: string): number | null {
  const m = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(text.trim().replace(",", "."));
  return m ? Number(m[1]) * MILLI + Number((m[2] ?? "").padEnd(3, "0")) : null;
}

/** A field with its label, and under it what's wrong with it, or a word of help. */
function Field({ label, problem, hint, children }: { label: string; problem?: string | null; hint?: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {problem ? <span class="problem">{problem}</span> : hint && <span class="hint">{hint}</span>}
    </label>
  );
}

/** The foot of a part's sheet: take it out of the list (when it may go), and keep what was typed. */
function SheetFoot({ canRemove, onRemove, onDone }: { canRemove: boolean; onRemove: () => void; onDone: () => void }) {
  return (
    <div class="row">
      {canRemove && (
        <button type="button" class="btn btn-quiet" onClick={onRemove}>
          {t("editRemove")}
        </button>
      )}
      <button type="button" class="btn btn-primary grow" onClick={onDone}>
        {t("editDone")}
      </button>
    </div>
  );
}

function ItemSheet({ item, sections, canUp, canDown, onSave, onRemove, onMove, onClose }: { item: ItemDraft | null; sections: string[]; canUp: boolean; canDown: boolean; onSave: (item: ItemDraft) => void; onRemove: () => void; onMove: (by: -1 | 1) => void; onClose: () => void }) {
  const [typed, setTyped] = useState(() => ({
    name: item?.name ?? "",
    section: item?.section ?? sections[sections.length - 1] ?? "",
    detail: item?.detail ?? "",
    price: item ? centsText(item.price) : "",
    unit: item?.unit ?? ("each" as Unit),
    step: item && weighed(item.unit) ? item.step : 500,
    least: item && weighed(item.unit) && item.least !== item.step ? amountText(item.least) : "",
    stock: item?.stock == null ? "" : amountText(item.stock),
    perBuyer: item?.perBuyer == null ? "" : amountText(item.perBuyer),
    allergens: item?.allergens ?? "",
  }));
  const [tried, setTried] = useState(false);
  const set = (more: Partial<typeof typed>) => setTyped({ ...typed, ...more });

  const byWeight = weighed(typed.unit);
  const step = byWeight ? typed.step : MILLI;
  const sold = item?.sold ?? 0;
  const price = cents(typed.price);
  // counted things come one at a time; a counted item that was made needing more keeps that
  const least = byWeight ? (typed.least.trim() ? amount(typed.least) : step) : item && !weighed(item.unit) ? item.least : MILLI;
  const stock = typed.stock.trim() ? amount(typed.stock) : null;
  const perBuyer = typed.perBuyer.trim() ? amount(typed.perBuyer) : null;
  const inSteps = t(byWeight ? "editErrSteps" : "editErrWhole", { step: amountText(step) });
  const wrong = {
    name: typed.name.trim() ? null : tried ? t("editErrName") : "",
    price: price !== null ? null : typed.price.trim() || tried ? t("editErrPrice") : "",
    least: least !== null && least >= step && least <= QTY_MAX && least % step === 0 ? null : inSteps,
    stock: !typed.stock.trim() ? null : stock === null || stock > STOCK_MAX || stock % step !== 0 ? inSteps : stock < sold ? t("editErrStockLow", { sold: amountText(sold) }) : null,
    perBuyer: !typed.perBuyer.trim() ? null : perBuyer === null || perBuyer > QTY_MAX || perBuyer % step !== 0 ? inSteps : least !== null && perBuyer < least ? t("editErrPerBuyerLow") : null,
  };
  const good = Object.values(wrong).every((one) => one === null);

  function done() {
    if (!good || price === null || least === null) return setTried(true);
    onSave({ ...(item?.id ? { id: item.id, used: item.used, sold: item.sold } : {}), section: typed.section.trim(), name: typed.name.trim(), detail: typed.detail.trim(), price, unit: typed.unit, step, least, stock, perBuyer, allergens: typed.allergens.trim() });
  }

  return (
    <Sheet title={t(item ? "editItem" : "editAddItem")} onClose={onClose} footer={<SheetFoot canRemove={item !== null && !item.used} onRemove={onRemove} onDone={done} />}>
      {item?.used && <p class="hint">{t("editUsedItem", { sold: amountText(sold) })}</p>}
      <Field label={t("editName")} problem={wrong.name}>
        <input type="text" name="item-name" maxLength={60} autocomplete="off" data-autofocus={item ? undefined : ""} value={typed.name} aria-invalid={wrong.name ? "true" : undefined} onInput={(event) => set({ name: event.currentTarget.value })} />
      </Field>
      <Field label={t("editPrice")} problem={wrong.price}>
        <input type="text" name="item-price" inputMode="decimal" maxLength={9} autocomplete="off" placeholder="12.50" value={typed.price} aria-invalid={wrong.price ? "true" : undefined} onInput={(event) => set({ price: event.currentTarget.value })} />
      </Field>
      <Field label={t("editUnit")} hint={byWeight ? t("editUnitWeighed") : undefined}>
        <select name="item-unit" value={typed.unit} disabled={item?.used} onChange={(event) => set({ unit: event.currentTarget.value as Unit })}>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {soldBy(unit)}
            </option>
          ))}
        </select>
      </Field>
      {byWeight && (
        <Field label={t("editStep")}>
          <select name="item-step" value={String(typed.step)} onChange={(event) => set({ step: Number(event.currentTarget.value) })}>
            {WEIGHED_STEPS.map((one) => (
              <option key={one} value={String(one)}>
                {amountText(one)} lb
              </option>
            ))}
          </select>
        </Field>
      )}
      {byWeight && (
        <Field label={t("editLeast")} problem={wrong.least} hint={t("editOptional")}>
          <input type="text" name="item-least" inputMode="decimal" maxLength={7} autocomplete="off" placeholder={amountText(step)} value={typed.least} aria-invalid={wrong.least ? "true" : undefined} onInput={(event) => set({ least: event.currentTarget.value })} />
        </Field>
      )}
      <Field label={t("editSection")} hint={t("editSectionHint")}>
        <input type="text" name="item-section" maxLength={30} autocomplete="off" list="edit-sections" value={typed.section} onInput={(event) => set({ section: event.currentTarget.value })} />
        <datalist id="edit-sections">
          {sections.map((one) => (
            <option key={one} value={one} />
          ))}
        </datalist>
      </Field>
      <Field label={t("editDetail")}>
        <textarea name="item-detail" rows={2} maxLength={300} value={typed.detail} onInput={(event) => set({ detail: event.currentTarget.value })} />
      </Field>
      <Field label={t("editStock", { unit: unitName(typed.unit) })} problem={wrong.stock} hint={t("editStockHint")}>
        <input type="text" name="item-stock" inputMode="decimal" maxLength={10} autocomplete="off" value={typed.stock} aria-invalid={wrong.stock ? "true" : undefined} onInput={(event) => set({ stock: event.currentTarget.value })} />
      </Field>
      <Field label={t("editPerBuyer", { unit: unitName(typed.unit) })} problem={wrong.perBuyer} hint={t("editOptional")}>
        <input type="text" name="item-perbuyer" inputMode="decimal" maxLength={7} autocomplete="off" value={typed.perBuyer} aria-invalid={wrong.perBuyer ? "true" : undefined} onInput={(event) => set({ perBuyer: event.currentTarget.value })} />
      </Field>
      <Field label={t("editAllergens")} hint={t("editAllergensHint")}>
        <input type="text" name="item-allergens" maxLength={120} autocomplete="off" value={typed.allergens} onInput={(event) => set({ allergens: event.currentTarget.value })} />
      </Field>
      {item && (canUp || canDown) && (
        <div class="row">
          <button type="button" class="btn btn-quiet btn-sm" disabled={!canUp} onClick={() => onMove(-1)}>
            {t("editMoveUp")}
          </button>
          <button type="button" class="btn btn-quiet btn-sm" disabled={!canDown} onClick={() => onMove(1)}>
            {t("editMoveDown")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function PointSheet({ point, onSave, onRemove, onClose }: { point: PointDraft | null; onSave: (point: PointDraft) => void; onRemove: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState({ name: point?.name ?? "", address: point?.address ?? "", hours: point?.hours ?? "" });
  const [tried, setTried] = useState(false);
  const noName = !typed.name.trim();
  const done = () => (noName ? setTried(true) : onSave({ ...(point?.id ? { id: point.id, used: point.used } : {}), name: typed.name.trim(), address: typed.address.trim(), hours: typed.hours.trim() }));
  return (
    <Sheet title={t(point ? "editPoint" : "editAddPoint")} onClose={onClose} footer={<SheetFoot canRemove={point !== null && !point.used} onRemove={onRemove} onDone={done} />}>
      {point?.used && <p class="hint">{t("editUsedPlace")}</p>}
      <Field label={t("editName")} problem={noName && tried ? t("editErrName") : null} hint={t("editPointHint")}>
        <input type="text" name="point-name" maxLength={40} autocomplete="off" data-autofocus={point ? undefined : ""} value={typed.name} aria-invalid={noName && tried ? "true" : undefined} onInput={(event) => setTyped({ ...typed, name: event.currentTarget.value })} />
      </Field>
      <Field label={t("editAddress")}>
        <textarea name="point-address" rows={2} maxLength={200} value={typed.address} onInput={(event) => setTyped({ ...typed, address: event.currentTarget.value })} />
      </Field>
      <Field label={t("editHours")} hint={t("editHoursHint")}>
        <input type="text" name="point-hours" maxLength={120} autocomplete="off" value={typed.hours} onInput={(event) => setTyped({ ...typed, hours: event.currentTarget.value })} />
      </Field>
    </Sheet>
  );
}

function RuleSheet({ rule, onSave, onRemove, onClose }: { rule: RuleDraft | null; onSave: (rule: RuleDraft) => void; onRemove: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState({ label: rule?.label ?? "", min: rule?.min ? centsText(rule.min) : "", fee: rule?.fee ? centsText(rule.fee) : "", freeFrom: rule?.freeFrom ? centsText(rule.freeFrom) : "", hours: rule?.hours ?? "" });
  const [tried, setTried] = useState(false);
  const set = (more: Partial<typeof typed>) => setTyped({ ...typed, ...more });
  const noLabel = !typed.label.trim();
  // (empty is nothing: no minimum, no fee, the fee always applies)
  const min = typed.min.trim() ? cents(typed.min) : 0;
  const fee = typed.fee.trim() ? cents(typed.fee) : 0;
  const freeFrom = typed.freeFrom.trim() ? cents(typed.freeFrom) : null;
  const badFree = typed.freeFrom.trim() !== "" && (freeFrom === null || freeFrom === 0);
  function done() {
    if (noLabel || min === null || fee === null || badFree) return setTried(true);
    onSave({ ...(rule?.id ? { id: rule.id, used: rule.used } : {}), label: typed.label.trim(), min, fee, freeFrom: fee > 0 ? freeFrom : null, hours: typed.hours.trim() });
  }
  return (
    <Sheet title={t(rule ? "editRule" : "editAddRule")} onClose={onClose} footer={<SheetFoot canRemove={rule !== null && !rule.used} onRemove={onRemove} onDone={done} />}>
      {rule?.used && <p class="hint">{t("editUsedPlace")}</p>}
      <Field label={t("editArea")} problem={noLabel && tried ? t("editErrName") : null} hint={t("editAreaHint")}>
        <input type="text" name="rule-label" maxLength={60} autocomplete="off" data-autofocus={rule ? undefined : ""} value={typed.label} aria-invalid={noLabel && tried ? "true" : undefined} onInput={(event) => set({ label: event.currentTarget.value })} />
      </Field>
      <Field label={t("editMin")} problem={min === null ? t("editErrPrice") : null} hint={t("editMinHint")}>
        <input type="text" name="rule-min" inputMode="decimal" maxLength={9} autocomplete="off" placeholder="0" value={typed.min} aria-invalid={min === null ? "true" : undefined} onInput={(event) => set({ min: event.currentTarget.value })} />
      </Field>
      <Field label={t("editFee")} problem={fee === null ? t("editErrPrice") : null} hint={t("editFeeHint")}>
        <input type="text" name="rule-fee" inputMode="decimal" maxLength={9} autocomplete="off" placeholder="0" value={typed.fee} aria-invalid={fee === null ? "true" : undefined} onInput={(event) => set({ fee: event.currentTarget.value })} />
      </Field>
      {fee !== null && fee > 0 && (
        <Field label={t("editFreeFrom")} problem={badFree ? t("editErrPrice") : null} hint={t("editOptional")}>
          <input type="text" name="rule-free" inputMode="decimal" maxLength={9} autocomplete="off" value={typed.freeFrom} aria-invalid={badFree ? "true" : undefined} onInput={(event) => set({ freeFrom: event.currentTarget.value })} />
        </Field>
      )}
      <Field label={t("editHours")} hint={t("editHoursHint")}>
        <input type="text" name="rule-hours" maxLength={120} autocomplete="off" value={typed.hours} onInput={(event) => set({ hours: event.currentTarget.value })} />
      </Field>
    </Sheet>
  );
}

/** A list of parts, one a row, each opening its sheet; and the button that adds one. */
function Rows<T>({ list, what, more, empty, add, full, onOpen }: { list: T[]; what: (one: T) => string; more: (one: T) => string; empty: string; add: string; full: boolean; onOpen: (at: number | null) => void }) {
  return (
    <>
      {list.length === 0 ? (
        <p class="hint">{empty}</p>
      ) : (
        <ul class="mine">
          {list.map((one, at) => (
            <li key={at}>
              <button type="button" class="row-btn" onClick={() => onOpen(at)}>
                <span class="mine-what">
                  <strong>{what(one)}</strong>
                  <span class="hint">{more(one)}</span>
                </span>
                <IconNext />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="btn btn-quiet btn-block" disabled={full} onClick={() => onOpen(null)}>
        <IconPlus size={18} />
        {add}
      </button>
    </>
  );
}

/** Why it didn't go, in words. */
function whyNot(e: unknown, draft: Draft): string {
  if (!(e instanceof ApiFail)) return t("editErrFailed");
  const at = e.detail.at ?? 0;
  switch (e.code) {
    case "title":
      return t("editErrTitle");
    case "closes":
      return t("editErrCloses");
    case "items":
      return t("editErrItems");
    case "places":
      return t("editErrPlaces");
    case "item":
      return t("editErrItem", { n: at + 1, name: draft.items[at]?.name ?? "" });
    case "place":
      return t("editErrPlace");
    case "sold":
      return t("editErrSold", { name: draft.items[at]?.name ?? "" });
    case "inuse":
    case "busy":
      return t("editErrBusy");
    case "network":
      return t("netDown");
    default:
      return t("editErrFailed");
  }
}

/** `slug`: start a group buy in this shop (`from`: like this earlier one). `offerId`: change this one. */
export function Editor({ slug, from, offerId }: { slug: string | null; from: string | null; offerId: string | null }) {
  useLang();
  const fresh = offerId === null;
  useTitle(t(fresh ? "editNew" : "editChange"));
  const [shop, setShop] = useState<{ slug: string; name: string } | null>(null);
  /** the shop's latest group buy, to start from */
  const [last, setLast] = useState<{ id: string; title: string } | null>(null);
  const [status, setStatus] = useState<OfferStatus | null>(null);
  /** changing one: when it closed as it was read */
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  /** starting one: this account runs no shop at that address */
  const [noShop, setNoShop] = useState(false);
  const [sheet, setSheet] = useState<{ kind: "item" | "point" | "rule"; at: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const loaded = useRef(false);

  async function load() {
    if (!session()) return setTrouble("signin");
    try {
      if (offerId) {
        const doc = await getMyDoc(offerId);
        setShop(doc.shop);
        setStatus(doc.offer.status);
        setClosedAt(doc.offer.closesAt);
        setDraft(draftFrom(doc, false));
      } else {
        const mine = (await getMy()).shops.find((one) => one.slug === slug);
        if (!mine) return setNoShop(true);
        setShop({ slug: mine.slug, name: mine.name });
        setLast(mine.offers[0] ? { id: mine.offers[0].id, title: mine.offers[0].title } : null);
        const before = from ? null : kept(mine.slug);
        setPicked(before !== null);
        setDraft(from ? draftFrom(await getMyDoc(from), true) : (before ?? blank(Date.now())));
      }
      loaded.current = true;
      setTrouble(null);
    } catch (e) {
      setTrouble(troubleOf(e));
    }
  }
  useEffect(() => {
    void load();
    // back from signing in: read it then, but never over what's being typed
    return onReturn(() => void (loaded.current || load()));
  }, []);
  // a new one is kept on the phone as it's typed: by the time a change shows, it is kept (a layout
  // effect), so closing the page the moment after loses nothing
  useLayoutEffect(() => {
    if (fresh && draft && shop && written(draft)) saveDraft(shop.slug, draft);
  }, [draft]);

  async function likeLast() {
    if (!last) return;
    setBusy(true);
    try {
      setDraft(draftFrom(await getMyDoc(last.id), true));
      setPicked(false);
      setSaid(null);
    } catch (e) {
      setSaid(whyNot(e, blank(0)));
    }
    setBusy(false);
  }
  function startOver() {
    if (shop) dropDraft(shop.slug);
    setDraft(blank(Date.now()));
    setPicked(false);
    setSaid(null);
  }

  async function send(open: boolean) {
    if (!draft || !shop) return;
    const now = Date.now();
    // left as it was read, it goes back exactly as it was (it may have passed)
    const closesAt = closedAt !== null && draft.closes === toField(closedAt) ? closedAt : fromField(draft.closes);
    const ahead = closesAt !== null && (closesAt === closedAt || (closesAt > now && closesAt <= now + OPEN_FOR_MAX_MS));
    const problem = !draft.title.trim() ? t("editErrTitle") : !ahead ? t("editErrCloses") : draft.items.length === 0 ? t("editErrItems") : draft.points.length + draft.rules.length === 0 ? t("editErrPlaces") : null;
    if (problem || closesAt === null) return setSaid(problem);
    const doc = {
      title: draft.title.trim(),
      note: draft.note,
      closesAt,
      roster: draft.roster,
      open,
      items: draft.items.map(({ used: _used, sold: _sold, ...item }) => item),
      points: draft.points.map(({ used: _used, ...point }) => point),
      rules: draft.rules.map(({ used: _used, ...rule }) => rule),
    };
    setBusy(true);
    setSaid(null);
    try {
      const id = offerId ? (await saveMyDoc(offerId, doc)).offer.id : (await startOffer(shop.slug, doc)).id;
      if (!offerId) dropDraft(shop.slug);
      location.assign(`${BASE}/my/t/${id}`);
    } catch (e) {
      const why = troubleOf(e);
      if (shutOut(why)) setTrouble(why);
      else setSaid(whyNot(e, draft));
      setBusy(false);
    }
  }

  /** Put a part where the open sheet's part was (or at the end), take it out, or move it; then close the sheet, or follow the part. */
  function put<K extends "items" | "points" | "rules">(list: K, one: Draft[K][number] | null, by: -1 | 0 | 1 = 0) {
    if (!draft || !sheet) return;
    const now = [...draft[list]] as Draft[K][number][];
    const at = sheet.at;
    if (by !== 0 && at !== null) {
      [now[at], now[at + by]] = [now[at + by], now[at]];
      setSheet({ ...sheet, at: at + by });
    } else {
      if (one === null) now.splice(at ?? now.length, 1);
      else if (at === null) now.push(one);
      else now[at] = one;
      setSheet(null);
    }
    setDraft({ ...draft, [list]: now });
    setSaid(null);
  }

  const sections = draft ? [...new Set(draft.items.map((item) => item.section).filter(Boolean))] : [];
  return (
    <div class="page">
      <header class="bar">
        <a class="bar-back" href={offerId ? `${BASE}/my/t/${offerId}` : `${BASE}/my`}>
          <IconBack />
          {t("myTitle")}
        </a>
      </header>
      <section class="hero">
        {shop && <p class="shop-name">{shop.name}</p>}
        <h1>{t(fresh ? "editNew" : "editChange")}</h1>
      </section>

      {trouble ? (
        <TroublePanel trouble={trouble} onRetry={() => void load()} />
      ) : noShop ? (
        <div class="empty">
          <p>{t("editNoShop")}</p>
          <a class="btn btn-quiet" href={`${BASE}/my`}>
            {t("myTitle")}
          </a>
        </div>
      ) : !draft ? (
        <p class="loading">{t("loading")}</p>
      ) : (
        <>
          {fresh && last && !from && draft.items.length === 0 && (
            <section class="panel">
              <div class="stack">
                <p class="hint">{t("editLikeLastHint")}</p>
                <button type="button" class="btn btn-quiet btn-block" disabled={busy} onClick={() => void likeLast()}>
                  {t("editLikeLast", { title: last.title })}
                </button>
              </div>
            </section>
          )}
          {fresh && picked && (
            <p class="hint">
              {t("editPicked")}{" "}
              <button type="button" class="link-btn" onClick={startOver}>
                {t("editStartOver")}
              </button>
            </p>
          )}

          <section class="panel">
            <div class="stack">
              <h2 class="panel-title">{t("editStep1")}</h2>
              <Field label={t("editTitle")}>
                <input type="text" name="title" maxLength={TITLE_MAX} autocomplete="off" placeholder={t("editTitleHint")} value={draft.title} onInput={(event) => setDraft({ ...draft, title: event.currentTarget.value })} />
              </Field>
              <Field label={t("editNote")} hint={t("editNoteHint")}>
                <textarea name="note" rows={3} maxLength={OFFER_NOTE_MAX} value={draft.note} onInput={(event) => setDraft({ ...draft, note: event.currentTarget.value })} />
              </Field>
            </div>
          </section>

          <section class="panel">
            <div class="stack">
              <h2 class="panel-title">{t("editStep2")}</h2>
              <Rows
                list={draft.items}
                what={(item) => item.name}
                more={(item) => [priceText(item.price, item.unit), item.section, item.stock === null ? "" : t("editRowStock", { n: amountText(item.stock) })].filter(Boolean).join(" · ")}
                empty={t("editNoItems")}
                add={t("editAddItem")}
                full={draft.items.length >= ITEMS_MAX}
                onOpen={(at) => setSheet({ kind: "item", at })}
              />
            </div>
          </section>

          <section class="panel">
            <div class="stack">
              <h2 class="panel-title">{t("editStep3")}</h2>
              <Field label={t("ownerCloses")}>
                <input type="datetime-local" name="closes" value={draft.closes} onInput={(event) => setDraft({ ...draft, closes: event.currentTarget.value })} />
              </Field>
              <h3 class="field-label">{t("editPoints")}</h3>
              <Rows
                list={draft.points}
                what={(point) => point.name}
                more={(point) => [point.hours, point.address].filter(Boolean).join(" · ")}
                empty={t("editNoPoints")}
                add={t("editAddPoint")}
                full={draft.points.length >= PLACES_MAX}
                onOpen={(at) => setSheet({ kind: "point", at })}
              />
              <h3 class="field-label">{t("editRules")}</h3>
              <Rows
                list={draft.rules}
                what={(rule) => rule.label}
                more={(rule) => [rule.min ? t("editRowMin", { m: money(rule.min) }) : "", rule.fee ? t("editRowFee", { m: money(rule.fee) }) : t("editRowNoFee"), rule.freeFrom ? t("editRowFree", { m: money(rule.freeFrom) }) : "", rule.hours].filter(Boolean).join(" · ")}
                empty={t("editNoRules")}
                add={t("editAddRule")}
                full={draft.rules.length >= PLACES_MAX}
                onOpen={(at) => setSheet({ kind: "rule", at })}
              />
              <Field label={t("roster")} hint={t("editRosterHint")}>
                <select name="roster" value={draft.roster} onChange={(event) => setDraft({ ...draft, roster: event.currentTarget.value as Roster })}>
                  <option value="names">{t("editRosterNames")}</option>
                  <option value="anon">{t("editRosterAnon")}</option>
                  <option value="off">{t("editRosterOff")}</option>
                </select>
              </Field>
            </div>
          </section>

          <section class="panel">
            <div class="stack">
              <p class="hint">{t("editSummary", { n: draft.items.length, p: draft.points.length, r: draft.rules.length })}</p>
              {said && (
                <p class="problem" role="alert">
                  {said}
                </p>
              )}
              {fresh || status === "draft" ? (
                <>
                  <button type="button" class="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => void send(true)}>
                    {t("openDraft")}
                  </button>
                  <button type="button" class="btn btn-quiet btn-block" disabled={busy} onClick={() => void send(false)}>
                    {t("editKeepDraft")}
                  </button>
                </>
              ) : (
                <button type="button" class="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => void send(false)}>
                  {t("editSave")}
                </button>
              )}
            </div>
          </section>

          {sheet?.kind === "item" && (
            <ItemSheet
              item={sheet.at === null ? null : draft.items[sheet.at]}
              sections={sections}
              canUp={sheet.at !== null && sheet.at > 0}
              canDown={sheet.at !== null && sheet.at < draft.items.length - 1}
              onSave={(item) => put("items", item)}
              onRemove={() => put("items", null)}
              onMove={(by) => put("items", null, by)}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet?.kind === "point" && <PointSheet point={sheet.at === null ? null : draft.points[sheet.at]} onSave={(point) => put("points", point)} onRemove={() => put("points", null)} onClose={() => setSheet(null)} />}
          {sheet?.kind === "rule" && <RuleSheet rule={sheet.at === null ? null : draft.rules[sheet.at]} onSave={(rule) => put("rules", rule)} onRemove={() => put("rules", null)} onClose={() => setSheet(null)} />}
        </>
      )}
    </div>
  );
}
