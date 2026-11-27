/**
 * Opens the built statement check (dist/moneylens-check.html) in a real browser, straight from the
 * file as the operator will, and checks what a person would see: a made-up CSV statement is read
 * and shown, a made-up PDF's layout is recorded, what is offered for sharing holds nothing from
 * the file, and the page cannot reach the network. Run by `npm run test:page`, with the Chrome
 * already on the machine.
 */
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { isPdfFixture } from "../src/fixture/pdf";
import { makePdf } from "../tests/pdfmake";
import { CARD_SUMMARY, CARD_TABLE } from "../tests/pdfsamples";

const CSV = ["Date,Description,Amount,Balance", "2026-10-01,PAYROLL DEPOSIT ACME WIDGETS,2500.00,3500.00", "2026-10-02,CAFE MAPLE #12,-4.50,3495.50", "2026-10-15,NORTH SHORE GROCER,-82.17,3413.33"].join("\r\n");
const PDF_RUNS = [
  { text: "Opening balance", x: 72, y: 100 },
  { text: "1,000.00", x: 500, y: 100 },
  { text: "Oct 02", x: 72, y: 114 },
  { text: "CAFE MAPLE #12", x: 130, y: 114 },
  { text: "4.50", x: 420, y: 114 },
  { text: "995.50", x: 505, y: 114 },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ locale: "zh-CN", acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // (an answer from anywhere but this file would mean something went out; a request the policy stops gets none)
  page.on("response", (response) => {
    if (!/^(file|blob|data):/.test(response.url())) requests.push(response.url());
  });
  page.on("requestfinished", (request) => {
    if (!/^(file|blob|data):/.test(request.url())) requests.push(request.url());
  });
  await page.goto(pathToFileURL("dist/moneylens-check.html").href);
  await page.getByRole("heading", { name: "心里有数 · 账单试读" }).waitFor();

  // --- a CSV statement: read, shown, and the sums agree
  await page.locator("input[type=file]").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByText("读出 3 笔交易。").waitFor();
  await page.getByText("对上了：期初 1,000.00，加上各笔合计 2,413.33，等于期末 3,413.33。").waitFor();
  assert.deepEqual(await page.locator("tbody tr").nth(1).locator("td").allInnerTexts(), ["2026-10-02", "CAFE MAPLE #12", "-4.50", "3,495.50"]);
  const [shown, summary] = [await page.locator("textarea").nth(0).inputValue(), await page.locator("textarea").nth(1).inputValue()];
  // the summary: the layout, and nothing from the lines
  const told = JSON.parse(summary);
  assert.equal(told.read, "ok");
  assert.deepEqual(told.statements, [{ parser: "csv", currency: "CAD", lines: 3, balance: true, sums: "reconciled", unread: 0, warnings: [] }]);
  assert.deepEqual(told.layout.names, ["Date", "Description", "Amount", "Balance"]);
  for (const secret of ["PAYROLL", "ACME", "MAPLE", "GROCER", "2500", "3495", "82.17", "2026-10"]) assert.ok(!summary.includes(secret), `summary holds ${secret}`);
  // the invented copy, as it is downloaded: the same shape, other contents
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载" }).click();
  const invented = await readFile((await (await csvDownload).path())!, "utf8");
  assert.equal(shown, invented.replace(/\r\n/g, "\n"));
  const lines = invented.split("\r\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "Date,Description,Amount,Balance");
  assert.match(lines[2]!, /^2026-\d\d-\d\d,[A-Z]{4} [A-Z]{5} #\d\d,-\d\.\d\d,\d{4}\.\d\d$/);
  for (const secret of ["PAYROLL", "ACME", "MAPLE", "GROCER", "2500.00", "3495.50", "82.17"]) assert.ok(!invented.includes(secret), `the copy holds ${secret}`);

  // --- the kind of account is passed on: the same file as a card's
  await page.getByLabel("账户类型").selectOption("credit");
  await page.locator("input[type=file]").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByRole("heading", { name: "信用卡 · CAD" }).waitFor();

  // --- where the page stops, it says at which step and with what kind of error, and nothing of the file (OBS-1)
  const pdfFile = { name: "statement.pdf", mimeType: "application/pdf", buffer: Buffer.from(makePdf([{ runs: PDF_RUNS }, { runs: [{ text: "Page 2 of 2", x: 72, y: 60 }] }])) };
  const lastSummary = async (): Promise<unknown> => JSON.parse(await page.locator("textarea").last().inputValue());
  await page.getByText("页面第 3 版").waitFor();
  assert.equal(await page.getByText("嵌在别的窗口里").count(), 0);
  // a place that lets no worker start (PDF.js reads in a worker: IMP-4): by an exception...
  await page.evaluate(`(() => { window.__Worker = window.Worker; window.Worker = function () { throw new DOMException("no workers here", "SecurityError"); }; })()`);
  await page.locator("input[type=file]").setInputFiles(pdfFile);
  await page.getByText("PDF 阅读器在这里启动不了（reader · SecurityError）").waitFor();
  assert.deepEqual(await lastSummary(), { tool: "moneylens-check", version: 1, read: "page-error", stage: "reader", error: "SecurityError", page: 3 });
  // ...or, as a browser does when a policy stops the worker's script, by an event on a worker that never runs
  await page.evaluate(`(() => { window.Worker = class extends EventTarget { constructor() { super(); setTimeout(() => this.dispatchEvent(new Event("error")), 10); } terminate() {} postMessage() {} }; })()`);
  await page.locator("input[type=file]").setInputFiles(pdfFile);
  await page.getByText("PDF 阅读器在这里启动不了（reader · WorkerError）").waitFor();
  // a file of another kind is still read there
  await page.locator("input[type=file]").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByText("读出 3 笔交易。").waitFor();
  await page.evaluate(`(() => { window.Worker = window.__Worker; })()`);
  // a file the browser cannot open (moved, locked by another program, not yet down from a cloud folder)
  await page.evaluate(`(() => { window.__arrayBuffer = Blob.prototype.arrayBuffer; Blob.prototype.arrayBuffer = () => Promise.reject(new DOMException("C:\\Users\\A SAMPLE\\statement.csv", "NotReadableError")); })()`);
  await page.locator("input[type=file]").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByText("浏览器没能打开这个文件（open · NotReadableError）").waitFor();
  assert.deepEqual(await lastSummary(), { tool: "moneylens-check", version: 1, read: "page-error", stage: "open", error: "NotReadableError", page: 3 });
  assert.ok(!(await page.locator("body").innerText()).includes("SAMPLE"), "an error's message was shown");
  await page.evaluate(`(() => { Blob.prototype.arrayBuffer = window.__arrayBuffer; })()`);

  // --- a PDF with no table this reader knows: said so, and its layout is recorded with invented contents
  // (the reader starts now, after failing to twice)
  await page.locator("input[type=file]").setInputFiles(pdfFile);
  await page.getByText("这份 PDF 有 2 页，读出了 7 段文字，但这个版本还认不出它的交易表。").waitFor({ timeout: 30_000 });
  assert.equal(((await lastSummary()) as { read: string }).read, "layout-unclear");
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载" }).click();
  const layout: unknown = JSON.parse(await readFile((await (await pdfDownload).path())!, "utf8"));
  assert.ok(isPdfFixture(layout));
  assert.deepEqual(
    layout.pages[0]!.runs.map((run) => [run.x, run.y]),
    PDF_RUNS.map((run) => [run.x, run.y]),
  );
  const texts = layout.pages[0]!.runs.map((run) => run.text);
  assert.equal(texts[0], "Opening balance");
  assert.match(texts[1]!, /^\d,\d{3}\.\d\d$/);
  assert.match(texts[2]!, /^[A-Z][a-z]{2} \d\d$/);
  assert.match(texts[3]!, /^[A-Z]{4} [A-Z]{5} #\d\d$/);
  assert.match(layout.pages[1]!.runs[0]!.text, /^Page \d of \d$/);
  for (const secret of ["CAFE", "MAPLE", "1,000.00", "995.50"]) assert.ok(!JSON.stringify(layout).includes(secret), `the layout holds ${secret}`);

  // --- a card's statement in PDF: read into its lines, and the sums agree (the kind of account is still "credit card")
  await page.locator("input[type=file]").setInputFiles({ name: "card.pdf", mimeType: "application/pdf", buffer: Buffer.from(makePdf([{ runs: CARD_SUMMARY }, { runs: CARD_TABLE }])) });
  await page.getByRole("heading", { name: "信用卡 · CAD · ****4821" }).waitFor({ timeout: 30_000 });
  await page.getByText("读出 5 笔交易。").waitFor();
  await page.getByText("对上了：期初 -250.00，加上各笔合计 137.63，等于期末 -112.37。").waitFor();
  assert.deepEqual(await page.locator("tbody tr").nth(2).locator("td").allInnerTexts(), ["2026-09-29", "PAYMENT RECEIVED - THANK YOU", "250.00", ""]);
  const cardTold = (await lastSummary()) as { read: string; statements: unknown; pdf: { pages: number } };
  assert.deepEqual([cardTold.read, cardTold.statements, cardTold.pdf.pages], ["ok", [{ parser: "pdf", kind: "credit", currency: "CAD", lines: 5, balance: true, sums: "reconciled", unread: 0, warnings: [] }], 2]);
  const cardCopy = await page.locator("textarea").nth(0).inputValue();
  for (const secret of ["SAMPLE", "CAFE", "MAPLE", "GROCER", "ACME", "82.17", "250.00", "112.37", "4821", "9012"]) assert.ok(!cardCopy.includes(secret) && !JSON.stringify(cardTold).includes(secret), `what is passed on holds ${secret}`);

  // --- files that are not statements are refused in words
  await page.locator("input[type=file]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Dear customer,\nyour statement is ready.\n") });
  await page.getByText("这不像是银行导出的交易明细。").waitFor();
  await page.locator("input[type=file]").setInputFiles({ name: "statement.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x13, 0x00, 0x37, 0x00, 0xff, 0xfe, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]) });
  await page.getByText("认不出这是什么文件：它不是 PDF、CSV、OFX 或 QFX。").waitFor();
  await page.locator("input[type=file]").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nnot really") });
  await page.getByText("这份 PDF 有损坏，读不了。").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("tbody tr").count(), 0);

  // --- in English
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("heading", { name: "MoneyLens · statement check" }).waitFor();
  await page.getByText("This PDF is damaged and cannot be read.").waitFor();

  // --- the page cannot reach the network
  // (the page's side of this is written as text: a function handed over by the test runner would carry the runner's own helpers with it)
  const reach = await page.evaluate(`(async () => {
    const tried = [];
    await fetch("https://example.com/").then(() => tried.push("fetch went out"), () => tried.push("fetch blocked"));
    await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => { tried.push("image went out"); resolve(); };
      image.onerror = () => { tried.push("image blocked"); resolve(); };
      image.src = "https://example.com/x.png";
    });
    return tried;
  })()`);
  assert.deepEqual(reach, ["fetch blocked", "image blocked"]);
  assert.deepEqual(requests, [], "the page asked for something over the network");
  // (the two refusals above are the browser saying that the policy stopped them)
  assert.deepEqual(errors.filter((error) => !/Content Security Policy|Failed to load resource|ERR_BLOCKED_BY_CSP/.test(error)), []);

  // --- shown inside another page (a chat program's preview of the file), it says that PDFs may not be readable there
  await writeFile("dist/framed.html", `<!doctype html><meta charset="utf-8"><iframe sandbox="allow-scripts" src="moneylens-check.html" style="width:100%;height:600px"></iframe>`);
  try {
    const host = await context.newPage();
    await host.goto(pathToFileURL("dist/framed.html").href);
    await host.frameLocator("iframe").getByText("这个页面现在是嵌在别的窗口里打开的").waitFor();
    await host.close();
  } finally {
    await rm("dist/framed.html", { force: true });
  }
  console.log("statement check page: ok");
} finally {
  await browser.close();
}
