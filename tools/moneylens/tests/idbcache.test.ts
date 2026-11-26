// Taking the cache in the browser's storage (src/web/idbcache.ts): the three answers, kept apart. These run in Node with
// the browser's two interfaces replaced by stand-ins; the real thing is tried in a browser by scripts/check-cache.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdCache } from "../src/web/idbcache";

type Lock = { name: string } | null;
type Request = (name: string, options: { ifAvailable?: boolean }, callback: (lock: Lock) => unknown) => Promise<unknown>;

/** Runs with `navigator` and `indexedDB` replaced, and puts back whatever was there. */
async function withBrowser(locks: { request: Request } | undefined, database: unknown, run: () => Promise<void>): Promise<void> {
  const before = [Object.getOwnPropertyDescriptor(globalThis, "navigator"), Object.getOwnPropertyDescriptor(globalThis, "indexedDB")] as const;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: locks ? { locks } : {} });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: database });
  try {
    await run();
  } finally {
    for (const [name, was] of [["navigator", before[0]], ["indexedDB", before[1]]] as const) {
      if (was) Object.defineProperty(globalThis, name, was);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

/** A stand-in for the browser's locks: one holder a name, and it says when a lock was let go. */
function fakeLocks() {
  const held = new Set<string>();
  const released: string[] = [];
  const request: Request = async (name, options, callback) => {
    assert.equal(options.ifAvailable, true, "the cache must ask without waiting: a second tab is told at once");
    if (held.has(name)) return callback(null);
    held.add(name);
    try {
      return await callback({ name });
    } finally {
      held.delete(name);
      released.push(name);
    }
  };
  return { request, held, released };
}

const noStorage = {
  open: () => {
    throw new Error("the test's storage refuses to open");
  },
};

test("no lock, no cache: a browser that has no locks, or will not give one, is 'unavailable', and storage is not opened", async () => {
  const untouched = { open: () => assert.fail("storage was opened without holding the lock") };
  await withBrowser(undefined, untouched, async () => assert.equal(await holdCache("invented"), "unavailable"));
  // the browser refuses the request (a policy, say): that is not another tab
  await withBrowser({ request: () => Promise.reject(new DOMException("invented refusal", "SecurityError")) }, untouched, async () => assert.equal(await holdCache("invented"), "unavailable"));
  // or the call itself throws
  await withBrowser(
    {
      request: () => {
        throw new TypeError("invented: not allowed here");
      },
    },
    untouched,
    async () => assert.equal(await holdCache("invented"), "unavailable"),
  );
  // no storage at all
  const locks = fakeLocks();
  await withBrowser(locks, undefined, async () => assert.equal(await holdCache("invented"), "unavailable"));
  assert.deepEqual(locks.released, [], "no lock is asked for when there is nothing to hold");
});

test("another page has the cache: 'taken', and nothing is opened", async () => {
  const locks = fakeLocks();
  locks.held.add("invented/cache");
  await withBrowser(locks, { open: () => assert.fail("storage was opened by a page that does not hold the lock") }, async () => assert.equal(await holdCache("invented"), "taken"));
});

test("the lock was given and storage would not open: 'unavailable', and the lock is let go for the next page", async () => {
  const locks = fakeLocks();
  await withBrowser(locks, noStorage, async () => {
    assert.equal(await holdCache("invented"), "unavailable");
    // the stand-in lets go when the promise the cache gave it settles
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual([locks.released, [...locks.held]], [["invented/cache"], []]);
    // so a second try is again a try for storage, not "taken"
    assert.equal(await holdCache("invented"), "unavailable");
  });
});
