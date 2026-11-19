# 藏在人群里 · 状态

- 现状：线上 changle.ca/hide。大升级（Steve 11-18）分块上线：人物 #616、场地 #633、打击感 #661、更多动作和场边的人 #668。按技能十项打分 1.6 → 2.0。
- 决定：所有效果每个身体一样，不泄密（玩家站着也会点头，摊子前谁都会吃）。地面上的东西代码画（`ui/floorArt.ts`），震屏用冲击量（`ui/shake.ts`），场边的人在人群去不了的地方（`ui/extras.ts`）。
- 决定：动作取自 Quaternius 第二个动作包（CC0，Steve 11-19 同意下载），`tools/moves/build_crowd_moves.py` 做成 `crowd-moves.glb`；包本身不进仓库。
- 待办：海堤、站厅、庭院各加一个全场事件（先做海堤的自行车：铃响后横穿人群，不让开就被撞倒），然后体验（第一次练习的引导）。
- 待办：真手机上看帧数、震屏会不会太晃、夜市水洼和灯笼在手机上清不清楚。
- 详细：docs/briefs/hide-crowd.md；设计说明：games/hide-crowd/DESIGN.md。
