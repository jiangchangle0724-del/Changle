/**
 * The idle lock (VAULT-3): with nothing pressed for `limit`, the vault locks.
 *
 * A timer alone is not enough to say when that is. A laptop that sleeps, or a phone whose browser
 * is put away, stops the timer and the steady clock with it, and wakes up with most of its fifteen
 * minutes still to run, hours later. And the clock on the wall can be set back. So the time since
 * the last press is read from both clocks and the longer one counts; and it is read again whenever
 * the page is looked at again (`look`), and before a press is counted as one (`touch`): the press
 * that wakes a page that should have locked locks it, and does not start the count afresh.
 */

/** A moment by two clocks: the one on the wall (`Date.now()`, which goes on while the machine sleeps and can be set) and a steady one (`performance.now()`, which never goes back). */
export type Moment = { wall: number; steady: number };

/** How long ago `from` was, by whichever clock says longer. */
export const elapsed = (from: Moment, now: Moment): number => Math.max(now.wall - from.wall, now.steady - from.steady);

export type IdleClock = {
  now(): Moment;
  /** Runs `run` once, about `ms` from now; what it returns calls that off. */
  later(ms: number, run: () => void): () => void;
};

export type IdleWatch = {
  /** Something was pressed. Counts as activity unless the limit had already passed, in which case it locks. */
  touch(): void;
  /** The page is being looked at again: locks if the limit passed while it was not. Not activity. */
  look(): void;
  /** Stops watching, without locking. */
  stop(): void;
};

/** Watches for `limit` milliseconds with nothing pressed, then calls `lock`, once, and stops. */
export function watchIdle(limit: number, lock: () => void, clock: IdleClock): IdleWatch {
  let last = clock.now();
  let over = false;
  let cancel: () => void = () => {};
  const arm = (): void => {
    cancel();
    // (never a wait of nothing: a timer that fires early is asked again for what is left)
    cancel = clock.later(Math.max(1, limit - elapsed(last, clock.now())), look);
  };
  const end = (): void => {
    over = true;
    cancel();
  };
  const due = (): boolean => elapsed(last, clock.now()) >= limit;
  function look(): void {
    if (over) return;
    if (!due()) return arm();
    end();
    lock();
  }
  arm();
  return {
    touch() {
      if (over) return;
      if (due()) {
        end();
        return lock();
      }
      last = clock.now();
      arm();
    },
    look,
    stop: end,
  };
}

/** The browser's two clocks and its timer. */
export const browserClock: IdleClock = {
  now: () => ({ wall: Date.now(), steady: performance.now() }),
  later: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};
