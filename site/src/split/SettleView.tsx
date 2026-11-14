/**
 * 结清: who pays whom, in the fewest transfers. A row opens one transfer: the amount to copy, and
 * marking it as paid (or taking that back). The list holds still while people pay one by one
 * (core/ledger.ts, settlement), and when the last one is paid the page is stamped 两清.
 */
import { Check, Copy, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { sizeClass } from "../tools/money";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";
import { expensesOf, type Ledger, type Settlement } from "./core";
import { money } from "./format";
import { paysLine } from "./lines";
import { copyText } from "./parts";
import { newId } from "./store";
import { record } from "./syncing";
import { say, W } from "./words";

/** One transfer on the screen: a step of the plan, or one already made that the plan no longer holds. */
type Line = { from: string; to: string; amount: number; paid?: string };

export function SettleView({ ledger, me, lang, plan }: { ledger: Ledger; me: string | undefined; lang: Lang; plan: Settlement }) {
  const toast = useToast();
  const [open, setOpen] = useState<Line | null>(null);
  // the transfer the sheet shows, kept while the sheet slides away so it doesn't empty on its way out
  const last = useRef<Line | null>(null);
  if (open) last.current = open;
  const line = open ?? last.current;
  // "copied" is said on the button itself: a toast would sit behind the open sheet
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // the stamp lands only when the last transfer is marked while this page is open; a ledger opened
  // already square just shows it
  const wasClear = useRef(plan.clear);
  const [stamping, setStamping] = useState(false);
  useEffect(() => {
    if (plan.clear && !wasClear.current) setStamping(true);
    if (!plan.clear) setStamping(false);
    wasClear.current = plan.clear;
  }, [plan.clear]);

  if (!expensesOf(ledger).length) return <EmptyState icon={Scale} title={say(lang, "noSettle")} body={say(lang, "noSettleBody")} />;

  const left = plan.steps.filter((s) => !s.paid).length;
  const row = (r: Line, key: string) => (
    <li key={key}>
      <button
        type="button"
        className="split-row"
        onClick={() => {
          setCopied(null);
          setOpen(r);
        }}
      >
        <span className="split-row-text">
          <strong>{paysLine(ledger, r.from, r.to, me, lang)}</strong>
          <span className={r.paid ? "is-paid" : undefined}>
            {r.paid && <Check aria-hidden="true" />}
            {say(lang, r.paid ? "paid" : "notPaid")}
          </span>
        </span>
        <span className="split-row-amount">{money(r.amount, ledger.currency, lang)}</span>
      </button>
    </li>
  );

  return (
    <>
      {plan.clear ? (
        <div className={`split-square${stamping ? " is-stamping" : ""}`}>
          <p className="split-seal" aria-hidden="true">
            <span lang="zh-CN">{W.name.zh}</span>
            <span lang="en">{W.name.en}</span>
          </p>
          <h2>{say(lang, "allSquare")}</h2>
          <p>{say(lang, "allSquareBody")}</p>
        </div>
      ) : (
        <header className="split-plan-head">
          <h2>{plan.steps.length === 1 ? say(lang, "transferOne") : say(lang, "transfers", { n: plan.steps.length })}</h2>
          <p>{left < plan.steps.length ? say(lang, "remaining", { n: left }) : say(lang, "fewest")}</p>
        </header>
      )}
      {plan.steps.length > 0 && <ul className="split-rows">{plan.steps.map((s, i) => row(s, `${s.from}-${s.to}-${i}`))}</ul>}
      {plan.others.length > 0 && (
        <>
          <h3 className="split-subhead">{say(lang, "alreadyPaid")}</h3>
          <ul className="split-rows">{plan.others.map((t) => row({ from: t.from, to: t.to, amount: t.amount, paid: t.id }, t.id))}</ul>
        </>
      )}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        lang={lang}
        category="tool"
        title={line ? paysLine(ledger, line.from, line.to, me, lang) : ""}
        footer={
          // (a locked ledger keeps its transfers as they are: the amount can still be copied)
          line &&
          ledger.locked === undefined &&
          (line.paid ? (
            <Button
              tone="quiet"
              block
              onClick={() => {
                const id = line.paid;
                if (id) record(ledger.id, { do: "out", entry: id, at: Date.now() });
                setOpen(null);
              }}
            >
              {say(lang, "undoPaid")}
            </Button>
          ) : (
            <Button
              size="lg"
              block
              icon={Check}
              onClick={() => {
                const done = record(ledger.id, { do: "transfer", transfer: { id: newId(), at: Date.now(), from: line.from, to: line.to, amount: line.amount } });
                setOpen(null);
                // (the sheet is closing, so the page can say it)
                if (!done) toast(say(lang, "notSaved"), { tone: "warning" });
              }}
            >
              {say(lang, "markPaid")}
            </Button>
          ))
        }
      >
        {line && (
          <div className="split-step">
            <p className={`split-figure ${sizeClass(money(line.amount, ledger.currency, lang))}`}>{money(line.amount, ledger.currency, lang)}</p>
            <Button
              tone="quiet"
              size="sm"
              icon={copied === "done" ? Check : Copy}
              onClick={async () => {
                // the bare number, as a banking app's amount field takes it
                const done = await copyText(money(line.amount, ledger.currency, lang).replace(/[^0-9.]/g, ""));
                setCopied(done ? "done" : "failed");
              }}
            >
              {say(lang, copied === "done" ? "copied" : copied === "failed" ? "copyFailed" : "copyAmount")}
            </Button>
            {/* said aloud once; the button keeps a name of its own */}
            <span className="ui-visually-hidden" role="status">
              {copied ? say(lang, copied === "done" ? "copied" : "copyFailed") : ""}
            </span>
            {/* (a locked ledger can't be told a transfer was made: it says why, in place of how) */}
            <p className="split-note">{say(lang, line.paid ? "paid" : ledger.locked !== undefined ? "locked" : "noMoney")}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}
