/**
 * This phone's ledgers kept in step with the server while 两清 is open. Three things meet here:
 * what the phone keeps (store.ts), the server (net.ts), and for each ledger that has something to
 * send or is open on the screen, one syncer (syncer.ts) between the two.
 *
 * The screens come here to open a ledger, to change one (`record`), to lock it, change its key or
 * delete it (its owner's phone only), and to hear how the sending is going. A ledger that is open
 * on the screen also listens for what other phones record; the others only send what they have.
 * All of it stops when 两清 is left.
 *
 * Signed in to changle.ca, the phone's ledgers and the account's "my ledgers" on the server are
 * kept as one (syncMine): what the account has comes to the phone, and what the phone has goes to
 * the account. So a new phone signed in has every ledger, and is still the owner where it was.
 */
import { useSyncExternalStore } from "react";
import type { Change } from "./changes";
import type { Ledger } from "./core";
import { deleteLedger, mineNet, net } from "./net";
import type { Mine } from "./shape";
import { dropHeld, everyHeld, heldOf, keepHeld, meOf, newId, newKey, setMe, write } from "./store";
import { hold, holds, join, notOwner, opened, shown, type Held } from "./sync";
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
      write: (how) => {
        const was = heldOf(id)?.made;
        write(id, how);
        // (made while signed in: the server put it in the account's ledgers as it made it, and the
        // phone hears so from the account's list, so it is the account's on this phone at once)
        if (was === false && heldOf(id)?.made && account) void syncMine();
      },
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

/**
 * The list of ledgers is on the screen: ask the server where each one stands, now and whenever the
 * page comes back to the front, so a card says what you owe after what others recorded. Returns
 * how to stop (the list is left).
 */
export function browse(): () => void {
  const lookAll = () => {
    for (const h of everyHeld()) run(h.server.id)?.syncer.look();
  };
  const onBack = () => {
    if (document.visibilityState === "visible") lookAll();
  };
  lookAll();
  document.addEventListener("visibilitychange", onBack);
  return () => document.removeEventListener("visibilitychange", onBack);
}

/** How opening an invitation went: the phone holds the ledger now; or the link's key doesn't open it; or the ledger is gone; or nothing answered. */
export type Joined = "in" | "key" | "gone" | "away";

/**
 * Someone opened an invitation: a ledger's id, and the key that opens it. The ledger is read from
 * the server with that key, and from then on this phone holds it like any other (who its owner is
 * among the people in it isn't known yet: the ledger's page asks).
 */
export async function joinLedger(id: string, key: string): Promise<Joined> {
  const joined = await join1(id, key);
  // (signed in, a ledger joined goes to the account's ledgers)
  if (joined === "in" && account) void syncMine();
  return joined;
}

async function join1(id: string, key: string): Promise<Joined> {
  const has = heldOf(id);
  if (has) {
    // An invitation with another key than the phone's: its owner may have changed the key since
    // this phone came in. It is tried, and kept only if it opens the ledger; an old link, or a
    // wrong one, changes nothing. What this phone had waiting to send stays, and goes with the new key.
    if (has.key !== key && has.next !== key) {
      const now = await net.read(id, key);
      const data = now.data;
      if (now.status === 200 && data?.ledger.id === id && heldOf(id)) {
        write(id, (h) => opened(h, key, data));
        run(id)?.syncer.rekeyed();
      }
    }
    return "in";
  }
  const got = await net.read(id, key);
  // (an answer about some other ledger is no answer: only the one asked for is kept)
  if (got.status === 200 && got.data?.ledger.id === id) {
    // (not twice: another tab may have opened the same invitation meanwhile)
    if (!heldOf(id)) keepHeld(join(got.data, key));
    return "in";
  }
  return got.status === 403 ? "key" : got.status === 404 ? "gone" : "away";
}

/**
 * A new ledger, held on this phone from this moment and made on the server as soon as it can be
 * reached. This phone is its owner: it makes the key that opens the ledger, and a second one that
 * it never gives out.
 */
export function openLedger(ledger: Ledger, me: string) {
  keepHeld(hold(ledger, newKey(), newKey()), me);
  run(ledger.id)?.syncer.wake();
}

/** The owner locks a ledger, or opens it again. False when it couldn't be done just now (no signal). */
export const lockLedger = (id: string, locked: boolean): Promise<boolean> => run(id)?.syncer.lock(locked) ?? Promise.resolve(false);

/**
 * The owner changes the key that opens a ledger: every invitation sent so far stops working. The
 * phone holds the new key from this moment (`next`), and it is the ledger's key once the server
 * has it, which what the phone holds then shows.
 */
export function rekeyLedger(id: string) {
  run(id)?.syncer.rekey(newKey());
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

/** A ledger off this phone: its syncer stopped, what is held of it dropped. */
function forgetHere(id: string) {
  running.get(id)?.syncer.stop();
  running.delete(id);
  dropHeld(id);
}

/**
 * A ledger taken off this phone; signed in, and in the account's ledgers, off those too (so it
 * comes back on no phone of the account). That needs the server: false when it couldn't be
 * reached, and nothing changed. The ledger itself stays on the server for the others.
 */
export async function removeLedger(id: string): Promise<boolean> {
  const h = heldOf(id);
  if (!h) return true;
  if (account && h.acct === account && (await mineNet.drop(id)).status !== 200) return false;
  forgetHere(id);
  return true;
}

/**
 * Its owner deletes a ledger, for everyone. True when it is gone (or was already), and then it is
 * off this phone too; false when the server couldn't be reached, or this phone isn't its owner
 * after all (and from then on doesn't take itself for one).
 */
export async function eraseLedger(id: string): Promise<boolean> {
  const h = heldOf(id);
  if (!h?.owner || !h.made) return false;
  const got = await deleteLedger(id, h.owner);
  if (got.status === 200 || got.status === 404) {
    forgetHere(id);
    return true;
  }
  if (got.status === 403) write(id, notOwner);
  return false;
}

/** Which person in a ledger this phone's owner is. Signed in, the account keeps it too. */
export function iAm(id: string, member: string) {
  setMe(id, member);
  const h = heldOf(id);
  if (account && h?.acct === account) void mineNet.put(id, h.key, h.owner, member);
}

// ---------- the account's ledgers ----------

/** The changle.ca account signed in on this page; null while nobody is (or it isn't known yet). */
let account: string | null = null;

/**
 * Who is signed in, as the page knows it. Signing in brings the account's ledgers and sends this
 * phone's; and a ledger that couldn't be made because the sign-in had run out is tried again.
 */
export function setAccount(id: string | null) {
  if (id === account) return;
  account = id;
  if (!id) return;
  void syncMine();
  wakeAll();
}

/** Is this ledger shown in the list for whoever is signed in? (Another account's stay on the phone, out of sight, and still send what they have.) */
export const listed = (h: Pick<Held, "acct">, who: string | null): boolean => !h.acct || h.acct === who;

let mining: Promise<void> | null = null;
let mineAgain = false;

/**
 * The phone's ledgers and the account's, made one. Asked again while it is going on, it goes once
 * more when it is done. Nothing answered: it is left for the next time (两清 opened, the page
 * back in front, signing in).
 */
export function syncMine(): Promise<void> {
  if (mining) {
    mineAgain = true;
    return mining;
  }
  mining = (async () => {
    do {
      mineAgain = false;
      await mineOnce();
    } while (mineAgain && account);
  })().finally(() => {
    mining = null;
  });
  return mining;
}

async function mineOnce(): Promise<void> {
  const who = account;
  if (!who) return;
  const got = await mineNet.list();
  if (got.status !== 200 || !got.data || account !== who) return;
  const list = got.data;
  const theirs = new Map(list.map((m) => [m.id, m]));

  // What the account has and this phone doesn't: read with its key and held, with the owner's key
  // and who they are. The oldest first, so the newest ends up on top of the list.
  for (const m of [...list].reverse()) {
    if (heldOf(m.id)) continue;
    const read = await net.read(m.id, m.key);
    if (account !== who) return;
    if (read.status === 200 && read.data?.ledger.id === m.id) {
      if (!heldOf(m.id)) keepHeld({ ...join(read.data, m.key), ...(m.owner ? { owner: m.owner } : {}), acct: who }, m.me);
    } else if (read.status === 404) {
      // (deleted by its owner: off the list)
      await mineNet.drop(m.id);
    }
    // (403: its key was changed since; it stays on the list for a new invitation to put right)
  }

  // What this phone has: its own go to the account, the account's are brought up to date.
  for (const h of everyHeld()) {
    if (account !== who) return;
    const id = h.server.id;
    // (another account's are left alone; one not yet made goes to the account as it is made)
    if ((h.acct && h.acct !== who) || !h.made) continue;
    const m = theirs.get(id);
    if (!m) {
      // The account had it and doesn't now: taken off on another phone, or deleted by its owner.
      // (What is still waiting to go up goes first: until then it stays.)
      if (h.acct === who) {
        if (!h.waiting.length) forgetHere(id);
      } else await toAccount(who, id);
      continue;
    }
    await sameAs(who, h, m);
  }
}

/** A ledger this phone has goes to the account's list (or brings it up to date there); held as the account's once the server has it. */
async function toAccount(who: string, id: string): Promise<boolean> {
  const h = heldOf(id);
  if (!h) return false;
  const put = await mineNet.put(id, h.key, h.owner, meOf(id) ?? null);
  if (put.status !== 200 || account !== who) return false;
  if (h.acct !== who) write(id, (x) => ({ ...x, acct: who }));
  return true;
}

/**
 * A ledger both have: whichever knows more, the other is told. A newer key (the owner changed it
 * on one of the account's phones), the owner's key, who they are: the phone takes what the account
 * has that it hasn't, and the account what the phone has that it hasn't.
 */
async function sameAs(who: string, h: Held, m: Mine): Promise<void> {
  const id = h.server.id;
  // the owner's key, and who they are, when the account has them and the phone doesn't
  if (m.owner && !h.owner) write(id, (x) => (x.owner ? x : { ...x, owner: m.owner }));
  if (m.me && !meOf(id)) setMe(id, m.me);
  if (h.acct !== who) write(id, (x) => ({ ...x, acct: who }));
  const now = heldOf(id);
  if (!now) return;
  const me = meOf(id);
  if (m.key === now.key && (m.owner ?? "") === (now.owner ?? "") && (m.me ?? "") === (me ?? "")) return;
  if (m.key !== now.key) {
    // Two keys: the one that opens the ledger is the one to keep. The phone's first (the account may
    // not have heard of a change made here), then the account's (it was changed on another phone).
    if (await toAccount(who, id)) return;
    const read = await net.read(id, m.key);
    if (account !== who || read.status !== 200 || read.data?.ledger.id !== id || !heldOf(id)) return;
    const data = read.data;
    write(id, (x) => opened(x, m.key, data));
    run(id)?.syncer.rekeyed();
    return;
  }
  await toAccount(who, id);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** How the sending is going for one ledger, as of now. */
export const syncOf = (id: string): SyncState => running.get(id)?.state ?? IDLE;

/** The same, for a screen: redraws when it changes. */
export const useSync = (id: string): SyncState => useSyncExternalStore(subscribe, () => syncOf(id));
