// T-9 and part of T-25: the vault's cryptography. Published known-answer tests for each primitive;
// the vault's own wrappers and blobs re-derived with a second implementation (Node's OpenSSL
// bindings); a wrong passphrase fails; the recovery code unlocks; anything tampered with is refused;
// changing the passphrase keeps the data readable.
import assert from "node:assert/strict";
import { createDecipheriv, hkdfSync, pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { base64url, fromBase64url, newId } from "../src/core/ids";
import { createVault, hkdfParams, isNewer, isWrapper, MAX_CHUNK_BYTES, open, openJson, PBKDF2_FLOOR, PBKDF2_ITERATIONS, pbkdf2Params, rewrap, seal, sealJson, unlock, VERSION, type Created, type Wrapper } from "../src/vault/crypto";
import { parseRecovery } from "../src/vault/recovery";

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

test("known answers: PBKDF2-HMAC-SHA-256 (RFC 7914, section 11), with the vault's own parameters", async () => {
  const derive = async (password: string, salt: string, iterations: number) => {
    const base = await subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
    return hex(await subtle.deriveBits(pbkdf2Params(utf8(salt), iterations), base, 512));
  };
  assert.equal(await derive("passwd", "salt", 1), "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783");
  assert.equal(await derive("Password", "NaCl", 80000), "4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d");
});

test("known answers: HKDF-SHA-256 (RFC 5869, test case 1), and the vault's parameters against a second implementation", async () => {
  const base = await subtle.importKey("raw", unhex("0b".repeat(22)), "HKDF", false, ["deriveBits"]);
  const okm = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: unhex("000102030405060708090a0b0c"), info: unhex("f0f1f2f3f4f5f6f7f8f9") }, base, 42 * 8);
  assert.equal(hex(okm), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const salt = crypto.getRandomValues(new Uint8Array(32));
  for (const kind of ["recovery", "passkey"] as const) {
    const ours = await subtle.deriveBits(hkdfParams(salt, kind), await subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]), 256);
    assert.equal(hex(ours), hex(hkdfSync("sha256", secret, salt, `moneylens/v1/${kind}`, 32)));
  }
  // the use is part of the key: the same secret gives unrelated keys for a recovery code and a passkey
  const a = await subtle.deriveBits(hkdfParams(salt, "recovery"), await subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]), 256);
  const b = await subtle.deriveBits(hkdfParams(salt, "passkey"), await subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]), 256);
  assert.notEqual(hex(a), hex(b));
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

test("a new vault: two wrappers, a recovery code, and a key that can't be taken out", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const [byPassphrase, byRecovery] = wrappers;
  assert.ok(isWrapper(byPassphrase) && isWrapper(byRecovery));
  assert.deepEqual([byPassphrase.kind, byPassphrase.kdf, byPassphrase.iterations], ["passphrase", "pbkdf2-sha256", PBKDF2_ITERATIONS]);
  assert.deepEqual([byRecovery.kind, byRecovery.kdf, byRecovery.iterations], ["recovery", "hkdf-sha256", undefined]);
  assert.ok(PBKDF2_ITERATIONS >= PBKDF2_FLOOR && PBKDF2_FLOOR >= 600_000);
  assert.equal(byPassphrase.vault, vault.id);
  assert.equal(byRecovery.vault, vault.id);
  assert.notEqual(byPassphrase.id, byRecovery.id);
  assert.notEqual(byPassphrase.salt, byRecovery.salt);
  assert.equal(byPassphrase.created, "2026-11-19T08:00:00.000Z");
  assert.match(recoveryCode, /^(?:[0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  // VAULT-3: the key in use is not exportable
  assert.equal(vault.key.extractable, false);
  assert.deepEqual([vault.key.algorithm.name, (vault.key.algorithm as AesKeyAlgorithm).length], ["AES-GCM", 256]);
  await assert.rejects(subtle.exportKey("raw", vault.key));
  // nothing a wrapper holds is the passphrase, the recovery code or the vault key
  const stored = JSON.stringify(wrappers);
  assert.ok(!stored.includes(PASSPHRASE) && !stored.includes(recoveryCode) && !stored.includes(recoveryCode.replace(/-/g, "")));
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
  // the passphrase wrapper: PBKDF2-HMAC-SHA-256 over the NFKC, trimmed passphrase, then RFC 3394
  const fromPassphrase = unwrapWith(pbkdf2Sync(PASSPHRASE.normalize("NFKC").trim(), fromBase64url(wrappers[0].salt)!, wrappers[0].iterations!, 32, "sha256"), wrappers[0]);
  // the recovery wrapper: HKDF-SHA-256 over the code's 20 bytes, then RFC 3394
  const fromRecovery = unwrapWith(new Uint8Array(hkdfSync("sha256", parseRecovery(recoveryCode)!, fromBase64url(wrappers[1].salt)!, "moneylens/v1/recovery", 32)), wrappers[1]);
  assert.equal(fromPassphrase.length, 32);
  assert.equal(hex(fromPassphrase), hex(fromRecovery), "both wrappers hold the same vault key");
  // the blob: version, 12-byte nonce, AES-256-GCM ciphertext, 16-byte tag; vault, chunk and type authenticated
  assert.equal(blob.length, 1 + 12 + plaintext.length + 16);
  assert.equal(blob[0], VERSION);
  const d = createDecipheriv("aes-256-gcm", fromPassphrase, blob.subarray(1, 13));
  d.setAAD(utf8(`moneylens/v1\n${vault.id}\n${name.id}\n${name.type}`));
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
  for (const typed of [PASSPHRASE, `  ${PASSPHRASE}\n`, "ｔｉｄａｌ marmot quartz lantern"]) {
    const opened = await unlock(wrappers[0], { kind: "passphrase", passphrase: typed });
    assert.ok(opened, JSON.stringify(typed));
    assert.equal(opened.id, vault.id);
    assert.equal(opened.key.extractable, false);
    assert.deepEqual(await open(opened, name, blob), utf8("hello"));
  }
  for (const typed of ["tidal marmot quartz lanterm", "Tidal marmot quartz lantern", "tidal  marmot quartz lantern", ""]) {
    assert.equal(await unlock(wrappers[0], { kind: "passphrase", passphrase: typed }), null, JSON.stringify(typed));
  }
});

test("the recovery code opens it; a wrong or mistyped one doesn't", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const blob = await seal(vault, name, utf8("hello"));
  for (const typed of [recoveryCode, recoveryCode.toLowerCase(), recoveryCode.replace(/-/g, " "), ` ${recoveryCode.replace(/-/g, "")} `, recoveryCode.replace(/0/g, "O").replace(/1/g, "l")]) {
    const opened = await unlock(wrappers[1], { kind: "recovery", code: typed });
    assert.ok(opened, typed);
    assert.deepEqual(await open(opened, name, blob), utf8("hello"));
  }
  const other = recoveryCode[0] === "7" ? `8${recoveryCode.slice(1)}` : `7${recoveryCode.slice(1)}`;
  for (const typed of [other, recoveryCode.slice(0, -1), "", "not a code"]) assert.equal(await unlock(wrappers[1], { kind: "recovery", code: typed }), null, typed);
  // each secret only fits its own wrapper
  assert.equal(await unlock(wrappers[0], { kind: "recovery", code: recoveryCode }), null);
  assert.equal(await unlock(wrappers[1], { kind: "passphrase", passphrase: PASSPHRASE }), null);
  assert.equal(await unlock(wrappers[1], { kind: "passphrase", passphrase: recoveryCode }), null);
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
  await assert.rejects(seal(vault, name, new Uint8Array(MAX_CHUNK_BYTES + 1)), RangeError);
  assert.equal((await seal(vault, name, new Uint8Array(MAX_CHUNK_BYTES))).length, 1 + 12 + MAX_CHUNK_BYTES + 16);
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
  // a blob from a later version says so, instead of looking damaged
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
  assert.deepEqual(await createVault("abcabcabcabc"), { ok: false, why: "pattern" });
});

test("changing the passphrase keeps the data readable; the old secret is asked for (VAULT-7, T-25)", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const blob = await sealJson(vault, name, { kept: true });
  const old = { kind: "passphrase", passphrase: PASSPHRASE } as const;
  assert.deepEqual(await rewrap(wrappers[0], { kind: "passphrase", passphrase: "not the passphrase" }, { kind: "passphrase", passphrase: "violet anchor nineteen cedar" }), { ok: false, why: "wrong-secret" });
  assert.deepEqual(await rewrap(wrappers[0], old, { kind: "passphrase", passphrase: "qwertyuiop12" }), { ok: false, why: "pattern" });
  const changed = await rewrap(wrappers[0], old, { kind: "passphrase", passphrase: "violet anchor nineteen cedar" }, new Date("2026-12-01T00:00:00Z"));
  assert.ok(changed.ok);
  assert.ok(isWrapper(changed.wrapper));
  assert.equal(changed.recoveryCode, undefined);
  assert.equal(changed.wrapper.vault, vault.id);
  assert.notEqual(changed.wrapper.id, wrappers[0].id);
  assert.notEqual(changed.wrapper.salt, wrappers[0].salt);
  const reopened = await unlock(changed.wrapper, { kind: "passphrase", passphrase: "violet anchor nineteen cedar" });
  assert.ok(reopened);
  assert.equal(reopened.key.extractable, false);
  assert.deepEqual(await openJson(reopened, name, blob), { value: { kept: true } });
  // the new wrapper doesn't take the old passphrase; the recovery code can make a passphrase wrapper too
  assert.equal(await unlock(changed.wrapper, old), null);
  const viaRecovery = await rewrap(wrappers[1], { kind: "recovery", code: recoveryCode }, { kind: "passphrase", passphrase: "harbour seal eleven maples" });
  assert.ok(viaRecovery.ok);
  const again = await unlock(viaRecovery.wrapper, { kind: "passphrase", passphrase: "harbour seal eleven maples" });
  assert.deepEqual(await openJson(again!, name, blob), { value: { kept: true } });
});

test("a new recovery code, and a passkey, open the same vault", async () => {
  const { vault, wrappers, recoveryCode } = await made();
  const name = chunk();
  const blob = await sealJson(vault, name, { kept: true });
  const viaCode = { kind: "recovery", code: recoveryCode } as const;
  const fresh = await rewrap(wrappers[1], viaCode, { kind: "recovery" });
  assert.ok(fresh.ok && fresh.recoveryCode);
  assert.notEqual(fresh.recoveryCode, recoveryCode);
  assert.deepEqual(await openJson((await unlock(fresh.wrapper, { kind: "recovery", code: fresh.recoveryCode }))!, name, blob), { value: { kept: true } });
  assert.equal(await unlock(fresh.wrapper, viaCode), null, "the old code doesn't fit the new wrapper");
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const credential = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const passkey = await rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential, label: "Steve's phone" });
  assert.ok(passkey.ok);
  assert.ok(isWrapper(passkey.wrapper));
  assert.deepEqual([passkey.wrapper.kind, passkey.wrapper.kdf, passkey.wrapper.credential, passkey.wrapper.label], ["passkey", "hkdf-sha256", credential, "Steve's phone"]);
  assert.deepEqual(await openJson((await unlock(passkey.wrapper, { kind: "passkey", prf }))!, name, blob), { value: { kept: true } });
  assert.equal(await unlock(passkey.wrapper, { kind: "passkey", prf: crypto.getRandomValues(new Uint8Array(32)) }), null);
  assert.equal(await unlock(passkey.wrapper, { kind: "passkey", prf: prf.subarray(0, 31) }), null);
  await assert.rejects(rewrap(wrappers[1], viaCode, { kind: "passkey", prf: prf.subarray(0, 16), credential }), RangeError);
  await assert.rejects(rewrap(wrappers[1], viaCode, { kind: "passkey", prf, credential: "not base64url!" }), RangeError);
});

test("a wrapper from storage is checked before it is used", async () => {
  const { wrappers } = await made();
  const [p, r] = wrappers;
  const bad: unknown[] = [
    null,
    "wrapper",
    {},
    { ...p, v: 2 },
    { ...p, id: "x" },
    { ...p, vault: "x" },
    { ...p, iterations: PBKDF2_FLOOR - 1 },
    { ...p, iterations: 1 },
    { ...p, iterations: 10_000_001 },
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
    { ...r, kind: "passkey", credential: "abcd", label: "x".repeat(61) },
  ];
  for (const w of bad) {
    assert.ok(!isWrapper(w), JSON.stringify(w));
    assert.equal(await unlock(w as Wrapper, { kind: "passphrase", passphrase: PASSPHRASE }), null);
  }
  assert.ok(isWrapper({ ...r, kind: "passkey", credential: "abcd" }));
  // a wrapper with fewer iterations than the floor is refused without ever deriving a key from it
  const started = Date.now();
  assert.equal(await unlock({ ...p, iterations: 1000 }, { kind: "passphrase", passphrase: PASSPHRASE }), null);
  assert.ok(Date.now() - started < 50);
});
