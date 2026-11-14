/**
 * The ledger's ⋯ sheet: everything that isn't one of the three screens. Whether the ledger is in
 * step with the server, inviting someone, the people (who is who, adding and renaming) in a sheet
 * of their own, the ledger's name, the language, and taking the ledger off this phone (signed in:
 * off my ledgers). On the phone that started the ledger, its owner's three: locking it and opening
 * it again, a new invitation, and deleting it for everyone.
 */
import { ChevronRight, CircleAlert, CloudCheck, CloudOff, ListX, Lock, LockOpen, LogIn, Pencil, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { LangTab } from "../components/TopBar";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Face } from "./AddExpense";
import { MAX_MEMBERS, type Ledger } from "./core";
import { InviteSheet } from "./Join";
import { inAnyEntry, LEDGER_NAME_MAX, NAME_MAX, nameTaken, tidy } from "./ops";
import { newId } from "./store";
import { eraseLedger, iAm, lockLedger, record, rekeyLedger, removeLedger } from "./syncing";
import { say } from "./words";

type MenuProps = {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  me: string | undefined;
  lang: Lang;
  /** what there is to say about the ledger and the server (lines.ts, syncLine); null when the two are in step */
  status: { text: string; loud: boolean; lock?: true } | null;
  /** the key that opens the ledger, for the invitation; and whether the server has the ledger yet */
  inviteKey: string;
  made: boolean;
  /** this phone started the ledger: it can lock it, and change the invitation's key */
  owner: boolean;
  /** a new key for the invitation is on its way to the server */
  changing: boolean;
  /** nothing has answered lately */
  away: boolean;
  /** signed in, and the ledger is in the account's ledgers: taking it off this phone takes it off those */
  mine: boolean;
  /** the ledger couldn't be made because the sign-in had run out: the sheet offers to sign in again */
  signIn: boolean;
  /** off this phone; `erased`: deleted for everyone */
  onDeleted: (erased?: boolean) => void;
};

export function LedgerMenu({ open, onClose, ledger, me, lang, status, inviteKey, made, owner, changing, away, mine, signIn, onDeleted }: MenuProps) {
  const { openSignIn } = useAccount();
  const [people, setPeople] = useState(false);
  /** the invitation's sheet is up: to send it, or (its owner) to change it */
  const [inviting, setInviting] = useState<"send" | "change" | null>(null);
  const [name, setName] = useState(ledger.name);
  /** taking it off: being asked about, on its way to the server, or the last time nothing answered */
  const [deleting, setDeleting] = useState<"ask" | "busy" | "failed" | null>(null);
  /** the owner deleting it for everyone: the same */
  const [erasing, setErasing] = useState<"ask" | "busy" | "failed" | null>(null);
  /** locking or opening: asked and not answered yet; or the last time it was asked, nothing answered */
  const [locking, setLocking] = useState<"busy" | "failed" | null>(null);
  // every time it opens, it opens with the ledger's current name and nothing half-decided
  useEffect(() => {
    if (!open) return;
    setName(ledger.name);
    setDeleting(null);
    setErasing(null);
    setLocking(null);
  }, [open, ledger.name]);
  const remove = async () => {
    setDeleting("busy");
    if (await removeLedger(ledger.id)) onDeleted();
    else setDeleting("failed");
  };
  const erase = async () => {
    setErasing("busy");
    if (await eraseLedger(ledger.id)) onDeleted(true);
    else setErasing("failed");
  };

  const renamed = tidy(name, LEDGER_NAME_MAX);
  const locked = ledger.locked !== undefined;
  const lock = async () => {
    setLocking("busy");
    // (said in the sheet itself when it didn't happen: a toast would sit behind it)
    setLocking((await lockLedger(ledger.id, !locked)) ? null : "failed");
  };
  return (
    <>
      <Sheet open={open} onClose={onClose} lang={lang} category="tool" title={ledger.name}>
        <div className="split-form">
          {/* the page says nothing while all is well; here, asked for, it says so */}
          <p className={`split-sync${status?.loud ? " is-loud" : ""}`}>
            {!status ? <CloudCheck aria-hidden="true" /> : status.lock ? <Lock aria-hidden="true" /> : status.loud ? <CircleAlert aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
            {/* (the page tells its owner where to open a locked ledger: here, that is the line below) */}
            {!status ? say(lang, "synced") : status.lock && !status.loud ? say(lang, "locked") : status.text}
          </p>
          {signIn && (
            <Button tone="quiet" icon={LogIn} onClick={() => openSignIn()}>
              {say(lang, "signIn")}
            </Button>
          )}
          <button
            type="button"
            className="split-field split-menu-row"
            onClick={() => {
              onClose();
              setInviting("send");
            }}
          >
            <UserPlus aria-hidden="true" />
            <strong>{say(lang, "invite")}</strong>
            <span>{say(lang, "inviteVia")}</span>
            <ChevronRight aria-hidden="true" />
          </button>
          <button
            type="button"
            className="split-field split-menu-row"
            onClick={() => {
              onClose();
              setPeople(true);
            }}
          >
            <Users aria-hidden="true" />
            <strong>{say(lang, "members")}</strong>
            <span>{say(lang, "people", { n: ledger.members.length })}</span>
            <ChevronRight aria-hidden="true" />
          </button>
          {/* the owner's two. One tap locks, and the same line opens it again; changing the link is asked about first, on the invitation's own sheet */}
          {owner && made && (
            <>
              <button type="button" className="split-field split-menu-row" disabled={locking === "busy"} onClick={() => void lock()}>
                {locked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
                <strong>{say(lang, locked ? "unlockIt" : "lockIt")}</strong>
                <span>{say(lang, locked ? "unlockItHint" : "lockItHint")}</span>
              </button>
              {locking === "failed" && <p className="split-note">{say(lang, locked ? "unlockFailed" : "lockFailed")}</p>}
              <span className="ui-visually-hidden" role="status">
                {locking === "failed" ? say(lang, locked ? "unlockFailed" : "lockFailed") : ""}
              </span>
              <button
                type="button"
                className="split-field split-menu-row"
                onClick={() => {
                  onClose();
                  setInviting("change");
                }}
              >
                <RefreshCw aria-hidden="true" />
                <strong>{say(lang, "rekey")}</strong>
                <ChevronRight aria-hidden="true" />
              </button>
              {erasing === "ask" || erasing === "busy" ? (
                <div className="split-ask" role="alert">
                  <p>{say(lang, "eraseAsk")}</p>
                  <div className="split-pair">
                    <Button tone="quiet" onClick={() => setErasing(null)}>
                      {say(lang, "keep")}
                    </Button>
                    <Button tone="danger" disabled={erasing === "busy"} onClick={() => void erase()}>
                      {say(lang, "eraseYes")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" className="split-field split-menu-row" onClick={() => setErasing("ask")}>
                  <Trash2 aria-hidden="true" />
                  <strong>{say(lang, "eraseIt")}</strong>
                  <span>{say(lang, "eraseItHint")}</span>
                </button>
              )}
              {erasing === "failed" && <p className="split-note">{say(lang, "eraseFailed")}</p>}
              <span className="ui-visually-hidden" role="status">
                {erasing === "failed" ? say(lang, "eraseFailed") : ""}
              </span>
            </>
          )}
          {/* (a locked ledger keeps its name) */}
          {!locked && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (renamed && renamed !== ledger.name) record(ledger.id, { do: "title", name: renamed });
              }}
            >
              <label htmlFor="split-rename" className="field-label">
                {say(lang, "rename")}
              </label>
              <span className="field">
                <input id="split-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={LEDGER_NAME_MAX} enterKeyHint="done" autoComplete="off" />
                <Button tone="quiet" size="sm" type="submit" disabled={!renamed || renamed === ledger.name}>
                  {say(lang, "save")}
                </Button>
              </span>
            </form>
          )}
          <div className="split-setting">
            <span className="field-label">{say(lang, "language")}</span>
            <LangTab />
          </div>
          {deleting === "ask" || deleting === "busy" ? (
            <div className="split-ask" role="alert">
              <p>{say(lang, mine ? "removeMineAsk" : "deleteAsk")}</p>
              {owner && <p>{say(lang, mine ? "removeMineOwner" : "deleteOwner")}</p>}
              <div className="split-pair">
                <Button tone="quiet" onClick={() => setDeleting(null)}>
                  {say(lang, "keep")}
                </Button>
                <Button tone="danger" disabled={deleting === "busy"} onClick={() => void remove()}>
                  {say(lang, mine ? "removeMineYes" : "deleteYes")}
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="split-field split-menu-row" onClick={() => setDeleting("ask")}>
              {/* (off a list, this phone's or the account's: the bin is for deleting it, for everyone) */}
              <ListX aria-hidden="true" />
              <strong>{say(lang, mine ? "removeMine" : "deleteLedger")}</strong>
            </button>
          )}
          {deleting === "failed" && <p className="split-note">{say(lang, "removeFailed")}</p>}
          <span className="ui-visually-hidden" role="status">
            {deleting === "failed" ? say(lang, "removeFailed") : ""}
          </span>
        </div>
      </Sheet>
      <Sheet open={people} onClose={() => setPeople(false)} lang={lang} category="tool" title={say(lang, "members")}>
        <People ledger={ledger} me={me} lang={lang} />
      </Sheet>
      <InviteSheet open={inviting !== null} onClose={() => setInviting(null)} ledger={ledger} inviteKey={inviteKey} ready={made} lang={lang} change={inviting === "change"} changing={changing} away={away} onRekey={() => rekeyLedger(ledger.id)} />
    </>
  );
}

/**
 * Who is in the ledger. At rest a line is a name. Opened, it is that person's name to change, "this
 * is me", and taking them off the ledger (only someone no entry names yet, and never the last two).
 * In a locked ledger the people are as they are. A line is still there to tap, for "this is me":
 * that is this phone's own business, and changes nothing in the ledger.
 */
function People({ ledger, me, lang }: { ledger: Ledger; me: string | undefined; lang: Lang }) {
  const [next, setNext] = useState("");
  /** whose line is open, and their name as it is being typed */
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const fresh = tidy(next, NAME_MAX);
  const taken = !!fresh && nameTaken(ledger, fresh);
  const full = ledger.members.length >= MAX_MEMBERS;
  const locked = ledger.locked !== undefined;
  if (locked)
    return (
      <div className="split-form">
        <ul className="split-people">
          {ledger.members.map((m) => (
            <li key={m.id}>
              {m.id === me ? (
                <div className="split-person is-still">
                  <Face name={m.name} />
                  <span className="split-person-name">
                    {m.name}
                    <small>{say(lang, "you")}</small>
                  </span>
                </div>
              ) : (
                <button type="button" className="split-person" onClick={() => iAm(ledger.id, m.id)}>
                  <Face name={m.name} />
                  <span className="split-person-name">{m.name}</span>
                  <span className="split-person-part">{say(lang, "thisIsMe")}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="split-note">{say(lang, "lockedPeople")}</p>
      </div>
    );
  return (
    <div className="split-form">
      <ul className="split-people">
        {ledger.members.map((m) => {
          if (open?.id !== m.id)
            return (
              <li key={m.id}>
                <button type="button" className="split-person" onClick={() => setOpen({ id: m.id, name: m.name })}>
                  <Face name={m.name} />
                  <span className="ui-visually-hidden">{`${say(lang, "renamePerson")} `}</span>
                  <span className="split-person-name">
                    {m.name}
                    {m.id === me && <small>{say(lang, "you")}</small>}
                  </span>
                  <Pencil aria-hidden="true" />
                </button>
              </li>
            );
          const to = tidy(open.name, NAME_MAX);
          const clash = !!to && nameTaken(ledger, to, m.id);
          // why this one stays on the ledger, when they do (you yourself always stay, and need no telling)
          const stays = m.id === me ? "" : ledger.members.length <= 2 ? say(lang, "lastTwo") : inAnyEntry(ledger, m.id) ? say(lang, "hasEntries") : "";
          return (
            <li key={m.id}>
              <form
                className="split-person-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!to || clash) return;
                  // (refused only when another phone took the name a moment ago: the line stays open and says so)
                  if (to === m.name || record(ledger.id, { do: "rename", member: m.id, name: to })) setOpen(null);
                }}
              >
                <span className="field">
                  <input value={open.name} onChange={(e) => setOpen({ id: m.id, name: e.target.value })} maxLength={NAME_MAX} aria-label={say(lang, "renamePerson")} enterKeyHint="done" autoComplete="off" autoFocus />
                  <Button tone="quiet" size="sm" type="submit" disabled={!to || clash}>
                    {say(lang, "save")}
                  </Button>
                </span>
                {m.id !== me && (
                  <div className="split-person-acts">
                    <Button
                      tone="quiet"
                      size="sm"
                      onClick={() => {
                        iAm(ledger.id, m.id);
                        setOpen(null);
                      }}
                    >
                      {say(lang, "thisIsMe")}
                    </Button>
                    {!stays && (
                      <Button
                        tone="quiet"
                        size="sm"
                        icon={X}
                        onClick={() => {
                          if (record(ledger.id, { do: "remove", member: m.id })) setOpen(null);
                        }}
                      >
                        {say(lang, "remove", { who: m.name })}
                      </Button>
                    )}
                  </div>
                )}
                {(clash || stays) && (
                  <p className="split-note" role="status">
                    {clash ? say(lang, "nameTaken") : stays}
                  </p>
                )}
              </form>
            </li>
          );
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!fresh || taken || full) return;
          if (record(ledger.id, { do: "member", member: { id: newId(), name: fresh } })) setNext("");
        }}
      >
        <label htmlFor="split-add-person" className="field-label">
          {say(lang, "addPerson")}
        </label>
        <span className="field">
          <input id="split-add-person" value={next} onChange={(e) => setNext(e.target.value)} maxLength={NAME_MAX} placeholder={say(lang, "nameHint")} enterKeyHint="done" autoComplete="off" aria-describedby="split-add-person-note" />
          <Button tone="quiet" size="sm" type="submit" disabled={!fresh || taken || full}>
            {say(lang, "add")}
          </Button>
        </span>
        <p className="split-note" id="split-add-person-note" role="status">
          {taken ? say(lang, "nameTaken") : full ? say(lang, "full", { n: MAX_MEMBERS }) : ""}
        </p>
      </form>
    </div>
  );
}
