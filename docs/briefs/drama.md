# 游戏 · 戏精大赏（drama）

对话名「游戏 · 戏精大赏」。网址 changle.ca/g/drama-queens。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每轮几个人上台演一段狗血剧情，其中一个人偷偷是小三或凶手。观众猜是谁，再给每个人的演技打星。被识破的、演得最差的受罚。

3 到 15 人。单机：手机传着看身份牌，演完再传着投票。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/drama.ts`
- 画面（单机和联机）：`site/src/party/drama/`
- 内容：`site/src/data/drama.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `drama` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `drama` 开头的测试
- `site/scripts/party_test.py`（单机和联机）

## 定过的事

- 玩家可以自己写剧本，写好的下一幕先演，编剧亲自上台。
- 登录的人可以投稿到公共剧本库，站长在 `/admin` 的「剧本投稿」里通过后所有桌都会抽到；每人每天最多投 5 个。
- 单机写好还没演的剧本存在这部手机上，刷新也不丢，演完或收回才删（#84）。
- 舞台美术是 Codex 画的，图片在 `site/public/drama/`。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 打碟 · DJ Booth: the beginner deck (everyone DJs at once), and the booth on the home list
- 2026-11-01 打碟 · DJ Booth A2: Lyria RealTime through the table's relay, as a private test
- 2026-11-01 Three small things from the player tests
- 2026-11-01 打碟 · DJ Booth: fixes from testing, playing it as a party, faster recording
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 戏精大赏: players write scenes, a public library the owner approves, 26 more scenes

## 记录

- 2026-11-02 建档案。
