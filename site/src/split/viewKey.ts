/**
 * A 查看链接's address and key (invite.ts says what one is), on their own so that 两清's server makes
 * the same link: a reminder the site mails carries it (tools/split, src/server/worker.ts, remind).
 * Nothing here touches the screen or the network.
 */

/**
 * A 查看链接 (Steve, 2026-11-23: on 结清, a link for the group to come and look): the ledger's id in
 * the path, and after the # a key of its own that lets whoever opens it look at the ledger and do
 * nothing else (tools/split/src/room/protocol.ts). `v=` where an invitation has `k=`.
 */
export const viewLink = (origin: string, id: string, view: string) => `${origin}/split/${id}#v=${view}`;

/**
 * The 查看链接's key, made from the ledger's own: every phone that holds the ledger makes the same one
 * (so the link someone sent keeps working when another sends it again), a new key makes a new one,
 * and nothing of the ledger's key can be worked back from it. 32 bytes, written as keys are.
 */
export async function viewKeyOf(key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`split view link:${key}`)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
