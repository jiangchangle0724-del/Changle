import { useCallback, useEffect, useState } from "react";
import { API } from "../config";

/** Units per one US dollar. */
export type Rates = Record<string, number>;
export type FxState = { rates: Rates | null; at: number; source: string; loading: boolean; error: boolean };

const KEY = "changle.fx.v1";
export const CURRENCIES = [
  { code: "CAD", zh: "加元", en: "Canadian dollar", symbol: "$" },
  { code: "CNY", zh: "人民币", en: "Chinese yuan", symbol: "¥" },
  { code: "USD", zh: "美元", en: "US dollar", symbol: "US$" },
  { code: "HKD", zh: "港元", en: "Hong Kong dollar", symbol: "HK$" },
] as const;
export type Code = (typeof CURRENCIES)[number]["code"];

function cached(): { rates: Rates; at: number; source: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.rates && typeof d.at === "number") return d;
  } catch {
    /* fine */
  }
  return null;
}

async function fromServer(signal: AbortSignal) {
  const res = await fetch(`${API}/fx`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const d = (await res.json()) as { rates: Rates; at: number; source: string };
  if (!d.rates?.CAD) throw new Error("bad");
  return d;
}

/** If the server is unreachable, ask a public daily source straight from the browser. */
async function fromPublic(signal: AbortSignal) {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal });
  const d = await res.json();
  if (!d?.rates?.CAD) throw new Error("bad");
  return { rates: d.rates as Rates, at: (d.time_last_update_unix ?? Date.now() / 1000) * 1000, source: "open.er-api.com" };
}

export function useRates(): FxState & { refresh: () => void } {
  const [state, setState] = useState<FxState>(() => {
    const c = cached();
    return { rates: c?.rates ?? null, at: c?.at ?? 0, source: c?.source ?? "", loading: true, error: false };
  });
  const [n, setN] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        let d;
        try {
          d = await fromServer(ctl.signal);
        } catch {
          d = await fromPublic(ctl.signal);
        }
        try {
          localStorage.setItem(KEY, JSON.stringify(d));
        } catch {
          /* fine */
        }
        setState({ rates: d.rates, at: d.at, source: d.source, loading: false, error: false });
      } catch {
        if (!ctl.signal.aborted) setState((s) => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => ctl.abort();
  }, [n]);

  // stay fresh while the page is open and visible
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setN((x) => x + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => setN((x) => x + 1), []);
  return { ...state, refresh };
}

/** Convert an amount between two currencies with per-USD rates. */
export function convert(rates: Rates, amount: number, from: string, to: string) {
  const f = rates[from];
  const t = rates[to];
  if (!f || !t) return NaN;
  return (amount / f) * t;
}

/** What a typed amount means: digits and one decimal point ("1.2.3" is 1.23; Chinese 。 and ，work). */
export const cleanAmount = (s: string) => {
  const t = s.replace(/[，,\s]/g, "").replace(/[。]/g, ".").replace(/[^0-9.]/g, "");
  const i = t.indexOf(".");
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
};
