// What the phones and the server say to each other. Every address is under /split/api.
//
//   POST /split/api/ledgers                 make a ledger            MakeBody → Snapshot (201; 200 when it was made already)
//   GET  /split/api/ledgers/<id>            the ledger as it stands  → Snapshot
//   GET  /split/api/ledgers/<id>?since=<n>  the record after change n → Since
//   POST /split/api/ledgers/<id>/changes    send changes             PushBody → Pushed
//   GET  /split/api/ledgers/<id>/live       a WebSocket: the ledger now, and again whenever it changes (Push)
//
// Every request carries the key from the invitation link in the KEY_HEADER. A browser can't put a
// header on a WebSocket, so the live connection gives it as its second protocol name, after
// LIVE_PROTOCOL. Neither ever goes in an address, so it is in no log.
import type { Sent, Took } from "../../../../site/src/split/changes";
import type { Ledger, Member } from "../../../../site/src/split/core";
import type { ErrorCode, Logged, Snapshot } from "./ledger";

export const KEY_HEADER = "x-split-key";
/** A key as phones make them: 32 random bytes written in letters, digits, - and _ (43 of them); a little shorter or longer is taken too. */
export const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/;
export const LIVE_PROTOCOL = "split.v1";

export type MakeBody = { id: string; name: string; currency: string; members: Member[] };
export type PushBody = { changes: Sent[] };
export type Pushed = Snapshot & { took: Took[] };
export type Since = { seq: number; changes: Logged[] };
export type { Snapshot };

/** "limit": this network has made today's allowance of ledgers. "notfound": no such address. */
export type ApiError = { error: ErrorCode | "limit" | "notfound" };

/** What the live connection sends: the whole ledger, and the number of its last change. */
export type Push = { t: "ledger"; seq: number; ledger: Ledger };
