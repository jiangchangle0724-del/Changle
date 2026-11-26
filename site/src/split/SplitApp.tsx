/**
 * 两清 · All Square, at changle.ca/split: who paid what on a trip, and the fewest transfers that
 * square it up. Its screens live inside the site (the site's own components, colours and words in
 * both languages), in a file of their own that loads when someone opens it.
 *
 * A ledger is kept on the server (tools/split), and every phone that has it keeps a copy with
 * whatever it has recorded and not yet sent (store.ts, syncing.ts), so it works with no signal.
 * Starting one needs a changle.ca sign-in, and then the account keeps its ledgers; joining one
 * from an invitation doesn't. It has no card on the Tools tab yet: its address is the only way in.
 */
import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { setLight } from "../lib/motion";
import "../ui/base.css";
import { ToastProvider } from "../ui/Toast";
import { viewKeyFrom } from "./invite";
import { LedgerPage } from "./LedgerPage";
import { Ledgers } from "./Ledgers";
import "./split.css";
import { heldOf } from "./store";
import { setAccount, startSyncing, syncMine } from "./syncing";
import { Viewing } from "./ViewLink";

export function SplitApp({ id, onBack }: { id?: string; onBack: () => void }) {
  // a tool's light is amber: the room takes it while 两清 is open
  useEffect(() => {
    const amber = getComputedStyle(document.documentElement).getPropertyValue("--type-tool").trim();
    if (amber) setLight(amber);
  }, []);
  // what this phone recorded and couldn't send goes up while 两清 is open, whichever screen is showing
  useEffect(() => startSyncing(), []);
  // Signed in, the account's ledgers and this phone's are made one: now, when the sign-in changes,
  // and whenever the page comes back to the front (another of the account's phones may have
  // started one, or taken one off).
  const { me, status } = useAccount();
  const account = status === "in" && me ? me.id : null;
  useEffect(() => {
    setAccount(account);
    if (!account) return;
    const onFront = () => document.visibilityState === "visible" && void syncMine();
    document.addEventListener("visibilitychange", onFront);
    return () => document.removeEventListener("visibilitychange", onFront);
  }, [account]);
  return (
    <ToastProvider>
      {/* (a ledger's page starts afresh for each ledger: which view it was on belongs to that ledger) */}
      <div className="split ui-category-tool">{id ? <OneLedger key={id} id={id} /> : <Ledgers onBack={onBack} />}</div>
    </ToastProvider>
  );
}

/**
 * One ledger's address. Opened by a 查看链接 (its key after the #, as `v=`), a phone that doesn't
 * hold the ledger shows it to look at (ViewLink.tsx). One that does is in the ledger already, so the
 * link opens the ledger's own page, and comes off the address.
 */
function OneLedger({ id }: { id: string }) {
  const [view, setView] = useState(() => viewKeyFrom(window.location.hash));
  // (an invitation pasted over it, in the same tab, is the ledger's own page: LedgerPage takes it from there)
  useEffect(() => {
    const onHash = () => setView(viewKeyFrom(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const looking = view !== null && !heldOf(id);
  useEffect(() => {
    if (view !== null && !looking) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, [view, looking]);
  return looking ? <Viewing id={id} view={view} /> : <LedgerPage id={id} />;
}
