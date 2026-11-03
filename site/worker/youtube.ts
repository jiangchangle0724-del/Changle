/**
 * 打碟 · DJ Booth: songs asked for from YouTube (Steve on Nov 2: whole real songs, played on the big
 * screen through YouTube's own player, never downloaded; his plan's 观众点歌). Two lookups for the
 * phones, from the edge:
 *
 *   GET /yt/info?id=VIDEO      a link's video by its id: title and channel (YouTube's oEmbed, no key)
 *   GET /yt/search?q=WORDS     up to 6 videos that can be embedded (the YouTube Data API: needs the
 *                              owner's YOUTUBE_API_KEY, a Cloudflare secret; { nokey: true } without it)
 *
 * Both are cached at the edge for a day: a search costs a hundredth of the key's daily quota.
 */
import { hitsOf, unescape, YT_ID, type YtHit } from "../src/shared/dj/youtube";

const clip = (s: unknown, n: number) => (typeof s === "string" ? unescape(s).replace(/\s+/g, " ").trim().slice(0, n) : "");

type Env = { YOUTUBE_API_KEY?: string };

/** /yt/info and /yt/search: an answer, or null when the path is neither. */
export async function youtube(path: string, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (path !== "/yt/info" && path !== "/yt/search") return null;
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://rooms.changle.ca/__yt${path}?${path === "/yt/info" ? `id=${url.searchParams.get("id") ?? ""}` : `q=${encodeURIComponent((url.searchParams.get("q") ?? "").trim().toLowerCase())}`}`);
  const send = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=86400" : "no-store" } });
  if (path === "/yt/info") {
    const id = url.searchParams.get("id") ?? "";
    if (!YT_ID.test(id)) return send({ error: "id" }, 400);
    const hit = await cache.match(key);
    if (hit) return hit;
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    // (a private, removed or unembeddable video has no oEmbed)
    if (!r.ok) return send({ error: "none" }, 404);
    const d = (await r.json()) as { title?: unknown; author_name?: unknown };
    const res = send({ id, t: clip(d.title, 120), a: clip(d.author_name, 80) } satisfies YtHit);
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  // (no key yet: an answer, not an error, so the phones' consoles stay quiet)
  if (!env.YOUTUBE_API_KEY) return new Response(JSON.stringify({ nokey: true }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (q.length < 2) return send({ error: "q" }, 400);
  const hit = await cache.match(key);
  if (hit) return hit;
  const api = new URL("https://www.googleapis.com/youtube/v3/search");
  for (const [k, v] of Object.entries({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "6", safeSearch: "moderate", q, key: env.YOUTUBE_API_KEY })) api.searchParams.set(k, v);
  const r = await fetch(api);
  if (!r.ok) return send({ error: "search" }, 502);
  const res = send({ hits: hitsOf(await r.json()) });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
