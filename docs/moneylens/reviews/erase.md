VERDICT: CHANGES (findings 1 and 2 block the merge; findings 3 to 6 do not). It applies to 9bffa8cc and to 13bed4e2: nothing under `src/` or `web/` changed between them.

**Independence.** The author and the reviewer are the same model. This slice was written by Claude Opus 5.5 and reviewed by Claude Opus 5.5 (`claude-opus-5-5`), run as a separate agent that took no part in writing the code, the tests or the documents. SEC-9 asks for "a second model or a person". This review is neither, so it does not meet SEC-9 on its own.

Two copies of one model share their training, and very likely their blind spots:
- what seems a fair reading of the platform (alarms, billing, SQLite's limits);
- which attacks seem worth trying;
- which words seem clear.

To offset part of that, the review tests rather than reads where it can. Every claim below rests on a test I wrote and ran, or on a quoted line of code. Where I could only read (the browser check, the platform), I say so. Steve has been asked whether another model should review this slice. Until he answers, this is the record. I recommend that a different model or a person review the erasing path, and the fix for finding 1, before anyone but the owner is let in.

# C12: erasing a vault (at once with it open, in seven days without it), and the events log kept by kind

- **Reviewed:** commit `9bffa8cc` (branch `claude/moneylens-erase`), in a detached worktree, against `be4b03f8` (main with the devices' screen merged), on 27 November 2026.
- **Read since, not checked out:**
  - `120bf17b`: adds one test.
  - `1f2bdedc`: the browser check only; see "The browser check's copy" below.
  - `13bed4e2`: the assessment's 1.11 "Tested" paragraph, the brief and the status.

## Verdict

**CHANGES.** Merging deploys to the owner's live account, and two things must be fixed before that:

1. Someone who holds only the owner's mailbox can force an erasing that the owner cannot call off. VAULT-7's "can be cancelled" is not kept.
2. Three English sentences say that opening the vault calls an erasing off. It does not.

What I checked and found right, each with a test of mine:

- **No session without the vault open erases it before the seven days.** I tried three kinds of locked session (never opened, made it then locked, opened then locked). For each I sent:
  - `vault/erase` with every body I could think of;
  - the vault started again, both with ways in of its own and with another id;
  - asking again, and asking for another vault;
  - wrong proofs;
  - a clock set back a day, and forward to a millisecond before the due time, through both a request and the alarm.

  Nothing was erased. At the due time the alarm erases the vault, in no session's name.
- **Erasing at once needs `unlocked`.** Only a right proof (`tryUnlock`) or making the vault (`unlockMaker`) sets it. Erasing clears it, so no session counts as unlocked for a vault made afterwards.
- **What erasing takes, table by table.**
  - Taken: `chunks`, `vault`, `ways`, `tries`, `unlocked`, `opened`, `erasing`.
  - Kept: `account`, `sessions`, `events` (plus one line).
  - Left about the vault: one `spent` row, a date and a count.
  - Found nowhere in the database afterwards: the vault's id, its ways' ids, and the sealed bytes.
- **The day's writes.** Erasing and making a vault again, over and over in one day, gives no more chunk writes than one vault gets. The next day the count starts at nothing.
- **Kinds kept apart.** 600 lines each of the four kinds that are not shown apart (sign-in, sign-out, a device ended, all others ended), plus forty of the asking session's own openings, push none of the lines a person must not miss out of storage or out of sight.
- **The object's alarm (`worker.ts`), run on Node.** The author's tests only read these lines; mine run them:
  - The alarm is set when an erasing is asked for, and again at each `vault` read.
  - An alarm that cannot be set leaves the answer and the erasing as they were.
  - Woken early, it sets itself again.
  - At the due time it erases the vault and is not set again.
  - An object nobody has signed in to makes no tables when woken.
- **The app.** By reading the code:
  - `pendingOf`, `erasing` and `listing` take what the server sends whole or not at all, as before.
  - The erase screen is laid only over an open vault, the reset screen only over a locked one, and a step that no longer fits is gone back off once.
  - Erasing at once needs the word typed.
  - No markup is made from data.

## The devices' screen, finding 3: resolved

The finding was that someone who opened the vault could sign out and push that line out of sight with an afternoon of signing in and out. That cannot happen now:
- Lines of each kind are kept apart.
- The newest openings by other sessions are shown apart.
- The screen has a panel for other devices that opened the vault, gone ones included.

My test (`finding 3 (resolved at C12, 9bffa8cc)` in `second-devices.test.ts`) is now a plain test and passes. Something narrower remains, which lines of the same kind cause: finding 4 below.

## The obligations the earlier reviews put on erasing

From `reviews/devices.md`:
- An unlocked session may erase at once, any other only after seven days: **met.**
- The check and the delete are in one `act`: **met.**
- The reset writes a line that the events answer always shows: **met.** `erase-asked`, `erase-cancelled` and `vault-erased` are shown apart, the newest ten of each.
- The devices screen shows a pending erasing and who asked for it: **met.** It names the device while that device is signed in, and says "a device that has since signed out" after.

From `reviews/door.md`:
- At once only from an unlocked session, in the same `act` stretch as the delete: **met.**
- Delete chunks, vault, ways, tries and unlocked rows, never `deleteAll`: **met**, and `opened` and `erasing` go too.
- Log the request and the erase: **met.**
- A reset path before anyone but the owner is let in, so that a vault made by a mailbox taker can be undone: **met, with one limit 1.11 should state.** The taker made that vault, so they hold its secrets and can call off each erasing for as long as they hold the mailbox. The owner's reset goes through only once the mailbox is his again.

From `reviews/server-shell.md`:
- In `act`, with the session check and the delete in one synchronous stretch: **met.**
- The delay kept in storage with an alarm, and the alarm handler reading again that the erasing is still asked for and the vault still held: **met** (`settleErase`).
- "A session that has not proven the vault unlocked cannot ask": **met for erasing at once.** For the seven-day path, VAULT-7 itself lets any signed-in session ask, and that is what was built. My earlier sentence was too broad.

## The card's seven points

1. **Who may erase, and what.**
   - No route for a locked session (above).
   - A session cannot erase a vault it does not hold: `held !== body.vault` gives 409 on both routes, and `settleErase` drops an erasing whose vault is no longer held.
   - Table by table (above).
   - What outlives the vault:
     - on the server, the `spent` count, and events lines that carry no contents;
     - on the device, a copy that `forgetCache` leaves when another tab holds it, sealed under a key no wrapper opens any more.
   - Nothing that must stay is taken.
2. **The seven days.**
   - Due exactly seven days after the first asking. Asking again neither puts it off nor brings it on.
   - Shown to every signed-in session.
   - The alarm, the check before every request, and a clock set back all hold (tested).
   - Erasing at once, and making a new vault, take the erasing with them.
   - Calling off needs the vault open. I agree with that choice against a reset being blocked. Against a forced erasing it fails, because the try count can keep the owner from ever having the vault open (finding 1).
3. **The day's writes.** No more writes from erasing and making again, and none taken away the next day (tested). Erase-and-make cycles still write rows that no quota counts (finding 5c).
4. **The events log.** Kinds are tidied apart. No number of lines of other kinds pushes a must-not-miss line out of storage or sight (tested). The asking session's own openings do not crowd others' out of the openings shown apart. Lines of the same kind do (finding 4). The index serves every set that is read. Tidying itself reads a great deal (finding 5b).
5. **The app.**
   - One press does not erase: erasing at once needs the word, and asking for seven days is one press by design.
   - Untrue things a person can be told:
     - that opening calls the erasing off (finding 2);
     - that the vault is "locked" when it is gone (finding 3);
     - "another device" for the owner's own earlier sign-in, and "cannot be brought back" (finding 6).
   - The laid screens and the browser's history: right (above).
   - The device's copy is emptied on the new-vault screen, except when another tab holds it.
6. **Earlier obligations:** above.
7. **The tests.**
   - The author's table-by-table, quota, and per-kind tidy tests can fail, and test the right things.
   - "The app's side, against the server's own code" pins `eraseNow` → "locked" and `keepVault` → "locked" after the vault is gone. That is the behaviour of finding 3, under a comment that says "gone".
   - The object's alarm was untested by the author; my test runs it.
   - The browser check's copy: see below.

## Findings

### 1. Someone who holds only the mailbox can have the vault erased while the owner tries every day to call it off (blocks the merge)

**Where:**
- `account.ts`, `vault/erase-cancel`: refused unless `isUnlocked`.
- `ways.ts`, `tryUnlock`: past the count every proof is turned away unlooked at, the right one too.
- `erase.ts`, its header; assessment 1.11, "The seven days" and its first limit.

**What goes wrong:**
1. The wrong-proof count belongs to the account (1.9). Someone with the owner's mailbox signs in and guesses wrong on purpose.
2. As each place in the count frees, they take it, so every proof the owner shows is turned away.
3. They then ask for the vault to be erased in seven days.
4. The owner sees the notice on every screen, but cannot open the vault. So he can neither call the erasing off nor erase at once. His sessions that had the vault open lock after fifteen quiet minutes and end within twelve hours.
5. Seven days later the vault is erased. The next time his device comes to the new-vault screen, its own copy is emptied as well.

1.11 says this can happen to "an owner who does not open MoneyLens for seven days". It happens just the same to an owner who opens it every day.

Before this slice, the same person could keep the owner out (1.9) but not destroy anything. VAULT-7 says: "It can erase it only after a 7-day delay that is shown on every signed-in device and can be cancelled."

The owner's only ways out:
- take the mailbox back, sign the other devices out at changle.ca and in MoneyLens, wait up to a day for the count to clear, then call the erasing off, all within the seven days;
- or ask the operator to restore from the recovery history (BAK-3, still "to confirm").

**Test:** `finding 1: whoever holds only the mailbox cannot have the vault erased while its owner keeps trying to open it and call that off` (todo).
- The attacker guesses every five minutes.
- The owner shows the right recovery code every three hours for seven days, 56 times.
- He never gets past the count, and the vault is erased.

A real script that asks every few seconds does better than the test's attacker. Places free up about every 48 minutes, so the owner's chance on each try is roughly the few seconds a place stays free out of those 48 minutes.

**Fix (one of these):**
- (a) Let the seven days run only while proofs are actually looked at:
  - note the time a wrong proof last filled the count (at most thirty writes a day);
  - when an erasing comes due, if the count was full at any time after it was asked for, move the due time to seven days after the count was last full.

  A stranger who keeps the owner out then keeps the erasing from coming due. One who leaves the count alone lets the owner open the vault and call it off.
- (b) A count kept apart for devices that have opened the vault before (section 3's open point), so that the stranger's guessing does not shut out the owner's known device.

With either: when proofs are being turned away and an erasing is asked for, the Unlock screen should say what is happening and what to do (take the mailbox back; sign the other devices out at changle.ca and here). Write the case into 1.11's limits.

### 2. The English screens say that opening the vault calls an erasing off; it does not (blocks the merge)

**Where:** `web/app/i18n.ts`: `erasingOpenHint`, `resetHow`, `erasingIfNotYou` (`en`). They are shown by `ErasingNotice` on the Unlock screen, by `ResetVault`, and on the devices screen.

**What goes wrong:**
- The English says "Opening the vault with the passphrase or the recovery code calls it off" (in two of the strings) and "open the vault to call it off" (in the third).
- Opening does not call it off: `vault/unlock` leaves the erasing in place. Only "Don't erase it" (`vault/erase-cancel`) does.
- That button is on the open vault's screen, in a notice that is fetched when the screen comes up and shows nothing if the fetch fails.
- A person who opens the vault, believes the erasing is called off, and does not see or press the button loses the vault seven days later.
- The Chinese says "就能取消" ("then you can call it off"), which is true, so the two languages say different things. 1.11's own limit says it correctly ("opens the vault with it, and calls it off there").

**Test:** `finding 2: no screen says that opening the vault calls an erasing off, unless opening it does` (todo). It passes when either fix is in.

**Fix (one of these):**
- Make the English say what the Chinese says: "Open the vault with the passphrase or the recovery code, and you can call it off there".
- Or have a right proof call off any erasing in the same transaction, with its own line. Then the words are true as they stand.

It is a few minutes' work, and it is the wording of the one thing that stops an erasing.

### 3. A device whose vault was erased elsewhere, or by its seven days, is told "locked: lock it and open it again" (does not block; settle with finding 2, or before anyone else is let in)

**Where:**
- `account.ts`: `vault/erase` and `vault/erase-cancel` check `isUnlocked` before checking whether there is a vault. Erasing clears `unlocked`, so for a vault that no longer exists both answer 423 "locked".
- `src/app/erase.ts`: `eraseNow` and `keepVault` read that as "locked".
- `Erase.tsx` then shows `eraseLocked` or `erasingKeepLocked`: "On the server this device's vault is locked already. Lock it and open it again, then erase it / call it off."

**What goes wrong:**
- The person locks the vault, and the Unlock screen asks for the passphrase of a vault that is gone.
- Opening then answers "This vault has no way in of that kind" (`noWay`).
- It happens when:
  - another device erased the vault at once;
  - or the seven days came due while this device had it open, and its person pressed "Don't erase it" a moment later. I tested one second after the due time: the answer was "locked".
- 1.11 ("On the devices") says that a device which had the vault open "is told at its next word with the server that it holds nothing open, asks where things stand, and is shown that there is no vault". That is true when the next word is a sync, which is what the browser check does. It is not true when the next word is:
  - "Erase now";
  - "Don't erase it";
  - the lock button, or the fifteen minutes;
  - opening the vault.

**Test:** `finding 3: a device that had the vault open, after it was erased from elsewhere or by its seven days, is told it is gone, not 'locked'` (todo).

**Fix:**
- In both actions, answer 404 "no-vault" before checking `unlocked`. Any signed-in session can already see whether there is a vault.
- On "gone", the screens ask again where things stand.
- The Unlock screen asks again where things stand when the server says there is no way in.

### 4. The openings shown apart are the newest ten by any session but the one asking, nameless once a session has ended (does not block; settle before anyone but the owner is let in)

**Where:**
- `account.ts`, `shownEvents` (`APART_SHOWN = 10`) and `tidyEvents` (500 per kind, the owner's own openings included);
- `src/app/devices.ts`, `deviceOf`: a session that has ended is "a device that has since signed out", without a name.

**What goes wrong:**
- From the screen's point of view, "another session" includes the owner's own sign-ins on his other devices, and his own earlier sign-ins on this one.
- In ordinary use (two openings a day, each from a new sign-in), an intruder's single opening:
  - drops out of the ten shown apart in about five days;
  - drops out of the newest fifty within one to two weeks, depending on how many other lines each sign-in leaves.

  After that, nothing on the screen says that another device opened the vault.
- The 500 lines kept of that kind are shared with the owner's own openings. After about 500 more (months of daily use) the line is not kept at all, which is short of SEC-17's twelve months.
- While they are shown, these lines name no device once their session has ended, so the owner cannot tell an intruder's from his own.

**Test:** `finding 4: an intruder's opening of the vault stays in sight after two weeks of the owner's own use` (todo).

**Fix:**
- Keep the session's label with each line. It is one of a few fixed words, so nothing about the person.
- Show apart the openings of the last thirty days, within a bound, rather than the last ten.
- Keep openings for SEC-17's twelve months within a bound of their own, so that the owner's own use does not push them out.

### 5. What it costs (LIM-1) (does not block; settle before anyone but the owner is let in, and measure at the first deployment)

- **(a) The alarm is set at every `vault` answer while an erasing is asked for** (`account.ts`, `vault`: `wake`; `worker.ts`, `fetch`).
  - Any signed-in session can cause this, one that has never opened the vault included: ask for an erasing once, then read the vault at the rate limit (300 a minute per address).
  - My test counts 51 alarms set for one erasing.
  - If `setAlarm` is billed as a row written on SQLite-backed objects, which only a deployment can confirm, this is a write path open to someone without the vault open. Section 3's open point names only "whoever holds the passphrase".
  - Fix: set the alarm only when `getAlarm()` is not already the due time.
- **(b) Tidying reads a great deal, and it happens at every proof shown.**
  - `tidyEvents` walks the index with `OFFSET 500` for each of the eleven kinds, then deletes by age. `EXPLAIN QUERY PLAN` gives `SCAN events` for `DELETE FROM events WHERE at < ?`.
  - When the log is full (5,500 lines), one tidy can read about 11,000 rows. Before this slice, with at most 1,000 lines and three statements that each could read all of them, it was about 3,000.
  - Right proofs are counted against nothing (section 3). A session with the vault open, at the rate limit, could read millions of rows a minute, against the plan's daily number.
  - Fix: tidy only the kind just written, and age lines out through an index on `at`, or once a day.
- **(c) Erase-and-make cycles write rows that nothing counts.**
  - A session of an account with no vault can make one (which unlocks it as maker), erase it at once, and make another.
  - That is about a dozen rows written per cycle, two requests each, with no quota: `writesPerDay` counts chunks only.
  - Add it to section 3's open point. Fix: count vault starts per account per day.

**Test:** `finding 5: reading the vault while an erasing is asked for sets the object's alarm once, not at every request` (todo), for (a). (b) and (c) are shown by reading and by the query plan.

### 6. Words that say more than is so (does not block)

- **"Asked for from another device"** (`whoOther`, in `ErasingNotice`).
  - `here` means the same session, and sessions end within twelve hours.
  - So from the next day on, the owner's own request from his own phone reads "another device", next to "If that wasn't you, someone has signed in to your changle.ca account".
  - Say "from another sign-in", or keep the asking session's label with the erasing.
- **"What is deleted cannot be brought back"** (`eraseLead`).
  - 1.11's own limit says the operator can restore from the recovery history for up to 30 days (BAK-3), and PRIV-6 asks the app to say how long deletion takes.
  - Say "You cannot bring it back; the service's recovery history may keep a copy for up to 30 days", or whatever BAK-3 turns out to be once confirmed.
- **VAULT-5's "it prompts for an export":** not met. There is no export yet; the erase screens will owe it.

**Smaller notes, no change asked:**
- **A failed check shows nothing.** When its question fails, `ErasingNotice` shows nothing, so the Unlock screen and the open vault say nothing of an erasing at that moment.
- **Lines carry no vault.** After an erasing and a new vault, "Other devices opened the vault", with "someone else knows your passphrase", is partly about the vault that is gone. That is the safe side if the passphrase was reused.
- **A dropped erasing is still shown.** The "dropped" path (an erasing of a vault no longer held) is reachable only by changing the database by hand, and until it is due every device is shown that erasing.
- **The reset after a mailbox taker made the vault** goes through only once the taker can no longer sign in (see the obligations above). 1.11 could say so.

## The browser check's copy (1f2bdedc)

You asked whether writing the meta line from outside is a fair stand-in for a device that has used its vault.

**Fair for today.** A device that has opened and synced a vault keeps exactly that line and nothing else, because nothing can be imported yet. With the line in place, the two checks that lived now fail when taken out, as the commit says.

**Not fair for a device that has used a vault with records.** Such a copy also has entries in the `chunks` store. With only the meta line present, a `clear()` that emptied `meta` and left `chunks` would still pass the browser check. No other test empties a cache that holds chunks:
- `check-cache.ts` never calls `clear`;
- `tests/idbcache.test.ts` tests only the lock;
- the Node tests of the store use caches kept in memory.

**Suggestion.** Write one invented chunk entry (an id, a version, a `base` of sealed-blob shape) beside the meta line. The same `entries === 0` check then holds `clear()` to both stores.

This is not a finding against the code: by reading it, `clear()` empties both stores.

## Tests

**New file, `tests/second-erase.test.ts`:**
- Five plain tests: no early erasing by any route; table by table; the day's writes; other kinds against the must-not-miss lines; the object's alarm.
- Five `todo` tests, one for each of findings 1 to 5. Each fails while its finding stands.

**Changed in my earlier files:**
- `second-door.test.ts`: "second look: the events log keeps wrong proofs and everything else apart, 500 of each" is restated as "second look, restated at C12: each kind of line keeps its own 500, and no kind pushes another out". It checks that sign-ins and right proofs are each held to 500, the vault's start is kept, and no wrong proof goes.
- `second-devices.test.ts`: the three listings built by hand get `vault: true, pending: null`, so the file passes `tsc` again. The finding 3 test is now plain.

## What was run

In `tools/moneylens` of the worktree at `9bffa8cc`, with my three test files in place:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx tsc --noEmit -p src/server/tsconfig.json` | clean |
| `node --import tsx --test tests/second-erase.test.ts` | 10 tests: 5 pass, 0 fail, 5 todo |
| `node --import tsx --test tests/second-door.test.ts tests/second-devices.test.ts` | 22 tests, all pass |
| `npm test` | 559 tests: 554 pass, 0 fail, 0 skipped, 5 todo (findings 1 to 5) |

Scratch files are in `/tmp/review-c12-scratch`: the query plans of the tidy statements, and `keepVault` one second after the due time.

**Not run:**
- `npm run test:server`, `npm run test:app`, `npm run test:page`, the local runtime and any browser, as the card asks. The author reports that they pass, and I did not see those runs.
- The test that `120bf17b` adds: it is not in my worktree, and I read it.
- The author's exercise of taking each check out in turn.

No network was used, nothing was committed, and only my four files were written.

## Only a deployment or a phone can show

- **The alarm on the platform:**
  - that it fires at the due time on the Free plan, is retried, and survives deploys and eviction;
  - whether `deleteAll` takes it at this compatibility date;
  - whether `setAlarm` is billed as a row written (finding 5a).
- **Rows read** by the tidy and by the events call (`cursor.rowsRead`), including whether stepping through index entries counts.
- **The index on the owner's live database.** It is made on his existing database at the first sign-in after the deploy. The per-set queries were accepted on the local runtime only.
- **`forgetCache` in real browsers:** Safari (Web Locks, private windows, its seven-day rule), and with two tabs open.
- **Typing 清空 on a phone** with a Chinese input method, while the characters are still being composed.
- **BAK-3:** whether an erased vault can really be restored, by whom and how. 1.11 names it as the way back.

## Obligations on the next slices

**The weekly sweep (ARCH-10):**
- Go through `accountGone` (`deleteAll`), which also takes `erasing`, `spent` and the index.
- Delete the object's alarm, or show that `deleteAll` does.
- Never erase on an answer that is empty because a question failed.
- A pending erasing changes nothing the sweep does.

**Changing the passphrase, and a new recovery code:**
- Only from an unlocked session that shows the proof of the way it replaces, in the same request.
- Never reset `tries`. Erasing does, rightly, because the vault goes; replacing a way must not hand a guesser a fresh count.
- Keep `opened`. Re-wrapping does not take the key away from devices that had it, and the screen must not suggest that it does (removing a lost device needs a new key).
- An erasing asked for stays through the change.
- The change gets a line of its own kind, shown apart.
- Settle finding 1's root cause (the count kept apart for known devices) here at the latest.

**The import page:**
- Offer an export before erasing (VAULT-5), once there is one.
- When a write comes back 423, or the vault is gone, ask again where things stand and say what was not stored.
- Say when today's writes are used up, including those carried from a vault erased today.
- The idle lock covers the import, and the page's policy holds.

**Before anyone but the owner is let in:**
- Findings 1, 4 and 5 fixed.
- The mail sent when an erasing is asked for (section 3).
- BAK-3 confirmed.
- A review of the erasing path by another model or a person.

No real account, statement, key or token is in this review or its tests. Every value is invented.
