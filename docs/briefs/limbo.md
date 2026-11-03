# 游戏 · 林波舞（limbo）

对话名「游戏 · 林波舞」。网址 changle.ca/g/limbo。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

手机贴在胸口往后仰，它测你仰了多少度，过了这一杆横杆再降。没过的出局喝一口。盲仰玩法：看不到自己的角度，凭感觉仰到目标，离得最远的喝。也可以拉一根真杆子，手机放音乐记分。

2 到 15 人。单机：手机测你后仰的角度，或者配真杆子。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/limbo.ts`
- 画面（单机和联机）：`site/src/party/limbo/`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `limbo` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `limbo` 开头的测试
- `site/scripts/party_test.py`（单机和联机）

## 定过的事

- 手机贴胸口测后仰角度；盲仰玩法看不到自己的角度，凭感觉仰到目标，离得最远的受罚（#66）。
- 没有传感器也能玩：拉一根真杆子，手机放音乐记分。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 Limbo: blind lean (盲仰), hit a target angle without seeing your own (#66)
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance
- 2026-10-29 site: sound comes back after another app takes the speaker; dance games silence the lounge music

## 记录

- 2026-11-02 建档案。
