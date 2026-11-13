---
version: 1
slug: "src-split-splitapp-tsx"
primary_target: "src/split/SplitApp.tsx"
related_targets: ["src/split/LedgerPage.tsx","src/split/AddExpense.tsx","src/split/SettleView.tsx","src/split/Ledgers.tsx","src/split/Sheets.tsx","src/split/split.css"]
---

# Surface brief: 两清 · All Square (changle.ca/split)

Scope: the whole tool, mode Operate. Audience: a group of friends after a trip or a dinner, one of them holding the phone, the others watching the group chat. Job: note who paid for what in two taps, see where you stand, and settle in the fewest transfers. Content: the ledger's own entries; the plan, with every rule and the approved wireframe, is `docs/split.md`. Constraints: the site's established world (docs/DESIGN.md, tokens and the 12 shared components), portrait phone first, 中/EN at any moment, no money ever passes through the site, stage one keeps ledgers on the phone.

Memorable moment: the last transfer is marked as paid and the page is stamped 两清, the tool's own name, like the seal on a settled bill.

Unresolved: the picture of the plan to send to the group chat (stage three; the button copies the plan as text until then), where a payee's e-Transfer address shows once ledgers are shared, and whether a row should carry its date once a ledger runs over several days.

## Direction contract

THESIS: One ledger is one calm page where the amount that matters to you is the largest thing on it, said as a sentence (你该收 $42.50). It refuses the category's dashboard of coloured balances, avatars and charts, and its red and green debts.

OWN-WORLD: the gel-lit room under a tool's amber light. Night ground, moonlight text, hairline rows instead of cards, pills for everything pressed. Amber only on the one button a screen has, on what is chosen, and on the seal. Money in tabular figures, the headline amount in the display face.

STORY: the reader sees where they stand at a glance, records an expense in two taps (记一笔, the amount, 记好了), and at the end follows a short list of transfers that holds still while people pay one by one.

FIRST VIEWPORT: the bar (back, the ledger's name, ⋯); two tabs, 账目 and 结清; "你该收" and then the amount at the page's largest size, one sentence over two lines in the display face; a quiet line, 5 个人 · 共花 $387.50; the expenses as rows (what, who paid and how it was shared, the amount at the right edge); one amber button, 记一笔, docked at the thumb.

FORM: pinned by the owner's approved plan and its three-screen wireframe (docs/split.md), so no roll was run. seed: none (unavailable). Signature move: the plan's steps tick off, and the 两清 stamp lands with the last. Motion is three things only: an expense landing, the figure rolling to its new value, the stamp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish review, 2026-11-12 (stage one: the screens, ledgers kept on the phone)

Reviewed in the thread that built it, from the rendered screens: 37 of them, in 中文 and in English, at 390x844, 390x664, 375x553 and 320x568 (`scripts/split_check.ts` takes the pictures and runs the checks). No rasters ship. DESIGN.md is unchanged: nothing here is new to the site's world, and the three things of 两清's own (the keypad, the hairline rows, the seal) stay in `src/split/split.css` until a second tool wants one.

What the review changed, most material first:

1. 记一笔 did not fit a phone. It was laid out for a 844px screen, and a web page gets 553 to 664 of that (the browser's bars): the keypad sat on top of the note. Now the page is exactly the screen: the keys take whatever height is spare (44 to 56px), and under 640px the amount goes a size down and the lines tighten. Checked at seven real heights.
2. Why 记好了 can't be pressed moved onto the 分给谁 line, with a mark, where it is put right. It had been a grey line under the fields, which the keypad covered first.
3. "你该收" was a small grey label over a number. It is one sentence with its amount now, in the display face.
4. The people sheet was a column of identical 这是我 buttons. A line is a name now, and opens to that person's name, 这是我 and 去掉.
5. Amber had spread to every currency pill. It is on the chosen one only.
6. Sharing by amounts starts from exactly what the sheet showed a moment before (the odd cent on the same person), not from a fresh even split.
7. An empty ledger said so twice (还没记账, 还没有账). Once now, and 结清 with nothing recorded offers 记一笔 instead of a button that does nothing.
8. Smaller: the copy button kept its name while saying 复制好了 (it had none, to a screen reader); 谁付的 is a real radio group; a long amount goes a size down instead of breaking after a comma; a name cut to length never ends in half an emoji.

Verdict: holds to the contract. One light, one button a screen, the amount as the largest thing, three motions and no fourth. The detector's one finding on the page is the site's own room light, which is the world and not this surface's to change.

Kept on purpose: 删掉 in Stop Red (the Button's own documented use, and the account page's delete does the same); the stamp's overshoot (`--ease-pop`, a stamp presses in and settles); no dates on rows yet (open above).
