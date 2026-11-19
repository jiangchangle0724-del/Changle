// The CSV reader: what bank exports really look like, and its limits (T-11).
import assert from "node:assert/strict";
import test from "node:test";
import { CsvError, filled, parseCsv } from "../src/core/csv";

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof CsvError) return e.code;
    throw e;
  }
  return "no error";
};

test("plain rows, with any of the three line endings", () => {
  const want = [["a", "b", "c"], ["1", "2", "3"]];
  assert.deepEqual(parseCsv("a,b,c\n1,2,3\n"), want);
  assert.deepEqual(parseCsv("a,b,c\r\n1,2,3\r\n"), want);
  assert.deepEqual(parseCsv("a,b,c\r1,2,3"), want);
  assert.deepEqual(parseCsv("a,b,c\n1,2,3"), want);
});

test("quotes: commas, line breaks and doubled quotes inside them", () => {
  assert.deepEqual(parseCsv('"SMITH, JOHN","said ""hi""","two\nlines"\n'), [["SMITH, JOHN", 'said "hi"', "two\nlines"]]);
  assert.deepEqual(parseCsv('"",x,""\n'), [["", "x", ""]]);
  assert.deepEqual(parseCsv('""""\n'), [['"']]);
  assert.deepEqual(parseCsv('"a"\n'), [["a"]]);
  assert.deepEqual(parseCsv('""'), [[""]]);
});

test("sloppy quoting is kept as written, not thrown away", () => {
  assert.deepEqual(parseCsv('5" SCREEN,10\n'), [['5" SCREEN', "10"]]);
  assert.deepEqual(parseCsv('"abc"def,1\n'), [["abcdef", "1"]]);
});

test("empty fields, blank lines and the mark at the start of the file", () => {
  assert.deepEqual(parseCsv("a,,c\n,,\n"), [["a", "", "c"], ["", "", ""]]);
  assert.deepEqual(parseCsv("a\n\nb\n"), [["a"], [""], ["b"]]);
  assert.deepEqual(parseCsv(`${String.fromCharCode(0xfeff)}a,b\n`), [["a", "b"]]);
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv("\n"), [[""]]);
  assert.deepEqual(filled(parseCsv("a,b\n\n , \nc,d\n")), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseCsv(" a , b "), [[" a ", " b "]], "fields are not trimmed here");
});

test("other separators", () => {
  assert.deepEqual(parseCsv("a;b,c;d\n", { delimiter: ";" }), [["a", "b,c", "d"]]);
  assert.deepEqual(parseCsv("a\tb\n", { delimiter: "\t" }), [["a", "b"]]);
});

test("limits: a file that goes on too long is stopped, with the reason", () => {
  assert.equal(code(() => parseCsv('a,"never closed\nmore')), "unterminated-quote");
  assert.equal(code(() => parseCsv("1\n2\n3\n", { maxRows: 2 })), "too-many-rows");
  assert.equal(parseCsv("1\n2\n", { maxRows: 2 }).length, 2);
  assert.equal(code(() => parseCsv("a,b,c\n", { maxFields: 2 })), "too-many-fields");
  assert.equal(code(() => parseCsv("abcdef\n", { maxFieldChars: 5 })), "field-too-long");
  assert.equal(code(() => parseCsv(`"${"x".repeat(3000)}"`)), "field-too-long");
  assert.equal(code(() => parseCsv(",".repeat(200))), "too-many-fields");
});
