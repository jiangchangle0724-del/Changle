// The parts of the pictures (src/client/picture.ts) that need no canvas: how words are broken into
// lines, and where the code sits. The drawn pictures themselves are read back in the browser tests
// (tests/e2e/pictures.spec.ts). Run with `npx tsx --test tests/picture.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { H, W, codePlace, wrap } from "../src/client/picture";

// a ruler that needs no font: a Chinese character is two wide, anything else one
const measure = (text: string) => [...text].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0);

test("English breaks between words, and loses the space at the break", () => {
  assert.deepEqual(wrap(measure, "Hot pot and board games on Saturday", 12), ["Hot pot and", "board games", "on Saturday"]);
  assert.deepEqual(wrap(measure, "  two   spaces\nand a line  ", 40), ["two spaces and a line"]);
  assert.deepEqual(wrap(measure, "short", 40), ["short"]);
  assert.deepEqual(wrap(measure, "   ", 40), []);
});

test("Chinese breaks between any two characters", () => {
  assert.deepEqual(wrap(measure, "周末火锅和桌游顺便看个电影", 12), ["周末火锅和桌", "游顺便看个电", "影"]);
});

test("punctuation never starts a line: it stays on the one before, even past the edge", () => {
  assert.deepEqual(wrap(measure, "周末火锅和桌，顺便看电影。", 12), ["周末火锅和桌，", "顺便看电影。"]);
  assert.deepEqual(wrap(measure, "Hot pot, then (maybe) a film.", 9), ["Hot pot,", "then", "(maybe) a", "film."]);
});

test("Chinese and English in one name", () => {
  assert.deepEqual(wrap(measure, "阿May 的生日 party 在周六", 12), ["阿May 的生日", "party 在周六"]);
});

test("a word longer than a line is cut between letters (what is left of it keeps its own line)", () => {
  assert.deepEqual(wrap(measure, "Supercalifragilistic day", 8), ["Supercal", "ifragili", "stic", "day"]);
  for (const line of wrap(measure, "https://changle.ca/when/abcd2345 请点开", 10)) assert.ok(measure(line) <= 10, line);
});

test("no line is wider than asked, whatever the words (but for punctuation that had to stay)", () => {
  const text = "周末火锅 hot pot，顺便 board games 和电影 night，再去唱歌到天亮也行 if you like";
  for (const max of [8, 13, 21, 34]) {
    const lines = wrap(measure, text, max);
    assert.equal(lines.join("").replace(/\s/g, ""), text.replace(/\s/g, ""), "nothing is lost");
    for (const line of lines) assert.ok(measure(line.replace(/[，。,.]$/, "")) <= max, `${max}: ${line}`);
  }
});

test("the code sits in the middle, whole modules, with white card all round, inside the backgrounds' empty band", () => {
  for (const kind of ["invite", "result"] as const) {
    for (const modules of [21, 25, 29, 33, 37, 41]) {
      const { left, top, cell } = codePlace(kind, modules);
      const side = cell * modules;
      assert.ok(Number.isInteger(cell) && cell >= 4, `${kind} ${modules}: a module is ${cell}px`);
      assert.ok(Math.abs(left + side / 2 - W / 2) <= 1, "centered");
      // the card is the code plus an equal border: four modules or more of quiet white on every side
      const card = kind === "invite" ? 300 : 240;
      const border = (card - side) / 2;
      assert.ok(border >= 4 * cell, `${kind} ${modules}: ${border}px of white for ${cell}px modules`);
      assert.ok(top - border >= 288 && top + side + border <= 1151, "inside the band the backgrounds leave empty");
      assert.ok(top + side < H);
    }
  }
});
