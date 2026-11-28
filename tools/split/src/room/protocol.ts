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
//   POST /split/api/ledgers/<id>/invites    invite a friend on changle.ca, signed in  InviteBody → InviteSent (201 for a new one; 200 when nothing new)
//   PUT  /split/api/ledgers/<id>/view       make its 查看链接 (the link's key in the VIEW_HEADER)  → { ok: true }
//
//   GET    /split/api/ledgers/<id>/files         its receipt photos and files      → Files
//   PUT    /split/api/ledgers/<id>/files/<file>  store one, signed in; the body is the file (a FILE_TYPES type, at most FILE_MAX) → Stored (201; 200 when it was stored already)
//   GET    /split/api/ledgers/<id>/files/<file>  the file itself
//   DELETE /split/api/ledgers/<id>/files/<file>  take it off the ledger and out of the bucket → { ok: true }
//   POST   /split/api/ledgers/<id>/files/<file>/read  read it as a receipt, signed in → ReadReply
//   POST   /split/api/ledgers/<id>/files/<file>/items its lines, for 小票逐项分, signed in → ItemsReply
//
//   GET    /split/api/me/ledgers            my ledgers, keys and all             → MyLedgers
//   PUT    /split/api/me/ledgers/<id>       keep one in my ledgers (or update it) { me? } → MineBody
//   DELETE /split/api/me/ledgers/<id>       take one off my ledgers (the ledger stays) → { ok: true }
//   GET    /split/api/me/files              how much of my room my files use, and how much no expense uses → MyFiles
//   DELETE /split/api/me/files/unused       those no expense uses go now, from every ledger (not one stored in the last hour) → MyFiles
//   GET    /split/api/me/invites            the invitations from friends waiting for me → MyInvites
//   DELETE /split/api/me/invites/<id>       the one to this ledger goes (said no to, or used) → { ok: true }
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
//
// Reading a receipt (src/server/read.ts): a file of the ledger's, sent to Google's Gemini to read
// the total, its currency, the shop, the tip and tax in the total, and the day, for the phone to fill in. Signed in, with the key; at most
// READS_PER_DAY a day for an account ("limit", 429), and READ_BUDGET a month for the site, after
// which nothing is read until the next month ("budget", 429). Without Google's key, nothing is
// ("off", 403); Google not answering, or failing, is "failed" (502). `read` is null when there was
// nothing to read: no receipt, or no total on it.
//
// A 查看链接 (Steve, 2026-11-23: on 结清, a link for everyone in the group to come and look): a key
// of its own, which the phones make from the ledger's key (so every one of them makes the same link,
// and making it again changes nothing), sent by whoever holds the key in the VIEW_HEADER (PUT
// .../view); the server keeps its fingerprint. In the KEY_HEADER it reads the ledger (GET, as it
// stands, not its changes since) and nothing else: no changes, no files, no invitations, no reading
// receipts, no live connection ("key", 403, like any key that doesn't open the ledger). A locked
// ledger can have one (it isn't a change to the ledger). The owner changing the key lets it go too.
// What it reads is the ledger without anyone's 收款方式 (a member's `pay`): that is for the people
// paying them, not for everyone a link reaches (2026-11-26).
//
// Inviting a friend: whoever holds the key, signed in, can invite someone who is their friend on
// changle.ca (the rooms server says so; "friends", 403, when it doesn't), at most INVITES_PER_DAY a
// day ("limit"). A locked ledger takes nobody new ("locked"). The invitation waits in the friend's
// account, key and all, for INVITE_DAYS, until they keep the ledger (putting it in "my ledgers"
// takes it away) or say no. The phone that invited tells the friend itself, with a message in the
// site's chat. Nothing is sent by mail. An account deleted takes the invitations waiting for it.
import type { Sent, Took } from "../../../../site/src/split/changes";
import type { Ledger, Member } from "../../../../site/src/split/core";
import type { Items, ItemsReply, Read, ReadReply } from "../server/read";
import type { Invite, Invited, Mine, Storage } from "./account";
import type { Count, ErrorCode, FileInfo, Logged, Snapshot } from "./ledger";

export const KEY_HEADER = "x-split-key";
export const OWNER_HEADER = "x-split-owner";
export const NEXT_HEADER = "x-split-next";
/** The 查看链接's key, when one is made: it lets people look at the ledger, and nothing else. */
export const VIEW_HEADER = "x-split-view";
/** A key as phones make them: 32 random bytes written in letters, digits, - and _ (43 of them); a little shorter or longer is taken too. */
export const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/;
export const LIVE_PROTOCOL = "split.v1";
/** A person's id in a ledger, as phones make them. */
export const MEMBER_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** A changle.ca account's id, as far as 两清 needs to know one (the rooms server makes them). */
export const ACCOUNT_RE = /^[A-Za-z0-9_-]{1,64}$/;

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
/** A friend to invite (their changle.ca account), and the person in the ledger they are, when the phone knows. */
export type InviteBody = { to: string; member?: string };
/** What came of it (src/room/account.ts, `Invited`). */
export type InviteSent = { invite: Invited };
/** The invitations waiting for me, the newest first. */
export type MyInvites = { invites: Invite[] };
/** 催一下 by mail: whom to remind (the person in the ledger who owes me), at which address, and in which language. */
export type RemindBody = { member: string; to: string; lang: "zh" | "en" };
/** It went out. */
export type Reminded = { sent: true };
export type { Count, FileInfo, Invite, Invited, Items, ItemsReply, Mine, Read, ReadReply, Snapshot, Storage };

/**
 * "limit": this network, or this account, has made today's allowance of ledgers (or sent today's
 * files). "quota": a file would take the account past its room. "big": a file bigger than
 * FILE_MAX. "notfound": no such address. "signin": the sign-in is nobody's (401). "down": the
 * rooms server can't say whose it is now, or the bucket didn't take a file (503). "friends": the one
 * invited isn't a friend on changle.ca, or isn't anyone there (403). Reading a receipt: "off" (403),
 * nothing is read here (no key); "budget" (429), the month's money for reading is spent; "failed"
 * (502), Google couldn't read it. (From ErrorCode, the two that came with owners: "owner" is 403, and "locked" is
 * 423: the ledger is locked, and the request had something new in it. "full" is 409 for my
 * ledgers too: an account keeps at most MAX_MINE.) A reminder by mail: "me" (409), the account
 * hasn't said who it is in the ledger; "settled" (409), that person owes it nothing now; "again"
 * (429), they were reminded today already; "limit" (429), the account's reminders today, or that
 * address's, are used up; "today" (429), the site's are; "to" (400), the address is one the site
 * doesn't mail; "mail" (503), it didn't go out.
 */
export type ApiError = { error: ErrorCode | "limit" | "notfound" | "signin" | "down" | "quota" | "big" | "friends" | "off" | "budget" | "failed" | "me" | "settled" | "again" | "today" | "to" | "mail" };

/** What the live connection sends: the whole ledger, and the number of its last change. */
export type Push = { t: "ledger"; seq: number; ledger: Ledger };
