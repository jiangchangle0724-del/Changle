import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { capDigits, cleanAmount } from "./money";
import { comparePacks, PACK_MASS, PACK_VOLUME, type Pack } from "./units";

const KEY = "changle.price.compare";
type State = { open: boolean; a: Pack; b: Pack };
const FRESH: State = { open: false, a: { price: "", qty: "", unit: "g" }, b: { price: "", qty: "", unit: "g" } };

/** Two packs on the shelf, which one is the better buy: price and size of each, the answer per kilogram or litre. */
export function PackCompare({ kind, symbol, lang }: { kind: "mass" | "volume"; symbol: string; lang: "zh" | "en" }) {
  const zh = lang === "zh";
  const [state, setState] = useState<State>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...FRESH, ...(JSON.parse(raw) as Partial<State>) };
    } catch {
      /* fine */
    }
    return FRESH;
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* fine */
    }
  }, [state]);

  const units = kind === "mass" ? PACK_MASS : PACK_VOLUME;
  // a unit saved under the other kind falls back to grams or millilitres
  const unitOf = (p: Pack) => (units.some((u) => u.id === p.unit) ? p.unit : units[0].id);
  const packs = { a: { ...state.a, unit: unitOf(state.a) }, b: { ...state.b, unit: unitOf(state.b) } };
  const verdict = comparePacks(packs.a, packs.b, units);
  const nf = useMemo(() => new Intl.NumberFormat(zh ? "zh-CN" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [zh]);
  const base = kind === "mass" ? (zh ? "公斤" : "kg") : zh ? "升" : "L";
  const edit = (id: "a" | "b", patch: Partial<Pack>) => setState((s) => ({ ...s, [id]: { ...packs[id], ...patch } }));

  const verdictText = () => {
    if (!verdict) return zh ? "两边都填上价格和分量，就能比。" : "Fill in both prices and sizes to compare.";
    if (verdict.better === "same") return zh ? `两个一样价：每${base} ${symbol}${nf.format(verdict.a)}。` : `They cost the same: ${symbol}${nf.format(verdict.a)} per ${base}.`;
    const w = verdict.better === "a" ? "A" : "B";
    const l = verdict.better === "a" ? "B" : "A";
    const per = symbol + nf.format(verdict.better === "a" ? verdict.a : verdict.b);
    const other = symbol + nf.format(verdict.better === "a" ? verdict.b : verdict.a);
    return zh ? `${w} 更划算：每${base} ${per}，比 ${l} 便宜 ${verdict.pct}%（${l} 每${base} ${other}）。` : `${w} is the better buy: ${per} per ${base}, ${verdict.pct}% less than ${l} (${other} per ${base}).`;
  };

  return (
    <div className="pack-compare">
      <button type="button" className="link-btn pack-toggle" aria-expanded={state.open} aria-controls="pack-compare-body" onClick={() => setState((s) => ({ ...s, open: !s.open }))}>
        {zh ? "两个包装，哪个划算" : "Two packs: which is the better buy?"}
        <ChevronDown size={16} className={state.open ? "is-open" : ""} aria-hidden="true" />
      </button>
      {state.open && (
        <div id="pack-compare-body" className="pack-body">
          {(["a", "b"] as const).map((id) => {
            const tag = id.toUpperCase();
            const better = verdict?.better === id;
            return (
              <div key={id} className={`pack-row ${better ? "is-better" : ""}`}>
                <span className="pack-tag" aria-hidden="true">
                  {tag}
                </span>
                <label className="pack-field pack-price">
                  <span className="pack-prefix">{symbol}</span>
                  <input
                    className="tabular"
                    inputMode="decimal"
                    enterKeyHint="next"
                    placeholder={zh ? "价格" : "price"}
                    value={packs[id].price}
                    aria-label={zh ? `${tag} 的价格` : `Price of ${tag}`}
                    onChange={(e) => edit(id, { price: capDigits(cleanAmount(e.target.value), 9) })}
                  />
                </label>
                <label className="pack-field pack-qty">
                  <input
                    className="tabular"
                    inputMode="decimal"
                    enterKeyHint="done"
                    placeholder={zh ? "分量" : "size"}
                    value={packs[id].qty}
                    aria-label={zh ? `${tag} 的分量` : `Size of ${tag}`}
                    onChange={(e) => edit(id, { qty: capDigits(cleanAmount(e.target.value), 9) })}
                  />
                </label>
                <select className="pack-unit" value={packs[id].unit} aria-label={zh ? `${tag} 的单位` : `Unit of ${tag}`} onChange={(e) => edit(id, { unit: e.target.value })}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {zh ? u.zh : u.en}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          <p className={`pack-verdict ${verdict ? "is-set" : ""}`} role="status">
            {verdictText()}
          </p>
        </div>
      )}
    </div>
  );
}
