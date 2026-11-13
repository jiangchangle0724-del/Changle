# 平台 · 账号与头像（accounts）

对话名「平台 · 账号与头像」。网址 changle.ca/me、/me/friends、/u/<id>、/chat/<id>、/admin。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

可选的账号：邮箱验证码登录、个人页（名字、城市、简介）、照片或 AI 动漫头像、好友和聊天、游戏记录（战绩），以及站长后台（踢人、拉黑、全站暂停、审剧本和一本正经的卡片）。另外，房间服务器代别的 changle.ca Worker 发信的入口也在这里（跟一单的新订单通知是第一个用它的）。

## 文件

- 画面：`site/src/account/`（登录 `SignIn.tsx`、个人页 `MePage.tsx`、资料 `ProfileForm.tsx`、AI 头像编辑器 `avatar/`、好友 `Friends.tsx`、聊天 `ChatPage.tsx`、别人的页 `UserPage.tsx`、战绩 `History.tsx`、后台 `AdminPage.tsx` 和 `AdminScenes.tsx`；`AdminCards.tsx` 是一本正经那个对话的）
- 服务器：`site/worker/hub.ts` 里的账号、好友、聊天、记录、后台部分；画头像 `site/worker/draw.ts`；代发信的入口 `site/worker/mail.ts`（具名入口 `Mail`）和它的规矩 `site/worker/notice.ts`
- 本地替身：`site/scripts/fake_mail.mjs`（假的 Resend）、`site/scripts/mail_door/`（绑着 Mail 入口的替身 Worker，只给检查用）
- Cloudflare 里的钥匙（只写名字）：`RESEND_API_KEY`（登录邮件和代发的信）、`GEMINI_API_KEY`（头像）
- 共用文件里我们的几行：`site/worker/index.ts` 的 `export { Mail }`；`.github/workflows/site.yml` 的 `tests/mail.test.ts` 一行；`HANDOFF.md` 房间服务器那一行和 Settings 表里的 `DEV_MAIL_URL`

## 先读

- `HANDOFF.md` 的「Settings」
- `site/worker/notice.ts` 开头：别的 Worker 发信要给什么、拿回什么
- 跟一单的档案 `docs/briefs/tuan.md`「交给别的对话」：它靠 `GET /api/me` 回的 `user.id`、`user.email`、`user.name`、`user.master` 和没登录时的 401 认商家。改这几样之前先说一声。

## 测试

- `npx tsx tests/mail.test.ts`：代发信的规矩（CI 里也跑）
- `npx tsx tests/draw.test.ts`、`npx tsx tests/cutout.test.ts`：头像的提示词和抠图
- 手机尺寸的浏览器（要房间服务器和网站都在跑，`site/README.md`「自己跑起来」）：`python3 scripts/account_check.py`（登录、资料、好友、聊天、一桌人的头像；加 `--solo` 连单机战绩一起）、`python3 scripts/admin_check.py`（后台：踢人、拉黑、暂停、每月头像、保持登录）、`python3 scripts/perk_check.py`（许愿的奖励）、`python3 scripts/stage_check.py`（头像上猜歌名的台）
- `python3 scripts/mail_door_check.py`：代发信从头到尾（怎么跑在它开头）
- 这几个脚本只在 `.broken`（「这里出了点问题」）挡住它们时才会发现页面报错；最好改成遇到页面报错就算失败（见「还剩什么」）。

## 定过的事

- 不登录也能玩所有游戏。
- 登录一次保持五年；Safari 一周不用会清本地存储，所以登录也放在只发给 `/api/auth` 的 cookie 里。
- AI 头像每人每月一张（一个月里最多画 6 次，选定一张就算用掉）。
- 许的愿上线后，许愿的人得到金色头像框和限量服饰。
- 本地不发邮件：`site/worker/.dev.vars` 里写 `DEV_SHOW_CODES=1`；画头像不用钥匙：`DEV_FAKE_DRAW=1`；要看发出去的信：跑 `node scripts/fake_mail.mjs`，写 `DEV_MAIL_URL=http://127.0.0.1:8791/emails`。
- 2026-11-13 Steve 定的（跟一单的档案）：订单邮件由房间服务器代发，新 Worker 上不再放钥匙。
- 2026-11-13 代发信入口的规矩，这个对话定的，Steve 可以改（都在 `site/worker/notice.ts` 和 `hub.ts` 的 `notice()`，改起来都小）：
  - 只有具名入口 `Mail`（`WorkerEntrypoint`），从 Service Binding 调 `env.MAIL.send(notice)`。rooms.changle.ca 上没有对应的地址。
  - 给什么：`{ app, to, subject, text, link?, lang }`。`app` 先只认 `"tuan"`；`to` 必须是 changle.ca 注册过、没被拉黑的账号的登录邮箱，别人一律不发；标题一行、120 字以内；正文纯文字 2000 字以内，换行保留；链接只能是 https://changle.ca 下面的（本地跑可以是 localhost）；`lang` 是 zh 或 en。
  - 拿回什么，只有三种：`{ status: "sent" }`、`{ status: "full" }`（今天满了，当天别再试）、`{ status: "failed", why }`（why 是 app、to、subject、text、link、lang、no-mail、mail、down 之一，给调用方记日志用）。
  - 每天的上限按 app 算，UTC 日：跟一单 60 封（Resend 免费版一天 100 封，剩下的留给登录验证码）。计数存在 hub 的 `mails` 表里，服务器重启也不清零；先计数再发，没发成就退回。
  - 信的样子和验证码邮件同一个框：正文、一个「打开 / Open」按钮带链接、一句「由 changle.ca 代「跟一单」发出」。发信人还是 `MAIL_FROM`。
  - 代发的信和验证码走同一个 `deliver()`；没有 `RESEND_API_KEY` 时回 failed / no-mail（本地没钥匙就用 `DEV_MAIL_URL`）。

## 现在

2026-11-13：账号这块都在线上。代发信的入口做好了（这次的 PR），等跟一单那边接上。

- 登录、个人页、照片或 AI 头像、好友、聊天、战绩、后台，都有，本地四个检查脚本过（11 月 4 日跑的：登录、后台到头像那一步前、许愿奖励、上台）。
- 代发信：本地从替身 Worker 经 Service Binding 调过，61 封里 60 封到了假 Resend，第 61 封回 full；拒绝的、被拉黑的、Resend 报错的都对；验证码邮件改走 `deliver()` 以后也发了一遍。线上还没有谁调过它。

## 还剩什么

都是 11 月 4 日查出来、复现过的，代码还没改（11 月 13 日看 main 上还在）：

1. **AI 头像编辑器会把页面弄崩**：Chrome、Edge 150 起（2026 年 6 月底，含安卓），iPhone 不受影响。在编辑器里换过一次分类（发型、穿搭这些）再换一次或关掉，整页变成「这里出了点问题」；已经有头像的人打开编辑器再关也崩。画到一半的图没了，这个月 6 次里用掉的不退。原因：`site/src/account/avatar/Maker.tsx` 里 `useLayoutEffect(() => panel.current?.scrollTo({ top: 0 }), [tab])` 把 `scrollTo` 的返回值交给了 React 当清理函数，而这些浏览器的 `scrollTo` 现在返回一个 Promise（[scroll method promises](https://web-platform-dx.github.io/web-features-explorer/features/scroll-promises/)）。改成带大括号的函数体就好（在副本里改过，三种走法都过，后台检查全过）。同一个 PR 里顺便让检查脚本遇到页面报错就算失败。
2. **单机游戏的战绩经常记不上**：只有点游戏里的返回键才记；直接关网页或跳到别的网址就没了（`App.tsx` 的 `useSoloHistory` 只在卸载时发，`pagehide` 时的 fetch 没带 keepalive）。代码在首页对话的地盘，见「交给别的对话」。
3. **屏蔽了解不开**：没有解除的按钮，服务器也没有 `DELETE /blocks/<id>`。要不要做成一个「已屏蔽的人」名单，等 Steve 定。
4. **未读数字消不掉**：有未读消息时被对方删好友，或自己把对方屏蔽，头像上的数字就一直挂着（`unread()` 不看好友关系）。
5. 头像的第三种身形叫「中性」（Steve 当时写的是「双性别」），10-30 问过，没确认。
6. 代发信：后台看不到今天发了几封（`mails` 表里有）；要的话在 /admin 加一行。

## 交给别的对话

- 「工具 · 跟一单」：代发信的入口有了（`site/worker/mail.ts`，合并上线即生效）。接法：`tools/tuan/wrangler.jsonc` 的 `services` 里加 `{ "binding": "MAIL", "service": "changle-rooms", "entrypoint": "Mail" }`，调 `await env.MAIL.send({ app: "tuan", to: 商家登录邮箱, subject, text, link: "https://changle.ca/tuan/…", lang })`，回话和限制见上面「定过的事」。测试里的替身照 `site/scripts/mail_door/index.ts` 反过来写一个 `export class Mail extends WorkerEntrypoint { send() {} }` 就行。合并通知（每家店第一单马上发，之后最多半小时一封）在跟一单那边做。
- 「平台 · 首页与上线」：`site/src/App.tsx` 的 `useSoloHistory` 在 `pagehide` 时发的请求要带 `keepalive`（或改用 `navigator.sendBeacon`），不然关网页就记不上单机战绩（上面第 2 条）。这个对话可以只改那几行，也可以由首页对话做。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-13 账号：房间服务器给内部 Worker 的发信入口（Mail 入口、notice.ts、假 Resend、检查脚本）
- 2026-11-05 一本正经：战绩和卡片反馈（升级 4）
- 2026-11-05 fix(admin): show search and review failures (#219)
- 2026-11-05 ui-C5 accounts：加载、空、失败与操作反馈 (#218)
- 2026-11-05 ui(C5): no blank page while its file loads, and the wishlist's empty, loading and error states (#214)
- 2026-11-03 perf(site): GSAP leaves the home page: its first download 147.7 → 115.6 KB gzip (UI plan A6, step 2) (#144)
- 2026-11-01 fix(ui): improve Chinese reading, zoom and touch accessibility (#93)
- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Small fixes from the play-test: unit price, the wheel's editor, sign-in and profile forms
- 2026-10-31 戏精大赏: players write scenes, a public library the owner approves, 26 more scenes
- 2026-10-31 The wishlist's reward: a gold frame and limited outfits when your wish goes live
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-04 开场盘点：读了档案、代码和四个检查脚本，本地跑了一遍，查出「还剩什么」的 1 到 4 条并逐条复现。那时仓库刚改名（changle-ca → Changle），这个对话推不了分支，没动代码，也没能更新档案；今天补上。
- 2026-11-13 按跟一单档案的「交给别的对话」做了代发信的入口：`notice.ts`（规矩和信）、`mail.ts`（具名入口）、`hub.ts` 的 `notice()` 和 `mails` 表、`index.ts` 一行、假 Resend、替身 Worker、`tests/mail.test.ts`（CI）和 `scripts/mail_door_check.py`。本地三个进程一起跑，检查全过；验证码邮件也重跑了一遍。开工时看了 main 上 9 天的提交，账号这块只有别的对话加进来的几行（一本正经的表挂进 hub、加载和失败状态），没有碰 `mail`。
