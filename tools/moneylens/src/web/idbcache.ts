/**
 * This device's copy of the vault, in the browser's own storage (IndexedDB): the `Cache` that
 * vault/sync.ts asks for. It holds what `Kept` holds and nothing else: sealed blobs, their ids
 * and version numbers, the vault's id and how far the last pull reached. No key, no record, no
 * field (VAULT-3, VAULT-4, T-24). The store seals before it saves; nothing here could unseal.
 *
 * One page at a time. Two tabs of one browser share this storage, and each would keep its own
 * picture of it in memory and write over the other's. So a page takes the cache with `holdCache`,
 * which gives it to one page and tells any other that it is taken. The hold ends when the page
 * lets go or goes away, however it goes (it is a Web Lock, kept by the browser, not a note in
 * storage that a crash would leave behind).
 *
 * Safari empties a site's storage after seven days without a visit, and a private window keeps
 * none. So this is a cache: the server's copy is the durable one, and what only this device
 * holds has to be shown as such.
 */
import type { Cache, Kept } from "../vault/sync";

const META = "meta";
const CHUNKS = "chunks";
/** The one record in `meta`. */
const IT = "vault";

type Meta = { vault: string; cursor: number };

const asked = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("cache: the browser's storage refused"));
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("cache: nothing was written"));
  });

const isBlob = (x: unknown): x is Uint8Array => x instanceof Uint8Array;

/** Opens the cache. Use `holdCache` in a page: this alone does not stop a second tab. */
export async function openCache(name: string): Promise<Cache & { close(): void }> {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore(META);
    opening.result.createObjectStore(CHUNKS, { keyPath: "id" });
  };
  const db = await asked(opening);
  // another page asking for a newer layout must not wait on this one for ever
  db.onversionchange = () => db.close();

  return {
    async load() {
      const tx = db.transaction([META, CHUNKS], "readonly");
      const [meta, chunks] = await Promise.all([asked(tx.objectStore(META).get(IT) as IDBRequest<Meta | undefined>), asked(tx.objectStore(CHUNKS).getAll() as IDBRequest<unknown[]>)]);
      if (!meta || typeof meta.vault !== "string") return null;
      // Whatever is in storage is handed on as it is and checked by the store, which drops what makes no sense.
      const kept: Kept[] = [];
      for (const x of chunks) {
        const c = x as Partial<Kept>;
        kept.push({ id: c.id as string, version: c.version as number, ...(isBlob(c.base) ? { base: c.base } : {}), ...(isBlob(c.local) ? { local: c.local } : {}), ...(isBlob(c.sent) ? { sent: c.sent } : {}) });
      }
      return { vault: meta.vault, cursor: meta.cursor, chunks: kept };
    },

    /** One transaction: all of it is written or none of it. It is on disk when this returns. */
    async save(vault, change) {
      const tx = db.transaction([META, CHUNKS], "readwrite", { durability: "strict" });
      const end = finished(tx);
      const meta = tx.objectStore(META);
      const chunks = tx.objectStore(CHUNKS);
      const was = meta.get(IT) as IDBRequest<Meta | undefined>;
      let other = false;
      was.onsuccess = () => {
        // a cache holds one vault; the store empties it before it uses it for another
        if (was.result && was.result.vault !== vault) {
          other = true;
          tx.abort();
          return;
        }
        meta.put({ vault, cursor: change.cursor } satisfies Meta, IT);
        for (const kept of change.put) chunks.put({ id: kept.id, version: kept.version, ...(kept.base ? { base: kept.base } : {}), ...(kept.local ? { local: kept.local } : {}), ...(kept.sent ? { sent: kept.sent } : {}) } satisfies Kept);
        for (const id of change.drop) chunks.delete(id);
      };
      try {
        await end;
      } catch (error) {
        throw other ? new Error("cache: it holds another vault") : error;
      }
    },

    async clear() {
      const tx = db.transaction([META, CHUNKS], "readwrite", { durability: "strict" });
      const end = finished(tx);
      tx.objectStore(META).clear();
      tx.objectStore(CHUNKS).clear();
      await end;
    },

    close() {
      db.close();
    },
  };
}

export type Held = { cache: Cache; release(): void };

/**
 * Takes this device's cache for this page. "taken": another page of this browser has it (say so,
 * and let the person go to that page). "unavailable": this browser gives the page no storage it
 * can hold alone (a private window, storage switched off, a very old browser); the app can run
 * on a cache in memory and say that nothing is kept on this device.
 */
export async function holdCache(name = "moneylens"): Promise<Held | "taken" | "unavailable"> {
  if (typeof navigator === "undefined" || !navigator.locks || typeof indexedDB === "undefined") return "unavailable";
  let release!: () => void;
  const until = new Promise<void>((resolve) => (release = resolve));
  const got = await new Promise<boolean>((resolve) => {
    // the lock is held for as long as the promise this returns is pending
    navigator.locks.request(`${name}/cache`, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      return lock ? until : undefined;
    }).catch(() => resolve(false));
  });
  if (!got) return "taken";
  try {
    const cache = await openCache(name);
    return {
      cache,
      release() {
        cache.close();
        release();
      },
    };
  } catch {
    release();
    return "unavailable";
  }
}
