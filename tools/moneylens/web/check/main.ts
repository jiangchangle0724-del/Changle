/**
 * The statement check: one page that reads a statement file in this browser and shows what the
 * readers made of it. It is for the operator's own statements (Phase 2), and it is the fixture
 * tool of IMP-9: from a real file it writes a copy with the same layout and invented contents,
 * and a summary with no contents at all. Either can be shared; the file itself goes nowhere.
 *
 * The page is a single file with everything in it (scripts/build-check.mjs), and its policy
 * forbids the network: nothing can be loaded, and nothing can be sent (page.html).
 */
// (the build of PDF.js for browsers that are not the newest: the page is opened in whatever browser a person has)
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Day } from "../../src/core/dates";
import type { AccountKind, ImportError, ParsedStatement, ReadResult, Warning } from "../../src/core/model";
import { readPdfStatement } from "../../src/core/pdfstatement";
import { readStatementFile } from "../../src/core/read";
import { reconcile } from "../../src/core/reconcile";
import { sniff } from "../../src/core/sniff";
import { decodeText } from "../../src/core/text";
import { inventCsv } from "../../src/fixture/csv";
import { inventPdf } from "../../src/fixture/pdf";
import { summaryOf } from "../../src/fixture/summary";
import { pdfPages, type PdfError, type PdfLib } from "../../src/web/pdf";

/** The source of PDF.js's worker, put here by the build: the page loads nothing. */
declare const PDF_WORKER: string;

/** Which copy of this page a summary came from. It goes up by one each time the page changes what it does. */
const PAGE = 3;

/** A step of handling a file, for saying where it stopped. */
type Stage = "open" | "sort" | "reader" | "pdf" | "read" | "summary" | "copy";
/**
 * Where the page stopped, and the kind of error it was: its name ("SecurityError", "TypeError") and never its message,
 * which can quote what was being read (OBS-1).
 */
type Trouble = { stage: Stage; error: string };

type Shared = { name: string; type: string; text: string; /** A line of the file that was kept as it was: the row of column names. */ kept?: string };
type Result = {
  read?: ReadResult;
  pdf?: { pages: number; runs: number } | { error: PdfError; cause?: string };
  refused?: string;
  /** The page's own trouble with the file. With a result beside it, only the invented copy is missing. */
  trouble?: Trouble;
  summary: string;
  copy: Shared | null;
};

const state: { zh: boolean; kind: AccountKind | ""; currency: "CAD" | "USD"; busy: boolean; result: Result | null } = {
  zh: (navigator.language || "zh").toLowerCase().startsWith("zh"),
  kind: "",
  currency: "CAD",
  busy: false,
  result: null,
};

const t = (zh: string, en: string): string => (state.zh ? zh : en);
/** The browser's own random numbers: an invented copy can't be worked back to the file it came from. */
const random = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

const nameOf = (e: unknown): string => {
  const name = (e as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
};

/** The page is shown inside another window: a chat program's preview of the file, say. Workers and downloads may be shut off there. */
const framed = ((): boolean => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

/** The last thing the worker's script does is say this: all of it ran. */
const UP = "moneylens-reader-up";
/** How long the worker gets to say so. */
const READER_MS = 15_000;
let lib: PdfLib | null = null;
let worker: Worker | null = null;

/**
 * PDF.js with its worker started from the source inside this page (IMP-4: the parsing runs in a Web Worker). PDF.js is
 * given the worker once the worker has said that it is up. Where a worker may not start (a preview inside another
 * program, a browser that shuts them off) the page says that, in place of waiting on a worker that will never answer.
 */
function pdfLib(): Promise<PdfLib> {
  if (lib) return Promise.resolve(lib);
  return new Promise<PdfLib>((resolve, reject) => {
    let made: Worker | null = null;
    const stop = (error: string): void => {
      clearTimeout(timer);
      made?.terminate();
      reject(Object.assign(new Error("reader"), { trouble: { stage: "reader", error } satisfies Trouble }));
    };
    const timer = setTimeout(() => stop("Timeout"), READER_MS);
    try {
      // (plain script, not a module: a page opened from a file may not start a module from a string)
      made = new Worker(URL.createObjectURL(new Blob([PDF_WORKER, `\n;postMessage(${JSON.stringify(UP)});`], { type: "text/javascript" })));
    } catch (e) {
      stop(nameOf(e));
      return;
    }
    const started = made;
    const failed = (): void => stop("WorkerError");
    const up = (event: MessageEvent): void => {
      if (event.data !== UP) return;
      clearTimeout(timer);
      started.removeEventListener("message", up);
      started.removeEventListener("error", failed);
      pdfjs.GlobalWorkerOptions.workerPort = started;
      worker = started;
      lib = pdfjs as unknown as PdfLib;
      resolve(lib);
    };
    started.addEventListener("error", failed);
    started.addEventListener("message", up);
  });
}

/** Ends the worker. One that ran past the limit may still be busy with the file, and would keep the next file waiting (IMP-4). */
function dropReader(): void {
  worker?.terminate();
  worker = null;
  lib = null;
  pdfjs.GlobalWorkerOptions.workerPort = null;
}

function today(): Day {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` as Day;
}

const pretty = (summary: object): string => JSON.stringify({ ...summary, page: PAGE }, null, 1);

async function check(bytes: Uint8Array, at: (stage: Stage) => void): Promise<Result> {
  at("sort");
  const what = sniff(bytes);
  const file = { kind: what.kind === "unsupported" ? what.why : what.kind, bytes: bytes.length };
  /** The invented copy is made last, and by itself: what was read is shown even when the copy can't be made. */
  const copied = (make: () => Shared): { copy: Shared | null; trouble?: Trouble } => {
    try {
      return { copy: make() };
    } catch (e) {
      return { copy: null, trouble: { stage: "copy", error: nameOf(e) } };
    }
  };
  if (what.kind === "pdf") {
    at("reader");
    const reader = await pdfLib();
    at("pdf");
    const read = await pdfPages(reader, bytes);
    if (!read.ok && read.error === "too-slow") dropReader();
    at("summary");
    if (!read.ok) return { pdf: { error: read.error, ...(read.cause ? { cause: read.cause } : {}) }, summary: pretty({ ...summaryOf(file, null), read: `pdf-${read.error}`, ...(read.cause ? { error: read.cause } : {}) }), copy: null };
    const runs = read.pages.reduce((n, page) => n + page.runs.length, 0);
    at("read");
    const statements = readPdfStatement(read.pages, { ...(state.kind ? { kind: state.kind } : {}), currency: state.currency });
    at("summary");
    const summary = pretty(summaryOf(file, statements, undefined, read.pages));
    return { pdf: { pages: read.pages.length, runs }, read: statements, summary, ...copied(() => ({ name: "statement-layout.json", type: "application/json", text: JSON.stringify(inventPdf(read.pages, random)) })) };
  }
  if (what.kind === "unsupported") return { refused: what.why, summary: pretty(summaryOf(file, null)), copy: null };
  at("read");
  const read = readStatementFile(bytes, { ...(state.kind ? { kind: state.kind } : {}), currency: state.currency, today: today() });
  at("summary");
  if (what.kind === "ofx") return { read, summary: pretty(summaryOf(file, read)), copy: null };
  const text = decodeText(bytes);
  const summary = pretty(summaryOf(file, read, text));
  return {
    read,
    summary,
    ...copied(() => {
      const made = inventCsv(text, random);
      const kept = made.header === null ? undefined : made.text.split(/\r\n|\n|\r/)[made.header];
      return { name: "statement-invented.csv", type: "text/csv", text: made.text, ...(kept ? { kept } : {}) };
    }),
  };
}

async function take(file: File | undefined): Promise<void> {
  if (!file || state.busy) return;
  state.busy = true;
  state.result = null;
  render();
  let stage: Stage = "open";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    state.result = await check(bytes, (now) => void (stage = now));
  } catch (e) {
    const told = (e as { trouble?: Trouble } | null)?.trouble;
    const trouble: Trouble = told ?? { stage, error: nameOf(e) };
    state.result = { trouble, summary: pretty({ tool: "moneylens-check", version: 1, read: "page-error", stage: trouble.stage, error: trouble.error }), copy: null };
  }
  state.busy = false;
  render();
}

const money = (minor: number): string => `${minor < 0 ? "-" : ""}${(Math.abs(minor) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function refusal(error: ImportError | string): string {
  switch (error) {
    case "empty":
      return t("文件是空的。", "The file is empty.");
    case "too-big":
      return t("文件超过 10 MB，太大了。", "The file is larger than 10 MB.");
    case "too-long":
      return t("行数太多，一次读不了。", "The file has more lines than one import takes.");
    case "no-lines":
      return t("这是一份账单，但里面没有已入账的交易。", "This is a statement, but it has no posted transactions in it.");
    case "layout-unclear":
      return t("这像是一份账单，但分不清哪一列是什么，所以没有读。请把下面的摘要发给 Claude。", "This looks like a statement, but which column is which could not be told, so it was not read. Please pass on the summary below.");
    case "no-parser":
    case "not-a-statement":
      return t("这不像是银行导出的交易明细。", "This does not look like a list of transactions from a bank.");
    case "malformed":
      return t("文件有损坏或者不完整，读不了。", "The file is damaged or incomplete.");
    case "spreadsheet":
    case "archive":
      return t("这是 Excel 或压缩文件。请在银行网站上选 CSV、OFX 或 QFX 格式再下载一次。", "This is an Excel file or an archive. Download the statement again from your bank as CSV, OFX or QFX.");
    case "image":
      return t("这是图片。扫描件和照片读不了。", "This is a picture. Scans and photos cannot be read.");
    case "web-page":
      return t("这是一个网页，不是账单文件。", "This is a web page, not a statement file.");
    case "binary":
      return t("认不出这是什么文件：它不是 PDF、CSV、OFX 或 QFX。", "This file's type was not recognised: it is not a PDF, CSV, OFX or QFX file.");
    default:
      return t("这个文件读不了。", "This file could not be read.");
  }
}

/** The page's own trouble, in words a person can act on, with the step and the kind of error for whoever is asked about it. */
function troubled(trouble: Trouble, alone: boolean): string {
  const code = `${trouble.stage} · ${trouble.error}`;
  if (trouble.stage === "open")
    return t(
      `浏览器没能打开这个文件（${code}）。如果它放在 OneDrive、iCloud 这类云盘文件夹里，先确认已经下载到这台电脑上，或者把它复制到桌面，再选一次。`,
      `The browser could not open this file (${code}). If it is kept in a cloud folder such as OneDrive or iCloud, make sure it has been downloaded to this computer, or copy it to the desktop, and choose it again.`,
    );
  if (trouble.stage === "reader")
    return t(
      `PDF 阅读器在这里启动不了（${code}），所以 PDF 读不了；CSV、OFX、QFX 不受影响。请把这个页面的文件下载到电脑上，用 Chrome 或 Edge 直接打开（不要在聊天窗口的预览里用），再试一次。`,
      `The PDF reader could not start here (${code}), so PDFs cannot be read; CSV, OFX and QFX files are not affected. Download this page's file to your computer, open it directly in Chrome or Edge (not in a chat window's preview), and try again.`,
    );
  if (!alone) return t(`「编出来的版本」没做出来（${code}），上面读出的结果不受影响。请把下面的摘要发给 Claude。`, `The invented copy could not be made (${code}). What was read above is not affected. Please pass on the summary below.`);
  return t(`处理这个文件时页面自己出了错（${code}），文件没问题也可能这样。请把下面的摘要发给 Claude。`, `The page itself failed while handling this file (${code}). That can happen with a perfectly good file. Please pass on the summary below.`);
}

function pdfRefusal(error: PdfError, cause?: string): string {
  // PDF.js says "InvalidPDFException" of a file it cannot open at all. Any other error is the reader's trouble with the
  // file, and other programs may open the same file without complaint.
  if (error === "malformed" && cause !== undefined && cause !== "InvalidPDFException")
    return t(`这份 PDF 没读出来：阅读器出了错（${cause}），不一定是文件的问题。请把下面的摘要发给 Claude。`, `This PDF was not read: the reader ran into an error (${cause}), which may not be the file's fault. Please pass on the summary below.`);
  switch (error) {
    case "locked":
      return t("这份 PDF 要密码才能打开，读不了。", "This PDF needs a password and cannot be read.");
    case "no-text":
      return t("这份 PDF 里没有文字，是扫描件，读不了。", "This PDF has no text in it (a scan) and cannot be read.");
    case "too-long":
      return t("这份 PDF 超过 100 页。", "This PDF has more than 100 pages.");
    case "too-slow":
      return t("这份 PDF 读了 30 秒还没读完，停了。", "Reading this PDF took more than 30 seconds and was stopped.");
    case "too-big":
      return t("文件超过 10 MB，太大了。", "The file is larger than 10 MB.");
    default:
      return t("这份 PDF 有损坏，读不了。", "This PDF is damaged and cannot be read.");
  }
}

function question(warning: Warning, statement: ParsedStatement, read: ReadResult & { ok: true }): string {
  switch (warning) {
    case "date-order-guessed": {
      const monthFirst = read.layout?.dateStyle !== "DMY";
      return monthFirst ? t("日期里月和日谁在前，文件里看不出来，先按「月在前」读了。下面的日期对吗？", "The file doesn't settle whether the month or the day comes first. It was read month first. Are the dates below right?") : t("日期里月和日谁在前，文件里看不出来，先按「日在前」读了。下面的日期对吗？", "The file doesn't settle whether the month or the day comes first. It was read day first. Are the dates below right?");
    }
    case "sign-guessed":
      return t("钱是进还是出，文件里看不出来，是按习惯假设的。下面的正负对吗？（正数是进账，负数是花出去。）", "The file doesn't show which way the money went, so that was assumed. Are the signs below right? (Plus is money in, minus is money out.)");
    case "no-closing-balance":
      return t("文件里没有余额，所以对不了账。", "The file has no balances, so the sums could not be checked.");
    case "lines-left-out":
      return t(`有 ${statement.unread} 行没读出来。`, `${statement.unread} row(s) could not be read.`);
    case "pending-left-out":
      return t("还没入账的交易没有算进来。", "Pending transactions were left out.");
    default:
      return warning;
  }
}

function statementView(statement: ParsedStatement, read: ReadResult & { ok: true }): HTMLElement {
  const kind = statement.account.kind;
  const name = kind === "credit" ? t("信用卡", "Credit card") : kind === "chequing" ? t("支票账户", "Chequing") : kind === "savings" ? t("储蓄账户", "Savings") : t("账户（类型没写）", "Account (kind not stated)");
  const box = el("div", { class: "panel" }, el("h2", {}, `${name} · ${statement.account.currency}${statement.account.last4 ? ` · ****${statement.account.last4}` : ""}`));
  const sums = reconcile(statement.lines, statement.opening, statement.closing);
  box.append(el("p", {}, t(`读出 ${statement.lines.length} 笔交易。`, `${statement.lines.length} transaction(s) read.`)));
  if (sums.status === "reconciled") box.append(el("p", { class: "good" }, t(`对上了：期初 ${money(sums.opening)}，加上各笔合计 ${money(sums.sum)}，等于期末 ${money(sums.closing)}。`, `The sums agree: opening ${money(sums.opening)} plus the lines' total ${money(sums.sum)} is the closing ${money(sums.closing)}.`)));
  else if (sums.status === "mismatch") box.append(el("p", { class: "bad" }, t(`对不上：期初 ${money(sums.opening)} 加各笔合计 ${money(sums.sum)}，和期末 ${money(sums.closing)} 差 ${money(sums.difference)}。`, `The sums differ: opening ${money(sums.opening)} plus the lines' total ${money(sums.sum)} misses the closing ${money(sums.closing)} by ${money(sums.difference)}.`)));
  const asked = statement.warnings.map((warning) => el("li", { class: warning === "date-order-guessed" || warning === "sign-guessed" ? "ask" : "quiet" }, question(warning, statement, read)));
  if (asked.length) box.append(el("ul", {}, ...asked));
  const head = el("tr", {}, el("th", {}, t("日期", "Date")), el("th", {}, t("说明", "Description")), el("th", { class: "money" }, t("金额", "Amount")), el("th", { class: "money" }, t("余额", "Balance")));
  const rows = statement.lines.slice(0, 200).map((line) => el("tr", {}, el("td", {}, line.posted), el("td", { class: "words" }, [line.description, line.memo].filter(Boolean).join(" · ")), el("td", { class: `money ${line.amount < 0 ? "" : "good"}` }, money(line.amount)), el("td", { class: "money" }, line.balance === undefined ? "" : money(line.balance))));
  box.append(el("div", { class: "scroll" }, el("table", {}, el("thead", {}, head), el("tbody", {}, ...rows))));
  if (statement.lines.length > 200) box.append(el("p", { class: "quiet" }, t("只显示前 200 笔。", "Only the first 200 are shown.")));
  return box;
}

function copyBox(title: string, note: string, text: string, save: Shared | null, kept?: string): HTMLElement {
  const area = el("textarea", { readonly: "", spellcheck: "false" });
  area.value = text.length > 20000 ? `${text.slice(0, 20000)}\n…` : text;
  const copied = el("span", { class: "good", role: "status" });
  const copy = el("button", { type: "button" }, t("复制", "Copy"));
  copy.addEventListener("click", () => {
    const done = (): void => void (copied.textContent = t("已复制", "Copied"));
    const byHand = (): void => {
      area.select();
      if (document.execCommand("copy")) done();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, byHand);
    else byHand();
  });
  const buttons = el("div", { class: "row" }, copy);
  if (save) {
    const download = el("button", { type: "button", class: "main" }, t("下载", "Download"));
    download.addEventListener("click", () => {
      const link = el("a", { href: URL.createObjectURL(new Blob([save.text], { type: save.type })), download: save.name });
      link.click();
      URL.revokeObjectURL(link.href);
    });
    buttons.prepend(download);
  }
  buttons.append(copied);
  const box = el("div", { class: "panel" }, el("h2", {}, title), el("p", { class: "quiet" }, note));
  // the one line that is not invented is shown by itself, to be looked at
  if (kept) box.append(el("p", { class: "ask" }, t("这一行是列名，原样保留。如果里面有人名或账号，就不要发：", "This line holds the column names and is kept as it is. If a name or an account number is in it, do not share: ")), el("p", {}, el("code", {}, kept)));
  box.append(area, buttons);
  return box;
}

function render(): void {
  document.documentElement.lang = state.zh ? "zh-Hans" : "en";
  const app = document.getElementById("app")!;
  const language = el("button", { type: "button" }, state.zh ? "English" : "中文");
  language.addEventListener("click", () => {
    state.zh = !state.zh;
    render();
  });
  const kind = el("select", { "aria-label": t("账户类型", "Kind of account") }, el("option", { value: "" }, t("不确定", "Not sure")), el("option", { value: "chequing" }, t("银行账户（支票）", "Bank account (chequing)")), el("option", { value: "savings" }, t("银行账户（储蓄）", "Bank account (savings)")), el("option", { value: "credit" }, t("信用卡", "Credit card")));
  kind.value = state.kind;
  kind.addEventListener("change", () => void (state.kind = kind.value as AccountKind | ""));
  const currency = el("select", { "aria-label": t("货币", "Currency") }, el("option", { value: "CAD" }, "CAD"), el("option", { value: "USD" }, "USD"));
  currency.value = state.currency;
  currency.addEventListener("change", () => void (state.currency = currency.value as "CAD" | "USD"));
  const input = el("input", { type: "file", accept: ".csv,.txt,.ofx,.qfx,.pdf,text/csv,application/pdf" });
  input.addEventListener("change", () => void take(input.files?.[0]));
  const drop = el("div", { class: "drop" }, el("label", { class: "pick" }, t("选一个账单文件", "Choose a statement file"), input), el("p", { class: "quiet" }, t("或者把文件拖到这里。CSV、OFX、QFX、PDF 都可以。", "Or drop the file here. CSV, OFX, QFX or PDF.")));
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("over");
    void take(event.dataTransfer?.files[0]);
  });

  const parts: Node[] = [
    el("div", { class: "top" }, el("div", {}, el("h1", {}, t("心里有数 · 账单试读", "MoneyLens · statement check")), el("p", { class: "quiet" }, t("看看你的银行账单能不能读对。文件只在这台设备的浏览器里处理：这个页面连不了网，什么都不会上传。", "See whether your bank's statement is read correctly. The file is handled in this browser only: this page cannot reach the network, and nothing is uploaded."))), language),
    el("div", { class: "panel" }, el("p", {}, t("先选账户类型（信用卡的文件和银行账户的读法相反），再选文件。", "Choose the kind of account first (a card's file reads the other way round), then the file.")), el("div", { class: "row" }, kind, currency), drop),
  ];
  if (framed)
    parts.splice(
      1,
      0,
      el("div", { class: "panel" }, el("p", { class: "ask" }, t("这个页面现在是嵌在别的窗口里打开的（比如聊天软件的预览）。这样 PDF 可能读不了，下载也可能不灵。请把这个页面的文件下载到电脑上，用 Chrome 或 Edge 直接打开。", "This page is open inside another window (a chat program's preview, for example). PDFs may not be readable this way, and downloads may not work. Download this page's file to your computer and open it directly in Chrome or Edge."))),
    );
  if (state.busy) parts.push(el("p", { role: "status" }, t("正在读…", "Reading…")));
  const result = state.result;
  if (result) {
    const read = result.read;
    if (result.refused) parts.push(el("div", { class: "panel" }, el("p", { class: "bad" }, refusal(result.refused))));
    if (result.trouble && !result.read && !result.pdf) parts.push(el("div", { class: "panel" }, el("p", { class: "bad" }, troubled(result.trouble, true))));
    const pdf = result.pdf && !("error" in result.pdf) ? result.pdf : null;
    // (a PDF whose table is not known yet has its own words for that, below)
    if (read && !read.ok && !(pdf && read.error === "layout-unclear")) parts.push(el("div", { class: "panel" }, el("p", { class: "bad" }, refusal(read.error))));
    if (pdf && read && !read.ok)
      parts.push(
        el(
          "div",
          { class: "panel" },
          el(
            "p",
            { class: read.error === "layout-unclear" ? "bad" : "" },
            t(
              `这份 PDF 有 ${pdf.pages} 页，读出了 ${pdf.runs} 段文字，但这个版本还认不出它的交易表。把下面「编出来的版本」和「摘要」发给 Claude，就能照它的版式补上：编出来的版本里每段文字的位置和原件一样，字和数字全是编的。`,
              `This PDF has ${pdf.pages} page(s) and ${pdf.runs} runs of text, but this version does not recognise its table of transactions yet. Pass on the invented copy and the summary below, and it can be taught this layout: in the invented copy every run of text sits where it does in the original, and every word and number is invented.`,
            ),
          ),
        ),
      );
    if (pdf && read?.ok)
      parts.push(
        el(
          "div",
          { class: "panel" },
          el(
            "p",
            { class: "ask" },
            t(
              `这份 PDF 有 ${pdf.pages} 页，读出了 ${pdf.runs} 段文字。PDF 账单是照版式读的，这个功能刚做好：请对着原件核对每一笔，尤其是金额的正负，还有下面写的对没对上。读得不对的话，把「编出来的版本」和「摘要」发给 Claude。`,
              `This PDF has ${pdf.pages} page(s) and ${pdf.runs} runs of text. PDF statements are read by their layout, and this is new: check every line against the original, above all which way each amount goes, and whether the sums below agree. If something is wrong, pass on the invented copy and the summary.`,
            ),
          ),
        ),
      );
    if (read?.ok) {
      parts.push(el("p", { class: "quiet" }, t("下面是读出来的结果，只显示在你这里。请对着银行的账单看一眼：日期、金额、进出方向对不对。", "Below is what was read, shown here only. Compare it with your bank's statement: are the dates, the amounts and the directions right?")));
      for (const statement of read.statements) parts.push(statementView(statement, read));
    }
    if (result.pdf && "error" in result.pdf) parts.push(el("div", { class: "panel" }, el("p", { class: "bad" }, pdfRefusal(result.pdf.error, result.pdf.cause))));
    if (result.trouble && (result.read || result.pdf)) parts.push(el("div", { class: "panel" }, el("p", { class: "bad" }, troubled(result.trouble, false))));
    if (result.copy) parts.push(copyBox(t("编出来的版本", "The invented copy"), t("版式和你的文件一样，字和数字全是编的，所以里面的金额加起来对不上。发给别人之前请自己看一眼，确认没有真的名字、账号和金额。", "The same layout as your file, with every word and number invented, so its amounts no longer add up. Look it over before you share it: no real name, account number or amount should be in it."), result.copy.text, result.copy, result.copy.kept));
    parts.push(copyBox(t("给 Claude 的摘要", "The summary to pass on"), t("只有版式：哪一列是什么（列名原样）、读了多少行、账对没对上。没有任何金额、日期、说明文字。", "Layout only: which column is which (the column names as they are), how many lines were read, whether the sums agreed. No amount, date or description."), result.summary, null, result.copy?.kept));
  }
  parts.push(el("p", { class: "quiet" }, t(`页面第 ${PAGE} 版`, `Page revision ${PAGE}`)));
  app.replaceChildren(...parts);
}

render();
