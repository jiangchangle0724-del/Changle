# 任务卡 ho-C2 · 场景贴图、背景与 LICENSES.md

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/ho-c2-art`　**前提**：A3（Pixi 渲染）定好图集格式后

## 先读
`docs/hang-on.md` 的「我们的版本」「美术管线」；`games/hang-on/CONTRACTS.md` 的铁律 2。

## 任务
1. 两套无缝贴图（每套 512×512 PNG，可平铺）：年夜饭桌 = 绿茶布、木筷子、赤豆沙、汤面、瓷碗边；温哥华 = 湿柏油、图腾柱木纹、天车铝板、海水、雨玻璃。用 GPT Image 或 Nano Banana 生成，提示词写进 `docs/art/prompts.md`，每张图旁边记录模型、日期、提示词。
2. 去背景道具 PNG（各 ≤ 256 px 高）：碗、蒸笼、蜡烛、汤勺、火锅、筷子架；天车车门、图腾柱、浮筒、Lions Gate 塔、路灯、雨伞。
3. 每个世界三层视差背景：远景 1920×1080 氛围图、中景剪影、近景散点，各一张。
4. 用 `pngquant` 或 `oxipng` 压缩；跑 `npm run atlas`（A3 提供）打进图集。
5. 写 `games/hang-on/LICENSES.md`：每个资产一行，来源、生成工具、许可。CC0 音效音乐也记在这里（C3 会追加）。

## 不许做的事
不画角色（角色是程序绘制的）。不参考任何 Heave Ho 截图，不输入它的名字做提示词。不用任何带版权的字体或图标。

## 输出（只改这里）
`games/hang-on/assets/**`、`docs/art/**`、`games/hang-on/LICENSES.md`。

## 验收
每关加载的资产总和 ≤ 400 KB；贴图平铺无缝（4 格拼接截图贴进 PR）；两个没玩过原版的人看角色和场景截图，没人说「这不是那个游戏吗」；`LICENSES.md` 覆盖 `assets/` 下每一个文件（脚本校验）。
