import { useCallback, useEffect, useState } from "react";
import { API } from "../config";
import type { Rates } from "./money";

export { capDigits, cleanAmount, convert, CURRENCIES, CURRENCY_BY_CODE, DEFAULT_CODES, isCode, MAX_DIGITS, sizeClass, type Code, type Currency, type Rates } from "./money";
export type FxState = { rates: Rates | null; at: number; source: string; loading: boolean; error: boolean };

const KEY = "changle.fx.v1";
/** How long each source may take before the next one is asked: a hung server used to leave the page on "fetching" forever. */
const SERVER_TIMEOUT = 7000;
const PUBLIC_TIMEOUT = 8000;

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

/** A signal that aborts with `outer`, or on its own after `ms`. */
function within(ms: number, outer: AbortSignal) {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), ms);
  outer.addEventListener(
    "abort",
    () => {
      window.clearTimeout(timer);
      ctl.abort();
    },
    { once: true },
  );
  return ctl.signal;
}

async function fromServer(signal: AbortSignal) {
  const res = await fetch(`${API}/fx`, { signal: within(SERVER_TIMEOUT, signal), cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const d = (await res.json()) as { rates: Rates; at: number; source: string };
  if (!d.rates?.CAD) throw new Error("bad");
  return d;
}

/** If the server is unreachable, ask a public daily source straight from the browser. */
async function fromPublic(signal: AbortSignal) {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: within(PUBLIC_TIMEOUT, signal) });
  if (!res.ok) throw new Error(String(res.status));
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
    setState((s) => ({ ...s, loading: true, error: false }));
    (async () => {
      try {
        let d;
        try {
          d = await fromServer(ctl.signal);
        } catch {
          if (ctl.signal.aborted) return;
          d = await fromPublic(ctl.signal);
        }
        if (ctl.signal.aborted) return;
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
