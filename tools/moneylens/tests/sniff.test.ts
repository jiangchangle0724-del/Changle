// IMP-4: a file is what its bytes say it is, whatever its name.
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FILE_BYTES, sniff } from "../src/core/sniff";
import { bankV1, bytesOf, cardV2 } from "./samples";

const ascii = (text: string): Uint8Array => bytesOf(text);
const utf16 = (text: string): Uint8Array => {
  const out = new Uint8Array(2 + text.length * 2);
  out.set([0xff, 0xfe]);
  for (let i = 0; i < text.length; i++) out[2 + i * 2] = text.charCodeAt(i);
  return out;
};

test("statements", () => {
  assert.deepEqual(sniff(bytesOf(bankV1())), { kind: "ofx" });
  assert.deepEqual(sniff(bytesOf(cardV2())), { kind: "ofx" });
  assert.deepEqual(sniff(ascii("\r\n  OFXHEADER:100\r\nDATA:OFXSGML")), { kind: "ofx" });
  assert.deepEqual(sniff(Uint8Array.of(0xef, 0xbb, 0xbf, ...ascii("OFXHEADER:100"))), { kind: "ofx" });
  assert.deepEqual(sniff(utf16("OFXHEADER:100\r\n<OFX>")), { kind: "ofx" });
  assert.deepEqual(sniff(ascii("%PDF-1.7\n%âãÏÓ")), { kind: "pdf" });
  assert.deepEqual(sniff(ascii("Date,Description,Amount\n2026-10-01,COFFEE,-4.50\n")), { kind: "text" });
  assert.deepEqual(sniff(utf16("Date,Description\n")), { kind: "text" });
});

test("everything else is refused, with what it is", () => {
  const why = (bytes: Uint8Array) => {
    const s = sniff(bytes);
    return s.kind === "unsupported" ? s.why : s.kind;
  };
  assert.equal(why(new Uint8Array(0)), "empty");
  assert.equal(why(new Uint8Array(MAX_FILE_BYTES + 1)), "too-big");
  assert.equal(why(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00)), "archive");
  assert.equal(why(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1)), "spreadsheet");
  assert.equal(why(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), "image");
  assert.equal(why(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10)), "image");
  assert.equal(why(ascii("GIF89a....")), "image");
  assert.equal(why(Uint8Array.of(0, 0, 0, 0x18, ...ascii("ftypheic"))), "image");
  assert.equal(why(ascii("<!DOCTYPE html><html><body>Session expired")), "web-page");
  assert.equal(why(ascii("\n<html lang=en>")), "web-page");
  assert.equal(why(Uint8Array.of(0x41, 0x00, 0x42, 0x01, 0x02)), "binary");
});

test("a statement's name on something else changes nothing", () => {
  // the bytes of a PNG are a PNG, even if the file is called statement.csv: there is no name to pass in
  assert.equal(sniff.length, 1);
});
