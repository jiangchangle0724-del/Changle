// Who the host means to ask, and who of them hasn't answered yet (还差谁). A name on the list
// counts as answered when someone of that name has a row: the host writes 小王 and 小王 fills in.
// Letters match in any case or width, so "may" finds "May" and "Ｍａｙ".
import { cleanText } from "./text";
import type { Person } from "./types";

/** The most names a list holds: as many as can answer. */
export const INVITED_MAX = 40;

/** Names as the host types them: one a line, or between 、，,;；. Never split at a space: "Mary Ann" is one name. */
export const splitNames = (text: string): string[] =>
  text
    .split(/[\n\r、，,;；]+/)
    .map((name) => name.trim())
    .filter(Boolean);

/** A name as compared: full-width letters made ordinary, one space between words, any case. */
const key = (name: string): string => name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
export const sameName = (a: string, b: string): boolean => key(a) === key(b);

/** The list as kept: each name cleaned like a person's, each name once. Null when it isn't a list, or has more than `most` names. */
export function cleanInvited(input: unknown, nameMax: number, most: number): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const raw of input) {
    const name = cleanText(raw, nameMax);
    if (name && !out.some((had) => sameName(had, name))) out.push(name);
  }
  return out.length <= most ? out : null;
}

/** Who on the list has no row yet, in the list's order. Someone with a row has answered, even with no slot free. */
export const missing = (invited: readonly string[], people: readonly Pick<Person, "name">[]): string[] => invited.filter((name) => !people.some((p) => sameName(p.name, name)));
