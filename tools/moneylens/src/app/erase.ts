/**
 * Erasing the vault, as the app asks for it: at once with the vault open, in seven days without it, and calling that
 * off (the server's side is src/server/erase.ts; assessment 1.11). Plain functions over `Ask`, as door.ts. What the
 * server says is taken whole or not at all, as in devices.ts: a date that is not one is trouble, not a date.
 */
import { isId } from "../core/ids";
import { troubleOf, type Trouble } from "./devices";
import type { Ask } from "./door";

/** An erasing asked for, as a session is shown it: when it was asked for, when it is due, and by which session (`here`: this one). */
export type Pending = { asked: number; due: number; session: string | null; here: boolean };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/** What the server says of an erasing: one, none (null), or something that is neither (undefined). */
export function pendingOf(sent: unknown): Pending | null | undefined {
  if (sent === null) return null;
  if (!isRecord(sent) || !isTime(sent.asked) || !isTime(sent.due) || sent.due < sent.asked || typeof sent.here !== "boolean") return undefined;
  if (sent.session === null ? sent.here : !isId(sent.session)) return undefined;
  return { asked: sent.asked, due: sent.due, session: sent.session as string | null, here: sent.here };
}

/** Which vault the account holds (null: none), and the erasing asked for, if one is. */
export async function erasing(ask: Ask): Promise<{ ok: true; vault: string | null; pending: Pending | null } | { ok: false; why: Trouble }> {
  const answer = await ask("vault");
  if (!answer || answer.status !== 200 || answer.json.ok !== true) return { ok: false, why: troubleOf(answer) };
  const { vault } = answer.json;
  const pending = pendingOf(answer.json.erasing);
  // (an erasing of no vault is not one the server can be holding: erasing a vault takes its erasing with it)
  if (!(vault === null || isId(vault)) || pending === undefined || (vault === null && pending !== null)) return { ok: false, why: "server" };
  return { ok: true, vault, pending };
}

/**
 * Erases, at once, the vault this device has open. "gone": the account holds no vault any more, which is what was
 * asked. "locked": on the server this session no longer has it open. "another": the account holds another vault now,
 * and nothing was erased.
 */
export async function eraseNow(ask: Ask, vault: string): Promise<"ok" | "gone" | "locked" | "another" | Trouble> {
  const answer = await ask("vault/erase", { vault });
  if (answer?.status === 200 && answer.json.ok === true) return "ok";
  if (answer?.status === 404 && answer.json.why === "no-vault") return "gone";
  if (answer?.status === 423) return "locked";
  if (answer?.status === 409) return "another";
  return troubleOf(answer);
}

/** Asks for the vault to be erased in seven days. The answer is the erasing, the one asked for before if there was one. */
export async function eraseLater(ask: Ask, vault: string): Promise<{ ok: true; pending: Pending } | { ok: false; why: "gone" | "another" | Trouble }> {
  const answer = await ask("vault/erase-later", { vault });
  if (answer?.status === 200 && answer.json.ok === true) {
    const pending = pendingOf(answer.json.erasing);
    return pending ? { ok: true, pending } : { ok: false, why: "server" };
  }
  if (answer?.status === 404 && answer.json.why === "no-vault") return { ok: false, why: "gone" };
  if (answer?.status === 409) return { ok: false, why: "another" };
  return { ok: false, why: troubleOf(answer) };
}

/**
 * Calls off the erasing asked for, of the vault this device has open. "none": none was (any more). "gone": there is no
 * vault any more, and "another": the account holds another one now (either way the page starts over). "locked": this
 * session does not have the vault open.
 */
export async function keepVault(ask: Ask, vault: string): Promise<"ok" | "none" | "gone" | "another" | "locked" | Trouble> {
  const answer = await ask("vault/erase-cancel", { vault });
  if (answer?.status === 200 && answer.json.ok === true) return "ok";
  if (answer?.status === 404 && answer.json.why === "no-erase") return "none";
  if (answer?.status === 404 && answer.json.why === "no-vault") return "gone";
  if (answer?.status === 409) return "another";
  if (answer?.status === 423) return "locked";
  return troubleOf(answer);
}
