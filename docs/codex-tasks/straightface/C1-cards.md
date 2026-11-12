# C1: the card bank to 300

**Done 2026-11-05:** 300 cards, every pack 17 or more (written by Claude's helpers with sources,
PR after the online one). Kept for the rules: the next cards follow the same ones.
**2026-11-11 (upgrade 8):** 400 cards. Four new packs of 25 (Steve chose new packs): yueyu 粤语俚语
and hangdang 老行当 for Chinese tables, animals 动物冷知识 for any table, oldjobs for English tables;
each with its icon. The list below is the 17 packs of 2026-11-05; `PACKS` has all 21.

**Files:** `site/src/data/straightface.ts` only (the `CARDS` array; `PACKS`, `PACK_NAMES` and
`PACK_AUDIENCE` stay). A new pack also needs a picture in `site/src/party/straightface/art/packs/`
(ask Steve; see `art/README.md`), so new cards go into the packs that exist.
**Output:** ≥ 300 cards, every pack ≥ 15, each pack's difficulty about 1:2:1.
There are 17 packs (2026-11-05), each made for one kind of table (`PACK_AUDIENCE`):
- Chinese tables: zi 生僻字, fangyan 方言, chengyu 成语典故, caiming 菜名来历, xiehouyu 歇后语,
  zhongyao 中药名, diming 地名由来, laowujian 老物件, wangluo 网络热词.
- English tables: oddwords, idioms (idiom origins), phobias, placenames (Canadian place names),
  slang (online slang).
- Any table: trivia, vancouver, food.
**Command:** `npx tsx tests/straightface.test.ts` (the validator runs inside it), then
`npx tsc --noEmit`.

The cards there are the model: copy their shape, their length and their tone. The validator
(`site/src/shared/straightface/cards.ts`, `validateDeck`) refuses a card that breaks a hard rule;
`lintDeck` prints warnings an editor must look at.

## Every card

- `id`: lowercase slug, unique.
- `term`: what the whole table sees, in both languages. **The original name or a transliteration
  only, never a gloss that explains it** ("雨后泥土味 Petrichor" hands the answer to the room; the
  card says "Petrichor", the meaning goes in the definition). No brackets. `lintDeck` flags a
  Chinese term that shares two or more characters with its definition: look at each one; a name
  that simply repeats itself (蔡格尼克效应 / 蔡格尼克) is fine, a gloss is not. A Chinese original
  (see the Chinese packs below) is the word itself, so `lintDeck` lets its definition quote it.
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

## The Chinese packs (zi, fangyan, chengyu, caiming, xiehouyu, zhongyao, diming, laowujian, wangluo)

Made for Chinese tables (2026-11-05): rare characters, dialect words, idioms, the stories behind
dish names.

- `term.zh` is the word itself; `term.en` is the same characters, a space, then the reading:
  pinyin with tone marks (龘 dá, 锅包肉 guō bāo ròu); Cantonese in Jyutping (冇 mou5); Hokkien in
  Tâi-lô (歹势 pháinn-sè). The card shows the characters big and the reading under them, in both
  languages, so everyone can say the word, not only the honest player.
- Only characters from the basic CJK block (U+4E00 to U+9FFF) on the card, so every phone's font
  draws them.
- A famous idiom or dish: everyone knows what it means, so the bluff is about the story. The
  definition carries the real origin or the meaning most people get wrong (七月流火 is the heat
  ending, not raging); the seeds are a wrong but plausible story (another poet, an emperor's visit)
  or the common misreading.
- Never a dialect word with a crude second meaning (嬲 was dropped for that), and no jokes at a
  region: the card explains the word, it does not laugh at who says it.
- Sources: a Wiktionary or Wikipedia page (zh or en) that exists; a fact the page does not give is
  written as 相传 / 一说 / "legend says", or left out.

## The English packs (oddwords, idioms, phobias, placenames, slang)

Made for English tables (2026-11-05). `term.zh` and `term.en` are both the English word itself; the
definition is still written in both languages. Joke words (Anatidaephobia) say they are jokes;
disputed origins (most idioms, many place names) say "one theory" and give the seeds the popular
wrong stories. Indigenous place names give the meaning and the language as the source gives them.

## When it's done

- `npx tsx tests/straightface.test.ts` prints `all good` (the deck test has a ceiling on lint
  warnings; raise it in the PR only for warnings you have looked at and name).
- The PR says how many cards per pack and per level, lists the `editorial` ids, and shows five
  sample cards.
