/*
 * 你画我猜's hint for an English word, as the rooms server sends it: a blank for each letter, with the
 * word's spaces and hyphens as they are ("______ ________ __ ________" for Living paycheck to paycheck).
 */

/**
 * The hint as a phone shows it: the blanks spaced out, a wide gap between words, and each word's
 * blanks kept together on one line (a no-break space inside a word, an em space between words, where
 * a line may break). Plain spaces would collapse into one and the words would run together.
 */
export function hintBlanks(en: string) {
  return en
    .split(" ")
    .filter(Boolean)
    .map((word) => Array.from(word).join(" "))
    .join(" ");
}

/** What a screen reader says instead of the blanks: "6 letters", "4 words: 6, 8, 2 and 8 letters". */
export function hintSay(en: string) {
  const lengths = en
    .split(" ")
    .map((word) => (word.match(/_/g) ?? []).length)
    .filter((n) => n > 0);
  if (lengths.length <= 1) return `${lengths[0] ?? 0} letters`;
  const last = lengths[lengths.length - 1];
  return `${lengths.length} words: ${lengths.slice(0, -1).join(", ")} and ${last} letters`;
}
