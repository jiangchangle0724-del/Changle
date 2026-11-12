import { Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../components/Sheet";
import { play } from "../lib/motion";
import { sfx } from "../lib/sfx";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";
import { capDigits, cleanAmount as clean, convert, CURRENCIES, CURRENCY_BY_CODE, DEFAULT_CODES, isCode, MAX_DIGITS, sizeClass, type Code, type FxState } from "./fx";
import { RateStatus, updatedText } from "./RateStatus";

const CODES_KEY = "changle.fx.codes";

/** CAD = CNY = USD = HKD, and any other currency the server quotes: type in any row, the others follow. */
export function Currency({ fx }: { fx: FxState & { refresh: () => void } }) {
  const { lang } = useStore();
  const [codes, setCodes] = useState<Code[]>(() => {
    try {
      const raw = localStorage.getItem(CODES_KEY);
      const list = raw ? (JSON.parse(raw) as unknown[]).filter(isCode) : null;
      if (list && list.length) return list;
    } catch {
      /* fine */
    }
    return DEFAULT_CODES;
  });
  useEffect(() => {
    try {
      localStorage.setItem(CODES_KEY, JSON.stringify(codes));
    } catch {
      /* fine */
    }
  }, [codes]);

  const [base, setBase] = useState<{ code: Code; text: string }>(() => {
    try {
      const raw = localStorage.getItem("changle.fx.base");
      if (raw) {
        const b = JSON.parse(raw);
        if (isCode(b?.code) && typeof b.text === "string") return b;
      }
    } catch {
      /* fine */
    }
    return { code: "CAD", text: "100" };
  });
  useEffect(() => {
    try {
      localStorage.setItem("changle.fx.base", JSON.stringify(base));
    } catch {
      /* fine */
    }
  }, [base]);
  // the typed row must be one of the rows on screen
  const shownBase = codes.includes(base.code) ? base : { code: codes[0], text: base.text };

  const [adding, setAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const nfs = useMemo(() => {
    const locale = lang === "zh" ? "zh-CN" : "en-CA";
    return { 2: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 0: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }) };
  }, [lang]);
  const rf = useMemo(() => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { maximumSignificantDigits: 5 }), [lang]);
  const amount = Number(shownBase.text || "0");
  const spinner = useRef<SVGSVGElement>(null);

  // the refresh icon turns while the rates load
  useEffect(() => {
    if (!fx.loading) return;
    const turn = play(spinner.current, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 900, iterations: Infinity });
    return () => turn?.cancel();
  }, [fx.loading]);

  const value = (code: Code) => {
    if (code === shownBase.code) return shownBase.text;
    if (!fx.rates) return "";
    const v = convert(fx.rates, amount, shownBase.code, code);
    return Number.isFinite(v) ? nfs[CURRENCY_BY_CODE[code].decimals].format(v) : "";
  };
  // the amounts share one size, set by the longest of them
  const size = sizeClass(codes.map((c) => value(c)).reduce((a, b) => (b.length > a.length ? b : a), ""));
  const missing = CURRENCIES.filter((c) => !codes.includes(c.code));

  /** Take a row away; if it was the typed one, the amount moves to the first row left, converted, so nothing else jumps. */
  const remove = (code: Code) => {
    const left = codes.filter((x) => x !== code);
    if (!left.length) return;
    if (code === shownBase.code) {
      const next = left[0];
      const v = fx.rates ? convert(fx.rates, amount, shownBase.code, next) : NaN;
      setBase({ code: next, text: Number.isFinite(v) ? String(Number(v.toFixed(CURRENCY_BY_CODE[next].decimals))) : shownBase.text });
    }
    setCodes(left);
  };

  return (
    <section className="tool" id="tool-fx" aria-labelledby="fx-title">
      <header className="tool-head">
        <h2 id="fx-title" className="tool-title">
          <span>{lang === "zh" ? "汇率" : "Currency"}</span>
          <small>{lang === "zh" ? "Currency" : "汇率"}</small>
        </h2>
        <button type="button" className="tool-meta" onClick={fx.refresh}>
          <span>{fx.error && !fx.rates ? (lang === "zh" ? "连不上汇率服务" : "Rates unavailable") : fx.at ? updatedText(fx.at, lang) : lang === "zh" ? "获取中" : "Fetching"}</span>
          <span className="ui-visually-hidden">{lang === "zh" ? "，刷新汇率" : ", refresh the rates"}</span>
          <RefreshCw ref={spinner} size={15} />
        </button>
      </header>
      <RateStatus fx={fx} />
      <div className="fx-list">
        {codes.map((code) => {
          const c = CURRENCY_BY_CODE[code];
          const active = code === shownBase.code && !editMode;
          const shown = value(code);
          const rate = code !== shownBase.code && fx.rates ? convert(fx.rates, 1, shownBase.code, code) : NaN;
          return (
            <label key={code} className={`fx-row ${active ? "is-active" : ""} ${editMode ? "is-editing" : ""}`}>
              <span className="fx-code">{code}</span>
              {editMode ? (
                <span className="fx-remove-slot">
                  <span className="fx-amount tabular">{shown}</span>
                  <button type="button" className="icon-btn fx-remove" onClick={() => remove(code)} aria-label={lang === "zh" ? `移除${c.zh}` : `Remove ${c.en}`} disabled={codes.length <= 1}>
                    <X size={18} />
                  </button>
                </span>
              ) : (
                <input
                  className={`fx-input tabular ${size}`}
                  disabled={!active && !fx.rates}
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={shown}
                  aria-label={`${code} ${lang === "zh" ? c.zh : c.en}`}
                  onFocus={(e) => {
                    if (!active) {
                      const raw = value(code).replace(/[^0-9.]/g, "");
                      setBase({ code, text: raw });
                    }
                    const el = e.currentTarget;
                    window.setTimeout(() => el.select(), 0);
                  }}
                  onChange={(e) => setBase({ code, text: capDigits(clean(e.target.value), MAX_DIGITS) })}
                />
              )}
              {/* the name and the rate share the second line, so the amount above gets the row's full width */}
              <span className="fx-sub">
                <span className="fx-name">{lang === "zh" ? c.zh : c.en}</span>
                {Number.isFinite(rate) && (
                  <span className="fx-rate tabular">
                    1 {shownBase.code} = {rf.format(rate)} {code}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div className="tool-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} disabled={!missing.length}>
          <Plus size={16} />
          {lang === "zh" ? "加货币" : "Add a currency"}
        </button>
        <button type="button" className="link-btn" onClick={() => setEditMode((e) => !e)}>
          {editMode ? (lang === "zh" ? "完成" : "Done") : lang === "zh" ? "移除货币" : "Remove currencies"}
        </button>
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title={lang === "zh" ? "加货币" : "Add a currency"}>
        {!missing.length && <EmptyState title={lang === "zh" ? "货币都加上了" : "Every currency is already here"} />}
        <div className="picker">
          {missing.map((c) => (
            <button
              key={c.code}
              type="button"
              className="chip"
              onClick={() => {
                setCodes((l) => [...l, c.code]);
                sfx.pop();
              }}
            >
              {c.code} {lang === "zh" ? c.zh : c.en}
              <span className="muted">{lang === "zh" ? c.en : c.zh}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}
