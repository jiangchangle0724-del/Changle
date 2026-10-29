// Every city has its photo (both sizes) and its recording in src/client/media, small enough for a
// phone, and a credit for each one with a licence the game may use (src/client/media.ts).
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { test } from "node:test";
import { CITIES } from "../src/engine";
import { PHOTOS, RECORDINGS } from "../src/client/media";

/** Public domain, CC BY or CC BY-SA (a country port like "3.0 de" too). No NC, no ND. */
const FREE = /^(CC0|CC BY(-SA)? \d\.\d( [a-z]{2})?)$/;

test("every city has a photo and a recording, each with its author and a free licence", () => {
  for (const c of CITIES) {
    const photo = PHOTOS[c.id];
    const rec = RECORDINGS[c.id];
    assert.ok(photo, `${c.id}: no photo in media.ts`);
    assert.ok(rec, `${c.id}: no recording in media.ts`);
    for (const m of [photo, rec]) {
      assert.match(m.license, FREE, `${c.id}: ${m.license}`);
      assert.match(m.licenseUrl, /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//, `${c.id}: ${m.licenseUrl}`);
      assert.match(m.page, /^https:\/\/(commons\.wikimedia\.org|freesound\.org)\//, `${c.id}: ${m.page}`);
      assert.ok(m.title && m.author, `${c.id}: title and author`);
    }
    assert.ok(photo.alt.zh && photo.alt.en, `${c.id}: the photo's alt text in both languages`);
    assert.ok(rec.what.zh && rec.what.en, `${c.id}: what the recording is, in both languages`);
    for (const [file, most] of [
      [`photos/${c.id}.webp`, 250_000],
      [`photos/${c.id}-s.webp`, 80_000],
      [`sounds/${c.id}.mp3`, 80_000],
    ] as const) {
      const path = `src/client/media/${file}`;
      assert.ok(existsSync(path), `${path} is missing`);
      assert.ok(statSync(path).size < most, `${path} is bigger than ${most / 1000} KB`);
    }
  }
  assert.deepEqual(Object.keys(PHOTOS).sort(), CITIES.map((c) => c.id).sort());
  assert.deepEqual(Object.keys(RECORDINGS).sort(), CITIES.map((c) => c.id).sort());
});
