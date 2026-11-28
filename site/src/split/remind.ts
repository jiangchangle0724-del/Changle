/**
 * 催一下 (2026-11-27, Steve's ask): a friendly reminder to someone who still owes this phone's owner,
 * sent by text or email from the phone's own Messages or Mail (sms:, mailto:) or copied for any
 * other app. It goes from the owner's own number or address, costs nothing, and the site sends
 * nothing. Each person's phone and email are kept on this phone only, by name (so they carry over
 * to that person in the owner's other ledgers), never in the ledger: nobody else ever sees them.
 */
import type { Lang } from "../i18n";
import { say } from "./words";

export type Contact = { phone: string; email: string };

/** What a reminder says: the debt, then (when there are) how to pay and where the ledger is to look at. */
export type Reminder = { who: string; ledger: string; amount: string; pay?: string; link?: string | null };

const CONTACTS = "lazysusan.split.contacts.v1";
const REMINDED = "lazysusan.split.reminded.v1";
/** The most people kept: past it, the ones least lately kept go. */
const MAX_KEPT = 300;

/** This phone's storage, or none (a browser that keeps nothing, or a test). */
type Store = Pick<Storage, "getItem" | "setItem">;
const here = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const read = <T>(store: Store | null, name: string): Record<string, T> => {
  try {
    const kept: unknown = JSON.parse(store?.getItem(name) ?? "{}");
    return kept && typeof kept === "object" && !Array.isArray(kept) ? (kept as Record<string, T>) : {};
  } catch {
    return {};
  }
};
const write = (store: Store | null, name: string, value: Record<string, unknown>) => {
  try {
    store?.setItem(name, JSON.stringify(value));
  } catch {
    // full, or a browser that keeps nothing: the reminder still goes, only unremembered
  }
};

/** A name as contacts are kept by: the same person however it is spaced or cased. */
const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** The phone and email kept for someone of this name (empty when none). */
export function contactOf(name: string, store: Store | null = here()): Contact {
  const kept = read<Partial<Contact>>(store, CONTACTS)[keyOf(name)];
  return { phone: typeof kept?.phone === "string" ? kept.phone : "", email: typeof kept?.email === "string" ? kept.email : "" };
}

/** Keeps someone's phone and email (both empty: they are forgotten). The latest kept last, so the oldest go first past MAX_KEPT. */
export function keepContact(name: string, c: Contact, store: Store | null = here()): void {
  const all = read<Contact>(store, CONTACTS);
  const key = keyOf(name);
  delete all[key];
  const phone = c.phone.trim().slice(0, 30);
  const email = c.email.trim().slice(0, 120);
  if (phone || email) all[key] = { phone, email };
  write(store, CONTACTS, Object.fromEntries(Object.entries(all).slice(-MAX_KEPT)));
}

/** When this phone last reminded someone of a ledger (null: never). */
export function remindedAt(ledger: string, member: string, store: Store | null = here()): number | null {
  const at = read<number>(store, REMINDED)[`${ledger}/${member}`];
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

export function markReminded(ledger: string, member: string, at: number, store: Store | null = here()): void {
  const all = read<number>(store, REMINDED);
  delete all[`${ledger}/${member}`];
  all[`${ledger}/${member}`] = at;
  write(store, REMINDED, Object.fromEntries(Object.entries(all).slice(-MAX_KEPT)));
}

/** A phone number a text can go to: seven to fifteen digits, a + in front at most, spaces, dots, dashes and brackets between. */
export const isPhone = (s: string) => /^\+?[\d\s().-]+$/.test(s.trim()) && /^\d{7,15}$/.test(s.replace(/\D/g, ""));

/** An email address a mail can go to (no more than the plain kind: nothing an address line could take as something else). */
export const isEmail = (s: string) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s.trim()) && s.trim().length <= 120;

/** The number as a phone dials it: its digits, with the + in front if it had one. */
export const dialOf = (s: string) => `${s.trim().startsWith("+") ? "+" : ""}${s.replace(/\D/g, "")}`;

/** The reminder itself, friendly: the debt, then how to pay and where to look, each on a line of its own. */
export function reminderText(r: Reminder, lang: Lang): string {
  return [
    say(lang, "remindText", { who: r.who, ledger: r.ledger, amount: r.amount }),
    ...(r.pay ? [say(lang, "remindTextPay", { pay: r.pay })] : []),
    ...(r.link ? [say(lang, "remindTextLink", { link: r.link })] : []),
  ].join("\n");
}

/** The phone's Messages, to this number, with the reminder written ("?&body=": the way both iPhone and Android take it). */
export const smsHref = (phone: string, text: string) => `sms:${dialOf(phone)}?&body=${encodeURIComponent(text)}`;

/** The phone's Mail, to this address, with a subject and the reminder written. */
export const mailHref = (email: string, subject: string, text: string) => `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
