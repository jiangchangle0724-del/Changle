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
| 额头便利贴 Post-it Note | 手机传一圈偷偷写 | 2+ |
| 林波舞 Limbo | 手机测后仰角度；盲仰：看不到角度凭感觉仰到目标，差最远的喝 | 2+ |
| 我从来没有 Never Have I Ever | 还有“谁最有可能” | 2+ |
| 尤克牌 Euchre | 你和三个电脑玩家 | 2+（空位电脑补） |
| 七八九 Seven Eight Nine | 两颗骰子一个公杯 | 2+ |
| 木头人蹦迪 Freeze Dance | 手机放音乐，一人当裁判 | 2+ |
| 命运转盘 Wheel of Fate | 惩罚格可以自己改 | 1+ |
| 谁是卧底 Undercover | 传手机看词 | 4+ |
| 猜歌名 Name That Tune | 手机放旋律，或者当抢答器 | 2+ |
| 神回复 Punchline | 两人对决，大家投票，手机上整场演出 | 3+（超过 8 人的当观众） |
| 你画我猜 Draw & Guess | 在手机上画 | 2+ |

**大屏幕**：电视或电脑的浏览器打开 `changle.ca/tv`，屏幕上出现桌号和二维码，大家用手机扫码入座。神回复会在大屏幕上整场演出（开场、对决、投票揭晓、比分、颁奖），手机变成遥控器；其他游戏在手机上玩，大屏幕显示桌号和谁在玩。已经开好的桌，在大屏幕上打开 `changle.ca/tv/桌号`。按 M 静音。

**打碟 · DJ Booth**（还没放上首页，只有这个地址）：电视或电脑打开 `changle.ca/dj`，这台设备就是音箱。点「开始派对」开始放歌；大家扫码入座，手机按 🔥，大屏上看得到是谁按的，人跟着拍子跳；主人在手机上把一晚拖到暖场、推高、顶点、收尾，每场最长 4 小时。现在放的是「试音版 DJ」：在音箱上用网站自己的乐器现场录的浩室，125 BPM；接 Google 的 Lyria 是下一步。只测声音、不开桌：`changle.ca/dj/test`。方案在仓库根目录的 `docs/dj-booth.md`，各部分怎么接在 `src/shared/dj/CONTRACTS.md`。

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
- `src/data/drama.ts` 戏精大赏的剧本、秘密任务、对决台词和惩罚，以及玩家剧本留空时随机发的小秘密和反转（图片在 `public/drama/`；玩家投稿的剧本在服务器上，不在这里）
- `src/data/prompts.ts` 我从来没有 / 谁最有可能
- `src/data/rogue13.ts` 十三张牌的规则
- `src/data/wheel.ts` 转盘默认的格子
- `src/data/superlatives.ts` 最佳称号的奖项
- `src/data/punchline.ts` 神回复的题目
- `src/data/postit.ts` 便利贴的备用词
- `src/data/tunes.ts` 猜歌名的旋律
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
点歌放原曲片段（Apple 的 30 秒试听）用 `python3 scripts/dj_clip_check.py` 检查，主人从手机传歌到电视用
`python3 scripts/dj_mine_check.py` 检查，混音台（均衡、滤波和四个效果）用 `python3 scripts/dj_mixer_check.py` 检查，
❄️、读场、语音报幕、10 分钟一首和今晚回顾用 `python3 scripts/dj_floor_check.py` 检查，
手机上的打碟机（唱盘、旋钮、十二个效果键）用 `python3 scripts/dj_turntable_check.py` 检查，同样都要关掉它。

到此一游和 随便 各自是独立的 Worker（本仓库的 `games/been-there` 和 `tools/suibian`）。本地要连着试，在它们的文件夹里分别跑 `npx wrangler dev --port 8799` 和 `npx wrangler dev --port 8798`，网站的 `/trip` 和 `/eat` 会代理过去（`vite.config.ts`）。

测试（`scripts/` 里的几个需要上面两个都在跑）：

```bash
npx tsx tests/engine.test.ts        # 所有游戏的服务器规则
npx tsx tests/dj.test.ts            # 打碟：音箱的播放器和试音版 DJ
npx tsx tests/performer.test.ts     # 猜歌名台上两个小人：每个舞步逐帧检查手臂和腿
npx tsx tests/tokens.test.ts        # 设计 token：和 global.css 同名的值一致，src/ui 里只用 token
npx tsx tests/routes.test.ts        # 每个页面的网址，和以前带 # 的旧链接
npx tsx tests/duration.test.ts      # 带时间的大冒险和国王命令：读出几秒，中英文说的时间一样
python3 scripts/routes_check.py     # 浏览器里点一遍：游戏卡、后退键、旧链接、/settings、/login
python3 scripts/dare_timer_check.py # 大冒险和国王命令的倒计时：开始、暂停、继续、时间到、重来
python3 scripts/ui_inventory.py     # 盘点裸写的颜色、字号、阴影（docs/ui-inventory.md），清理后再跑看数字
python3 scripts/net_test.py         # 模拟几部手机把联机游戏玩一遍
python3 scripts/local_check.py      # 单机回归
python3 scripts/party_test.py       # 七个新游戏，单机和联机
python3 scripts/tv_test.py          # 大屏幕：开桌、扫码、整局神回复
python3 scripts/account_check.py    # 登录、资料、好友、聊天
python3 scripts/tune_quiz_check.py  # 猜歌名选择题连玩 20 首（单机和联机），看报错和内存
python3 scripts/dj_check.py         # 打碟：音箱在 WebKit（Safari 的内核）和 Chromium 里出声，一桌手机按 🔥
```

## 部署

网站在 Cloudflare Pages（项目 changle，域名 changle.ca），已经连上 GitHub：PR 合并进 `main` 后自动构建发布（根目录 `site`，构建 `npm run build`，输出 `dist`）。

服务器是 Cloudflare Worker `changle-rooms`（域名 rooms.changle.ca），也连上了 GitHub：合并进 `main` 的改动只要碰到 `worker/`、`src/shared/`、`src/data/`、`src/i18n.ts` 或 `package-lock.json`，Cloudflare 就自动部署它（根目录 `/site`，部署命令 `npx wrangler deploy -c worker/wrangler.jsonc`）。要手动部署时：`npx wrangler login`，再 `npx wrangler deploy -c worker/wrangler.jsonc`；或者在装了这个仓库的 Windows 电脑上双击 `deploy/pc-deploy.cmd`（安装、构建、部署服务器、上传网站）。

也可以用 Windows 部署包：`deploy/make_pkg.sh` 会打包出 `changle-deploy.zip`，在 Windows 上解压，双击 `deploy.cmd`，自动部署服务器和网站。登录发验证码用 Resend：双击 `set-email-key.cmd`，粘贴 Resend 的 API key（只需要做一次）。

## 技术

Vite + React + TypeScript，动画用 GSAP 和 motion，图标用 lucide-react，字体 Unbounded（标题）和 Figtree（正文），中文用手机自带字体，音效和音乐全部用 Web Audio 现场合成。服务器是 Cloudflare Worker + Durable Object：一桌一个对象，规则在服务器上跑（`src/shared/engine`，和网页共用一套代码），每部手机只收到自己该看的那一份；账号、好友、聊天和心愿单在另一个 Durable Object 里（SQLite）。
