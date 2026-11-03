# 工具 · 生活小工具（tools）

对话名「工具 · 生活小工具」。网址 changle.ca/tools。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

工具页签里的三个小工具：实时汇率（加币、人民币、美金、港元）、联动的世界时钟、单价换算（$/kg、$/lb、$/斤、$/oz、$/gal）。都不需要自己的服务器。

## 文件

- 工具页：`site/src/tools/ToolsTab.tsx`
- 汇率：`site/src/tools/Currency.tsx`、`fx.ts`（汇率取自公开接口 open.er-api.com）
- 世界时钟：`site/src/tools/WorldClock.tsx`、`tz.ts`
- 单价换算：`site/src/tools/UnitPrice.tsx`

## 先读

- `HANDOFF.md` 的「A tool」

## 测试

- 暂无专门的测试。

## 定过的事

- 三个工具合在一个对话里，哪个变大了再拆出去。

## 还剩什么

- 暂无记录。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Small fixes from the play-test: unit price, the wheel's editor, sign-in and profile forms
- 2026-10-29 site: 随便 · Whatever's Fine in the Tools tab, at /eat

## 记录

- 2026-11-02 建档案。
