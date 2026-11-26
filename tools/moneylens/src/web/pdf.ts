/**
 * A PDF file to the runs of text on its pages (core/pdftext.ts), with PDF.js (IMP-4).
 *
 * PDF.js is used for one thing: reading out the text and where it sits. Nothing is drawn, no font
 * in the file is loaded into the page, no script in the file is run (`isEvalSupported: false`
 * closes CVE-2024-4367, in PDF.js before 4.2.67), and nothing is fetched. In the browser the
 * parsing itself runs in PDF.js's Web Worker; the caller sets that up and hands the library in, so
 * the same code runs under Node in the tests.
 *
 * Limits (IMP-4): 10 MB, 100 pages, 30 seconds. A file past one of them is refused, and so is a
 * PDF with no text in it (a scan: IN-1 leaves those out) and one that needs a password.
 */
import { MAX_PDF_MS, MAX_PDF_PAGES, MAX_PDF_RUNS, type PdfPage, type PdfRun } from "../core/pdftext";
import { MAX_FILE_BYTES } from "../core/sniff";

export type PdfError = "too-big" | "too-long" | "too-slow" | "locked" | "no-text" | "malformed";
export type PdfRead =
  | { ok: true; pages: PdfPage[] }
  | {
      ok: false;
      error: PdfError;
      /**
       * With "malformed": the kind of error the reader stopped with, by its name only (a message can quote the file).
       * PDF.js says "InvalidPDFException" of a file it cannot open at all; any other name is the reader's own trouble
       * with the file, which another program may open without complaint.
       */
      cause?: string;
    };

/** The part of PDF.js this file uses. */
type TextItem = { str?: string; transform?: number[]; width?: number; height?: number };
type Viewport = { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] };
type Page = { getViewport(options: { scale: number }): Viewport; getTextContent(options?: object): Promise<{ items: TextItem[] }>; cleanup(): void };
type Doc = { numPages: number; getPage(n: number): Promise<Page> };
type Task = { promise: Promise<Doc>; destroy(): Promise<void> };
export type PdfLib = { getDocument(source: object): Task };

export type PdfLimits = { bytes?: number; pages?: number; ms?: number; runs?: number };

/** How long the reader is waited on to let a file go. */
const LET_GO_MS = 1000;

export async function pdfPages(lib: PdfLib, bytes: Uint8Array, limits: PdfLimits = {}): Promise<PdfRead> {
  if (bytes.length > (limits.bytes ?? MAX_FILE_BYTES)) return { ok: false, error: "too-big" };
  let task: Task | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<PdfRead>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: "too-slow" }), limits.ms ?? MAX_PDF_MS);
  });
  const read = async (): Promise<PdfRead> => {
    task = lib.getDocument({
      data: bytes.slice(), // PDF.js takes the buffer it is given: it gets a copy
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
      stopAtErrors: true,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      verbosity: 0,
    });
    const doc = await task.promise;
    if (doc.numPages > (limits.pages ?? MAX_PDF_PAGES)) return { ok: false, error: "too-long" };
    const pages: PdfPage[] = [];
    let count = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent({ includeMarkedContent: false });
      const runs: PdfRun[] = [];
      for (const item of content.items) {
        const text = typeof item.str === "string" ? item.str : "";
        const t = item.transform;
        if (text.trim() === "" || !t || t.length < 6) continue;
        const [x, y] = view.convertToViewportPoint(t[4]!, t[5]!);
        const h = Math.hypot(t[2]!, t[3]!) || item.height || 0;
        if (![x, y, h, item.width ?? 0].every(Number.isFinite)) continue;
        runs.push({ text, x: round(x!), y: round(y!), w: round(item.width ?? 0), h: round(h) });
        if (++count > (limits.runs ?? MAX_PDF_RUNS)) return { ok: false, error: "too-long" };
      }
      page.cleanup();
      pages.push({ width: round(view.width), height: round(view.height), runs });
    }
    return count === 0 ? { ok: false, error: "no-text" } : { ok: true, pages };
  };
  try {
    return await Promise.race([read(), late]);
  } catch (e) {
    const name = (e as { name?: unknown } | null)?.name;
    if (name === "PasswordException") return { ok: false, error: "locked" };
    return { ok: false, error: "malformed", ...(typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? { cause: name } : {}) };
  } finally {
    clearTimeout(timer);
    // PDF.js asks its worker to let the file go, and waits for the answer. A worker still busy with a file that ran past
    // the limit does not answer, so the wait is a short one: the caller ends such a worker (IMP-4).
    const gone = Promise.resolve()
      .then(() => task?.destroy())
      .catch(() => undefined);
    await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, LET_GO_MS))]);
  }
}

/** A tenth of a point is finer than any layout needs, and keeps a fixture small. */
const round = (n: number): number => Math.round(n * 10) / 10;
