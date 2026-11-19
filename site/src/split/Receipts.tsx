/**
 * 几张小票: several receipts at once, an expense each (Steve, 2026-11-18: 一次性上传好几张小票，都可以
 * 分成好几笔). Each photo goes to the server and is read, as 记一笔 does with one (a few at a time),
 * and scans while it is. Each row then says what was read (the business, the day, the place) and
 * its amount, to put right, or to type when nothing was read; one cleared is left out. One button
 * records them all: paid by you, shared by everyone, each with its photo, to change later like any
 * other. Photos not recorded go from the server again when the page closes.
 */
import { ReceiptText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { useRates } from "../tools/fx";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { applyChange, type Change } from "./changes";
import { nextRot, type Ledger } from "./core";
import { blankDraft, draftProblem, rated, readInto, saying, type Draft } from "./draft";
import { decimalsOf, localDay, signOf } from "./format";
import { asAmountText } from "./input";
import { dayLabel } from "./lines";
import { Bar } from "./parts";
import { Thumb } from "./Photos";
import { TROUBLE_WORD } from "./photos";
import { newId } from "./store";
import { dropPhoto, readPhoto, record, sendPhoto } from "./syncing";
import { say, type Word } from "./words";

/** As many receipts as one go takes (a day's reading has room for 30), and how many go and are read together. */
export const RECEIPTS_MAX = 10;
const AT_ONCE = 3;

type Row = {
  status: "sending" | "reading" | "done" | "failed";
  /** the photo's id on the server, once it is there */
  file?: string;
  /** what the reading put in (or a new expense as it starts, when nothing was read), the amount as typed since */
  draft: Draft;
  read: boolean;
  trouble?: Word;
};

type Props = { ledger: Ledger; me: string | undefined; files: File[]; lang: Lang; onClose: () => void; onSaved: (ids: string[]) => void };

export function Receipts({ ledger, me, files, lang, onClose, onSaved }: Props) {
  const toast = useToast();
  const today = localDay(Date.now());
  const [rows, setRows] = useState<Row[]>(() => files.map(() => ({ status: "sending", draft: blankDraft(ledger, me, Date.now()), read: false })));
  const rowsNow = useRef(rows);
  rowsNow.current = rows;
  // today's rates, for a receipt in another currency (the site's own source, as 记一笔 asks it)
  const { rates, loading: ratesLoading, error: ratesError } = useRates();
  const ratesNow = useRef(rates);
  ratesNow.current = rates;
  // one read in another currency before they came takes them when they do; with none to be had, the
  // last rate this ledger used (as 记一笔 does); with neither, its row says to record it on its own
  const noRates = !ratesLoading && (ratesError || !rates);
  const someAsking = rows.some((r) => r.draft.asking);
  useEffect(() => {
    if (!someAsking || (!rates && !noRates)) return;
    setRows((rs) => rs.map((r) => (r.draft.asking ? { ...r, draft: rated(r.draft, ledger, rates, noRates) } : r)));
  }, [someAsking, rates, noRates, ledger]);
  const kept = useRef(new Set<string>());
  const left = useRef(false);
  const put = (n: number, to: Partial<Row>) => setRows((all) => all.map((r, i) => (i === n ? { ...r, ...to } : r)));

  // each photo goes, then is read; a few at a time, in the order they were chosen
  useEffect(() => {
    left.current = false;
    let next = 0;
    const one = async (): Promise<void> => {
      const n = next++;
      if (n >= files.length || left.current) return;
      const sent = await sendPhoto(ledger.id, files[n]);
      if (left.current) {
        if (sent.ok) dropPhoto(ledger.id, sent.file);
        return;
      }
      if (!sent.ok) put(n, { status: "failed", trouble: TROUBLE_WORD[sent.trouble] });
      else {
        put(n, { status: "reading", file: sent.file });
        const got = await readPhoto(ledger.id, sent.file);
        if (left.current) return;
        const filled = got && got !== "off" ? readInto(rowsNow.current[n].draft, got, ledger, ratesNow.current, Date.now()) : null;
        put(n, filled ? { status: "done", draft: filled, read: true } : { status: "done" });
      }
      return one();
    };
    for (let k = 0; k < AT_ONCE; k++) void one();
    // (closed: the photos nothing keeps go from the server again)
    return () => {
      left.current = true;
      for (const r of rowsNow.current) if (r.file && !kept.current.has(r.file)) dropPhoto(ledger.id, r.file);
    };
  }, []);

  const busy = rows.some((r) => r.status === "sending" || r.status === "reading");
  const ready = rows.filter((r) => r.status === "done" && r.file && saying(r.draft, ledger));

  const save = () => {
    if (busy) return;
    let l = ledger;
    const ids: string[] = [];
    const at = Date.now();
    rows.forEach((r, i) => {
      const to = r.status === "done" && r.file ? saying(r.draft, l) : null;
      if (!to || !r.file) return;
      const { paidIn, files: _unsaid, tip, tax, date, merchant, place, payment, ...said } = to;
      const id = newId();
      // (one after another, in the order chosen, each with the turn for its odd cents)
      const change: Change = {
        do: "expense",
        expense: {
          kind: "expense",
          id,
          at: at + i,
          ...said,
          rot: nextRot(l),
          ...(paidIn ? { paidIn } : {}),
          files: [r.file],
          ...(tip ? { tip } : {}),
          ...(tax ? { tax } : {}),
          ...(date ? { date } : {}),
          ...(merchant ? { merchant } : {}),
          ...(place ? { place } : {}),
          ...(payment ? { payment } : {}),
        },
      };
      if (!record(ledger.id, change)) return;
      l = applyChange(l, change) ?? l;
      kept.current.add(r.file);
      ids.push(id);
    });
    if (!ids.length) return toast(say(lang, "notSaved"), { tone: "warning" });
    toast(say(lang, "receiptsSaved", { n: ids.length }));
    onSaved(ids);
  };

  return (
    <div className="split-page split-batch">
      <Bar lang={lang} close onBack={onClose} title={say(lang, "receiptsTitle")} />
      <p className="split-batch-lead">{say(lang, "receiptsLead")}</p>
      <ul className="split-batch-rows">
        {rows.map((r, i) => {
          const scanning = r.status === "sending" || r.status === "reading";
          const name =
            r.status === "sending"
              ? say(lang, "photoSending")
              : r.status === "reading"
                ? say(lang, "receiptsReading")
                : r.status === "failed"
                  ? say(lang, r.trouble ?? "receiptsFailed")
                  : r.read
                    ? r.draft.merchant || say(lang, "receiptsNoName")
                    : say(lang, "receiptsNone");
          // (in another currency with no rate to be had, it can't be recorded here: said, so the count adds up)
          const noRate = r.status === "done" && draftProblem(r.draft, ledger)?.what === "rate";
          const about = noRate ? say(lang, "receiptsNoRate", { currency: r.draft.currency }) : r.read ? [dayLabel(r.draft.date || today, today, lang), r.draft.place].filter(Boolean).join(" · ") : "";
          return (
            <li key={i} className={`split-batch-row${r.status === "failed" ? " is-off" : ""}`}>
              {/* the photo, with the scan's band over it while it goes and is read */}
              <span className={`split-batch-thumb${scanning ? " is-scanning" : ""}`}>{r.file ? <Thumb ledger={ledger.id} file={r.file} lang={lang} /> : <ReceiptText aria-hidden="true" />}</span>
              <span className="split-batch-what">
                <strong className={r.read && r.draft.merchant ? undefined : "is-quiet"}>{name}</strong>
                {about && <small>{about}</small>}
              </span>
              {r.status === "done" && (
                <label className="split-batch-amount">
                  <span aria-hidden="true">{signOf(r.draft.currency).trim()}</span>
                  <input
                    value={r.draft.text}
                    onChange={(e) => put(i, { draft: { ...r.draft, text: asAmountText(e.target.value, decimalsOf(r.draft.currency)) } })}
                    inputMode="decimal"
                    enterKeyHint="done"
                    autoComplete="off"
                    placeholder="0"
                    aria-label={`${say(lang, "amount")}: ${name}`}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <span className="ui-visually-hidden" role="status">
        {busy ? say(lang, "receiptsReading") : ""}
      </span>
      <div className="split-dock">
        <Button size="lg" block disabled={busy || !ready.length} onClick={save}>
          {busy ? say(lang, "receiptsReading") : ready.length === 1 ? say(lang, "receiptsSaveOne") : say(lang, "receiptsSave", { n: ready.length })}
        </Button>
      </div>
    </div>
  );
}
