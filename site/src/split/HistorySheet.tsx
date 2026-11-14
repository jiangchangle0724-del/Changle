/**
 * 改动记录: the ledger's record, newest first, from the ⋯ sheet (history.ts says what each line
 * is). It is read from the server each time the sheet opens, and again while it is open whenever
 * the ledger moves on; what this phone hasn't sent yet is at the top. A line can offer to change
 * an expense back to what it was before, or to bring a deleted one back.
 */
import { CloudOff, History } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Sheet } from "../ui/Sheet";
import { Skeleton } from "../ui/Skeleton";
import type { Ledger } from "./core";
import { historyOf, whenText, type HistoryLine, type Logged } from "./history";
import { heldOf } from "./store";
import { record, recordOf } from "./syncing";
import { say } from "./words";

/** Lines shown at a time: more with 再往前看. */
const PAGE = 60;

export function HistorySheet({ open, onClose, ledger, me, lang }: { open: boolean; onClose: () => void; ledger: Ledger; me: string | undefined; lang: Lang }) {
  /** the server's record: being read (undefined), couldn't be (null), or read */
  const [log, setLog] = useState<Logged[] | null | undefined>(undefined);
  const [showing, setShowing] = useState(PAGE);
  /** the line whose offer didn't go through (the ledger changed under it, or was locked) */
  const [refused, setRefused] = useState<string | null>(null);
  const held = heldOf(ledger.id);
  const asked = useRef(0);
  const read = useRef(false);
  const load = useCallback(
    async (quietly: boolean) => {
      const n = ++asked.current;
      if (!quietly) setLog(undefined);
      const got = await recordOf(ledger.id);
      if (n !== asked.current) return;
      // (read again while it was showing, and the server didn't answer: what is shown stays)
      if (got === null && quietly && read.current) return;
      read.current = got !== null;
      setLog(got);
    },
    [ledger.id],
  );
  useEffect(() => {
    if (!open) return;
    setShowing(PAGE);
    setRefused(null);
    read.current = false;
    void load(false);
  }, [open, load]);
  // the ledger moved on while the record is open (what this phone did went up, or someone else's
  // came): read it again, keeping what is shown meanwhile
  const seq = held?.seq;
  useEffect(() => {
    if (open && read.current) void load(true);
  }, [open, seq, load]);

  const clock = Date.now();
  const lines = log === undefined ? [] : historyOf(ledger, log ?? [], held?.waiting ?? [], me, lang, clock);
  const act = (l: HistoryLine) => {
    if (l.action) setRefused(record(ledger.id, l.action.change) ? null : l.key);
  };
  return (
    <Sheet open={open} onClose={onClose} lang={lang} category="tool" title={say(lang, "history")}>
      {log === undefined ? (
        <Skeleton lang={lang} lines={4} slowText={say(lang, "slow")} />
      ) : (
        <>
          {log === null && (
            <div className="split-form">
              <p className="split-sync is-loud">
                <CloudOff aria-hidden="true" />
                {say(lang, "historyFailed")}
              </p>
              <Button tone="quiet" onClick={() => void load(false)}>
                {say(lang, "retry")}
              </Button>
            </div>
          )}
          {log !== null && !lines.length && <EmptyState icon={History} title={say(lang, "historyEmpty")} body={say(lang, "historyEmptyBody")} />}
          {lines.length > 0 && (
            <ol className="split-rows split-history">
              {lines.slice(0, showing).map((l) => (
                <li key={l.key} className="split-history-line">
                  <div className="split-row-text">
                    <strong>{l.text}</strong>
                    {l.detail && <span>{l.detail}</span>}
                    <span>
                      {l.who} · {l.pending ? say(lang, "notSentYet") : whenText(l.at, clock, lang)}
                    </span>
                    {refused === l.key && <p className="split-note">{say(lang, "notSaved")}</p>}
                  </div>
                  {l.action && (
                    <Button tone="quiet" size="sm" onClick={() => act(l)}>
                      {say(lang, l.action.word)}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {lines.length > showing && (
            <Button tone="quiet" block onClick={() => setShowing((n) => n + PAGE)}>
              {say(lang, "showEarlier")}
            </Button>
          )}
        </>
      )}
    </Sheet>
  );
}
