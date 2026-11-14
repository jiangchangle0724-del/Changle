/**
 * Getting someone else into a ledger, both ends of it. The one who is in sends an invitation: a
 * QR code to scan across the table, and the link to paste into the group chat (invite.ts). The
 * one who opens it is asked one thing, once: which of the people in the ledger they are.
 */
import { Check, ChevronRight, Copy, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "../i18n";
import { savedName } from "../online/config";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Face } from "./AddExpense";
import { MAX_MEMBERS, type Ledger } from "./core";
import { inviteLink, inviteText, qrPath } from "./invite";
import { NAME_MAX, nameTaken, tidy } from "./ops";
import { copyText, Sentences } from "./parts";
import { newId, setMe } from "./store";
import { record } from "./syncing";
import { say } from "./words";

/**
 * The invitation, to show and to send. `inviteKey` is the key that opens the ledger; `ready` is
 * whether the server has the ledger yet (one started with no signal can't be joined until it has).
 */
export function InviteSheet({ open, onClose, ledger, inviteKey, ready, lang }: { open: boolean; onClose: () => void; ledger: Ledger; inviteKey: string; ready: boolean; lang: Lang }) {
  const link = inviteLink(window.location.origin, ledger.id, inviteKey);
  // (drawn when the sheet is first wanted, not with every ledger page)
  const qr = useMemo(() => (open && ready ? qrPath(link) : null), [open, ready, link]);
  // "copied" is said on the button itself: a toast would sit behind the open sheet
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => setCopied((await copyText(inviteText(ledger.name, link, lang))) ? "done" : "failed");
  const share = async () => {
    try {
      await navigator.share({ title: ledger.name, text: say(lang, "inviteLine", { name: ledger.name }), url: link });
    } catch {
      // the share sheet was closed
    }
  };
  const copyWord = (plain: "copyInvite" | "copyLink") => say(lang, copied === "done" ? "copied" : copied === "failed" ? (plain === "copyLink" ? "copyNot" : "copyFailed") : plain);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "inviteTitle")}
      footer={
        !ready ? undefined : canShare ? (
          // a phone's own share sheet reaches the chat app in one step; copying is the other way
          <div className="split-pair">
            <Button tone="quiet" icon={copied === "done" ? Check : Copy} onClick={() => void copy()}>
              {copyWord("copyLink")}
            </Button>
            <Button icon={Share2} onClick={() => void share()}>
              {say(lang, "sendInvite")}
            </Button>
          </div>
        ) : (
          <Button size="lg" block icon={copied === "done" ? Check : Copy} onClick={() => void copy()}>
            {copyWord("copyInvite")}
          </Button>
        )
      }
    >
      {ready ? (
        <div className="split-invite">
          {qr && (
            <div className="split-qr">
              <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={say(lang, "qrLabel")} shapeRendering="crispEdges">
                <path d={qr.d} />
              </svg>
            </div>
          )}
          <p>
            <Sentences text={say(lang, "inviteHow")} lang={lang} />
          </p>
          <p className="split-invite-who">{say(lang, "inviteWho")}</p>
          {/* said aloud once; the button keeps a name of its own */}
          <span className="ui-visually-hidden" role="status">
            {copied ? say(lang, copied === "done" ? "copied" : "copyFailed") : ""}
          </span>
        </div>
      ) : (
        <p className="split-invite-who">{say(lang, "inviteNotYet")}</p>
      )}
    </Sheet>
  );
}

/**
 * "Which one are you?", asked of a phone that holds a ledger and doesn't know (it came in by an
 * invitation). It is the page the invitation opens on, before the ledger itself: one tap on a
 * name answers it, and someone the ledger doesn't have yet adds themselves. Whoever only wants a
 * look can have one; the question is asked again the next time the ledger is opened.
 */
export function WhoStep({ ledger, lang, onSkip }: { ledger: Ledger; lang: Lang; onSkip: () => void }) {
  // the name this phone's owner goes by on the site, unless someone in the ledger has it: then it is probably them, a tap away
  const [name, setName] = useState(() => {
    const known = tidy(savedName(), NAME_MAX);
    return known && !nameTaken(ledger, known) ? known : "";
  });
  const fresh = tidy(name, NAME_MAX);
  const taken = !!fresh && nameTaken(ledger, fresh);
  const full = ledger.members.length >= MAX_MEMBERS;
  return (
    <div className="split-who">
      <header className="split-plan-head">
        <h2>{say(lang, "whoTitle")}</h2>
        <p>
          <Sentences text={say(lang, "whoBody")} lang={lang} />
        </p>
      </header>
      <ul className="split-people">
        {ledger.members.map((m) => (
          <li key={m.id}>
            <button type="button" className="split-person" onClick={() => setMe(ledger.id, m.id)}>
              <Face name={m.name} />
              <span className="split-person-name">{m.name}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!fresh || taken || full) return;
          const member = newId();
          // (refused only when another phone took the name or the last place a moment ago: the note under the field says which)
          if (record(ledger.id, { do: "member", member: { id: member, name: fresh } })) setMe(ledger.id, member);
        }}
      >
        <label htmlFor="split-add-me" className="field-label">
          {say(lang, "whoNotListed")}
        </label>
        <span className="field">
          <input id="split-add-me" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder={say(lang, "nameHint")} enterKeyHint="done" autoComplete="off" aria-describedby="split-add-me-note" />
          <Button tone="quiet" size="sm" type="submit" disabled={!fresh || taken || full}>
            {say(lang, "addMe")}
          </Button>
        </span>
        <p className="split-note" id="split-add-me-note" role="status">
          {taken ? say(lang, "nameListed") : full ? say(lang, "full", { n: MAX_MEMBERS }) : ""}
        </p>
      </form>
      <Button tone="quiet" size="sm" onClick={onSkip}>
        {say(lang, "justLook")}
      </Button>
    </div>
  );
}
