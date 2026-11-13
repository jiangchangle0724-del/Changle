# 游戏 · 我从来没有（prompts）

对话名「游戏 · 我从来没有」。网址 changle.ca/g/never-have-i-ever。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

念一句“我曾经……”，做过的人喝（英文是 Never have I ever…）。也可以换成“谁最有可能”，大家一起指人。

2 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/prompts.ts`
- 单机画面：`site/src/games/PromptDecks.tsx`
- 联机画面：`site/src/online/games/NetPrompts.tsx`
- 内容：`site/src/data/prompts.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `prompts` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `prompts` 开头的测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- 「我从来没有」和「谁最有可能」两种题在同一个游戏里。
- 2026-11-12 中文的题头从「我从来没有……」改成「我曾经……」，Steve 定的：照英文翻的「我从来没有」再配上「我做过 / 没做过」，读着绕。单机和联机卡片上面那行、英文界面里卡片下面那行中文、印章上的那句、首页卡片的玩法都改了。游戏名、切换按钮、玩法说明开头和大屏角上的「我从来没有」是游戏和玩法的名字，不变（大屏卡片上面没有题头，下面写着「在手机上选：我做过，还是没做过」）；英文不变。40 张卡接在「我曾经」后面都通顺，没改。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-12 我从来没有: the Chinese lead-in reads 我曾经…… so it matches 我做过 / 没做过（分支 `claude/prompts-zengjing`）
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in the last games: whose turn it is, toasts, champions

## 记录

- 2026-11-02 建档案。
- 2026-11-12 Steve 在 iPhone 上玩联机，觉得「我从来没有…… 在网上和人吵过架」配「我做过 / 没做过」难懂，要直接说「我曾经……」，照改。11-05 的修复（#267：单机选人时名字被底部按钮挡住、谁最有可能平手、下一张，这份档案也在那里补齐了）还开着没合并。
