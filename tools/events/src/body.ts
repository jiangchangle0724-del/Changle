// Reading a body (a source's answer, a page handed over) without taking more than a limit into
// memory. The run's steps use it, the hand-over endpoint and the GitHub job too (src/handoff.ts).

/** The body is larger than the limit. */
export class TooLarge extends Error {}

/** A body's text, refusing one larger than `max` bytes: by its declared length, or as it streams in. */
export async function readCapped(from: { headers: Headers; body: ReadableStream | null }, max: number): Promise<string> {
  const declared = Number(from.headers.get("content-length") ?? 0);
  if (declared > max) throw new TooLarge(`too large: ${declared} bytes`);
  const reader = from.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new TooLarge(`too large: over ${max} bytes`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
