import { useEffect, useState, type FocusEvent, type MouseEvent } from "react";
import { useStore } from "../store";
import { capDigits, cleanAmount, convert, CURRENCIES, CURRENCY_BY_CODE, isCode, sizeClass, type Code, type FxState } from "./fx";
import { PackCompare } from "./PackCompare";
import { RateStatus } from "./RateStatus";
import { figureDigits, isKind, perBaseOf, plainFigure, UNITS, type Kind, type Unit } from "./units";

const SYMBOL = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol])) as Record<Code, string>;

/**
 * What the card keeps on the phone: weight or volume, the unit picked for the big field, the
 * price typed and the unit of the field it was typed in (`src`: the big field or any box), the
 * currency and the second one shown under each box.
 */
type Saved = { kind: Kind; unit: string; text: string; src: string; cur: Code; alt: Code };

const formats = new Map<string, Intl.NumberFormat>();
/** A unit price with thousands separators, in the currency's decimals, more under a tenth of a dollar (figureDigits). */
function figure(lang: "zh" | "en", v: number, decimals: number) {
  const max = figureDigits(v, decimals);
  const key = `${lang} ${decimals} ${max}`;
  let nf = formats.get(key);
  if (!nf) formats.set(key, (nf = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: max })));
  return nf.format(Number.isFinite(v) ? v : 0);
}

/**
 * A tapped field selects its figure, so typing replaces it. Selecting on focus alone isn't enough
 * on a phone: the tap that focused the field puts the caret down after that, and the new digits
 * would land in the middle of the old figure. So the tap's own click selects it once more.
 */
let focused: { el: HTMLInputElement; at: number } | null = null;
function selectOnTap(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  if (focused?.el === el && Date.now() - focused.at < 800) el.select();
  focused = null;
}

/**
 * Price per kg, lb, 斤, oz, per litre or gallon, or per item and dozen, with the same price in a second currency.
 * Every figure is a field: type in the big one or in any box and all the others follow.
 */
export function UnitPrice({ fx }: { fx: FxState & { refresh: () => void } }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [state, setState] = useState<Saved>(() => {
    try {
      const raw = localStorage.getItem("changle.price");
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Saved>;
        if (typeof saved.unit === "string" && typeof saved.text === "string" && isCode(saved.cur) && isCode(saved.alt)) {
          // saved before the boxes could be typed in: the price was the big field's
          return { kind: isKind(saved.kind) ? saved.kind : "mass", unit: saved.unit, text: saved.text, src: typeof saved.src === "string" ? saved.src : saved.unit, cur: saved.cur, alt: saved.alt };
        }
      }
    } catch {
      /* fine */
    }
    return { kind: "mass", unit: "lb", text: "12.99", src: "lb", cur: "CAD", alt: "CNY" };
  });
  useEffect(() => {
    try {
      localStorage.setItem("changle.price", JSON.stringify(state));
    } catch {
      /* fine */
    }
  }, [state]);

  const set = (patch: Partial<Saved>) => setState((s) => ({ ...s, ...patch }));
  const units = UNITS[state.kind];
  const from = units.find((u) => u.id === state.unit) ?? units[0];
  // the field typed in last holds the price; every other field shows it converted
  const src = units.find((u) => u.id === state.src) ?? from;
  const perBase = perBaseOf(cleanAmount(state.text), src);
  const decimals = CURRENCY_BY_CODE[state.cur].decimals;
  const rate = fx.rates ? convert(fx.rates, 1, state.cur, state.alt) : NaN;
  const showAlt = state.alt !== state.cur && Number.isFinite(rate);
  const shown = (u: Unit) => (u.id === src.id ? state.text : figure(lang, perBase * u.size, decimals));
  const name = (u: Unit) => (zh ? u.zh : u.en);

  /** Tapping a field makes it the one typed in: it takes its own figure as plain digits, so nothing on screen moves. */
  const focus = (u: Unit) => (e: FocusEvent<HTMLInputElement>) => {
    if (u.id !== src.id) set({ src: u.id, text: plainFigure(perBase * u.size, decimals) });
    const el = e.currentTarget;
    focused = { el, at: Date.now() };
    window.setTimeout(() => el.select(), 0);
  };
  const type = (u: Unit, value: string) => set({ src: u.id, text: capDigits(cleanAmount(value), 9) });
  const field = (u: Unit) => ({
    inputMode: "decimal" as const,
    enterKeyHint: "done" as const,
    value: shown(u),
    onFocus: focus(u),
    onClick: selectOnTap,
    onChange: (e: { target: { value: string } }) => type(u, e.target.value),
    "aria-label": zh ? `每${name(u)}的价格` : `Price per ${u.en}`,
  });
  // a new kind starts on its usual unit, with the same figure in the big field
  const pickKind = (kind: Kind) => {
    if (kind === state.kind) return;
    const unit = kind === "mass" ? "lb" : kind === "volume" ? "gal" : "each";
    set({ kind, unit, src: unit, text: src.id === from.id ? state.text : plainFigure(perBase * from.size, decimals) });
  };
  // a unit picked for the big field: a figure typed there now means that unit; a box typed in keeps its price
  const pickUnit = (u: Unit) => set({ unit: u.id, src: src.id === from.id ? u.id : src.id });

  const rows = units.filter((u) => u.id !== from.id);
  // the longest figure sets the size of all of them; past that, one box per line
  const longest = Math.max(...rows.map((u) => SYMBOL[state.cur].length + shown(u).length));
  const listClass = longest > 12 ? "is-single" : longest > 9 ? "is-long" : "";

  return (
    <section className="tool" id="tool-price" aria-labelledby="price-title">
      <header className="tool-head">
        <h2 id="price-title" className="tool-title">
          <span>{zh ? "单价换算" : "Unit price"}</span>
          <small>{zh ? "Unit price" : "单价换算"}</small>
        </h2>
        <div className="seg seg-sm">
          <button type="button" aria-pressed={state.kind === "mass"} onClick={() => pickKind("mass")}>
            {zh ? "重量" : "Weight"}
          </button>
          <button type="button" aria-pressed={state.kind === "volume"} onClick={() => pickKind("volume")}>
            {zh ? "容量" : "Volume"}
          </button>
          <button type="button" aria-pressed={state.kind === "count"} onClick={() => pickKind("count")}>
            {zh ? "个数" : "Count"}
          </button>
        </div>
      </header>
      <RateStatus fx={fx} showAge />

      <div className="price-input">
        <select className="price-cur" value={state.cur} onChange={(e) => set({ cur: e.target.value as Code })} aria-label={zh ? "货币" : "Currency"}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {SYMBOL[c.code]} {c.code}
            </option>
          ))}
        </select>
        <input className={`price-amount tabular ${sizeClass(shown(from), [6, 8])}`} {...field(from)} />
      </div>
      <div className="unit-chips" role="group" aria-label={zh ? "单位" : "Unit"}>
        <span className="price-per">{zh ? "每" : "per"}</span>
        {units.map((u) => (
          <button key={u.id} type="button" className="chip chip-sm" aria-pressed={u.id === from.id} onClick={() => pickUnit(u)}>
            {name(u)}
          </button>
        ))}
      </div>

      <ul className={`price-list ${listClass}`}>
        {rows.map((u) => (
          <li key={u.id}>
            <label className="price-cell">
              <span className="price-unit">/{name(u)}</span>
              <span className="price-main">
                <span aria-hidden="true">{SYMBOL[state.cur]}</span>
                <input className="tabular" {...field(u)} />
              </span>
              {showAlt && (
                <span className="price-alt tabular">
                  ≈ {SYMBOL[state.alt]}
                  {figure(lang, perBase * u.size * rate, CURRENCY_BY_CODE[state.alt].decimals)}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <p className="price-note">
        {zh ? "每一格都能直接输入，别的跟着变。" : "Type in any box and the rest follow."}
        {state.kind === "mass" && (zh ? "1 斤按中国大陆的 500 克算。" : " 1 jīn 斤 is counted as mainland China's 500 g.")}
        {state.kind === "count" && (zh ? "1 打 = 12 个。" : " A dozen is 12.")}
      </p>
      <label className="price-also">
        <span>{zh ? "同时显示" : "Also show in"}</span>
        <select value={state.alt} onChange={(e) => set({ alt: e.target.value as Code })}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {zh ? c.zh : c.en}
            </option>
          ))}
        </select>
      </label>
      <PackCompare kind={state.kind} symbol={SYMBOL[state.cur]} lang={lang} />
    </section>
  );
}
