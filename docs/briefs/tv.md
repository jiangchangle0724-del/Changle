# 平台 · 大屏（tv）

对话名「平台 · 大屏」。网址 changle.ca/tv、changle.ca/tv/<桌号>。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视或电脑的浏览器打开 `changle.ca/tv`：屏幕上出现桌号和二维码，大家扫码入座。神回复在大屏上整场演出，手机变成遥控器；其他游戏在手机上玩，大屏显示桌号和谁在玩。

## 文件

- `site/src/tv/`（`TvApp.tsx`、`parts.tsx`）

## 先读

- `site/DESIGN.md`

## 测试

- `site/scripts/tv_test.py`（开桌、扫码、整局神回复）

## 定过的事

- 只看不玩的手机看到整个大屏的画面。
- 按 M 静音。
- 已经开好的桌，在大屏上打开 `changle.ca/tv/<桌号>`。

## 还剩什么

- 旁观（Steve 10-31 要的「旁观的账号进任何游戏都是投电视的最佳第三者视角，不能参与」）只做了基本版：座位可以设「只看」，不轮到、不罚，游戏里有一条「可以投到电视」的提示；但手机上显示的是没入座的普通画面。除了神回复（整场演出）和到此一游（自己的大屏），其他游戏的大屏也只是同一个画面加旁边的座位表。要做到「最佳视角」，每个游戏要有自己的大屏画面，旁观的手机直接显示它。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Three small things from the player tests
- 2026-11-01 Count the table's own penalty: ×N on the stamp, and 7-8-9's pot
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 打碟 · DJ Booth: the fake-DJ foundation (A1, A3, A6)
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
