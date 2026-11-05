# C1: the card bank to 300

**Files:** `site/src/data/straightface.ts` only (the `CARDS` array; `PACKS` and `PACK_NAMES` stay).
**Output:** ≥ 300 cards: trivia ≥ 80, vancouver ≥ 60, food ≥ 60, slang ≥ 60, the rest anywhere.
Each pack's difficulty about 1:2:1 (level 1 : 2 : 3), and level 3 at least 15 cards a pack.
**Command:** `npx tsx tests/straightface.test.ts` (the validator runs inside it), then
`npx tsc --noEmit`.

The 47 cards there are the model: copy their shape, their length and their tone. The validator
(`site/src/shared/straightface/cards.ts`, `validateDeck`) refuses a card that breaks a hard rule;
`lintDeck` prints warnings an editor must look at.

## Every card

- `id`: lowercase slug, unique.
- `term`: what the whole table sees, in both languages. **The original name or a transliteration
  only, never a gloss that explains it** ("雨后泥土味 Petrichor" hands the answer to the room; the
  card says "Petrichor", the meaning goes in the definition). No brackets. `lintDeck` flags a
  Chinese term that shares two or more characters with its definition: look at each one; a name
  that simply repeats itself (蔡格尼克效应 / 蔡格尼克) is fine, a gloss is not.
- `definition`: the facts of the source page in our own words, never a copied or lightly reworded
  sentence. Chinese ≤ 60 characters, English ≤ 160; at most three facts, one of them a year, a
  place of origin or a number (the honest player has 15 seconds to read it and needs one detail
  that sounds like knowledge).
- `bluffSeeds`: two per language, each ≤ 40 characters, wrong but plausible ("a Greek dessert").
  The validator refuses a seed that appears in the definition.
- `funFact`: one line for the reveal, both languages, ≤ 60 / 160; also checkable on the source.
- `source`: a page that opens (Wikipedia, Wiktionary, Oxford's word-of-the-year pages, a city or
  museum page); when there is none (Chinese internet slang often), `"editorial"`, and list those
  ids in the PR.
- `adult: true` only for sexual or drug content. Alcohol vocabulary (Mickey, Two-four, Caesar) is
  not adult.
- Never: a real private person's name; politics; religion; jokes at a region or an ethnic group;
  anything from 《瞎掰王》/ 9UPPER.
- The Vancouver pack: BC slang, Canadian English, local place names and their stories, local food,
  words borrowed from First Nations languages only where they are everyday English, with the
  source's own account of them.

## When it's done

- `npx tsx tests/straightface.test.ts` prints `all good` (the deck test has a ceiling on lint
  warnings; raise it in the PR only for warnings you have looked at and name).
- The PR says how many cards per pack and per level, lists the `editorial` ids, and shows five
  sample cards.
