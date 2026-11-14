/**
 * changle.ca/split/<id>: one ledger. Two views of it, 账目 (what was paid, and where you stand) and
 * 结清 (who pays whom), with one button at the thumb for each. 记一笔 takes the whole screen while it
 * is open, and the phone's back button closes it like a sheet.
 *
 * While the page is open the ledger listens for what other phones record (syncing.ts). It says
 * nothing about that while all is well: only when something recorded here hasn't gone up, or
 * didn't stick.
 *
 * A ledger this phone doesn't hold opens from an invitation: its address with the ledger's key
 * after the # (invite.ts). The ledger is read from the server, the key comes off the address, and
 * the page asks which of the people in the ledger this phone's owner is.
 */
import { CircleAlert, ClipboardCopy, CloudOff, Ellipsis, FileQuestion, Link2Off, Lock, Plus, ReceiptText, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { back, go, mark, useBackCloses } from "../router";
import { useStore } from "../store";
import { sizeClass } from "../tools/money";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/Toast";
import { AddExpense } from "./AddExpense";
import { balances, expensesOf, settlement, spent, type Expense, type Ledger } from "./core";
import { money } from "./format";
import { keyFrom } from "./invite";
import { WhoStep } from "./Join";
import { lostLine, mine, paidBy, planText, sharedHow, syncLine } from "./lines";
import { Bar, copyText, Rolling } from "./parts";
import { SettleView } from "./SettleView";
import { LedgerMenu } from "./Sheets";
import { heldOf, useSaved } from "./store";
import type { Held } from "./sync";
import { dismissLost, joinLedger, record, useSync, watch, type Joined } from "./syncing";
import { say } from "./words";

type View = "list" | "settle";

export function LedgerPage({ id }: { id: string }) {
  const { lang } = useStore();
  const toast = useToast();
  const saved = useSaved();
  const at = saved.held.findIndex((h) => h.server.id === id);
  const ledger: Ledger | undefined = saved.ledgers[at];
  const held: Held | undefined = saved.held[at];
  const me = saved.me[id];
  const sync = useSync(id);
  // open on the screen: what others record arrives by itself, until the page is left
  // (watched again once the phone holds it: a ledger just opened from an invitation)
  const here = !!held;
  useEffect(() => (here ? watch(id) : undefined), [id, here]);

  // An invitation: this address, with the ledger's key after the #. A phone that doesn't hold the
  // ledger reads it from the server with that key. One that does shows what it has meanwhile, and
  // takes the invitation's key if it is another one that opens the ledger (its owner changed the
  // key). Either way the key then comes off the address, so it isn't in what the phone's browser
  // shares or remembers of this page.
  const [arrival, setArrival] = useState<"joining" | Exclude<Joined, "in"> | null>(() => (keyFrom(window.location.hash) && !heldOf(id) ? "joining" : null));
  const arrive = useCallback(() => {
    const key = keyFrom(window.location.hash);
    if (!key) return;
    const done = () => window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (!heldOf(id)) setArrival("joining");
    void joinLedger(id, key).then((how) => (how === "in" ? done() : setArrival(how)));
  }, [id]);
  useEffect(() => {
    arrive();
    window.addEventListener("hashchange", arrive);
    return () => window.removeEventListener("hashchange", arrive);
  }, [arrive]);
  /** "which one are you?" is asked when the page opens, and not again until it is opened again */
  const [asking, setAsking] = useState(true);
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

  if (!ledger || !held || !plan) {
    const toMine = { label: say(lang, "myLedgers"), onClick: () => go({ kind: "split" }, true) };
    return (
      <div className="split-page">
        <Bar lang={lang} onBack={toList} title={say(lang, "name")} />
        {arrival === "joining" ? (
          // the shape of the page it is about to be: where you stand, then a few rows
          <div className="split-arriving">
            <Skeleton lang={lang} shape="block" />
            <Skeleton lang={lang} lines={3} slowText={say(lang, "slow")} />
          </div>
        ) : arrival === "away" ? (
          <EmptyState tone="error" icon={WifiOff} title={say(lang, "joinAway")} body={say(lang, "joinAwayBody")} action={{ label: say(lang, "retry"), onClick: arrive }} />
        ) : arrival === "key" ? (
          <EmptyState tone="error" icon={Link2Off} title={say(lang, "joinKey")} body={say(lang, "joinKeyBody")} action={toMine} />
        ) : arrival === "gone" ? (
          <EmptyState tone="error" icon={FileQuestion} title={say(lang, "joinGone")} body={say(lang, "joinGoneBody")} action={toMine} />
        ) : (
          <EmptyState icon={FileQuestion} title={say(lang, "missing")} body={say(lang, "missingBody")} action={toMine} />
        )}
      </div>
    );
  }

  // a phone that came in by an invitation doesn't know yet which of these people its owner is: asked first
  if (asking && !mine(ledger, me))
    return (
      <div className="split-page">
        <Bar lang={lang} onBack={toList} title={ledger.name} />
        <WhoStep ledger={ledger} lang={lang} onSkip={() => setAsking(false)} />
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
          toast(say(lang, "expenseDeleted"), { action: { label: say(lang, "undo"), onClick: () => record(id, { do: "back", entry: goneId }) } });
        }}
      />
    );
  }

  const copyPlan = async () => {
    const done = await copyText(planText(ledger, plan, lang));
    toast(say(lang, done ? "planCopied" : "copyFailed"), { tone: done ? "success" : "warning" });
  };
  const hasExpenses = expensesOf(ledger).length > 0;
  // locked by its owner: everything on the page can be read, and nothing on it changes the ledger
  const locked = ledger.locked !== undefined;
  const line = syncLine({ made: held.made, waiting: held.waiting, locked, mine: !!held.owner }, sync, lang);
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
      <SyncNote ledger={ledger} lost={held.lost} line={line} lang={lang} />
      {view === "list" ? (
        <section className="split-panel" id="split-list" role="tabpanel" aria-labelledby="split-list-tab">
          {/* an empty ledger says so once, in the list's own empty state */}
          {hasExpenses && <Standing ledger={ledger} me={me} lang={lang} rollFrom={rollFrom} />}
          <ExpenseList ledger={ledger} me={me} lang={lang} landed={landed} onLanded={() => setLanded(null)} onOpen={locked ? undefined : openEntry} />
        </section>
      ) : (
        <section className="split-panel" id="split-settle" role="tabpanel" aria-labelledby="split-settle-tab">
          <SettleView ledger={ledger} me={me} lang={lang} plan={plan} />
        </section>
      )}
      {/* with nothing recorded there is no plan to copy: both views lead to the first expense (and a locked ledger takes none: the page has no button then) */}
      {view === "list" || !hasExpenses ? (
        !locked && (
          <div className="split-dock">
            <Button size="lg" block icon={Plus} onClick={() => openEntry(null)}>
              {say(lang, "addExpense")}
            </Button>
          </div>
        )
      ) : (
        <div className="split-dock">
          <Button size="lg" block icon={ClipboardCopy} onClick={() => void copyPlan()}>
            {say(lang, "copyPlan")}
          </Button>
        </div>
      )}
      <LedgerMenu open={menu} onClose={() => setMenu(false)} ledger={ledger} me={me} lang={lang} status={line} inviteKey={held.key} made={held.made} owner={!!held.owner} changing={!!held.next} away={sync.away} onDeleted={toList} />
    </div>
  );
}

/** At most this many changes that didn't stick are named one by one; the rest are counted. */
const LOST_NAMED = 3;

/**
 * What the page says about the server, above both views, and only when there is something to say.
 * A change that didn't stick is named, with why and what to do, until its owner says 知道了. Under
 * it, one line when what was recorded here hasn't gone up (quiet: it will) or can't (in the page's
 * strong voice, with a mark). Neither takes the light: that is for the one button and what is chosen.
 */
function SyncNote({ ledger, lost, line, lang }: { ledger: Ledger; lost: Held["lost"]; line: ReturnType<typeof syncLine>; lang: Lang }) {
  return (
    <>
      {lost.length > 0 && (
        <div className="split-ask split-lost" role="alert">
          <p className="split-lost-head">
            <CircleAlert aria-hidden="true" />
            {lost.length === 1 ? say(lang, "lostOne") : say(lang, "lostMany", { n: lost.length })}
          </p>
          <ul>
            {lost.slice(0, LOST_NAMED).map((s) => (
              <li key={s.id}>{lostLine(ledger, s, lang)}</li>
            ))}
            {lost.length > LOST_NAMED && <li>{say(lang, "lostMore", { n: lost.length - LOST_NAMED })}</li>}
          </ul>
          <p className="split-lost-why">{say(lang, "lostWhy")}</p>
          <Button tone="quiet" size="sm" onClick={() => dismissLost(ledger.id, lost.map((s) => s.id))}>
            {say(lang, "gotIt")}
          </Button>
        </div>
      )}
      {line && (
        <p className={`split-sync${line.loud ? " is-loud" : ""}`}>
          {line.lock ? <Lock aria-hidden="true" /> : line.loud ? <CircleAlert aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
          {line.text}
        </p>
      )}
      {/* read out when it changes; the line itself comes and goes */}
      <span className="ui-visually-hidden" role="status">
        {line?.text ?? ""}
      </span>
    </>
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

/**
 * The expenses, newest first: what it was, who paid and how it was shared, how much. A row opens
 * the expense to change it; in a locked ledger (no `onOpen`) a row is only a row. The one just
 * recorded lands (one of the three motions).
 */
function ExpenseList({ ledger, me, lang, landed, onLanded, onOpen }: { ledger: Ledger; me: string | undefined; lang: Lang; landed: string | null; onLanded: () => void; onOpen?: (id: string) => void }) {
  const rows = [...expensesOf(ledger)].reverse();
  const landedRow = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (landed) landedRow.current?.scrollIntoView({ block: "nearest" });
  }, [landed]);
  if (!rows.length)
    return (
      <EmptyState
        icon={ReceiptText}
        title={say(lang, "noExpenses")}
        body={
          // two things a new ledger wants next, a line each (a locked one wants neither)
          onOpen && (
            <>
              {say(lang, "noExpensesBody")}
              <br />
              {say(lang, "inviteHint")}
            </>
          )
        }
      />
    );
  const row = (e: Expense) => (
    <>
      <span className="split-row-text">
        <strong className={e.note ? undefined : "is-quiet"}>{e.note || say(lang, "noNote")}</strong>
        <span>
          {paidBy(e, ledger, me, lang)} · {sharedHow(e, ledger, me, lang)}
        </span>
      </span>
      <span className="split-row-amount">{money(e.amount, ledger.currency, lang)}</span>
    </>
  );
  return (
    <ul className="split-rows">
      {rows.map((e) => (
        // the landing is over when the wash of light on the row has faded (split.css): the mark comes off, so the row never lands twice
        <li key={e.id} ref={e.id === landed ? landedRow : undefined} className={e.id === landed ? "is-landing" : undefined} onAnimationEnd={e.id === landed ? (ev) => ev.animationName === "split-lit" && onLanded() : undefined}>
          {onOpen ? (
            <button type="button" className="split-row" onClick={() => onOpen(e.id)}>
              {row(e)}
            </button>
          ) : (
            <div className="split-row is-still">{row(e)}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
