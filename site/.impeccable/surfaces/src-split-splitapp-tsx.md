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

## Stage two, step 7b: paid in another currency (2026-11-14)

Shape, in the thread that built it (the owner had said to go on; the plan already had eleven currencies and the rule: convert once, at the rate typed, and never again):

- Who and when: someone on a trip, paying in yen or dollars all week, often with no signal, at the rate their money was changed at. The common case is the second expense in that currency, not the first.
- So the currency is not a field on the form. It is a quiet pill in the bar's corner, saying what the amount is typed in (its name in Chinese, its code in English), and a new expense starts in the currency and at the rate of the last one, for thirty days. Picking yen once covers the week; an expense in the ledger's own currency puts the next one back.
- The amount stays the one big thing, in the currency it was paid in. What it comes to, and at what rate, is one quiet line under it. The whole amount is the thing to press to change the rate: the line alone would be too thin to hit.
- When it can't be recorded yet, the line says why in the page's strong voice (needs a rate; comes to less than a cent; more than one expense can be), since that line is what stands between the person and 记好了.
- The rate is a sum on its own sheet: 1 USD = [ ] CAD, with what the amount comes to written as it is typed, today's rate and the last one's one tap away, and one sentence saying the rate is for this expense only.
- Sharing is done on what it comes to, in the ledger's currency, and the share sheet says so when it is paid in another.
- In the ledger, a row paid in another currency carries what was paid, small, under what it counts for. The totals, the settling and the plan never see the other currency.
- Today's rates are asked for only when something on the screen wants them. A trip's worth of expenses at the last one's rate asks for nothing, and works with no signal.
- No new colour, no new motion.

What the look at the rendered screens changed (four phone sizes, both languages, and 记一笔 at seven real phone heights):

1. With the line under the amount, the keys at 375 by 553 (an iPhone SE in Safari) came out 41px tall. On short phones the amount goes one size down while the line is there, and the keys are 44px again.
2. At 320px the pill in the corner broke CAD over two lines. A code is one word: it doesn't break, and the title gives way instead.
3. With the pill (and, on an expense being changed, the bin) the right of the bar was wider than the left, and the centred title was cut to "Add an e…". On this screen the title starts beside the ✕ and takes what is left, and the English titles are shorter: Add expense, Edit.
4. A long amount in yen pushed the line under it off the screen's edge. The rate gives way, with an ellipsis; what it comes to never does.
5. The currency's name under the amount said again what the corner says. It is gone.

Verdict: holds to the contract. Still three screens and one light; a trip in another currency is one tap, once, and after that the screen is what it always was with one quiet line more.

## Stage two, step 6b: a sign-in to start one, and ledgers that follow their account (2026-11-14)

Shape, in the thread that built it (the owner had approved the step; the plan says starting a ledger needs a changle.ca account and joining one doesn't):

- Who and when: someone about to start a ledger for a trip, on their own phone, likely signed in to the site already, and if not, one email code away. A friend opening the link never signs in.
- Signed out, the list's one button says what it will do: 登录，开一个账本, Sign in to start a ledger, with the sign-in mark in place of the plus. It opens the site's own sign-in sheet, not one of 两清's; signed in, the sheet the button was pressed for opens by itself. Closing the sign-in without signing in leaves the list as it was.
- Signed in, the list is the account's ledgers: they come with it to any phone, as their owner where it started them, as the same person in them. Ledgers on the phone from before the sign-in join the account. Another account's stay on the phone, out of sight, still sending what they have.
- The ⋯ sheet's last line says what taking a ledger off does: off my ledgers, on every phone, when it is in the account; off this phone otherwise. Off my ledgers needs a signal, and says so when there is none, the way locking does.
- Deleting for everyone is the owner's third line, under locking and the new link, asked about first in the danger voice. After it, the list says the ledger was deleted; a friend's page says it was deleted and is only on that phone now.
- A ledger that couldn't go up for want of a sign-in says so in the page's strong voice, with 登录 one tap under the line (and under the first line of ⋯). It is a trouble that passes: signed in, it goes up by itself.
- No new colour, no new motion.

What the look at the rendered screens changed (four phone sizes, both languages; the account's flows in a browser against the local server, two phones on one account, a friend signed out and then in):

1. The delete-for-everyone line had an eraser, and taking a ledger off had the bin. Deleting took the bin; taking a ledger off a list, the phone's or the account's, took a list with a cross.
2. "Ledger deleted" was said by the ledger's page as it went to the list, and the list came up afresh without it (going between 两清's screens puts it up again). The ledger's page leaves the word for the list to say.
3. The line for a ledger kept back by a sign-in said the sign-in had run out. The same line is what someone sees who signed out on purpose; it says the ledger needs a sign-in to go online.

Verdict: holds to the contract. Still three screens and one light. Signing in is the site's own sheet, asked for once at the one moment it is needed; an account's ledgers are just the list, and what an owner can do that others can't is one line more in a sheet.

## Stage three, step 9b: the record, and changing back (2026-11-14)

Shape, in the thread that built it (the plan: every change keeps a record; the version before a change stays in it and can be gone back to; a deleted expense can be brought back for 30 days):

- Who and when: someone in the group who sees a number they don't remember, or who deleted the wrong expense, a day or two into a trip. They want to know who did it and put it right, not to audit anyone.
- Where: one more line in the ⋯ sheet, under the people: 改动记录 · 谁改了什么, History · Who changed what. It opens a sheet, not a page: a look, then back to the ledger. Still three screens.
- A line says what was done in the ledger's own words (记了一笔：早餐 $81.50); for an edit, a quiet line under it says what changed (金额 $30.00 改成 $45.00); and a quiet line says who and when (你 · 今天 10:12; a name; 有人 for a change from before phones said who they were; 开账本的人 for a lock). Newest first; what this phone hasn't sent yet is on top, with "not sent yet" where the time would be.
- Two offers, each a quiet small button at the end of its line: 改回去 on an expense's latest change, while the expense is there, the ledger isn't locked and the change back would go through; 恢复 on a deleted expense's line, for 30 days. Each is a change like any other: it goes up the same way, shows on every phone, and is itself a line of the record. Nothing in the record is ever rewritten.
- Read from the server each time the sheet opens, and again while it is open whenever the ledger moves on, keeping what is shown meanwhile. With no signal it says so in the page's strong voice, with 再试一次, and still lists what this phone has waiting.
- No new colour, no new motion.

What the look at the rendered screens changed (four phone sizes, both languages; two phones against the local server):

1. In English on a 320 phone, Change back sat beside its line and left the text a third of the width: "Today" and the time broke over two lines. Where the text would get narrower than about half the line, the button goes under it; in Chinese, and in English from 390 up, it stays at the end.

Verdict: holds to the contract. Still three screens and one light; the record is a sheet a tap from ⋯, and putting something right is one quiet button on the line that says what went wrong.

## Stage three, step 10: the plan as a picture (2026-11-14)

Shape, in the thread that built it (the plan: the settle plan "generates a picture to send to a WeChat group"; the picture says when it was made, and once more is recorded the page says it is out of date, "so nobody pays from an old picture"):

- Who and when: whoever is settling up for the group, at the end of a trip or a dinner, sending the plan to the group chat, mostly WeChat. The others read it in the chat, often days later, and pay from it.
- The settle tab's one button becomes 把结清图发到群里, Send to the group (the wireframe's own button). It opens a sheet: the picture, then 发给朋友, Share, which opens the phone's own share sheet, with the chat apps in it; then Copy as text, the plan as it was copied before, word for word.
- WeChat's own browser can't share a file: there the sheet has no main button, and says over the picture, in the strong voice, to press and hold it to send it or save it. The picture is the one thing in 两清 a long press opens a menu on. A computer saves it as a file.
- The picture is the page, made portable: the night, the type, the tool's amber only for the mark at the top and the 两清 stamp when everyone is square. The ledger's name, how many transfers, each transfer by name (never 你: the whole group reads it), paid or not, and last the day and time it was made, with a line saying to go by 两清 for anything recorded since. 1080 wide, as tall as its transfers.
- Out of date: the phone keeps when it made the picture and the transfers on it. When the transfers change, the settle tab says so over the plan, in the strong voice, with when the picture was made and that a new one is needed. A transfer marked as paid doesn't make it out of date; a new picture puts it right.
- No new motion; the amber stays where it was.

What the look at the rendered screens changed (four phone sizes, both languages; the picture itself saved beside each):

1. The English sheet title, The plan as a picture, ran to two lines at 320. It is The plan.
2. The picture's last line broke 两清 across two lines. Chinese on the picture breaks anywhere but inside 两清, and never puts a comma or a full stop at the start of a line.
3. The out-of-date line sat tight under the tabs, and its second line broke with one word left over. It has the sync line's space above it, and its lines are balanced.

Verdict: holds to the contract. Still three screens and one light. The picture is the settle tab as the group sees it, and the one new thing the page says is said only when it matters: the picture someone may pay from is wrong.

## Stage three, step 11: the expenses as a spreadsheet (2026-11-14)

Shape, in the thread that built it (the plan: "export the expenses as CSV"; people can take their own data with them; export lives in the menu, not on a screen of its own):

- Who and when: whoever keeps the books for the trip, after it, wanting the expenses in Excel, Numbers or WPS: to check, to keep, to send to someone who wasn't in the group.
- Where: one more line in the ⋯ sheet, under the record: 导出账目 · 存成表格, Export · As a spreadsheet. It opens a sheet with one plain paragraph on what the file holds and one button: Share or save where the phone's share sheet takes files (Files, mail, a chat), Save the file on a computer. WeChat's own browser can do neither, so there the sheet says, in the strong voice, how to open 两清 in the phone's browser and export from there, and offers no button that can't work.
- The file is the ledger as a spreadsheet person expects it: a row for each expense or payment, a column for each person, a total at the bottom that is exactly the settle tab's numbers. Written so Excel opens it right the first time (a byte-order mark, CR LF), and so nothing anyone typed can run as a formula.
- No new colour, no new motion; the sheet is words and one button.

What the look at the rendered screens changed (four phone sizes, both languages):

1. The paragraph on what the file holds didn't say what its numbers' signs mean, and in English ran to seven lines at 320. It says it plainly now: paying more than your part is above zero, owing is below.
2. In Chinese its last line was two characters on their own. The paragraph wraps so the last line keeps company.

Verdict: holds to the contract. Still three screens and one light; the export is a line in the menu and a sheet that says what you will get.

## Stage three, step 13b: receipt photos (2026-11-14)

Shape, in the thread that built it (the plan: "each expense can carry photos"; signed in to add them, 500 MB an account, made smaller on the phone first; only people with the ledger's key see them):

- Who and when: whoever paid, at the table or the till, with the receipt in hand; and anyone in the group later, checking what an expense was. Adding a photo can't slow down recording one: two taps still record an expense, and a photo is a third, only if wanted.
- Where: at the end of 记一笔's note line, the line that already says what the expense was. A camera, 44px; once there is a photo, the photo itself, small, with how many if more than one. With nothing to look at yet, it opens the phone's own picker straight away (its photos, its camera, its files); otherwise a sheet of the expense's photos, three to a row, with 再加一张, Add another, at its foot.
- One photo seen whole opens in the same sheet (titled 第 2 张，共 3 张, Photo 2 of 3), with 去掉这张, Take this one off, at the foot; ✕, Esc and the back button go back to the three to a row. A PDF opens in the phone's own viewer.
- The ledger shows which expenses have photos: a paperclip after who paid and how it was shared.
- Sending is said on the button itself, with the shared buttons' busy mark (a turning ring; three dots with reduced motion), and 记好了 waits for it. Nothing new moves.
- What can't go is said where the person is looking: in the sheet, above its button, in the strong voice, when the sheet is open; as a toast when it isn't. Signed out, the sheet says photos need a sign-in, with 登录, which makes way for the site's sign-in and comes back once signed in.

What the look at the rendered screens changed (four phone sizes, both languages; two phones against the local server):

1. The PDF's tile said PDF, but its name for a screen reader didn't, which axe found; and the hidden picker counted as a button under 44px. The tiles and the note line's button are named by words read out plus what shows, and the picker is out of a screen reader's way, as it is out of the way of a tap.
2. The photos and one photo whole were two sheets, one giving way to the other: a press of Esc or back in the 150 ms the first was sliding away went to it, and did nothing. They are one sheet with two views.
3. 登录 in a sheet did nothing: the site's sign-in is drawn under any sheet still open. The photos sheet, and the ⋯ sheet's 登录 with it, make way first.
4. In English, 1 of 1 set in the display face read as one word. It is Photo 1 of 1.

Verdict: holds to the contract. Still three screens and one light; a photo is one button at the end of a line that was already there, and a sheet like the others.

