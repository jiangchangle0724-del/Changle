/** Independent reader of security-assessment.md 1.1, 1.3 and 1.4.
 * Written before reading the vault implementation. Node/OpenSSL only, no WebCrypto.
 * Test oracle, not production code: returned key bytes belong to the caller.
 */
import { createDecipheriv, hkdfSync, pbkdf2Sync } from 'node:crypto';

export function normalize(passphrase: string): string {
  return passphrase.normalize('NFKC')
    .replace(/[\u00ad\u061c\u180e\u200b\u200e-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufe00-\ufe0f\ufeff\u{e0100}-\u{e01ef}]/gu, '')
    .normalize('NFKC')
    .replace(/[\u02bb\u02bc\u2018-\u201b\u2032\u2039\u203a\u300e\u300f]/gu, "'")
    .replace(/[\u00ab\u00bb\u201c-\u201f\u300c\u300d\u301d-\u301f]/gu, '"')
    .replace(/[\u301c\u3030]/gu, '~')
    .replace(/[-\u2010-\u2015\u2212\u2e3a\u2e3b]+/gu, '-')
    .replace(/\u3002/gu, '.')
    .replace(/[\u2027\u30fb]/gu, '\u00b7')
    .replace(/[ \u0009-\u000d\u1680\u2028\u2029]+/gu, ' ')
    .replace(/^ +| +$/gu, '');
}

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Reads the displayed spelling (eight groups of four, then two check symbols).
 * Deliberately does not implement the UI's optional aliases/separators.
 */
export function recoveryBytes(code: string): Uint8Array | null {
  if (!/^(?:[0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{2}$/.test(code)) return null;
  const symbols = code.replace(/-/g, '');
  let value = 0n;
  for (const symbol of symbols.slice(0, 32)) value = value * 32n + BigInt(alphabet.indexOf(symbol));
  const check = alphabet.indexOf(symbols[32]!) * 32 + alphabet.indexOf(symbols[33]!);
  if (value % 1021n !== BigInt(check)) return null;
  const bytes = new Uint8Array(20);
  for (let i = 19; i >= 0; i--) {
    bytes[i] = Number(value & 255n);
    value >>= 8n;
  }
  return bytes;
}

function base64(text: string, size: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const bytes = Buffer.from(text, 'base64url');
  return bytes.length === size && bytes.toString('base64url') === text ? bytes : null;
}

export function vaultKey(
  wrapper: { vault: string; kind: 'passphrase' | 'recovery' | 'passkey'; iterations?: number; salt: string; wrapped: string },
  secret: { passphrase: string } | { recovery: string } | { prf: Uint8Array },
): Uint8Array | null {
  const salt = base64(wrapper.salt, 32);
  const wrapped = base64(wrapper.wrapped, 40);
  if (!salt || !wrapped || !base64(wrapper.vault, 16)) return null;
  let wrappingKey: Buffer | undefined;
  let input: Buffer | undefined;
  try {
    const context = `moneylens/v1/${wrapper.kind}/${wrapper.vault}`;
    if (wrapper.kind === 'passphrase' && 'passphrase' in secret) {
      const count = wrapper.iterations;
      // Assessment 1.2: v1 writes 600,000; reject unbounded storage-controlled work.
      if (!Number.isInteger(count) || count! < 600_000 || count! > 2_000_000) return null;
      input = Buffer.from(normalize(secret.passphrase), 'utf8');
      wrappingKey = pbkdf2Sync(input, Buffer.concat([Buffer.from(context + '\n'), salt]), count!, 32, 'sha256');
    } else if (wrapper.kind === 'recovery' && 'recovery' in secret) {
      const bytes = recoveryBytes(secret.recovery);
      if (!bytes) return null;
      input = Buffer.from(bytes);
      bytes.fill(0);
      wrappingKey = Buffer.from(hkdfSync('sha256', input, salt, context, 32));
    } else if (wrapper.kind === 'passkey' && 'prf' in secret && secret.prf.length === 32) {
      input = Buffer.from(secret.prf);
      wrappingKey = Buffer.from(hkdfSync('sha256', input, salt, context, 32));
    } else return null;
    const decipher = createDecipheriv('id-aes256-wrap', wrappingKey, Buffer.alloc(8, 0xa6));
    const key = Buffer.concat([decipher.update(wrapped), decipher.final()]);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  } finally {
    wrappingKey?.fill(0);
    input?.fill(0);
  }
}

export function openChunk(
  key: Uint8Array, vault: string, chunk: { id: string; type: string }, blob: Uint8Array,
): Uint8Array | null {
  if (key.length !== 32 || !base64(vault, 16) || !base64(chunk.id, 16)
    || !/^[a-z][a-z0-9-]{0,31}$/.test(chunk.type) || blob.length < 29 || blob[0] !== 1) return null;
  const pending: Buffer[] = [];
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(1, 13), { authTagLength: 16 });
    decipher.setAAD(Buffer.from(`moneylens/v1\n${vault}\n${chunk.id}\n${chunk.type}`, 'utf8'));
    decipher.setAuthTag(blob.subarray(blob.length - 16));
    pending.push(decipher.update(blob.subarray(13, blob.length - 16)));
    pending.push(decipher.final());
    return Buffer.concat(pending);
  } catch {
    return null;
  } finally {
    for (const bytes of pending) bytes.fill(0);
  }
}
