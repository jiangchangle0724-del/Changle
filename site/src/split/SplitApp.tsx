/**
 * 两清 · All Square, at changle.ca/split: who paid what on a trip, and the fewest transfers that
 * square it up. Its screens live inside the site (the site's own components, colours and words in
 * both languages), in a file of their own that loads when someone opens it.
 *
 * This first stage keeps every ledger on the phone that started it (store.ts): the three screens
 * and the arithmetic, there to be tried. Sharing a ledger by a link comes with the server, next.
 * Until then it has no card on the Tools tab: its address is the only way in.
 */
import { useEffect } from "react";
import { setLight } from "../lib/motion";
import "../ui/base.css";
import { ToastProvider } from "../ui/Toast";
import { LedgerPage } from "./LedgerPage";
import { Ledgers } from "./Ledgers";
import "./split.css";

export function SplitApp({ id, onBack }: { id?: string; onBack: () => void }) {
  // a tool's light is amber: the room takes it while 两清 is open
  useEffect(() => {
    const amber = getComputedStyle(document.documentElement).getPropertyValue("--type-tool").trim();
    if (amber) setLight(amber);
  }, []);
  return (
    <ToastProvider>
      {/* (a ledger's page starts afresh for each ledger: which view it was on belongs to that ledger) */}
      <div className="split ui-category-tool">{id ? <LedgerPage key={id} id={id} /> : <Ledgers onBack={onBack} />}</div>
    </ToastProvider>
  );
}
