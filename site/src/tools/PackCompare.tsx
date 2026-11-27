import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { capDigits, cleanAmount } from "./money";
import { figureDigits, MAX_PACKS, PACK_MASS, PACK_VOLUME, rankPacks, type Pack } from "./units";

const KEY = "changle.price.compare";
const TAGS = "ABCDEF";
type State = { open: boolean; packs: Pack[] };
const EMPTY: Pack = { price: "", qty: "", unit: "g", count: "" };
const FRESH: State = { open: false, packs: [EMPTY, EMPTY] };

/** What the phone kept: since 2026-11-26 a list of packs; before, packs a and b. */
function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FRESH;
    const saved = JSON.parse(raw) as { open?: boolean; packs?: Pack[]; a?: Pack; b?: Pack };
    const packs = Array.isArray(saved.packs) ? saved.packs : [saved.a, saved.b].filter((p): p is Pack => !!p);
    const ok = packs.filter((p) => p && typeof p.price === "string" && typeof p.qty === "string" && typeof p.unit === "string").slice(0, MAX_PACKS);
    while (ok.length < 2) ok.push(EMPTY);
    return { open: !!saved.open, packs: ok };
  } catch {
    return FRESH;
  }
}

/**
 * Packs on the shelf, which is the better buy: price, size and how many in each (a multipack), the
 * answer per kilogram or litre. Ideas from open-source price comparers: up to six packs, + and −
 * (Quick Unit Price Comparison, PriceGrab), each pack's own unit price (Price Per Unit), the
 * saving named against the second cheapest with a check that isn't only color, and a reset that
 * can be undone (PriceGrab).
 */
export function PackCompare({ kind, symbol, lang }: { kind: "mass" | "volume"; symbol: string; lang: "zh" | "en" }) {
  const zh = lang === "zh";
  const [state, setState] = useState<State>(load);
  // the packs as they were before 清空, until the next change
  const [undo, setUndo] = useState<Pack[] | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* fine */
    }
  }, [state]);

  const units = kind === "mass" ? PACK_MASS : PACK_VOLUME;
  // a unit saved under the other kind falls back to grams or millilitres
  const packs = state.packs.map((p) => ({ ...p, unit: units.some((u) => u.id === p.unit) ? p.unit : units[0].id }));
  const { per, verdict } = rankPacks(packs, units);
  const base = kind === "mass" ? (zh ? "公斤" : "kg") : zh ? "升" : "L";
  const money = (v: number) =>
    symbol + new Intl.NumberFormat(zh ? "zh-CN" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, figureDigits(v, 2)) }).format(v);
  const setPacks = (next: Pack[]) => {
    setUndo(null);
    setState((s) => ({ ...s, packs: next }));
  };
  const edit = (i: number, patch: Partial<Pack>) => setPacks(packs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const filled = packs.some((p) => p.price || p.qty || p.count);

  const names = (ids: number[]) => ids.map((i) => TAGS[i]).join(zh ? "、" : " and ");
  const verdictText = () => {
    if (!verdict) {
      const eg = kind === "mass" ? (zh ? "100 克 × 6" : "100 g × 6") : zh ? "355 毫升 × 12" : "355 mL × 12";
      return zh ? `填上至少两个的价格和分量就能比。多件装在 × 后面填件数，比如 ${eg}。` : `Fill in the price and size of two or more to compare. For a multipack, put the count after ×: ${eg}.`;
    }
    const { best, next, pct, save } = verdict;
    const low = money(per[best[0]]!);
    if (next === null) return zh ? `${best.length === 2 ? "两个" : "都"}一样价：每${base} ${low}。` : `${best.length === 2 ? "They" : "They all"} cost the same: ${low} per ${base}.`;
    const two = per.filter((v) => v !== null).length === 2;
    const lead = best.length > 1 ? (zh ? `${names(best)} 一样，最划算` : `${names(best)} cost the same and are the best buy`) : zh ? `${TAGS[best[0]]} ${two ? "更" : "最"}划算` : `${TAGS[best[0]]} is the ${two ? "better" : "best"} buy`;
    const vs = two ? (zh ? ` ${TAGS[next]}` : TAGS[next]) : zh ? `第二便宜的 ${TAGS[next]}` : `${TAGS[next]}, the next cheapest`;
    return zh ? `${lead}：比${vs} 便宜 ${pct}%，每${base}省 ${money(save)}。` : `${lead}: ${pct}% less than ${vs}, ${money(save)} less per ${base}.`;
  };

  return (
    <div className="pack-compare">
      <button type="button" className="link-btn pack-toggle" aria-expanded={state.open} aria-controls="pack-compare-body" onClick={() => setState((s) => ({ ...s, open: !s.open }))}>
        {zh ? "几个包装，哪个划算" : "Which pack is the better buy?"}
        <ChevronDown size={16} className={state.open ? "is-open" : ""} aria-hidden="true" />
      </button>
      {state.open && (
        <div id="pack-compare-body" className="pack-body">
          {packs.map((p, i) => {
            const tag = TAGS[i];
            const better = !!verdict?.best.includes(i);
            const v = per[i];
            return (
              <div key={i} className={`pack-row ${better ? "is-better" : ""}`}>
                <span className="pack-tag" aria-hidden="true">
                  {tag}
                </span>
                <div className="pack-line">
                  <label className="pack-field pack-price">
                    <span className="pack-prefix">{symbol}</span>
                    <input
                      className="tabular"
                      inputMode="decimal"
                      enterKeyHint="next"
                      placeholder={zh ? "价格" : "price"}
                      value={p.price}
                      aria-label={zh ? `${tag} 的价格` : `Price of ${tag}`}
                      onChange={(e) => edit(i, { price: capDigits(cleanAmount(e.target.value), 9) })}
                    />
                  </label>
                  <span className={`pack-per tabular ${v === null ? "" : "is-set"}`}>
                    {better && <Check size={14} aria-hidden="true" />}
                    {v === null ? "" : zh ? `每${base} ${money(v)}` : `${money(v)}/${base}`}
                    {better && <span className="ui-visually-hidden">{zh ? "，最划算" : ", the best buy"}</span>}
                  </span>
                </div>
                <div className="pack-line">
                  <label className="pack-field pack-qty">
                    <input
                      className="tabular"
                      inputMode="decimal"
                      enterKeyHint="next"
                      placeholder={zh ? "分量" : "size"}
                      value={p.qty}
                      aria-label={zh ? `${tag} 的分量` : `Size of ${tag}`}
                      onChange={(e) => edit(i, { qty: capDigits(cleanAmount(e.target.value), 9) })}
                    />
                  </label>
                  <select className="pack-unit" value={p.unit} aria-label={zh ? `${tag} 的单位` : `Unit of ${tag}`} onChange={(e) => edit(i, { unit: e.target.value })}>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {zh ? u.zh : u.en}
                      </option>
                    ))}
                  </select>
                  <label className="pack-field pack-count">
                    <span className="pack-prefix">×</span>
                    <input
                      className="tabular"
                      inputMode="numeric"
                      enterKeyHint="done"
                      placeholder="1"
                      value={p.count ?? ""}
                      aria-label={zh ? `${tag} 一包几件` : `How many in ${tag}`}
                      onChange={(e) => edit(i, { count: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          <p className={`pack-verdict ${verdict ? "is-set" : ""}`} role="status">
            {verdictText()}
          </p>
          <div className="pack-actions">
            {packs.length < MAX_PACKS && (
              <button type="button" className="link-btn" onClick={() => setPacks([...packs, { ...EMPTY, unit: units[0].id }])}>
                <Plus size={16} aria-hidden="true" />
                {zh ? "再加一个" : "Add a pack"}
              </button>
            )}
            {packs.length > 2 && (
              <button type="button" className="link-btn" onClick={() => setPacks(packs.slice(0, -1))}>
                <Minus size={16} aria-hidden="true" />
                {zh ? `去掉 ${TAGS[packs.length - 1]}` : `Remove ${TAGS[packs.length - 1]}`}
              </button>
            )}
            {undo ? (
              <button
                type="button"
                className="link-btn pack-reset"
                onClick={() => {
                  setState((s) => ({ ...s, packs: undo }));
                  setUndo(null);
                }}
              >
                {zh ? "撤销清空" : "Undo clear"}
              </button>
            ) : (
              filled && (
                <button
                  type="button"
                  className="link-btn pack-reset"
                  onClick={() => {
                    const before = packs;
                    setState((s) => ({ ...s, packs: before.map((p) => ({ ...EMPTY, unit: p.unit })) }));
                    setUndo(before);
                  }}
                >
                  {zh ? "清空" : "Clear"}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
