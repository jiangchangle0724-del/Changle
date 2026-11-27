# 工具 · 随便 · 状态

- 现状：changle.ca/eat 夜场改版（S1–S3，Codex 卡在 docs/codex-tasks/suibian/）都已上线。第 1 轮先选从哪儿挑（按菜系 / 按想吃的）；两轮没有倒计时；第 2 轮可按距离排、换范围重新搜、换一批；全桌都勾了同一家会提示，谁都能一点出结果。左上角返回是上一步。
- 决定：样稿是设计画布「随便 · 夜场改版样稿」；样式不写死值（tests/design.test.ts）；放题只认店自己说的；只有房主能带全桌退一步、换范围、换一批；回第 1 轮没改就不再搜 Google；换一批不重新搜，所以换上来的没有照片。
- 2026-11-26 Metrotown 的点挪到 Metropolis 商场（#827）；查 bug 修了 7 个，加了随机乱点测试 tests/fuzz.test.ts（#828）；全桌都想去 + 换一批（#830）。
- 待办：接约时间带来的参数（/eat/?from=when&date=…&time=…&occasion=…），开桌页预先填好，见 briefs/when.md「交给别的对话」。
- 待办（Steve 11-26 定了）：改成认主站账号，Google 登录留一个月过渡；然后开一桌之前问 `MEMBER.use(uid, "suibian")`，每个账号免费 3 次，见 docs/membership.md。
- 待办（要 Steve 定）：Google Text Search 每天的上限；过敏表的几个问题；借鉴来的另外几条（实时排名、地图上拖点、两个人一对一、重连带回合号）；换一批要不要也拿照片（每批多花约一次搜索的钱）。
- 详细历史在 docs/briefs/suibian.md。
