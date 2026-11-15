/**
 * Inviting friends on changle.ca to a ledger, from this phone. Who they are is the site's own
 * friends list; the invitation itself waits in the friend's account on 两清's server until they
 * join (tools/split/src/room/protocol.ts); and the friend is told with a message in the site's
 * chat, from whoever invited them. Nothing is sent by mail.
 *
 * What became of each friend invited is kept on the phone for each ledger, with the key it was
 * sent with, so the sheet still says 已邀请 next time (and stops saying it once the owner changes
 * the key: an invitation sent with the old one no longer opens the ledger). Friends picked while
 * starting a ledger wait here until the server has the ledger; its page sends them then.
 *
 * (The site's friends list and chat are the rooms server's, reached the way every page of the site
 * reaches them: src/lib/api.ts.)
 */
import { useSyncExternalStore } from "react";
import type { Lang } from "../i18n";
import { api } from "../lib/api";
import { tidy, NAME_MAX } from "./ops";
import { inviteNet } from "./net";
import { asFriends, type Person } from "./shape";
import { heldOf } from "./store";
import { shown } from "./sync";
import type { Ledger } from "./core";
import { say } from "./words";

/**
 * Where inviting one friend stands, on this phone: on its way; waiting for them ("sent"), or they
 * were in the ledger already ("in"); or it didn't go, and why: no answer, not a friend now, the
 * ledger locked, today's invitations used up, the sign-in run out.
 */
export type Asked = "busy" | "sent" | "in" | "away" | "friends" | "locked" | "limit" | "signin";
/** A friend picked when the ledger started, waiting for the server to have it: who, by name, and the person in the ledger made for them. */
export type Picked = { to: string; name: string; member?: string };
type Kept = Record<string, { key?: string; asked?: Record<string, "sent" | "in">; picked?: Picked[] }>;

const KEPT = "changle.split.invites.v1";
const read = (): Kept => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEPT) ?? "{}") as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Kept) : {};
  } catch {
    return {};
  }
};
let kept: Kept = read();
const save = () => {
  try {
    localStorage.setItem(KEPT, JSON.stringify(kept));
  } catch {
    // (kept for this page only)
  }
};
/** On this page only: on its way, or didn't go and why. */
const passing = new Map<string, Asked>();
const at = (ledger: string, friend: string) => `${ledger}/${friend}`;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** A screen that shows where invitations stand is drawn again when one changes. */
export const useInvites = () => useSyncExternalStore(subscribe, () => version);

/** Where inviting this friend to this ledger stands (null: never asked from this phone, or asked with a key the ledger no longer has). */
export function askedOf(ledger: string, friend: string): Asked | null {
  const now = passing.get(at(ledger, friend));
  if (now) return now;
  const k = kept[ledger];
  return k?.key && k.key === heldOf(ledger)?.key ? (k.asked?.[friend] ?? null) : null;
}

function set(ledger: string, friend: string, asked: Asked, key: string) {
  if (asked === "sent" || asked === "in") {
    passing.delete(at(ledger, friend));
    const k = kept[ledger] ?? {};
    // (marks made with another key are of invitations that no longer open the ledger)
    kept[ledger] = { ...k, key, asked: { ...(k.key === key ? k.asked : {}), [friend]: asked } };
    save();
  } else passing.set(at(ledger, friend), asked);
  changed();
}

/** The person in the ledger a friend is, by name: the one whose name is theirs, if just one is. */
export function memberFor(ledger: Ledger, name: string): string | undefined {
  const theirs = tidy(name, NAME_MAX).toLowerCase();
  const same = ledger.members.filter((m) => m.name.toLowerCase() === theirs);
  return same.length === 1 ? same[0].id : undefined;
}

/**
 * Invite one friend to a ledger this phone holds, once the server has it: the invitation, and
 * when it is a new one, a message in the site's chat that tells them (in this phone's language).
 * What comes back says where it stands; `again` true when it may be tried again later (no answer,
 * or the sign-in ran out) rather than being settled.
 */
export async function inviteFriend(ledger: string, friend: { id: string; name: string }, lang: Lang, member?: string): Promise<{ asked: Asked; again: boolean }> {
  const h = heldOf(ledger);
  if (!h?.made) return { asked: "away", again: true };
  set(ledger, friend.id, "busy", h.key);
  const got = await inviteNet.send(ledger, h.key, friend.id, member);
  const asked: Asked = got.data ? (got.data === "in" ? "in" : "sent") : got.error === "friends" ? "friends" : got.status === 423 ? "locked" : got.status === 429 ? "limit" : got.status === 401 ? "signin" : "away";
  set(ledger, friend.id, asked, h.key);
  if (got.data === "sent") void tell(friend.id, say(lang, "inviteChat", { name: shown(h).name }));
  return { asked, again: asked === "away" || asked === "signin" };
}

/** Friends picked while starting a ledger: they are invited once the server has it. */
export function pickFriends(ledger: string, picked: Picked[]) {
  if (!picked.length) return;
  kept[ledger] = { ...kept[ledger], picked };
  save();
  changed();
}

/** The friends picked when this ledger started, who haven't been invited yet. */
export const pickedOf = (ledger: string): Picked[] => kept[ledger]?.picked ?? [];

const sending = new Set<string>();
/**
 * The ledger's page, once the server has the ledger and someone is signed in: the friends picked
 * when it started are invited now. One that gets no answer (or meets a sign-in that ran out) waits
 * for the next time; the others are done with, whatever came of them.
 */
export async function invitePicked(ledger: string, lang: Lang) {
  if (sending.has(ledger) || !pickedOf(ledger).length) return;
  sending.add(ledger);
  try {
    for (const p of pickedOf(ledger)) {
      const { again } = await inviteFriend(ledger, { id: p.to, name: p.name }, lang, p.member);
      if (again) return;
      const k = kept[ledger];
      kept[ledger] = { ...k, picked: (k?.picked ?? []).filter((x) => x.to !== p.to) };
      save();
    }
  } finally {
    sending.delete(ledger);
    changed();
  }
}

/** The signed-in account's friends on changle.ca, the ones last talked to first (the site's own list); null when they can't be had now. */
export async function friendsNow(): Promise<Person[] | null> {
  try {
    return asFriends(await api<unknown>("/friends"));
  } catch {
    return null;
  }
}

/** A message from this account to a friend, in the site's chat. */
async function tell(to: string, text: string): Promise<boolean> {
  try {
    await api(`/chat/${to}`, { body: { body: text } });
    return true;
  } catch {
    return false;
  }
}

/** A ledger just started on this page: its page comes up with the invitation open, once. */
let started: string | null = null;
export const justStarted = (ledger: string) => {
  started = ledger;
};
/** Was this ledger just started? (Asked as its page comes up; `doneStarting` says it has.) */
export const wasStarted = (ledger: string) => started === ledger;
export const doneStarting = (ledger: string) => {
  if (started === ledger) started = null;
};
