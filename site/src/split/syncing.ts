/**
 * This phone's ledgers kept in step with the server while 两清 is open. Three things meet here:
 * what the phone keeps (store.ts), the server (net.ts), and for each ledger that has something to
 * send or is open on the screen, one syncer (syncer.ts) between the two.
 *
 * The screens come here to open a ledger, to change one (`record`), and to hear how the sending
 * is going. A ledger that is open on the screen also listens for what other phones record; the
 * others only send what they have. All of it stops when 两清 is left.
 */
import { useSyncExternalStore } from "react";
import type { Change } from "./changes";
import type { Ledger } from "./core";
import { net } from "./net";
import { dropHeld, everyHeld, heldOf, keepHeld, newId, newKey, write } from "./store";
import { hold, holds, shown } from "./sync";
import { syncer, type Syncer, type SyncState } from "./syncer";

type Running = { syncer: Syncer; state: SyncState; watchers: number };

const running = new Map<string, Running>();
const listeners = new Set<() => void>();
const IDLE: SyncState = { sending: false, live: false, away: false, trouble: null };
const same = (a: SyncState, b: SyncState) => a.sending === b.sending && a.live === b.live && a.away === b.away && a.trouble === b.trouble;

/** The syncer for a ledger this phone holds, started the first time it is wanted. */
function run(id: string): Running | null {
  const there = running.get(id);
  if (there) return there;
  if (!heldOf(id)) return null;
  const r: Running = {
    watchers: 0,
    state: IDLE,
    syncer: syncer({
      read: () => heldOf(id),
      write: (how) => write(id, how),
      net,
      watching: false,
      changed: (next) => {
        if (same(next, r.state)) return;
        r.state = next;
        for (const l of listeners) l();
      },
      later: (go, ms) => {
        const timer = window.setTimeout(go, ms);
        return () => window.clearTimeout(timer);
      },
      newId,
      now: Date.now,
    }),
  };
  running.set(id, r);
  return r;
}

const wakeAll = () => {
  for (const r of running.values()) r.syncer.wake();
};
const onFront = () => {
  if (document.visibilityState === "visible") wakeAll();
};

/** how many of 两清's screens are up (one; for a moment none, while one takes another's place) */
let open = 0;

/**
 * 两清 is open: send whatever this phone recorded and couldn't send last time, and from now on try
 * again whenever the page comes back to the front or the phone finds a signal. Returns how to stop
 * (两清 is left).
 *
 * Going from the list to a ledger takes one screen down and puts the next up in the same breath, so
 * leaving waits a moment to see whether anything came up in its place: a request that was on its
 * way isn't dropped and sent again just for changing screens.
 */
export function startSyncing(): () => void {
  if (open === 0) {
    window.addEventListener("online", wakeAll);
    document.addEventListener("visibilitychange", onFront);
  }
  open += 1;
  for (const h of everyHeld()) if (!h.made || h.waiting.length) run(h.server.id)?.syncer.wake();
  return () => {
    open -= 1;
    if (open > 0) return;
    window.removeEventListener("online", wakeAll);
    document.removeEventListener("visibilitychange", onFront);
    window.setTimeout(() => {
      if (open > 0) return;
      for (const r of running.values()) r.syncer.stop();
      running.clear();
      for (const l of listeners) l();
    });
  };
}

/** A ledger is open on the screen: listen for what others record, until the returned function is called. */
export function watch(id: string): () => void {
  const r = run(id);
  if (!r) return () => undefined;
  r.watchers += 1;
  r.syncer.watch(true);
  r.syncer.wake();
  return () => {
    r.watchers -= 1;
    // (a moment later, for the same reason: the page may only be redrawing itself)
    window.setTimeout(() => r.watchers === 0 && r.syncer.watch(false));
  };
}

/** A new ledger, held on this phone from this moment and made on the server as soon as it can be reached. */
export function openLedger(ledger: Ledger, me: string) {
  keepHeld(hold(ledger, newKey()), me);
  run(ledger.id)?.syncer.wake();
}

/**
 * The phone does something to a ledger. True when the ledger now says what the change was for: it
 * was recorded here (and goes to the server when it can), or it was already so.
 */
export function record(id: string, change: Change): boolean {
  if (run(id)?.syncer.do(change)) return true;
  const h = heldOf(id);
  return !!h && holds(shown(h), change);
}

/** The screen has told the user about these changes that didn't stick. */
export function dismissLost(id: string, changes: string[]) {
  const r = run(id);
  for (const change of changes) r?.syncer.dismiss(change);
}

/** A ledger taken off this phone. (The server's copy stays: only its owner will be able to delete that, once there are accounts.) */
export function forget(id: string) {
  running.get(id)?.syncer.stop();
  running.delete(id);
  dropHeld(id);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** How the sending is going for one ledger; redraws when it changes. */
export const useSync = (id: string): SyncState => useSyncExternalStore(subscribe, () => running.get(id)?.state ?? IDLE);
