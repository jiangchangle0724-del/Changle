/**
 * The devices that are signed in to this account, and what has happened on it: what the server
 * says of both (account.ts: "sessions", "events"), checked before a screen is made of it, and the
 * two things a person can do there (end one device, end all the others). Plain functions over
 * `Ask`, as door.ts; the screen is web/app/ui/Devices.tsx.
 *
 * This is the place where the owner of an account sees that someone else is in it: a device they
 * do not know, a vault that is open somewhere, a passphrase that was guessed at. So what the
 * server sends is taken whole or not at all. A list this code only half understands is shown as
 * trouble, never as a shorter list: a device left out of it is a device the owner believes is
 * not there.
 */
import { isId } from "../core/ids";
import type { Ask } from "./door";

/**
 * A device that is signed in, as its owner sees it. `here`: the one asking. `unlocked`: the server counts it as
 * holding the vault open, which is the device's own word (it stops when any page of that browser says it locked).
 * `opened`: it has opened the vault since it signed in, which the server knows whatever the device says since.
 */
export type Device = { id: string; label: string; made: number; seen: number; here: boolean; unlocked: boolean; opened: boolean };

/** The kinds of line the events log has (account.ts, `EventKind`). A kind this version does not know is "other": it is shown, not dropped. */
export const KINDS = ["sign-in", "sign-out", "session-ended", "sessions-ended", "vault-started", "email-changed", "unlocked", "unlock-failed"] as const;
export type Kind = (typeof KINDS)[number] | "other";
/** One line of what happened. `session`: the session it is about, when it is about one. */
export type Line = { at: number; kind: Kind; here: boolean; session: string | null };

export type Trouble = "signed-out" | "busy" | "offline" | "server";
export type Listing = { ok: true; devices: Device[]; lines: Line[]; wrong: number } | { ok: false; why: Trouble };

/** More than the server ever sends of either (eight sessions; fifty lines and thirty wrong proofs). Past it, the answer is not one. */
const DEVICES_MOST = 16;
const LINES_MOST = 200;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/** Why an answer is not the one asked for. Not let in any more (401, 403) is "signed out": the screen behind this one says which. */
function troubleOf(answer: { status: number } | null): Trouble {
  if (answer === null) return "offline";
  if (answer.status === 401 || answer.status === 403) return "signed-out";
  // (too many requests from this address in a minute: nothing is wrong with the server)
  return answer.status === 429 ? "busy" : "server";
}

function readDevices(sent: unknown): Device[] | null {
  if (!Array.isArray(sent) || sent.length > DEVICES_MOST) return null;
  const devices: Device[] = [];
  for (const one of sent) {
    if (!isRecord(one) || !isId(one.id) || typeof one.label !== "string" || one.label.length > 120 || !isTime(one.made) || !isTime(one.seen)) return null;
    if (typeof one.here !== "boolean" || typeof one.unlocked !== "boolean" || typeof one.opened !== "boolean") return null;
    // (a device that holds the vault open has opened it: an answer that says otherwise is not one)
    if (one.unlocked && !one.opened) return null;
    devices.push({ id: one.id, label: one.label, made: one.made, seen: one.seen, here: one.here, unlocked: one.unlocked, opened: one.opened });
  }
  // (the session that asks is in its own list, once, so a list with nobody in it is none; and no device is in it twice)
  if (devices.filter((device) => device.here).length !== 1 || new Set(devices.map((device) => device.id)).size !== devices.length) return null;
  return devices;
}

function readLines(sent: unknown): Line[] | null {
  if (!Array.isArray(sent) || sent.length > LINES_MOST) return null;
  const lines: Line[] = [];
  for (const one of sent) {
    if (!isRecord(one) || !isTime(one.at) || typeof one.kind !== "string" || typeof one.here !== "boolean") return null;
    if (one.session !== null && !isId(one.session)) return null;
    lines.push({ at: one.at, kind: (KINDS as readonly string[]).includes(one.kind) ? (one.kind as Kind) : "other", here: one.here, session: one.session });
  }
  return lines;
}

/** The devices and the lines, asked for together. Either both are what they should be, or it is trouble. */
export async function listing(ask: Ask): Promise<Listing> {
  const [sessions, events] = await Promise.all([ask("sessions"), ask("events")]);
  for (const answer of [sessions, events]) if (!answer || answer.status !== 200 || answer.json.ok !== true) return { ok: false, why: troubleOf(answer) };
  const devices = readDevices(sessions!.json.sessions);
  const lines = readLines(events!.json.events);
  const wrong = events!.json.wrong;
  if (!devices || !lines || !isTime(wrong)) return { ok: false, why: "server" };
  return { ok: true, devices, lines, wrong };
}

/**
 * The words a label is made of, so that a page can say them in its own language. The server makes a label from a
 * fixed set of words (request.ts, `labelOf`): a browser, a system, both ("Chrome on Windows"), or neither
 * ("Browser"). A label of any other shape is not taken apart (null): it is shown as it came.
 */
const BROWSERS: readonly string[] = ["Edge", "Opera", "Firefox", "Chrome", "Safari"];
const SYSTEMS: readonly string[] = ["iPhone", "iPad", "Android", "Windows", "ChromeOS", "Mac", "Linux"];
export function partsOf(label: string): { browser: string | null; system: string | null } | null {
  if (label === "Browser") return { browser: null, system: null };
  if (BROWSERS.includes(label)) return { browser: label, system: null };
  if (SYSTEMS.includes(label)) return { browser: null, system: label };
  const words = label.split(" on ");
  const [browser = "", system = ""] = words;
  return words.length === 2 && BROWSERS.includes(browser) && SYSTEMS.includes(system) ? { browser, system } : null;
}

/** The wrong proofs among the lines, newest first: shown apart, above everything else. */
export const wrongOf = (lines: readonly Line[]): Line[] => lines.filter((line) => line.kind === "unlock-failed");
/** Everything else. */
export const restOf = (lines: readonly Line[]): Line[] => lines.filter((line) => line.kind !== "unlock-failed");

/**
 * Which device a line is about, as far as it can be said: this one, one that is still signed in (its label), one
 * that is not any more, or none (a line about the account as a whole).
 */
export function deviceOf(line: Line, devices: readonly Device[]): { at: "here" } | { at: "listed"; label: string } | { at: "gone" } | { at: "none" } {
  if (line.here) return { at: "here" };
  if (line.session === null) return { at: "none" };
  const found = devices.find((device) => device.id === line.session);
  return found ? { at: "listed", label: found.label } : { at: "gone" };
}

/**
 * Signs another device out. "gone": it was no longer signed in (it ended by itself, or someone was quicker), which
 * is what was wanted. Never used for this device: that is signing out (door.ts, `leave`).
 */
export async function endDevice(ask: Ask, id: string): Promise<"ok" | "gone" | Trouble> {
  const answer = await ask("sessions/end", { id });
  if (answer && answer.status === 200 && answer.json.ok === true) return "ok";
  if (answer && answer.status === 404) return "gone";
  return troubleOf(answer);
}

/** Signs every other device out; this one stays. `ended`: how many there were. */
export async function endOthers(ask: Ask): Promise<{ ok: true; ended: number } | { ok: false; why: Trouble }> {
  const answer = await ask("sessions/end", { others: true });
  if (answer && answer.status === 200 && answer.json.ok === true && isTime(answer.json.ended)) return { ok: true, ended: answer.json.ended };
  return { ok: false, why: troubleOf(answer) };
}

/** What went wrong with a request, when it was not that this device is signed out. */
export type Failed = Exclude<Trouble, "signed-out">;
/**
 * What to say after a device (its id), or all the others ("others"), were asked to be signed out: that one is, how
 * many others were, that there are none, or that it was not done and why. "nothing": there is nothing to add to
 * the screen as it stands (it says that the list could not be read, or the list shows what there is).
 */
export type Outcome = { said: "one" } | { said: "others"; ended: number } | { said: "none" } | { said: "not-done"; why: Failed } | { said: "nothing" };
/**
 * `result`: the answer to the asking. `now`: the list as it was read afterwards. What is said goes by that list
 * where the answer does not: an answer that never came back does not mean that nothing was done, and "it was not
 * done" is said only of a device the server still lists. "There is no other device" is said only over a list that
 * shows none: one may have signed in since the answer, and then the list speaks for itself (the review of the
 * devices' screen, finding 2).
 */
export function outcomeOf(asked: string, result: "ok" | "gone" | Failed | { ended: number }, now: Listing): Outcome {
  if (typeof result === "object" && result.ended > 0) return { said: "others", ended: result.ended };
  const others = now.ok ? now.devices.filter((device) => !device.here) : null;
  if (asked === "others") {
    if (others !== null && others.length === 0) return { said: "none" };
    return others === null || typeof result === "object" || result === "ok" || result === "gone" ? { said: "nothing" } : { said: "not-done", why: result };
  }
  if (result === "ok" || result === "gone" || (others !== null && !others.some((device) => device.id === asked))) return { said: "one" };
  return others === null || typeof result === "object" ? { said: "nothing" } : { said: "not-done", why: result };
}
