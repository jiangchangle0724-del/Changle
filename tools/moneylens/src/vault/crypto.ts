/**
 * The vault's cryptography (VAULT-1, VAULT-2, VAULT-3, VAULT-7). Every algorithm here is the
 * platform's own WebCrypto; nothing is home-made and there is no library. It runs in the browser.
 * The server never runs it: the server only stores what this produces.
 *
 * The pieces:
 *
 * - The vault key: 256 random bits. It encrypts everything in the vault with AES-256-GCM. While
 *   the vault is open it exists only as a key object that cannot be exported (VAULT-3); it is
 *   never stored unwrapped, here or anywhere.
 * - Wrappers: the vault key encrypted ("wrapped", AES-KW, RFC 3394) under a key made from one
 *   secret the user holds. One wrapper per way in: the passphrase (PBKDF2-HMAC-SHA-256, slow on
 *   purpose), the recovery code and a passkey (HKDF-SHA-256, because those secrets are already
 *   random). A wrapper is useless without its secret, so the server may store it.
 * - Chunks: a piece of the vault's contents, sealed as one blob. The blob is one version byte,
 *   a 96-bit random nonce, then the ciphertext and its 128-bit tag. The vault's id, the chunk's
 *   id and its type are authenticated with it, so a blob moved to another chunk, another type or
 *   another vault does not open.
 *
 * Changing the passphrase, or adding a passkey or a new recovery code, wraps the same vault key
 * again; the contents are not re-encrypted. To wrap it again the key has to be exportable for a
 * moment, so those operations take the old secret and unwrap a second, short-lived copy.
 *
 * What this does not do is in docs/moneylens/security-assessment.md.
 */
import { base64url, fromBase64url, isId, newId } from "../core/ids";
import { normalizePassphrase, weakness, type Weak } from "./passphrase";
import { newRecovery, parseRecovery } from "./recovery";

/** The format of wrappers and blobs. A reader that meets a larger number must not guess. */
export const VERSION = 1;
/** PBKDF2-HMAC-SHA-256 iterations for a new passphrase wrapper: the figure OWASP's Password Storage Cheat Sheet gives (checked 2026-11-19). */
export const PBKDF2_ITERATIONS = 600_000;
/** The floor (VAULT-7): a wrapper claiming fewer iterations is not used. And a ceiling, so a wrapper can't make a phone grind for hours. */
export const PBKDF2_FLOOR = 600_000;
export const PBKDF2_CEILING = 10_000_000;
/** The most a chunk may hold before sealing: 1 MiB. */
export const MAX_CHUNK_BYTES = 1024 * 1024;

const SALT_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
/** A 256-bit key wrapped with AES-KW is 40 bytes. */
const WRAPPED_BYTES = 40;
const CONTEXT = "moneylens/v1";

export type WrapperKind = "passphrase" | "recovery" | "passkey";

/** The vault key, wrapped under one of the user's secrets. Safe to store on the server. */
export type Wrapper = {
  v: typeof VERSION;
  /** This wrapper's own id, so one way in (a lost passkey) can be removed without touching the others. */
  id: string;
  /** The vault it opens. */
  vault: string;
  kind: WrapperKind;
  kdf: "pbkdf2-sha256" | "hkdf-sha256";
  /** PBKDF2 only. */
  iterations?: number;
  /** 32 random bytes, base64url. */
  salt: string;
  /** The wrapped vault key, 40 bytes, base64url. */
  wrapped: string;
  /** When it was made (UTC, ISO 8601). */
  created: string;
  /** Passkey only: the credential's id, and the name the user sees for it. */
  credential?: string;
  label?: string;
};

/** One of the user's secrets. A passkey's is the 32 bytes its PRF extension returns for this vault. */
export type Secret = { kind: "passphrase"; passphrase: string } | { kind: "recovery"; code: string } | { kind: "passkey"; prf: Uint8Array };

/** An unlocked vault: its id and its key. The key cannot be exported and lives only in memory. */
export type OpenVault = { id: string; key: CryptoKey };

/** What a chunk is, for the server and for authentication: its random id and its type. */
export type ChunkName = { id: string; type: string };

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const isType = (s: unknown): s is string => typeof s === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(s);

/** Is this a wrapper this version can use? Everything in it came from storage, so everything is checked. */
export function isWrapper(x: unknown): x is Wrapper {
  if (typeof x !== "object" || x === null) return false;
  const w = x as Record<string, unknown>;
  if (w.v !== VERSION || !isId(w.id) || !isId(w.vault)) return false;
  if (typeof w.salt !== "string" || fromBase64url(w.salt)?.length !== SALT_BYTES) return false;
  if (typeof w.wrapped !== "string" || fromBase64url(w.wrapped)?.length !== WRAPPED_BYTES) return false;
  if (typeof w.created !== "string" || w.created.length > 40) return false;
  if (w.kind === "passphrase") {
    return w.kdf === "pbkdf2-sha256" && typeof w.iterations === "number" && Number.isInteger(w.iterations) && w.iterations >= PBKDF2_FLOOR && w.iterations <= PBKDF2_CEILING;
  }
  if (w.kdf !== "hkdf-sha256" || w.iterations !== undefined) return false;
  if (w.kind === "recovery") return true;
  return w.kind === "passkey" && typeof w.credential === "string" && w.credential.length > 0 && w.credential.length <= 1400 && fromBase64url(w.credential) !== null && (w.label === undefined || (typeof w.label === "string" && w.label.length <= 60));
}

/** The parameters of the passphrase derivation, in one place so that the tests check the same ones the vault uses. */
export const pbkdf2Params = (salt: Uint8Array, iterations: number): Pbkdf2Params => ({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations });
/** The parameters of the derivation for a secret that is already random: its use is named, so the same secret gives unrelated keys for different uses. */
export const hkdfParams = (salt: Uint8Array, kind: "recovery" | "passkey"): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: utf8(`${CONTEXT}/${kind}`) as BufferSource });

const WRAPPING: AesKeyGenParams = { name: "AES-KW", length: 256 };

/** The key that wraps the vault key, made from one secret. Null when the secret isn't even the right shape (a recovery code with a letter missing). */
async function wrappingKey(kind: WrapperKind, salt: Uint8Array, iterations: number | undefined, secret: Secret): Promise<CryptoKey | null> {
  if (secret.kind !== kind) return null;
  if (secret.kind === "passphrase") {
    if (iterations === undefined || iterations < PBKDF2_FLOOR || iterations > PBKDF2_CEILING) return null;
    const material = utf8(normalizePassphrase(secret.passphrase));
    try {
      const base = await crypto.subtle.importKey("raw", material as BufferSource, "PBKDF2", false, ["deriveKey"]);
      return await crypto.subtle.deriveKey(pbkdf2Params(salt, iterations), base, WRAPPING, false, ["wrapKey", "unwrapKey"]);
    } finally {
      material.fill(0);
    }
  }
  const material = secret.kind === "recovery" ? parseRecovery(secret.code) : secret.prf.length === 32 ? secret.prf.slice() : null;
  if (!material) return null;
  try {
    const base = await crypto.subtle.importKey("raw", material as BufferSource, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(hkdfParams(salt, secret.kind), base, WRAPPING, false, ["wrapKey", "unwrapKey"]);
  } finally {
    material.fill(0);
  }
}

const GCM: AesKeyAlgorithm = { name: "AES-GCM", length: 256 };

/** Unwraps the vault key with a secret. `exportable` only for wrapping it again. Null when the secret is wrong. */
async function unwrap(wrapper: Wrapper, secret: Secret, exportable: boolean): Promise<CryptoKey | null> {
  if (!isWrapper(wrapper)) return null;
  const kek = await wrappingKey(wrapper.kind, fromBase64url(wrapper.salt)!, wrapper.iterations, secret);
  if (!kek) return null;
  try {
    return await crypto.subtle.unwrapKey("raw", fromBase64url(wrapper.wrapped)! as BufferSource, kek, "AES-KW", GCM, exportable, ["encrypt", "decrypt"]);
  } catch {
    // AES-KW checks itself: the wrong key doesn't give a wrong vault key, it gives nothing
    return null;
  }
}

export type NewWrapper = { kind: "passphrase"; passphrase: string } | { kind: "recovery" } | { kind: "passkey"; prf: Uint8Array; credential: string; label?: string };

/** Wraps an exportable copy of the vault key under a new secret. */
async function wrapUnder(master: CryptoKey, vault: string, to: NewWrapper, now: Date): Promise<{ wrapper: Wrapper; recoveryCode?: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const recovery = to.kind === "recovery" ? newRecovery() : undefined;
  const secret: Secret = to.kind === "passphrase" ? { kind: "passphrase", passphrase: to.passphrase } : to.kind === "passkey" ? { kind: "passkey", prf: to.prf } : { kind: "recovery", code: recovery!.code };
  const iterations = to.kind === "passphrase" ? PBKDF2_ITERATIONS : undefined;
  const kek = await wrappingKey(to.kind, salt, iterations, secret);
  if (!kek) throw new RangeError("vault: that secret can't make a key");
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", master, kek, "AES-KW"));
  const wrapper: Wrapper = {
    v: VERSION,
    id: newId(),
    vault,
    kind: to.kind,
    kdf: to.kind === "passphrase" ? "pbkdf2-sha256" : "hkdf-sha256",
    ...(iterations === undefined ? {} : { iterations }),
    salt: base64url(salt),
    wrapped: base64url(wrapped),
    created: now.toISOString(),
    ...(to.kind === "passkey" ? { credential: to.credential, ...(to.label ? { label: to.label.slice(0, 60) } : {}) } : {}),
  };
  recovery?.bytes.fill(0);
  return { wrapper, ...(recovery ? { recoveryCode: recovery.code } : {}) };
}

export type Created = { ok: true; vault: OpenVault; wrappers: [Wrapper, Wrapper]; recoveryCode: string } | { ok: false; why: Weak };

/**
 * Makes a new vault: a fresh vault key, wrapped under the passphrase and under a new recovery
 * code. The recovery code is returned once, to show the user, and is kept nowhere. A passphrase
 * that is too weak makes no vault (VAULT-7).
 */
export async function createVault(passphrase: string, now = new Date()): Promise<Created> {
  const weak = weakness(passphrase);
  if (weak) return { ok: false, why: weak };
  const id = newId();
  const master = await crypto.subtle.generateKey(GCM, true, ["encrypt", "decrypt"]);
  const byPassphrase = await wrapUnder(master, id, { kind: "passphrase", passphrase }, now);
  const byRecovery = await wrapUnder(master, id, { kind: "recovery" }, now);
  // The copy that stays in use is unwrapped again as a key that can't be exported; the exportable
  // one is dropped here. (Through the recovery wrapper, which is quick; it also proves the code just
  // made really opens the vault before the user is asked to write it down.)
  const key = await unwrap(byRecovery.wrapper, { kind: "recovery", code: byRecovery.recoveryCode! }, false);
  if (!key) throw new Error("vault: a new wrapper didn't open");
  return { ok: true, vault: { id, key }, wrappers: [byPassphrase.wrapper, byRecovery.wrapper], recoveryCode: byRecovery.recoveryCode! };
}

/** Opens a vault with one of its wrappers and that wrapper's secret. Null when the secret is wrong or the wrapper is not one this version can use. */
export async function unlock(wrapper: Wrapper, secret: Secret): Promise<OpenVault | null> {
  const key = await unwrap(wrapper, secret, false);
  return key ? { id: wrapper.vault, key } : null;
}

export type Rewrapped = { ok: true; wrapper: Wrapper; recoveryCode?: string } | { ok: false; why: "wrong-secret" | Weak };

/**
 * Another way into the same vault: a new passphrase, a new recovery code, or a passkey. It takes
 * a wrapper that already opens the vault and that wrapper's secret (asked for again, even with the
 * vault open), and returns a new wrapper. Storing the new one and removing an old one is the
 * caller's doing: changing the passphrase is this, then removing the old passphrase wrapper.
 */
export async function rewrap(from: Wrapper, secret: Secret, to: NewWrapper, now = new Date()): Promise<Rewrapped> {
  if (to.kind === "passphrase") {
    const weak = weakness(to.passphrase);
    if (weak) return { ok: false, why: weak };
  }
  if (to.kind === "passkey" && (to.prf.length !== 32 || fromBase64url(to.credential) === null || to.credential.length === 0)) throw new RangeError("vault: not a passkey's output");
  const master = await unwrap(from, secret, true);
  if (!master) return { ok: false, why: "wrong-secret" };
  return { ok: true, ...(await wrapUnder(master, from.vault, to, now)) };
}

/** What is authenticated along with a chunk: the format, the vault, the chunk's id and its type. */
function associated(vault: string, chunk: ChunkName): Uint8Array {
  if (!isId(vault) || !isId(chunk.id) || !isType(chunk.type)) throw new RangeError("vault: not a chunk name");
  return utf8(`${CONTEXT}\n${vault}\n${chunk.id}\n${chunk.type}`);
}

/** Seals a chunk's contents: version byte, a fresh random nonce, ciphertext and tag. */
export async function seal(vault: OpenVault, chunk: ChunkName, plaintext: Uint8Array): Promise<Uint8Array> {
  if (plaintext.length > MAX_CHUNK_BYTES) throw new RangeError("vault: chunk too large");
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource, additionalData: associated(vault.id, chunk) as BufferSource, tagLength: TAG_BYTES * 8 }, vault.key, plaintext as BufferSource));
  const blob = new Uint8Array(1 + NONCE_BYTES + sealed.length);
  blob[0] = VERSION;
  blob.set(nonce, 1);
  blob.set(sealed, 1 + NONCE_BYTES);
  return blob;
}

/**
 * Opens a sealed chunk. Null when it doesn't open: the wrong vault key, a blob that was changed
 * or cut, or one that belongs to another chunk, type or vault. There is never a partial result.
 */
export async function open(vault: OpenVault, chunk: ChunkName, blob: Uint8Array): Promise<Uint8Array | null> {
  if (blob.length < 1 + NONCE_BYTES + TAG_BYTES || blob.length > 1 + NONCE_BYTES + MAX_CHUNK_BYTES + TAG_BYTES || blob[0] !== VERSION) return null;
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.subarray(1, 1 + NONCE_BYTES) as BufferSource, additionalData: associated(vault.id, chunk) as BufferSource, tagLength: TAG_BYTES * 8 }, vault.key, blob.subarray(1 + NONCE_BYTES) as BufferSource),
    );
  } catch {
    return null;
  }
}

/** Was this blob written by a newer version than this code reads? (Then the app is out of date, not the data damaged.) */
export const isNewer = (blob: Uint8Array): boolean => blob.length > 0 && blob[0]! > VERSION;

/** Seals a value as JSON. */
export const sealJson = (vault: OpenVault, chunk: ChunkName, value: unknown): Promise<Uint8Array> => seal(vault, chunk, utf8(JSON.stringify(value)));

/** Opens a chunk sealed with `sealJson`: `{ value }`, or null when it doesn't open or isn't JSON. */
export async function openJson(vault: OpenVault, chunk: ChunkName, blob: Uint8Array): Promise<{ value: unknown } | null> {
  const plain = await open(vault, chunk, blob);
  if (!plain) return null;
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)) as unknown };
  } catch {
    return null;
  }
}
