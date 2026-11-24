/**
 * An invitation to a ledger: an address with the ledger's id in its path and the key that opens
 * it after the #. What follows a # never leaves the browser, so the key is in no server's log and
 * in nothing a chat app fetches to show a preview. Whoever opens the address has the key, and so
 * can read the ledger and record in it: the link is the key (docs/split.md).
 *
 * Nothing here touches the screen or the network, so it is tested as it is written
 * (tests/split-screens.test.ts).
 */
import QRCode from "qrcode";
import type { Lang } from "../i18n";
import { say } from "./words";

/** A key as phones make them (the server's own rule, tools/split/src/room/protocol.ts). */
const KEY = "[A-Za-z0-9_-]{22,128}";

/** The address to send: `origin` is where the site is (https://changle.ca). */
export const inviteLink = (origin: string, id: string, key: string) => `${origin}/split/${id}#k=${key}`;

/**
 * The key in an address's # part, or null when there isn't one. Tolerant of whatever else is
 * there: only `k=` and the key are looked for, so what an app adds before or behind it, or the
 * full stop of the sentence the link was pasted into, doesn't lose the key.
 */
export function keyFrom(hash: string): string | null {
  return new RegExp(`(?:^#|&)k=(${KEY})(?![A-Za-z0-9_-])`).exec(hash)?.[1] ?? null;
}

/** What is pasted into a group chat: a line saying what this is, then the address on a line of its own. */
export const inviteText = (name: string, link: string, lang: Lang) => `${say(lang, "inviteLine", { name })}\n${link}`;

/**
 * A 查看链接 (Steve, 2026-11-23: on 结清, a link for the group to come and look): the ledger's id in
 * the path, and after the # a key of its own that lets whoever opens it look at the ledger and do
 * nothing else (tools/split/src/room/protocol.ts). `v=` where an invitation has `k=`.
 */
export const viewLink = (origin: string, id: string, view: string) => `${origin}/split/${id}#v=${view}`;

/** The 查看链接's key in an address's # part, or null; as tolerant as keyFrom. */
export function viewKeyFrom(hash: string): string | null {
  return new RegExp(`(?:^#|&)v=(${KEY})(?![A-Za-z0-9_-])`).exec(hash)?.[1] ?? null;
}

/**
 * The 查看链接's key, made from the ledger's own: every phone that holds the ledger makes the same one
 * (so the link someone sent keeps working when another sends it again), a new key makes a new one,
 * and nothing of the ledger's key can be worked back from it. 32 bytes, written as keys are.
 */
export async function viewKeyOf(key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`split view link:${key}`)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What is pasted into the group with a 查看链接: what it is, then the address on a line of its own. */
export const viewText = (name: string, link: string, lang: Lang) => `${say(lang, "viewLine", { name })}\n${link}`;

/**
 * A QR code for some text, as one drawn path on a grid `size` squares wide: every dark square is
 * in it, each run of them in a row as one rectangle. Null when the text is too long for a code.
 * (Drawn here and not by the library, so its two colours are the page's own: night on paper.)
 */
export function qrPath(text: string): { size: number; d: string } | null {
  try {
    const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    let d = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!data[y * size + x]) continue;
        let run = 1;
        while (x + run < size && data[y * size + x + run]) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { size, d };
  } catch {
    return null;
  }
}
