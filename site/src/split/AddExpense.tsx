/**
 * 记一笔: the whole screen while an expense is typed in. Two taps record one: the amount on the
 * keypad, then 记好了. Who paid starts as you and it starts shared equally by everyone; either opens
 * only when it needs changing.
 */
import { Check, ChevronRight, CircleAlert, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Lang } from "../i18n";
import { sizeClass } from "../tools/money";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/Toast";
import { MAX_SHARES, nextRot, portions, type Decimals, type Expense, type Ledger } from "./core";
import { amountOf, blankDraft, draftOf, draftProblem, shareBy, sharers, splitOf, type Draft, type How } from "./draft";
import { currencyName, decimalsOf, money, typed } from "./format";
import { asAmountText, press, type Key } from "./input";
import { nameFor } from "./lines";
import { NOTE_MAX } from "./ops";
import { Bar, Keypad } from "./parts";
import { newId } from "./store";
import { record } from "./syncing";
import { say } from "./words";

type Props = {
  ledger: Ledger;
  /** which member this phone's owner is */
  me: string | undefined;
  /** the expense being changed; a new one when there is none */
  editing?: Expense;
  lang: Lang;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted: (id: string) => void;
};

export function AddExpense({ ledger, me, editing, lang, onClose, onSaved, onDeleted }: Props) {
  const toast = useToast();
  const decimals = decimalsOf(ledger.currency);
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftOf(editing, decimals) : blankDraft(ledger, me)));
  const [sheet, setSheet] = useState<"payer" | "share" | null>(null);
  const amount = amountOf(draft, decimals);
  const wrong = draftProblem(draft, ledger, decimals);
  const who = sharers(draft, ledger, decimals);
  // the turn for the odd cents this expense has (or will get), so the parts shown are the parts recorded
  const rot = editing ? editing.rot : nextRot(ledger);

  const type = (k: Key) => setDraft((d) => ({ ...d, text: press(d.text, k, decimals) }));

  // a real keyboard types the amount too (a computer, or a phone with one attached)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || e.metaKey || e.ctrlKey || e.altKey) return;
      const at = e.target as HTMLElement | null;
      if (at && (at.tagName === "INPUT" || at.tagName === "TEXTAREA")) return;
      if (/^[0-9.]$/.test(e.key)) type(e.key as Key);
      else if (e.key === "Backspace") type("back");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = () => {
    if (wrong || !amount) return;
    const to = { payer: draft.payer, amount, note: draft.note, split: splitOf(draft, decimals) };
    const id = editing ? editing.id : newId();
    // a new expense goes as it is recorded here, its turn for the odd cents included: the parts shown are the parts everyone gets
    const done = editing ? record(ledger.id, { do: "edit", entry: id, to }) : record(ledger.id, { do: "expense", expense: { kind: "expense", id, at: Date.now(), ...to, rot } });
    // (refused only when the ledger changed under this screen: someone on another phone got there first)
    if (done) onSaved(id);
    else toast(say(lang, "notSaved"), { tone: "warning" });
  };

  const shown = typed(draft.text, ledger.currency, lang);
  const shareSummary = !who.length
    ? say(lang, "nobody")
    : draft.how === "equal"
      ? say(lang, who.length === ledger.members.length ? "everyoneEven" : "someEven", { n: who.length })
      : say(lang, draft.how === "shares" ? "byShares" : "byAmounts", { n: who.length });
  // why 记好了 can't be pressed yet, when it is the sharing that is off (an empty amount explains itself):
  // said on the 分给谁 line, which is where it is put right
  const off =
    amount && wrong?.what === "sum" ? say(lang, wrong.off > 0 ? "left" : "over", { amount: money(wrong.off, ledger.currency, lang) }) : amount && wrong?.what === "nobody" ? say(lang, "nobody") : "";

  return (
    <div className="split-page split-add">
      <Bar
        lang={lang}
        close
        onBack={onClose}
        title={say(lang, editing ? "editExpense" : "addExpense")}
        right={
          editing && (
            <Button
              tone="icon"
              icon={Trash2}
              label={say(lang, "deleteExpense")}
              onClick={() => {
                record(ledger.id, { do: "out", entry: editing.id, at: Date.now() });
                onDeleted(editing.id);
              }}
            />
          )
        }
      />
      <div className="split-add-main">
        <p className="split-add-amount">
          <output className={`split-figure ${sizeClass(shown)}${draft.text ? "" : " is-empty"}`} aria-label={say(lang, "amount")}>
            {shown}
          </output>
          <span>{currencyName(ledger.currency, lang)}</span>
        </p>
        <div className="split-fields">
          <button type="button" className="split-field" onClick={() => setSheet("payer")}>
            <span>{say(lang, "payer")}</span>
            <strong>{nameFor(ledger, draft.payer, me, lang)}</strong>
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" className="split-field" onClick={() => setSheet("share")}>
            <span>{say(lang, "sharedBy")}</span>
            <strong>
              {off && <CircleAlert aria-hidden="true" />}
              {off || shareSummary}
            </strong>
            <ChevronRight aria-hidden="true" />
          </button>
          <label className="split-field">
            <span>{say(lang, "note")}</span>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} onKeyDown={doneLeaves} maxLength={NOTE_MAX} placeholder={say(lang, "noteHint")} enterKeyHint="done" autoComplete="off" />
          </label>
        </div>
        <span className="ui-visually-hidden" role="status">
          {off}
        </span>
      </div>
      <div className="split-dock">
        <Keypad onKey={type} decimals={decimals} lang={lang} />
        <Button size="lg" block disabled={!!wrong} onClick={save}>
          {say(lang, editing ? "saveChanges" : "done")}
        </Button>
      </div>
      <PayerSheet open={sheet === "payer"} onClose={() => setSheet(null)} ledger={ledger} me={me} lang={lang} value={draft.payer} onPick={(payer) => setDraft({ ...draft, payer })} />
      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} ledger={ledger} me={me} lang={lang} decimals={decimals} rot={rot} draft={draft} onChange={setDraft} />
    </div>
  );
}

/** The round mark with someone's first letter, as on the site's tables (the first whole character: an emoji is one). */
export function Face({ name }: { name: string }) {
  return (
    <span className="split-face" aria-hidden="true">
      {([...name.trim()][0] ?? "").toUpperCase()}
    </span>
  );
}

/** Who paid: one tap picks and closes. */
function PayerSheet({ open, onClose, ledger, me, lang, value, onPick }: { open: boolean; onClose: () => void; ledger: Ledger; me: string | undefined; lang: Lang; value: string; onPick: (id: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} lang={lang} category="tool" title={say(lang, "payer")}>
      <div className="split-people" role="radiogroup" aria-label={say(lang, "payer")}>
        {ledger.members.map((m) => (
          <button
            key={m.id}
            type="button"
            className="split-person"
            role="radio"
            aria-checked={m.id === value}
            onClick={() => {
              onPick(m.id);
              onClose();
            }}
          >
            <Face name={m.name} />
            <span className="split-person-name">
              {m.name}
              {m.id === me && <small>{say(lang, "you")}</small>}
            </span>
            <span className="split-check" aria-hidden="true">
              <Check />
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** The keyboard's own "done" key puts the keyboard away, so the screen under it is back in view. */
const doneLeaves = (e: ReactKeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

/** Shared by whom, and how: evenly, by shares, or by typed amounts. What each one bears shows as it changes. */
function ShareSheet({
  open,
  onClose,
  ledger,
  me,
  lang,
  decimals,
  rot,
  draft,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  me: string | undefined;
  lang: Lang;
  decimals: Decimals;
  rot: number;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const everyone = ledger.members.map((m) => m.id);
  const amount = amountOf(draft, decimals);
  const wrong = draftProblem(draft, ledger, decimals);
  const taking = sharers(draft, ledger, decimals);
  const parts = amount && draft.how !== "exact" ? portions(amount, splitOf(draft, decimals), rot, everyone) : {};
  const part = (id: string) => (parts[id] !== undefined ? money(parts[id], ledger.currency, lang) : "");
  const label = (m: { id: string; name: string }) => (
    <span className="split-person-name">
      {m.name}
      {m.id === me && <small>{say(lang, "you")}</small>}
    </span>
  );
  const status =
    draft.how !== "exact"
      ? ""
      : !amount
        ? say(lang, "typeAmountFirst")
        : wrong?.what === "sum"
          ? say(lang, wrong.off > 0 ? "left" : "over", { amount: money(wrong.off, ledger.currency, lang) })
          : wrong
            ? say(lang, "nobody")
            : say(lang, "addsUp");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "sharedBy")}
      footer={
        <Button block onClick={onClose}>
          {say(lang, "ok")}
        </Button>
      }
    >
      <Tabs<How>
        variant="segmented"
        label={say(lang, "how")}
        value={draft.how}
        onChange={(how) => onChange(shareBy(draft, how, ledger, decimals, rot))}
        items={[
          { key: "equal", label: say(lang, "evenly") },
          { key: "shares", label: say(lang, "shares") },
          { key: "exact", label: say(lang, "amounts") },
        ]}
      />
      {draft.how === "equal" && (
        <>
          <ul className="split-people">
            {ledger.members.map((m) => {
              const inIt = draft.among.includes(m.id);
              return (
                <li key={m.id}>
                  <button type="button" className="split-person" role="checkbox" aria-checked={inIt} onClick={() => onChange({ ...draft, among: inIt ? draft.among.filter((x) => x !== m.id) : [...draft.among, m.id] })}>
                    <Face name={m.name} />
                    {label(m)}
                    <span className="split-person-part">{part(m.id)}</span>
                    <span className="split-check" aria-hidden="true">
                      <Check />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {draft.among.length < everyone.length && (
            <Button tone="quiet" size="sm" onClick={() => onChange({ ...draft, among: everyone })}>
              {say(lang, "everyone")}
            </Button>
          )}
        </>
      )}
      {draft.how === "shares" && (
        <>
          <ul className="split-people">
            {ledger.members.map((m) => {
              const n = draft.shares[m.id] ?? 0;
              const set = (to: number) => onChange({ ...draft, shares: { ...draft.shares, [m.id]: Math.max(0, Math.min(MAX_SHARES, to)) } });
              return (
                <li key={m.id} className={`split-person${n > 0 ? "" : " is-out"}`}>
                  <Face name={m.name} />
                  {/* the stepper takes a third of the line: what they bear goes under the name, not beside it */}
                  <span className="split-person-text">
                    {label(m)}
                    <span className="split-person-part">{part(m.id)}</span>
                  </span>
                  <span className="split-stepper">
                    <Button tone="icon" icon={Minus} label={say(lang, "fewer", { who: m.name })} disabled={n <= 0} onClick={() => set(n - 1)} />
                    <output aria-label={say(lang, "sharesOf", { n })}>{n}</output>
                    <Button tone="icon" icon={Plus} label={say(lang, "oneMore", { who: m.name })} disabled={n >= MAX_SHARES} onClick={() => set(n + 1)} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="split-note">{say(lang, "sharesHint")}</p>
        </>
      )}
      {draft.how === "exact" && (
        <>
          <ul className="split-people">
            {ledger.members.map((m) => (
              <li key={m.id} className={`split-person${taking.includes(m.id) ? "" : " is-out"}`}>
                <Face name={m.name} />
                {label(m)}
                <span className="field split-person-field">
                  <input
                    inputMode={decimals ? "decimal" : "numeric"}
                    value={draft.amounts[m.id] ?? ""}
                    onChange={(e) => onChange({ ...draft, amounts: { ...draft.amounts, [m.id]: asAmountText(e.target.value, decimals) } })}
                    onKeyDown={doneLeaves}
                    placeholder="0"
                    aria-label={say(lang, "amountFor", { who: m.name })}
                    autoComplete="off"
                    enterKeyHint="done"
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className={`split-note${!amount ? "" : wrong ? " is-off" : " is-good"}`} role="status">
            {amount && !wrong && <Check aria-hidden="true" />}
            {status}
          </p>
        </>
      )}
    </Sheet>
  );
}
