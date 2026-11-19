/**
 * What a file is, told from its first bytes and never from its name (IMP-4). A file that is too
 * big, empty, or of a kind MoneyLens doesn't read is refused here, before any parser sees it.
 */

/** The largest file taken: 10 MB (IMP-4). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type Sniffed =
  | { kind: "ofx" | "pdf" | "text" }
  | { kind: "unsupported"; why: "empty" | "too-big" | "spreadsheet" | "archive" | "image" | "web-page" | "binary" };

const startsWith = (bytes: Uint8Array, ...sig: number[]): boolean => sig.every((b, i) => bytes[i] === b);

export function sniff(bytes: Uint8Array): Sniffed {
  if (bytes.length === 0) return { kind: "unsupported", why: "empty" };
  if (bytes.length > MAX_FILE_BYTES) return { kind: "unsupported", why: "too-big" };
  const head = bytes.subarray(0, 4096);
  // (Latin-1 keeps every byte as one character, which is all that looking for ASCII marks needs)
  const ascii = new TextDecoder("latin1").decode(head);
  if (ascii.slice(0, 1024).includes("%PDF-")) return { kind: "pdf" };
  // .xlsx, .numbers and .zip all start as a zip; .xls is the old Office container
  if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04) || startsWith(bytes, 0x50, 0x4b, 0x05, 0x06)) return { kind: "unsupported", why: "archive" };
  if (startsWith(bytes, 0xd0, 0xcf, 0x11, 0xe0)) return { kind: "unsupported", why: "spreadsheet" };
  if (
    startsWith(bytes, 0x89, 0x50, 0x4e, 0x47) || // PNG
    startsWith(bytes, 0xff, 0xd8, 0xff) || // JPEG
    ascii.startsWith("GIF8") ||
    (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") ||
    ascii.slice(4, 8) === "ftyp" || // HEIC and its relatives: photos from a phone
    startsWith(bytes, 0x49, 0x49, 0x2a, 0x00) || // TIFF
    startsWith(bytes, 0x4d, 0x4d, 0x00, 0x2a)
  )
    return { kind: "unsupported", why: "image" };
  const utf16 = startsWith(bytes, 0xff, 0xfe) || startsWith(bytes, 0xfe, 0xff);
  // UTF-16 text has a zero in every other byte, so it is read with them taken out
  const plain = utf16 ? ascii.replace(/\u0000/g, "") : ascii;
  if (!utf16 && head.includes(0)) return { kind: "unsupported", why: "binary" };
  const start = plain.replace(/^[\u00ef\u00bb\u00bf\u00ff\u00fe\s]+/, "");
  if (/^OFXHEADER/i.test(start) || /<\?OFX\b/i.test(plain) || /<OFX>/i.test(plain)) return { kind: "ofx" };
  // a bank's sign-in page saved under a statement's name, when the session had run out
  if (/^(?:<!doctype html|<html[\s>])/i.test(start)) return { kind: "unsupported", why: "web-page" };
  return { kind: "text" };
}
