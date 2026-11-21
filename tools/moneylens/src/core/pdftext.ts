/**
 * The text of a PDF statement as it is laid out on its pages: runs of text, each with where it
 * sits. This is all a statement reader gets from a PDF (IMP-4): PDF.js turns the file into these
 * runs, in a Web Worker in the browser (src/web/pdf.ts), and nothing in the file is drawn or run.
 * It is also what the fixture tool writes for a PDF (IMP-9): the same runs in the same places,
 * with invented words and numbers.
 */

/** One run of text. Lengths are in points (1/72 inch): `x` from the page's left edge to the run's, `y` from the page's top down to the line the letters stand on, `w` the run's width, `h` the height of its type. */
export type PdfRun = { text: string; x: number; y: number; w: number; h: number };

/** One page, upright (a page turned on its side in the file is turned back). */
export type PdfPage = { width: number; height: number; runs: PdfRun[] };

/** The limits a PDF is read within (IMP-4): its size is MAX_FILE_BYTES (sniff.ts). */
export const MAX_PDF_PAGES = 100;
export const MAX_PDF_MS = 30_000;
/** More runs of text than any statement of a hundred pages has. */
export const MAX_PDF_RUNS = 200_000;

/** The runs that stand on one line, left to right. */
export type PdfLine = { y: number; h: number; runs: PdfRun[] };

/**
 * A page's runs gathered into lines, top to bottom. Two runs are on one line when the lines their
 * letters stand on are less than a third of the type's height apart: the cents of an amount set
 * a little higher, or a column set by another hand, stay on their line.
 */
export function linesOf(page: PdfPage): PdfLine[] {
  const lines: PdfLine[] = [];
  for (const run of [...page.runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(run.y - line.y) <= Math.max(run.h, line.h, 1) * 0.35) {
      line.runs.push(run);
      line.h = Math.max(line.h, run.h);
    } else lines.push({ y: run.y, h: run.h, runs: [run] });
  }
  for (const line of lines) line.runs.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * A line as one text, with where each run starts in it. Runs that touch are joined as they are
 * (some PDFs set a word letter by letter); a gap of a quarter of the type's height or more is a
 * space.
 */
export function lineText(line: PdfLine): { text: string; starts: number[] } {
  let text = "";
  const starts: number[] = [];
  line.runs.forEach((run, i) => {
    const before = line.runs[i - 1];
    if (before && run.x - (before.x + before.w) >= Math.max(run.h, before.h, 1) * 0.25 && !/\s$/.test(text) && !/^\s/.test(run.text)) text += " ";
    starts.push(text.length);
    text += run.text;
  });
  return { text, starts };
}
