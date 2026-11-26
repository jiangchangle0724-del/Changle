/**
 * A PDF file to the runs of text on its pages (src/web/pdf.ts), with PDF.js under Node. Every PDF
 * here is written by the test (tests/pdfmake.ts): none is a bank's (SEC-12).
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { sniff } from "../src/core/sniff";
import { pdfPages, type PdfLib } from "../src/web/pdf";
import { makePdf } from "./pdfmake";

const lib = pdfjs as unknown as PdfLib;

test("a PDF's text comes out as runs, each where it sits on its page", async () => {
  const bytes = makePdf([
    { runs: [{ text: "Opening balance", x: 72, y: 100 }, { text: "1,000.00", x: 500, y: 100 }, { text: "Oct 02", x: 72, y: 114 }, { text: "CAFE (MAPLE) #12", x: 130, y: 114 }, { text: "4.50", x: 420, y: 114, size: 12 }] },
    { width: 792, height: 612, runs: [{ text: "Page 2", x: 40, y: 30 }] },
  ]);
  assert.deepEqual(sniff(bytes), { kind: "pdf" });
  const read = await pdfPages(lib, bytes);
  assert.ok(read.ok);
  assert.deepEqual(read.pages.map((page) => [page.width, page.height]), [[612, 792], [792, 612]]);
  assert.deepEqual(
    read.pages[0]!.runs.map((run) => [run.text, run.x, run.y, run.h]),
    [["Opening balance", 72, 100, 9], ["1,000.00", 500, 100, 9], ["Oct 02", 72, 114, 9], ["CAFE (MAPLE) #12", 130, 114, 9], ["4.50", 420, 114, 12]],
  );
  // a run has a width: the reader tells columns apart by where a number ends
  assert.ok(read.pages[0]!.runs.every((run) => run.w > 10 && run.w < 100));
  assert.deepEqual(read.pages[1]!.runs.map((run) => [run.text, run.x, run.y]), [["Page 2", 40, 30]]);
});

test("a PDF past the limits, or not readable, is refused (IMP-4, T-11)", async () => {
  const error = async (bytes: Uint8Array, limits = {}): Promise<string> => {
    const read = await pdfPages(lib, bytes, limits);
    return read.ok ? "ok" : read.error;
  };
  const one = makePdf([{ runs: [{ text: "Balance", x: 72, y: 100 }] }]);
  assert.equal(await error(one), "ok");
  assert.equal(await error(one, { bytes: 100 }), "too-big");
  assert.equal(await error(makePdf([{ runs: [{ text: "1", x: 72, y: 100 }] }, { runs: [{ text: "2", x: 72, y: 100 }] }, { runs: [{ text: "3", x: 72, y: 100 }] }]), { pages: 2 }), "too-long");
  assert.equal(await error(makePdf([{ runs: Array.from({ length: 30 }, (_, i) => ({ text: `run ${i}`, x: 72, y: 20 + i * 12 })) }]), { runs: 20 }), "too-long");
  // a file that never finishes is given up on, and what was started for it is torn down
  let destroyed = 0;
  const stuck: PdfLib = { getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => void destroyed++ }) };
  assert.deepEqual(await pdfPages(stuck, one, { ms: 20 }), { ok: false, error: "too-slow" });
  assert.equal(destroyed, 1);
  // A reader still busy with the file never answers when told to let it go. The page is not held up by that: the wait
  // for the answer is a short one, and whoever started the reader ends it.
  const deaf: PdfLib = { getDocument: () => ({ promise: new Promise(() => {}), destroy: () => new Promise(() => {}) }) };
  const began = Date.now();
  assert.deepEqual(await pdfPages(deaf, one, { ms: 20 }), { ok: false, error: "too-slow" });
  assert.ok(Date.now() - began < 5000, "waited on a reader that does not answer");
  // (and one that fails at being told so changes nothing)
  const rude: PdfLib = {
    getDocument: () => ({
      promise: new Promise(() => {}),
      destroy: () => {
        throw new Error("gone already");
      },
    }),
  };
  assert.deepEqual(await pdfPages(rude, one, { ms: 20 }), { ok: false, error: "too-slow" });
  // one that needs a password
  const locked: PdfLib = { getDocument: () => ({ promise: Promise.reject(Object.assign(new Error("No password given"), { name: "PasswordException" })), destroy: async () => {} }) };
  assert.deepEqual(await pdfPages(locked, one), { ok: false, error: "locked" });
  // a scan has pages and no text
  assert.equal(await error(makePdf([{ runs: [] }, { runs: [] }])), "no-text");
  // not a PDF inside, or cut short
  assert.equal(await error(new TextEncoder().encode("%PDF-1.4\nnot really a pdf")), "malformed");
  assert.equal(await error(one.slice(0, 200)), "malformed");
  assert.equal(await error(new Uint8Array(0)), "malformed");
  // PDF.js's own verdict on such a file comes with its name: the file cannot be opened at all
  assert.deepEqual(await pdfPages(lib, new TextEncoder().encode("%PDF-1.4\nnot really a pdf")), { ok: false, error: "malformed", cause: "InvalidPDFException" });
  // Any other error is the reader's own trouble with the file, told apart by its name. Only a name is passed on, and only
  // one that is a plain word: an error's message can quote the file (OBS-1).
  const failing = (name: unknown): PdfLib => ({ getDocument: () => ({ promise: Promise.reject(Object.assign(new Error("CAFE MAPLE 4.50"), { name })), destroy: async () => {} }) });
  assert.deepEqual(await pdfPages(failing("TypeError"), one), { ok: false, error: "malformed", cause: "TypeError" });
  assert.deepEqual(await pdfPages(failing("CAFE MAPLE 4.50"), one), { ok: false, error: "malformed" });
  assert.deepEqual(await pdfPages(failing(42), one), { ok: false, error: "malformed" });
});
