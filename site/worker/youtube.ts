/**
 * 打碟 · DJ Booth: songs asked for from YouTube (Steve on Nov 2: whole real songs, played on the big
 * screen through YouTube's own player, never downloaded; his plan's 观众点歌). Two lookups for the
 * phones, from the edge:
 *
 *   GET /api/yt/info?id=VIDEO      a link's video by its id: title and channel (YouTube's oEmbed, no key)
 *   GET /api/yt/search?q=WORDS     up to 6 videos that can be embedded (the YouTube Data API: needs the
 *                              owner's YOUTUBE_API_KEY, a Cloudflare secret; { nokey: true } without it,
 *                              { quota: true } once the key's searches for the day are used up)
 *   GET /api/yt/bpm?id=VIDEO       the video's song's tempo, for the big screen's dancers (Steve on Nov 12:
 *                              "机器人没有跟着音乐一起跳"): its title (oEmbed) looked up in Deezer's
 *                              catalogue (no key, free), { bpm } or { bpm: null }
 *
 * A link's answer is cached at the edge for a day, a search's for a week (a song's videos hardly
 * change, and a search costs a hundredth of the key's daily allowance: the same song asked for again
 * costs nothing), a tempo's for a month (an hour when nothing was found).
 */
import { hitsOf, songQuery, trackOf, unescape, YT_ID, type YtHit } from "../src/shared/dj/youtube";

const clip = (s: unknown, n: number) => (typeof s === "string" ? unescape(s).replace(/\s+/g, " ").trim().slice(0, n) : "");

type Env = { YOUTUBE_API_KEY?: string };

/** /yt/info and /yt/search: an answer, or null when the path is neither. */
export async function youtube(path: string, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (path === "/yt/bpm") return bpmOf(url, ctx);
  if (path !== "/yt/info" && path !== "/yt/search") return null;
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://rooms.changle.ca/__yt${path}?${path === "/yt/info" ? `id=${url.searchParams.get("id") ?? ""}` : `q=${encodeURIComponent((url.searchParams.get("q") ?? "").trim().toLowerCase())}`}`);
  const keep = path === "/yt/search" ? 7 * 86400 : 86400;
  const send = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": status === 200 ? `public, max-age=${keep}` : "no-store" } });
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
  if (r.status === 400 || r.status === 403 || r.status === 429) {
    // the key's searches for the day are used up ({ quota }), or the key can't search at all (not a
    // key, or the YouTube Data API not switched on for it: as good as no key): answers the phones can
    // say, not errors; links still work
    const why = JSON.stringify(await r.json().catch(() => null));
    const quota = r.status === 429 || /quota|dailyLimit|rateLimit/i.test(why);
    return new Response(JSON.stringify(quota ? { quota: true } : { nokey: true }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  if (!r.ok) return send({ error: "search" }, 502);
  const res = send({ hits: hitsOf(await r.json()) });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/** /yt/bpm: the video's song's tempo, or null (not found, not in the catalogue, or no tempo there). */
async function bpmOf(url: URL, ctx: ExecutionContext): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  const answer = (body: unknown, keep: number, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": keep ? `public, max-age=${keep}` : "no-store" } });
  if (!YT_ID.test(id)) return answer({ error: "id" }, 0, 400);
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://rooms.changle.ca/__yt/bpm?id=${id}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const none = () => {
    const res = answer({ bpm: null }, 3600);
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  };
  try {
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (!o.ok) return none();
    const v = (await o.json()) as { title?: unknown; author_name?: unknown };
    const title = typeof v.title === "string" ? v.title : "";
    const q = songQuery(title, typeof v.author_name === "string" ? v.author_name : "");
    if (q.length < 2) return none();
    const found = await fetch(`https://api.deezer.com/search?limit=8&q=${encodeURIComponent(q)}`);
    if (!found.ok) return none();
    const track = trackOf(await found.json(), title, typeof v.author_name === "string" ? v.author_name : "");
    if (track === null) return none();
    const t = await fetch(`https://api.deezer.com/track/${track}`);
    if (!t.ok) return none();
    const bpm = Number(((await t.json()) as { bpm?: unknown }).bpm);
    if (!(bpm >= 40 && bpm <= 250)) return none();
    const res = answer({ bpm: Math.round(bpm * 10) / 10 }, 30 * 86400);
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return answer({ bpm: null }, 0);
  }
}
