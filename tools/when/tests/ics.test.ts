import assert from "node:assert/strict";
import test from "node:test";
import { googleCalendarUrl, toIcs } from "../src/engine/ics";
import type { CalendarEntry } from "../src/engine/ics";

const TITLE = [",", ";", '"', "\\", ..."聚".repeat(35), "🎉"].join("");
const BASE: CalendarEntry = {
  code: "abcdefgh",
  title: TITLE,
  day: "2026-11-21",
  part: "eve",
  setAt: Date.UTC(2026, 10, 13, 19, 20, 21, 987),
};
const ADDRESS = "https://changle.ca/when/abcdefgh";
const DESCRIPTION = `约时间定的 · Set with When Works\n${ADDRESS}`;

// Decode the RFC's content-line syntax independently of the writer.
function lines(ics: string): string[] {
  assert.ok(ics.endsWith("\r\n"), "the file ends in CRLF");
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /[\r\n]/, "no bare CR or LF");
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `physical line exceeds 75 octets: ${line}`);
    assert.doesNotMatch(line, /[\uD800-\uDFFF]/u, "no split surrogate pairs");
  }
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n").slice(0, -1);
}

function property(content: string[], name: string): string {
  const matches = content.filter((line) => line.startsWith(`${name}:`));
  assert.equal(matches.length, 1, `one ${name}`);
  return matches[0].slice(name.length + 1);
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) => char === "n" || char === "N" ? "\n" : char);
}

const cases: { day: string; part: CalendarEntry["part"]; start: string; end: string }[] = [
  { day: "2026-11-21", part: "am", start: "20261121T160000Z", end: "20261121T190000Z" },
  { day: "2026-11-21", part: "pm", start: "20261121T200000Z", end: "20261122T000000Z" },
  { day: "2026-11-21", part: "eve", start: "20261122T010000Z", end: "20261122T050000Z" },
  { day: "2026-11-21", part: "day", start: "20261121", end: "20261122" },
  { day: "2027-01-09", part: "eve", start: "20270110T010000Z", end: "20270110T050000Z" },
];

for (const { day, part, start, end } of cases) {
  const entry = { ...BASE, day, part };
  test(`ICS: ${day} ${part}, Vancouver UTC-7 even in winter`, () => {
    const ics = toIcs(entry);
    const content = lines(ics);
    assert.deepEqual(content.slice(0, 6), [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//changle.ca//When Works//ZH",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    ]);
    assert.deepEqual(content.slice(-2), ["END:VEVENT", "END:VCALENDAR"]);
    assert.equal(content.length, 15, "exactly one event with the required properties");
    assert.equal(property(content, "UID"), "abcdefgh@when.changle.ca");
    assert.equal(property(content, "DTSTAMP"), "20261113T192021Z");
    assert.equal(property(content, "URL"), ADDRESS);
    assert.equal(unescapeText(property(content, "SUMMARY")), TITLE);
    assert.equal(unescapeText(property(content, "DESCRIPTION")), DESCRIPTION);
    const value = part === "day" ? ";VALUE=DATE" : "";
    assert.equal(property(content, `DTSTART${value}`), start);
    assert.equal(property(content, `DTEND${value}`), end);
    assert.doesNotMatch(ics, /VTIMEZONE|TZID/);
  });

  test(`Google Calendar: ${day} ${part}, matching dates and title`, () => {
    const url = new URL(googleCalendarUrl(entry));
    assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["action", "dates", "details", "text"]);
    assert.equal(url.searchParams.get("action"), "TEMPLATE");
    assert.equal(url.searchParams.get("text"), TITLE);
    assert.equal(url.searchParams.get("dates"), `${start}/${end}`);
    assert.equal(url.searchParams.get("details"), DESCRIPTION);
    assert.equal(url.hash, "");
  });
}

test("40-character mixed title: TEXT escaping and UTF-8 folding round-trip", () => {
  assert.equal([...TITLE].length, 40);
  const ics = toIcs(BASE);
  assert.match(ics, /\r\n /, "Chinese text is folded");
  const summary = property(lines(ics), "SUMMARY");
  assert.ok(summary.startsWith('\\,\\;"\\\\'), "commas, semicolons and backslashes are escaped; quotes are literal");
  assert.equal(unescapeText(summary), TITLE);
});

test("TEXT newlines cannot create calendar properties, and literal escapes survive", () => {
  const title = "朋友,;\"\\n\r\nBEGIN:VEVENT\n甲\r乙";
  const content = lines(toIcs({ ...BASE, title }));
  assert.equal(content.filter((line) => line === "BEGIN:VEVENT").length, 1);
  assert.equal(unescapeText(property(content, "SUMMARY")), title.replace(/\r\n|\r/g, "\n"));
  const url = new URL(googleCalendarUrl({ ...BASE, title }));
  assert.equal(url.searchParams.get("text"), title);
});

test("Google Calendar safely encodes reserved characters in the title", () => {
  const title = "火锅 & 茶? #1 + 50% / =好";
  const url = new URL(googleCalendarUrl({ ...BASE, title }));
  assert.equal(url.searchParams.size, 4);
  assert.equal(url.searchParams.get("text"), title);
  assert.equal(url.searchParams.get("details"), DESCRIPTION);
  assert.equal(url.hash, "");
});

test("folding counts two-, three- and four-octet characters and continuation spaces", () => {
  const title = "聚".repeat(22) + "🎉é" + "会".repeat(15);
  assert.equal([...title].length, 39);
  const ics = toIcs({ ...BASE, title });
  assert.ok(ics.includes(`SUMMARY:${"聚".repeat(22)}\r\n 🎉é`), "a four-octet character cannot fit after 74 octets");
  assert.equal(unescapeText(property(lines(ics), "SUMMARY")), title);
});

test("folding retains a line of exactly 75 octets", () => {
  // SUMMARY: is eight bytes; 21 Chinese characters and one emoji use another 67.
  const title = "聚".repeat(21) + "🎉" + "会".repeat(18);
  assert.equal([...title].length, 40);
  const ics = toIcs({ ...BASE, title });
  const summaryLine = ics.split("\r\n").find((line) => line.startsWith("SUMMARY:"))!;
  assert.equal(Buffer.byteLength(summaryLine), 75);
  assert.equal(unescapeText(property(lines(ics), "SUMMARY")), title);
});

test("whole-day exclusive end rolls over months, years and leap day", () => {
  for (const [day, start, end] of [
    ["2026-11-30", "20261130", "20261201"],
    ["2026-12-31", "20261231", "20270101"],
    ["2028-02-29", "20280229", "20280301"],
  ]) {
    const entry: CalendarEntry = { ...BASE, day, part: "day" };
    const content = lines(toIcs(entry));
    assert.equal(property(content, "DTSTART;VALUE=DATE"), start);
    assert.equal(property(content, "DTEND;VALUE=DATE"), end);
    assert.equal(new URL(googleCalendarUrl(entry)).searchParams.get("dates"), `${start}/${end}`);
  }
});
