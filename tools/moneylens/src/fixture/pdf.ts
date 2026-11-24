/**
 * A PDF statement's layout with invented contents (IMP-9): the same runs of text in the same
 * places, every word and number in them invented (invent.ts). This is what the operator shares
 * from a real statement so that a reader can be built for its layout; the statement itself stays
 * on his device (SEC-12).
 *
 * The numbers are invented one by one, so the sums on such a page do not add up: it shows where
 * things are and how they are written, which is what a reader has to learn first.
 */
import { lineText, linesOf, type PdfPage, type PdfRun } from "../core/pdftext";
import { Inventor, type Random } from "./invent";

/** What the tool writes to a file. `invented` says what it is to whoever opens it. */
export type PdfFixture = { kind: "moneylens-pdf-layout"; version: 1; invented: true; pages: PdfPage[] };

export function inventPdf(pages: readonly PdfPage[], random: Random): PdfFixture {
  const inventor = new Inventor(random);
  // a date is often set as two runs ("Oct" and "02"), so the texts are learned and invented a line at a time
  const lines = pages.map((page) => linesOf(page).map((line) => ({ line, ...lineText(line) })));
  for (const page of lines) for (const { text } of page) inventor.learn(text);
  const invented = pages.map((page, n) => {
    const runs: PdfRun[] = [];
    for (const { line, text, starts } of lines[n]!) {
      // What stands at each place of the line's text. A word or a number is as long as it was, so it goes back letter for letter, also
      // when it was set as several runs. A date can come out a digit longer or shorter: it goes whole to the run it started in.
      const at: string[] = Array.from({ length: text.length }, () => "");
      for (const piece of inventor.pieces(text)) {
        if (piece.out.length === piece.length) [...piece.out].forEach((c, i) => (at[piece.at + i] = c));
        else at[piece.at] = piece.out;
      }
      line.runs.forEach((run, i) => {
        const out = at.slice(starts[i]!, starts[i]! + run.text.length).join("");
        if (out.trim() !== "") runs.push({ ...run, text: out });
      });
    }
    return { width: page.width, height: page.height, runs };
  });
  return { kind: "moneylens-pdf-layout", version: 1, invented: true, pages: invented };
}

/** Is this a layout written by the tool? Checked before a fixture is read in a test. */
export function isPdfFixture(x: unknown): x is PdfFixture {
  const f = x as PdfFixture | null;
  const number = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n);
  return (
    typeof f === "object" &&
    f !== null &&
    f.kind === "moneylens-pdf-layout" &&
    f.version === 1 &&
    f.invented === true &&
    Array.isArray(f.pages) &&
    f.pages.every((page) => number(page?.width) && number(page?.height) && Array.isArray(page.runs) && page.runs.every((run) => typeof run?.text === "string" && [run.x, run.y, run.w, run.h].every(number)))
  );
}
