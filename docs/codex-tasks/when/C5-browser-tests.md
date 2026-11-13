# when-C5: phones in browsers

**Files:** new specs in `tools/when/tests/e2e/`: `crowd.spec.ts`, `reconnect.spec.ts`,
`sizes.spec.ts`. `tools/when/tests/e2e/helpers.ts` is there already: add to it what you need,
without changing what it has.
**Command:** `npx playwright test` (Chromium locally; Chromium and WebKit in CI, as
`playwright.config.ts` says).

**Ready to start (2026-11-13).** A2 is finished and live, and this card was checked against it.
The owning chat's spec, `tests/e2e/flow.spec.ts`, is the pattern: read it before writing anything.
What every test starts from is in `tests/e2e/helpers.ts` (`phone`, `make`, `join`, `cell`, `saved`,
`catchCopies`, the WeChat and Android user agents): import from there. Find things on the page the
way those two files do. The grid is being added to while you write (quick fill, holidays above a
day), and the owning chat keeps `cell()` and `saved()` right.

The tests run against the real server on this computer (`wrangler dev`, started by Playwright,
with the daily allowances lifted). Each phone is its own browser context, so each has its own
storage, like a real phone.

`flow.spec.ts` already has these, so don't write them again: two phones tapping one slot at once,
a request with someone else's row id being refused, the hint on the calendar button inside
WeChat, and one phone at 320 wide.

You only write tests. If a check fails because of the page and not the test, don't change the
page: mark that test `test.fixme` with one line saying what the page did, and list it in the PR.

## The specs

**`crowd.spec.ts`: many phones at once**
- A host makes a gathering; two, five and eight guests open it (three tests), each in its own
  context, and fill in different slots at the same time (`Promise.all`).
- Every phone ends up showing the same counts in every slot and the same best three, without a
  reload, within five seconds.
- Eight guests tap the same slot in the same instant: all eight answers are there on every
  phone, and still there after each reloads.

**`reconnect.spec.ts`: a dropped connection**
- A guest goes offline (`context.setOffline(true)`), another guest fills in two slots, the first
  comes back: it shows the new answers within fifteen seconds without a reload.
- A guest fills in a slot while offline: the page says it couldn't save, keeps the tap, and saves
  it by itself once the phone is back.
- With WebSockets blocked (`page.routeWebSocket` closing every socket), the page still catches up
  through its ten-second refresh.

**`sizes.spec.ts`: small, large, WeChat**
- The home page and a gathering with eight answers at 320 × 568, 390 × 844 and 430 × 932, in
  Chinese and in English: nothing wider than the screen (`document.documentElement.scrollWidth`
  is no more than `clientWidth`), every button at least 44 px tall.
- With the text 150% bigger, nothing is wider than the screen at any of the three sizes. Make it
  bigger with `page.evaluate(() => { document.documentElement.style.fontSize = "150%"; })`
  after each page opens, and check it took (the root font size is 24px). `page.addStyleTag`
  doesn't work here: the pages only run their own style files, and the browser refuses the tag.
- With WeChat's user agent (`WECHAT` in the helpers) and no `navigator.clipboard` (take it away
  in an init script), pressing a copy button ends one of two ways: the button says it copied, or
  the copy-by-hand field (`.copy-manual`) shows the whole text.

## Done when

- The three specs pass three times in a row locally in Chromium, and in CI in Chromium and
  WebKit. No `waitForTimeout` longer than 250 ms: wait for what the page shows.
- The whole e2e run stays under eight minutes in CI.
- `npm run typecheck` and `npm test` pass.
