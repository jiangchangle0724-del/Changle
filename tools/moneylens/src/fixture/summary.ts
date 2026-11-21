/**
 * What a reader made of a file, with none of what was in it (IMP-9, SEC-12): for the operator to
 * pass on when a statement of his is read wrongly or not at all. It says which reader took the
 * file, the layout it worked out (column numbers and the bank's own column names), how many lines
 * it read, whether the sums agreed, and what it had to assume. A table it could not read is shown
 * by the shape of its first rows: 9 for a digit, A and a for letters, the punctuation as it is.
 * No amount, date, description or number from the file is in it.
 */
import { csvPreview } from "../core/anycsv";
import type { CsvLayout, ReadResult } from "../core/model";
import type { PdfPage } from "../core/pdftext";
import { reconcile } from "../core/reconcile";

export type Summary = {
  tool: "moneylens-check";
  version: 1;
  file: { kind: string; bytes: number };
  read: string;
  statements?: { parser: string; kind?: string; currency: string; lines: number; balance: boolean; sums: string; unread: number; warnings: string[] }[];
  layout?: CsvLayout;
  table?: { delimiter: string; width: number; names: string[] | null; shapes: string[][] };
  pdf?: { pages: number; runs: number };
};

/** A cell's shape: every digit a 9, every letter an A or an a (a Chinese character a 中), the rest as it is. */
export const shapeOf = (cell: string): string =>
  cell
    .replace(/\p{Script=Han}/gu, "中")
    .replace(/\p{Lu}/gu, "A")
    .replace(/\p{L}/gu, (c) => (c === "A" || c === "中" ? c : "a"))
    .replace(/\d/g, "9");

export function summaryOf(file: { kind: string; bytes: number }, read: ReadResult | null, text?: string, pdf?: readonly PdfPage[]): Summary {
  const summary: Summary = { tool: "moneylens-check", version: 1, file, read: read === null ? "not-read" : read.ok ? "ok" : read.error };
  if (read?.ok) {
    summary.statements = read.statements.map((s) => ({
      parser: s.parser,
      ...(s.account.kind ? { kind: s.account.kind } : {}),
      currency: s.account.currency,
      lines: s.lines.length,
      balance: s.opening !== undefined,
      sums: reconcile(s.lines, s.opening, s.closing).status,
      unread: s.unread,
      warnings: [...s.warnings],
    }));
    if (read.layout) summary.layout = read.layout;
  }
  if (text !== undefined) {
    const shown = csvPreview(text, undefined, 6);
    if (shown) summary.table = { delimiter: shown.delimiter, width: shown.width, names: shown.names, shapes: shown.rows.map((row) => row.map(shapeOf)) };
  }
  if (pdf) summary.pdf = { pages: pdf.length, runs: pdf.reduce((n, page) => n + page.runs.length, 0) };
  return summary;
}
