/**
 * Sync as it travels (src/server/wire.ts): what one end writes the other reads back, and anything
 * that is not a frame is refused as a whole.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { frame, HEAD_MAX, packPulled, packPush, packPushed, unframe, unpackPulled, unpackPush, unpackPushed } from "../src/server/wire";
import type { Pulled, Pushed, Write } from "../src/vault/sync";
import { seeded } from "./seeded";

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const big = (length: number, fill: number): Uint8Array => new Uint8Array(length).fill(fill);

test("a push, and the answers to a pull and a push, come out as they went in", () => {
  const writes: Write[] = [
    { id: "a", base: 0, blob: bytes(1, 2, 3) },
    { id: "b", base: 7, mark: "m", blob: big(70_000, 9) },
    { id: "c", base: 1, mark: "n", blob: new Uint8Array(0) },
  ];
  assert.deepEqual(unpackPush(packPush("v", writes)), { vault: "v", writes });
  // a view into a larger buffer is written as what it shows, and no more
  const inside = new Uint8Array([9, 9, 1, 2, 3, 9]).subarray(2, 5);
  assert.deepEqual(unpackPush(packPush("v", [{ id: "a", base: 0, blob: inside }]))!.writes[0]!.blob, bytes(1, 2, 3));

  const pulled: Pulled[] = [
    { ok: true, cursor: 9, more: true, digest: "d", chunks: [{ id: "a", version: 3, blob: bytes(1, 2) }, { id: "b", version: 9, blob: big(1000, 4) }] },
    { ok: true, cursor: 0, more: false, digest: "", chunks: [] },
    { ok: false, why: "wrong-vault" },
    { ok: false, why: "bad-request" },
  ];
  for (const one of pulled) assert.deepEqual(unpackPulled(packPulled(one)), one);

  const pushed: Pushed[] = [
    { ok: true, versions: [{ id: "a", version: 1 }, { id: "b", version: 2 }] },
    { ok: false, why: "stale", chunks: [{ id: "a", version: 4, blob: bytes(5, 6, 7) }, { id: "b", version: 0 }, { id: "c", version: 2, blob: big(300, 1) }] },
    { ok: false, why: "quota-writes" },
    { ok: false, why: "too-big" },
  ];
  for (const one of pushed) assert.deepEqual(unpackPushed(packPushed(one)), one);
});

test("what is not a frame is refused whole", () => {
  const good = packPush("v", [{ id: "a", base: 0, blob: bytes(1, 2, 3) }]);
  assert.ok(unpackPush(good));
  // cut short, a byte too long, no head, a head that is not JSON or not an object, a head longer than a head may be
  for (const bad of [good.subarray(0, good.length - 1), Uint8Array.from([...good, 0]), new Uint8Array(0), bytes(0, 0, 0), bytes(0, 0, 0, 2, 0x7b, 0x7b), bytes(0, 0, 0, 2, 0x5b, 0x5d), bytes(0, 0, 0, 4, 0x6e, 0x75, 0x6c, 0x6c), bytes(0xff, 0xff, 0xff, 0xff, 1, 2)]) {
    assert.equal(unpackPush(bad), null);
    assert.equal(unpackPulled(bad), null);
    assert.equal(unpackPushed(bad), null);
  }
  assert.equal(unframe(frame({ pad: "x".repeat(HEAD_MAX) })), null);
  assert.ok(unframe(frame({ pad: "x".repeat(HEAD_MAX - 20) })));
  // text that is not UTF-8
  assert.equal(unframe(bytes(0, 0, 0, 4, 0x22, 0xff, 0xfe, 0x22)), null);
  // sizes that are not counts, that pass the end, or that leave bytes over
  for (const sizes of [[-1], [1.5], ["3"], [4], [1, 1], [1e20], [null], [1.5, 1.5], [true, 2], [4, -1]]) assert.equal(unpackPush(frame({ vault: "v", writes: sizes.map((size) => ({ id: "a", base: 0, bytes: size })) }, [bytes(1, 2, 3)])), null);
  // a write with no blob, entries that are not objects, a list that is no list, too many
  assert.equal(unpackPush(frame({ vault: "v", writes: [{ id: "a", base: 0 }] })), null);
  assert.equal(unpackPush(frame({ vault: "v", writes: [3] })), null);
  assert.equal(unpackPush(frame({ vault: "v", writes: { 0: { bytes: 0 } } })), null);
  assert.equal(unpackPush(frame({ vault: "v", writes: Array.from({ length: 1001 }, () => ({ id: "a", base: 0, bytes: 0 })) })), null);
  assert.ok(unpackPush(frame({ vault: "v", writes: Array.from({ length: 1000 }, () => ({ id: "a", base: 0, bytes: 0 })) })));
  // an answer has to say whether it is a yes or a no, and a no that carries bytes is only ever "stale"
  assert.equal(unpackPulled(frame({ cursor: 1, more: false, digest: "", chunks: [] })), null);
  assert.equal(unpackPulled(frame({ ok: false, why: "wrong-vault" }, [bytes(1)])), null);
  assert.equal(unpackPulled(frame({ ok: false })), null);
  assert.equal(unpackPulled(frame({ ok: true, cursor: 1, more: false, digest: "", chunks: [{ id: "a", version: 1 }] })), null);
  assert.equal(unpackPushed(frame({ ok: true, versions: [] }, [bytes(1)])), null);
  assert.equal(unpackPushed(frame({ ok: true })), null);
  assert.equal(unpackPushed(frame({ ok: false, why: "too-big" }, [bytes(1)])), null);
  assert.equal(unpackPushed(frame({ ok: false, why: "stale", chunks: [{ id: "a", version: 1, bytes: 2 }] }, [bytes(1)])), null);
  assert.equal(unpackPushed(frame({ ok: "yes", versions: [] })), null);
});

test("whatever the bytes, reading them answers and does not throw", () => {
  const random = seeded(5);
  const good = [packPush("v", [{ id: "a", base: 0, blob: bytes(1, 2, 3) }]), packPulled({ ok: true, cursor: 1, more: false, digest: "d", chunks: [{ id: "a", version: 1, blob: bytes(4, 5) }] }), packPushed({ ok: false, why: "stale", chunks: [{ id: "a", version: 2, blob: bytes(6) }] })];
  for (let round = 0; round < 3000; round++) {
    const from = good[round % good.length]!.slice();
    // a few bytes changed, or the end cut off, or noise
    const changed = random() < 0.2 ? Uint8Array.from({ length: Math.floor(random() * 60) }, () => Math.floor(random() * 256)) : from.subarray(0, random() < 0.3 ? Math.floor(random() * from.length) : from.length);
    for (let i = 0; i < 3 && changed.length; i++) if (random() < 0.7) changed[Math.floor(random() * changed.length)] = Math.floor(random() * 256);
    for (const read of [unpackPush, unpackPulled, unpackPushed]) {
      const out = read(changed);
      assert.ok(out === null || typeof out === "object");
    }
  }
});
