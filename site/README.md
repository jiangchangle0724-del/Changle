# changle

聚会游戏和生活小工具，中英双语，网址 changle.ca。一台手机传着玩，或者每人用自己的手机联机。

## 里面有什么

**聚会游戏**（16 个，每个都能单机也能联机）

| 游戏 | 单机怎么玩 | 联机 |
| --- | --- | --- |
| 真心话大冒险 Truth or Dare | 转瓶子 | 2+ |
| 流氓十三张 Rogue Thirteen | 抽牌，A 到 K 各有规矩 | 2+ |
| 最佳称号 Superlatives | 传手机偷偷投票 | 3+ |
| 国王游戏 King's Game | 抽号码，国王下命令 | 3+ |
| 戏精大赏 Drama Queens | 几个人按剧本演，观众猜谁是坏人、给演技打星，演得最差的受罚；也可以两人飙同一句台词 | 3+ |
| 额头便利贴 Post-it Note | 举到额头上，大家给提示；19 组词：经典、派对（有点辣、欢乐时光、爆笑瞬间）、世界（中日韩、东南亚、印度、中东、意大利、法国、拉美、加拿大） | 2+ |
| 林波舞 Limbo | 手机测后仰角度；稳住（仰到位一动不动）、跟着动的杆（横杆上下浮动，跟丢超过 1 秒出局）、歪着过（还要往左或往右歪），派对每杆随机一种；盲仰：看不到角度凭感觉仰到目标，差最远的喝 | 2+ |
| 我从来没有 Never Have I Ever | 还有“谁最有可能” | 2+ |
| 尤克牌 Euchre | 你和三个电脑玩家 | 2+（空位电脑补） |
| 七八九 Seven Eight Nine | 两颗骰子一个公杯 | 2+ |
| 木头人蹦迪 Freeze Dance | 手机放音乐，一人当裁判 | 2+ |
| 命运转盘 Wheel of Fate | 惩罚格可以自己改 | 1+ |
| 谁是卧底 Undercover | 传手机看词 | 4+ |
| 猜歌名 Name That Tune | 手机放旋律，或者当抢答器 | 2+ |
| 神回复 Punchline | 两人对决，大家投票，手机上整场演出 | 3+（超过 8 人的当观众） |
| 你画我猜 Draw & Guess | 在手机上画 | 2+ |
| 一本正经 In All Seriousness | 一个冷门词，只有老实人知道真意思，其他人现编，裁判找老实人。17 个词包，中文局 9 个、英文局 5 个、都能玩 3 个，开局按桌上的语言选好；图标和角色图是 ChatGPT 生的。一部手机传着玩，或者联机每人一部、电视当大屏 | 3 到 9 |
| 最后一张 Last Card | 没有单机，只能每人用自己的手机：每人 7 张，跟颜色、数字或符号出牌，有跳过、反转、+2、变色、+4，剩一张要喊「最后一张！」，先出完的赢。还没上首页：手机打开 `changle.ca/g/last-card/play` 开一桌 | 2 到 10 |

**大屏幕**：电视或电脑的浏览器打开 `changle.ca/tv`，屏幕上出现桌号和二维码，大家用手机扫码入座。神回复会在大屏幕上整场演出（开场、对决、投票揭晓、比分、颁奖），手机变成遥控器；其他游戏（最佳称号、谁是卧底、猜歌名、戏精大赏、真心话大冒险、命运转盘、七八九、流氓十三张、国王游戏、我从来没有、额头便利贴、木头人蹦迪、尤克牌、你画我猜、林波舞、最后一张）在大屏幕上也有自己的画面（轮到谁、谁投了票、揭晓、领奖台），不会出现任何人的词、手牌和票，真心话大冒险的题目也等被指到的人念出来，额头便利贴上还没猜出来的词、你画我猜的词（这一轮结束前）也不会上屏；到此一游开始以后，大屏幕自己去它的大屏页面，打碟时大屏幕就是音箱。已经开好的桌，在大屏幕上打开 `changle.ca/tv/桌号`。按 M 静音。座位设成「只看」的手机，在这些游戏里整屏显示大屏画面，横过来投屏到电视就行。

**打碟 · DJ Booth**（还没放上首页，只有这个地址）：电视或电脑打开 `changle.ca/dj`，这台设备就是音箱。点「开始派对」开始放歌；大家扫码入座，手机按 🔥，大屏上看得到是谁按的，人跟着拍子跳；主人在手机上把一晚拖到暖场、推高、顶点、收尾，每场最长 4 小时。现在放的是「试音版 DJ」：在音箱上用网站自己的乐器现场录的浩室，125 BPM；接 Google 的 Lyria 是下一步。只测声音、不开桌：`changle.ca/dj/test`。方案在仓库根目录的 `docs/dj-booth.md`，各部分怎么接在 `src/shared/dj/CONTRACTS.md`。

**藏在人群里 · Hide in the Crowd**（`changle.ca/hide`，首页卡片 `changle.ca/g/hide-in-the-crowd`）：每人用自己的手机控制人群里的一个人，混在 18 个电脑带着走的路人里；走得像路人就没人认得出，认出对手就出拳，打中得 1 分，打到路人自己愣一下。先到 3 分、或者 75 秒后分最多的赢；每局结束被认出最多的人喝一口（主人可以关掉，桌上设的惩罚会跟过去）。从一张桌开始：主人选它，大家的手机和大屏自己过去，玩完回到这桌。大屏显示整个人群，不标出谁是真人。2 到 8 人；一部手机就是对三个电脑对手的练习。代码在本仓库的 `games/hide-crowd`，桌上的接入在 `src/party/hide/`。

**生活工具**：随便 · Whatever's Fine（吃什么？随便。让大家的手机来定：每人一部手机选餐厅，在 `changle.ca/eat`，代码在本仓库的 `tools/suibian`，工具页签里的卡片是 `src/tools/Suibian.tsx`）、实时汇率（加币、人民币、美金、港元）、联动的世界时钟、单价换算（$/kg、$/lb、$/斤、$/oz、$/gal）。

**账号**（可选）：邮箱验证码登录，头像、名字、城市、简介，游戏记录，加好友聊天。不登录也能玩所有游戏。

**戏精大赏的玩家剧本**：设置页的“写一个”让玩家自己写剧本，写好的下一幕先演，编剧亲自上台。登录的人可以同时投稿到公共剧本库：站长在后台（`/admin`）的“剧本投稿”里通过以后，所有桌都会抽到，剧本上署编剧的名字；不通过或下架的不会出现。投稿每人每天最多 5 个。

**心愿单**：大家提想玩的游戏和功能，许愿要写名字、介绍（10 到 300 字）和规则（10 到 600 字），大家点赞，票多的先做；做出来的收进下面的「已经做出来了」。许的愿上线后，许愿的人（登录后许的）得到金色头像框和限量服饰。页面最下面有 e-Transfer 打赏。

设置里可以把“喝酒”换成别的惩罚（比如做十个深蹲），所有游戏都会跟着换。

## 改内容在哪里改

所有文案和题库都是纯文本，每条都有中英两版：

- `src/data/truthDare.ts` 真心话 / 大冒险题目
- `src/data/undercover.ts` 卧底词组
- `src/data/drawGuess.ts` 你画我猜词库
- `src/data/king.ts` 国王命令
- `src/data/drama.ts` 戏精大赏的剧本、秘密任务、对决台词和惩罚，以及玩家剧本留空时随机发的小秘密和反转（图片在 `public/drama/`；玩家投稿的剧本在服务器上，不在这里）。演技 PK 的每个演法（`PK_STYLES`）带三样：`how` 怎么演（小学生能看懂的话）、`demo` 把「外面下雨了」用这个演法说一遍、`see` 视频搜索词（中文搜 B 站，英文搜 YouTube，换平台改 `pkSeeUrl`）。中文和英文是分开写的，不是互相翻译：中文用中文观众熟的东西（琼瑶剧、宫斗剧、电视购物），英文用英语观众熟的（肥皂剧、白雪公主的皇后、电视广告）；同一个演法两边的名字意思要对得上，因为一桌人可能有人看中文、有人看英文
- `src/data/prompts.ts` 我从来没有 / 谁最有可能
- `src/data/rogue13.ts` 十三张牌的规则
- `src/data/wheel.ts` 转盘默认的格子
- `src/data/superlatives.ts` 最佳称号的奖项
- `src/data/punchline.ts` 神回复的题目
- `src/data/postit.ts` 便利贴：联机时随机发的便利贴，和单机的 19 组词（`HEADS_DECKS`，分三类：经典、派对、世界）
- `src/data/tunes.ts` 猜歌名的旋律
- `src/data/straightface.ts` 一本正经的词卡（规则见 `src/shared/straightface/cards.ts`，扩库的任务卡在 `docs/codex-tasks/straightface/`）
- `src/i18n.ts` 界面上的按钮和提示文字

改完以后重新打包部署即可。

加一个新游戏要改哪些文件：见仓库根目录的 `HANDOFF.md`（Add a party game to the site）。

## 自己跑起来

```bash
npm install
npx wrangler dev -c worker/wrangler.jsonc --port 8787 --ip 127.0.0.1    # 服务器（房间、账号、心愿单）
VITE_ROOMS_URL=ws://127.0.0.1:8787 npm run dev -- --port 5173            # 网站
```

本地登录不发邮件：在 `worker/.dev.vars` 里写 `DEV_SHOW_CODES=1`，验证码会直接显示出来。
打碟的 Lyria 本地不连 Google：先跑 `node scripts/fake_lyria.mjs`（一个假的 Lyria），再在 `worker/.dev.vars` 里写
`DEV_LYRIA_URL=ws://127.0.0.1:8790` 和 `DEV_LYRIA_ANYONE=1`（任何桌子都能试），整条链路用
`python3 scripts/dj_lyria_check.py` 检查。
打碟的新手打碟台（两个碟、推子、效果键、蓄力和 Drop）用 `python3 scripts/dj_deck_check.py` 检查：
它要试音版 DJ 放两个碟，所以 `worker/.dev.vars` 里 `DEV_LYRIA_ANYONE` 要关掉（不写，或写 0）。
点歌放 YouTube 整首用 `python3 scripts/dj_youtube_check.py` 检查，主人从手机传歌到电视用
`python3 scripts/dj_mine_check.py` 检查，混音台（均衡、滤波和四个效果）用 `python3 scripts/dj_mixer_check.py` 检查，
❄️、读场、语音报幕、10 分钟一首和今晚回顾用 `python3 scripts/dj_floor_check.py` 检查，
手机上的打碟机（唱盘、旋钮、十二个效果键）用 `python3 scripts/dj_turntable_check.py` 检查，
电视上的教练和手机跟着跳用 `python3 scripts/dj_dance_check.py` 检查，舞池的 3D 小机器人用
`python3 scripts/dj_floor3d_check.py` 检查，同样都要关掉它。

到此一游和 随便 各自是独立的 Worker（本仓库的 `games/been-there` 和 `tools/suibian`）。本地要连着试，在它们的文件夹里分别跑 `npx wrangler dev --port 8799` 和 `npx wrangler dev --port 8798`，网站的 `/trip` 和 `/eat` 会代理过去（`vite.config.ts`）。

藏在人群里也是独立的 Worker（`games/hide-crowd`）：在它的文件夹里跑 `npm run build && npx wrangler dev --port 8797 --var STANDALONE:1`，网站的 `/hide` 会代理过去；`python3 scripts/hide_test.py` 从一张桌子把交接、一局和回到这桌走一遍。

测试（`scripts/` 里的几个需要上面两个都在跑）：

```bash
npx tsx tests/engine.test.ts        # 所有游戏的服务器规则
npx tsx tests/dj.test.ts            # 打碟：音箱的播放器和试音版 DJ
npx tsx tests/performer.test.ts     # 猜歌名台上两个小人：每个舞步逐帧检查手臂和腿
npx tsx tests/tokens.test.ts        # 设计 token：和 global.css 同名的值一致，src/ui 里只用 token
npx tsx tests/routes.test.ts        # 每个页面的网址，和以前带 # 的旧链接
npx tsx tests/duration.test.ts      # 带时间的大冒险和国王命令：读出几秒，中英文说的时间一样
npx tsx tests/hide.test.ts          # 藏在人群里在桌上的替身规则：主人开局、只开一次
npx tsx scripts/budget.ts           # 构建以后：首页第一次要下载多少（gzip），超过预算 CI 不让合并
python3 scripts/routes_check.py     # 浏览器里点一遍：游戏卡、后退键、旧链接、/settings、/login
python3 scripts/dare_timer_check.py # 大冒险和国王命令的倒计时：开始、暂停、继续、时间到、重来
python3 scripts/ui_inventory.py     # 盘点裸写的颜色、字号、阴影（docs/ui-inventory.md），清理后再跑看数字
python3 scripts/net_test.py         # 模拟几部手机把联机游戏玩一遍
python3 scripts/watch_players_check.py # 三个玩家加一个只看的座位：瓶子停在服务器选的人上，名单和计数里没有只看的人
python3 scripts/local_check.py      # 单机回归
python3 scripts/party_test.py       # 七个新游戏，单机和联机
python3 scripts/tv_test.py          # 大屏幕：开桌、扫码、整局神回复
python3 scripts/watch_test.py       # 每个游戏自己的大屏画面：两台电视和一部只看的手机，每个阶段、没有秘密、没有报错
python3 scripts/lastcard_check.py   # 最后一张：三部手机、一部只看的手机、两台电视，在手机上点着打两场，谁的手牌都不外泄
python3 scripts/account_check.py    # 登录、资料、好友、聊天
python3 scripts/tune_quiz_check.py  # 猜歌名选择题连玩 20 首（单机和联机），看报错和内存
python3 scripts/dj_check.py         # 打碟：音箱在 WebKit（Safari 的内核）和 Chromium 里出声，一桌手机按 🔥
```

## 视觉回归与无障碍（ui-C6）

Node 22，在 `site/` 运行：

```sh
npm ci
npx playwright install --with-deps chromium
npx tsc --noEmit
npm run build
npx playwright test
```

测试自动构建组件预览页并启动 `vite preview`，覆盖 40 个手机/桌面状态。每个状态都跑
WCAG 2.1 A/AA axe；新的 serious/critical 问题会失败。已有问题只能按具体屏幕、规则和节点
记录在 `tests/visual/axe-known.ts`，附原因，不能关闭整条规则。HTML 报告及逐屏 axe JSON 在
`playwright-report/`，CI 的 `visual-results` 附件还包含失败时的 expected/actual/diff 图和 trace。
截图容差 `maxDiffPixelRatio: 0.001`，仅容许极小的像素噪声。测试隔离网络、固定时间及随机数，
等待字体加载并减弱动效，不会发邮件或连接真实房间。

中文使用系统字体，Windows/macOS 的本地图和 Linux CI 不同；本地视觉比较可能失败。
**不要提交本机截图，也不要本地更新基准。** 有意改变外观后，在 PR 加上 `update-screenshots`
标签（首次可用 `gh label create update-screenshots` 创建）。`visual-update.yml` 在 Ubuntu、
Chromium、Noto CJK 字体下运行 `--update-snapshots`，只向该 PR 分支提交基准图，然后移除标签。
若生成失败，检查附件，修复后移除再加标签。仅支持同仓库 PR，且生成期间不能改 PR head。
机器人提交不会触发其他 CI：提交后再推一个提交（空提交也可），让 `site / visual` 对新基准
正常比较。基准保存在 `tests/visual/__screenshots__/`。

当前游戏清单比卡片多一个：为保持 40 张，本轮暂不含尤克牌，其余 15 个可玩游戏都覆盖；
到此一游和打碟按卡片排除。增加覆盖时在 `tests/visual/screens.spec.ts` 加状态。

## 部署

网站在 Cloudflare Pages（项目 changle，域名 changle.ca），已经连上 GitHub：PR 合并进 `main` 后自动构建发布（根目录 `site`，构建 `npm run build`，输出 `dist`）。

服务器是 Cloudflare Worker `changle-rooms`（域名 rooms.changle.ca），也连上了 GitHub：合并进 `main` 的改动只要碰到 `worker/`、`src/shared/`、`src/data/`、`src/i18n.ts` 或 `package-lock.json`，Cloudflare 就自动部署它（根目录 `/site`，部署命令 `npx wrangler deploy -c worker/wrangler.jsonc`）。要手动部署时：`npx wrangler login`，再 `npx wrangler deploy -c worker/wrangler.jsonc`；或者在装了这个仓库的 Windows 电脑上双击 `deploy/pc-deploy.cmd`（安装、构建、部署服务器、上传网站）。

也可以用 Windows 部署包：`deploy/make_pkg.sh` 会打包出 `changle-deploy.zip`，在 Windows 上解压，双击 `deploy.cmd`，自动部署服务器和网站。登录发验证码用 Resend：双击 `set-email-key.cmd`，粘贴 Resend 的 API key（只需要做一次）。

## 技术

Vite + React + TypeScript，动画用 GSAP 和 motion，图标用 lucide-react，字体 Unbounded（标题）和 Figtree（正文），中文用手机自带字体，音效和音乐全部用 Web Audio 现场合成。服务器是 Cloudflare Worker + Durable Object：一桌一个对象，规则在服务器上跑（`src/shared/engine`，和网页共用一套代码），每部手机只收到自己该看的那一份；账号、好友、聊天和心愿单在另一个 Durable Object 里（SQLite）。
