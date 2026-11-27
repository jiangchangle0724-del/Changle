/**
 * What the operator sets for the server (SEC-10, LIM-2), read out of the Worker's settings: the
 * origin it answers on, who is let in, and the quotas. Plain functions, with no Cloudflare in
 * them, so the tests read them directly.
 *
 * The gate. MoneyLens stays shut until the operator opens it, and it is opened for one of two
 * sets of people: the owner alone (Phase 2: his own statements), or the accounts on a list
 * (Phase 3). The repository says `closed`. A setting that is missing or misspelt reads as
 * `closed`: the gate fails shut.
 *
 * Open either way, there is a list of account ids (`ALLOWED_ACCOUNTS`), and an id that is not
 * on it is turned away by the Worker before it reaches any object. `list`: being on the list is
 * what lets an account in. `owner`: the account has to be on the list and the accounts service
 * has to say, at sign-in, that it is the owner's; the list is then the one id, written down, so
 * that an id someone made up costs nothing but the request (the review of #814, finding 1).
 */
import { LIMITS, type Limits } from "../vault/protocol";
import { isAccount } from "./request";

export type Gate = { mode: "closed" } | { mode: "owner" | "list"; accounts: ReadonlySet<string> };

/** The Worker's settings, as Cloudflare hands them over: text, or a number where one was written without quotes. */
export type Settings = { ORIGIN?: unknown; MAIN_SITE?: unknown; GATE?: unknown; ALLOWED_ACCOUNTS?: unknown; QUOTA_VAULT_BYTES?: unknown; QUOTA_WRITES_PER_DAY?: unknown };

export type Config = {
  /** The one origin requests may come from (SEC-4). It is a setting, never read off a request. */
  origin: string;
  /** The main site, where signing in starts. */
  home: string;
  gate: Gate;
  limits: Limits;
};

/** More accounts than a list holds: the first release is for 25 people (D4). */
const LIST_MAX = 200;
/** What the operator may set the quotas to (LIM-2). Outside these, the default stands. */
export const QUOTA_BOUNDS = { vaultBytes: [1024 * 1024, 100 * 1024 * 1024], writesPerDay: [10, 5000] } as const;

const isOrigin = (x: unknown): x is string => typeof x === "string" && /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(x);

function within(value: unknown, [least, most]: readonly [number, number], otherwise: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= least && n <= most ? n : otherwise;
}

export function gateOf(settings: Settings): Gate {
  if (settings.GATE !== "owner" && settings.GATE !== "list") return { mode: "closed" };
  const names = typeof settings.ALLOWED_ACCOUNTS === "string" ? settings.ALLOWED_ACCOUNTS.split(/[\s,]+/) : [];
  return { mode: settings.GATE, accounts: new Set(names.filter(isAccount).slice(0, LIST_MAX)) };
}

/** Null when the origin is not set to an https origin: then nothing is answered at all. */
export function configOf(settings: Settings): Config | null {
  if (!isOrigin(settings.ORIGIN)) return null;
  return {
    origin: settings.ORIGIN,
    home: isOrigin(settings.MAIN_SITE) ? settings.MAIN_SITE : "https://changle.ca",
    gate: gateOf(settings),
    limits: { ...LIMITS, vaultBytes: within(settings.QUOTA_VAULT_BYTES, QUOTA_BOUNDS.vaultBytes, LIMITS.vaultBytes), writesPerDay: within(settings.QUOTA_WRITES_PER_DAY, QUOTA_BOUNDS.writesPerDay, LIMITS.writesPerDay) },
  };
}

/**
 * Is this account let in (T-23)? Never one that is not on the list. `owner`: the accounts service said, at this
 * account's last sign-in, that it is the owner's. With the gate open to a list, the list is all that counts: the
 * owner is on it or is not let in.
 */
export function admits(gate: Gate, account: string, owner: boolean): boolean {
  if (gate.mode === "closed" || !gate.accounts.has(account)) return false;
  return gate.mode === "list" || owner === true;
}

/** Could this account be let in at all? What the Worker asks before a request reaches any object: an id that is not on the list goes no further. */
export const listed = (gate: Gate, account: string): boolean => gate.mode !== "closed" && gate.accounts.has(account);
