# C4: titles (normalise, similarity, fingerprint)

**Files:** a new `tools/events/src/dedupe.ts` and `tools/events/tests/dedupe.test.ts`.
**Output:** `normalize(title: string): string`, `similarity(a: string, b: string): number`,
`fingerprint(title: string, date: string, venueId: string | null): string`.
**Command:** `npx vitest run tests/dedupe.test.ts`

The same event comes from two sources with two titles. These three functions are how the run
(task A4, Claude's) tells: same fingerprint, merge; similar enough, the review queue; else apart.

## Input: `tools/events/tests/fixtures/dedupe/pairs.json`

30 pairs, all on the same day at the same venue, each with `expect` (same, suspect or different),
`similarity` (three places) and the sorted words of each title.

## Exactly how (so the numbers match)

**normalize(title)**: Unicode NFKD, combining marks removed (é to e); lower case; every character
that isn't a letter or a number (`[^\p{L}\p{N}]`, so `_` too) becomes a space; spaces between two
CJK characters (U+3400 to U+9FFF, U+F900 to U+FAFF) removed, so a Chinese phrase is one word;
split on spaces; drop these words: tickets, ticket, vancouver, yvr, the, a, an, and, at, vs, v,
with, presents, live, in, of; drop years 2020 to 2039 (a whole word `20[23]\d`); remove 温哥华
from inside CJK words; drop empty words. Return the **unique words, sorted** (by code point),
joined by one space.

**similarity(a, b)**, a token set ratio in 0 to 1: A and B are the word sets of `normalize(a)` and
`normalize(b)`. Either empty: 0. `I` = A∩B sorted and joined by spaces; `DA` = A−B, `DB` = B−A,
likewise; `T1` = (I + " " + DA) trimmed, `T2` = (I + " " + DB) trimmed. If I isn't empty and DA or
DB is: 1. Otherwise the largest of r(I, T1), r(I, T2) (both only when I isn't empty) and
r(T1, T2), where r(x, y) = 2 × LCS(x, y) / (|x| + |y|), LCS being the longest common subsequence
of characters.

**fingerprint(title, date, venueId)**: `"fp-" + hash(normalize(title) + "|" + date + "|" + (venueId ?? ""))`,
with `hash` from `src/store.ts`. `date` is the Vancouver date, "YYYY-MM-DD".

A pair is **same** when the two normalised titles are equal; **suspect** when not and similarity
is at least 0.85; **different** otherwise.

## Done when

All 30 pairs get their `expect`; `normalize` gives each `normalizedA` / `normalizedB`; similarity is
within 0.001 of each `similarity`. Two events with the same normalised title, date and venue get
one fingerprint; a different date or venue, another.
