/**
 * The front door for a statement file: tell what it is from its bytes (IMP-4), hand it to the
 * reader for that format (IMP-3), and get back statements to preview, or one reason it was
 * refused. A refused file leaves nothing behind (T-11). This runs in the browser only: the file is
 * never uploaded (IMP-1, IMP-7).
 *
 * There is no list of banks (IN-2, as the operator settled it on 2026-11-19). The readers are by
 * format: OFX and QFX say what they hold; a CSV file's layout is worked out from the file and
 * confirmed by the person in the preview (anycsv.ts). A parser written for one bank's layout can
 * still be registered, and is tried first, for a bank whose export the general reader gets wrong.
 */
import { readAnyCsv, readCsvAs, type CsvHints } from "./anycsv";
import { CsvError, filled, parseCsv } from "./csv";
import type { CsvLayout, ParsedStatement, ReadResult } from "./model";
import { MAX_LINES, readOfx } from "./ofx";
import { sniff } from "./sniff";
import { decodeText } from "./text";

/** A parser for one bank's CSV layout: how to recognize it, and how to read it. */
export type CsvParser = {
  /** The parser's name, kept with every import it reads: "<bank>-<kind>-csv". */
  id: string;
  /** What separates this bank's fields. */
  delimiter?: "," | ";" | "\t";
  /** Is this file in this bank's layout? Told from its header row and the shape of its rows, never guessed loosely. */
  matches(rows: readonly string[][]): boolean;
  /** The statement in it. Null when the file breaks the layout it was recognized by. */
  read(rows: readonly string[][]): ParsedStatement | null;
};

/** Parsers for single banks. None yet: the general reader takes every CSV file. */
export const CSV_PARSERS: readonly CsvParser[] = [];

/** Every named parser (IMP-3), for the import screen to list what is read: "csv" is the general CSV reader. */
export const PARSER_IDS: readonly string[] = ["ofx", "csv", ...CSV_PARSERS.map((p) => p.id)];

/** What the caller may know before the file is read. */
export type ReadOptions = CsvHints & {
  /** Parsers for single banks, tried before the general CSV reader. */
  csvParsers?: readonly CsvParser[];
  /** A CSV layout to read with: the one kept with the account from an earlier file, or the one a person just corrected in the preview. */
  layout?: CsvLayout;
};

export function readStatementFile(bytes: Uint8Array, options: ReadOptions = {}): ReadResult {
  const what = sniff(bytes);
  if (what.kind === "unsupported") return { ok: false, error: what.why === "empty" ? "empty" : what.why === "too-big" ? "too-big" : "not-a-statement" };
  if (what.kind === "pdf") return { ok: false, error: "pdf-not-yet" };
  if (what.kind === "ofx") return readOfx(bytes);
  let text: string;
  try {
    text = decodeText(bytes);
    for (const parser of options.csvParsers ?? CSV_PARSERS) {
      const rows = filled(parseCsv(text, { delimiter: parser.delimiter ?? ",", maxRows: MAX_LINES + 100 }));
      if (!parser.matches(rows)) continue;
      const statement = parser.read(rows);
      if (!statement) return { ok: false, error: "malformed" };
      if (!statement.lines.length) return { ok: false, error: "no-lines" };
      return { ok: true, statements: [statement] };
    }
  } catch (e) {
    return { ok: false, error: e instanceof CsvError && e.code === "too-many-rows" ? "too-long" : "malformed" };
  }
  if (options.layout) {
    // a kept layout that no longer fits (the bank changed its export) is not forced onto the file: it is worked out afresh
    const kept = readCsvAs(text, options.layout, options);
    if (kept.ok || kept.error !== "layout-unclear") return kept;
  }
  return readAnyCsv(text, options);
}
