# when-C1: four pictures for 约时间 · When Works

约时间 is where a group of friends in Vancouver finds a time to meet: everyone taps the times they
are free, and the page shows where they overlap. Its pages are dark, like the rest of changle.ca,
and until now have no picture at all. This card draws four.

Use Codex's own image tool (OpenAI's `imagegen` skill, the built-in tool: no API key).

## Files

- Add `tools/when/src/client/art/home.webp`, `empty.webp`, `invite-bg.webp` and `result-bg.webp`.
- Add `tools/when/src/client/art/README.md`: one row per picture (file, what it shows, the prompt's
  main points, the date), like `site/src/party/straightface/art/README.md`.
- Add a short section to `LICENSES.md` at the repository root, "约时间 · When Works: the pictures":
  AI-made, drawn with OpenAI's image generation by Codex on the date, from prompts that describe
  only what to draw, with no other product's name or picture as a reference; the prompts are in
  `tools/when/src/client/art/README.md`.
- Nothing else. The pages start using the pictures in the owning chat's own PR.

## Every picture

- The look of the site's other pictures: open `site/src/party/straightface/art/backdrop.webp`
  first. Flat illustration, soft gradients, no outlines, a deep indigo and purple night
  (about `#0e0c22`), warm amber lamp light. Low contrast, calm.
- No words, letters or numbers anywhere (the code draws every word and the QR code on top), no
  logos or brands, no watermark.
- No people, no faces, no hands.
- Night colors: no white or pale areas bigger than a small highlight.
- WebP. Sizes and weights are in the table; resize and compress after drawing.

## The pictures

| File | Size, weight | What it shows | Where the code draws on it |
| --- | --- | --- | --- |
| `home.webp` | 1200 × 675, at most 90 KB | A round wooden table seen from a little above, at night, under one warm hanging lamp. On it: a small desk calendar with blank pages, a few cups, a pot of tea, chopsticks and a deck of cards, as if friends are about to arrive. Empty chairs around it. | Nothing. It sits at the top of the home page; its bottom edge fades to the night color. |
| `empty.webp` | 800 × 600, at most 60 KB | The same table, empty and waiting: the lamp on, the chairs tucked in, one steaming cup. | Nothing. It shows before anyone has answered. |
| `invite-bg.webp` | 1080 × 1440, at most 150 KB | A portrait background. The top fifth: the warm lamp and a string of small paper lanterns. The bottom fifth: the edge of the round table with cups and a blank calendar. Everything between is the plain night, a soft glow in the middle and nothing else. | The gathering's name, its dates and a QR code, in the middle three fifths. Keep that part empty and even. |
| `result-bg.webp` | 1080 × 1440, at most 150 KB | The same composition as `invite-bg.webp`, celebrating: the lanterns lit brighter, a little confetti falling near the top and bottom edges, the calendar with one day circled (a circle only, no number). | The same middle three fifths: the name, the time that was set, who is coming. Keep it empty and even. |

## Check

- Each file has the size in the table, is WebP, and is under its weight
  (`ls -l tools/when/src/client/art`).
- Put a white block of text over the middle three fifths of each of the two backgrounds (with an
  image tool or a short script you don't commit; not a browser) and look at the result: it reads
  easily everywhere.
- `npm run typecheck` and `npm test` in `tools/when` still pass (the card adds no code).
- No browser and no uploads: don't attach the pictures to the PR. They are files on the branch,
  and the reviewing chat looks at them there. In the PR, list the four files with their sizes and
  weights, as text.

## Done when

The four files and the art README are in `tools/when/src/client/art/`, `LICENSES.md` has the
section, and the PR lists the files with their sizes and weights.
