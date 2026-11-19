// Pictures of the goods. A merchant's phone makes two copies of each picture (src/client/ui/photos.ts):
// one to look at, at most 1200 px across, and a small square one for the list. It sends both at once
// (POST /tuan/api/my/shops/<slug>/photos), and they're kept in KV (binding PHOTOS) under the large
// copy's fingerprint. The same name is the same bytes for good: a picture sent twice is kept once,
// and phones and Cloudflare's cache may keep it for a year. D1's `photos` says which there are and
// whose (src/server/store.ts). Served at /tuan/img/<id> and /tuan/img/<id>/s.

/** The most each copy may weigh, and a whole upload with its wrapping. */
export const PHOTO_MAX = 450_000;
export const THUMB_MAX = 60_000;
export const UPLOAD_MAX = PHOTO_MAX + THUMB_MAX + 4_000;

export type PhotoType = "image/jpeg" | "image/webp";

const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));

/** What a picture is by its first bytes, whatever it's called: JPEG or WebP (what a phone's canvas makes), nothing else. */
export function photoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** A picture's name: the first 128 bits of its large copy's SHA-256, in hex. */
export async function photoId(large: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", large));
  return Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const photoKey = (id: string, small: boolean): string => `p/${id}${small ? "/s" : ""}`;

/** A request's body, unless it's longer than `max` (read no further than that). */
export async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.length;
  }
  return whole;
}

/** The two copies a phone sent as a form (`large`, `small`), each checked for what it is and how big: null if they won't do. */
export async function copiesOf(req: Request): Promise<{ large: Uint8Array; small: Uint8Array; types: [PhotoType, PhotoType] } | null> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) return null;
  const sent = await readCapped(req, UPLOAD_MAX);
  if (!sent) return null;
  let form: FormData;
  try {
    form = await new Response(sent, { headers: { "content-type": type } }).formData();
  } catch {
    return null;
  }
  const [large, small] = [form.get("large"), form.get("small")];
  if (!(large instanceof File) || !(small instanceof File) || large.size > PHOTO_MAX || small.size > THUMB_MAX) return null;
  const copies = { large: new Uint8Array(await large.arrayBuffer()), small: new Uint8Array(await small.arrayBuffer()) };
  const types = [photoType(copies.large), photoType(copies.small)];
  return types[0] && types[1] ? { ...copies, types: [types[0], types[1]] } : null;
}

/** A picture as a phone asks for it: from Cloudflare's cache when it's there, else from KV (and into the cache). */
export async function servePhoto(req: Request, env: Env, ctx: ExecutionContext | undefined, id: string, small: boolean): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL(req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const found = await env.PHOTOS.getWithMetadata<{ type?: string }>(photoKey(id, small), "arrayBuffer");
  if (!found.value) return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const res = new Response(found.value, {
    headers: {
      "content-type": found.metadata?.type === "image/webp" ? "image/webp" : "image/jpeg",
      // the same name is the same bytes for good
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-site",
    },
  });
  const kept = cache.put(key, res.clone());
  if (ctx) ctx.waitUntil(kept);
  else await kept;
  return res;
}
