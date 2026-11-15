/**
 * 照片空间, from the ⋯ sheet (signed in): how much of the account's 500 MB its photos use, which
 * ledgers they are in (the most first; this phone names the ones it holds), and how many of them no
 * expense uses any more. Those clear themselves after 30 days (改回去 and 恢复 in the record can
 * bring them back until then); here they can be cleared now, asked first. The server is asked each
 * time the sheet opens: the room is the account's, not this phone's.
 */
import { CircleAlert, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { roomNet, type MyRoom } from "./net";
import { megabytes, QUOTA, receiptsLeft, WARN_AT } from "./photos";
import { everyHeld } from "./store";
import { say } from "./words";

/** What the sheet has to show: the room, or that it is being asked for, couldn't be, or needs a sign-in again. */
type Seen = MyRoom | "reading" | "away" | "signin";

export function StorageSheet({ open, onClose, ledger, lang }: { open: boolean; onClose: () => void; ledger: string; lang: Lang }) {
  const { openSignIn } = useAccount();
  const [room, setRoom] = useState<Seen>("reading");
  /** clearing the unused ones: asked about, on its way, or the last time nothing answered */
  const [clearing, setClearing] = useState<"ask" | "busy" | "failed" | null>(null);
  /** the bytes the last clearing freed */
  const [freed, setFreed] = useState<number | null>(null);
  // (only the last question's answer counts: one asked before the sheet opened again is too old)
  const asked = useRef(0);
  const read = async () => {
    const n = ++asked.current;
    setRoom("reading");
    const got = await roomNet.get();
    if (n === asked.current) setRoom(got.data ?? (got.status === 401 ? "signin" : "away"));
  };
  useEffect(() => {
    if (!open) return;
    setClearing(null);
    setFreed(null);
    void read();
  }, [open]);
  const clear = async () => {
    if (typeof room !== "object") return;
    setClearing("busy");
    const got = await roomNet.clear();
    if (!got.data) {
      if (got.status === 401) setRoom("signin");
      return setClearing("failed");
    }
    setFreed(Math.max(0, room.used - got.data.used));
    setRoom(got.data);
    setClearing(null);
  };

  return (
    <Sheet open={open} onClose={onClose} lang={lang} category="tool" title={say(lang, "storage")}>
      {room === "reading" ? (
        <p className="split-note" role="status">
          {say(lang, "storageReading")}
        </p>
      ) : room === "away" ? (
        <div className="split-form">
          <p className="split-sync is-loud" role="alert">
            <CircleAlert aria-hidden="true" />
            {say(lang, "storageAway")}
          </p>
          <Button tone="quiet" icon={RefreshCw} onClick={() => void read()}>
            {say(lang, "retry")}
          </Button>
        </div>
      ) : room === "signin" ? (
        <div className="split-form">
          <p className="split-note">{say(lang, "storageSignIn")}</p>
          {/* (this sheet gives way: the site's sign-in is drawn under any sheet still open) */}
          <Button
            icon={LogIn}
            onClick={() => {
              onClose();
              openSignIn();
            }}
          >
            {say(lang, "signIn")}
          </Button>
        </div>
      ) : (
        <Shown room={room} ledger={ledger} lang={lang} clearing={clearing} freed={freed} onAsk={() => setClearing("ask")} onKeep={() => setClearing(null)} onClear={() => void clear()} />
      )}
    </Sheet>
  );
}

/** The room itself: how much is used, of how much, as a bar too; where the photos are; those no expense uses. */
function Shown({ room, ledger, lang, clearing, freed, onAsk, onKeep, onClear }: { room: MyRoom; ledger: string; lang: Lang; clearing: "ask" | "busy" | "failed" | null; freed: number | null; onAsk: () => void; onKeep: () => void; onClear: () => void }) {
  const names = new Map(everyHeld().map((h) => [h.server.id, h.server.name]));
  const full = room.used >= room.quota;
  // (the bar in thousandths, drawn as long as the room is wide; past the quota it is just full; a
  // little used is still a sliver to be seen)
  const share = room.used > 0 ? Math.max(10, Math.round(Math.min(1, room.used / Math.max(1, room.quota)) * 1000)) : 0;
  const filling = room.used * QUOTA >= room.quota * WARN_AT;
  const left = receiptsLeft(room.used, room.quota);
  const nf = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA");
  return (
    <div className="split-storage">
      <p className="split-storage-used">
        <strong>{megabytes(room.used)} MB</strong>
        <span>{say(lang, "storageUsed", { used: megabytes(room.used), quota: megabytes(room.quota) })}</span>
      </p>
      <div
        className={`split-meter${full ? " is-full" : ""}`}
        role="meter"
        aria-label={say(lang, "storage")}
        aria-valuemin={0}
        aria-valuemax={room.quota}
        aria-valuenow={Math.min(room.used, room.quota)}
        aria-valuetext={say(lang, "storageUsed", { used: megabytes(room.used), quota: megabytes(room.quota) })}
      >
        <svg viewBox="0 0 1000 1" preserveAspectRatio="none" aria-hidden="true">
          <rect width={share} height="1" />
        </svg>
      </div>
      {/* (past 400 MB, and full, in the page's strong voice) */}
      <p className={`split-note${full || filling ? " is-off" : ""}`}>
        {(full || filling) && <CircleAlert aria-hidden="true" />}
        {!room.ledgers.length ? say(lang, "storageNone") : full ? say(lang, "storageFull") : say(lang, "storageLeft", { n: nf.format(left) })}
      </p>
      {room.ledgers.length > 0 && (
        <>
          <h3 className="split-storage-head">{say(lang, "storageWhere")}</h3>
          <ul className="split-storage-ledgers">
            {room.ledgers.map((l) => (
              <li key={l.id}>
                <span>
                  {names.get(l.id) ?? say(lang, "storageElsewhere")}
                  {l.id === ledger && <small>{say(lang, "storageThis")}</small>}
                </span>
                <span>{say(lang, l.count === 1 ? "storageCountOne" : "storageCount", { n: nf.format(l.count), mb: megabytes(l.bytes) })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {room.unused.count > 0 && (
        <div className="split-form">
          <p className="split-note">{say(lang, "storageUnused", { n: nf.format(room.unused.count), mb: megabytes(room.unused.bytes) })}</p>
          {clearing === "ask" || clearing === "busy" ? (
            <div className="split-ask" role="alert">
              <p>{say(lang, "storageClearAsk")}</p>
              <div className="split-pair">
                <Button tone="quiet" onClick={onKeep}>
                  {say(lang, "keep")}
                </Button>
                <Button tone="danger" busy={clearing === "busy"} disabled={clearing === "busy"} onClick={onClear}>
                  {say(lang, "storageClearYes")}
                </Button>
              </div>
            </div>
          ) : (
            <Button tone="quiet" icon={Trash2} onClick={onAsk}>
              {say(lang, "storageClear")}
            </Button>
          )}
        </div>
      )}
      {clearing === "failed" && (
        <p className="split-note is-off">
          <CircleAlert aria-hidden="true" />
          {say(lang, "storageClearFailed")}
        </p>
      )}
      <span className="ui-visually-hidden" role="status">
        {freed !== null ? say(lang, "storageCleared", { mb: megabytes(freed) }) : clearing === "failed" ? say(lang, "storageClearFailed") : ""}
      </span>
      {freed !== null && <p className="split-note">{say(lang, "storageCleared", { mb: megabytes(freed) })}</p>}
    </div>
  );
}
