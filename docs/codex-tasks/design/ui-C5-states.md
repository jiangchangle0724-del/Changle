# ui-C5: empty, loading and error states across the site, one PR per area

**When:** after the samples are on main (the C5 PR: `PageLoading` in `site/src/games/GameLoading.tsx`,
`App.tsx`, the four `account/` pages, `home/WishlistTab.tsx`).
**Files, per PR:** that area's own files (the table below), and in `site/src/App.tsx` only the one
`<Suspense fallback=…>` line the table names. Screenshots in `site/local-shots/c5/<area>/`. Nothing else:
not `site/src/ui/`, `games/GameLoading.*`, `router.ts`, the room server, other areas, or
`docs/codex-tasks/README.md`.
**Branch:** `codex/ui-c5-<area>`, from main, one per area.
**Command:** in `site/`: `npx tsc --noEmit`, every test that `.github/workflows/site.yml` runs, `npm run build`
and `npx tsx scripts/budget.ts`. Then the checks below in `npm run dev` at 390×844, in Chinese and in
English, with no console errors.

About 120 places on the site show an empty list, a wait or a failure. None of them uses the shared
components yet: there are blank screens while a page's file downloads, `div.empty > p` boxes, `p.hint`
lines, failures that say nothing, and network failures that say "not found". Read first:

- `docs/DESIGN.md`, the section 空的、在加载、出错了: the rules and the five lines the whole site says.
- `site/src/home/WishlistTab.tsx`: the pattern for a list. `Skeleton` while it loads (with the slow line),
  `EmptyState tone="error"` with 再试一次 when it fails, `EmptyState` when it's empty, a `Toast` when a
  vote doesn't go through (`ToastProvider` wraps that tab).
- `site/src/games/GameLoading.tsx` `PageLoading`: the pattern for a whole page (`account/MePage.tsx` uses
  it while the account status loads).
- `site/src/ui/EmptyState.tsx`, `Skeleton.tsx`, `Toast.tsx` and their types in `site/src/ui/types.ts`.

## The rules, short

1. **Never blank.** Anything that waits shows the shape of what's coming: `Skeleton` for a list or a
   card, `PageLoading` for a page. The slow line comes from `Skeleton`'s `slowText` (or `PageLoading`).
2. **Empty says what's missing and the one way on.** `EmptyState` with a title, a short body, at most one
   action. Keep the words the area already has when they are good (most are); split a long sentence
   into title and body rather than writing new words.
3. **A failure is not "nothing".** Network failures use the lines below, never 找不到 / 还没有 / 没搜到.
   A real "not found" (the server says so) keeps its own words.
4. **A tap that didn't go through says so** with a `Toast`, instead of quietly undoing.
5. **No new copy beyond this card.** Every line a player reads is below or already in the code. If a
   state needs words that aren't here, stop and say so in the PR.

## The words (Steve signed them off on 2026-11-05)

The five site-wide lines are in `docs/DESIGN.md`. These are the area-specific ones:

| Where | Before | Now (中文 / English) |
| --- | --- | --- |
| Someone's profile, offline | 找不到这个人 | 没连上，检查一下网络 / Couldn't connect. Check your connection |
| /me, games played, failed to load | 还没有记录 | 没连上，检查一下网络 / Couldn't connect. Check your connection |
| Friend search, back office search, offline | 没找到 | 没搜成，检查一下网络 / The search didn't go through. Check your connection |
| Saving my profile, offline | 检查一下填的内容 | 没保存上，检查一下网络 / Couldn't save. Check your connection |
| Song request, YouTube unreachable | YouTube 不让这首在这里放 | 没连上 YouTube，检查一下网络 / Couldn't reach YouTube. Check your connection |
| TV, site paused or device blocked | 连不上这张桌 | the phone's signs: changle 暂停中 … / 这台设备已被停用 / This device has been blocked |
| Games played, a game that's gone | its raw id | 一个已经下架的游戏 / A game that's no longer here |
| TV, the table's connection drops | nothing | 网断了，正在重连 / Connection lost. Reconnecting |
| A QR code that won't draw | an empty box | 扫不了就输入桌号 1234 / Can't scan? Enter table 1234 |
| World clock, every city added | nothing | 城市都加上了 / Every city is already here |
| Song search, really nothing | nothing | 没搜到这首，换个说法试试 / Nothing came up. Try other words |
| Chat, earlier messages fail | the button just resets | 没加载出来，点这里再试 / Didn't load. Tap to try again |

## The PRs

Suggested order. Each row is one PR. To find the spots in an area, search it for `fallback={null}`,
`className="empty"`, `p.hint`, `catch {`, `.catch(() =>`, 加载中, 正在, 失败, 没找到, `Loader2`.

| Area | Slug | Files | What |
| --- | --- | --- | --- |
| 账号 | `accounts` | `src/account/` (not `AdminPage`, `AdminScenes`), `App.tsx` sign-in fallback | /me games played and stats: `Skeleton`, failure apart from empty; friends list `Skeleton`, its failures; friend search failure; /u/:id failure apart from not found; /chat message list `Skeleton`, 再试一次 on 聊天没加载出来, earlier messages failure; the sign-in sheet while its file loads (a sheet-shaped `Skeleton`); profile save offline line; silent photo, avatar and friend failures get a `Toast`; a gone game's id in history |
| 后台 | `admin` | `src/account/AdminPage.tsx`, `AdminScenes.tsx` | search failure apart from nobody; scenes list `Skeleton` and failure; approve and reject failures get a `Toast` |
| 联机桌（手机） | `online` | `src/online/` | a watching seat and 最后一张 while their file loads (`PageLoading` or `Skeleton`, not `null`); the invite QR that won't draw; the face sheet while the profile loads |
| 大屏 | `tv` | `src/tv/`, `App.tsx` /tv fallback | /tv while its file loads (in the TV's own look, not the phone's); paused and blocked as on the phone; the connection-lost line; the lobby QR that won't draw; the watching phone's bare spinner gets words |
| 打碟 | `dj` | `src/party/dj/`, `App.tsx` /dj/test fallback | YouTube unreachable apart from not allowed; song search offline apart from no results, and a waiting shape while it searches; really no results |
| 工具 | `tools` | `src/tools/` | world clock with every city added; currency and unit price say when rates can't load (keep the cached rates and their age) |
| 游戏里 | `games` | `src/party/drama/`, `src/party/tune/` | drama scenes library and "my scenes" failures (now silent); keep everything else |

Not in C5: the room server, protocol codes, `/eat`, `/go`, `/trip`, `/hide` (other Workers), and
`home/Home.tsx`'s /tools and /wish panels (they would add to the front door's download; leave them).

## Check, in each PR

1. Every state the row names, in Chinese and English at 390×844: make it happen with the browser's
   offline switch, or Playwright's `page.route` (abort for a failure, leave the request waiting for the
   loading shape, fulfill with an empty list for empty). Screenshot each one in
   `site/local-shots/c5/<area>/<state>-<lang>.png`.
2. Loading: the shape shows at once, and 网有点慢，马上就好 after 2 s. Nothing is blank, and there's a way back.
3. Failure: the right line (offline is never 找不到), and 再试一次 works once the network is back.
4. Reduced motion: the shapes stand still.
5. `npx tsx scripts/budget.ts` unchanged for the front door.
