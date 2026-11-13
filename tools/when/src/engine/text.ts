// Names and titles as people type them: any characters, trimmed, one line, not too long.

/** Null when nothing is left. Length counts characters as people see them, not code units. */
export function cleanText(input: unknown, max: number): string | null {
  if (typeof input !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const one = input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const cut = Array.from(one).slice(0, max).join("").trim();
  return cut || null;
}
