/**
 * The front door for a statement file: tell what it is from its bytes (IMP-4), hand it to the
 * named parser for that bank and format (IMP-3), and get back statements to preview, or one reason
 * it was refused. A refused file leaves nothing behind (T-11). This runs in the browser only: the
 * file is never uploaded (IMP-1, IMP-7).
 */
import { CsvError, filled, parseCsv } from "./csv";
import type { ParsedStatement, ReadResult } from "./model";
import { MAX_LINES, readOfx } from "./ofx";
import { sniff } from "./sniff";
import { decodeText } from "./text";

/** A bank's CSV layout: how to recognize it, and how to read it. One per institution and account kind (IMP-3). */
export type CsvParser = {
  /** The parser's name, kept with every import it reads: "<bank>-<kind>-csv". */
  id: string;
  /** What separates this bank's fields. */
  delimiter?: "," | ";" | "\t";
  /** Is this file in this bank's layout? Told from its header row and the shape of its rows, never guessed loosely: a file no parser claims is refused. */
  matches(rows: readonly string[][]): boolean;
  /** The statement in it. Null when the file breaks the layout it was recognized by. */
  read(rows: readonly string[][]): ParsedStatement | null;
};

/**
 * The CSV parsers. None yet: each is written from a synthetic sample of that bank's own export,
 * made with the fixture tool (IMP-9), and added here with its fixtures and its reconciliation test.
 */
export const CSV_PARSERS: readonly CsvParser[] = [];

/** Every named parser, for the import screen to list what is supported. */
export const PARSER_IDS: readonly string[] = ["ofx", ...CSV_PARSERS.map((p) => p.id)];

export function readStatementFile(bytes: Uint8Array, csvParsers: readonly CsvParser[] = CSV_PARSERS): ReadResult {
  const what = sniff(bytes);
  if (what.kind === "unsupported") return { ok: false, error: what.why === "empty" ? "empty" : what.why === "too-big" ? "too-big" : "not-a-statement" };
  if (what.kind === "pdf") return { ok: false, error: "pdf-not-yet" };
  if (what.kind === "ofx") return readOfx(bytes);
  try {
    const text = decodeText(bytes);
    for (const parser of csvParsers) {
      const rows = filled(parseCsv(text, { delimiter: parser.delimiter ?? ",", maxRows: MAX_LINES + 100 }));
      if (!parser.matches(rows)) continue;
      const statement = parser.read(rows);
      if (!statement) return { ok: false, error: "malformed" };
      if (!statement.lines.length) return { ok: false, error: "no-lines" };
      return { ok: true, statements: [statement] };
    }
    return { ok: false, error: "no-parser" };
  } catch (e) {
    return { ok: false, error: e instanceof CsvError && e.code === "too-many-rows" ? "too-long" : "malformed" };
  }
}
