/**
 * changle.ca/split: the ledgers on this phone, and starting a new one. Signed in, the list is the
 * account's ledgers (the ones on this phone kept here only are among them until they reach the
 * account); signed out, the ones kept on this phone only. Starting one needs a sign-in.
 */
import { ChevronRight, CircleAlert, CloudOff, LogIn, Lock, Plus, ReceiptText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { BiTitle, LangTab } from "../components/TopBar";
import type { Lang } from "../i18n";
import { savedName } from "../online/config";
import { go } from "../router";
import { useStore } from "../store";
import { CURRENCIES } from "../tools/money";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Pill } from "../ui/Pill";
import { RosterChip } from "../ui/RosterChip";
import { Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";
import { MAX_MEMBERS, spent, type Ledger } from "./core";
import { money } from "./format";
import { standing } from "./lines";
import { LEDGER_NAME_MAX, NAME_MAX, startLedger, tidy } from "./ops";
import { Bar } from "./parts";
import { isKept, newId, useSaved } from "./store";
import type { Held } from "./sync";
import { browse, listed, openLedger, useSync } from "./syncing";
import { say, W, type Word } from "./words";

/**
 * Something for the list to say when it comes up, said by the page that sends you there (a ledger
 * deleted for everyone). Going from a ledger to the list puts 两清 up afresh, so it waits here.
 */
let news: Word | null = null;
export const tellList = (word: Word) => {
  news = word;
};

export function Ledgers({ onBack }: { onBack: () => void }) {
  const { lang } = useStore();
  const saved = useSaved();
  const { me: user, status, openSignIn, signInOpen } = useAccount();
  const account = status === "in" && user ? user.id : null;
  const [starting, setStarting] = useState(false);
  const toast = useToast();
  // each card says where you stand after what others recorded: the server is asked while the list is up
  useEffect(() => browse(), []);
  useEffect(() => {
    if (!news) return;
    toast(say(lang, news), { tone: "success" });
    news = null;
  }, [toast, lang]);
  // Signed out, the button signs in first, and once that is done the sheet it was pressed for opens.
  // Pressed while the page is still finding out who is signed in, it waits to know. The sign-in
  // closed without signing in, it was never pressed.
  const wants = useRef<"no" | "wait" | "signin">("no");
  useEffect(() => {
    if (wants.current === "no") return;
    if (account) {
      wants.current = "no";
      setStarting(true);
    } else if (wants.current === "wait" && status === "out") {
      wants.current = "signin";
      openSignIn();
    } else if (wants.current === "signin" && !signInOpen) wants.current = "no";
  }, [account, status, signInOpen, openSignIn]);
  const start = () => {
    if (account) return setStarting(true);
    wants.current = status === "loading" ? "wait" : "signin";
    if (status !== "loading") openSignIn();
  };
  const shown = saved.ledgers.flatMap((l, i) => (listed(saved.held[i], account) ? [{ ledger: l, held: saved.held[i] }] : []));
  return (
    <div className="split-page">
      <Bar
        lang={lang}
        onBack={onBack}
        title={<BiTitle name={W.name} size="sm" />}
        right={
          <span className="split-bar-inset">
            <LangTab />
          </span>
        }
      />
      {shown.length ? (
        <ul className="split-ledgers">
          {shown.map(({ ledger: l, held }) => (
            <li key={l.id}>
              <LedgerCard ledger={l} held={held} me={saved.me[l.id]} lang={lang} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={ReceiptText} title={say(lang, "noLedgers")} body={say(lang, "noLedgersBody")} />
      )}
      <p className="split-fine" role={isKept() ? undefined : "alert"}>
        {say(lang, isKept() ? "preview" : "notKept")}
      </p>
      <div className="split-dock">
        {/* (while the page is still finding out who is signed in, it says what it will do, and does it once it knows) */}
        <Button size="lg" block icon={account || status === "loading" ? Plus : LogIn} onClick={start}>
          {say(lang, account || status === "loading" ? "start" : "startSignIn")}
        </Button>
      </div>
      <StartLedger open={starting} onClose={() => setStarting(false)} lang={lang} />
    </div>
  );
}

/**
 * One ledger in the list: its name, how many people and how much spent, where you stand. And one
 * more line only when something recorded on this phone hasn't reached the server, or didn't stick.
 */
function LedgerCard({ ledger, held, me, lang }: { ledger: Ledger; held: Held; me: string | undefined; lang: Lang }) {
  const sync = useSync(ledger.id);
  const mine = standing(ledger, me, lang);
  // (one thing at most: what didn't stick, then what hasn't gone up, then that the ledger is locked)
  const flag = held.lost.length ? "cardLost" : (held.waiting.length || !held.made) && (sync.away || sync.trouble) ? "cardUnsent" : ledger.locked !== undefined ? "cardLocked" : null;
  return (
    <a className="split-ledger" href={`/split/${ledger.id}`}>
      <span className="split-ledger-text">
        <strong>{ledger.name}</strong>
        <span>
          {say(lang, "people", { n: ledger.members.length })} · {say(lang, "spent", { amount: money(spent(ledger), ledger.currency, lang) })}
        </span>
        {mine && <span className="split-ledger-standing">{mine}</span>}
        {flag && (
          <span className={`split-ledger-flag${flag === "cardLost" ? " is-loud" : ""}`}>
            {flag === "cardLost" ? <CircleAlert aria-hidden="true" /> : flag === "cardLocked" ? <Lock aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
            {say(lang, flag)}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" />
    </a>
  );
}

/** The sheet that starts a ledger: its name, you, the others, and the currency it settles in. */
function StartLedger({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: Lang }) {
  const [name, setName] = useState("");
  const [me, setMe] = useState(() => tidy(savedName(), NAME_MAX));
  const [others, setOthers] = useState<string[]>([]);
  const [next, setNext] = useState("");
  const [currency, setCurrency] = useState("CAD");

  const fresh = tidy(next, NAME_MAX);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const taken = !!fresh && (same(fresh, tidy(me, NAME_MAX)) || others.some((o) => same(o, fresh)));
  const full = others.length + 1 >= MAX_MEMBERS;
  const addOther = () => {
    if (!fresh || taken || full) return;
    setOthers([...others, fresh]);
    setNext("");
  };
  // a name typed but not added yet still counts: people forget the Add button
  const everyoneElse = fresh && !taken && !full ? [...others, fresh] : others;
  const ready = !!tidy(name, LEDGER_NAME_MAX) && !!tidy(me, NAME_MAX) && everyoneElse.length > 0 && !everyoneElse.some((o) => same(o, tidy(me, NAME_MAX)));

  const start = () => {
    if (!ready) return;
    const mine = newId();
    const ledger = startLedger(newId(), name, currency, [{ id: mine, name: me }, ...everyoneElse.map((n) => ({ id: newId(), name: n }))]);
    // (it is held on this phone from here on, and made on the server as soon as that can be reached)
    openLedger(ledger, mine);
    go({ kind: "split", id: ledger.id });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "start")}
      footer={
        <Button size="lg" block disabled={!ready} onClick={start}>
          {say(lang, "startIt")}
        </Button>
      }
    >
      <div className="split-form">
        <label>
          <span className="field-label">{say(lang, "ledgerName")}</span>
          <span className="field">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={LEDGER_NAME_MAX} placeholder={say(lang, "ledgerNameHint")} enterKeyHint="next" autoComplete="off" />
          </span>
        </label>
        <label>
          <span className="field-label">{say(lang, "yourName")}</span>
          <span className="field">
            <input value={me} onChange={(e) => setMe(e.target.value)} maxLength={NAME_MAX} placeholder={say(lang, "nameHint")} enterKeyHint="next" autoComplete="off" />
          </span>
        </label>
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
          >
            <label htmlFor="split-who-else" className="field-label">
              {say(lang, "whoElse")}
            </label>
            <span className="field">
              <input id="split-who-else" value={next} onChange={(e) => setNext(e.target.value)} maxLength={NAME_MAX} placeholder={say(lang, "whoElseHint")} enterKeyHint="done" autoComplete="off" aria-describedby="split-who-else-note" />
              <Button tone="quiet" size="sm" type="submit" disabled={!fresh || taken || full}>
                {say(lang, "add")}
              </Button>
            </span>
          </form>
          <p className="split-note" id="split-who-else-note" role="status">
            {taken ? say(lang, "nameTaken") : full ? say(lang, "full", { n: MAX_MEMBERS }) : say(lang, "moreLater")}
          </p>
          {others.length > 0 && (
            <ul className="split-chips">
              {others.map((o) => (
                <li key={o}>
                  <RosterChip name={o} lang={lang} size="sm" onRemove={() => setOthers(others.filter((x) => x !== o))} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <fieldset className="split-choice">
          <legend className="field-label">{say(lang, "settleIn")}</legend>
          <div className="split-pills">
            {CURRENCIES.map((c) => (
              // the light is on the one that is chosen, and only there
              <Pill key={c.code} kind="toggle" tone={currency === c.code ? "tool" : "neutral"} selected={currency === c.code} onToggle={() => setCurrency(c.code)}>
                {lang === "zh" ? c.zh : c.code}
              </Pill>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}
