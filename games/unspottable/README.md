# 藏在人群里 · Unspottable

A bilingual, phone-first crowd-blending party game for changle.ca. Players steer a character through a moving crowd, blend into passer-by rhythms, and tag rival players. A separate screen view shows the whole arena without identifying which characters are human.

这是一个手机优先的中英双语派对游戏。玩家在移动人群中操控角色、模仿路人节奏隐藏身份，并抢先给对手贴标签。电视视图展示整个人群和比分，但不会标记真人角色。游戏场景使用原创低多边形 WebGL 3D 画面，并为手机限制渲染开销；不支持 WebGL 的浏览器会切换到 CSS 动画版。手机请横屏游玩；浏览器支持时会尝试锁定横屏。它是规则致敬作品，没有使用商业游戏的模型、贴图或音频。

The arena is an original low-poly 3D scene rendered with WebGL. Instanced crowd characters, venue props, pose animation, and local movement prediction keep the scene light enough for phones; browsers without WebGL fall back to the CSS-animated crowd. Turn a phone sideways to play; orientation lock is used only when the browser allows it. This is a fan-made rules homage and does not use models, textures, or audio from the commercial game.

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

The unit tests cover deterministic crowd setup, movement bounds and input normalization, punch range and direction, crowd fouls, blend cooldowns, win and draw rules, room hosting and presence, player limits, and the TV view's identity privacy.

## Deploy to Cloudflare Workers

1. In Cloudflare, create a Workers project from this repository and set the root directory to games/unspottable.
2. Use Node.js 22 and set the build command to npm ci && npm run build.
3. Deploy with npm run deploy, or run wrangler login followed by npm run deploy from this directory.
4. Share the deployed HTTPS address. Players use the home page; the room owner can copy the TV view link after creating a room. Open that link on a TV browser or a spare phone and mirror it.

The Worker configuration provisions the ArenaRoom Durable Object and serves the built client assets. No secrets or external game assets are required.

