/**
 * 记一笔: the whole screen while an expense is typed in. Two taps record one: the amount on the
 * keypad, then 记好了. Who paid starts as you and it starts shared equally by everyone; either opens
 * only when it needs changing. So does the currency: it is the one the last expense was paid in,
 * and the button in the corner changes it. Under who paid and who shares it, 详情: the day, what it was
 * for, where and how it was paid, the tip and tax, said on the line and changed in its sheet. Receipt
 * photos have a button at the end of that line (Photos.tsx): each goes to the server as it is chosen,
 * and the expense keeps their ids. Several chosen at once for a new expense: asked whether they are an
 * expense each (几张小票, Receipts.tsx) or this one's photos. A receipt read that looks like one
 * already recorded says so in place of the line under the amount (twins.ts).
 */
import { Camera, Check, ChevronDown, ChevronRight, CircleAlert, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useAccount } from "../account/AccountContext";
import type { Lang } from "../i18n";
import { useRates, type FxState } from "../tools/fx";
import { CURRENCIES, sizeClass } from "../tools/money";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { Sheet } from "../ui/Sheet";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/Toast";
import { MAX_FILES } from "./changes";
import { MAX_SHARES, nextRot, portions, type Decimals, type Expense, type Ledger } from "./core";
import { abroad, amountOf, blankDraft, draftOf, draftProblem, extrasOf, extrasOver, paidOf, payIn, rated, readInto, saying, shareBy, sharers, splitOf, type Draft, type How } from "./draft";
import { currencyName, decimalsOf, localDay, money, typed } from "./format";
import { asAmountText, press, totalOf, type Key } from "./input";
import { CATEGORY_WORD, dayLabel, extrasText, nameFor, spentOn } from "./lines";
import { DETAIL_MAX, DETAILS, isDay, NOTE_MAX, type Detail } from "./ops";
import { CATEGORIES, type Category } from "./categories";
import { guessed } from "./kinds";
import { Bar, KIND_ICONS, Keypad } from "./parts";
import { megabytes, TROUBLE_WORD, WARN_AT } from "./photos";
import { PhotoButton, PhotoPicker, PhotosSheet } from "./Photos";
import { asRateText, lastPaidIn, settled, todaysRate } from "./rates";
import { newId } from "./store";
import { dropPhoto, readingOn, readPhoto, record, sendPhoto } from "./syncing";
import { joinBill, sameBill, saidOf, twinIn } from "./twins";
import { say, type Word } from "./words";

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
  /** several photos chosen at once for a new expense, to be an expense each: 几张小票 takes them from here */
  onSeveral?: (files: File[]) => void;
};

/** A currency as these screens name it in a tight place: its name in Chinese (两 to 四 characters), its code in English. */
const shortName = (currency: string, lang: Lang) => (lang === "zh" ? currencyName(currency, lang) : currency);

/** Where this phone remembers it has said an account's photos are filling up (said once, until they go back under). */
const WARNED = "changle.split.photoWarned";

/** Today's rates, asked for only while something on the screen wants them (the site's own source, tools/fx.ts: one request, then once a minute). */
function TodaysRates({ onChange }: { onChange: (fx: FxState) => void }) {
  const { rates, at, source, loading, error } = useRates();
  useEffect(() => onChange({ rates, at, source, loading, error }), [rates, at, source, loading, error]);
  return null;
}

export function AddExpense({ ledger, me, editing, lang, onClose, onSaved, onDeleted, onSeveral }: Props) {
  const toast = useToast();
  // (the ledger's own currency: what everything about sharing is in)
  const decimals = decimalsOf(ledger.currency);
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftOf(editing, ledger) : blankDraft(ledger, me, Date.now())));
  const [sheet, setSheet] = useState<"payer" | "share" | "currency" | "rate" | "details" | null>(null);
  // The day it was spent: today for a new one, or what it says; one that says none was spent the day
  // it was recorded. Said first on the 详情 line, which opens the sheet where it is picked (with the
  // rest of the details). A day picked here is never replaced by one read off a receipt.
  const today = localDay(Date.now());
  const day = draft.date || localDay(editing?.at ?? Date.now());
  const dayPicked = useRef(false);
  const [fx, setFx] = useState<FxState | null>(null);
  const amount = amountOf(draft, ledger);
  const wrong = draftProblem(draft, ledger);
  const who = sharers(draft, ledger, decimals);
  const away = abroad(draft, ledger);
  // the turn for the odd cents this expense has (or will get), so the parts shown are the parts recorded
  const rot = editing ? editing.rot : nextRot(ledger);

  // Receipt photos: the ids this expense will keep. Each photo goes to the server as it is chosen.
  // One sent from this screen and never saved with the expense was never in the ledger, so it goes
  // from the server again when it is taken off or the screen closes. One the expense had stays
  // there when it is taken off (改回去 in the record brings it back): the nightly check clears
  // photos nothing uses (13c).
  const { me: account, status, openSignIn, signInOpen } = useAccount();
  const signedIn = status === "in";
  const [files, setFiles] = useState<string[]>(() => editing?.files ?? []);
  const [sending, setSending] = useState(0);
  const [photos, setPhotos] = useState(false);
  // several chosen at once, waiting to be told whether they are an expense each or this one's photos
  const [several, setSeveral] = useState<File[] | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const sentHere = useRef(new Set<string>());
  const saved = useRef(false);
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
      if (!saved.current) for (const f of sentHere.current) dropPhoto(ledger.id, f);
    };
  }, []);
  // why a photo didn't go: said in the photos' sheet while that is open (a toast would be under
  // it, out of reach), as a toast otherwise
  const [photoNote, setPhotoNote] = useState<{ word: Word; text: string } | null>(null);
  const sheetOpen = useRef(false);
  sheetOpen.current = photos;
  const tell = (word: Word, fill?: Record<string, string>) => {
    const text = say(lang, word, fill);
    if (sheetOpen.current) return setPhotoNote({ word, text });
    toast(text, { tone: "warning", ...(word === "photoSignIn" ? { action: { label: say(lang, "signIn"), onClick: () => openSignIn() } } : {}) });
  };
  // Reading a receipt: the first one sent while there is no amount yet goes to the server, which has
  // Google read what was paid; that fills the amount, its currency, an empty note, and the tip and tax
  // in it, for the person to check. Said under the amount: being read, read (until the amount is
  // changed), or nothing read (until a key is pressed). What was typed meanwhile is never replaced.
  const [reading, setReading] = useState<"busy" | "none" | null>(null);
  /** what the reading put in, as "<currency> <amount>": while the draft still says it, it says where it came from */
  const [fromReceipt, setFromReceipt] = useState<string | null>(null);
  /** an amount the reading has just put in: it lights up once as it lands */
  const [justRead, setJustRead] = useState(false);
  const readAsked = useRef(false);
  const draftNow = useRef(draft);
  draftNow.current = draft;
  const fxNow = useRef(fx);
  fxNow.current = fx;
  const readIt = async (file: string) => {
    readAsked.current = true;
    setReading("busy");
    const got = await readPhoto(ledger.id, file);
    if (left.current) return;
    const d = draftNow.current;
    // (not to be had on this page: nothing said, and nothing asked again)
    if (got === "off") return setReading(null);
    // (nothing read: the next photo may say more)
    if (!got) readAsked.current = false;
    if (d.text) return setReading(null);
    if (!got) return setReading("none");
    // (a total the currency can't be, like cents in yen: none)
    const filled = readInto(d, got, ledger, fxNow.current?.rates, Date.now(), dayPicked.current);
    if (!filled) return setReading("none");
    setDraft(filled);
    setFromReceipt(`${filled.currency} ${got.total}`);
    setJustRead(true);
    setReading(null);
  };
  // the photos of one bill (都放在这一笔): each read, then put together when they are one bill (an
  // itemized receipt and the card slip that adds the tip: twins.ts); otherwise the first one read
  const readBill = async (sent: string[]) => {
    readAsked.current = true;
    setReading("busy");
    const got = await Promise.all(sent.map((file) => readPhoto(ledger.id, file)));
    if (left.current) return;
    if (got.includes("off")) return setReading(null);
    const d = draftNow.current;
    if (d.text) return setReading(null);
    const today = localDay(Date.now());
    const read = got.flatMap((g) => {
      const filled = g && g !== "off" ? readInto(d, g, ledger, fxNow.current?.rates, Date.now(), dayPicked.current) : null;
      const said = filled && g && g !== "off" ? saidOf(filled, today, g.time) : null;
      return filled && said ? [{ filled, said }] : [];
    });
    if (!read.length) {
      readAsked.current = false;
      return setReading("none");
    }
    const filled = read.every((r) => sameBill(r.said, read[0].said)) ? read.map((r) => r.filled).reduce(joinBill) : read[0].filled;
    setDraft(filled);
    setFromReceipt(`${filled.currency} ${filled.text}`);
    setJustRead(true);
    setReading(null);
  };
  const pick = async (chosen: File[], oneExpense = false) => {
    setPhotoNote(null);
    // several at once for a new expense with nothing typed or sent yet: an expense each, or all this one's?
    if (chosen.length > 1 && onSeveral && !oneExpense && !editing && !files.length && !sending && !draftNow.current.text) {
      setSeveral(chosen);
      return;
    }
    const room = MAX_FILES - files.length - sending;
    if (chosen.length > room) tell("photoMax");
    // (said to be one bill's photos: read together once they have all gone)
    const together = oneExpense && chosen.length > 1;
    const sent: string[] = [];
    for (const file of chosen.slice(0, Math.max(0, room))) {
      // a photo that is going to be read: being read from the moment it goes, not once it has got
      // there (the scan starts as the camera closes); put back if it doesn't go, or nobody waits for it
      const toRead = !readAsked.current && !draftNow.current.text && !editing && readingOn(ledger.id);
      if (toRead) setReading("busy");
      setSending((n) => n + 1);
      const got = await sendPhoto(ledger.id, file);
      setSending((n) => n - 1);
      // (the screen closed while it went: nothing will keep it)
      if (got.ok && left.current) {
        dropPhoto(ledger.id, got.file);
        continue;
      }
      if (!got.ok) {
        if (toRead && !together) setReading(null);
        tell(TROUBLE_WORD[got.trouble]);
        continue;
      }
      sentHere.current.add(got.file);
      setFiles((f) => [...f, got.file]);
      if (together) sent.push(got.file);
      else if (!readAsked.current && !draftNow.current.text && !editing) void readIt(got.file);
      else if (toRead) setReading(null);
      // filling up: said once, until the account is under it again
      try {
        const who = account?.id ?? "";
        if (got.used < WARN_AT) localStorage.removeItem(WARNED);
        else if (localStorage.getItem(WARNED) !== who) {
          localStorage.setItem(WARNED, who);
          tell("photoWarn", { used: megabytes(got.used) });
        }
      } catch {
        // a phone that keeps nothing says it each time it is over
      }
    }
    if (together) {
      if (sent.length && !left.current && !readAsked.current && !draftNow.current.text && !editing && readingOn(ledger.id)) void readBill(sent);
      else setReading((r) => (r === "busy" ? null : r));
    }
  };
  // the camera straight away when there is nothing to look at first; otherwise the photos
  const pressPhoto = () => (files.length || sending || !signedIn ? setPhotos(true) : picker.current?.click());
  // 登录 in the photos' sheet: the sheet gives way to the site's sign-in (which is drawn under any
  // sheet still open), and comes back once someone is signed in anew; closed without that, it doesn't
  const backAfter = useRef<{ was: typeof account } | null>(null);
  useEffect(() => {
    const wanted = backAfter.current;
    if (!wanted || signInOpen) return;
    backAfter.current = null;
    if (signedIn && account && account !== wanted.was) setPhotos(true);
  }, [account, signedIn, signInOpen]);
  const signInFromSheet = () => {
    backAfter.current = { was: account };
    setPhotos(false);
    setPhotoNote(null);
    openSignIn();
  };

  const type = (k: Key) => {
    setReading((r) => (r === "none" ? null : r));
    setJustRead(false);
    setDraft((d) => {
      // amounts being added up go on from where they were, while they still come to the amount
      const dec = decimalsOf(d.currency);
      const now = press(d.terms !== undefined && totalOf(d.terms, dec) === d.text ? d.terms : d.text, k, dec);
      return now.includes("+") ? { ...d, terms: now, text: totalOf(now, dec) } : { ...d, terms: undefined, text: now };
    });
  };

  // Today's rates are asked for while the currency is being picked, the rate looked at, or a rate
  // waited for; an expense in the currency and at the rate of the last one asks for nothing.
  const wantsRates = sheet === "currency" || sheet === "rate" || draft.asking;
  const noRates = !!fx && !fx.loading && (fx.error || !fx.rates);
  useEffect(() => {
    if (fx && draft.asking) setDraft((d) => rated(d, ledger, fx.rates, noRates));
  }, [fx, draft.asking]);

  // a real keyboard types the amount too (a computer, or a phone with one attached)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || photos || e.metaKey || e.ctrlKey || e.altKey) return;
      const at = e.target as HTMLElement | null;
      if (at && (at.tagName === "INPUT" || at.tagName === "TEXTAREA")) return;
      if (/^[0-9.+]$/.test(e.key)) type(e.key as Key);
      else if (e.key === "Backspace") type("back");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = () => {
    const to = saying(draft, ledger);
    if (!to || sending) return;
    const id = editing ? editing.id : newId();
    const { paidIn, files: _unsaid, tip, tax, date, merchant, place, payment, category, refund, ...said } = to;
    // a new expense goes as it is recorded here, its turn for the odd cents included: the parts shown are the parts everyone gets
    const done = editing
      ? record(ledger.id, { do: "edit", entry: id, to: { ...to, files: files.length ? files : null } })
      : record(ledger.id, {
          do: "expense",
          expense: { kind: "expense", id, at: Date.now(), ...said, rot, ...(paidIn ? { paidIn } : {}), ...(files.length ? { files } : {}), ...(tip ? { tip } : {}), ...(tax ? { tax } : {}), ...(date ? { date } : {}), ...(merchant ? { merchant } : {}), ...(place ? { place } : {}), ...(payment ? { payment } : {}), ...(category ? { category } : {}), ...(refund ? { refund } : {}) },
        });
    // (refused only when the ledger changed under this screen: someone on another phone got there first)
    if (!done) return toast(say(lang, "notSaved"), { tone: "warning" });
    saved.current = true;
    onSaved(id);
  };

  const shown = typed(draft.text, draft.currency, lang);
  // Paid in another currency, the line under the amount says what it comes to in the ledger's, and
  // at what rate; when it can't, it says why, since that is what keeps 记好了 from being pressed.
  const rate = settled(draft.rate);
  const paid = paidOf(draft);
  // (`more` is what gives way when the two don't fit on the line: the rate, never the amount)
  const comes: { text: string; more?: string; loud?: true } | null = !away
    ? null
    : !rate
      ? draft.asking
        ? { text: say(lang, "rateAsking") }
        : { text: say(lang, "needRate"), loud: true }
      : !paid
        ? { text: `1 ${shortName(draft.currency, lang)} = ${rate} ${shortName(ledger.currency, lang)}` }
        : wrong?.what === "amount"
          ? { text: say(lang, amount === 0 ? "tooLittle" : "tooMuch"), loud: true }
          : { text: say(lang, "comesTo", { amount: money(amount ?? 0, ledger.currency, lang) }), more: say(lang, "rateIs", { rate }) };
  // The line under the amount about the receipt, only when there is no rate to say there instead:
  // being read, nothing read, read. A tip and tax the expense will keep are said there too (just read,
  // or since), and pressing that opens the receipt's sheet, where they can be put right.
  const fresh = fromReceipt === `${draft.currency} ${draft.text}`;
  const extras = extrasOf(draft);
  const extrasSaid = extrasText(extras.tip, extras.tax, draft.currency, lang);
  // (a receipt going and being read while nothing has been typed: its scan is where the amount will
  // be. Something typed stands, and the reading's amount would not go in, so the scan stops there)
  const scanning = reading === "busy" && !draft.text;
  // (and the business it was bought from, before them: what was read is seen at a glance, and the
  // rest of it, the place and what paid, is in the sheet the line opens)
  const aboutSaid = [draft.merchant.trim(), extrasSaid ? say(lang, "withExtras", { extras: extrasSaid }) : ""].filter(Boolean).join(" · ");
  // (once it isn't just read, the business is on the 详情 line: under the amount, only what is in the amount)
  const amountSaid = extrasSaid ? say(lang, "withExtras", { extras: extrasSaid }) : "";
  // just read off a receipt that looks like one already recorded: said in the line's place
  const said = fresh && !comes && !reading ? saidOf(draft, day) : null;
  const twin = said ? twinIn(ledger, said, editing?.id) : null;
  const twinLine = twin
    ? say(lang, "twinSeen", { what: [dayLabel(spentOn(twin), today, lang), twin.merchant, money(twin.paidIn?.amount ?? twin.amount, twin.paidIn?.currency ?? ledger.currency, lang)].filter(Boolean).join(" ") })
    : null;
  // amounts being added up (the keypad's +): each as typed, in the line's place, while they come to the amount
  const sumLine =
    !comes && draft.terms?.includes("+") && totalOf(draft.terms, decimalsOf(draft.currency)) === draft.text
      ? draft.terms
          .split("+")
          .map((t) => (t ? typed(t, draft.currency, lang) : ""))
          .join(" + ")
          .trim()
      : null;
  const readLine = comes || twinLine || sumLine ? null : scanning ? say(lang, "readingReceipt") : reading === "none" ? say(lang, "readNothing") : fresh && !aboutSaid ? say(lang, "readFromReceipt") : null;
  const extrasLine = comes || reading || twinLine || sumLine ? null : fresh && aboutSaid ? say(lang, "readExtras", { what: aboutSaid }) : amountSaid ? amountSaid.charAt(0).toUpperCase() + amountSaid.slice(1) : null;
  // the 详情 line: the day, then what it was for and where and how it was paid, as far as they go
  // (its kind only when one is picked or read: one it would only count as is the sheet's to say)
  const detailsSaid = [draft.note, draft.category ? say(lang, CATEGORY_WORD[draft.category]) : "", draft.merchant, draft.place, draft.payment].map((x) => x.trim()).filter(Boolean).join(" · ");
  // A new expense with nothing typed yet says a receipt can fill it in, where it can be (signed in,
  // the ledger on the server, and nothing has said reading isn't to be had here): the line opens the
  // camera, as the button at the end of the note's line does. A key pressed, and it gives way.
  const hint = !editing && !draft.text && !comes && !readLine && !extrasLine && !reading && !files.length && !sending && signedIn && readingOn(ledger.id);
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
          <>
            {/* what the amount is typed in; it opens the currencies */}
            <span className={editing ? "split-currency" : "split-currency split-bar-inset"}>
              <Button tone="quiet" size="sm" onClick={() => setSheet("currency")}>
                <span className="ui-visually-hidden">{say(lang, "currency")} </span>
                {shortName(draft.currency, lang)}
                <ChevronDown aria-hidden="true" />
              </Button>
            </span>
            {editing && (
              <Button
                tone="icon"
                icon={Trash2}
                label={say(lang, "deleteExpense")}
                onClick={() => {
                  record(ledger.id, { do: "out", entry: editing.id, at: Date.now() });
                  onDeleted(editing.id);
                }}
              />
            )}
          </>
        }
      />
      <div className="split-add-main">
        <div className={`split-add-amount${comes ? " is-abroad" : sumLine || readLine || twinLine || extrasLine || hint ? " is-read" : ""}${scanning ? " is-scanning" : ""}`}>
          <output
            className={`split-figure ${sizeClass(shown)}${draft.text ? "" : " is-empty"}${justRead && fresh ? " is-just-read" : ""}`}
            aria-label={say(lang, "amount")}
            onAnimationEnd={() => setJustRead(false)}
          >
            {shown}
          </output>
          {scanning && <Scanning currency={draft.currency} lang={lang} />}
          {comes && (
            // the whole block answers the tap: the line alone would be too thin a thing to press
            <button type="button" className={`split-add-comes${comes.loud ? " is-loud" : ""}`} onClick={() => setSheet("rate")}>
              <span>
                {comes.loud && <CircleAlert aria-hidden="true" />}
                <span>{comes.text}</span>
                {comes.more && <span className="split-add-comes-more">· {comes.more}</span>}
                <span className="ui-visually-hidden"> {say(lang, "changeRate")}</span>
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          )}
          {sumLine && <p className="split-add-read split-add-sum">{sumLine}</p>}
          {readLine && <p className="split-add-read">{readLine}</p>}
          {twinLine && (
            <p className="split-add-read is-twin">
              <CircleAlert aria-hidden="true" />
              <span>{twinLine}</span>
            </p>
          )}
          {extrasLine && (
            // (like the rate's line: the whole block answers the tap, the line at its foot)
            <button type="button" className="split-add-extras" onClick={() => setSheet("details")}>
              <span>
                <span>{extrasLine}</span>
                <span className="ui-visually-hidden"> {say(lang, "changeDetails")}</span>
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          )}
          {hint && (
            // (like the rate's line: the whole block answers the tap, the line at its foot)
            <button type="button" className="split-add-hint" onClick={pressPhoto}>
              <span>
                <Camera aria-hidden="true" />
                <span>{say(lang, "readHint")}</span>
              </span>
            </button>
          )}
        </div>
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
          {/* 详情: the day, what it was for, where and how it was paid (all in its sheet); its receipt photos at the end of the line */}
          <div className="split-note-row">
            <button type="button" className="split-field split-details-line" onClick={() => setSheet("details")}>
              <span>{say(lang, "details")}</span>
              <strong>
                <span className="split-details-said">
                  {dayLabel(day, today, lang)}
                  {detailsSaid ? ` · ${detailsSaid}` : <span className="split-details-empty"> · {say(lang, "noteHint")}</span>}
                </span>
              </strong>
              <ChevronRight aria-hidden="true" />
            </button>
            <PhotoButton ledger={ledger.id} files={files} sending={sending > 0} scanning={scanning} lang={lang} onPress={pressPhoto} />
            <PhotoPicker input={picker} onPick={(chosen) => void pick(chosen)} />
          </div>
        </div>
        <span className="ui-visually-hidden" role="status">
          {off || (comes?.loud ? comes.text : sending ? say(lang, "photoSending") : (readLine ?? twinLine ?? (fresh && extrasLine ? extrasLine : "")))}
        </span>
      </div>
      <div className="split-dock">
        <Keypad onKey={type} decimals={decimalsOf(draft.currency)} lang={lang} />
        <Button size="lg" block disabled={!!wrong || sending > 0} onClick={save}>
          {say(lang, editing ? "saveChanges" : "done")}
        </Button>
      </div>
      <PayerSheet open={sheet === "payer"} onClose={() => setSheet(null)} ledger={ledger} me={me} lang={lang} value={draft.payer} onPick={(payer) => setDraft({ ...draft, payer })} />
      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} ledger={ledger} me={me} lang={lang} decimals={decimals} rot={rot} draft={draft} onChange={setDraft} />
      <CurrencySheet open={sheet === "currency"} onClose={() => setSheet(null)} ledger={ledger} lang={lang} value={draft.currency} onPick={(currency) => setDraft((d) => payIn(d, currency, ledger, fx?.rates, Date.now()))} />
      <RateSheet open={sheet === "rate" && away} onClose={() => setSheet(null)} ledger={ledger} lang={lang} draft={draft} fx={fx} onChange={setDraft} />
      <DetailsSheet
        open={sheet === "details"}
        onClose={() => setSheet(null)}
        lang={lang}
        draft={draft}
        day={day}
        today={today}
        onDay={(date) => {
          dayPicked.current = true;
          setDraft((d) => ({ ...d, date }));
        }}
        onExtras={(to) => setDraft((d) => ({ ...d, ...to }))}
        onLines={(to) => setDraft((d) => ({ ...d, ...to }))}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        onKind={(category) => setDraft((d) => ({ ...d, category }))}
      />
      {/* several photos chosen at once: an expense each (几张小票), or all of them this one's */}
      <Sheet open={!!several} onClose={() => setSeveral(null)} lang={lang} category="tool" title={say(lang, "severalTitle", { n: several?.length ?? 0 })}>
        <div className="split-form">
          <p className="split-note">{say(lang, "severalLead")}</p>
          <Button
            block
            onClick={() => {
              const chosen = several ?? [];
              setSeveral(null);
              onSeveral?.(chosen);
            }}
          >
            {say(lang, "severalApart", { n: several?.length ?? 0 })}
          </Button>
          <Button
            tone="quiet"
            block
            onClick={() => {
              const chosen = several ?? [];
              setSeveral(null);
              void pick(chosen, true);
            }}
          >
            {say(lang, "severalOne")}
          </Button>
        </div>
      </Sheet>
      {wantsRates && <TodaysRates onChange={setFx} />}
      <PhotosSheet
        open={photos}
        onClose={() => {
          setPhotos(false);
          setPhotoNote(null);
        }}
        ledger={ledger.id}
        files={files}
        sending={sending > 0}
        // (the server said the sign-in has run out: as signed out, with 登录)
        signedIn={signedIn && photoNote?.word !== "photoSignIn"}
        note={photoNote?.text ?? null}
        lang={lang}
        onPick={(chosen) => void pick(chosen)}
        onRemove={(f) => {
          setFiles((now) => now.filter((x) => x !== f));
          // (sent from here and never saved: nothing can bring it back, so it goes now)
          if (sentHere.current.delete(f)) dropPhoto(ledger.id, f);
        }}
        onSignIn={signInFromSheet}
      />
    </div>
  );
}

/**
 * A receipt going and being read: where the amount will be is a scanner's window for that while.
 * Four corners of the light frame it, a band of the light sweeps down through it, and the digits of
 * an amount roll there until the reading comes back (Steve, 2026-11-18: 看起来有科技感). Screen
 * readers hear the line under it instead. With reduced motion nothing sweeps or rolls: the corners
 * stand round the amount as it is.
 */
function Scanning({ currency, lang }: { currency: string; lang: Lang }) {
  // an amount's shape in this currency: its sign, and digits where the read ones will go
  const shape = typed(decimalsOf(currency) ? "88.88" : "8888", currency, lang);
  let n = 0;
  return (
    <span className={`split-figure split-scan ${sizeClass(shape)}`} aria-hidden="true">
      {[...shape].map((c, i) =>
        /\d/.test(c) ? (
          // a digit's room (sized by an 8 no one sees), and the ten digits rolling through it, each
          // starting somewhere else
          <span key={i} className="split-scan-digit">
            <span>8</span>
            <span>{ROLL[n++ % ROLL.length]}</span>
          </span>
        ) : (
          c
        ),
      )}
    </span>
  );
}
const ROLL = [0, 7, 3, 5, 1, 9].map((k) => Array.from({ length: 10 }, (_, j) => (k + j) % 10).join("\n"));

/** What it was paid in: the ledger's own currency first, then the site's others. One tap picks and closes. */
function CurrencySheet({ open, onClose, ledger, lang, value, onPick }: { open: boolean; onClose: () => void; ledger: Ledger; lang: Lang; value: string; onPick: (currency: string) => void }) {
  const codes = [ledger.currency, ...CURRENCIES.map((c) => c.code).filter((c) => c !== ledger.currency)];
  return (
    <Sheet open={open} onClose={onClose} lang={lang} category="tool" title={say(lang, "paidInTitle")}>
      <div className="split-form">
        <div className="split-pills" role="group" aria-label={say(lang, "paidInTitle")}>
          {codes.map((code) => (
            // the light is on the one that is chosen, and only there (as where a ledger's own currency is chosen)
            <Pill
              key={code}
              kind="toggle"
              tone={value === code ? "tool" : "neutral"}
              selected={value === code}
              onToggle={() => {
                onPick(code);
                onClose();
              }}
            >
              {shortName(code, lang)}
            </Pill>
          ))}
        </div>
        <p className="split-note">{say(lang, "paidInNote", { currency: shortName(ledger.currency, lang) })}</p>
      </div>
    </Sheet>
  );
}

/** A day as a rate's date is said: "11月10日", "Nov 10". */
const dayOf = (at: number, lang: Lang) => new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-CA", { month: "short", day: "numeric" }).format(at);
/** Rates are a day's: older than a day and a half, they are called by their date, not "today's". */
const STALE = 36 * 60 * 60 * 1000;

/** The rate for this expense: typed, or today's, or the last one's. What the amount comes to shows as it changes. */
function RateSheet({ open, onClose, ledger, lang, draft, fx, onChange }: { open: boolean; onClose: () => void; ledger: Ledger; lang: Lang; draft: Draft; fx: FxState | null; onChange: (d: Draft) => void }) {
  const rate = settled(draft.rate);
  const today = todaysRate(fx?.rates, draft.currency, ledger.currency);
  const last = lastPaidIn(ledger, draft.currency)?.rate ?? "";
  const paid = paidOf(draft);
  const amount = amountOf(draft, ledger);
  const set = (to: string) => onChange({ ...draft, rate: to, asking: false });
  const status = rate
    ? paid && amount !== null
      ? say(lang, "comesToFrom", { paid: money(paid, draft.currency, lang), amount: money(amount, ledger.currency, lang) })
      : ""
    : !fx || fx.loading
      ? say(lang, "rateAsking")
      : today
        ? say(lang, "rateType")
        : say(lang, "rateNone");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "rate")}
      footer={
        <Button block onClick={onClose}>
          {say(lang, "ok")}
        </Button>
      }
    >
      <div className="split-form">
        <div className="split-rate">
          <span aria-hidden="true">1 {shortName(draft.currency, lang)} =</span>
          <span className="field">
            <input
              inputMode="decimal"
              value={draft.rate}
              onChange={(e) => set(asRateText(e.target.value))}
              onKeyDown={doneLeaves}
              placeholder={today || "0"}
              aria-label={say(lang, "rateFor", { from: currencyName(draft.currency, lang), to: currencyName(ledger.currency, lang) })}
              aria-describedby="split-rate-note"
              autoComplete="off"
              enterKeyHint="done"
            />
          </span>
          <span aria-hidden="true">{shortName(ledger.currency, lang)}</span>
        </div>
        {(status || rate) && (
          <p className={`split-note${rate ? "" : " is-off"}`} id="split-rate-note" role="status">
            {status}
          </p>
        )}
        {((today && today !== rate) || (last && last !== rate && last !== today)) && (
          <div className="split-rate-picks">
            {today && today !== rate && (
              <Button tone="quiet" size="sm" onClick={() => set(today)}>
                {fx && Date.now() - fx.at > STALE ? say(lang, "useDated", { date: dayOf(fx.at, lang), rate: today }) : say(lang, "useToday", { rate: today })}
              </Button>
            )}
            {last && last !== rate && last !== today && (
              <Button tone="quiet" size="sm" onClick={() => set(last)}>
                {say(lang, "useLast", { rate: last })}
              </Button>
            )}
          </div>
        )}
        <p className="split-note">{say(lang, "rateKeeps")}</p>
      </div>
    </Sheet>
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

/**
 * 详情: what it was for (the note), the day it was spent (the phone's own date picker; no day after
 * today), where it was bought and how it was paid (the business, the place, what paid: read off its
 * receipt, or typed, each may stay empty), and the tip and tax in what was paid, in the currency it
 * was paid in, to type or put right. Says when together they come to more than the expense, so they
 * won't be kept.
 */
function DetailsSheet({
  open,
  onClose,
  lang,
  draft,
  day,
  today,
  onDay,
  onExtras,
  onLines,
  onNote,
  onKind,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  draft: Draft;
  day: string;
  today: string;
  onDay: (day: string) => void;
  onExtras: (to: { tip?: string; tax?: string }) => void;
  onLines: (to: Partial<Pick<Draft, Detail>>) => void;
  onNote: (note: string) => void;
  onKind: (kind: Category | null) => void;
}) {
  const over = extrasOver(draft);
  const guess = guessed(draft);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "details")}
      footer={
        <Button block onClick={onClose}>
          {say(lang, "ok")}
        </Button>
      }
    >
      <div className="split-details">
        <label className="split-field">
          <span>{say(lang, "note")}</span>
          <input value={draft.note} onChange={(e) => onNote(e.target.value)} maxLength={NOTE_MAX} placeholder={say(lang, "noteHint")} enterKeyHint="next" autoComplete="off" />
        </label>
        <label className="split-field">
          <span>{say(lang, "spentDay")}</span>
          <input type="date" value={day} min="2000-01-01" max={today} onChange={(e) => isDay(e.target.value) && e.target.value <= today && onDay(e.target.value)} />
        </label>
        {/* where it was bought and how it was paid: read off its receipt, or typed; each may stay empty */}
        {DETAILS.map((k) => (
          <label key={k} className="split-field">
            <span>{say(lang, LINE_WORDS[k][0])}</span>
            <input value={draft[k]} onChange={(e) => onLines({ [k]: e.target.value })} maxLength={DETAIL_MAX} placeholder={say(lang, LINE_WORDS[k][1])} enterKeyHint="next" autoComplete="off" />
          </label>
        ))}
        {/* 分类: one of the seven, or none (then its words say which it counts as, kinds.ts); the one picked is let go with a second tap */}
        <div className="split-kinds" role="group" aria-labelledby="split-kinds-head">
          <h3 className="split-subhead" id="split-kinds-head">
            {say(lang, "category")}
          </h3>
          <div className="split-pills">
            {CATEGORIES.map((k) => (
              <Pill key={k} kind="toggle" tone={draft.category === k ? "tool" : "neutral"} selected={draft.category === k} icon={KIND_ICONS[k]} onToggle={(on) => onKind(on ? k : null)}>
                {say(lang, CATEGORY_WORD[k])}
              </Pill>
            ))}
          </div>
          <p className="split-note">{draft.category ? say(lang, "categoryUnpick") : say(lang, guess ? "categoryGuess" : "categoryNone", { kind: say(lang, CATEGORY_WORD[guess ?? "other"]) })}</p>
        </div>
        <div className="split-extras">
          <h3 className="split-subhead">{say(lang, "extrasHead", { currency: lang === "zh" ? currencyName(draft.currency, lang) : draft.currency })}</h3>
          {(["tip", "tax"] as const).map((k) => (
            <label key={k} className="split-field">
              <span>{say(lang, k === "tip" ? "extrasTip" : "extrasTax")}</span>
              <input
                value={draft[k]}
                onChange={(e) => onExtras({ [k]: asAmountText(e.target.value, decimalsOf(draft.currency)) })}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                placeholder={money(0, draft.currency, lang)}
              />
            </label>
          ))}
          {over && (
            <p className="split-note is-off" role="status">
              <CircleAlert aria-hidden="true" />
              {say(lang, "extrasOver")}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** The names of the business, place and what-paid lines in the sheet, and what each says while empty. */
const LINE_WORDS: Record<Detail, [Word, Word]> = { merchant: ["merchant", "merchantHint"], place: ["place", "placeHint"], payment: ["paidWith", "paidWithHint"] };

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
  const amount = amountOf(draft, ledger);
  const wrong = draftProblem(draft, ledger);
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
        ? say(lang, wrong?.what === "rate" ? "needRate" : "typeAmountFirst")
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
      {/* paid in another currency: the parts under here are in the ledger's, so say what they are parts of */}
      {abroad(draft, ledger) && !!amount && <p className="split-note split-shared-on">{say(lang, "sharedOn", { amount: money(amount, ledger.currency, lang) })}</p>}
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
