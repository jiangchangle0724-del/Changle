# ui-C7: robots, sitemap, caching, add to home screen (PWA), share images

**When:** after A3 (the routing change) is merged. A3 gives every game its own address and puts
the list of addresses in the code; this card points crawlers, caches and share cards at them.
**Files:** `site/index.html` (head only), `site/src/main.tsx` (registering the service worker),
`site/package.json` (the `build` script only, no new dependencies), and new files:
`site/public/robots.txt`, `site/public/_headers`, `site/public/manifest.webmanifest`,
`site/public/icons/` (app icons), `site/public/og/` (share images), `site/scripts/postbuild.mjs`
(writes `dist/sw.js` and `dist/sitemap.xml`), `site/scripts/sw.template.js`, `site/og.html` with
`site/scripts/og_images.py` (makes the share images), `site/scripts/pwa_check.py`.
**Command:** in `site/`: `npx tsc --noEmit && npm run build && node scripts/postbuild.mjs --check`;
then `npx vite preview` and `python3 scripts/pwa_check.py`.

Steve decided on 2026-11-01 to make the site installable (加到主屏幕，全屏打开，没网也能打开首页).
Today `/robots.txt` returns the page itself (there is no file, so Pages answers with `index.html`,
which is where Lighthouse's 18 robots errors come from), hashed files are re-checked on every visit,
the address bar is painted an old red-brown (`theme-color` `#2A0907`), and a shared link has no picture.

## robots.txt and the sitemap

- `public/robots.txt`, four lines: `User-agent: *`, `Allow: /`, `Disallow:` each API under the
  address (`/eat/api/`, `/go/api/`, and any under `/trip/`: read the Workers' routes in
  `tools/*/wrangler.jsonc` and `games/been-there/wrangler.jsonc`, don't change them),
  `Sitemap: https://changle.ca/sitemap.xml`.
- `scripts/postbuild.mjs` writes `dist/sitemap.xml` from the same list A3 routes by: `/`, every
  playable game's page, the tools page, plus `/eat`, `/trip` and `/go` (the separate Workers).
  Not the table addresses (`/t/…`), not sheets like settings or sign-in.

## Caching (`public/_headers`, Cloudflare Pages)

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/og/*
  Cache-Control: public, max-age=86400
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

No `Permissions-Policy` that touches motion sensors: Limbo reads the phone's tilt. If A3 writes
pages per game (`/g/<name>/index.html`), give them `no-cache` too.

## Add to home screen

- `public/manifest.webmanifest`: `name` and `short_name` 开席 Lazy Susan (as the page title),
  `lang` zh-CN, `start_url` `/`, `scope` `/`, `display` `standalone`, `background_color` and
  `theme_color` `#0e0c22`, icons 192 and 512 plus a 512 maskable one (made from `favicon.svg`; the
  maskable one keeps the mark inside the middle 80%), `categories` games and entertainment.
- `index.html`: `<link rel="manifest">`, `theme-color` `#0e0c22`, `apple-mobile-web-app-capable`
  and `mobile-web-app-capable` yes, `apple-mobile-web-app-status-bar-style` `black-translucent`
  (the viewport already has `viewport-fit=cover`), `apple-mobile-web-app-title` 开席.
- The description meta still names 7 games; write one that fits today (both languages are fine
  in one line) and quote it in the PR for Steve.

## The service worker

Hand-written, no Workbox. `scripts/postbuild.mjs` fills `scripts/sw.template.js` with the build's
file list and a version (a hash of that list) and writes `dist/sw.js`; `npm run build` becomes
`vite build && node scripts/postbuild.mjs`.

- Install: cache the shell, which is `index.html` plus the entry JavaScript and CSS it links to.
- Navigations (any page address): network first, the cached `index.html` when offline. So someone
  online always gets the newest page, and an old version can't get stuck.
- `/assets/*`: cache first (the names change with every build). A game's chunk is cached the first
  time it loads, which is how a game played once opens offline.
- Never cache or touch: anything not on this origin (`rooms.changle.ca`, fonts are local anyway),
  `/eat`, `/go`, `/trip` and everything under them (other Workers), WebSockets, non-GET requests.
- Activate: delete caches from older versions. No `skipWaiting` on install: the new worker takes
  over on the next visit, so a game in progress never changes under the players. `lib/freshness.ts`
  already reloads a page whose old files are gone; keep that working, don't replace it.
- `src/main.tsx` registers `/sw.js` only in the production build (`import.meta.env.PROD`), after the
  page has loaded.
- Online tables need a connection: when offline, the online screens already say they can't reach
  the table; check that they still do, and that nothing else breaks.

## Share images

One 1200×630 PNG per playable game, plus `default.png` for the home page, in `public/og/`, named
by the game's address. Made once with a script and committed, not drawn by a Worker on every
request: static files cost nothing and can't run out of the free plan's CPU time.

- `site/og.html` (development only, like `ui-preview.html` in ui-C1: Vite serves it, the build leaves
  it out) lays out one card per game from `src/games/registry.ts`: the game's name in both
  languages, its icon, its type color (docs/DESIGN.md, 类型色) on the night background, the changle
  wordmark. Keep the name inside the middle square: WeChat crops to a square thumbnail.
- `scripts/og_images.py` screenshots each card at 1200×630 into `public/og/`. Each file under 300 KB.
  If Chinese shows as boxes in your environment, install a CJK font for the run (Noto Sans CJK).
- A3's pages point `og:image` and `twitter:image` at these files (A3 writes those tags). If A3 isn't
  doing that, add the tags in the same place A3 sets each page's title, and say so in the PR.

## The check script

`scripts/pwa_check.py` (Python Playwright, Chromium) against `npx vite preview`:

- `/robots.txt` is text with the four lines; `/sitemap.xml` parses and lists every playable game.
- The manifest loads, its icons exist and have the sizes it claims.
- After one visit and a reload, a service worker controls the page; offline (`context.set_offline`),
  the home page and a game played once still open; an online table says it can't connect.
- Build twice with a change in between: an open page gets the new version on its next navigation.
- Exits 1 on any failure or console error.

## Done when

- The command passes and `pwa_check.py` passes.
- On this PR's Cloudflare Pages preview (the "Cloudflare Pages" check links it): `curl -sI` shows
  the `Cache-Control` above for `/assets/…`, `/` and `/sw.js`; Lighthouse (mobile) gives SEO 98 or
  more and Best Practices 95 or more; Chrome DevTools shows the site as installable.
- The share images are in the PR, each readable as a small square.
- Then Steve's check: on his iPhone, 添加到主屏幕 opens full screen with no address bar; with
  airplane mode on, it still opens; a game's link sent in WeChat shows its title and picture.
