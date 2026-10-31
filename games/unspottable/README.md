# 藏在人群里 · Unspottable

A bilingual, phone-first crowd-blending party game for changle.ca. Players steer a character through a moving crowd, blend into passer-by rhythms, and tag rival players. A separate screen view shows the whole arena without identifying which characters are human.

这是一个手机优先的中英双语派对游戏。玩家在移动人群中操控角色、模仿路人节奏隐藏身份，并抢先给对手贴标签。电视视图展示整个人群和比分，但不会标记真人角色。场景使用原创低多边形 WebGL 3D 画面，并为手机限制渲染开销；不支持 WebGL 的浏览器会切换到 CSS 动画版。移动采用目标 20Hz 的服务端权威模拟，手机输入按模拟帧合并，本机预测让自己操控的角色保持跟手；摇杆加入死区和非线性响应，角色有加速、惯性刹车、人群避让与身体碰撞。动画增加分段四肢、支撑/摆动步态、挥拳前摇与收招、受击反馈。手机请横屏游玩；浏览器支持时会尝试锁定横屏。它是规则致敬作品，没有使用商业游戏的模型、贴图或音频。

The arenas remain original stylized 3D scenes rather than copied game files. Each arena now has its own original, AI-generated panoramic environment artwork, alongside the existing live 3D landmarks. The crowd uses three original ChatGPT ImageGen character sprite atlases, rendered as animated billboards inside the 3D arenas with front, side, and back views plus walk and punch poses. Server movement, collision, tagging, shadows, and hit rings remain real-time; browser physics does not depend on the artwork. The atlases were compressed for mobile delivery. 20 Hz server-authoritative movement ticks coalesce phone input frames, while local prediction keeps the controlled character responsive. A deadzone and curved joystick response improve fine control; crowd separation and contact resolution prevent characters from occupying the same space. Turn a phone sideways to play; orientation lock is used only when the browser allows it. This is a fan-made rules homage and does not use models, textures, or audio from the commercial game.

## Original 3D arenas / 场景

- **Vancouver Seawall Park / 温哥华海堤公园:** a bright lawn by the bay, with a boardwalk, railings, cedars, flowers, clouds and a mountain horizon.
- **Vancouver Transit Hall / 温哥华交通站厅:** a glassy public concourse with tiled platforms, columns, seats and reversing walkways.
- **Chinese Courtyard Theatre / 中式庭院戏台:** a timber stage framed by red curtains and lanterns, with lattice details, audience seats and a center spotlight.

Each location now has its own landmark layers and original low-poly architecture: the seawall opens onto a mountain ridge, downtown towers and a small ferry; the transit hall has a long roof frame, platform lights and ticket gates; and the courtyard adds a timber side gallery, tiled eaves, bamboo and stone paving. Palette-driven canvas maps add lawn grain, timber plank seams, and transit floor tiles; they refresh when the theme changes and use capped anisotropic filtering. The shared crowd has 18 independent passers-by plus the real players, with palette-driven outfits, walk cycles, punch poses and stun feedback. Characters accelerate into a run, brake with a short carry-through, and rotate toward their travel direction instead of snapping. Rendering uses instanced crowd parts and reuses transform scratch state to reduce phone-side garbage collection.

## 3D visual pipeline / 画面优化

The visual pass now uses an elevated perspective camera with a consistent arena width, a palette-derived fill light, subtle floor relief, and soft radial contact shadows. The shadows stay in the existing instanced crowd batch; realtime shadow maps remain off for phone GPUs. The scene still uses original procedural geometry and does not yet match Steam's authored art assets. See [docs/visual-pipeline.md](docs/visual-pipeline.md) for the GitHub game-development guides, asset review, licensing policy, and the remaining quality gate.

当前画面改为保持场地宽度稳定的透视镜头，并增加调色板适配的补光、地面细节和柔边脚底阴影；阴影继续使用实例化绘制，避免在手机 GPU 上开启昂贵的实时阴影。场景仍为原创程序化几何，画面质量还没有达到 Steam 原版的美术资产水准。GitHub 游戏开发指南、素材审核和后续质量门槛见 [docs/visual-pipeline.md](docs/visual-pipeline.md)。

## Run locally

From the repository root:

    cd games/unspottable
    npm ci
    npm run dev

Open the Wrangler URL shown in the terminal, usually http://127.0.0.1:8787. To play from phones on the same Wi-Fi, open the same port at your computer's LAN address. The dev server binds to all interfaces for this purpose. Create a room on one phone and join with its four-digit code on the others.

Mobile players use the on-screen joystick, Punch, and Blend controls; Punch is sent as soon as the touch begins. In landscape, the arena fills the available screen and the controls stay at the lower left; tap the fullscreen icon in the game HUD to request immersive fullscreen and a landscape lock where the browser permits it. On iPhone Safari, add the game to the Home Screen and launch it from there for a standalone screen without Safari browser chrome. On a computer, use the arrow keys or W/A/S/D anywhere in the match. Compatible controllers use the left stick or D-pad to move, A to Punch, and X to Blend. A TV can open the room's TV link directly; alternatively, open it on a spare phone and mirror that phone to the TV with AirPlay or a similar casting option.

## Test and build

    npm ci
    npm run typecheck
    npm test
    npm run build

The unit tests cover deterministic crowd setup, expanded lobby placement, acceleration and braking, gradual turning, movement bounds and input normalization, punch range and direction, crowd fouls, blend cooldowns, win and draw rules, room hosting and presence, player limits, TV identity privacy, frame-time percentile calculation, adaptive resolution hysteresis, and quality-tier pixel budgets.

## On-device FPS check / 真机帧率

Append `?fps=1` to an active room URL on iPhone or iPad Safari. Start a match with both devices in the room; the meter reports FPS, average/P95/slowest frame time, adaptive render tier, and effective pixel ratio once per second. The renderer starts at up to 1.65 device pixel ratio, drops a tier after two windows above 23 ms P95 (or immediately at 36 ms), and restores one tier after five windows below 18 ms. Keep the same arena and player count for comparisons, and note the device model, iOS/iPadOS version, browser, and displayed values. Remove the query string to hide the meter.

在 iPhone 或 iPad 的 Safari 打开进行中的房间链接，并在末尾加上 `?fps=1`。面板每秒显示 FPS、平均/P95/最慢帧耗时、自动画质档位和实际 DPR。渲染器最高以 1.65 DPR 起步，P95 连续两个采样窗口高于 23ms 就降一档，达到 36ms 会立即进入省电档；P95 连续五个窗口低于 18ms 后恢复一档。对比时保持场景和玩家人数一致，并记录设备型号、系统版本、浏览器及读数；删掉查询参数即可隐藏读数。

## Deploy to Cloudflare Workers

1. In Cloudflare, create a Workers project from this repository and set the root directory to games/unspottable.
2. Use Node.js 22 and set the build command to npm ci && npm run build.
3. Deploy with npm run deploy, or run wrangler login followed by npm run deploy from this directory.
4. Share the deployed HTTPS address. Players use the home page; the room owner can copy the TV view link after creating a room. Open that link on a TV browser or a spare phone and mirror it.

The Worker configuration provisions the ArenaRoom Durable Object and serves the built client assets. No secrets or external game assets are required.

