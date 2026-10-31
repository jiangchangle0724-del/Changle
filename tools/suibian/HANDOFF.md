# 随便 hand-off (2026-10-30)

For whoever picks up 随便 · Whatever's Fine at [changle.ca/eat](https://changle.ca/eat) next. How it
works and how to set it up: [README.md](README.md). Why it works that way: [DESIGN.md](DESIGN.md).
This page is the state of play: where things are, the commands, the settings, and what is left.
The whole of changle.ca (adding games, how changes go live): [HANDOFF.md](../../HANDOFF.md) at the
repository's root.

## Where the code is

One repository, `jiangchangle0724-del/changle-ca`. Each app has its own `package.json` and
`package-lock.json` (no root workspace), installs on its own and deploys on its own.

| Path | What | Deploys to |
| --- | --- | --- |
| `tools/suibian` | 随便: Cloudflare Worker `suibian` (Preact pages, Durable Objects, Google sign-in, Google Places) | changle.ca/eat |
| `site` | changle.ca itself (Vite, React). Its Tools tab has the 随便 card: `site/src/tools/Suibian.tsx` | Cloudflare Pages project `changle` |
| `games/been-there` | 到此一游. Another session has been working on it: check its open PRs before changing it | changle.ca/trip |

## Commands

Node 22 (what CI uses). Run each block inside its folder.

`tools/suibian`:

```sh
npm ci
npm run dev                        # build, then wrangler dev: http://localhost:8787/eat/ (demo restaurants, no sign-in)
npm run build                      # pages into dist/client/eat
npm run typecheck                  # tsc --noEmit
npm test                           # rules, room and Google sign-in tests (tsx --test tests/*.test.ts)
npx playwright install chromium    # once (CI also installs webkit)
npm run test:e2e                   # phones in a browser; starts wrangler dev on :8788 with test-only settings
CI=1 npm run test:e2e              # the same in Chromium and WebKit, as GitHub runs it
npm run deploy                     # by hand; normally Cloudflare deploys main by itself
```

`site`:

```sh
npm ci
npm run dev                        # Vite: http://localhost:5173; /eat and /trip are proxied to :8798 and :8799
npx tsc --noEmit
npx tsx tests/engine.test.ts && npx tsx tests/trip.test.ts && npx tsx tests/draw.test.ts
npm run build                      # into dist
```

To open the real 随便 from the site's Tools card locally, run `npm run build && npx wrangler dev
--port 8798` in `tools/suibian` while the site's `npm run dev` is running.

## Settings (names only, never the values)

`tools/suibian`, all type **Secret** in Cloudflare → Workers & Pages → `suibian` → Settings →
Variables and Secrets. Locally they go in `.dev.vars` (git-ignored); see `.dev.vars.example`.

| Name | What it is | Without it |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client "suibian changle.ca/eat" in Google Cloud project `changle-ca` | no sign-in, demo restaurants |
| `GOOGLE_CLIENT_SECRET` | that client's secret | same |
| `SESSION_SECRET` | signs the session cookie; changing it signs everyone out | same |
| `GOOGLE_PLACES_KEY` | API key "suibian places (server)", limited to Places API (New) | demo restaurants |
| `ALLOW_TEST_SETTINGS` | `1` only in local tests (`playwright.config.ts` passes it); never in Cloudflare | |

Real restaurants need all four of the first rows. `ROOMS`, `USERS`, `PLACES` (Durable Objects) and
`ASSETS` are bindings in `wrangler.jsonc`, not settings.

`site`: `VITE_ROOMS_URL` (optional, local dev: where the rooms server is, e.g.
`ws://127.0.0.1:8787`). The site's rooms Worker (`site/worker`, `changle-rooms`): secrets
`RESEND_API_KEY` and `GEMINI_API_KEY`; `MAIL_FROM` and `ADMIN_EMAILS` are in
`site/worker/wrangler.jsonc`; `GEMINI_IMAGE_MODEL` is optional; `DEV_SHOW_CODES` and `DEV_FAKE_DRAW`
are for local runs only.

GitHub Actions uses no secrets. Playwright reads `CI=1`.

## What this round changed

All merged into `main`:

| PR | What | Files |
| --- | --- | --- |
| #21 | 随便 moves under `/eat` and goes live at changle.ca/eat | `tools/suibian/`: `src/base.ts` (new), `src/server/worker.ts`, `src/server/auth.ts`, `src/client/main.tsx`, `src/client/net.ts`, `src/client/index.html`, `src/client/ui/Home.tsx`, `src/client/ui/Table.tsx`, `src/client/ui/Rate.tsx`, `scripts/build.mjs`, `wrangler.jsonc`, `playwright.config.ts`, `tests/e2e/table.spec.ts`, `tests/google.test.ts`, `README.md`, `DESIGN.md` |
| #23 | The 随便 card in the site's Tools tab | `site/src/tools/Suibian.tsx` (new), `site/src/tools/ToolsTab.tsx`, `site/src/styles/tools.css`, `site/vite.config.ts`, `site/README.md`, `.github/workflows/site.yml` (new) |
| #24 | README: how it deploys from this repository | `tools/suibian/README.md` |
| #27 | Privacy and terms pages at `/eat/privacy` and `/eat/terms` (Google needs them) | `tools/suibian/`: `src/client/privacy.html` (new), `src/client/terms.html` (new), `src/client/styles.css`, `src/client/i18n.ts`, `src/client/ui/Home.tsx`, `scripts/build.mjs`, `tests/e2e/table.spec.ts`, `README.md` |
| #28 | README: the e2e checks include those pages | `tools/suibian/README.md` |
| #29 | Headings on those pages a clear step above the text | `tools/suibian/src/client/styles.css` |

## Live state

* changle.ca/eat runs `main`. Cloudflare Workers Builds deploys `suibian` on every merge that touches
  `tools/suibian/*` (root `tools/suibian`, build `npm run build`, deploy `npx wrangler deploy`).
  The site deploys from `site/*` the same way (Pages project `changle`, root `site`, output `dist`).
* Google sign-in is on: OAuth app published ("In production"), scopes `openid` and `profile`,
  redirect URI `https://changle.ca/eat/auth/callback`.
* Google Cloud project `changle-ca`: billing linked (free trial), Places API (New) on, the key
  limited to Places API (New). Budget "changle-ca monthly CA$20", email at 50% and 90%, with
  promotional credits left out so the trial credit doesn't hide spending. Daily caps, set with the
  Cloud Quotas API because the console can't edit quotas that have never been used:
  `SearchNearbyRequestPerDayPerProject` 200, `GetPlaceRequestPerDayPerProject` 600,
  `GetPhotoMediaRequestPerDayPerProject` 600.
* **Not done yet:** the Cloudflare Secret `GOOGLE_PLACES_KEY`. Until it is set the tool runs on demo
  restaurants with the yellow 示例数据 banner. After setting it, do the check under "3. Real
  restaurants" in the README.

## Open items

* The severe-allergy table `SEVERE_RULES_OUT` in `src/engine/limits.ts` is a **draft** and needs
  review by friends who have those allergies.
* Design: the left border on `.quote` (the Google review line about queues on round 2 cards,
  `src/client/styles.css`) is waiting for the owner's call.

## Working rules

* Every change on a new branch with a PR; never push to `main`. CI must be green before merging:
  `suibian.yml` (typecheck, unit tests, build, Playwright in Chromium and WebKit) and `site.yml`
  (tsc, tests, build).
* Merging deploys, so ask the owner before merging.
* No keys, secrets or tokens in code, commits, chat or screenshots. They go only in Cloudflare
  Secrets (or a local, git-ignored `.dev.vars`).
* `privacy.html` and `terms.html` must stay true to what the code stores; Google's sign-in screen
  links to them.
