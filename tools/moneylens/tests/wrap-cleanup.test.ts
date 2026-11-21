// All inputs are invented test data; no real financial data or credentials are used.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createVault, rewrap, unlock } from "../src/vault/crypto";

const PASSPHRASE = "cobalt otter lantern meadow";

async function existingVault() {
  const made = await createVault(PASSPHRASE);
  assert.ok(made.ok, "the invented passphrase must make a vault");
  return made;
}

function captureRecovery(t: TestContext) {
  const arrays: Uint8Array[] = [];
  const realRandom = crypto.getRandomValues.bind(crypto);
  const random = t.mock.method(crypto, "getRandomValues", (array: Uint8Array<ArrayBuffer>) => {
    const filled = realRandom(array);
    if (filled.byteLength === 20) arrays.push(filled);
    return filled;
  });
  return { arrays, random };
}

function assertCleared(arrays: Uint8Array[]) {
  assert.equal(arrays.length, 1, "exactly one recovery buffer must have been captured");
  assert.equal(arrays[0]!.length, 20, "the recovery buffer must contain 20 bytes");
  // Assert a boolean so a failure never prints secret byte values.
  assert.ok(arrays[0]!.every((byte) => byte === 0), "generated recovery bytes must be cleared");
}

test("1: rewrap clears recovery bytes when wrapKey rejects", async (t) => {
  const made = await existingVault();
  const { arrays, random } = captureRecovery(t);
  const failure = new Error("injected wrapKey failure");
  const wrap = t.mock.method(crypto.subtle, "wrapKey", async () => { throw failure; });
  try {
    await assert.rejects(
      rewrap(made.wrappers[0], { kind: "passphrase", passphrase: PASSPHRASE }, { kind: "recovery" }),
      (error: unknown) => error === failure,
    );
    assert.equal(wrap.mock.callCount(), 1);
    assertCleared(arrays);
  } finally {
    wrap.mock.restore();
    random.mock.restore();
    arrays.forEach((array) => array.fill(0));
  }
});

test("2: rewrap clears recovery bytes when the new wrapper's deriveKey rejects", async (t) => {
  const made = await existingVault();
  const { arrays, random } = captureRecovery(t);
  const failure = new Error("injected deriveKey failure");
  const realDerive = crypto.subtle.deriveKey.bind(crypto.subtle);
  let calls = 0;
  const derive = t.mock.method(crypto.subtle, "deriveKey", async (...args: Parameters<typeof realDerive>) => {
    if (++calls === 2) throw failure;
    return realDerive(...args);
  });
  try {
    await assert.rejects(
      rewrap(made.wrappers[0], { kind: "passphrase", passphrase: PASSPHRASE }, { kind: "recovery" }),
      (error: unknown) => error === failure,
    );
    assert.equal(calls, 2, "the old wrapper's derivation succeeds before the new one rejects");
    assertCleared(arrays);
  } finally {
    derive.mock.restore();
    random.mock.restore();
    arrays.forEach((array) => array.fill(0));
  }
});

test("3: createVault clears recovery bytes when the second wrapKey rejects", async (t) => {
  const { arrays, random } = captureRecovery(t);
  const failure = new Error("injected second wrapKey failure");
  const realWrap = crypto.subtle.wrapKey.bind(crypto.subtle);
  let calls = 0;
  const wrap = t.mock.method(crypto.subtle, "wrapKey", async (...args: Parameters<typeof realWrap>) => {
    if (++calls === 2) throw failure;
    return realWrap(...args);
  });
  try {
    await assert.rejects(createVault(PASSPHRASE), (error: unknown) => error === failure);
    assert.equal(calls, 2, "the passphrase wrapper succeeds before the recovery wrapper rejects");
    assertCleared(arrays);
  } finally {
    wrap.mock.restore();
    random.mock.restore();
    arrays.forEach((array) => array.fill(0));
  }
});

test("4: successful recovery rewrap clears its bytes and the returned code unlocks", async (t) => {
  const made = await existingVault();
  const { arrays, random } = captureRecovery(t);
  try {
    const result = await rewrap(made.wrappers[0], { kind: "passphrase", passphrase: PASSPHRASE }, { kind: "recovery" });
    assert.ok(result.ok, "rewrap must succeed");
    assertCleared(arrays);
    assert.ok(result.recoveryCode, "a successful recovery rewrap must return its display code");
    const opened = await unlock(result.wrapper, { kind: "recovery", code: result.recoveryCode }, made.vault.id);
    assert.ok(opened.ok, "the returned code must open the new wrapper");
    assert.equal(opened.vault.id, made.vault.id);
  } finally {
    random.mock.restore();
    arrays.forEach((array) => array.fill(0));
  }
});
