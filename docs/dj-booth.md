# 打碟 · DJ Booth 方案

Nov 1, 2026 · @Steve Jiang

> Exported from Steve's doc (tab 打碟 · DJ Booth), the brief both AIs work from.
>
> **Decided since (Nov 1, Steve):** the booth is built inside the existing site, not as a new
> `games/dj` project. So, where this brief says otherwise: the page is changle.ca/dj (the big-screen
> page with the booth up), the room is the site's rooms server (`site/worker`, already a Durable
> Object, nothing new to pay for), phones sit down the way they do at every table, and a merge to
> `main` deploys it like any game (step 1 and A6 below come down to that). The first round is the
> fake DJ only (A1, A3, A6); Lyria is not connected. How the pieces fit:
> `site/src/shared/dj/CONTRACTS.md`. The sound check: `docs/dj-booth-sound-check.md`.

changle.ca 新增一个派对游戏「打碟 · DJ Booth」（建议路径 changle.ca/dj）：一台电视或电脑当音箱，AI DJ 用 Google 的 Lyria RealTime 实时生成音乐并按风格混音，玩家用手机点歌、投票、加料，屏幕上几个 3D 舞者跟着节拍跳。第一版要证明的只有三件事：声音不断、切歌像 DJ、舞者踩在拍子上。

姊妹游戏 一起跳 · Dance Along 在第二个 tab，两个游戏共用同一套底座，建议先做它。

## 三个前提先纠正

做之前先把三件会让项目半路翻车的事说清楚，每条都有替代路线。

| 你的设想 | 实际情况 | 替代路线 |
| --- | --- | --- |
| 用 GPT Image 生成 3D 模型 | GPT Image 是 OpenAI 的图片模型，只出 2D 图，不出 3D 文件 | 3D 舞者用 Mixamo 的免费带骨骼角色加真人动捕舞蹈动作；GPT Image 和你已有的 Nano Banana 用来画角色设定图、舞池背景、海报；以后用 Meshy 这类「图转 3D 加自动绑骨」把玩家头像变成 3D |
| 让 Codex 去调图片生成 | Codex 是写代码的，它本身不出图 | 出图走 API：OpenAI Images API 或 Gemini 图片模型；Codex 负责写调用这些 API 的脚本和 3D 资产流水线 |
| 玩家上传自己的歌，DJ 拿来 remix | 商业歌曲的 MP3 不能在网站上存、播、改，这是版权线；Spotify 和 YouTube 的嵌入播放器也不给音频数据，混不了 | 音乐全部由 AI 生成：DJ 底盘用 Lyria RealTime 实时生成并按风格权重混音；玩家「加歌」等于描述一首歌（风格、情绪、一句歌词），Lyria 3.5 生成一首原创，DJ 混进去。想听真歌，用 YouTube 嵌入做「真歌时间」，只播不混 |

这三条定下来，剩下的都是工程。

## 玩法与房间角色

一句话：一台电视当音箱和舞池大屏，AI 当 DJ，每个人的手机是打碟台的一个旋钮。

| 角色 | 设备 | 能做什么 |
| --- | --- | --- |
| 音箱端（DJ 台） | 电视、AirPlay 的 Apple TV、或一台笔记本 | 唯一出声的设备。显示舞池 3D、正在播放的风格、能量条、歌单、扫码加入的二维码。沿用网站的观察者模式，不可操作 |
| 控制器 | 每个玩家的手机 | 加入房间；拨风格旋钮（拉丁多一点、电子少一点）；点歌（描述一首歌）；反应（🔥 嗨 / ❄️ 冷）；一键「Drop」请求；主人有「换场」和「踢人」 |
| AI DJ | 房间服务里的一段逻辑 | 按能量曲线排一晚的节奏；把玩家的旋钮和反应变成 Lyria 的权重；在乐句边界换风格；把玩家点的歌对拍混进去；偶尔用语音报幕「下面这首来自 Jackie」 |
| 玩家 | 2 到 15 人 | 第一版只有以上动作。「DJ 对战」（轮流掌台、全场投票、输的喝）放第二版，它是这个站的基因，但先把声音做对 |

一个房间只有一条音乐流，从音箱端播出。手机不出声，只发指令。这既是夜店的真实形态，也避免了十几台手机同步播放的难题。

## 音乐从哪来：三条音轨

| 音轨 | 用什么 | 怎么「remix」 | 版权 |
| --- | --- | --- | --- |
| 1 DJ 底盘（主） | [Lyria RealTime](https://ai.google.dev/gemini-api/docs/realtime-music-generation)：Google 的实时音乐生成，WebSocket 持续出 48kHz 立体声，纯器乐 | 它天生就是打碟台：音乐由多条带权重的风格提示混出来，比如 reggaeton 1.0 加 house 0.6；改权重它就平滑过渡，这就是「按风格 remix」。还能调 BPM（60 到 200）、密度、亮度、调性，能单独静音鼓或贝斯做 drop | AI 生成，带 Google 水印；商用条款和价格开工第一天核对 |
| 2 玩家点歌 | Lyria 3.5：非实时生成 30 秒片段或整首歌，支持歌词和人声 | 玩家在手机上写：风格、情绪、一句歌词（「给 Jackie 的生日 reggaeton」）。生成时指定和当前底盘一样的 BPM 和调性，DJ 在下一个乐句边界把它对拍混入，播完再淡回底盘 | 同上，玩家写的歌词先过文字审核 |
| 3 真歌时间（可选，第二版） | YouTube 嵌入播放器 | 只能播，不能混：底盘淡出，视频播，播完底盘淡入。对拍做不到，因为嵌入播放器不给音频数据 | YouTube 允许嵌入；不下载、不存 |

第一版只做音轨 1 和 2。音轨 2 是「玩家可以添加自己想要的音乐」的合法版本：添加的是一首为这个派对生成的原创，而不是一个 MP3。

## 风格清单与 DJ 的脑子

12 种风格，每种是一组 Lyria 提示词加权重、一个 BPM 区间、一个调性。预设存成 JSON，调好一次全站共用。

| 风格 | 提示词骨架 | BPM |
| --- | --- | --- |
| 拉丁 Latin | reggaeton, dembow rhythm, latin house | 95 到 105 |
| 浩室 House | deep house, four on the floor, warm chords | 120 到 126 |
| 科技 Techno | techno, driving kick, dark synths | 128 到 135 |
| 迷幻 Trance | uplifting trance, arpeggios, big breakdown | 136 到 140 |
| 低音 Bass | dubstep, heavy bass drops, half time | 140 到 150 |
| 鼓打贝斯 DnB | drum and bass, fast breakbeats, sub bass | 170 到 176 |
| 说唱 Hip-hop | trap beat, 808s, hi-hat rolls | 70 到 80（半拍 140 到 160） |
| R&B | contemporary R&B, smooth chords, slow groove | 85 到 95 |
| 非洲节拍 Afrobeats | afrobeats, amapiano log drum, percussion | 105 到 115 |
| 韩流 K-pop club | k-pop dance, bright synths, punchy drums | 120 到 128 |
| 华语夜店 C-pop club | mandopop melody, club remix, piano hook（纯器乐版） | 120 到 128 |
| 旁遮普 Bhangra | bhangra, dhol drums, punjabi dance（温哥华特色） | 100 到 110 |

DJ 的脑子，四条规则，全是纯函数，可以不开声音就测：

1. 能量曲线：一晚分暖场、推高、顶点、收尾四段，密度和亮度按曲线走，不随机。主人可以手动拖到任一段。
2. 换风格只在乐句边界：16 或 32 小节一换；大幅换权重分 8 小节分步走。改 BPM 或调性时 Lyria 要重置上下文，会硬切，所以只放在 drop 的那一刻做，听起来反而像故意的。
3. 调性锁：一段时间内固定一个调性，换也只换相邻调，混出来不打架。
4. 读场：🔥 多就加密度加亮度，❄️ 多就降；点歌排队按先来后到，但同一人连续两首要隔 10 分钟。

## 3D 舞者怎么来

分两步走，先用现成的把「跟着节奏跳」做对，再换成玩家自己的头像。

**第一版：Mixamo 角色加动捕舞蹈，Three.js 渲染**

- Mixamo（Adobe，免费）有现成的带骨骼角色和几十种舞蹈动作：Hip Hop Dancing、House Dancing、Salsa、Breakdance、Twist 等，都是真人动捕。下载 FBX，转成 GLB，压缩后每个角色 2 到 4 MB。
- 舞池放 4 到 8 个舞者，每种风格配 2 到 3 个动作。风格换了，动作换；drop 的时候全体切高能动作。
- 节拍同步不靠猜：Lyria 的 BPM 是我们设的，所以每一拍在哪我们都知道。每个舞蹈动作记一次它原生的 BPM，播放速度 = 当前 BPM ÷ 原生 BPM，舞者就踩在拍子上。再用 Web Audio 的分析节点取低频能量，驱动灯光脉冲。
- 低端设备自动降级：先降舞者数量，再降成 2D 剪影。

**GPT Image 和 Nano Banana 用在哪**

- 角色设定图：每个舞者一张正面 T 字站姿加一张侧面，统一成网站现有的动漫头像风格。这些图第二版要喂给「图转 3D」。
- 舞池场景：背景板、地砖贴图、霓虹招牌、海报。2D 图当贴图贴进 3D 场景，成本几分钱一张。

**第二版：玩家自己的头像上舞池**

- 网站已经能用 Nano Banana 从照片生成动漫头像。把这张图送进 Meshy 的图转 3D 加自动绑骨，再套 Mixamo 的舞蹈动作，玩家就看见「自己」在跳。Meshy 按点数收费：图转 3D 约 20 到 30 点，绑骨 5 点，每个动作 3 点，先买一小包试 10 个人。
- 做不出来或太丑的，退回第一版的通用舞者，头顶显示玩家名。

## 技术架构

*（原文档这里有一张图：技术架构 · 6 个部件，一条音乐流）*

全部跑在你现有的 Cloudflare 账号里，和「随便」一样合并 main 自动发布。房间服务用 Durable Object（要 Workers Paid，你已经在升），每个房间一个实例，手机和音箱端都用 WebSocket 连它。音箱端从 Lyria 收到的是原始 PCM，用 AudioWorklet 播放，前面垃 2 到 3 秒缓冲防卡顿；Google 的钥匙永远只在 Worker 里，浏览器拿不到。

## 老手会多做而你没要求的事

做过夜店音响、做过网页音频的人，开工前就会把这些钉死：

1. 响度统一加限幅：Lyria 的底盘、生成的点歌、嵌入的视频响度不一样，一切歌就忽大忽小。音箱端最后一级放压缩器加限幅，顺带保护电视喇叭和耳朵。
2. 缓冲预算：先垫 2 到 3 秒音频再开播；网络抖动时淡出而不是爆音；断线自动重连，重连期间底盘继续放缓冲里的；屏幕上显示「缓冲中」而不是静悄悄。
3. iPhone 和 Safari 的规矩：音频必须由音箱端的一次点击启动，否则不出声；页面常亮用 Wake Lock，不然电视投屏 5 分钟就黑；锁屏会杀 WebSocket，音箱端要提示「别锁屏」。
4. 成本上限：一个房间只开一条 Lyria 流，不是一台手机一条；每场派对上限 4 小时，到点淡出；主人账号一个月上限几小时，超了提示。
5. 版权台账：每一种声音从哪来、按什么条款，写在仓库的 LICENSES.md：Lyria 输出条款、Mixamo 使用条款、YouTube 只嵌入。代码里不留任何「上传 MP3」的入口。
6. 内容安全：玩家写的风格和歌词先过文字审核；Lyria 自带安全过滤，被拦的提示要告诉玩家为什么。
7. 频闪限制：舞池灯光每秒不超过 3 次闪烁，这是光敏癫痫的通用红线。
8. 可观测：每场记录卡顿次数、重连次数、切歌次数、反应数；派对结束出一页「今晚回顾」：放了什么风格、谁点了歌、谁最嗨。既是排错数据，也是第二天发小红书的素材。
9. 先做「假 DJ」：第一周先用一段录好的循环音频跑通房间、手机、舞池、同步，Lyria 最后接。声音链路和房间链路分开排错。

## 原始素材：从源头拿

| 素材 | 为什么是源头 | 怎么用 |
| --- | --- | --- |
| Google 的 PromptDJ 示例应用（AI Studio 上开源） | 就是一个用 Lyria RealTime 权重混风格的打碟台，Google 自己写的 | 先跑起来听 10 分钟，再决定我们的旋钮怎么设计；代码结构可以直接借鉴 |
| [Lyria 提示词指南](https://ai.google.dev/gemini-api/docs/lyria-prompt-guide)的关键词表 | 官方列出的风格词、乐器词、情绪词，模型最认这些 | 12 种风格预设只从这张表里选词 |
| Lyria RealTime 的原始 PCM 流 | 采样率、声道、块大小决定缓冲怎么写 | 录 5 分钟原始流存下来当测试夹具，不开声音也能测播放器 |
| Mixamo 的 FBX 原文件和每个动作的原生节拍 | 动作本身有速度，不知道原生 BPM 就对不上拍 | 每个动作用节拍器量一次，记进资产清单 |
| Three.js 官方示例：骨骼动画混合、GLTF 加载 | 舞者切动作的淡入淡出就在那几个例子里 | 照着写，不自创 |
| Web Audio 规范：AudioWorklet、AnalyserNode、DynamicsCompressorNode | 播放、分析、限幅三件事的标准做法 | 播放器只用这三个节点 |
| Cloudflare Durable Objects 的 WebSocket Hibernation 文档 | 房间长连接省钱不断线的正确写法 | 房间服务照它写 |
| Mixxx（开源 DJ 软件）的手册 | 真 DJ 怎么切歌：交叉推子曲线、EQ 切低频、按乐句对齐 | DJ 的脑子那四条规则从这里校对 |
| 一位真 DJ 的一小时录音 | 盲测的参照物 | 让听众对比我们的切歌和他的切歌 |
| 5 个爱蹦迪的朋友的回答：「夜店里什么时候你会想走」 | 能量曲线和读场规则的依据 | 开工前问完 |

## 方法与工具

| 环节 | 用什么 | 为什么 |
| --- | --- | --- |
| 实时音乐 | Lyria RealTime，`@google/genai` 的 JS 客户端跑在 Worker 里中转；Lyria 3.5 走 Interactions API 生成点歌 | 官方客户端，钥匙留在服务端 |
| 播放 | AudioWorklet 收 PCM 块进环形缓冲；AnalyserNode 取低频能量给灯光；DynamicsCompressorNode 做限幅 | 标准三件套，不引第三方音频库 |
| 房间 | Durable Object 加 WebSocket Hibernation；房间状态用一个状态机：等待、暖场、推高、顶点、收尾、结束 | 长连接便宜，状态机能单测 |
| DJ 的脑子 | 纯 TypeScript 函数：输入（当前状态、旋钮、反应、时间）输出（下一组权重、BPM、调性、换的时机）；不碰音频 | 不开声音就能跑几千次测试 |
| 3D | React Three Fiber 加 drei（useGLTF、useAnimations）；gltf-transform 压缩 GLB；Blender 命令行批量把 FBX 转 GLB | 现有 React 栈，资产流水线可脚本化 |
| 出图 | OpenAI Images API（GPT Image）或 Gemini 图片模型出角色设定图和场景贴图；Meshy API 做图转 3D 加绑骨（第二版） | 几分钱一张；3D 按点数 |
| 手机端 | 现有 Vite / React；控制器页面纯指令，不加载 3D 和音频 | 手机省电省流量 |
| 测试 | vitest 测 DJ 脑子和状态机；录好的 PCM 夹具测播放器；Playwright 测手机控制器流程 | 改了不怕坏 |
| 监控 | 每场一条 session 记录：卡顿、重连、切歌、反应、Lyria 分钟数 | 排错和算成本 |

## 正确性证明：除了你我之外的证据

| 证据 | 怎么做 | 过门标准 |
| --- | --- | --- |
| 声音不断 | 音箱端连播 30 分钟，程序记录卡顿和重连 | 卡顿每 10 分钟少于 1 次，断线 5 秒内恢复 |
| 切歌像 DJ | 10 个听众盲听 10 段切换：5 段我们的、5 段真 DJ 录音的，打 1 到 10 分 | 我们的平均 ≥ 7 分，且和真 DJ 的差距 ≤ 1.5 分 |
| 舞者踩拍 | 程序记录每个动作的脚落地时刻和音频的拍点，算偏差 | 95% 的拍子偏差 ≤ 60 毫秒 |
| 跑得动 | 2019 年的笔记本和一台 iPad 做音箱端，8 个舞者 | 稳定 30 帧，手机指令到大屏响应 ≤ 200 毫秒 |
| 真派对 | 8 个人、1 小时、电视投屏 | 0 次崩溃，≥ 10 首点歌，满意度 ≥ 4/5 |
| 版权台账 | 另一个 AI 逐行审 LICENSES.md，并 grep 代码确认没有上传音频的接口 | 台账完整，接口为零 |
| 设备矩阵 | iPhone Safari、安卓 Chrome、Mac Safari、Apple TV AirPlay 各跑一遍 | 四种都出声、都能加入 |
| 成本实测 | 第一周记录每场的 Lyria 分钟数和账单 | 3 小时派对 ≤ 2 加元，超了就调上限 |
| 交叉审查 | Codex 审 Claude Code 的 PR，反之亦然 | 每个 PR 有另一方记录 |

## 分工：Claude Code 与 Codex

同一条原则：判断、串联、音频、密钥归 Claude Code；有夹具能单测、代码长但机械的归 Codex。

| 编号 | 任务 | 谁 | 输入 | 验收 |
| --- | --- | --- | --- | --- |
| A1 | 类型和契约：RoomState、DjCommand、Track、Preset；房间状态机 | Claude Code | 本方案 | 类型编译，状态机单测过 |
| A2 | Lyria 中转 Worker：WebSocket 转发、钥匙保护、重连 | Claude Code | A1 | 30 分钟连播达标 |
| A3 | 音箱端播放器：AudioWorklet 缓冲、限幅、分析节点、iOS 启动流程 | Claude Code | 录好的 PCM 夹具 | 卡顿达标，四种设备出声 |
| A4 | DJ 的脑子：能量曲线、乐句对齐、调性锁、读场 | Claude Code | C1 预设 | 纯函数测试过，盲听达标 |
| A5 | 点歌流水线：文字审核、Lyria 3.5 生成、存 R2、对拍混入 | Claude Code | A1、A3 | 点歌 60 秒内混入 |
| A6 | wrangler、Durable Object、secrets、部署；审 Codex 的 PR | Claude Code | 无 | 合并 main 自动发布 |
| C1 | 12 种风格预设 JSON，只用官方关键词表里的词 | Codex | 提示词指南 | 每种有提示词、权重、BPM、调性 |
| C2 | 3D 资产流水线：Blender 命令行 FBX 转 GLB、gltf-transform 压缩、资产清单含原生 BPM | Codex | Mixamo 下载 | 每个 GLB ≤ 4 MB，清单齐 |
| C3 | 舞池组件：加载舞者、按风格切动作、播放速度跟 BPM、灯光跟能量、降级 | Codex | C2、A3 的拍点 | 8 个舞者 30 帧，踩拍达标 |
| C4 | 手机控制器页面：加入、风格旋钮、点歌表单、反应、主人控制 | Codex | A1 | Playwright 流程过 |
| C5 | 音箱端界面：正在播放、能量条、歌单、二维码、缓冲提示 | Codex | A1 | 3 米外看得清 |
| C6 | 出图脚本：调 Images API 生成设定图和贴图，存 R2 | Codex | 提示词清单 | 20 张图入库 |
| C7 | 状态机和 DJ 脑子的单元测试补全；录 PCM 夹具的脚本 | Codex | A1、A4 | 覆盖率 ≥ 80% |
| C8 | 「今晚回顾」页面和 session 记录 | Codex | A1 | 派对结束能看 |
| C9 | LICENSES.md、README、CLAUDE.md | Codex | 全仓库 | 新会话不用重新摸索 |

协作规则和「玩什么」一样：先契约后实现，一任务一分支一 PR，夹具进仓库测试不联网，Codex 不碰配置和密钥，谁写的谁不审。顺序：A1 → C1、C2 并行 → A3、C4、C5 并行 → A2 → A4、C3 → A5 → C6、C7、C8 → 验收门 A。

## 成本与三道验收门

| 项目 | 估算 | 说明 |
| --- | --- | --- |
| Workers Paid 加 Durable Objects | 约 7 加元一个月 | 和「玩什么」共用同一个账号 |
| Lyria RealTime | 未公布，开工第一天核对 | 实验版模型，按分钟计还是免费额度要查清；按每场 3 小时、每月 8 场估成本 |
| Lyria 3.5 点歌 | 未公布，同上 | 每场 10 到 20 首 30 秒片段 |
| GPT Image 出图 | 一次性不到 5 加元 | [按 OpenAI 公布的每图价格](https://developers.openai.com/api/docs/models/gpt-image-1.5)，20 张设定图和贴图 |
| Mixamo | 0 | Adobe 免费 |
| Meshy 玩家头像 3D 化（第二版） | 先买一小包点数 | [每个模型约 20 到 30 点加绑骨 5 点](https://docs.meshy.ai/api/pricing) |

| 门 | 证明什么 | 必须过的指标 | 过了才能做 | 目标 |
| --- | --- | --- | --- | --- |
| A 声音对 | 一条流在电视上稳定播，切风格像 DJ，钥匙不进浏览器 | 30 分钟连播达标；盲听 ≥ 7 分；设备矩阵四种出声 | 舞池和手机端合流 | 第 2 周末 |
| B 舞池动 | 舞者踩在拍子上，机器跑得动 | 踩拍 95% ≤ 60 毫秒；8 个舞者 30 帧；手机响应 ≤ 200 毫秒 | 点歌和读场 | 第 4 周末 |
| C 派对能开 | 真人一小时玩下来 | 8 人派对 0 崩溃、≥ 10 首点歌、满意度 ≥ 4/5；成本 ≤ 2 加元一场 | DJ 对战、玩家头像上舞池、真歌时间 | 第 6 周末 |

## 需要你拍板的 4 件事

| 事项 | 我的建议 | 其他选项 |
| --- | --- | --- |
| 玩家「加歌」是什么 | 已定：描述一首歌，AI 生成原创，DJ 混进去 | 真歌走 YouTube 嵌入，只播不混，放第二版 |
| 第一版的舞者 | 已定：Mixamo 通用角色，免费、动作是真人动捕 | 一开始就做玩家头像 3D 化，要买 Meshy 点数，多两周 |
| 音箱端是什么设备 | 已定：Apple TV。它没有浏览器，音箱端页面跑在 Mac 或 iPad 上，AirPlay 镜像到电视；打碟要跑 8 个舞者，用 Mac | 只用 iPad 当音箱端，3D 要降到 4 个舞者 |
| 每场和每月的成本上限 | 已定：每场 4 小时自动结束，每月 Lyria 上限 20 小时，超了提示 | 不设上限，看第一个月账单再定 |

名字沿用「打碟 · DJ Booth」，路径 changle.ca/dj，不想要就改。

## 第一条指令

先把这份文档导出成 Markdown 存进仓库 docs/dj-booth.md。

给 Claude Code：

```markdown
读 docs/dj-booth.md。本次只做验收门 A 之前的「假 DJ」地基，按分工表的 A1、A3、A6：
1. 在 games/dj 建工程，部署方式和 tools/suibian 一样，接 Durable Object（Workers Paid）
2. 写 CONTRACTS.md 和 src/types.ts：RoomState、DjCommand、Track、Preset，加房间状态机（等待、暖场、推高、顶点、收尾、结束）和它的单测
3. 音箱端播放器：AudioWorklet 环形缓冲、DynamicsCompressor 限幅、AnalyserNode 输出低频能量；先播一段录好的 2 分钟循环音频，不接 Lyria
4. 音箱端页面一个按钮「开始派对」启动音频，加 Wake Lock；手机端页面只做「加入房间」和一个 🔥 按钮，大屏能看到谁按了
5. 用 iPhone Safari 和 Mac Safari 各试一遍出声，把结果记进 docs/
6. 给 Codex 写 C1、C2、C4、C5 的任务卡放进 docs/codex-tasks/
第 5 步做完停下给我看。Lyria 的接入是下一步，不要现在接。
```

给 Codex（每次一张卡）：

```markdown
按 docs/codex-tasks/C2-asset-pipeline.md 做 3D 资产流水线。
输入：assets/mixamo/ 里的 FBX；输出：public/dancers/*.glb 和 assets/manifest.json（含每个动作的原生 BPM、适用风格、时长）。
用 Blender 命令行转 GLB，gltf-transform 压缩到每个 ≤ 4 MB。
写一个脚本 npm run assets 一键重跑；只改 scripts/assets/ 和这两个输出目录。
跑完把清单贴进 PR。不碰游戏代码、配置、secrets。
```

## 参考链接

- [Lyria RealTime 文档](https://ai.google.dev/gemini-api/docs/realtime-music-generation)：实验版，纯器乐，带权重的多条提示可实时混合，BPM 60 到 200，输出 48kHz 立体声 PCM，带水印。
- [Lyria 提示词指南](https://ai.google.dev/gemini-api/docs/lyria-prompt-guide)：两种生成方式（Lyria 3.5 整首带人声、Lyria RealTime 实时），风格关键词表。
- [GPT Image 定价](https://developers.openai.com/api/docs/models/gpt-image-1.5)：按图计价，1024 方图从约 0.01 美元起。
- [Meshy API 定价](https://docs.meshy.ai/api/pricing)：图转 3D 20 到 30 点，绑骨 5 点，动画每个动作 3 点，预付点数。
- [Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)：Durable Objects 要 Workers Paid。
