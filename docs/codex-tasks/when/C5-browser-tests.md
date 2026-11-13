# when-C5: phones in browsers

**Files:** new specs in `tools/when/tests/e2e/`: `crowd.spec.ts`, `reconnect.spec.ts`,
`sizes.spec.ts`, and helpers in `tools/when/tests/e2e/helpers.ts` if the owning chat's first spec
doesn't have what you need.
**Command:** `npx playwright test` (Chromium locally; Chromium and WebKit in CI, as
`playwright.config.ts` says).

**Not before A3.** The owning chat (工具 · 约时间) checks this card against the finished A2 first
and says when to start. Its own spec (`tests/e2e/flow.spec.ts`: one host, one guest, make, fill,
set) is the pattern: read it before writing anything.

The tests run against the real server on this computer (`wrangler dev`, started by Playwright).
Each phone is its own browser context, so each has its own storage, like a real phone.

## The specs

**`crowd.spec.ts`: many phones at once**
- A host makes a gathering; two, five and eight guests open it (three tests), each in its own
  context, and fill in different slots at the same time (`Promise.all`).
- Every phone ends up showing the same counts in every slot and the same best three, without a
  reload, within five seconds.
- Two guests tap the same slot in the same instant: both answers are there on every phone, and
  still there after each reloads.
- A guest can't change another guest's row: the request with someone else's id and its own key
  is refused (403), and nothing changes on any phone.

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
  equals `clientWidth`), every button at least 44 px tall, the main button not under the bottom
  bar's safe area.
- With the browser's text 150% bigger (`page.addStyleTag` setting `html { font-size: 150% }`),
  the same checks pass.
- With WeChat's user agent (`MicroMessenger` in it), the calendar button shows the "open in the
  browser" hint in place of a download, and copying still works through the fallback.

## Done when

- The three specs pass three times in a row locally in Chromium, and in CI in Chromium and
  WebKit. No `waitForTimeout` longer than 250 ms: wait for what the page shows.
- The whole e2e run stays under eight minutes in CI.
- `npm run typecheck` and `npm test` pass.
