/**
 * Getting someone else into a ledger, both ends of it. The one who is in sends an invitation: a
 * QR code to scan across the table, and the link to paste into the group chat (invite.ts). The
 * one who opens it is asked one thing, once: which of the people in the ledger they are.
 */
import { Check, ChevronRight, Copy, Share2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { Lang } from "../i18n";
import { savedName } from "../online/config";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Face } from "./AddExpense";
import { MAX_MEMBERS, type Ledger } from "./core";
import { inviteLink, inviteText, qrPath } from "./invite";
import { NAME_MAX, nameTaken, tidy } from "./ops";
import { copyText, Sentences } from "./parts";
import { newId } from "./store";
import { iAm, record } from "./syncing";
import { say } from "./words";

type InviteProps = {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  /** the key that opens the ledger */
  inviteKey: string;
  /** the server has the ledger (one started with no signal can't be joined until it has) */
  ready: boolean;
  lang: Lang;
  /** opened by the ledger's owner to change the key, which makes every invitation sent so far stop working: asked about first */
  change?: boolean;
  /** a new key is on its way to the server: until it is there, there is no link to show */
  changing?: boolean;
  /** nothing has answered lately (so the new key is waiting for a signal) */
  away?: boolean;
  onRekey?: () => void;
};

/**
 * The invitation, to show and to send. Its owner can also open this sheet to change it: that is
 * asked about first (it shuts out everyone who came in by the old one until they have the new),
 * then the sheet waits for the server, and shows the new code and link, ready to send.
 */
export function InviteSheet({ open, onClose, ledger, inviteKey, ready, lang, change, changing, away, onRekey }: InviteProps) {
  const link = inviteLink(window.location.origin, ledger.id, inviteKey);
  /** the ledger's key when the owner said yes to changing it, on this sheet: once the key is another one, it is done */
  const [was, setWas] = useState<string | null>(null);
  // Each time it opens it starts over: nothing said yes to, nothing just done. (Before it is
  // drawn, so last time's doesn't show for a moment; and not when it closes, so what it says
  // doesn't change while it slides away.)
  useLayoutEffect(() => {
    if (open) setWas(null);
  }, [open]);
  /** "change the link?" is on the sheet, in place of the invitation, until its owner has answered */
  const asking = !!change && was === null;
  const changed = was !== null && !changing && inviteKey !== was;
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
      title={say(lang, asking || changing ? "rekey" : "inviteTitle")}
      footer={
        !ready || asking || changing ? undefined : canShare ? (
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
      {changing ? (
        <p className="split-invite-who" role="status">
          {say(lang, away ? "rekeyWaiting" : "rekeying")}
        </p>
      ) : asking ? (
        <div className="split-ask" role="alert">
          <p>
            <Sentences text={say(lang, "rekeyAsk")} lang={lang} />
          </p>
          <div className="split-pair">
            <Button tone="quiet" onClick={onClose}>
              {say(lang, "rekeyNo")}
            </Button>
            <Button
              onClick={() => {
                setWas(inviteKey);
                onRekey?.();
              }}
            >
              {say(lang, "rekeyYes")}
            </Button>
          </div>
        </div>
      ) : ready ? (
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
          {/* just changed: said in the place of the fine line, which the owner has read before */}
          {changed ? (
            <p className="split-invite-done" role="status">
              <Check aria-hidden="true" />
              {say(lang, "rekeyDone")}
            </p>
          ) : (
            <p className="split-invite-who">{say(lang, "inviteWho")}</p>
          )}
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
  // (a locked ledger takes nobody new: whoever is in it can still say which one they are)
  const locked = ledger.locked !== undefined;
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
            <button type="button" className="split-person" onClick={() => iAm(ledger.id, m.id)}>
              <Face name={m.name} />
              <span className="split-person-name">{m.name}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {locked && <p className="split-note">{say(lang, "whoLocked")}</p>}
      <form
        hidden={locked}
        onSubmit={(e) => {
          e.preventDefault();
          if (!fresh || taken || full || locked) return;
          const member = newId();
          // (refused only when another phone took the name or the last place a moment ago: the note under the field says which)
          if (record(ledger.id, { do: "member", member: { id: member, name: fresh } })) iAm(ledger.id, member);
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
