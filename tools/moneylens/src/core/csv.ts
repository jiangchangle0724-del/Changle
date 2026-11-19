/**
 * A CSV reader (RFC 4180, read the forgiving way bank exports need): quoted fields, a doubled
 * quote for a quote, line breaks inside quotes, any of the three line endings. It only splits
 * text into rows of fields. What the columns mean is each bank's own parser's business (IMP-3).
 * It stops with a `CsvError` past its limits, so a hostile file can't make it run on (T-11).
 */

export type CsvCode = "unterminated-quote" | "too-many-rows" | "too-many-fields" | "field-too-long";

export class CsvError extends Error {
  constructor(readonly code: CsvCode) {
    super(`csv: ${code}`);
    this.name = "CsvError";
  }
}

export type CsvOptions = {
  /** What separates fields: a comma unless said otherwise. */
  delimiter?: "," | ";" | "\t" | "|";
  /** Most rows (default 100,000), most fields in a row (default 100), most characters in a field (default 2,000). */
  maxRows?: number;
  maxFields?: number;
  maxFieldChars?: number;
};

/** The rows of a CSV text, each a list of fields exactly as written (not trimmed). A blank line is a row with one empty field; a last line break doesn't make a row. */
export function parseCsv(text: string, options: CsvOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ",";
  const maxRows = options.maxRows ?? 100_000;
  const maxFields = options.maxFields ?? 100;
  const maxFieldChars = options.maxFieldChars ?? 2_000;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false; // inside a quoted field
  let closed = false; // just after a quoted field's closing quote
  let any = false; // has this row had anything at all (a character, a quote or a delimiter)
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    if (row.length >= maxFields) throw new CsvError("too-many-fields");
    row.push(field);
    field = "";
    closed = false;
  };
  const endRow = () => {
    endField();
    if (rows.length >= maxRows) throw new CsvError("too-many-rows");
    rows.push(row);
    row = [];
    any = false;
  };
  const take = (ch: string) => {
    if (field.length >= maxFieldChars) throw new CsvError("field-too-long");
    field += ch;
  };

  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') take(ch);
      else if (text[i + 1] === '"') {
        take('"');
        i++;
      } else {
        quoted = false;
        closed = true;
      }
      continue;
    }
    if (ch === '"' && field === "" && !closed) {
      quoted = true;
      any = true;
    } else if (ch === delimiter) {
      any = true;
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      // (a quote in the middle of an unquoted field, or text after a closing quote, is kept as written)
      any = true;
      take(ch);
    }
  }
  if (quoted) throw new CsvError("unterminated-quote");
  if (any || field !== "" || row.length) endRow();
  return rows;
}

/** The rows that have something in them (bank exports pad with blank lines). */
export const filled = (rows: string[][]): string[][] => rows.filter((r) => r.some((f) => f.trim() !== ""));
