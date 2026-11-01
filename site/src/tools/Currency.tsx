import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, reduced } from "../lib/anim";
import { useStore } from "../store";
import { cleanAmount as clean, convert, CURRENCIES, type Code, type FxState } from "./fx";

/** CAD = CNY = USD = HKD: type in any row, the others follow. */
export function Currency({ fx }: { fx: FxState & { refresh: () => void } }) {
  const { lang } = useStore();
  const [base, setBase] = useState<{ code: Code; text: string }>(() => {
    try {
      const raw = localStorage.getItem("changle.fx.base");
      if (raw) return JSON.parse(raw);
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

  const nf = useMemo(() => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang]);
  const rf = useMemo(() => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { maximumSignificantDigits: 5 }), [lang]);
  const amount = Number(base.text || "0");
  const spinner = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!spinner.current || reduced()) return;
    if (fx.loading) {
      const tw = gsap.to(spinner.current, { rotate: "+=360", duration: 0.9, repeat: -1, ease: "none" });
      return () => {
        tw.kill();
        gsap.set(spinner.current, { rotate: 0 });
      };
    }
  }, [fx.loading]);

  const value = (code: Code) => {
    if (code === base.code) return base.text;
    if (!fx.rates) return "";
    const v = convert(fx.rates, amount, base.code, code);
    return Number.isFinite(v) ? nf.format(v) : "";
  };

  return (
    <section className="tool" id="tool-fx" aria-labelledby="fx-title">
      <header className="tool-head">
        <h2 id="fx-title" className="tool-title">
          <span>{lang === "zh" ? "汇率" : "Currency"}</span>
          <small>{lang === "zh" ? "Currency" : "汇率"}</small>
        </h2>
        <button type="button" className="tool-meta" onClick={fx.refresh} aria-label={lang === "zh" ? "刷新汇率" : "Refresh rates"}>
          <span>{fx.error && !fx.rates ? (lang === "zh" ? "连不上汇率服务" : "Rates unavailable") : fx.at ? updatedText(fx.at, lang) : lang === "zh" ? "获取中" : "Fetching"}</span>
          <RefreshCw ref={spinner} size={15} />
        </button>
      </header>
      <div className="fx-list">
        {CURRENCIES.map((c) => {
          const active = c.code === base.code;
          return (
            <label key={c.code} className={`fx-row ${active ? "is-active" : ""}`}>
              <span className="fx-code">{c.code}</span>
              <span className="fx-name">{lang === "zh" ? c.zh : c.en}</span>
              <input
                className="fx-input tabular"
                inputMode="decimal"
                enterKeyHint="done"
                value={value(c.code)}
                aria-label={`${c.code} ${lang === "zh" ? c.zh : c.en}`}
                onFocus={(e) => {
                  if (!active) {
                    const raw = value(c.code).replace(/[^0-9.]/g, "");
                    setBase({ code: c.code, text: raw });
                  }
                  const el = e.currentTarget;
                  window.setTimeout(() => el.select(), 0);
                }}
                onChange={(e) => setBase({ code: c.code, text: clean(e.target.value).slice(0, 14) })}
              />
              {!active && fx.rates && (
                <span className="fx-rate tabular">
                  1 {base.code} = {rf.format(convert(fx.rates, 1, base.code, c.code))} {c.code}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function updatedText(at: number, lang: "zh" | "en") {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return lang === "zh" ? "刚刚更新" : "Updated just now";
  const rtf = new Intl.RelativeTimeFormat(lang === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  const when = mins < 60 ? rtf.format(-mins, "minute") : mins < 60 * 48 ? rtf.format(-Math.round(mins / 60), "hour") : rtf.format(-Math.round(mins / 1440), "day");
  return lang === "zh" ? `${when}更新` : `Updated ${when}`;
}
