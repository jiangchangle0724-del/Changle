// Reading a receipt: what it says was paid in all, in what currency, and at which shop, so the
// phone can fill those in for a person to check. The photo (or PDF) goes to Google's Gemini (the
// cheapest model that reads well: GEMINI_READ_MODEL, else the first of READ_MODELS that Google
// serves), which answers in JSON in a shape it is given. Nothing is kept by Google's paid API
// beyond what abuse monitoring needs; nothing here keeps anything either.
//
// What it costs is worked out from what Google says the reading used (its usageMetadata), at the
// model's prices, in millionths of a dollar: the Worker counts it against a month's budget
// (READ_BUDGET, Steve's 2 dollars) and stops reading for the rest of the month once it is spent.
//
// The parts that don't touch the network (the request, reading the answer, the cost) are plain
// functions, tested without Cloudflare (tests/room.test.ts). Locally, and in the tests, a stand-in
// answers instead of Google (`fakeRead`): there is no key there, and no way out to Google.

/** What was read: the total as written (digits, a dot before the cents), its currency if it can be told, the shop. */
export type Read = { total: string; currency: string | null; merchant: string | null };
export type ReadReply = { read: Read | null };
/** A reading's cost, and what came of it. `cost`: millionths of a dollar. */
export type Reading = { ok: true; read: Read | null; cost: number } | { ok: false; why: "key" | "busy" | "failed"; detail?: string; cost: number };

/** The models tried, cheapest first, with their prices in dollars per million tokens (in, and out with thinking). */
export const READ_MODELS: { model: string; inPrice: number; outPrice: number }[] = [
  { model: "gemini-3.1-flash-lite", inPrice: 0.25, outPrice: 1.5 },
  { model: "gemini-3.5-flash-lite", inPrice: 0.3, outPrice: 2.5 },
];
/** A month's spending on reading, in millionths of a dollar: Steve's 2 dollars (agreed 2026-11-14). */
export const READ_BUDGET = 2_000_000;
/** Receipts one account may have read in a day: a long day's trip, twice over. */
export const READS_PER_DAY = 30;
/** What a reading is taken to cost before it is known, when deciding whether the month has room for one. */
export const READ_GUESS = 2_000;
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT = 30_000;
/** The currencies a ledger can be in (site/src/tools/money.ts). */
const KNOWN = ["CAD", "CNY", "USD", "HKD", "EUR", "GBP", "JPY", "KRW", "TWD", "SGD", "AUD"];
/** As much of a shop's name as goes in a note. */
const MERCHANT_MOST = 40;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

/** The month a reading counts against ("2026-11"), by UTC. */
export const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);

/** What is asked: the receipt, and what the group usually pays in (a "$" on its own is that). */
export function readRequest(b64: string, type: string, currency: string, thinking: boolean): unknown {
  const words = [
    "This is a photo of a receipt or a bill, or something else.",
    "If it is a receipt or a bill, read the total that was paid: the grand total, with tax and tip when they are shown, not a subtotal and not the change given.",
    "Write it with digits and a dot before the cents, no currency sign and no thousands separators (1234.56). For a currency with no cents, digits only.",
    `Say its currency as an ISO 4217 code when the receipt shows it (a sign, a code, the country or the language). A bare "$" is ${currency}.`,
    "Say the shop or restaurant's name as the receipt shows it, short.",
    "If it isn't a receipt or a bill, or the total can't be read, say receipt false, and nothing else.",
  ].join(" ");
  return {
    contents: [{ role: "user", parts: [{ text: words }, { inline_data: { mime_type: type, data: b64 } }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          receipt: { type: "BOOLEAN" },
          total: { type: "STRING", nullable: true },
          currency: { type: "STRING", nullable: true },
          merchant: { type: "STRING", nullable: true },
        },
        required: ["receipt"],
      },
      temperature: 0,
      ...(thinking ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
    },
  };
}

/** A total as the phone takes it: digits with at most one dot and two decimals (none for a currency without cents), more than nothing, and no more than a ledger takes. */
function asTotal(x: unknown, currency: string): string | null {
  // (money back, written with a minus or in brackets, is no total to pay)
  if (typeof x !== "string" || /[-(]/.test(x)) return null;
  const t = x.replace(/[\s,]/g, "").replace(/^[^\d.]+/, "").replace(/[^\d.]+$/, "");
  const whole = currency === "JPY" || currency === "KRW";
  if (!(whole ? /^\d{1,10}$/ : /^\d{1,8}(\.\d{1,2})?$/).test(t)) return null;
  const n = Number(t);
  if (!(n > 0)) return null;
  // (one decimal is written with two, as money is: 42.5 is 42.50)
  return whole ? String(Math.round(n)) : t.replace(/\.(\d)$/, (_, d: string) => `.${d}0`);
}

/**
 * What Google answered, read: the total (null when it read none, or none that is a total), the
 * currency (one a ledger can be in, else none), the shop (short, plain). `currency` is the ledger's,
 * for a total with none of its own.
 */
export function readAnswer(answer: unknown, currency: string): Read | null {
  const text = (answer as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null)?.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text;
  if (typeof text !== "string") return null;
  let said: Record<string, unknown>;
  try {
    said = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!said || typeof said !== "object" || said.receipt !== true) return null;
  const code = typeof said.currency === "string" ? said.currency.trim().toUpperCase() : "";
  const known = KNOWN.includes(code) ? code : null;
  const total = asTotal(said.total, known ?? currency);
  if (!total) return null;
  const shop = typeof said.merchant === "string" ? said.merchant.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim().slice(0, MERCHANT_MOST) : "";
  return { total, currency: known, merchant: shop || null };
}

/** What a reading cost, in millionths of a dollar: what went in, and what came out (thinking too), at the model's prices. */
export function costOf(answer: unknown, model: string): number {
  const price = READ_MODELS.find((m) => m.model === model) ?? READ_MODELS[READ_MODELS.length - 1];
  const use = (answer as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata ?? {};
  const n = (k: string) => (typeof use[k] === "number" && Number.isFinite(use[k]) ? (use[k] as number) : 0);
  return Math.ceil(n("promptTokenCount") * price.inPrice + (n("candidatesTokenCount") + n("thoughtsTokenCount")) * price.outPrice);
}

/** Bytes as base64, a piece at a time (a 10 MB photo is too many to spread into one call). */
export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Read one receipt with Google's model. A model Google no longer serves is passed for the next; a
 * setting a model doesn't take (thinking) is dropped and asked again. What it cost is what each
 * answer said it used.
 */
export async function readReceipt(key: string, bytes: Uint8Array, type: string, currency: string, model?: string): Promise<Reading> {
  const models = model ? [model, ...READ_MODELS.map((m) => m.model).filter((m) => m !== model)] : READ_MODELS.map((m) => m.model);
  const b64 = base64(bytes);
  let cost = 0;
  let last: Reading = { ok: false, why: "failed", detail: "no model", cost };
  for (const m of models) {
    for (const thinking of [true, false]) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/models/${encodeURIComponent(m)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key, "user-agent": "changle/1.0 (+https://changle.ca)" },
          body: JSON.stringify(readRequest(b64, type, currency, thinking)),
          signal: AbortSignal.timeout(TIMEOUT),
        });
      } catch (e) {
        return { ok: false, why: "busy", detail: String(e), cost };
      }
      const answer: unknown = await res.json().catch(() => null);
      cost += costOf(answer, m);
      if (res.ok) return { ok: true, read: readAnswer(answer, currency), cost };
      const detail = JSON.stringify((answer as { error?: unknown } | null)?.error ?? res.status).slice(0, 300);
      if (res.status === 401 || res.status === 403 || /api.?key/i.test(detail)) return { ok: false, why: "key", detail, cost };
      if (res.status === 429 || res.status >= 500) return { ok: false, why: "busy", detail, cost };
      last = { ok: false, why: "failed", detail, cost };
      // (a setting this model doesn't take: asked again without it)
      if (thinking && /thinking/i.test(detail)) continue;
      break;
    }
    if (!/not.?found|unsupported|not supported|invalid model|unknown/i.test(last.ok ? "" : (last.detail ?? ""))) return last;
  }
  return last;
}

/**
 * The stand-in for Google, locally and in the tests (no key there, and no way out to Google): it
 * "reads" what the file's own bytes say after "receipt:" (`total currency merchant`), and a file
 * saying "receipt:none" is no receipt. Each reading costs 400 millionths, as if Google had said so.
 */
export function fakeRead(bytes: Uint8Array, currency: string): Reading {
  const text = new TextDecoder().decode(bytes);
  const said = /receipt:(\S+)(?: (\S+))?(?: ([^\n]+))?/.exec(text);
  if (!said || said[1] === "none") return { ok: true, read: null, cost: 400 };
  const answer = { candidates: [{ content: { parts: [{ text: JSON.stringify({ receipt: true, total: said[1], currency: said[2] ?? null, merchant: said[3] ?? null }) }] } }] };
  return { ok: true, read: readAnswer(answer, currency), cost: 400 };
}
