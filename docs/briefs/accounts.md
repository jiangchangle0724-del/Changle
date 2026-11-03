# 平台 · 账号与头像（accounts）

对话名「平台 · 账号与头像」。网址 changle.ca/me、/u/<名字>、/chat/<名字>、/admin。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

可选的账号：邮箱验证码登录、个人页（名字、城市、简介）、AI 动漫头像、好友和聊天、游戏记录，以及站长后台（剧本投稿审核等）。

## 文件

- 画面：`site/src/account/`
- 服务器：`site/worker/hub.ts` 里的账号、好友、聊天、记录部分；画头像 `site/worker/draw.ts`
- Cloudflare 里的钥匙（只写名字）：`RESEND_API_KEY`（登录邮件）、`GEMINI_API_KEY`（头像）

## 先读

- `HANDOFF.md` 的「Settings」

## 测试

- `site/scripts/account_check.py`（登录、资料、好友、聊天）

## 定过的事

- 不登录也能玩所有游戏。
- 登录一次保持五年；Safari 一周不用会清本地存储，所以登录也放在只发给 `/api/auth` 的 cookie 里。
- AI 头像每人每月一张。
- 许的愿上线后，许愿的人得到金色头像框和限量服饰。
- 本地不发邮件：`site/worker/.dev.vars` 里写 `DEV_SHOW_CODES=1`；画头像不用钥匙：`DEV_FAKE_DRAW=1`。

## 还剩什么

- 暂无记录。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 fix(ui): improve Chinese reading, zoom and touch accessibility (#93)
- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Small fixes from the play-test: unit price, the wheel's editor, sign-in and profile forms
- 2026-10-31 戏精大赏: players write scenes, a public library the owner approves, 26 more scenes
- 2026-10-31 The wishlist's reward: a gold frame and limited outfits when your wish goes live
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
