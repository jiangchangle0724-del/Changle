import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { capDigits, cleanAmount, convert, CURRENCIES, sizeClass, type Code, type FxState } from "./fx";
import { PackCompare } from "./PackCompare";
import { RateStatus } from "./RateStatus";
import { MASS, VOLUME } from "./units";

const SYMBOL: Record<Code, string> = { CAD: "$", CNY: "¥", USD: "US$", HKD: "HK$" };

/** Price per kg, lb, 斤, oz and per litre or gallon, with the same price in a second currency. */
export function UnitPrice({ fx }: { fx: FxState & { refresh: () => void } }) {
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
  const price = Number(cleanAmount(state.text) || "0");
  const perBase = price / from.size;
  const nf = useMemo(() => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang]);
  const rate = fx.rates ? convert(fx.rates, 1, state.cur, state.alt) : NaN;
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const rows = units
    .filter((u) => u.id !== from.id)
    .map((u) => {
      const v = perBase * u.size;
      return { u, main: `${SYMBOL[state.cur]}${nf.format(v)}`, alt: state.alt !== state.cur && Number.isFinite(rate) ? `≈ ${SYMBOL[state.alt]}${nf.format(v * rate)}` : "" };
    });
  // the longest figure sets the size of all of them; past that, one box per line
  const longest = Math.max(...rows.map((r) => r.main.length));
  const listClass = longest > 12 ? "is-single" : longest > 9 ? "is-long" : "";

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
      <RateStatus fx={fx} showAge />

      <div className="price-input">
        <select className="price-cur" value={state.cur} onChange={(e) => set({ cur: e.target.value as Code })} aria-label={lang === "zh" ? "货币" : "Currency"}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {SYMBOL[c.code]} {c.code}
            </option>
          ))}
        </select>
        <input
          className={`price-amount tabular ${sizeClass(state.text, [6, 8])}`}
          inputMode="decimal"
          enterKeyHint="done"
          value={state.text}
          onChange={(e) => set({ text: capDigits(cleanAmount(e.target.value), 9) })}
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

      <ul className={`price-list ${listClass}`}>
        {rows.map(({ u, main, alt }) => (
          <li key={u.id}>
            <span className="price-unit">/{lang === "zh" ? u.zh : u.en}</span>
            <span className="price-main tabular">{main}</span>
            {alt && <span className="price-alt tabular">{alt}</span>}
          </li>
        ))}
      </ul>
      {state.kind === "mass" && <p className="price-note">{lang === "zh" ? "1 斤按中国大陆的 500 克算。" : "1 jīn 斤 is counted as mainland China's 500 g."}</p>}
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
      <PackCompare kind={state.kind} symbol={SYMBOL[state.cur]} lang={lang} />
    </section>
  );
}
