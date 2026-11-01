# C1: the 12 style presets

**Files:** `site/src/shared/dj/presets.ts` (new) and a new test, `site/tests/dj-presets.test.ts`;
one line in `.github/workflows/site.yml` to run the test in CI (after `tests/dj.test.ts`).
**Output:** `export const PRESETS: Record<StyleId, Preset>` and `presetFor(id: StyleId): Preset`
(`Preset`, `StyleId`, `Scale` from `types.ts`).
**Command:** `npx tsx tests/dj-presets.test.ts` (plain tsx, like `tests/dj.test.ts`: print `ok`
lines, exit 1 on a failure).

Each preset says how one style sounds on Lyria RealTime: a few weighted prompts, a tempo range,
a home key, and how dense and bright it is. The DJ (A4) mixes them by weight; nothing here plays.

## Inputs

- `site/tests/fixtures/dj/lyria-prompt-words.json`: the keyword lists from Google's Lyria prompt
  guide (genres, instruments, moods), saved on 2026-11-01. **Every prompt text comes from here.**
  If you think the guide has a word this file is missing, say so in the PR; don't add it.
- What Lyria takes (CONTRACTS.md, "Styles and Lyria RealTime"): BPM 60 to 200; density and
  brightness 0 to 1; a weight is never 0.
- The plan's style table, so you don't need the plan:

| id | 中文 | English | the plan's idea for it | BPM |
| --- | --- | --- | --- | --- |
| `latin` | 拉丁 | Latin | reggaeton, dembow rhythm, latin house | 95–105 |
| `house` | 浩室 | House | deep house, four on the floor, warm chords | 120–126 |
| `techno` | 科技 | Techno | techno, driving kick, dark synths | 128–135 |
| `trance` | 迷幻 | Trance | uplifting trance, arpeggios, big breakdown | 136–140 |
| `bass` | 低音 | Bass | dubstep, heavy bass drops, half time | 140–150 |
| `dnb` | 鼓打贝斯 | Drum & Bass | drum and bass, fast breakbeats, sub bass | 170–176 |
| `hiphop` | 说唱 | Hip-hop | trap beat, 808s, hi-hat rolls | 70–80 |
| `rnb` | R&B | R&B | contemporary R&B, smooth chords, slow groove | 85–95 |
| `afro` | 非洲节拍 | Afrobeats | afrobeats, amapiano log drum, percussion | 105–115 |
| `kpop` | 韩流 | K-pop club | k-pop dance, bright synths, punchy drums | 120–128 |
| `cpop` | 华语夜店 | C-pop club | mandopop melody, club remix, piano hook (no vocals) | 120–128 |
| `bhangra` | 旁遮普 | Bhangra | bhangra, dhol drums, punjabi dance | 100–110 |

## What it must do

1. One preset for every id in `STYLE_IDS`, its `id` the same as its key, `name` in both languages
   as in the table.
2. `prompts`: 2 to 4. Each `text` is one entry of the word lists, written exactly as there
   (capitals, `&`, hyphens, digits). The first is the style's genre, from `genres`, at weight 1;
   the others (instruments, a mood) between 0.3 and 1. No text twice in one preset. Where the
   plan's idea has no word in the lists (dembow, amapiano, dhol, mandopop, …), use the nearest one
   that is there, and list every such swap in the PR.
3. `bpm`: `[low, high]` from the table.
4. `scale`: a home key, any `Scale` except `SCALE_UNSPECIFIED`. The DJ's key lock moves only to a
   neighbouring key, so spread them out: at most three styles share a home key.
5. `density` and `brightness`, 0 to 1: how the style sits in the middle of the night (techno dark
   and dense, trance bright, R&B sparse). One short comment per preset says why.

## Done when

- The test checks all of the above for every preset: the 12 ids, both names, every prompt text in
  the lists (exact match) with the first from `genres`, 2 to 4 prompts with the weights in range,
  no text twice, the BPM range from the table, a real key with at most three styles per key,
  density and brightness inside 0 to 1.
- `npx tsc --noEmit` passes.
- The PR shows the 12 presets as a table and every word swap.
