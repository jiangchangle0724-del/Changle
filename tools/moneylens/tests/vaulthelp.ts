// Shared by the tests of the vault's records and of the store. Everything made here is invented.
import { base64url, newId } from "../src/core/ids";
import type { OpenVault } from "../src/vault/crypto";

/** An id that is the same every run: sixteen bytes that spell a number. */
export function idOf(n: number): string {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, n);
  return base64url(bytes);
}

/** An open vault with a key of its own, without the slow passphrase step. The key cannot be exported, as in the app. */
export async function testVault(): Promise<OpenVault> {
  return { id: newId(), key: await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) };
}
