# 全站设计 · 状态

- 现状：共用组件在 `site/src/ui/`，规则在 docs/DESIGN.md；详细历史在 docs/briefs/design.md。
- `ui/ScreenHints`（GameShell 和 NetFrame 里）：手机竖着玩游戏，底部提示横过来；横着时一张卡，左边 `ui/ToolbarDemo` 的 3D 手机一步步点给你看，右边是步骤，正在演示的那步亮着。按浏览器分：Safari 18（aA）、26（页面菜单 → 更多 → 隐藏工具栏）、27 起（页面菜单 → 隐藏工具栏）、安卓一键全屏、微信去 Safari 打开。各有「不再提醒」，不勾每次打开网站提示一次；脚本驱动的浏览器不出提示。
- 决定：Safari 版本看 `Version/NN`（iOS 26 起 UA 里的 iOS 号停在 18_6）。等动画的计时器用 `ui/tokenTime` 读时长 token：打包后 400ms 写成 .4s，直接 parseFloat 会差 1000 倍（Sheet 的离场也是这样被截掉的，11-19 修好）。
- 11-19 iPhone 上打开的弹层不靠 `position: fixed`，按可见区域自己定位（`ui/screenAnchor`，components/Sheet 和 ui/Sheet 都用）：Safari 用久了会把 fixed 放错，游戏卡跑到页面上面。页面滚动锁是计数的（`ui/scrollLock`）。
- 决定：首页脚本预算 124 KB（11-19 为上面那条 +0.4）；工具页每个工具一张 amber 卡，汇率、世界时间、单价换算在 /tools/<id>。
- 11-19 全站检查：主站 418 次打开（Chromium、WebKit，手机竖横、电脑，中英）没有报错、横向溢出、坏图；17 个游戏点着玩、20 个联机游戏四台手机在线上桌开局回大厅都没报错。修了玩什么能左右拖、抓紧了和到此一游的读屏名字和对比度。
- 待办：6 个独立应用（到此一游、一起跳、抓紧了、藏在人群里、随便、玩什么）没有这两个提示，要的话各自的对话照 ScreenHints 加。iOS 26/27 横屏时 Safari 的小地址栏在顶部还是底部没查到准话，步骤只说点剩下的那条小地址栏。
- 交出去的（见 briefs/design.md 交给别的对话）：联机桌加一起跳、抓紧了和投屏按钮（房间与联机）；藏在人群里竖着时「请横过来」盖住了「回到这桌」；`local_check.py`、`live_check.py` 过期了（首页与上线）。
