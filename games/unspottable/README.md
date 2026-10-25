# 藏在人群里 · Unspottable

A bilingual, phone-first crowd-blending party game for changle.ca. Players steer a character through a moving crowd, blend into passer-by rhythms, and tag rival players. A separate screen view shows the whole arena without identifying which characters are human.

这是一个手机优先的中英双语派对游戏。玩家在移动人群中操控角色、模仿路人节奏隐藏身份，并抢先给对手贴标签。电视视图展示整个人群和比分，但不会标记真人角色。游戏场景使用原创低多边形 WebGL 3D 画面，并为手机限制渲染开销；不支持 WebGL 的浏览器会切换到 CSS 动画版。手机请横屏游玩；浏览器支持时会尝试锁定横屏。它是规则致敬作品，没有使用商业游戏的模型、贴图或音频。

The arenas remain original stylized 3D scenes rather than copied game files. Instanced crowd characters and landmark layers keep draw calls bounded; locally predicted acceleration and server-authoritative velocity reduce control lag without letting clients decide hits or scoring. Turn a phone sideways to play; orientation lock is used only when the browser allows it. This is a fan-made rules homage and does not use models, textures, or audio from the commercial game.

## Original 3D arenas / 场景

- **Vancouver Seawall Park / 温哥华海堤公园:** a bright lawn by the bay, with a boardwalk, railings, cedars, flowers, clouds and a mountain horizon.
- **Vancouver Transit Hall / 温哥华交通站厅:** a glassy public concourse with tiled platforms, columns, seats and reversing walkways.
- **Chinese Courtyard Theatre / 中式庭院戏台:** a timber stage framed by red curtains and lanterns, with lattice details, audience seats and a center spotlight.

Each location now has its own landmark layers and original low-poly architecture: the seawall opens onto a mountain ridge, downtown towers and a small ferry; the transit hall has a long roof frame, platform lights and ticket gates; and the courtyard adds a timber side gallery, tiled eaves, bamboo and stone paving. The shared crowd has 18 independent passers-by plus the real players, with palette-driven outfits, walk cycles, punch poses and stun feedback. Characters accelerate into a run, brake with a short carry-through, and rotate toward their travel direction instead of snapping. Rendering uses instanced crowd parts and reuses transform scratch state to reduce phone-side garbage collection.

## Run locally

From the repository root:

    cd games/unspottable
    npm ci
    npm run dev

Open the Wrangler URL shown in the terminal, usually http://127.0.0.1:8787. To play from phones on the same Wi-Fi, open the same port at your computer's LAN address. The dev server binds to all interfaces for this purpose. Create a room on one phone and join with its four-digit code on the others.

Mobile players use the on-screen joystick, Punch, and Blend controls; Punch is sent as soon as the touch begins. On a computer, use the arrow keys or W/A/S/D anywhere in the match. Compatible controllers use the left stick or D-pad to move, A to Punch, and X to Blend. A TV can open the room's TV link directly; alternatively, open it on a spare phone and mirror that phone to the TV with AirPlay or a similar casting option.

## Test and build

    npm ci
    npm run typecheck
    npm test
    npm run build

The unit tests cover deterministic crowd setup, expanded lobby placement, acceleration and braking, gradual turning, movement bounds and input normalization, punch range and direction, crowd fouls, blend cooldowns, win and draw rules, room hosting and presence, player limits, and the TV view's identity privacy.

## On-device FPS check / 真机帧率

Append `?fps=1` to an active room URL on iPhone or iPad Safari. Start a match with both devices in the room; each screen shows an animation-frame rate updated once per second, average frame time, and slowest frame time. Keep the same arena and player count for comparisons, and note the device model, iOS/iPadOS version, browser, and displayed values. Remove the query string to hide the meter.

在 iPhone 或 iPad 的 Safari 打开进行中的房间链接，并在末尾加上 `?fps=1`。两台设备都加入并开始游戏后，各自会显示每秒更新一次的动画帧率、平均帧耗时和最慢帧耗时。对比时保持场景和玩家人数一致，并记录设备型号、系统版本、浏览器及读数；删掉查询参数即可隐藏读数。

## Deploy to Cloudflare Workers

1. In Cloudflare, create a Workers project from this repository and set the root directory to games/unspottable.
2. Use Node.js 22 and set the build command to npm ci && npm run build.
3. Deploy with npm run deploy, or run wrangler login followed by npm run deploy from this directory.
4. Share the deployed HTTPS address. Players use the home page; the room owner can copy the TV view link after creating a room. Open that link on a TV browser or a spare phone and mirror it.

The Worker configuration provisions the ArenaRoom Durable Object and serves the built client assets. No secrets or external game assets are required.

