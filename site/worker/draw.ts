/**
 * Drawing an anime avatar: the player's photo (or the figure they already have) and the words built
 * from their choices go to Google's image model, and the drawing comes back. Nothing here keeps the
 * photo. Without a key, `DEV_FAKE_DRAW=1` answers with the picture it was sent (for local runs).
 */
export type DrawEnv = { GEMINI_API_KEY?: string; GEMINI_IMAGE_MODEL?: string; DEV_FAKE_DRAW?: string };

export type Pic = { mime: string; b64: string };
export type Drawn = { ok: true; pic: Pic } | { ok: false; code: "blocked" | "busy" | "key" | "no-image" | "failed"; detail?: string };

/** Nano Banana 2.1: Google's everyday image model, good at keeping a face while redrawing it.
 * The others are tried, in order, only if Google no longer serves the one before. */
const MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT = 90_000;

export const drawReady = (env: DrawEnv) => !!env.GEMINI_API_KEY || env.DEV_FAKE_DRAW === "1";

export async function drawPicture(env: DrawEnv, pic: Pic, prompt: string): Promise<Drawn> {
  if (!env.GEMINI_API_KEY) {
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: true, pic };
  }
  const models = env.GEMINI_IMAGE_MODEL ? [env.GEMINI_IMAGE_MODEL, ...MODELS] : MODELS;
  let last: Drawn = { ok: false, code: "failed", detail: "no model" };
  for (const model of models) {
    // the long-standing generateContent call first, then the newer Interactions API; each once more
    // without the size setting if a model doesn't take it
    for (const call of [generateContent, interactions])
      for (const sized of [true, false]) {
        last = await call(env.GEMINI_API_KEY, model, pic, prompt, sized);
        if (last.ok || last.code !== "failed") return last;
        if (!(sized && /image_?size/i.test(last.detail ?? ""))) break;
      }
    if (!/not.?found|unsupported|not supported|unknown|invalid model/i.test(last.detail ?? "")) return last;
  }
  return last;
}

async function generateContent(key: string, model: string, pic: Pic, prompt: string, sized: boolean): Promise<Drawn> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: pic.mime, data: pic.b64 } }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: sized ? { aspectRatio: "3:4", imageSize: "1K" } : { aspectRatio: "3:4" } },
  };
  return send(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, key, body, pic);
}

async function interactions(key: string, model: string, pic: Pic, prompt: string, sized: boolean): Promise<Drawn> {
  const body = {
    model,
    input: [
      { type: "text", text: prompt },
      { type: "image", mime_type: pic.mime, data: pic.b64 },
    ],
    response_format: sized ? { type: "image", aspect_ratio: "3:4", image_size: "1K" } : { type: "image", aspect_ratio: "3:4" },
  };
  return send(`${BASE}/interactions`, key, body, pic);
}

async function send(url: string, key: string, body: unknown, sent: Pic): Promise<Drawn> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) {
    return { ok: false, code: "failed", detail: String(e) };
  }
  const text = await res.text();
  if (!res.ok) {
    const detail = `${res.status} ${text.slice(0, 400)}`;
    if (res.status === 401 || res.status === 403 || /api key/i.test(text)) return { ok: false, code: "key", detail };
    if (res.status === 429) return { ok: false, code: "busy", detail };
    if (/safety|blocked|prohibited/i.test(text)) return { ok: false, code: "blocked", detail };
    return { ok: false, code: "failed", detail };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "failed", detail: "not json" };
  }
  const pic = findImage(json, sent.b64);
  if (pic) return { ok: true, pic };
  // no picture: a refusal says so, anything else is a plain miss
  if (/SAFETY|PROHIBITED|BLOCK/i.test(text)) return { ok: false, code: "blocked", detail: text.slice(0, 400) };
  return { ok: false, code: "no-image", detail: text.slice(0, 400) };
}

/**
 * The first picture in a reply, wherever that reply keeps it (generateContent: candidates, content,
 * parts, inlineData; Interactions: steps, content, an "image" block). The picture sent in, if the
 * reply repeats it, doesn't count.
 */
export function findImage(x: unknown, sent: string, depth = 0): Pic | null {
  if (!x || typeof x !== "object" || depth > 14) return null;
  if (Array.isArray(x)) {
    for (const y of x) {
      const r = findImage(y, sent, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const o = x as Record<string, unknown>;
  // (a step or a turn that is the player's own input is skipped whole)
  if (o.role === "user" || o.type === "user_input") return null;
  const one = (data: unknown, mime: unknown): Pic | null => {
    if (typeof data !== "string" || data.length < 200 || data === sent) return null;
    const m = typeof mime === "string" ? mime : "image/png";
    return m.startsWith("image/") ? { mime: m, b64: data } : null;
  };
  for (const k of ["inlineData", "inline_data"]) {
    const d = o[k] as Record<string, unknown> | undefined;
    const r = d && one(d.data, d.mimeType ?? d.mime_type);
    if (r) return r;
  }
  if (o.type === "image") {
    const r = one(o.data, o.mime_type ?? o.mimeType);
    if (r) return r;
  }
  for (const v of Object.values(o)) {
    const r = findImage(v, sent, depth + 1);
    if (r) return r;
  }
  return null;
}
