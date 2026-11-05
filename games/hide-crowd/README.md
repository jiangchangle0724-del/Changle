# 藏在人群里 · Hide in the Crowd

A party game on [changle.ca](https://changle.ca), played with everyone's own phone. Each player
steers one person in a crowd of 18 passers-by the computer walks around. Walk like them and
nobody can tell it's you; spot a rival and punch: a hit scores, a passer-by stuns you, and a
tagged player gets up in another body somewhere else in the crowd. First to 3 tags, or the most
tags after 75 seconds. The round ends in a penalty: whoever got spotted most takes a sip. A big
screen (a TV or a computer) shows the whole crowd and never marks who is human. Three 3D arenas:
Vancouver Seawall Park, a Vancouver transit hall, a courtyard theatre. 2 to 8 players, Chinese
and English.

How it looks, where the art comes from and what a design change has to keep: [DESIGN.md](DESIGN.md).

## How it sits inside changle.ca

* **It starts from a table.** On changle.ca the host picks 藏在人群里 from a table's games. The
  host's phone asks this Worker for a room by itself (`POST /hide/api/rooms` with the table's code
  and the table's own penalty; the room keeps that phone its host for 90 seconds), and every phone
  at the table and the table's big screen go in by themselves:
  `changle.ca/hide/r/<room>?table=<table>` and `changle.ca/hide/tv/<room>?table=<table>`. Names and
  language come along (same site, same storage). A seat that only watches gets a button to the
  game's big screen. Players join with the table's code, as for any other game.
* **It goes back to the table.** Any phone's back button (in a round, the menu's 回到这桌) goes back
  to the table (the game stays on there, with "back to the game"). When the host goes back (after a
  question), the game ends: every phone and the big screen follow by themselves, and the table's
  host closes it there, so everyone lands in the table's lobby. (Whoever is the table's host by
  then: a seat that stayed at the table takes the role over when the host has been away a while.)
* **One phone:** the game card's one-phone button opens `changle.ca/hide/practice`, one player
  against three computer rivals.
* **Addresses.** The Worker answers `changle.ca/hide` and `changle.ca/hide/*` (the routes in
  `wrangler.jsonc`); the rest of changle.ca is the site. A bare `/hide` leads to the game's card on
  the site, `/hide/tv` to the site's big screen.
* **The site's side** (the game's card, opening it from a table, the big screen's button, the way
  back) is in the site's code: `src/party/hide/`, the stand-in rules in
  `src/shared/engine/games/hide.ts`, and its test `tests/hide.test.ts`.

## What's where

| Folder | What it is |
| --- | --- |
| `src/engine` | The rules of a round: the crowd, movement, punches, tags, the tagged player slipping away, the round's penalty. Pure, shared by the server, the tests and the browser. |
| `src/room` | One game room: who's in it, the host, the lobby (votes, the penalty switch), the round, the result, and what each phone or big screen is shown (never who is a player). No networking inside. |
| `src/server` | The Cloudflare Worker. Each room is one Durable Object that moves the crowd 20 times a second during a round. |
| `src/client` | The pages: phone screens, the big screen, practice, credits; Chinese and English. |
| `src/client/art` | The art: three backdrops and the crowd (AI-made), three 3D sets (made by our Blender script). See DESIGN.md. |
| `tools/blender` | The script that builds the 3D sets. |
| `tests` | Unit tests (Node) and browser tests (`tests/e2e`, Playwright). |

## Run it on a computer

```sh
npm ci
npm run dev          # builds, then serves the game at http://localhost:8787/hide/
```

`npm run dev` runs the game by itself (`STANDALONE=1`), with its own start page: open
http://localhost:8787/hide/ in two browser windows, open a room in one and join it from the other.
From a phone on the same Wi-Fi: `npm run dev -- --ip 0.0.0.0` and the computer's address on port
8787. With a changle.ca table: run the site (`site/README.md`) with this game on port 8797
(`npx wrangler dev --port 8797 --var STANDALONE:1`; the site's `/hide` is proxied there), then
`python3 scripts/hide_test.py` in `site` plays the whole hand-off.

`?fps=1` on a room's address shows the frame meter (for a real phone); `?flat=1` draws the flat
arena instead of 3D.

## Check it

```sh
npm run typecheck
npm test             # rules, room, privacy, penalty, design tokens, strings, art budgets
npm run test:e2e     # phones and a big screen in Chromium: joining, a round, a tag, the penalty,
                     # the big screen hiding the players, the hand-off from a table, practice
```

GitHub runs all three on every push, in Chromium and WebKit (`.github/workflows/hide-crowd.yml`).
Locally, `E2E_PORT` picks the test server's port and `PW_CHROMIUM` a Chromium already on the
machine.

## Put it online

Cloudflare builds and publishes the game on every merge into `main` once the repository is
connected (below). From a computer instead: `npx wrangler login`, then `npm run deploy`.

**Cost:** nothing on the plan the other Workers use (the free plan; `tools/events` and
`games/party-server` run there too). A room is one SQLite Durable Object, which the free plan
allows. During a round the room keeps the crowd in memory and stores only what changes (a join,
a vote, a tag, the end of the round): a round costs about 30 writes and, with four players, about
250 requests (each player's stick counts 1 request per 20 messages). The free plan's daily
limits (100,000 requests, 100,000 writes, 13,000 GB-s) cover a few hundred rounds a day.

### 第一次接上 Cloudflare（Steve 做一次）

这个游戏是一个新的 Worker，名字 `hide-crowd`，要像随便、到此一游一样接到 GitHub：之后每次合并进 `main`，Cloudflare 自己构建、上线。先做这一步，再合并这个改动（不然首页的卡片点进去，`changle.ca/hide` 还没有东西）。

1. **新建 Worker。** 打开 Cloudflare 后台 → Workers & Pages → Create → 选 Import a repository（从 GitHub 导入）→ 选 `changle-ca` 这个仓库。
2. **填设置。**
   - Project name（名字）：`hide-crowd`（必须和 `wrangler.jsonc` 里的 `name` 一模一样）
   - Root directory（根目录）：`/games/hide-crowd`
   - Build command（构建命令）：`npm run build`
   - Deploy command（部署命令）：`npx wrangler deploy`
   - 往下找 Build watch paths（监视路径），填 `games/hide-crowd/*`
   - API token 选现在用的那把「suibian build token」
   - 不用加任何 Secret，也不用建数据库：房间（Durable Object）跟着部署自己建好。
3. **只构建 main。** 建好以后进这个 Worker 的 Settings → Build → Branch control：生产分支是 `main`，「Builds for non-production branches」不要勾（和别的 Worker 一样，不然每个 PR 都会多一个失败的检查）。
4. **合并这个改动。** 合并后几分钟，Cloudflare 构建完。打开 `changle.ca/hide/practice`，看得到人群在走就成了；再在一张桌上选藏在人群里试一局。
5. **旧的测试地址（可以顺手删）。** Codex 之前把旧名字的版本部署到了单独的子域名（PR #5 里写着）。新游戏不用它。在 Workers & Pages 里找到 Codex 那个旧 Worker，Settings → Domains & Routes 删掉它的自定义域名，再删掉这个 Worker。

不花钱：上面「Cost」一段算过，用的是免费版，几百局一天都在额度里。

## Numbers you might want to change

* The round: `MATCH_MS` (75 s), `SCORE_TO_WIN` (3), `NPC_COUNT` (18), speeds, punch range and
  timings in `src/engine/index.ts`; `HIDE_AWAY_DISTANCE` for how far a tagged player slips away.
* The penalty: `roundPenalty` in `src/engine/index.ts`.
* How long the table's host is kept the host (`HOST_HOLD`, 90 s), and a host who drops off
  (`HOST_GRACE`, 30 s): `src/room/room.ts`.
