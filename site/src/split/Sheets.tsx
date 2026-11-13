/**
 * The ledger's ⋯ sheet: everything that isn't one of the three screens. The people (who is who,
 * adding and renaming) in a sheet of their own, the ledger's name, the language, and deleting the
 * ledger.
 */
import { ChevronRight, Pencil, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LangTab } from "../components/TopBar";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Face } from "./AddExpense";
import { MAX_MEMBERS, type Ledger } from "./core";
import { addMember, inAnyEntry, LEDGER_NAME_MAX, NAME_MAX, nameTaken, removeMember, renameLedger, renameMember, tidy } from "./ops";
import { change, dropLedger, newId, setMe } from "./store";
import { say } from "./words";

export function LedgerMenu({ open, onClose, ledger, me, lang, onDeleted }: { open: boolean; onClose: () => void; ledger: Ledger; me: string | undefined; lang: Lang; onDeleted: () => void }) {
  const [people, setPeople] = useState(false);
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
              if (renamed && renamed !== ledger.name) change(ledger.id, (l) => renameLedger(l, renamed));
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
                    dropLedger(ledger.id);
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
                  if (to !== m.name) change(ledger.id, (l) => renameMember(l, m.id, to));
                  setOpen(null);
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
                          change(ledger.id, (l) => removeMember(l, m.id));
                          setOpen(null);
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
          change(ledger.id, (l) => addMember(l, { id: newId(), name: fresh }));
          setNext("");
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
