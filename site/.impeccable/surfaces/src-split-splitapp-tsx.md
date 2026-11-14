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

## Stage two, step 5a: an invitation, and the one question it asks (2026-11-13)

Shape, in the thread that built it (the owner had said to go on without asking; the assumptions are marked):

- Who and when: one person at the table says they'll keep the bill and starts a ledger; the others are across the table or in the group chat. The one invited has one job, with no sign-up: get in, and say which of these names is theirs.
- An invitation is not a fourth screen. It is a line in the ⋯ sheet (邀请朋友, 链接或二维码) that opens a sheet: the code to scan, two short sentences of how, one fine line saying what the link lets someone do, and the way to send it. On a phone that is the phone's own share sheet, with copying beside it; where there is no share sheet, copying alone. An empty ledger says where the invitation is, once, under 还没有账.
- The code is night on paper, with paper all round it (a scanner needs the quiet edge). Not in the light: amber stays on the one button.
- Arriving: the shape of the page it is about to be, then 你是哪一位？ as a page of its own. The names are lines to tap, and one tap answers. Someone the ledger doesn't have adds themselves in a field under the names. A quiet button at the foot lets someone only look; they are asked again the next time, and the answer can be changed under ⋯, 成员. (Assumption: nobody should have to type to join a ledger their name is already in.)
- Three ways an invitation doesn't get in, each a page with its own words and one way on: nothing answered (再试一次), the link doesn't open the ledger, the ledger can't be found.
- No new motion: three motions and no fourth.

What the look at the rendered screens changed (58 screens now, both languages, four phone sizes; axe clean, nothing too wide, nothing under 44px):

1. On a phone, which has a share sheet, the two buttons broke their own labels at 320px (复制链 / 接, Copy / link). The walk had not shown it: its browser has no share sheet, so it drew the one-button sheet. The pair's buttons keep less room at their sides now, the half-width button has a short word for a copy that was refused, and the walk draws the sheet both ways.
2. In English at 320x568 the sheet ran under its own footer and the fine line was cut. The title is two words (Invite friends), the how is two sentences that each keep a line, and the fine line is one (Anyone with the link can view and edit).
3. Chinese lines broke in the middle of a word (发到群 / 里, 这 / 个账本): there are no spaces to say where a break may fall. A sentence or two of running text now wraps between its sentences before inside one; the words mark the place. The empty state's words on 两清's pages are balanced, so none ends with a word or two alone.
4. The pages for an invitation that doesn't get in said more than is known: 链接可能换过了 (a link can't be changed yet), 这个账本不在了 (a mistyped link looks the same). They say what may be so (the link is incomplete, or was replaced; or the ledger was deleted) and what to do: ask for it again.
5. 你是哪一位？ was a sheet that opened by itself when the page loaded. The shared sheet puts the focus on its handle as it opens, so the first thing drawn was a focus ring nobody asked for. It is a page: the question is the page until it is answered.
6. Under 还没有账 the hint about ⋯ broke with ⋯ starting a line. Two lines, one thought each.
7. 删掉这个账本 no longer said what happens: with invitations, a ledger taken off a phone opens again from a link. It is 从这部手机上移除, and the question says the ledger stays online for the others.

Verdict: holds to the contract. Still three screens and one light; getting someone in is a line in ⋯ on one end and one question on the other.

## Stage two, step 5b: the owner's two, a lock and a new link (2026-11-13)

Shape, in the thread that built it (the owner had said to go on; the assumptions are marked):

- Who and when: the person who started the ledger, at two moments. The trip is settled and they want the ledger left as it is (the plan: 结清后可以锁账本). Or the link went somewhere it shouldn't have, and they want it dead.
- Neither is a screen. They are two lines in the ⋯ sheet, on the phone that started the ledger and nowhere else: 锁上账本, which locks with one tap and opens again with the next (no question asked: it can be undone at once), and 换邀请链接, which asks first, because it shuts out everyone who came in by the old link until they have the new one.
- A locked ledger is the same page with nothing to press: no 记一笔, rows that are only rows, transfers that can be looked at and copied and not marked. One quiet line under the tabs says so, with a lock for its mark; on the owner's phone it adds where to open it. (Assumption: locked means locked for everyone, the owner too. One rule, and the owner is one tap from opening it.)
- What a friend's phone recorded before it heard of the lock is not lost and not hidden: it stays on that phone's screen, and the line turns to the page's strong voice to say it can't go up until the ledger is opened.
- A friend whose link was changed under them is told in the same strong voice what happened and what puts it right: open the new invitation. They can go on recording meanwhile.
- The question, the wait and the new code all happen on the invitation's own sheet, so when the link has changed, the thing to send is already in the owner's hand.
- No new motion, no new colour: the lock is a mark and a sentence.

What the look at the rendered screens changed (69 screens now, both languages, four phone sizes; axe clean, nothing too wide, nothing under 44px):

1. Changing the link was a button on the invitation's sheet, under the fine line. At 320px the sheet was already full, and the button showed as a sliver cut off by the sheet's footer. It is a line in ⋯ now, beside the lock: the owner's two together.
2. "Changed" was a third line under the code, and ran under the footer the same way. It takes the place of the fine line, which the owner has read before.
3. The lock's line carried a sentence on its right (结清以后锁上，谁都改不了), which in English broke over three lines at 320px. Two words now: 只能看，不能改 and, to open it, 大家又能改.
4. Under that line a note for "couldn't connect" kept its room while it had nothing to say, and left a hole in the sheet. It is there only when it speaks.
5. The line for changing the link had its arrow beside its words, not at the edge like the lines above it.
6. In ⋯ the owner was told to open the ledger "from ⋯". There it says only that the ledger is locked: the line that opens it is the next thing down.
7. A transfer in a locked ledger still said to come back and mark it as paid, and in English the page's lock line left one word on a line of its own. The first says the ledger is locked; the second is a shorter sentence, and the line now breaks evenly whenever it runs to two.

Verdict: holds to the contract. Three screens, one light, three motions. What an owner can do that others can't is two lines in a sheet, and what it does to everyone else is said to them in the page's own two voices.
