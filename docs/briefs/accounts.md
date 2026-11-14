# 平台 · 账号与头像（accounts）

对话名「平台 · 账号与头像」。网址 changle.ca/me、/me/friends、/u/<id>、/chat/<id>、/admin。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

可选的账号：邮箱验证码登录、个人页（名字、城市、简介）、照片或 AI 动漫头像、好友和聊天、游戏记录（战绩），以及站长后台（踢人、拉黑、全站暂停、审剧本和一本正经的卡片）。另外，房间服务器代别的 changle.ca Worker 发信的入口也在这里（跟一单的新订单通知是第一个用它的）。3D 小人（玩家头像的 3D 版，会动、能选动作、以后能捏脸）的小样也在这里：changle.ca/me/figure。

## 文件

- 画面：`site/src/account/`（登录 `SignIn.tsx`、个人页 `MePage.tsx`、资料 `ProfileForm.tsx`、AI 头像编辑器 `avatar/`、好友 `Friends.tsx`、聊天 `ChatPage.tsx`、别人的页 `UserPage.tsx`、战绩 `History.tsx`、后台 `AdminPage.tsx` 和 `AdminScenes.tsx`；`AdminCards.tsx` 是一本正经那个对话的）
- 3D 小人的小样：`site/src/account/figure/`（页面 `FigurePage.tsx`、three.js 的部分 `Figure3D.tsx`、动作表 `moves.ts`）、模型 `site/public/models/figure.glb`（来历和许可在 `LICENSES.md`）；`Figure3D.tsx` 借用打碟的 `party/dj/robot3d.ts` 里的 `glOf()`（有没有图形芯片）和 `ratioFor()`，没改那个文件
- 服务器：`site/worker/hub.ts` 里的账号、好友、聊天、记录、后台部分；画头像 `site/worker/draw.ts`；代发信的入口 `site/worker/mail.ts`（具名入口 `Mail`）和它的规矩 `site/worker/notice.ts`
- 本地替身：`site/scripts/fake_mail.mjs`（假的 Resend）、`site/scripts/mail_door/`（绑着 Mail 入口的替身 Worker，只给检查用）
- Cloudflare 里的钥匙（只写名字）：`RESEND_API_KEY`（登录邮件和代发的信）、`GEMINI_API_KEY`（头像）
- 共用文件里我们的几行：`site/worker/index.ts` 的 `export { Mail }`；`.github/workflows/site.yml` 的 `tests/mail.test.ts` 一行；`HANDOFF.md` 房间服务器那一行和 Settings 表里的 `DEV_MAIL_URL`；`site/src/router.ts` 和 `App.tsx` 里 `/me/figure`（`kind: "figure"`）的几行

## 先读

- `HANDOFF.md` 的「Settings」
- `site/worker/notice.ts` 开头：别的 Worker 发信要给什么、拿回什么
- 跟一单的档案 `docs/briefs/tuan.md`「交给别的对话」：它靠 `GET /api/me` 回的 `user.id`、`user.email`、`user.name`、`user.master` 和没登录时的 401 认商家。改这几样之前先说一声。

## 测试

- `npx tsx tests/mail.test.ts`：代发信的规矩（CI 里也跑）
- `npx tsx tests/draw.test.ts`、`npx tsx tests/cutout.test.ts`：头像的提示词和抠图
- 手机尺寸的浏览器（要房间服务器和网站都在跑，`site/README.md`「自己跑起来」）：`python3 scripts/account_check.py`（登录、资料、好友、聊天、一桌人的头像、屏蔽后的角标；加 `--solo` 连单机战绩一起，多等一分钟）、`python3 scripts/admin_check.py`（后台：踢人、拉黑、暂停、每月头像、保持登录）、`python3 scripts/perk_check.py`（许愿的奖励）、`python3 scripts/stage_check.py`（头像上猜歌名的台）
- `python3 scripts/mail_door_check.py`：代发信从头到尾（怎么跑在它开头）
- `python3 scripts/figure_check.py`：3D 小人的小样（要网站的开发服务器，`VITE_ROOMS_URL=ws://127.0.0.1:8787 npm run dev`；最后一步站长的入口要房间服务器）。这台机器没有图形芯片，脚本用 `window.__figAnyGl`（只在开发构建里认）让页面照画
- 这四个浏览器脚本（account、admin、perk、stage）最后都有一条「页面里没有抛出错误」：页面报了错（哪怕被「这里出了点问题」接住了）就算失败。

## 定过的事

- 不登录也能玩所有游戏。
- 登录一次保持五年；Safari 一周不用会清本地存储，所以登录也放在只发给 `/api/auth` 的 cookie 里。
- AI 头像每人每月一张（一个月里最多画 6 次，选定一张就算用掉）。
- 许的愿上线后，许愿的人得到金色头像框和限量服饰。
- 本地不发邮件：`site/worker/.dev.vars` 里写 `DEV_SHOW_CODES=1`；画头像不用钥匙：`DEV_FAKE_DRAW=1`；要看发出去的信：跑 `node scripts/fake_mail.mjs`，写 `DEV_MAIL_URL=http://127.0.0.1:8791/emails`。
- 2026-11-13 Steve 定的（跟一单的档案）：订单邮件由房间服务器代发，新 Worker 上不再放钥匙。
- 2026-11-13 Steve 定的：头像「画成」的第三个选项就叫「中性」（10-30 他写的是「双性别」，今天确认用「中性」）；屏蔽要能解除，做成好友页里的「已屏蔽」名单。
- 2026-11-13 Steve 提的 3D 小人（原话：生成 3D 版本的人的模型，要更真实拟人一些，人物会动，可以摆酷、照相、睡觉、挥刀……再多设计一些动作，玩家可以自己选；最后还能捏脸；这样在 DJ、跳舞、戏精里能有更完美的呈现）。当天给他讲了三条路（自己用 three.js 建并捏脸、AI 把现有头像转 3D、现成网页捏人服务已基本没了），他定「先做小样」。小样的规矩：不花钱、不开 R2、首页不碰（three.js 只在这一页懒加载）、模型 1 MB 以内。
- 3D 小人小样的取舍（这个对话定的）：替身人模用 Ready Player Me 的样例男模加他们动作库的 17 段动作（许可只许配 RPM 的人模，不能挪到别的模型上，详见 `LICENSES.md`）；走路、跑步把髋骨的位移去掉，原地动；慢动作的关键帧减半（每秒 15 帧，中间插值），快的（跳舞、蹦迪、跑、走）保持 30；旋转量化成 16 位、meshopt 压缩；衣服上的 RPM 标志抹掉了。页面上的动作名是我起的中英文（站着、挥手、敬礼、鼓掌、点赞、欢呼、鞠躬、摊手、思考、眺望、秀肌肉、伸懒腰、看表、跳舞、蹦迪、走路、跑步）。Steve 要的睡觉、挥刀、照相这套免费动作里没有；「摆酷」先用秀肌肉顶着。
- 2026-11-13 代发信入口的规矩，这个对话定的，Steve 可以改（都在 `site/worker/notice.ts` 和 `hub.ts` 的 `notice()`，改起来都小）：
  - 只有具名入口 `Mail`（`WorkerEntrypoint`），从 Service Binding 调 `env.MAIL.send(notice)`。rooms.changle.ca 上没有对应的地址。
  - 给什么：`{ app, to, subject, text, link?, lang }`。`app` 先只认 `"tuan"`；`to` 必须是 changle.ca 注册过、没被拉黑的账号的登录邮箱，别人一律不发；标题一行、120 字以内；正文纯文字 2000 字以内，换行保留；链接只能是 https://changle.ca 下面的（本地跑可以是 localhost）；`lang` 是 zh 或 en。
  - 拿回什么，只有三种：`{ status: "sent" }`、`{ status: "full" }`（今天满了，当天别再试）、`{ status: "failed", why }`（why 是 app、to、subject、text、link、lang、no-mail、mail、down 之一，给调用方记日志用）。
  - 每天的上限按 app 算，UTC 日：跟一单 60 封（Resend 免费版一天 100 封，剩下的留给登录验证码）。计数存在 hub 的 `mails` 表里，服务器重启也不清零；先计数再发，没发成就退回。
  - 信的样子和验证码邮件同一个框：正文、一个「打开 / Open」按钮带链接、一句「由 changle.ca 代「跟一单」发出」。发信人还是 `MAIL_FROM`。
  - 代发的信和验证码走同一个 `deliver()`；没有 `RESEND_API_KEY` 时回 failed / no-mail（本地没钥匙就用 `DEV_MAIL_URL`）。

## 现在

2026-11-13：账号这块都在线上。代发信的入口上线了（#457），等跟一单那边接上。AI 头像编辑器崩页面的 bug 修了（下面「最近的改动」）。3D 小人的小样在 changle.ca/me/figure（站长 /me 底部有入口，别人只能靠网址），等 Steve 在手机上看效果和流畅度再定下一步。

- 3D 小人的小样：一个替身人模、17 个动作按钮、左右拖动转圈、页面底下一行数字（模型 KB、面数、帧率、引擎 KB）。模型 687 KB（Cloudflare 不压 .glb，线上就是这个数），three.js 那块 192 KB gzip（和打碟共用一份缓存），加载器和解码器 21 KB；首页的首次下载只多了 0.1 KB。本地 figure_check 29 条全过（软件渲染 15 到 22 帧，手机上有芯片会快得多）。

- 登录、个人页、照片或 AI 头像、好友、聊天、战绩、后台，都有。11 月 13 日本地四个检查脚本全过（admin 40 条、account 24 条、perk 10 条、stage 10 条）。
- 代发信：本地从替身 Worker 经 Service Binding 调过，61 封里 60 封到了假 Resend，第 61 封回 full；拒绝的、被拉黑的、Resend 报错的都对；验证码邮件改走 `deliver()` 以后也发了一遍。线上还没有谁调过它。

## 还剩什么

11 月 4 日查出来、复现过的，还没改的：

1. 代发信：后台看不到今天发了几封（`mails` 表里有）；要的话在 /admin 加一行。

3D 小人，小样之后（等 Steve 看完定）：

1. 走哪条路：自己建（three.js 人模 + 滑杆捏脸 + Mixamo 动作，不花钱、工作量大、像本人靠捏）还是 AI 把现有动漫头像转 3D（Meshy、Tripo 之类，每人几毛到两块加币，像本人、质量不稳、生成后不能捏脸）。Steve 可以自己拿现在的头像去这两家的免费额度试几张，把 .glb 发过来，我放进这个页面比一比（image-to-3D 要注册账号，这个对话里做不了）。
2. 不管哪条路：缺的动作（睡觉、挥刀、照相）要从 Mixamo 拿（要 Steve 的 Adobe 账号登录下载）或自己做；模型存哪（现在是网站的静态文件，每个玩家一个模型就要开 Cloudflare R2，开它要 Steve 点头）；给 DJ、跳舞、戏精各自的对话一个「小人」组件去接。
3. 替身人模和 RPM 的动作在真版本上线前要换掉（许可只许配 RPM 的人模）。

修掉的（留着备查）：

- 屏蔽解不开（11 月 13 日 Steve 定了「加上」，当天做）：`DELETE /blocks/<id>` 解除；`GET /friends` 多回 `blocked`（我屏蔽的人）；`GET /users/<id>` 在是我屏蔽的人时多回 `blockedByMe: true`。好友页底部多一节「已屏蔽」（有人才显示），每人一个「解除」；对方的主页上是一句说明加「解除屏蔽」。解除后两人是陌生人，要重新加好友。被屏蔽的一方什么都看不出来（和以前一样）。account_check 加了四步。
- 单机战绩关网页就记不上（11 月 13 日修）：`App.tsx` 的 `useSoloHistory` 在页面走的时候发的那条请求没带 keepalive，关标签页或在地址栏换个网址就丢了，只有点游戏里的返回键才记得上。`api()` 多了一个 `keepalive` 选项，这条请求带上它。三种走法（返回键、关页面、换网址）都记上了；account_check 的 `--solo` 那步改成真的换网址，顺便给手机加上三个人（没人的手机打开的是游戏卡片，不是游戏，所以那步以前一直过不了）。
- 未读数字消不掉（11 月 13 日修）：`unread()` 只数还是好友的那些对话；删好友或屏蔽时两边的手机都收到 `friends` 和 `unread`，角标当场更新。account_check 里加了一步。
- AI 头像编辑器在 Chrome、Edge 150 起（2026 年 6 月底，含安卓）会把整页变成「这里出了点问题」：换过一次分类再换或关掉就崩，已经有头像的人打开再关也崩，画到一半的图没了、这个月的次数不退。原因是 `Maker.tsx` 里 `useLayoutEffect(() => panel.current?.scrollTo({ top: 0 }), [tab])` 把 `scrollTo` 的返回值交给了 React 当清理函数，而这些浏览器的 `scrollTo` 现在返回 Promise（[scroll method promises](https://web-platform-dx.github.io/web-features-explorer/features/scroll-promises/)）；React 下次清理时调用它就抛错。改成带大括号的函数体，11 月 13 日修了。仓库里其它地方没有同样的写法（到此一游有一处 `useEffect(() => window.scrollTo(0, 0))`，但它用的是 Preact，Preact 只调用函数类型的清理，不会崩）。

## 交给别的对话

- 「工具 · 跟一单」：代发信的入口有了（`site/worker/mail.ts`，合并上线即生效）。接法：`tools/tuan/wrangler.jsonc` 的 `services` 里加 `{ "binding": "MAIL", "service": "changle-rooms", "entrypoint": "Mail" }`，调 `await env.MAIL.send({ app: "tuan", to: 商家登录邮箱, subject, text, link: "https://changle.ca/tuan/…", lang })`，回话和限制见上面「定过的事」。测试里的替身照 `site/scripts/mail_door/index.ts` 反过来写一个 `export class Mail extends WorkerEntrypoint { send() {} }` 就行。合并通知（每家店第一单马上发，之后最多半小时一封）在跟一单那边做。
- 「平台 · 首页与上线」知道一下：11 月 13 日这个对话在 `site/src/App.tsx` 的 `useSoloHistory` 里加了一个 `keepalive: true`，`site/src/lib/api.ts` 的 `api()` 多了 `keepalive` 这个选项（透传给 fetch），别的没动。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-13 账号：3D 小人的小样（/me/figure：替身人模、17 个动作、拖动转圈、大小和帧率；figure_check.py）
- 2026-11-13 账号：屏蔽可以解除（好友页的「已屏蔽」名单、对方主页上的「解除屏蔽」）
- 2026-11-13 账号：单机战绩在页面走的时候也记得上（keepalive）；account_check 的单机那步修好 (#468)
- 2026-11-13 账号：未读角标只数还是好友的对话；删好友、屏蔽时两边当场更新 (#464)
- 2026-11-13 账号：AI 头像编辑器在 Chrome、Edge 150 起崩页面（scrollTo 的 Promise 被当成了清理函数）；四个检查脚本遇到页面报错就算失败；stage_check 认得新的桌面格子 (#461)
- 2026-11-13 账号：房间服务器给内部 Worker 的发信入口（Mail 入口） (#457)
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
- 2026-11-13 修头像编辑器崩页面的那一行。本地用生产构建在 Chromium 153 上把三种崩法各走一遍，都不再崩，图也存上了；四个检查脚本全过，admin_check 以前卡在头像那一步，现在 40 条走完。stage_check 点桌面格子的那一句过时了（格子改成 `src/ui/Tile` 以后没有 aria-label），顺手改了。
- 2026-11-13 修了未读角标（#464）和单机战绩两件。account_check 里「切回动漫头像只要一步」那条偶尔会错，是脚本在表单还没刷出「真照片」时就点了下去（那时点「动漫头像」等于重画），改成先等表单。
- 2026-11-13 Steve 定了「中性」留着、屏蔽要能解除。做了解除：服务器一条路由、好友页一节、对方主页一个按钮，account_check 32 条全过。
- 2026-11-13 Steve 提了 3D 小人，定「先做小样」。找免费人模和动作：three.js 示例里的 Xbot、Soldier、Michelle、readyplayer.me 都能用，Ready Player Me 在 GitHub 的动作库（200 多段真人动捕、GLB 不走 LFS）许可只配 RPM 的人模，于是用它自带的样例男模（`Masculine_TPose.glb`）配它的动作。动作是看着每段的预览和自己渲染的分镜认出来的，17 段挑好后合进一个文件（gltf-transform：把动作的通道按骨头名搬到人模上、重采样、量化、meshopt；衣服上的 RPM 标志用 OpenCV 补掉）。页面照打碟 Coach3D 的做法：three.js 懒加载，没图形芯片就说明，不下载引擎。第一版相机把 T 字形姿势的臂展当宽度，人太小，改成按身高算。本地 figure_check 29 条、account_check 32 条全过。
