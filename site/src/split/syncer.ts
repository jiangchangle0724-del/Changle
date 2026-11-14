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
 *  - It listens only to a ledger that is open on the screen. One that isn't still sends what it has.
 *  - A locked ledger takes nothing: what is waiting stays on the phone, and goes when the ledger
 *    is opened again. (That isn't a trouble: the ledger itself says it is locked.)
 *  - The phone that made the ledger is its owner. It can lock it, and change the key that opens
 *    it; a key it has asked for is seen through before anything else is sent.
 *
 * What the phone holds is never kept here: it is read from the store each time and changed by
 * saying how, so another tab open on the same ledger, or the ledger being taken off this phone,
 * is simply what is read next.
 */
import type { Change, Sent } from "./changes";
import { act, answered, dismiss, heard, keyStays, makeBody, notOwner, rekeyed, rekeying, toSend, type Held, type MakeBody, type Pushed, type Snapshot } from "./sync";

/** What came back. Status 0: nothing did (no signal, timed out). */
export type Reply<T> = { status: number; data?: T };

export interface Net {
  /** `owner`: the owner's key, when this phone has made one for the ledger */
  make(key: string, body: MakeBody, owner?: string): Promise<Reply<Snapshot>>;
  /** the ledger as it stands */
  read(id: string, key: string): Promise<Reply<Snapshot>>;
  /** status 423: the ledger is locked, and something in `changes` is new to it */
  push(id: string, key: string, changes: Sent[]): Promise<Reply<Pushed>>;
  /** the owner changes the key that opens the ledger to `next` */
  rekey(id: string, owner: string, next: string): Promise<Reply<Snapshot>>;
  /** the owner locks the ledger, or opens it again */
  lock(id: string, owner: string, locked: boolean): Promise<Reply<Snapshot>>;
  /**
   * Listen to a ledger: `on` each time the server sends it, `down` once when the connection ends
   * (with the status when the server refused it, otherwise 0). Returns how to stop listening;
   * once stopped, neither is called again.
   */
  listen(id: string, key: string, on: (s: Snapshot) => void, down: (status: number) => void): () => void;
}

/**
 * Why this phone can't go on syncing: today's allowance of new ledgers is used up; the ledger is
 * gone; the key no longer opens it; its id was taken; the server won't take what was sent; the
 * ledger was opened signed in, and the sign-in ran out before the server could make it.
 */
export type Trouble = "limit" | "gone" | "key" | "taken" | "stuck" | "signin";

/**
 * The three that can pass (tomorrow has a new allowance; a server can be put right; whoever opened
 * the ledger can sign in again). The other three are facts.
 */
const passes = (t: Trouble) => t === "limit" || t === "stuck" || t === "signin";

export type SyncState = {
  /** a request is on its way */
  sending: boolean;
  /** the live connection is up: what others record arrives by itself */
  live: boolean;
  /** nothing has answered, twice running: no signal, or the server is out of reach */
  away: boolean;
  trouble: Trouble | null;
};

export type Syncer = {
  state(): SyncState;
  /** The phone does something. False when the ledger as shown doesn't allow it. */
  do(change: Change): boolean;
  /**
   * Something says now is a good time (the page is in front again, the phone is online, the ledger
   * was opened): try now, and try once more to get past a trouble that can pass.
   */
  wake(): void;
  /** Listen for what others record (the ledger is open on the screen), or stop (it isn't). */
  watch(on: boolean): void;
  /**
   * Ask the server where the ledger stands, once (its card is on the screen, in the list). Nothing
   * is asked when the phone is listening to it or has something to send: those bring the ledger
   * anyway. And no answer is nothing to act on: the card shows what the phone has.
   */
  look(): void;
  /** The screen has told the user about a change that didn't stick. */
  dismiss(id: string): void;
  /**
   * The owner locks the ledger, or opens it again. True when the server did it (or it was already
   * so); false when nothing answered, or this phone isn't the owner (told so by the server, it
   * stops holding an owner's key).
   */
  lock(locked: boolean): Promise<boolean>;
  /**
   * The owner changes the key that opens the ledger to `next`: the old invitation stops working.
   * The key is kept on the phone and seen through, now or when there is a signal (what the phone
   * holds says when: `next` is gone and `key` is the new one).
   */
  rekey(next: string): void;
  /**
   * The phone has been given another key for the ledger (a new invitation, after its owner changed
   * the key): what the old key couldn't do is tried again.
   */
  rekeyed(): void;
  stop(): void;
};

const FIRST_WAIT = 1000;
const LONGEST_WAIT = 30_000;

export function syncer(opts: {
  /** what the phone holds for this ledger now; null once it has been taken off the phone */
  read: () => Held | null;
  /** change what the phone holds, by saying how (the store applies it, at once, to what it holds then, and keeps it) */
  write: (how: (h: Held) => Held) => void;
  net: Net;
  changed: (s: SyncState) => void;
  /** run something later; returns how to call it off */
  later: (run: () => void, ms: number) => () => void;
  newId: () => string;
  now: () => number;
  /** listening from the start (the default), or only once watch(true) says so */
  watching?: boolean;
}): Syncer {
  let sending = false;
  let live = false;
  let away = false;
  let trouble: Trouble | null = null;
  /** the trouble a wake is trying to get past: still what is said, until the answer comes */
  let passing: Trouble | null = null;
  let watching = opts.watching ?? true;
  /** asked to look, and not yet done */
  let looking = false;
  let stopped = false;
  let tries = 0;
  let unlisten: (() => void) | null = null;
  let callOff: (() => void) | null = null;

  const state = (): SyncState => ({ sending, live, away, trouble: trouble ?? passing });
  const tell = () => opts.changed(state());
  const keep = (how: (h: Held) => Held) => {
    opts.write(how);
    tell();
  };
  const deaf = () => {
    unlisten?.();
    unlisten = null;
    live = false;
  };
  const halt = (why: Trouble) => {
    trouble = why;
    away = false;
    deaf();
  };

  function retry(): void {
    if (stopped || trouble || callOff) return;
    // the first miss may be nothing (a train in a tunnel); the try after it missing too is no signal
    if (tries >= 1) away = true;
    const wait = Math.min(LONGEST_WAIT, FIRST_WAIT * 2 ** Math.min(tries, 5));
    tries += 1;
    callOff = opts.later(() => {
      callOff = null;
      void flush();
    }, wait);
  }

  function listen(): void {
    const h = opts.read();
    if (!watching || unlisten || stopped || trouble || !h?.made) return;
    unlisten = opts.net.listen(
      h.server.id,
      h.key,
      (s) => {
        if (stopped) return;
        live = true;
        away = false;
        tries = 0;
        const was = opts.read();
        keep((x) => heard(x, s));
        // the owner has opened a ledger that was locked: what this phone kept waiting can go now
        if (was?.server.locked !== undefined && s.ledger.locked === undefined && was.waiting.length) void flush();
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
      const first = opts.read();
      if (!first) return;
      if (!first.made) {
        const made = await opts.net.make(first.key, makeBody(first), first.owner);
        if (stopped) return;
        const data = made.data;
        if ((made.status === 200 || made.status === 201) && data) {
          away = false;
          keep((x) => heard({ ...x, made: true }, data));
        } else if (made.status === 0 || made.status >= 500) return retry();
        // (401: the sign-in it was opened under ran out before the ledger could be made)
        else return halt(made.status === 429 ? "limit" : made.status === 409 ? "taken" : made.status === 403 ? "key" : made.status === 401 ? "signin" : "stuck");
      }
      // A key the owner asked for comes before everything else: the server may already have it
      // (the answer was lost, or the page was closed), and then the old one opens nothing.
      const mine = opts.read();
      if (mine?.owner && mine.next) {
        const next = mine.next;
        // (the server lets go of every phone the old key let in, this one too: it stops listening
        // first, so that isn't taken for the key having been changed by someone else)
        deaf();
        const got = await opts.net.rekey(mine.server.id, mine.owner, next);
        if (stopped) return;
        const data = got.data;
        if (got.status === 200 && data) {
          tries = 0;
          away = false;
          keep((x) => heard(rekeyed(x, next), data));
        } else if (got.status === 0 || got.status >= 500) return retry();
        else if (got.status === 404) return halt("gone");
        // (403: this phone isn't the ledger's owner after all; anything else: the server won't have this key)
        else keep(got.status === 403 ? notOwner : keyStays);
      }
      listen();
      if (looking) {
        looking = false;
        const h = opts.read();
        if (h && !h.waiting.length && !unlisten) {
          const got = await opts.net.read(h.server.id, h.key);
          if (stopped) return;
          const data = got.data;
          if (got.status === 200 && data) {
            away = false;
            keep((x) => heard(x, data));
          } else if (got.status === 404 || got.status === 403) return halt(got.status === 404 ? "gone" : "key");
        }
      }
      for (;;) {
        const h = opts.read();
        if (!h?.waiting.length) break;
        const batch = toSend(h);
        const got = await opts.net.push(h.server.id, h.key, batch);
        if (stopped) return;
        const data = got.data;
        if (got.status === 200 && data) {
          tries = 0;
          away = false;
          keep((x) => answered(x, batch, data));
        } else if (got.status === 423) {
          // Locked: nothing is taken until its owner opens it, and what is waiting stays on the
          // phone. A phone that isn't listening may not have heard it was locked: it asks once,
          // so the page can say why nothing is going up.
          tries = 0;
          away = false;
          if (h.server.locked === undefined && !unlisten) {
            const now = await opts.net.read(h.server.id, h.key);
            if (stopped) return;
            const stands = now.data;
            if (now.status === 200 && stands) keep((x) => heard(x, stands));
          }
          break;
        } else if (got.status === 0 || got.status >= 500 || got.status === 429) return retry();
        else return halt(got.status === 404 ? "gone" : got.status === 403 ? "key" : "stuck");
      }
      // the connection may have dropped while that was going on
      listen();
      // everything went through: what was to be tried again later has just been done
      callOff?.();
      callOff = null;
    } finally {
      sending = false;
      passing = null;
      if (!stopped) tell();
    }
  }

  return {
    state,
    do(change) {
      if (stopped) return false;
      const id = opts.newId();
      const at = opts.now();
      let done = false;
      keep((x) => {
        const next = act(x, change, id, at);
        done = next !== null;
        return next ?? x;
      });
      if (done) void flush();
      return done;
    },
    wake() {
      if (stopped) return;
      if (trouble) {
        if (!passes(trouble) || sending) return;
        passing = trouble;
        trouble = null;
      }
      callOff?.();
      callOff = null;
      tries = 0;
      void flush();
    },
    watch(on) {
      watching = on;
      if (on) listen();
      else if (unlisten) {
        deaf();
        if (!stopped) tell();
      }
    },
    look() {
      if (stopped) return;
      looking = true;
      void flush();
    },
    dismiss(id) {
      keep((x) => dismiss(x, id));
    },
    async lock(locked) {
      const h = opts.read();
      if (stopped || !h?.owner || !h.made) return false;
      const got = await opts.net.lock(h.server.id, h.owner, locked);
      const data = got.data;
      if (stopped) return false;
      if (got.status === 403) keep(notOwner);
      if (got.status !== 200 || !data) return false;
      away = false;
      keep((x) => heard(x, data));
      // opened again: what was kept waiting while it was locked goes now
      if (!locked) void flush();
      return true;
    },
    rekey(next) {
      if (stopped) return;
      keep((x) => rekeying(x, next));
      void flush();
    },
    rekeyed() {
      if (stopped) return;
      if (trouble === "key") trouble = null;
      deaf();
      callOff?.();
      callOff = null;
      tries = 0;
      tell();
      void flush();
    },
    stop() {
      stopped = true;
      callOff?.();
      unlisten?.();
      callOff = unlisten = null;
    },
  };
}
