// All inputs here are invented test data. Never use real financial data or credentials.
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { GOLDEN } from './golden';
import { normalize, recoveryBytes, vaultKey, openChunk } from './second/vault';
import { normalizePassphrase, weakness } from '../src/vault/passphrase';
import { newRecovery } from '../src/vault/recovery';
import { createVault, sealJson, unlock, isWrapper, type Wrapper } from '../src/vault/crypto';

function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}
const decode = (text: string) => Buffer.from(text, 'base64url');
const json = (bytes: Uint8Array | null): unknown => {
  assert.ok(bytes, 'chunk must authenticate before reading JSON');
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
};
const goldenPassphrase = () => "老王面馆 don't stop--tidal \u2764 42.";

test('second opinion: stored vault opens by all three independent derivations', () => {
  const [passphrase, recovery, passkey] = GOLDEN.wrappers;
  const keys = [
    vaultKey(passphrase, { passphrase: goldenPassphrase() }),
    vaultKey(recovery, { recovery: GOLDEN.recoveryCode }),
    vaultKey(passkey, { prf: decode(GOLDEN.prf) }),
  ];
  try {
    for (const key of keys) {
      assert.ok(key, 'stored wrapper must open');
      assert.ok(Buffer.from(key).equals(Buffer.from(keys[0]!)), 'all methods must yield the same key');
      assert.deepEqual(json(openChunk(key, GOLDEN.vault, GOLDEN.chunk, decode(GOLDEN.blob))), GOLDEN.value);
    }
    assert.equal(vaultKey(passphrase, { passphrase: 'invented wrong input' }), null);
    assert.equal(vaultKey(passkey, { prf: new Uint8Array(32) }), null);
    assert.equal(vaultKey(recovery, { recovery: 'invalid invented code' }), null);
    assert.equal(vaultKey({ ...passphrase, iterations: 600_001 }, { passphrase: goldenPassphrase() }), null);
    for (const wrapper of GOLDEN.wrappers) {
      const secret = wrapper.kind === 'passphrase' ? { passphrase: goldenPassphrase() }
        : wrapper.kind === 'recovery' ? { recovery: GOLDEN.recoveryCode } : { prf: decode(GOLDEN.prf) };
      const changed = decode(wrapper.wrapped);
      changed[0] = changed[0]! ^ 1;
      assert.equal(vaultKey({ ...wrapper, wrapped: changed.toString('base64url') }, secret), null);
    }
  } finally {
    keys.forEach(key => key?.fill(0));
  }
});

test('second opinion: normalization table, neighbours and 200,000 seeded strings', () => {
  const points = new Set<number>();
  const ranges = [
    [0x00ad, 0x00ad], [0x061c, 0x061c], [0x180e, 0x180e], [0x200b, 0x200b],
    [0x200e, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f],
    [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xe0100, 0xe01ef],
    [0x02bb, 0x02bc], [0x2018, 0x201f], [0x2032, 0x2032], [0x2039, 0x203a],
    [0x300c, 0x300f], [0x00ab, 0x00ab], [0x00bb, 0x00bb], [0x301d, 0x301f],
    [0x301c, 0x301c], [0x3030, 0x3030], [0x2010, 0x2015], [0x2212, 0x2212],
    [0x2e3a, 0x2e3b], [0x3002, 0x3002], [0x2027, 0x2027], [0x30fb, 0x30fb],
    [0x0009, 0x000d], [0x1680, 0x1680], [0x2028, 0x2029],
    [0x20, 0x7e], [0x300, 0x36f], [0xff00, 0xffef],
  ];
  for (const [first, last] of ranges) {
    for (let cp = first! - 1; cp <= last! + 1; cp++) points.add(cp);
  }
  for (const ch of '老王面馆中文かな한글❤😀👩‍💻👨‍👩‍👧‍👦') points.add(ch.codePointAt(0)!);
  const alphabet = [...points].map(cp => String.fromCodePoint(cp));
  const check = (input: string) => {
    const expected = normalize(input);
    assert.equal(normalizePassphrase(input), expected, `invented normalization input ${JSON.stringify(input)}`);
    assert.equal(normalize(expected), expected, 'independent normalization must be idempotent');
  };
  // Explicit coverage so even rare selectors and neighbours cannot be missed by sampling.
  for (const ch of alphabet) {
    check(ch);
    check(`a${ch}\u0301`);
    check(`-${ch}—`);
  }
  const next = generator(0xc1a55e55);
  for (let i = 0; i < 200_000; i++) {
    const length = 1 + next() % 12;
    let input = '';
    for (let j = 0; j < length; j++) input += alphabet[next() % alphabet.length];
    check(input);
  }
});

test('second opinion: 2,000 seeded recovery codes reject every single-symbol substitution', () => {
  const next = generator(0xc1b32c0d);
  const random = mock.method(globalThis.crypto, 'getRandomValues', (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) array[i] = next() & 255;
    return array;
  });
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  try {
    for (let i = 0; i < 2_000; i++) {
      const { code, bytes } = newRecovery();
      const read = recoveryBytes(code);
      assert.ok(read && Buffer.from(read).equals(Buffer.from(bytes)), 'recovery bytes must match');
      read.fill(0);
      bytes.fill(0);
      for (let position = 0; position < code.length; position++) {
        if (code[position] === '-') continue;
        for (const symbol of alphabet) {
          if (symbol === code[position]) continue;
          const changed = code.slice(0, position) + symbol + code.slice(position + 1);
          assert.equal(recoveryBytes(changed), null, `single substitution at ${position}, sample ${i}`);
        }
      }
    }
  } finally {
    random.mock.restore();
  }
});

test('second opinion: new vault wrappers, chunk binding and corruption', async () => {
  // Invented passphrase and content, unrelated to any real account.
  const passphrase = ['invented', 'otter', 'comet', 'lantern', '739'].join(' ');
  const made = await createVault(passphrase);
  assert.ok(made.ok);
  const keys = [
    vaultKey(made.wrappers[0], { passphrase }),
    vaultKey(made.wrappers[1], { recovery: made.recoveryCode }),
  ];
  try {
    const key = keys[0];
    assert.ok(key && keys[1]);
    assert.ok(Buffer.from(key).equals(Buffer.from(keys[1])), 'new wrappers must yield the same key');
    const chunk = { id: Buffer.from('invented-chunk01').toString('base64url'), type: 'test-records' };
    const value = { synthetic: true, note: 'invented test content', count: 7 };
    const blob = await sealJson(made.vault, chunk, value);
    assert.deepEqual(json(openChunk(key, made.vault.id, chunk, blob)), value);
    assert.equal(openChunk(key, GOLDEN.vault, chunk, blob), null);
    assert.equal(openChunk(key, made.vault.id, { ...chunk, id: GOLDEN.chunk.id }, blob), null);
    assert.equal(openChunk(key, made.vault.id, { ...chunk, type: 'other' }, blob), null);
    for (let i = 0; i < blob.length; i++) {
      const changed = blob.slice();
      changed[i] = changed[i]! ^ 1;
      assert.equal(openChunk(key, made.vault.id, chunk, changed), null);
    }
    for (let length = 0; length < blob.length; length++) {
      assert.equal(openChunk(key, made.vault.id, chunk, blob.subarray(0, length)), null);
    }
    assert.equal(openChunk(key, made.vault.id, chunk, Buffer.concat([blob, Buffer.of(0)])), null);
    for (const wrapper of made.wrappers) {
      const secret: { passphrase: string } | { recovery: string } = wrapper.kind === 'passphrase'
        ? { passphrase } : { recovery: made.recoveryCode };
      assert.equal(vaultKey({ ...wrapper, vault: GOLDEN.vault }, secret), null);
      const salt = decode(wrapper.salt);
      salt[0] = salt[0]! ^ 1;
      assert.equal(vaultKey({ ...wrapper, salt: salt.toString('base64url') }, secret), null);
    }
  } finally {
    keys.forEach(key => key?.fill(0));
  }
});

test('second opinion: storage validation and unlock failure categories', async () => {
  const wrapper = { ...GOLDEN.wrappers[0] } as Wrapper;
  const malformed: unknown[] = [null, {}, { ...wrapper, v: 2 }, { ...wrapper, kdf: 'hkdf-sha256' },
    { ...wrapper, iterations: 599_999 }, { ...wrapper, iterations: 2_000_001 },
    { ...wrapper, iterations: NaN }, { ...wrapper, iterations: 600_000.5 },
    { ...wrapper, salt: wrapper.salt + '=' }, { ...wrapper, salt: 'AA' },
    { ...wrapper, wrapped: 'AA' }, { ...wrapper, vault: wrapper.vault + '\n' },
    { ...wrapper, id: 'invalid' }];
  let derivations = 0;
  const derive = mock.method(crypto.subtle, 'deriveKey', async () => {
    derivations++;
    throw new Error('invalid records must not reach derivation');
  });
  try {
    for (const input of malformed) {
      assert.equal(isWrapper(input), false);
      assert.deepEqual(await unlock(input as Wrapper, { kind: 'passphrase', passphrase: goldenPassphrase() }),
        { ok: false, why: 'unsupported' });
    }
    assert.deepEqual(await unlock(wrapper, { kind: 'passphrase', passphrase: goldenPassphrase() }, GOLDEN.chunk.id),
      { ok: false, why: 'wrong-vault' });
    assert.equal(derivations, 0, 'malformed or wrong-vault records must be refused before deriving');
  } finally {
    derive.mock.restore();
  }
  assert.deepEqual(await unlock(wrapper, { kind: 'passphrase', passphrase: 'invented incorrect secret' }),
    { ok: false, why: 'wrong-secret' });
});

test('second opinion: passphrase floor documented boundary examples', () => {
  // All invented; these illustrate the stated floor, not a strength guarantee.
  assert.equal(weakness('Maplewood2026!!'), 'few-words');
  assert.equal(weakness('123qweasdzxc'), 'pattern');
  assert.equal(weakness('otter comet lantern'), null);
  assert.equal(weakness('JohnSmith2026!'), null); // Stated name-recognition limitation.
});
