/**
 * 结清: who pays whom, in the fewest transfers. A row opens one transfer: the amount to copy, and
 * marking it as paid (or taking that back). The list holds still while people pay one by one
 * (core/ledger.ts, settlement), and when the last one is paid the page is stamped 两清. When the
 * 结清图 this phone last made says other transfers than these, the page says it is out of date
 * (picture.ts). Under the plan, 每个人: what everyone paid, what their share came to and where that
 * leaves them, a row each that opens their statement (people.ts). At its foot, 总结: what the ledger
 * came to (summary.ts).
 */
import { Check, Copy, ImageOff, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { sizeClass } from "../tools/money";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";
import { expensesOf, type Ledger, type Member, type Settlement } from "./core";
import { money } from "./format";
import { whenText } from "./history";
import { dayLabel, nameFor, paysLine, personLine, personStands, spentOn, summaryLines } from "./lines";
import { peopleOf, statementOf } from "./people";
import { paidId, PAY_MAX, tidy } from "./ops";
import { copyText } from "./parts";
import { localDay } from "./format";
import { isStale, type Made } from "./picture";
import { record } from "./syncing";
import { say, W } from "./words";

/** One transfer on the screen: a step of the plan, or one already made that the plan no longer holds. */
type Line = { from: string; to: string; amount: number; paid?: string };

export function SettleView({ ledger, me, lang, plan, made, viewing }: { ledger: Ledger; me: string | undefined; lang: Lang; plan: Settlement; made?: Made; viewing?: boolean }) {
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
  // who is to be paid on the open transfer: their 收款方式, to copy, or the way to add yours
  const receiver = line ? ledger.members.find((m) => m.id === line.to) : undefined;
  const mayChange = ledger.locked === undefined && !viewing;
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
      {/* the picture this phone last sent the group: out of date once who pays whom, or how much, has changed */}
      {made && isStale(made, plan) && (
        <div className="split-stale">
          <p className="split-sync is-loud">
            <ImageOff aria-hidden="true" />
            {say(lang, "pictureStale")}
          </p>
          <p className="split-stale-body">{say(lang, "pictureStaleBody", { when: whenText(made.at, Date.now(), lang) })}</p>
        </div>
      )}
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
      <People ledger={ledger} me={me} lang={lang} />
      <Summary ledger={ledger} me={me} lang={lang} />
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        lang={lang}
        category="tool"
        title={line ? paysLine(ledger, line.from, line.to, me, lang) : ""}
        footer={
          // (a locked ledger keeps its transfers as they are, and a 查看链接 can't mark one: the amount can still be copied)
          line &&
          ledger.locked === undefined &&
          !viewing &&
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
                // (the same id on the phone of the one who paid and of the one paid: marked on both, it counts once)
                const done = record(ledger.id, { do: "transfer", transfer: { id: paidId(ledger, line), at: Date.now(), from: line.from, to: line.to, amount: line.amount } });
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
            {/* 收款方式: how whoever is paid takes money (a 查看链接 never has it) */}
            {!viewing && receiver && !line.paid && (
              <PayFor ledger={ledger} member={receiver} me={me} lang={lang} mayChange={mayChange} />
            )}
            {/* (a locked ledger can't be told a transfer was made, nor can a 查看链接: it says why, in place of how) */}
            <p className="split-note">{say(lang, line.paid ? "paid" : ledger.locked !== undefined ? "locked" : viewing ? "viewOnlyPaid" : "noMoney")}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}

/**
 * One person's 收款方式 on a transfer to them (or on their statement): what they said, to copy. When
 * they haven't said and they are this phone's owner, a field to say it (the ledger takes it like a
 * name: changes.ts, pay); when it is someone else, that they haven't.
 */
function PayFor({ ledger, member, me, lang, mayChange }: { ledger: Ledger; member: Member; me: string | undefined; lang: Lang; mayChange: boolean }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const [typed, setTyped] = useState("");
  const mine = member.id === me;
  const of = mine ? say(lang, "payOfYou") : say(lang, "payOf", { who: member.name });
  if (member.pay)
    return (
      <div className="split-pay">
        <span className="split-pay-label">{of}</span>
        <span className="split-pay-line">
          <strong>{member.pay}</strong>
          <Button
            tone="quiet"
            size="sm"
            icon={copied === "done" ? Check : Copy}
            onClick={async () => setCopied((await copyText(member.pay ?? "")) ? "done" : "failed")}
          >
            {say(lang, copied === "done" ? "copied" : copied === "failed" ? "copyFailed" : "copyPay")}
          </Button>
        </span>
      </div>
    );
  if (!mine || !mayChange) return <p className="split-note">{say(lang, "payMissing", { who: nameFor(ledger, member.id, me, lang) })}</p>;
  const pay = tidy(typed, PAY_MAX);
  return (
    <form
      className="split-pay"
      onSubmit={(e) => {
        e.preventDefault();
        if (pay) record(ledger.id, { do: "pay", member: member.id, pay });
      }}
    >
      <label className="split-pay-label" htmlFor="split-pay-mine">
        {say(lang, "payAddMine")}
      </label>
      <span className="field">
        <input id="split-pay-mine" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={PAY_MAX} placeholder={say(lang, "payHint")} inputMode="email" autoComplete="email" enterKeyHint="done" />
        <Button tone="quiet" size="sm" type="submit" disabled={!pay}>
          {say(lang, "paySave")}
        </Button>
      </span>
    </form>
  );
}

/**
 * 每个人: a row each, in the roster's order: their name and what they paid and shared (and sent and
 * received), and on the right where that leaves them. A row opens that person's statement: the sums
 * as a sum, then every expense they paid or share in and every transfer they made or got.
 */
function People({ ledger, me, lang }: { ledger: Ledger; me: string | undefined; lang: Lang }) {
  const people = peopleOf(ledger);
  const [open, setOpen] = useState<string | null>(null);
  // the person the sheet shows, kept while it slides away so it doesn't empty on its way out
  const last = useRef<string | null>(null);
  if (open) last.current = open;
  const who = open ?? last.current;
  const person = people.find((p) => p.id === who);
  const statement = who ? statementOf(ledger, who) : null;
  const sum = (n: number) => money(n, ledger.currency, lang);
  const stands = (p: { net: number }) => {
    const s = personStands(p);
    return (
      <span className="split-row-amount">
        <small>{say(lang, s.word)}</small>
        {s.amount !== null && sum(s.amount)}
      </span>
    );
  };
  const today = localDay(Date.now());
  const paidCount = statement?.expenses.filter((x) => x.paid > 0).length ?? 0;
  const shareCount = statement?.expenses.filter((x) => x.share > 0).length ?? 0;
  const counted = (n: number) => (n === 1 ? say(lang, "personCountOne") : say(lang, "personCount", { n }));
  return (
    <>
      <h3 className="split-subhead">{say(lang, "eachPerson")}</h3>
      <ul className="split-rows split-people">
        {people.map((p) => (
          <li key={p.id}>
            <button type="button" className="split-row" onClick={() => setOpen(p.id)}>
              <span className="split-row-text">
                <strong>{nameFor(ledger, p.id, me, lang)}</strong>
                <span>{personLine(p, ledger.currency, lang)}</span>
              </span>
              {stands(p)}
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={!!open} onClose={() => setOpen(null)} lang={lang} category="tool" title={who ? nameFor(ledger, who, me, lang) : ""}>
        {person && statement && (
          <div className="split-statement">
            <dl className="split-summary">
              <div>
                <dt>{say(lang, "personPaid")}</dt>
                <dd>
                  {sum(person.paid)}
                  {paidCount > 0 && <small>{counted(paidCount)}</small>}
                </dd>
              </div>
              <div>
                <dt>{say(lang, "personShare")}</dt>
                <dd>
                  {sum(person.share)}
                  {shareCount > 0 && <small>{counted(shareCount)}</small>}
                </dd>
              </div>
              {person.sent > 0 && (
                <div>
                  <dt>{say(lang, "personSent")}</dt>
                  <dd>{sum(person.sent)}</dd>
                </div>
              )}
              {person.received > 0 && (
                <div>
                  <dt>{say(lang, "personReceived")}</dt>
                  <dd>{sum(person.received)}</dd>
                </div>
              )}
              <div className="is-total">
                <dt>{say(lang, personStands(person).word)}</dt>
                <dd>{sum(Math.abs(person.net))}</dd>
              </div>
            </dl>
            <p className="split-note">{say(lang, "personHow")}</p>
            {/* (a 查看链接's ledger has nobody's: the server keeps it back) */}
            {(() => {
              const m = ledger.members.find((x) => x.id === person.id);
              return m?.pay ? <PayFor ledger={ledger} member={m} me={me} lang={lang} mayChange={false} /> : null;
            })()}
            {statement.expenses.length > 0 && (
              <>
                <h3 className="split-subhead">{say(lang, "statementExpenses")}</h3>
                <ul className="split-rows">
                  {statement.expenses.map(({ expense: e, paid, share }) => (
                    <li key={e.id}>
                      <div className="split-row is-still">
                        <span className="split-row-text">
                          <strong className={e.note || e.merchant ? undefined : "is-quiet"}>{e.note || e.merchant || say(lang, "noNote")}</strong>
                          <span>
                            {dayLabel(spentOn(e), today, lang)}
                            {paid > 0 && ` · ${say(lang, "personPaid")} ${sum(paid)}`}
                          </span>
                        </span>
                        <span className="split-row-amount">
                          {share > 0 ? (
                            <>
                              <small>{say(lang, "personShare")}</small>
                              {sum(share)}
                            </>
                          ) : (
                            <small>{say(lang, "personNoShare")}</small>
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {statement.transfers.length > 0 && (
              <>
                <h3 className="split-subhead">{say(lang, "statementTransfers")}</h3>
                <ul className="split-rows">
                  {statement.transfers.map((t) => (
                    <li key={t.id}>
                      <div className="split-row is-still">
                        <span className="split-row-text">
                          <strong>{paysLine(ledger, t.from, t.to, me, lang)}</strong>
                          <span>{dayLabel(localDay(t.at), today, lang)}</span>
                        </span>
                        <span className="split-row-amount">{sum(t.amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

/** 总结: what the ledger came to, a line each (lines.ts, summaryLines): its name, the sum, and what it is over. */
function Summary({ ledger, me, lang }: { ledger: Ledger; me: string | undefined; lang: Lang }) {
  const lines = summaryLines(ledger, me, lang);
  if (!lines.length) return null;
  return (
    <>
      <h3 className="split-subhead">{say(lang, "summary")}</h3>
      <dl className="split-summary">
        {lines.map((x) => (
          <div key={x.term}>
            <dt>{x.term}</dt>
            <dd>
              {x.value}
              <small>{x.more}</small>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
