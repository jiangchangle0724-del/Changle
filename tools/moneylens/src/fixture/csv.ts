/**
 * A CSV statement with the same layout and invented contents (IMP-9): the same lines and fields,
 * the same delimiter, quotes and line endings, the row of column names as it was, and every word
 * and number under it invented (invent.ts). The operator shares this in place of the file his
 * bank gave him, which stays on his device (SEC-12).
 *
 * The numbers are invented one by one: a column of balances in such a file no longer follows from
 * its amounts. A file whose sums still add up needs the reader's understanding of the layout, and
 * is the next step for this tool.
 */
import { csvPreview, readAnyCsv } from "../core/anycsv";
import { maskNumbers, tidy } from "../core/text";
import { Inventor, isPlainNumber, type Random } from "./invent";

type Field = { value: string; quoted: boolean; lead: string; trail: string };
type Line = { fields: Field[]; end: string };

/** The text cut into lines and fields, keeping what writing it back needs: which fields were in quotes, the spaces around them, and how each line ended. */
function scan(text: string, delimiter: string): Line[] {
  const lines: Line[] = [];
  let i = 0;
  const blank = (c: string | undefined): boolean => (c === " " || c === "\t") && c !== delimiter;
  while (i < text.length) {
    const fields: Field[] = [];
    let end = "";
    for (;;) {
      let lead = "";
      while (blank(text[i])) lead += text[i++];
      let value = "";
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        i++;
        while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) {
          if (text[i] === '"') i++;
          value += text[i++];
        }
        i++;
      }
      while (i < text.length && text[i] !== delimiter && text[i] !== "\n" && text[i] !== "\r") value += text[i++];
      const trail = quoted ? "" : (/[ \t]+$/.exec(value)?.[0] ?? "");
      fields.push({ value: trail ? value.slice(0, -trail.length) : value, quoted, lead, trail });
      if (text[i] === delimiter) {
        i++;
        continue;
      }
      if (text[i] === "\r" && text[i + 1] === "\n") end = "\r\n";
      else if (text[i] === "\n" || text[i] === "\r") end = text[i]!;
      i += end.length;
      break;
    }
    lines.push({ fields, end });
  }
  return lines;
}

export type CsvFixture = { text: string; delimiter: string; /** The line kept as it was, counting from 0: the row of column names. */ header: number | null };

export function inventCsv(text: string, random: Random): CsvFixture {
  const mark = text.startsWith("﻿") ? "﻿" : "";
  const body = text.slice(mark.length);
  const shown = csvPreview(body);
  const delimiter = shown?.delimiter ?? ",";
  const lines = scan(body, delimiter);
  // the row of column names, found again among the lines: the first whose cells are the names the reader saw
  const cut = (cells: readonly string[]): string => {
    const all = cells.map((cell) => tidy(maskNumbers(cell.trim()), 40));
    while (all.length && all[all.length - 1] === "") all.pop();
    return all.join("\n");
  };
  const names = shown?.names ? cut(shown.names) : null;
  const header = names === null ? -1 : lines.findIndex((line) => cut(line.fields.map((field) => field.value)) === names);
  const inventor = new Inventor(random);
  lines.forEach((line, n) => {
    if (n !== header) for (const field of line.fields) inventor.learn(field.value);
  });
  // The column the reader takes the account from, when it can read the file. A reader tells the accounts in a file apart
  // by what stands there, so one real account has to come out as one invented account, and two as two.
  const read = readAnyCsv(body);
  const account = read.ok ? read.layout.account : undefined;
  /** What a cell that is one number and nothing else was given: the same number again gets the same again. */
  const given = new Map<string, string>();
  const written = lines.map((line, n) => {
    const fields = line.fields.map((field, column) => {
      let value: string;
      // (in the row of names the words stay; a number there is nobody's column name, so it goes)
      if (n === header) value = field.value.replace(/\d/g, () => String(Math.floor(random() * 10)));
      else if (column === account) value = inventor.account(field.value);
      else if (isPlainNumber(field.value)) {
        // (a file the reader can't read yet may keep its account in such a column too, and is the file most worth sharing)
        if (!given.has(field.value)) given.set(field.value, inventor.text(field.value));
        value = given.get(field.value)!;
      } else value = inventor.text(field.value);
      const quote = field.quoted || value.includes(delimiter) || /["\r\n]/.test(value);
      return `${field.lead}${quote ? `"${value.replace(/"/g, '""')}"` : value}${field.trail}`;
    });
    return fields.join(delimiter) + line.end;
  });
  return { text: mark + written.join(""), delimiter, header: header < 0 ? null : header };
}
