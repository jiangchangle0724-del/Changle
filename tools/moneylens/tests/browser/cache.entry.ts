// What scripts/check-cache.ts loads into a real browser to try the cache there. Every value is invented.
import { MemoryRemote } from "../../src/vault/memory";
import type { Value } from "../../src/vault/records";
import { Store } from "../../src/vault/sync";
import { holdCache, openCache, type Held } from "../../src/web/idbcache";

const NAME = "moneylens-test";
const state: { held?: Held; store?: Store; remote?: MemoryRemote } = {};

/** Everything a value holds that could be text: strings as they are, bytes read as text both ways. */
function texts(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (x instanceof Uint8Array) {
    out.push(new TextDecoder("utf-8").decode(x), new TextDecoder("utf-16le").decode(x));
  } else if (Array.isArray(x)) for (const y of x) texts(y, out);
  else if (typeof x === "object" && x !== null) for (const [key, y] of Object.entries(x)) texts(y, texts(key, out));
  return out;
}

const api = {
  async hold(): Promise<string> {
    const held = await holdCache(NAME);
    if (typeof held === "string") return held;
    state.held = held;
    return "held";
  },
  release(): void {
    state.held?.release();
    state.held = undefined;
  },
  /** Opens the store on the held cache, with a key made from the given bytes (a test's bytes, never a real key). */
  async open(vault: string, key: number[]): Promise<ReturnType<Store["status"]>> {
    const imported = await crypto.subtle.importKey("raw", new Uint8Array(key), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    state.remote ??= new MemoryRemote(vault);
    state.store = await Store.open({ id: vault, key: imported }, state.held!.cache);
    return state.store.status();
  },
  add(kind: string, group: string, value: Value) {
    return state.store!.add(kind, group, value);
  },
  list(kind: string) {
    return state.store!.list(kind);
  },
  status() {
    return state.store!.status();
  },
  flush() {
    return state.store!.flush();
  },
  async sync() {
    const result = await state.store!.sync(state.remote!);
    return { ok: result.ok, why: result.ok ? "" : result.why, sent: result.sent, received: result.received };
  },
  /** What the browser's storage holds for this site, and which of the given words can be read in it. */
  async stored(words: string[]) {
    const names = (await indexedDB.databases()).map((db) => db.name);
    const found = new Set<string>();
    const shapes = new Set<string>();
    let entries = 0;
    for (const name of names) {
      const open = indexedDB.open(name!);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      for (const store of db.objectStoreNames) {
        const tx = db.transaction(store, "readonly");
        const [keys, values] = await Promise.all(
          [tx.objectStore(store).getAllKeys(), tx.objectStore(store).getAll()].map((request) => new Promise<unknown[]>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          })),
        );
        entries += values!.length;
        for (const value of values!) shapes.add(`${store}: ${Object.keys(value as object).sort().join(",")}`);
        for (const text of texts([keys, values])) for (const word of words) if (text.includes(word)) found.add(word);
      }
      db.close();
    }
    return { databases: names, entries, shapes: [...shapes].sort(), found: [...found], local: localStorage.length, session: sessionStorage.length, cookies: document.cookie };
  },
  /** The cache refuses to be written for another vault than the one it holds. */
  async saveAs(vault: string): Promise<string> {
    try {
      await state.held!.cache.save(vault, { cursor: 0, put: [], drop: [] });
      return "saved";
    } catch (error) {
      return String((error as Error).message);
    }
  },
  /** A cache opened without holding it, to show what a second tab would do without the lock: it can read. */
  async peek(): Promise<number> {
    const cache = await openCache(NAME);
    const kept = await cache.load();
    cache.close();
    return kept?.chunks.length ?? -1;
  },
};

Object.assign(globalThis, { ml: api });
export type Api = typeof api;
