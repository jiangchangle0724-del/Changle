---
version: 1
slug: "src-split-splitapp-tsx"
primary_target: "src/split/SplitApp.tsx"
related_targets: ["src/split/LedgerPage.tsx","src/split/AddExpense.tsx","src/split/SettleView.tsx","src/split/Ledgers.tsx","src/split/Sheets.tsx","src/split/split.css"]
---

# Surface brief: 两清 · All Square (changle.ca/split)

Scope: the whole tool, mode Operate. Audience: a group of friends after a trip or a dinner, one of them holding the phone, the others watching the group chat. Job: note who paid for what in two taps, see where you stand, and settle in the fewest transfers. Content: the ledger's own entries; the plan, with every rule and the approved wireframe, is `docs/split.md`. Constraints: the site's established world (docs/DESIGN.md, tokens and the 12 shared components), portrait phone first, 中/EN at any moment, no money ever passes through the site. Stage one kept ledgers on the phone; since stage two (2026-11-13) a ledger is kept on the server and the phone holds a copy, so it works with no signal.

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

## Stage two, step 4b: the server, said only when there is something to say (2026-11-13)

Shape, in the thread that built it (the owner had said to go ahead without asking; the assumptions are marked):

- Who and when: someone recording an expense on a trip, often with a poor signal (a mountain road, a subway, abroad with no data). Two things have to be true without their thinking about them: what I recorded is kept, and it reaches the others.
- The page says nothing while that is so. No "saved" label, no cloud mark in the bar: the row landing in the list is the feedback, as before. (Assumption: a working tool needs no status. The ⋯ sheet says 已同步到云端 for whoever goes looking.)
- One quiet line under the tabs, above both views, when what was recorded here hasn't gone up: how many changes, and that they go when there is a signal. It appears after the second miss, not the first, so a train in a tunnel doesn't flash it.
- The same line in the page's strong voice with a mark when the phone can't go on sending (five cases, each in words of its own, each saying what happens to what is recorded). Not in the light and not in red: the amber is this tool's one light and the site's warning colour at once, and nothing is lost.
- A change that didn't stick is named (the note and amount of an expense, who was to be renamed to what), with why and what to do, in a panel with one button, 知道了. It stays until read, across reloads.
- The list flags a ledger's card with one short line in the same two voices.
- No new motion: three motions and no fourth.

What the look at the rendered screens changed (45 screens now, both languages, four phone sizes; axe clean, nothing too wide, nothing under 44px):

1. A lost rename read 成员：Zed, which names nobody's action. Each kind now says what was done: 记一笔, 改一笔, 标成已转, 加人, 改名：小王 改成 Zed, 去掉.
2. Two lost changes that each ran to two lines read as four lines. The gap between changes is wider than the gap between lines.
3. Why it didn't stick broke as a line and three words. It is balanced over even lines.
4. On a 320px phone in English the title on the list page sat 1px from the language switch (the bar's right side could be narrower than what it held; there since stage one). The right side now keeps its own width and the title gives way.
5. Deleting a ledger said the ledger lives only on this phone, which stopped being true. It says what is true: it can't be opened again, and a copy stays online that can't be deleted yet. (Real deletion needs an owner, so it comes with accounts; it must be there before the tool gets its card.)

Verdict: holds to the contract. The page is still one calm thing with one light; the server is heard from only when it has something to say, and then in the page's own two voices.
