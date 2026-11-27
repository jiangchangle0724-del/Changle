/**
 * Proving a secret to the server without showing it (VAULT-7; threat 1 in the threat model).
 *
 * The server keeps each wrapper (the vault key under a passphrase, or under the recovery code)
 * and hands it to nobody who has not first proven to know that wrapper's secret. Without this,
 * whoever can sign in to the account, which takes the mailbox and nothing else, could fetch the
 * passphrase wrapper once and then try passphrases against it for as long as they liked, on
 * their own machine. With it, every guess has to be put to the server, which counts them
 * (src/server/ways.ts).
 *
 * A proof is 32 bytes made from the secret the same way a wrapping key is, and separately from
 * it: for a passphrase, PBKDF2-HMAC-SHA-256 with the same count and its own salt; for a recovery
 * code, HKDF-SHA-256. The salt PBKDF2 is given, and HKDF's `info`, say "proof" where the
 * wrapping key's say nothing of the kind (crypto.ts), and name the vault. So a proof tells
 * nothing about the wrapping key made from the same secret, or about a proof for another vault.
 * The server keeps the proof's parameters (the salt, the count) and the SHA-256 of the proof.
 * What it holds is worth what a wrapper is worth to someone who has read its storage: something
 * to test guesses against, at the full price of each guess. It adds no cheaper way.
 *
 * The parameters come back from the server, so they are checked like a wrapper from storage:
 * a count under the floor is refused, because a server that asked for a cheap proof would be
 * asking for a cheap way to test guesses.
 *
 * Nothing here touches the format of wrappers or of sealed chunks (crypto.ts, tests/golden.ts).
 * A proof has its own version. Changing how one is made locks people out as surely as changing
 * a wrapper would: add a version, never change one.
 */
import { base64url, fromBase64url, isId } from "../core/ids";
import { PBKDF2_CEILING, PBKDF2_FLOOR, PBKDF2_ITERATIONS, type Secret } from "./crypto";
import { normalizePassphrase } from "./passphrase";
import { parseRecovery } from "./recovery";

/** The format of a proof's parameters and of how a proof is made from them. */
export const PROOF_VERSION = 1;
const CONTEXT = `moneylens/v${PROOF_VERSION}/proof`;
const SALT_BYTES = 32;
const PROOF_BITS = 256;

/** What the server keeps, and gives to a signed-in device that asks, so that the device can make the proof. Nothing in it is secret. */
export type ProofParams = { v: typeof PROOF_VERSION; kind: "passphrase"; kdf: "pbkdf2-sha256"; iterations: number; salt: string } | { v: typeof PROOF_VERSION; kind: "recovery"; kdf: "hkdf-sha256"; salt: string };

/** Are these parameters this version can use? They came from the server, so everything is checked. */
export function isProofParams(x: unknown): x is ProofParams {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  if (p.v !== PROOF_VERSION || typeof p.salt !== "string" || fromBase64url(p.salt)?.length !== SALT_BYTES) return false;
  if (p.kind === "passphrase") return p.kdf === "pbkdf2-sha256" && typeof p.iterations === "number" && Number.isInteger(p.iterations) && p.iterations >= PBKDF2_FLOOR && p.iterations <= PBKDF2_CEILING;
  return p.kind === "recovery" && p.kdf === "hkdf-sha256" && p.iterations === undefined;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * The parameters of the passphrase proof, in one place so that the tests check the same ones a proof uses. The salt
 * PBKDF2 is given is the format, the word "proof", the word "passphrase", the vault's id and a line break, then the
 * 32 random bytes.
 */
export function proofPbkdf2(vault: string, salt: Uint8Array, iterations: number): Pbkdf2Params {
  const head = utf8(`${CONTEXT}/passphrase/${vault}\n`);
  const bound = new Uint8Array(head.length + salt.length);
  bound.set(head);
  bound.set(salt, head.length);
  return { name: "PBKDF2", hash: "SHA-256", salt: bound as BufferSource, iterations };
}

/** The parameters of the recovery code's proof. */
export const proofHkdf = (vault: string, salt: Uint8Array): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: utf8(`${CONTEXT}/recovery/${vault}`) as BufferSource });

/**
 * The proof for these parameters, made from the secret: 32 bytes as base64url. Null when the parameters are not ones
 * this version uses, the vault's id is not one, or the secret is not of the parameters' kind (a recovery code with a
 * symbol missing included). A wrong secret of the right shape gives a proof like any other: only the server can tell.
 */
export async function proofOf(vault: string, params: ProofParams, secret: Secret): Promise<string | null> {
  if (!isId(vault) || !isProofParams(params) || secret.kind !== params.kind) return null;
  const salt = fromBase64url(params.salt)!;
  const material = secret.kind === "passphrase" ? utf8(normalizePassphrase(secret.passphrase)) : secret.kind === "recovery" ? parseRecovery(secret.code) : null;
  if (!material) return null;
  try {
    const algorithm = params.kind === "passphrase" ? "PBKDF2" : "HKDF";
    const base = await crypto.subtle.importKey("raw", material as BufferSource, algorithm, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(params.kind === "passphrase" ? proofPbkdf2(vault, salt, params.iterations) : proofHkdf(vault, salt), base, PROOF_BITS);
    return base64url(new Uint8Array(bits));
  } finally {
    material.fill(0);
  }
}

/** New parameters for a secret, with a fresh salt, and the proof that goes with them: for a vault being made, or a way in being added. Null as `proofOf`. */
export async function newProof(vault: string, secret: Secret): Promise<{ params: ProofParams; proof: string } | null> {
  if (secret.kind !== "passphrase" && secret.kind !== "recovery") return null;
  const salt = base64url(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
  const params: ProofParams = secret.kind === "passphrase" ? { v: PROOF_VERSION, kind: "passphrase", kdf: "pbkdf2-sha256", iterations: PBKDF2_ITERATIONS, salt } : { v: PROOF_VERSION, kind: "recovery", kdf: "hkdf-sha256", salt };
  const proof = await proofOf(vault, params, secret);
  return proof === null ? null : { params, proof };
}
