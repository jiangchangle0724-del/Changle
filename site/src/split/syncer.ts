/**
 * Keeping one ledger in step with the server: when to send, what to do when nothing answers, and
 * listening for what other phones record. The rules for what the phone holds are sync.ts; this is
 * only the timing, with the network, the clock and the storage handed in, so the tests run it
 * against a server that loses answers and a signal that comes and goes (tests/split-sync.test.ts).
 *
 *  - One request at a time, carrying everything that is waiting, oldest first.
 *  - No answer (no signal, a timeout, the server down): try again, a little later each time.
 *    The server takes a change once however often it is sent, so trying again is always safe.
 *  - An answer that says this phone can't go on (the key no longer opens the ledger, the ledger is
 *    gone, too many ledgers today): stop sending and say which. The phone still records.
 */
import type { Change, Sent } from "./changes";
import { act, answered, dismiss, heard, makeBody, toSend, type Held, type MakeBody, type Pushed, type Snapshot } from "./sync";

/** What came back. Status 0: nothing did (no signal, timed out). */
export type Reply<T> = { status: number; data?: T };

export interface Net {
  make(key: string, body: MakeBody): Promise<Reply<Snapshot>>;
  push(id: string, key: string, changes: Sent[]): Promise<Reply<Pushed>>;
  /**
   * Listen to a ledger: `on` each time the server sends it, `down` once when the connection ends
   * (with the status when the server refused it, otherwise 0). Returns how to stop listening.
   */
  listen(id: string, key: string, on: (s: Snapshot) => void, down: (status: number) => void): () => void;
}

/**
 * Why this phone can't go on syncing: today's allowance of new ledgers is used up; the ledger is
 * gone; the key no longer opens it; its id was taken; the server won't take what was sent.
 */
export type Trouble = "limit" | "gone" | "key" | "taken" | "stuck";

export type SyncState = {
  held: Held;
  /** a request is on its way */
  sending: boolean;
  /** the live connection is up: what others record arrives by itself */
  live: boolean;
  trouble: Trouble | null;
};

export type Syncer = {
  state(): SyncState;
  /** The phone does something. False when the ledger as shown doesn't allow it. */
  do(change: Change): boolean;
  /** Something says the signal may be back (the page is in front again, the phone is online): try now. */
  wake(): void;
  /** The screen has told the user about a change that didn't stick. */
  dismiss(id: string): void;
  stop(): void;
};

const FIRST_WAIT = 1000;
const LONGEST_WAIT = 30_000;

export function syncer(opts: {
  held: Held;
  net: Net;
  /** keep what the phone holds (called after every change to it) */
  save: (h: Held) => void;
  changed: (s: SyncState) => void;
  /** run something later; returns how to call it off */
  later: (run: () => void, ms: number) => () => void;
  newId: () => string;
  now: () => number;
}): Syncer {
  let held = opts.held;
  let sending = false;
  let live = false;
  let trouble: Trouble | null = null;
  let stopped = false;
  let tries = 0;
  let unlisten: (() => void) | null = null;
  let callOff: (() => void) | null = null;

  const state = (): SyncState => ({ held, sending, live, trouble });
  const tell = () => opts.changed(state());
  const keep = (h: Held) => {
    held = h;
    opts.save(h);
    tell();
  };
  const halt = (why: Trouble) => {
    trouble = why;
    unlisten?.();
    unlisten = null;
    live = false;
  };

  function retry(): void {
    if (stopped || trouble || callOff) return;
    const wait = Math.min(LONGEST_WAIT, FIRST_WAIT * 2 ** Math.min(tries, 5));
    tries += 1;
    callOff = opts.later(() => {
      callOff = null;
      void flush();
    }, wait);
  }

  function listen(): void {
    if (unlisten || stopped || trouble || !held.made) return;
    unlisten = opts.net.listen(
      held.server.id,
      held.key,
      (s) => {
        if (stopped) return;
        live = true;
        tries = 0;
        keep(heard(held, s));
      },
      (status) => {
        if (stopped) return;
        unlisten = null;
        live = false;
        if (status === 403) halt("key");
        else if (status === 404) halt("gone");
        else retry();
        tell();
      },
    );
  }

  async function flush(): Promise<void> {
    if (sending || stopped || trouble) return;
    sending = true;
    tell();
    try {
      if (!held.made) {
        const made = await opts.net.make(held.key, makeBody(held));
        if (stopped) return;
        if ((made.status === 200 || made.status === 201) && made.data) keep(heard({ ...held, made: true }, made.data));
        else if (made.status === 0 || made.status >= 500) return retry();
        else return halt(made.status === 429 ? "limit" : made.status === 409 ? "taken" : made.status === 403 ? "key" : "stuck");
      }
      listen();
      while (held.waiting.length) {
        const batch = toSend(held);
        const got = await opts.net.push(held.server.id, held.key, batch);
        if (stopped) return;
        if (got.status === 200 && got.data) {
          tries = 0;
          keep(answered(held, batch, got.data));
        } else if (got.status === 0 || got.status >= 500 || got.status === 429) return retry();
        else return halt(got.status === 404 ? "gone" : got.status === 403 ? "key" : "stuck");
      }
      // the connection may have dropped while that was going on
      listen();
    } finally {
      sending = false;
      if (!stopped) tell();
    }
  }

  return {
    state,
    do(change) {
      const next = act(held, change, opts.newId(), opts.now());
      if (!next) return false;
      keep(next);
      void flush();
      return true;
    },
    wake() {
      if (stopped || trouble) return;
      callOff?.();
      callOff = null;
      tries = 0;
      void flush();
    },
    dismiss(id) {
      keep(dismiss(held, id));
    },
    stop() {
      stopped = true;
      callOff?.();
      unlisten?.();
      callOff = unlisten = null;
    },
  };
}
