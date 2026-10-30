import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { convert, CURRENCIES, type Code, type FxState } from "./fx";

type Unit = { id: string; zh: string; en: string; size: number };

/** sizes in kilograms */
const MASS: Unit[] = [
  { id: "kg", zh: "公斤", en: "kg", size: 1 },
  { id: "lb", zh: "磅", en: "lb", size: 0.45359237 },
  { id: "jin", zh: "斤", en: "jīn 斤", size: 0.5 },
  { id: "oz", zh: "盎司", en: "oz", size: 0.028349523125 },
  { id: "100g", zh: "100 克", en: "100 g", size: 0.1 },
];
/** sizes in litres */
const VOLUME: Unit[] = [
  { id: "l", zh: "升", en: "L", size: 1 },
  { id: "gal", zh: "美制加仑", en: "US gal", size: 3.785411784 },
  { id: "impgal", zh: "英制加仑", en: "UK gal", size: 4.54609 },
  { id: "floz", zh: "液量盎司", en: "fl oz", size: 0.0295735295625 },
  { id: "100ml", zh: "100 毫升", en: "100 mL", size: 0.1 },
];

const SYMBOL: Record<Code, string> = { CAD: "$", CNY: "¥", USD: "US$", HKD: "HK$" };

/** Price per kg, lb, 斤, oz and per litre or gallon, with the same price in a second currency. */
export function UnitPrice({ fx }: { fx: FxState }) {
  const { lang } = useStore();
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem("changle.price");
      if (raw) return JSON.parse(raw) as { kind: "mass" | "volume"; unit: string; text: string; cur: Code; alt: Code };
    } catch {
      /* fine */
    }
    return { kind: "mass" as const, unit: "lb", text: "12.99", cur: "CAD" as Code, alt: "CNY" as Code };
  });
  useEffect(() => {
    try {
      localStorage.setItem("changle.price", JSON.stringify(state));
    } catch {
      /* fine */
    }
  }, [state]);

  const units = state.kind === "mass" ? MASS : VOLUME;
  const from = units.find((u) => u.id === state.unit) ?? units[0];
  const price = Number(state.text || "0");
  const perBase = price / from.size;
  const nf = useMemo(() => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang]);
  const rate = fx.rates ? convert(fx.rates, 1, state.cur, state.alt) : NaN;
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  return (
    <section className="tool" id="tool-price" aria-labelledby="price-title">
      <header className="tool-head">
        <h2 id="price-title" className="tool-title">
          <span>{lang === "zh" ? "单价换算" : "Unit price"}</span>
          <small>{lang === "zh" ? "Unit price" : "单价换算"}</small>
        </h2>
        <div className="seg seg-sm">
          <button type="button" aria-pressed={state.kind === "mass"} onClick={() => set({ kind: "mass", unit: "lb" })}>
            {lang === "zh" ? "重量" : "Weight"}
          </button>
          <button type="button" aria-pressed={state.kind === "volume"} onClick={() => set({ kind: "volume", unit: "gal" })}>
            {lang === "zh" ? "容量" : "Volume"}
          </button>
        </div>
      </header>

      <div className="price-input">
        <select className="price-cur" value={state.cur} onChange={(e) => set({ cur: e.target.value as Code })} aria-label={lang === "zh" ? "货币" : "Currency"}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {SYMBOL[c.code]} {c.code}
            </option>
          ))}
        </select>
        <input
          className="price-amount tabular"
          inputMode="decimal"
          enterKeyHint="done"
          value={state.text}
          onChange={(e) => set({ text: e.target.value.replace(/[^0-9.]/g, "").slice(0, 10) })}
          onFocus={(e) => {
            const el = e.currentTarget;
            window.setTimeout(() => el.select(), 0);
          }}
          aria-label={lang === "zh" ? "价格" : "Price"}
        />
      </div>
      <div className="unit-chips" role="group" aria-label={lang === "zh" ? "单位" : "Unit"}>
        <span className="price-per">{lang === "zh" ? "每" : "per"}</span>
        {units.map((u) => (
          <button key={u.id} type="button" className="chip chip-sm" aria-pressed={u.id === from.id} onClick={() => set({ unit: u.id })}>
            {lang === "zh" ? u.zh : u.en}
          </button>
        ))}
      </div>

      <ul className="price-list">
        {units
          .filter((u) => u.id !== from.id)
          .map((u) => {
            const v = perBase * u.size;
            return (
              <li key={u.id}>
                <span className="price-unit">/{lang === "zh" ? u.zh : u.en}</span>
                <span className="price-main tabular">
                  {SYMBOL[state.cur]}
                  {nf.format(v)}
                </span>
                {state.alt !== state.cur && Number.isFinite(rate) && (
                  <span className="price-alt tabular">
                    ≈ {SYMBOL[state.alt]}
                    {nf.format(v * rate)}
                  </span>
                )}
              </li>
            );
          })}
      </ul>
      <label className="price-also">
        <span>{lang === "zh" ? "同时显示" : "Also show in"}</span>
        <select value={state.alt} onChange={(e) => set({ alt: e.target.value as Code })}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {lang === "zh" ? c.zh : c.en}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
