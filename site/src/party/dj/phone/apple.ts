/**
 * 打碟 · DJ Booth: songs on Apple, for a name that isn't on the site's song list. The phone asks
 * Apple's search itself (Apple turns servers away but lets browsers in, as 猜歌's charts do), for
 * songs with a 30-second preview: the clip the DJ plays when it's asked for. The room checks every
 * field before it keeps one, and only the one who asked and the host read its name.
 */
import { cleanTitle } from "../../../shared/songs";

/** A song found on Apple: its track id, title, artist, preview (a path on Apple's preview server, or the URL) and storefront. */
export type AppleHit = { id: number; t: string; a: string; p: string; st: string };

const PRE = "https://audio-ssl.itunes.apple.com/itunes-assets/";
const SUF = ".plus.aac.p.m4a";
const CJK = /[㐀-鿿]/;
/** searches kept (a phone types the same names again) */
const KEEP = 30;

/** The storefront to search: Taiwan's for Chinese (it has the most Chinese songs), else the US's. */
export const storeFor = (q: string) => (CJK.test(q) ? "tw" : "us");

/** Apple's search answer, as songs the DJ can play (at most six, no repeats); `simplify` turns traditional characters simplified. */
export function hitsOf(data: unknown, store: string, simplify: (x: string) => string = (x) => x): AppleHit[] {
  const results = (data as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: AppleHit[] = [];
  for (const x of results) {
    const r = (x ?? {}) as Record<string, unknown>;
    const { trackId: id, trackName: name, artistName: artist, previewUrl: url } = r;
    if (r.kind !== "song" || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) continue;
    if (typeof name !== "string" || typeof artist !== "string" || typeof url !== "string" || !url.startsWith(PRE)) continue;
    const cjk = CJK.test(name) || CJK.test(artist);
    const t = cleanTitle(cjk ? simplify(name) : name, cjk ? 0 : 1).slice(0, 60);
    const a = (cjk ? simplify(artist) : artist).slice(0, 40);
    if (!t || out.some((h) => h.id === id || (h.t === t && h.a === a))) continue;
    out.push({ id, t, a, p: url.endsWith(SUF) ? url.slice(PRE.length, -SUF.length) : url, st: store });
    if (out.length >= 6) break;
  }
  return out;
}

const asked = new Map<string, Promise<AppleHit[]>>();

/** Songs on Apple for what was typed (once per text; nothing when Apple can't be reached). */
export function searchApple(q: string, simplify?: (x: string) => string): Promise<AppleHit[]> {
  const key = q.trim().toLowerCase();
  if (!key) return Promise.resolve([]);
  let p = asked.get(key);
  if (p) return p;
  const st = storeFor(key);
  p = fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(key)}&media=music&entity=song&limit=12&country=${st}`, { credentials: "omit" })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((d) => hitsOf(d, st, simplify))
    .catch(() => {
      asked.delete(key);
      return [];
    });
  asked.set(key, p);
  while (asked.size > KEEP) asked.delete(asked.keys().next().value as string);
  return p;
}
