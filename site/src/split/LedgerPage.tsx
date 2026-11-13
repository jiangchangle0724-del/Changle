/**
 * changle.ca/split/<id>: one ledger. Two views of it, 账目 (what was paid, and where you stand) and
 * 结清 (who pays whom), with one button at the thumb for each. 记一笔 takes the whole screen while it
 * is open, and the phone's back button closes it like a sheet.
 */
import { ClipboardCopy, Ellipsis, FileQuestion, Plus, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { back, go, mark, useBackCloses } from "../router";
import { useStore } from "../store";
import { sizeClass } from "../tools/money";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/Toast";
import { AddExpense } from "./AddExpense";
import { balances, expensesOf, settlement, spent, type Expense, type Ledger } from "./core";
import { money } from "./format";
import { mine, paidBy, planText, sharedHow } from "./lines";
import { putBack } from "./ops";
import { Bar, copyText, Rolling } from "./parts";
import { SettleView } from "./SettleView";
import { LedgerMenu } from "./Sheets";
import { change, useSaved } from "./store";
import { say } from "./words";

type View = "list" | "settle";

export function LedgerPage({ id }: { id: string }) {
  const { lang } = useStore();
  const toast = useToast();
  const saved = useSaved();
  const ledger = saved.ledgers.find((l) => l.id === id);
  const me = saved.me[id];
  const [view, setView] = useState<View>("list");
  /** 记一笔 is open: for a new expense (null), or to change the one with this id */
  const [entry, setEntry] = useState<{ edit: string | null } | null>(null);
  const [menu, setMenu] = useState(false);
  /** the expense recorded a moment ago: its row lands (one of the three motions) */
  const [landed, setLanded] = useState<string | null>(null);
  /** what you were owed (or owed) when 记一笔 opened: the figure rolls on from there when it closes */
  const [rollFrom, setRollFrom] = useState<number | null>(null);
  useBackCloses(!!entry, () => setEntry(null));
  // who pays whom: worked out again only when the ledger itself has changed
  const plan = useMemo(() => (ledger ? settlement(ledger) : null), [ledger]);

  // ‹ goes to the page before when that was this site's (the list of ledgers); a ledger opened
  // straight from its address goes to the list instead of leaving 两清. Which of the two it was is
  // read once, as the page opens: later an open sheet has an entry of its own on top of the page's.
  const fromSite = useRef(!!mark()?.inSite && !mark()?.sheet);
  const toList = () => (fromSite.current ? back() : go({ kind: "split" }, true));

  if (!ledger || !plan)
    return (
      <div className="split-page">
        <Bar lang={lang} onBack={toList} title={say(lang, "name")} />
        <EmptyState icon={FileQuestion} title={say(lang, "missing")} body={say(lang, "missingBody")} action={{ label: say(lang, "myLedgers"), onClick: () => go({ kind: "split" }, true) }} />
      </div>
    );

  if (entry) {
    const editing = entry.edit ? ledger.entries.find((e): e is Expense => e.id === entry.edit && e.kind === "expense") : undefined;
    return (
      <AddExpense
        ledger={ledger}
        me={me}
        editing={editing}
        lang={lang}
        onClose={() => {
          setRollFrom(null);
          setEntry(null);
        }}
        onSaved={(savedId) => {
          setEntry(null);
          setView("list");
          if (!editing) setLanded(savedId);
        }}
        onDeleted={(goneId) => {
          setEntry(null);
          toast(say(lang, "expenseDeleted"), { action: { label: say(lang, "undo"), onClick: () => change(id, (l) => putBack(l, goneId)) } });
        }}
      />
    );
  }

  const copyPlan = async () => {
    const done = await copyText(planText(ledger, plan, lang));
    toast(say(lang, done ? "planCopied" : "copyFailed"), { tone: done ? "success" : "warning" });
  };
  const hasExpenses = expensesOf(ledger).length > 0;
  const openEntry = (edit: string | null) => {
    setRollFrom(Math.abs(me ? (balances(ledger)[me] ?? 0) : 0));
    setEntry({ edit });
  };

  return (
    <div className="split-page">
      <Bar lang={lang} onBack={toList} title={ledger.name} right={<Button tone="icon" icon={Ellipsis} label={say(lang, "more")} onClick={() => setMenu(true)} />} />
      <Tabs<View>
        label={say(lang, "views")}
        value={view}
        onChange={(v) => {
          setRollFrom(null);
          setLanded(null);
          setView(v);
        }}
        items={[
          { key: "list", label: say(lang, "expenses"), panelId: "split-list" },
          { key: "settle", label: say(lang, "settle"), panelId: "split-settle" },
        ]}
      />
      {view === "list" ? (
        <section className="split-panel" id="split-list" role="tabpanel" aria-labelledby="split-list-tab">
          {/* an empty ledger says so once, in the list's own empty state */}
          {hasExpenses && <Standing ledger={ledger} me={me} lang={lang} rollFrom={rollFrom} />}
          <ExpenseList ledger={ledger} me={me} lang={lang} landed={landed} onLanded={() => setLanded(null)} onOpen={openEntry} />
        </section>
      ) : (
        <section className="split-panel" id="split-settle" role="tabpanel" aria-labelledby="split-settle-tab">
          <SettleView ledger={ledger} me={me} lang={lang} plan={plan} />
        </section>
      )}
      <div className="split-dock">
        {/* with nothing recorded there is no plan to copy: both views lead to the first expense */}
        {view === "list" || !hasExpenses ? (
          <Button size="lg" block icon={Plus} onClick={() => openEntry(null)}>
            {say(lang, "addExpense")}
          </Button>
        ) : (
          <Button size="lg" block icon={ClipboardCopy} onClick={() => void copyPlan()}>
            {say(lang, "copyPlan")}
          </Button>
        )}
      </div>
      <LedgerMenu open={menu} onClose={() => setMenu(false)} ledger={ledger} me={me} lang={lang} onDeleted={toList} />
    </div>
  );
}

/**
 * Where you stand, as a sentence: the words, then the amount, the largest thing on the page. With
 * nothing owed either way the words are the headline themselves. Under it, how many people have
 * spent how much. (Shown once there is an expense to stand on.)
 */
function Standing({ ledger, me, lang, rollFrom }: { ledger: Ledger; me: string | undefined; lang: Lang; rollFrom: number | null }) {
  // a phone that doesn't know which of these people is its owner says what was spent, and nothing about "you"
  const who = mine(ledger, me);
  const net = who ? (balances(ledger)[who] ?? 0) : 0;
  const people = say(lang, "people", { n: ledger.members.length });
  const total = say(lang, "spent", { amount: money(spent(ledger), ledger.currency, lang) });
  return (
    <div className="split-standing">
      {net !== 0 ? (
        <>
          <p className="split-standing-words">{say(lang, net > 0 ? "youGet" : "youOwe")}</p>
          {/* sized for the amount it settles on, so a long one stays on its line (and doesn't change size while it rolls) */}
          <p className={`split-figure ${sizeClass(money(net, ledger.currency, lang))}`}>
            <Rolling value={Math.abs(net)} from={rollFrom} currency={ledger.currency} lang={lang} />
          </p>
        </>
      ) : (
        <p className="split-standing-lead">{who ? say(lang, "youSquare") : total}</p>
      )}
      <p className="split-standing-sub">{who ? `${people} · ${total}` : people}</p>
    </div>
  );
}

/** The expenses, newest first: what it was, who paid and how it was shared, how much. A row opens the expense to change it. The one just recorded lands (one of the three motions). */
function ExpenseList({ ledger, me, lang, landed, onLanded, onOpen }: { ledger: Ledger; me: string | undefined; lang: Lang; landed: string | null; onLanded: () => void; onOpen: (id: string) => void }) {
  const rows = [...expensesOf(ledger)].reverse();
  const landedRow = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (landed) landedRow.current?.scrollIntoView({ block: "nearest" });
  }, [landed]);
  if (!rows.length) return <EmptyState icon={ReceiptText} title={say(lang, "noExpenses")} body={say(lang, "noExpensesBody")} />;
  return (
    <ul className="split-rows">
      {rows.map((e) => (
        // the landing is over when the wash of light on the row has faded (split.css): the mark comes off, so the row never lands twice
        <li key={e.id} ref={e.id === landed ? landedRow : undefined} className={e.id === landed ? "is-landing" : undefined} onAnimationEnd={e.id === landed ? (ev) => ev.animationName === "split-lit" && onLanded() : undefined}>
          <button type="button" className="split-row" onClick={() => onOpen(e.id)}>
            <span className="split-row-text">
              <strong className={e.note ? undefined : "is-quiet"}>{e.note || say(lang, "noNote")}</strong>
              <span>
                {paidBy(e, ledger, me, lang)} · {sharedHow(e, ledger, me, lang)}
              </span>
            </span>
            <span className="split-row-amount">{money(e.amount, ledger.currency, lang)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
