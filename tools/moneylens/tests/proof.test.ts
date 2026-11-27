/**
 * Proofs of a secret (src/vault/proof.ts): what a device shows the server before the server hands
 * it a wrapper. The answers are checked against Node's own PBKDF2 and HKDF, which share no code
 * with the browser's, and two of them are written down here: a proof made today has to be the
 * proof made tomorrow, or nobody gets their wrapper back.
 */
import assert from "node:assert/strict";
import { hkdfSync, pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { base64url, fromBase64url, newId } from "../src/core/ids";
import { PBKDF2_CEILING, PBKDF2_FLOOR, PBKDF2_ITERATIONS, hkdfParams, pbkdf2Params } from "../src/vault/crypto";
import { normalizePassphrase } from "../src/vault/passphrase";
import { PROOF_VERSION, isProofParams, newProof, proofHkdf, proofOf, proofPbkdf2, type ProofParams } from "../src/vault/proof";
import { formatRecovery, newRecovery } from "../src/vault/recovery";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const VAULT = "AAECAwQFBgcICQoLDA0ODw";
const SALT = base64url(Uint8Array.from({ length: 32 }, (_, i) => 255 - i));
const PASSPHRASE = "seven tidal marmots in a canoe";
const byPassphrase = (salt = SALT, iterations = PBKDF2_ITERATIONS): ProofParams => ({ v: 1, kind: "passphrase", kdf: "pbkdf2-sha256", iterations, salt });
const byRecovery = (salt = SALT): ProofParams => ({ v: 1, kind: "recovery", kdf: "hkdf-sha256", salt });

test("a passphrase's proof is PBKDF2 over the normalized passphrase, with a salt that says what it is for", async () => {
  const proof = await proofOf(VAULT, byPassphrase(), { kind: "passphrase", passphrase: PASSPHRASE });
  const bound = Buffer.concat([Buffer.from(`moneylens/v1/proof/passphrase/${VAULT}\n`), fromBase64url(SALT)!]);
  assert.equal(proof, base64url(pbkdf2Sync(normalizePassphrase(PASSPHRASE), bound, PBKDF2_ITERATIONS, 32, "sha256")));
  // written down: this is the proof of this passphrase for this vault and salt, for as long as version 1 is read
  assert.equal(proof, "RO5Agx3PBd-O4zYaF5SX5u-ENHOPjVRjnwV82NnLGCA");
  // the count is the wrapper's own, the one OWASP gives, and it is what is asked of PBKDF2
  assert.equal(PBKDF2_ITERATIONS, 600_000);
  const other = await proofOf(VAULT, byPassphrase(SALT, PBKDF2_ITERATIONS + 1), { kind: "passphrase", passphrase: PASSPHRASE });
  assert.equal(other, base64url(pbkdf2Sync(normalizePassphrase(PASSPHRASE), bound, PBKDF2_ITERATIONS + 1, 32, "sha256")));
  // typed another way that reads the same, it is the same proof; another passphrase, vault or salt, another proof
  assert.equal(await proofOf(VAULT, byPassphrase(), { kind: "passphrase", passphrase: `  ${PASSPHRASE.replace(/ /g, "   ")} ` }), proof);
  for (const [vault, salt, passphrase] of [
    [VAULT, SALT, `${PASSPHRASE}!`],
    [newId(), SALT, PASSPHRASE],
    [VAULT, base64url(new Uint8Array(32)), PASSPHRASE],
  ] as const)
    assert.notEqual(await proofOf(vault, byPassphrase(salt), { kind: "passphrase", passphrase }), proof);
});

test("a recovery code's proof is HKDF over its bytes, named for its use and its vault", async () => {
  const { code, bytes } = newRecovery();
  const info = Buffer.from(`moneylens/v1/proof/recovery/${VAULT}`);
  const proof = await proofOf(VAULT, byRecovery(), { kind: "recovery", code });
  assert.equal(proof, base64url(new Uint8Array(hkdfSync("sha256", bytes, fromBase64url(SALT)!, info, 32))));
  assert.notEqual(await proofOf(newId(), byRecovery(), { kind: "recovery", code }), proof);
  assert.notEqual(await proofOf(VAULT, byRecovery(base64url(new Uint8Array(32))), { kind: "recovery", code }), proof);
  assert.notEqual(await proofOf(VAULT, byRecovery(), { kind: "recovery", code: newRecovery().code }), proof);
  // written down, for a code whose bytes are known
  const fixed = Uint8Array.from({ length: 20 }, (_, i) => i * 7 + 1);
  const written = await proofOf(VAULT, byRecovery(), { kind: "recovery", code: formatRecovery(fixed) });
  assert.equal(written, base64url(new Uint8Array(hkdfSync("sha256", fixed, fromBase64url(SALT)!, info, 32))));
  assert.equal(written, "og4tpdCz5wyLJ95QbkOE14qJtB6SG8CwnLqZkvCgxBY");
});

test("a proof says nothing about the wrapping key made from the same secret and the same random bytes", async () => {
  const salt = fromBase64url(SALT)!;
  const bits = async (algorithm: "PBKDF2" | "HKDF", params: Pbkdf2Params | HkdfParams, secret: Uint8Array): Promise<string> =>
    base64url(new Uint8Array(await crypto.subtle.deriveBits(params, await crypto.subtle.importKey("raw", secret as BufferSource, algorithm, false, ["deriveBits"]), 256)));
  const passphrase = utf8(normalizePassphrase(PASSPHRASE));
  const wrapping = await bits("PBKDF2", pbkdf2Params(VAULT, salt, PBKDF2_ITERATIONS), passphrase);
  const proving = await bits("PBKDF2", proofPbkdf2(VAULT, salt, PBKDF2_ITERATIONS), passphrase);
  assert.notEqual(proving, wrapping);
  assert.equal(proving, await proofOf(VAULT, byPassphrase(), { kind: "passphrase", passphrase: PASSPHRASE }));
  const { code, bytes } = newRecovery();
  assert.notEqual(await bits("HKDF", proofHkdf(VAULT, salt), bytes), await bits("HKDF", hkdfParams(VAULT, salt, "recovery"), bytes));
  assert.equal(await bits("HKDF", proofHkdf(VAULT, salt), bytes), await proofOf(VAULT, byRecovery(), { kind: "recovery", code }));
  // the two salts PBKDF2 is given begin differently, so no vault's id can make one into the other
  const head = (params: Pbkdf2Params): string => new TextDecoder().decode((params.salt as Uint8Array).subarray(0, 20));
  assert.deepEqual([head(pbkdf2Params(VAULT, salt, 1)), head(proofPbkdf2(VAULT, salt, 1))], ["moneylens/v1/passphr", "moneylens/v1/proof/p"]);
});

test("parameters from the server are checked: a count under the floor is not used", async () => {
  assert.ok(isProofParams(byPassphrase()));
  assert.ok(isProofParams(byRecovery()));
  assert.ok(isProofParams(byPassphrase(SALT, PBKDF2_FLOOR)));
  assert.ok(isProofParams(byPassphrase(SALT, PBKDF2_CEILING)));
  const bad: unknown[] = [
    null,
    "x",
    [],
    {},
    byPassphrase(SALT, PBKDF2_FLOOR - 1),
    byPassphrase(SALT, PBKDF2_CEILING + 1),
    byPassphrase(SALT, 1),
    byPassphrase(SALT, 0),
    byPassphrase(SALT, 600_000.5),
    { ...byPassphrase(), iterations: "600000" },
    { ...byPassphrase(), iterations: undefined },
    { ...byPassphrase(), kdf: "hkdf-sha256" },
    { ...byPassphrase(), kdf: "pbkdf2-sha1" },
    { ...byPassphrase(), v: 2 },
    { ...byPassphrase(), v: "1" },
    { ...byPassphrase(), salt: SALT.slice(0, -2) },
    { ...byPassphrase(), salt: `${SALT}AA` },
    { ...byPassphrase(), salt: 5 },
    { ...byPassphrase(), salt: "not base64 at all !!" },
    { ...byPassphrase(), kind: "passkey" },
    { ...byPassphrase(), kind: "recovery" },
    { ...byRecovery(), kdf: "pbkdf2-sha256" },
    { ...byRecovery(), iterations: 600_000 },
    { ...byRecovery(), v: 0 },
  ];
  for (const params of bad) {
    assert.equal(isProofParams(params), false, JSON.stringify(params));
    // and no proof is made from them
    assert.equal(await proofOf(VAULT, params as ProofParams, { kind: "passphrase", passphrase: PASSPHRASE }), null, JSON.stringify(params));
  }
  assert.equal(PROOF_VERSION, 1);
});

test("no proof from a secret of another kind, a code that is not one, or a vault that is not one", async () => {
  const { code } = newRecovery();
  assert.equal(await proofOf(VAULT, byPassphrase(), { kind: "recovery", code }), null);
  assert.equal(await proofOf(VAULT, byRecovery(), { kind: "passphrase", passphrase: PASSPHRASE }), null);
  assert.equal(await proofOf(VAULT, byRecovery(), { kind: "recovery", code: code.slice(0, -1) }), null);
  assert.equal(await proofOf(VAULT, byRecovery(), { kind: "recovery", code: "" }), null);
  assert.equal(await proofOf(VAULT, byRecovery(), { kind: "passkey", prf: new Uint8Array(32) }), null);
  for (const vault of ["", "short", `${VAULT}x`, "AAECAwQFBgcICQoLDA0OD/"]) assert.equal(await proofOf(vault, byPassphrase(), { kind: "passphrase", passphrase: PASSPHRASE }), null);
  assert.equal(await newProof(VAULT, { kind: "passkey", prf: new Uint8Array(32) }), null);
  assert.equal(await newProof("short", { kind: "passphrase", passphrase: PASSPHRASE }), null);
});

test("a new proof comes with parameters of its own, and the same secret makes it again", async () => {
  const first = (await newProof(VAULT, { kind: "passphrase", passphrase: PASSPHRASE }))!;
  const second = (await newProof(VAULT, { kind: "passphrase", passphrase: PASSPHRASE }))!;
  assert.ok(isProofParams(first.params) && first.params.kind === "passphrase" && first.params.iterations === PBKDF2_ITERATIONS);
  assert.notEqual(first.params.salt, second.params.salt);
  assert.notEqual(first.proof, second.proof);
  assert.equal(fromBase64url(first.proof)?.length, 32);
  assert.equal(await proofOf(VAULT, first.params, { kind: "passphrase", passphrase: PASSPHRASE }), first.proof);
  assert.notEqual(await proofOf(VAULT, first.params, { kind: "passphrase", passphrase: `${PASSPHRASE}s` }), first.proof);
  const { code } = newRecovery();
  const third = (await newProof(VAULT, { kind: "recovery", code }))!;
  assert.deepEqual({ ...third.params, salt: "" }, { v: 1, kind: "recovery", kdf: "hkdf-sha256", salt: "" });
  assert.equal(await proofOf(VAULT, third.params, { kind: "recovery", code }), third.proof);
  // a code typed with spaces for hyphens and in small letters is the same code
  assert.equal(await proofOf(VAULT, third.params, { kind: "recovery", code: code.toLowerCase().replace(/-/g, " ") }), third.proof);
});
