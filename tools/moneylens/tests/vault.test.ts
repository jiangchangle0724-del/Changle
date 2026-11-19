// T-9 and part of T-25: the vault's cryptography. Published known-answer tests for each primitive;
// the vault's own wrappers and blobs re-derived with a second implementation (Node's OpenSSL
// bindings); a vault stored in golden.ts that has to keep opening; a wrong passphrase fails; the
// recovery code unlocks; anything tampered with or relabelled is refused; changing the passphrase
// keeps the data readable.
import assert from "node:assert/strict";
import { createDecipheriv, hkdfSync, pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { base64url, fromBase64url, newId } from "../src/core/ids";
import { createVault, hkdfParams, isNewer, isWrapper, MAX_CHUNK_BYTES, open, openJson, PBKDF2_CEILING, PBKDF2_FLOOR, PBKDF2_ITERATIONS, pbkdf2Params, rewrap, seal, sealJson, unlock, VERSION, type Created, type OpenVault, type Secret, type Wrapper } from "../src/vault/crypto";
import { parseRecovery } from "../src/vault/recovery";
import { GOLDEN } from "./golden";

const hex = (bytes: ArrayBuffer | Uint8Array): string => Buffer.from(bytes as Uint8Array).toString("hex");
const unhex = (text: string) => new Uint8Array(Buffer.from(text, "hex"));
const utf8 = (text: string) => new TextEncoder().encode(text);
const subtle = crypto.subtle;

const PASSPHRASE = "tidal marmot quartz lantern";
type Made = Extract<Created, { ok: true }>;
let shared: Promise<Made> | undefined;
/** One vault for the tests that only read it (each passphrase derivation is slow on purpose). */
const made = (): Promise<Made> =>
  (shared ??= createVault(PASSPHRASE, new Date("2026-11-19T08:00:00Z")).then((c) => {
    assert.ok(c.ok);
    return c;
  }));
const chunk = () => ({ id: newId(), type: "txns" });
/** The vault a secret opens, or why it didn't. */
const opened = async (wrapper: Wrapper, secret: Secret): Promise<OpenVault | "unsupported" | "wrong-secret"> => {
  const result = await unlock(wrapper, secret);
  return result.ok ? result.vault : result.why;
};
const vaultOf = async (wrapper: Wrapper, secret: Secret): Promise<OpenVault> => {
  const result = await opened(wrapper, secret);
  assert.ok(typeof result === "object", String(result));
  return result;
};

// The golden vault's passphrase, as a desktop keyboard types it and as a phone does: a curly
// apostrophe, a dash for two hyphens, full-width letters, the heart with its variation selector,
// an ideographic full stop.
const HEART = String.fromCodePoint(0x2764);
const fullWidth = (text: string): string => [...text].map((c) => String.fromCodePoint(c.codePointAt(0)! + 0xfee0)).join("");
const GOLDEN_AT_A_DESK = `老王面馆 don't stop--tidal ${HEART} 42.`;
const GOLDEN_ON_A_PHONE = `老王面馆 don${String.fromCodePoint(0x2019)}t stop${String.fromCodePoint(0x2014)}${fullWidth("tidal")} ${HEART}${String.fromCodePoint(0xfe0f)} 42${String.fromCodePoint(0x3002)}`;

test("known answers: PBKDF2-HMAC-SHA-256 (RFC 7914, section 11)", async () => {
  const derive = async (password: string, salt: string, iterations: number) => {
    const base = await subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
    return hex(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: utf8(salt), iterations }, base, 512));
  };
  assert.equal(await derive("passwd", "salt", 1), "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783");
  assert.equal(await derive("Password", "NaCl", 80000), "4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d");
});

test("known answers: HKDF-SHA-256 (RFC 5869, test case 1)", async () => {
  const base = await subtle.importKey("raw", unhex("0b".repeat(22)), "HKDF", false, ["deriveBits"]);
  const okm = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: unhex("000102030405060708090a0b0c"), info: unhex("f0f1f2f3f4f5f6f7f8f9") }, base, 42 * 8);
  assert.equal(hex(okm), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
});

test("known answers: AES key wrap (RFC 3394, section 4.6)", async () => {
  const kek = await subtle.importKey("raw", unhex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"), "AES-KW", false, ["wrapKey", "unwrapKey"]);
  const key = await subtle.importKey("raw", unhex("00112233445566778899aabbccddeeff000102030405060708090a0b0c0d0e0f"), "AES-GCM", true, ["encrypt"]);
  const wrapped = await subtle.wrapKey("raw", key, kek, "AES-KW");
  assert.equal(hex(wrapped), "28c9f404c4b810f4cbccb35cfb87f8263f5786e2d80ed326cbc7f0e71a99f43bfb988b9b7a02dd21");
  const back = await subtle.unwrapKey("raw", wrapped, kek, "AES-KW", "AES-GCM", true, ["encrypt"]);
  assert.equal(hex(await subtle.exportKey("raw", back)), "00112233445566778899aabbccddeeff000102030405060708090a0b0c0d0e0f");
});

test("known answers: AES-256-GCM (McGrew and Viega, test cases 13 to 16)", async () => {
  const gcm = async (key: string, iv: string, plaintext: string, aad = "") => {
    const k = await subtle.importKey("raw", unhex(key), "AES-GCM", false, ["encrypt"]);
    return hex(await subtle.encrypt({ name: "AES-GCM", iv: unhex(iv), additionalData: unhex(aad), tagLength: 128 }, k, unhex(plaintext)));
  };
  const K = "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308";
  const P = "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255";
  const C = "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad";
  assert.equal(await gcm("00".repeat(32), "00".repeat(12), ""), "530f8afbc74536b9a963b4f1c4cb738b");
  assert.equal(await gcm("00".repeat(32), "00".repeat(12), "00".repeat(16)), "cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919");
  assert.equal(await gcm(K, "cafebabefacedbaddecaf888", P), `${C}b094dac5d93471bdec1a502270e3cc6c`);
  assert.equal(await gcm(K, "cafebabefacedbaddecaf888", P.slice(0, 120), "feedfacedeadbeeffeedfacedeadbeefabaddad2"), `${C.slice(0, 120)}76fc6ece0f4e1768cddf8853bb2d551b`);
});

test("the vault's own derivations name the vault and the use, checked against a second implementation", async () => {
  const vault = newId();
  const other = newId();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const bits = async (params: Pbkdf2Params | HkdfParams, secret: Uint8Array<ArrayBuffer>) => hex(await subtle.deriveBits(params, await subtle.importKey("raw", secret, params.name, false, ["deriveBits"]), 256));
  // PBKDF2: the salt it is given is the format, "passphrase", the vault's id and a line break, then the 32 random bytes
  const bound = Buffer.concat([utf8(`moneylens/v1/passphrase/${vault}\n`), salt]);
  assert.equal(hex(pbkdf2Params(vault, salt, 2000).salt as Uint8Array), hex(bound));
  assert.equal(await bits(pbkdf2Params(vault, salt, 2000), utf8("a passphrase")), hex(pbkdf2Sync("a passphrase", bound, 2000, 32, "sha256")));
  assert.notEqual(await bits(pbkdf2Params(vault, salt, 2000), utf8("a passphrase")), await bits(pbkdf2Params(other, salt, 2000), utf8("a passphrase")));
  // HKDF: the use and the vault's id are the info
  const secret = crypto.getRandomValues(new Uint8Array(20));
  for (const kind of ["recovery", "passkey"] as const) {
    assert.equal(await bits(hkdfParams(vault, salt, kind), secret), hex(hkdfSync("sha256", secret, salt, `moneylens/v1/${kind}/${vault}`, 32)));
  }
  assert.notEqual(await bits(hkdfParams(vault, salt, "recovery"), secret), await bits(hkdfParams(vault, salt, "passkey"), secret));
  assert.notEqual(await bits(hkdfParams(vault, salt, "recovery"), secret), await bits(hkdfParams(other, salt, "recovery"), secret));
});

test("a new vault: two wrappers, a recovery code, and a key that can't be taken out", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const [byPassphrase, byRecovery] = wrappers;
  assert.ok(isWrapper(byPassphrase) && isWrapper(byRecovery));
  assert.deepEqual([byPassphrase.kind, byPassphrase.kdf, byPassphrase.iterations], ["passphrase", "pbkdf2-sha256", PBKDF2_ITERATIONS]);
  assert.deepEqual([byRecovery.kind, byRecovery.kdf, byRecovery.iterations], ["recovery", "hkdf-sha256", undefined]);
  assert.equal(byPassphrase.vault, vault.id);
  assert.equal(byRecovery.vault, vault.id);
  assert.notEqual(byPassphrase.id, byRecovery.id);
  assert.notEqual(byPassphrase.salt, byRecovery.salt);
  assert.equal(byPassphrase.created, "2026-11-19T08:00:00.000Z");
  assert.match(recoveryCode, /^(?:[0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{2}$/);
  // VAULT-3: the key in use is not exportable
  assert.equal(vault.key.extractable, false);
  assert.deepEqual([vault.key.algorithm.name, (vault.key.algorithm as AesKeyAlgorithm).length], ["AES-GCM", 256]);
  await assert.rejects(subtle.exportKey("raw", vault.key));
  // nothing a wrapper holds is the passphrase, the recovery code or the vault key
  const stored = JSON.stringify(wrappers);
  assert.ok(!stored.includes(PASSPHRASE) && !stored.includes(recoveryCode) && !stored.includes(recoveryCode.replace(/-/g, "")));
});

test("the iteration counts: what is written, the floor and the ceiling", () => {
  assert.ok(PBKDF2_FLOOR >= 600_000 && PBKDF2_ITERATIONS >= PBKDF2_FLOOR && PBKDF2_ITERATIONS <= PBKDF2_CEILING);
  // the floor may never pass the count a stored vault was written with, or that vault stops opening
  assert.ok(PBKDF2_FLOOR <= GOLDEN.wrappers[0].iterations);
  const stored = GOLDEN.wrappers[0];
  assert.ok(isWrapper({ ...stored, iterations: PBKDF2_FLOOR }));
  assert.ok(isWrapper({ ...stored, iterations: PBKDF2_CEILING }));
  assert.ok(!isWrapper({ ...stored, iterations: PBKDF2_FLOOR - 1 }));
  assert.ok(!isWrapper({ ...stored, iterations: PBKDF2_CEILING + 1 }));
});

test("a vault stored on 2026-11-19 still opens: by passphrase from either keyboard, by recovery code, by passkey", async () => {
  const [byPassphrase, byRecovery, byPasskey] = GOLDEN.wrappers;
  const blob = fromBase64url(GOLDEN.blob)!;
  for (const w of GOLDEN.wrappers) assert.ok(isWrapper(w), w.kind);
  const ways: [Wrapper, Secret][] = [
    [byPassphrase, { kind: "passphrase", passphrase: GOLDEN_AT_A_DESK }],
    [byPassphrase, { kind: "passphrase", passphrase: GOLDEN_ON_A_PHONE }],
    [byPassphrase, { kind: "passphrase", passphrase: `  ${GOLDEN_AT_A_DESK.replace(/ /g, `${String.fromCodePoint(0xa0)} `)}\n` }],
    [byRecovery, { kind: "recovery", code: GOLDEN.recoveryCode }],
    [byPasskey, { kind: "passkey", prf: fromBase64url(GOLDEN.prf)! }],
  ];
  for (const [wrapper, secret] of ways) {
    const vault = await vaultOf(wrapper, secret);
    assert.equal(vault.id, GOLDEN.vault);
    assert.deepEqual(await openJson(vault, GOLDEN.chunk, blob), { value: GOLDEN.value }, secret.kind);
  }
  assert.notEqual(GOLDEN_AT_A_DESK, GOLDEN_ON_A_PHONE);
  // capitals are the user's own: a phone that capitalizes for them is the input field's to prevent
  assert.equal(await opened(byPassphrase, { kind: "passphrase", passphrase: GOLDEN_AT_A_DESK.replace("don", "Don") }), "wrong-secret");
});

test("the vault is exactly what the assessment says: re-derived with a second implementation", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const plaintext = utf8(JSON.stringify({ marker: "MARKER-7f3a", amount: -8437 }));
  const blob = await seal(vault, name, plaintext);
  const unwrapWith = (kek: Uint8Array, w: Wrapper): Buffer => {
    const d = createDecipheriv("id-aes256-wrap", kek, Buffer.from("a6a6a6a6a6a6a6a6", "hex"));
    return Buffer.concat([d.update(fromBase64url(w.wrapped)!), d.final()]);
  };
  // the passphrase wrapper: PBKDF2-HMAC-SHA-256 over the normalized passphrase, salted with the vault's id and the random salt, then RFC 3394
  const pbkdf2Salt = Buffer.concat([utf8(`moneylens/v1/passphrase/${vault.id}\n`), fromBase64url(wrappers[0].salt)!]);
  const fromPassphrase = unwrapWith(pbkdf2Sync(PASSPHRASE, pbkdf2Salt, wrappers[0].iterations!, 32, "sha256"), wrappers[0]);
  // the recovery wrapper: HKDF-SHA-256 over the code's 20 bytes, its use and vault as info, then RFC 3394
  const fromRecovery = unwrapWith(new Uint8Array(hkdfSync("sha256", parseRecovery(recoveryCode)!, fromBase64url(wrappers[1].salt)!, `moneylens/v1/recovery/${vault.id}`, 32)), wrappers[1]);
  assert.equal(fromPassphrase.length, 32);
  assert.equal(hex(fromPassphrase), hex(fromRecovery), "both wrappers hold the same vault key");
  // the blob: version, 12-byte nonce, AES-256-GCM ciphertext, 16-byte tag; format, vault, chunk and type authenticated
  assert.equal(blob.length, 1 + 12 + plaintext.length + 16);
  assert.equal(blob[0], VERSION);
  const d = createDecipheriv("aes-256-gcm", fromPassphrase, blob.subarray(1, 13));
  d.setAAD(utf8(`moneylens/v${VERSION}\n${vault.id}\n${name.id}\n${name.type}`));
  d.setAuthTag(blob.subarray(blob.length - 16));
  assert.equal(hex(Buffer.concat([d.update(blob.subarray(13, blob.length - 16)), d.final()])), hex(plaintext));
  // T-6 in miniature: what would be stored shows nothing of what was sealed
  assert.ok(!Buffer.from(blob).toString("latin1").includes("MARKER-7f3a"));
  assert.ok(!base64url(blob).includes("MARKER"));
});

test("the right passphrase opens it, however it was typed; a wrong one doesn't", async () => {
  const { vault, wrappers } = await made();
  const name = chunk();
  const blob = await seal(vault, name, utf8("hello"));
  for (const typed of [PASSPHRASE, `  ${PASSPHRASE}\n`, `${fullWidth("tidal")} marmot quartz lantern`, "tidal  marmot quartz   lantern"]) {
    const again = await vaultOf(wrappers[0], { kind: "passphrase", passphrase: typed });
    assert.equal(again.id, vault.id);
    assert.equal(again.key.extractable, false);
    assert.deepEqual(await open(again, name, blob), utf8("hello"));
  }
  for (const typed of ["tidal marmot quartz lanterm", "Tidal marmot quartz lantern", "tidalmarmot quartz lantern", ""]) {
    assert.equal(await opened(wrappers[0], { kind: "passphrase", passphrase: typed }), "wrong-secret", JSON.stringify(typed));
  }
});

test("the recovery code opens it; a wrong or miscopied one doesn't", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const blob = await seal(vault, name, utf8("hello"));
  for (const typed of [recoveryCode, recoveryCode.toLowerCase(), recoveryCode.replace(/-/g, " "), ` ${recoveryCode.replace(/-/g, "")} `, recoveryCode.replace(/0/g, "O").replace(/1/g, "l"), fullWidth(recoveryCode.replace(/-/g, ""))]) {
    const again = await vaultOf(wrappers[1], { kind: "recovery", code: typed });
    assert.deepEqual(await open(again, name, blob), utf8("hello"));
  }
  const other = recoveryCode[0] === "7" ? `8${recoveryCode.slice(1)}` : `7${recoveryCode.slice(1)}`;
  for (const typed of [other, recoveryCode.slice(0, -1), "", "not a code"]) assert.equal(await opened(wrappers[1], { kind: "recovery", code: typed }), "wrong-secret", typed);
  // each secret only fits its own wrapper
  assert.equal(await opened(wrappers[0], { kind: "recovery", code: recoveryCode }), "wrong-secret");
  assert.equal(await opened(wrappers[1], { kind: "passphrase", passphrase: PASSPHRASE }), "wrong-secret");
  assert.equal(await opened(wrappers[1], { kind: "passphrase", passphrase: recoveryCode }), "wrong-secret");
});

test("a wrapper relabelled as another vault's does not open, so the vault's id can be believed", async () => {
  const { wrappers, recoveryCode } = await made();
  const elsewhere = newId();
  // the server hands back the user's real wrappers with the vault's id changed
  assert.equal(await opened({ ...wrappers[0], vault: elsewhere }, { kind: "passphrase", passphrase: PASSPHRASE }), "wrong-secret");
  assert.equal(await opened({ ...wrappers[1], vault: elsewhere }, { kind: "recovery", code: recoveryCode }), "wrong-secret");
  // and the fields that make the key are bound too: another salt, another iteration count
  assert.equal(await opened({ ...wrappers[0], salt: wrappers[1].salt }, { kind: "passphrase", passphrase: PASSPHRASE }), "wrong-secret");
  assert.equal(await opened({ ...wrappers[0], iterations: PBKDF2_ITERATIONS + 1 }, { kind: "passphrase", passphrase: PASSPHRASE }), "wrong-secret");
  // a recovery wrapper passed off as a passkey's, with the code's own bytes offered as the passkey's secret
  const asPasskey = { ...wrappers[1], kind: "passkey" as const, credential: "abcd" };
  const padded = new Uint8Array(32);
  padded.set(parseRecovery(recoveryCode)!);
  assert.equal(await opened(asPasskey, { kind: "passkey", prf: padded }), "wrong-secret");
});

test("sealing: every blob is different, and it opens only as the chunk it was sealed as", async () => {
  const { vault } = await made();
  const name = chunk();
  const plaintext = utf8("the same words twice");
  const [a, b] = [await seal(vault, name, plaintext), await seal(vault, name, plaintext)];
  assert.notEqual(hex(a), hex(b), "a fresh nonce each time");
  assert.notEqual(hex(a.subarray(1, 13)), hex(b.subarray(1, 13)));
  assert.deepEqual(await open(vault, name, a), plaintext);
  assert.deepEqual(await open(vault, name, b), plaintext);
  assert.deepEqual(await open(vault, name, await seal(vault, name, new Uint8Array(0))), new Uint8Array(0));
  // moved to another chunk, another type, or another vault: it doesn't open
  assert.equal(await open(vault, { id: newId(), type: name.type }, a), null);
  assert.equal(await open(vault, { id: name.id, type: "rules" }, a), null);
  assert.equal(await open({ id: newId(), key: vault.key }, name, a), null);
  const stranger = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  assert.equal(await open({ id: vault.id, key: stranger }, name, a), null);
  // names that aren't names are an error, not a silent pass
  await assert.rejects(seal(vault, { id: "short", type: "txns" }, plaintext), RangeError);
  await assert.rejects(seal(vault, { id: name.id, type: "Has\nNewline" }, plaintext), RangeError);
  await assert.rejects(open(vault, { id: name.id, type: "" }, a), RangeError);
  await assert.rejects(seal(vault, name, new Uint8Array(MAX_CHUNK_BYTES + 1)), RangeError);
  assert.equal((await seal(vault, name, new Uint8Array(MAX_CHUNK_BYTES))).length, 1 + 12 + MAX_CHUNK_BYTES + 16);
});

test("a key that could be exported is never used, whoever built the vault object (VAULT-3)", async () => {
  const { vault } = await made();
  const name = chunk();
  const blob = await seal(vault, name, utf8("hello"));
  const exportable = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  await assert.rejects(seal({ id: vault.id, key: exportable }, name, utf8("hello")), RangeError);
  await assert.rejects(open({ id: vault.id, key: exportable }, name, blob), RangeError);
});

test("tampering: one flipped bit anywhere, a cut, or an added byte, and it doesn't open", async () => {
  const { vault } = await made();
  const name = chunk();
  const blob = await seal(vault, name, utf8("opening balance 1029.92, closing balance 1234.56"));
  for (let at = 0; at < blob.length; at++) {
    const changed = blob.slice();
    changed[at] = changed[at]! ^ (1 << (at % 8));
    assert.equal(await open(vault, name, changed), null, `byte ${at}`);
  }
  assert.equal(await open(vault, name, blob.subarray(0, blob.length - 1)), null);
  assert.equal(await open(vault, name, blob.subarray(1)), null);
  assert.equal(await open(vault, name, Uint8Array.of(...blob, 0)), null);
  assert.equal(await open(vault, name, new Uint8Array(0)), null);
  assert.equal(await open(vault, name, new Uint8Array(28)), null);
  // a blob that claims a later version is not read, and says what it claims
  const later = blob.slice();
  later[0] = VERSION + 1;
  assert.ok(isNewer(later) && !isNewer(blob) && !isNewer(new Uint8Array(0)));
  assert.equal(await open(vault, name, later), null);
});

test("JSON in a chunk", async () => {
  const { vault } = await made();
  const name = chunk();
  const value = { txns: [{ id: "a", amount: -8437, description: "大统华 T&T" }], n: null };
  assert.deepEqual(await openJson(vault, name, await sealJson(vault, name, value)), { value });
  assert.deepEqual(await openJson(vault, name, await sealJson(vault, name, null)), { value: null });
  assert.equal(await openJson(vault, name, await seal(vault, name, utf8("{not json"))), null);
  assert.equal(await openJson(vault, name, await seal(vault, name, Uint8Array.of(0xff, 0xfe, 0x7b))), null);
  assert.equal(await openJson(vault, { id: newId(), type: "txns" }, await sealJson(vault, name, value)), null);
});

test("a weak passphrase makes no vault (VAULT-7, T-25)", async () => {
  assert.deepEqual(await createVault("short"), { ok: false, why: "too-short" });
  assert.deepEqual(await createVault("password1234"), { ok: false, why: "common" });
  assert.deepEqual(await createVault("P@ssw0rd-2026"), { ok: false, why: "common" });
  assert.deepEqual(await createVault("abcabcabcabc"), { ok: false, why: "pattern" });
  assert.deepEqual(await createVault("Maplewood2026!!"), { ok: false, why: "few-words" });
});

test("changing the passphrase keeps the data readable; the old secret is asked for (VAULT-7, T-25)", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const blob = await sealJson(vault, name, { kept: true });
  const old = { kind: "passphrase", passphrase: PASSPHRASE } as const;
  assert.deepEqual(await rewrap(wrappers[0], { kind: "passphrase", passphrase: "not the passphrase" }, { kind: "passphrase", passphrase: "violet anchor nineteen cedar" }), { ok: false, why: "wrong-secret" });
  assert.deepEqual(await rewrap(wrappers[0], old, { kind: "passphrase", passphrase: "qwertyuiop12" }), { ok: false, why: "pattern" });
  assert.deepEqual(await rewrap({ ...wrappers[0], v: 2 } as unknown as Wrapper, old, { kind: "recovery" }), { ok: false, why: "unsupported" });
  const changed = await rewrap(wrappers[0], old, { kind: "passphrase", passphrase: "violet anchor nineteen cedar" }, new Date("2026-12-01T00:00:00Z"));
  assert.ok(changed.ok);
  assert.ok(isWrapper(changed.wrapper));
  assert.equal(changed.recoveryCode, undefined);
  assert.equal(changed.wrapper.vault, vault.id);
  assert.notEqual(changed.wrapper.id, wrappers[0].id);
  assert.notEqual(changed.wrapper.salt, wrappers[0].salt);
  const reopened = await vaultOf(changed.wrapper, { kind: "passphrase", passphrase: "violet anchor nineteen cedar" });
  assert.equal(reopened.key.extractable, false);
  assert.deepEqual(await openJson(reopened, name, blob), { value: { kept: true } });
  // the new wrapper doesn't take the old passphrase; the recovery code can make a passphrase wrapper too
  assert.equal(await opened(changed.wrapper, old), "wrong-secret");
  const viaRecovery = await rewrap(wrappers[1], { kind: "recovery", code: recoveryCode }, { kind: "passphrase", passphrase: "harbour seal eleven maples" });
  assert.ok(viaRecovery.ok);
  const again = await vaultOf(viaRecovery.wrapper, { kind: "passphrase", passphrase: "harbour seal eleven maples" });
  assert.deepEqual(await openJson(again, name, blob), { value: { kept: true } });
});

test("a new recovery code, and a passkey, open the same vault", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const blob = await sealJson(vault, name, { kept: true });
  const viaCode = { kind: "recovery", code: recoveryCode } as const;
  const fresh = await rewrap(wrappers[1], viaCode, { kind: "recovery" });
  assert.ok(fresh.ok && fresh.recoveryCode);
  assert.notEqual(fresh.recoveryCode, recoveryCode);
  assert.deepEqual(await openJson(await vaultOf(fresh.wrapper, { kind: "recovery", code: fresh.recoveryCode }), name, blob), { value: { kept: true } });
  assert.equal(await opened(fresh.wrapper, viaCode), "wrong-secret", "the old code doesn't fit the new wrapper");
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const credential = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const passkey = await rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential, label: "Steve's phone" });
  assert.ok(passkey.ok);
  assert.ok(isWrapper(passkey.wrapper));
  assert.deepEqual([passkey.wrapper.kind, passkey.wrapper.kdf, passkey.wrapper.credential, passkey.wrapper.label], ["passkey", "hkdf-sha256", credential, "Steve's phone"]);
  assert.deepEqual(await openJson(await vaultOf(passkey.wrapper, { kind: "passkey", prf }), name, blob), { value: { kept: true } });
  assert.equal(await opened(passkey.wrapper, { kind: "passkey", prf: crypto.getRandomValues(new Uint8Array(32)) }), "wrong-secret");
  assert.equal(await opened(passkey.wrapper, { kind: "passkey", prf: prf.subarray(0, 31) }), "wrong-secret");
});

test("a new wrapper is one that can be used: a passkey's fields are checked, and its label is cut whole", async () => {
  const { wrappers, recoveryCode } = await made();
  const viaCode = { kind: "recovery", code: recoveryCode } as const;
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const credential = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await assert.rejects(rewrap(wrappers[1], viaCode, { kind: "passkey", prf: prf.subarray(0, 16), credential }), RangeError);
  await assert.rejects(rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential: "not base64url!" }), RangeError);
  await assert.rejects(rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential: "" }), RangeError);
  // a credential longer than any wrapper may hold is refused here, not written and found unusable later
  await assert.rejects(rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential: "A".repeat(1404) }), RangeError);
  const longest = await rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential: "A".repeat(1400) });
  assert.ok(longest.ok && isWrapper(longest.wrapper));
  // sixty-one phones: the label is cut to sixty characters, never through the middle of one
  const phone = String.fromCodePoint(0x1f4f1);
  const labelled = await rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential, label: phone.repeat(61) });
  assert.ok(labelled.ok && isWrapper(labelled.wrapper));
  assert.equal(labelled.wrapper.label, phone.repeat(60));
  assert.ok(typeof (await opened(labelled.wrapper, { kind: "passkey", prf })) === "object");
});

test("a wrapper from storage is checked before it is used, and the answer says it was the wrapper", async () => {
  const { wrappers } = await made();
  const [p, r] = wrappers;
  const bad: unknown[] = [
    null,
    "wrapper",
    {},
    { ...p, v: 2 },
    { ...p, id: "x" },
    { ...p, vault: "x" },
    { ...p, vault: `${p.vault.slice(0, 21)}B` },
    { ...p, iterations: PBKDF2_FLOOR - 1 },
    { ...p, iterations: 1 },
    { ...p, iterations: PBKDF2_CEILING + 1 },
    { ...p, iterations: 600_000.5 },
    { ...p, iterations: undefined },
    { ...p, kdf: "hkdf-sha256" },
    { ...p, kind: "something" },
    { ...p, salt: p.salt.slice(2) },
    { ...p, salt: 5 },
    { ...p, wrapped: p.wrapped.slice(2) },
    { ...p, wrapped: `${p.wrapped}AAAA` },
    { ...p, created: 5 },
    { ...r, kdf: "pbkdf2-sha256" },
    { ...r, iterations: 600_000 },
    { ...r, kind: "passkey" },
    { ...r, kind: "passkey", credential: "" },
    { ...r, kind: "passkey", credential: "!!" },
    { ...r, kind: "passkey", credential: "A".repeat(1404) },
    { ...r, kind: "passkey", credential: "abcd", label: "x".repeat(61) },
  ];
  // not one of them gets as far as deriving a key
  const real = subtle.deriveKey;
  let derivations = 0;
  subtle.deriveKey = function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto["deriveKey"]>) {
    derivations++;
    return real.apply(this, args);
  } as SubtleCrypto["deriveKey"];
  try {
    for (const w of bad) {
      assert.ok(!isWrapper(w), JSON.stringify(w));
      assert.equal(await opened(w as Wrapper, { kind: "passphrase", passphrase: PASSPHRASE }), "unsupported");
    }
    assert.equal(derivations, 0);
    // (the spy does see a real attempt)
    const sound = await opened(r, { kind: "recovery", code: (await made()).recoveryCode });
    assert.ok(typeof sound === "object");
    assert.equal(derivations, 1);
  } finally {
    subtle.deriveKey = real;
  }
  assert.ok(isWrapper({ ...r, kind: "passkey", credential: "abcd" }));
});
