# 藏在人群里 · Unspottable

A bilingual, phone-first crowd-blending party game for changle.ca. Players steer a character through a moving crowd, blend into passer-by rhythms, and tag rival players. A separate screen view shows the whole arena without identifying which characters are human.

这是一个适合手机游玩的中英双语派对游戏。玩家在移动人群中操控角色、模仿路人节奏隐藏身份，并抢先给对手贴标签。电视视图展示整个人群和比分，但不会标记真人角色。

The crowd, character poses, and motion are original CSS artwork and animation. This is a fan-made rules homage; it does not use assets from the commercial game.

## Run locally

From the repository root:

    cd games/unspottable
    npm ci
    npm run dev

Open the Wrangler URL shown in the terminal, usually http://127.0.0.1:8787. To play from phones on the same Wi-Fi, open the same port at your computer's LAN address. The dev server binds to all interfaces for this purpose. Create a room on one phone and join with its four-digit code on the others.

Mobile players use the on-screen joystick, Punch, and Blend controls. On a computer, focus the joystick and use the arrow keys or W/A/S/D. A TV can open the room's TV link directly; alternatively, open it on a spare phone and mirror that phone to the TV with AirPlay or a similar casting option.

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
