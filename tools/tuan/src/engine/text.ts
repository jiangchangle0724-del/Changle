// Words as people type them: any characters, trimmed, not too long. Length counts characters as
// people see them, not code units.

/** One line (a name, a title). Null when nothing is left. */
export function cleanLine(input: unknown, max: number): string | null {
  if (typeof input !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const one = input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const cut = Array.from(one).slice(0, max).join("").trim();
  return cut || null;
}

/** A few lines (a note, an address): line breaks kept, everything else as cleanLine. "" when nothing is left. */
export function cleanLines(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  const lines = input
    .split(/\r?\n/)
    // eslint-disable-next-line no-control-regex
    .map((line) => line.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[^\S\n]+/g, " ").trim());
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(text).slice(0, max).join("").trim();
}
