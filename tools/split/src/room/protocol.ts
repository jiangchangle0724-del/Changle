// What the phones and the server say to each other. Every address is under /split/api.
//
//   POST /split/api/ledgers                 make a ledger, signed in MakeBody → Snapshot (201; 200 when it was made already)
//   GET  /split/api/ledgers/<id>            the ledger as it stands  → Snapshot
//   GET  /split/api/ledgers/<id>?since=<n>  the record after change n → Since
//   POST /split/api/ledgers/<id>/changes    send changes             PushBody → Pushed
//   GET  /split/api/ledgers/<id>/live       a WebSocket: the ledger now, and again whenever it changes (Push)
//   POST /split/api/ledgers/<id>/key        its owner changes the key            → Snapshot
//   POST /split/api/ledgers/<id>/lock       its owner locks it, or opens it      LockBody → Snapshot
//   DELETE /split/api/ledgers/<id>          its owner deletes it                 → { ok: true }
//
//   GET    /split/api/ledgers/<id>/files         its receipt photos and files      → Files
//   PUT    /split/api/ledgers/<id>/files/<file>  store one, signed in; the body is the file (a FILE_TYPES type, at most FILE_MAX) → Stored (201; 200 when it was stored already)
//   GET    /split/api/ledgers/<id>/files/<file>  the file itself
//   DELETE /split/api/ledgers/<id>/files/<file>  take it off the ledger and out of the bucket → { ok: true }
//
//   GET    /split/api/me/ledgers            my ledgers, keys and all             → MyLedgers
//   PUT    /split/api/me/ledgers/<id>       keep one in my ledgers (or update it) { me? } → MineBody
//   DELETE /split/api/me/ledgers/<id>       take one off my ledgers (the ledger stays) → { ok: true }
//   GET    /split/api/me/files              how much of my room my files use, and how much no expense uses → MyFiles
//   DELETE /split/api/me/files/unused       those no expense uses go now, from every ledger (not one stored in the last hour) → MyFiles
//
// Every request but the owner's two carries the key from the invitation link in the KEY_HEADER. A
// browser can't put a header on a WebSocket, so the live connection gives it as its second
// protocol name, after LIVE_PROTOCOL. Neither ever goes in an address, so it is in no log.
//
// The phone that makes a ledger also sends a key of its own in the OWNER_HEADER, which no
// invitation carries. The owner's three requests carry that one instead (and the new key for the
// invitation in the NEXT_HEADER). A ledger made with no owner's key has no owner.
//
// "My ledgers" are a changle.ca account's: the request carries the site's sign-in
// (`Authorization: Bearer <session>`, as the site's pages keep it), and nothing else says whose.
// Making a ledger needs one (401 "signin" without): it is kept there too, and counts against the
// account's day. Asking again for a ledger already made, with its key, makes nothing, and needs
// none. Keeping one
// takes its key in the KEY_HEADER, which has to open it, and the owner's key in the OWNER_HEADER
// when the phone has it, which has to be the owner's. A sign-in that is nobody's gets 401
// "signin"; when the rooms server can't say whose it is, 503 "down".
//
// A ledger's files (receipt photos, and PDFs): whoever holds the key reads them and takes one off,
// as they can change any expense. Storing one also needs a sign-in, and is charged to that account:
// at most QUOTA in all its files ("quota", 413), and UPLOADS_PER_DAY a day ("limit", 429). A file is
// one of FILE_TYPES, and is what it says it is (its first bytes), at most FILE_MAX ("big", 413). Its
// id is the phone's own, so a phone that isn't sure its file arrived sends it again, and is charged
// once. The file itself comes back only with the key; it has no address of its own, and the answer
// says it is to be shown, not run.
//
// A file no expense uses (taken off one, or on one deleted) is kept UNUSED_DAYS for 改回去 and 恢复,
// then the nightly check lets it go, and its sender has the room back. Its sender can let it go
// sooner from "my files". When a changle.ca account is deleted, the rooms server tells this server
// (through a Service Binding to its `Internal` entrypoint: no address leads there), and every file
// the account sent goes, from every ledger, with all that was kept for the account.
import type { Sent, Took } from "../../../../site/src/split/changes";
import type { Ledger, Member } from "../../../../site/src/split/core";
import type { Mine, Storage } from "./account";
import type { Count, ErrorCode, FileInfo, Logged, Snapshot } from "./ledger";

export const KEY_HEADER = "x-split-key";
export const OWNER_HEADER = "x-split-owner";
export const NEXT_HEADER = "x-split-next";
/** A key as phones make them: 32 random bytes written in letters, digits, - and _ (43 of them); a little shorter or longer is taken too. */
export const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/;
export const LIVE_PROTOCOL = "split.v1";
/** A person's id in a ledger, as phones make them. */
export const MEMBER_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** What a file may be: a photo (the phone sends it as a JPEG it made smaller), or a PDF. */
export const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const MB = 1024 * 1024;
/** The biggest file. */
export const FILE_MAX = 10 * MB;
/** All of one account's files, in every ledger (the plan's 每人 500 MB). */
export const QUOTA = 500 * MB;
/** When the phone says the room is running out. */
export const WARN_AT = 400 * MB;

export type MakeBody = { id: string; name: string; currency: string; members: Member[] };
export type PushBody = { changes: Sent[] };
export type LockBody = { locked: boolean };
export type Pushed = Snapshot & { took: Took[] };
/** The record: each change as it was sent (with who made it, `sent.by`, when the phone said), its number and when it arrived. */
export type Since = { seq: number; changes: Logged[] };
/** My ledgers, the last one kept first. */
export type MyLedgers = { ledgers: Mine[] };
/** One of my ledgers, as it is now kept. */
export type MineBody = { mine: Mine };
/** A ledger's files, the first stored first. */
export type Files = { files: FileInfo[] };
/** A file stored, and the bytes the sender's account now uses, of its quota. */
export type Stored = { file: FileInfo; used: number; quota: number };
/**
 * My files, as the storage page shows them: the bytes used of the quota, how many no expense uses
 * (and may go now), and each ledger they are in, the most first. (No ledger's name: a phone names
 * the ones it holds.)
 */
export type MyFiles = { used: number; quota: number; unused: Count; ledgers: { id: string; count: number; bytes: number; unused: Count }[] };
export type { Count, FileInfo, Mine, Snapshot, Storage };

/**
 * "limit": this network, or this account, has made today's allowance of ledgers (or sent today's
 * files). "quota": a file would take the account past its room. "big": a file bigger than
 * FILE_MAX. "notfound": no such address. "signin": the sign-in is nobody's (401). "down": the
 * rooms server can't say whose it is now, or the bucket didn't take a file (503). (From ErrorCode, the two that came with owners: "owner" is 403, and "locked" is
 * 423: the ledger is locked, and the request had something new in it. "full" is 409 for my
 * ledgers too: an account keeps at most MAX_MINE.)
 */
export type ApiError = { error: ErrorCode | "limit" | "notfound" | "signin" | "down" | "quota" | "big" };

/** What the live connection sends: the whole ledger, and the number of its last change. */
export type Push = { t: "ledger"; seq: number; ledger: Ledger };
