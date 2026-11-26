import { CODE_RE } from "../shared/protocol";

/** What a scanned code asks for: a table here, another changle.ca page, or nothing of ours. */
export type Scanned = { kind: "table"; code: string } | { kind: "page"; href: string } | null;

const table = (s: string): Scanned => (CODE_RE.test(s.toUpperCase()) ? { kind: "table", code: s.toUpperCase() } : null);

/**
 * A table's QR code holds its link (changle.ca/t/ABCD, `inviteLink`); a code on its own works too.
 * Any other changle.ca page (a 两清 ledger, a 随便 table) opens as it is. Anything else is
 * refused: a code on a poster can point anywhere, and this sheet only takes people to tables.
 */
export function readScan(text: string, origin: string): Scanned {
  const raw = text.trim();
  if (/^[A-Za-z0-9]{4}$/.test(raw)) return table(raw);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const site = /^(www\.)?changle\.ca$/i.test(u.hostname) && u.protocol === "https:";
  if (!site && u.origin !== origin) return null;
  const m = /^\/t\/([A-Za-z0-9]{4})\/?$/.exec(u.pathname);
  if (m) return table(m[1]);
  return { kind: "page", href: u.href };
}
