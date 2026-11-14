/**
 * The ledger's ⋯ sheet: everything that isn't one of the three screens. Whether the ledger is in
 * step with the server, the people (who is who, adding and renaming) in a sheet of their own, the
 * ledger's name, the language, and deleting the ledger.
 */
import { ChevronRight, CircleAlert, CloudCheck, CloudOff, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LangTab } from "../components/TopBar";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Face } from "./AddExpense";
import { MAX_MEMBERS, type Ledger } from "./core";
import { InviteSheet } from "./Join";
import { inAnyEntry, LEDGER_NAME_MAX, NAME_MAX, nameTaken, tidy } from "./ops";
import { newId, setMe } from "./store";
import { forget, record } from "./syncing";
import { say } from "./words";

type MenuProps = {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  me: string | undefined;
  lang: Lang;
  /** what there is to say about the ledger and the server (lines.ts, syncLine); null when the two are in step */
  status: { text: string; loud: boolean } | null;
  /** the key that opens the ledger, for the invitation; and whether the server has the ledger yet */
  inviteKey: string;
  made: boolean;
  onDeleted: () => void;
};

export function LedgerMenu({ open, onClose, ledger, me, lang, status, inviteKey, made, onDeleted }: MenuProps) {
  const [people, setPeople] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState(ledger.name);
  const [deleting, setDeleting] = useState(false);
  // every time it opens, it opens with the ledger's current name and nothing half-decided
  useEffect(() => {
    if (!open) return;
    setName(ledger.name);
    setDeleting(false);
  }, [open, ledger.name]);

  const renamed = tidy(name, LEDGER_NAME_MAX);
  return (
    <>
      <Sheet open={open} onClose={onClose} lang={lang} category="tool" title={ledger.name}>
        <div className="split-form">
          {/* the page says nothing while all is well; here, asked for, it says so */}
          <p className={`split-sync${status?.loud ? " is-loud" : ""}`}>
            {!status ? <CloudCheck aria-hidden="true" /> : status.loud ? <CircleAlert aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
            {status?.text ?? say(lang, "synced")}
          </p>
          <button
            type="button"
            className="split-field split-menu-row"
            onClick={() => {
              onClose();
              setInviting(true);
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
          <div className="split-setting">
            <span className="field-label">{say(lang, "language")}</span>
            <LangTab />
          </div>
          {deleting ? (
            <div className="split-ask" role="alert">
              <p>{say(lang, "deleteAsk")}</p>
              <div className="split-pair">
                <Button tone="quiet" onClick={() => setDeleting(false)}>
                  {say(lang, "keep")}
                </Button>
                <Button
                  tone="danger"
                  onClick={() => {
                    forget(ledger.id);
                    onDeleted();
                  }}
                >
                  {say(lang, "deleteYes")}
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="split-field split-menu-row" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden="true" />
              <strong>{say(lang, "deleteLedger")}</strong>
            </button>
          )}
        </div>
      </Sheet>
      <Sheet open={people} onClose={() => setPeople(false)} lang={lang} category="tool" title={say(lang, "members")}>
        <People ledger={ledger} me={me} lang={lang} />
      </Sheet>
      <InviteSheet open={inviting} onClose={() => setInviting(false)} ledger={ledger} inviteKey={inviteKey} ready={made} lang={lang} />
    </>
  );
}

/**
 * Who is in the ledger. At rest a line is a name. Opened, it is that person's name to change, "this
 * is me", and taking them off the ledger (only someone no entry names yet, and never the last two).
 */
function People({ ledger, me, lang }: { ledger: Ledger; me: string | undefined; lang: Lang }) {
  const [next, setNext] = useState("");
  /** whose line is open, and their name as it is being typed */
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const fresh = tidy(next, NAME_MAX);
  const taken = !!fresh && nameTaken(ledger, fresh);
  const full = ledger.members.length >= MAX_MEMBERS;
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
                        setMe(ledger.id, m.id);
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
