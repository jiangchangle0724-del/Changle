# ho-C1 · 关卡与回放

以已合并的 A1 为唯一物理实现；不依赖 A2 / PR #165。没有修改物理、渲染器、依赖或锁文件。`package.json` 只增加 `levels` 脚本。

## 运行与复核

在 `games/hang-on`，使用 Node 22：

```sh
npm ci
npm test
npm run typecheck
npm run ip-check
npm run levels
```

Windows 使用 Git Bash 执行这些命令；或设置 `npm_config_script_shell` 为 Git Bash。当前 main 的 typecheck 包含 `/dev/null` 重定向和 Worker 类型生成，此处没有改动这些脚本。关卡与验收仍只调用 A1 物理，不调用房间或联机接口。

`run-levels.mjs` 使用现有 Vite 依赖中的 esbuild，将原始 `world.ts`、`replay.ts` 打到系统临时目录，逐关调用 A1 的 `runReplay(level, replay)`，最后清理临时文件。回放只设置手柄输入、推进正常步长，没有传送、初始速度注入、复活捷径或物理参数覆盖。

每个 JSON 均有中英文名称、单一教学标签、完整尺寸、出生点、终点、死亡线、par 和相对回放路径。每份回放都是已经展开的逐帧输入：4 人、60 Hz，`seq` 从 0 单调递增，`t` 为毫秒；A1 内部固定 120 Hz。按实测操作保存输入，验收时不会运行寻路器或根据当前位置改变回放。

验收脚本会拒绝：缺关或多关、缺回放、非法材质、fading / springs、出生时矩形平台 / 箱子 / 跷跷板重叠、缺手柄、轴值越界、非法序号 / 时间、未过关、用时或死亡超标、缺图或图片尺寸不为 1280×720。相邻平台边缘接触允许；跷跷板运行时与支撑面发生正常碰撞。

三个反例已实测返回退出码 1：重复平台（overlap）、删除首帧第 4 个手柄（missing controller）、将 par.seconds 设为 0。反例运行后恢复原文件，再跑完整验收。

## 布局

| 关卡 | 名称 / Name | 教学 | par（秒 / 每人死） | 布局与操作 |
| --- | --- | --- | --- | --- |
| table-01 | 茶布起步 / Tea Cloth Crawl | crawl | 60 / 2 | 连续茶布，伸手、抓地、向前拽、松手换抓点。 |
| table-02 | 碗沿小缝 / Between the Bowls | gap | 60 / 2 | 两块陶瓷碗沿，中间 80 px；抓对面边缘翻过去。 |
| table-03 | 筷子桥 / Chopstick Bridge | swing | 60 / 2 | 两根 22 px 厚木筷，50 px 间隔，逐段上升后下降；抓边缘荡过、调整落点。 |
| table-04 | 蒸笼叠叠高 / Steamer Stack | climb | 60 / 2 | 四次 80 px 翻越；中途检查点。矩形按竖直切片拼接，不相互覆盖。 |
| table-05 | 面条过火锅 / Noodle over the Hotpot | rope | 60 / 2 | 280 px 火锅缺口；8 节 × 38 px 面条绳，抓绳、向右荡、松手落地。 |
| table-06 | 一串汤圆过大锅 / Dumpling Chain | chain | 90 / 2 | 280 px 大坑，上方筷子离起台 200 px。起台标为只能站、不能抓；两人借身体成链够到高处，再接应搭档、沿筷子横移。 |
| van-07 | 天车门把手 / SkyTrain Handles | door | 60 / 2 | 两个金属门把手，高出起台 80 px，中间 80 px 门缝；抓侧面翻过门。 |
| van-08 | 图腾向上 / Totem Ascent | climb | 60 / 2 | 比蒸笼更窄的五级 80 px 柱顶，中途检查点；连续换手向上。 |
| van-09 | 摇摇浮筒 / Wobbling Pontoons | balance | 60 / 2 | 600 px 铰接浮筒跨过 490 px 水面；两岸限制转角，玩家负重仍会摇晃。 |
| van-10 | 狮门抛接力 / Lions Gate Toss | throw | 60 / 2 | 只能站的起台，160 px 水面加 80 px 高差；互抓、合力向上向右、释放飞行中的队友，落地后走到桥头。 |
| van-11 | 雨中快抓 / Rain Grip | ice | 60 / 2 | 所有接触面用 ice；三个 70 px 缝，及时换抓点、控制滑行。A1 的 ice 改变接触摩擦，不会自动让握持失效。 |
| van-12 | 从夜市到海湾 / Night Market to Harbour | combine | 90 / 2 | 台阶 → 绳索跨水 → 铰接浮筒 → 雨天冰岸，串联 A1 可用机关，前后各一检查点。 |

第五关和第十二关必须在实际回放中产生 rope grab；第九关和第十二关必须产生 prop grab 且浮筒倾斜超过 0.05 rad。没有仅摆在旁边充数的绳索和跷跷板。

第六关额外检查两名悬空玩家的真实「玩家 → 玩家 → 地形 / 绳」链，累计至少 0.25 秒。第十关额外检查抓着队友的手被释放时，队友已向右上飞行（vx > 150、vy < -100），至少发生两次。两关都把 4 份已录手柄输入各自投影成单人回放，结果均为 0/4 通关；不使用移动出生点、把其他玩家设死或注入状态的对照。此对照用于防止已录路线退化为单人绕过，并非任意输入的可达性穷举。

## 截图与浏览器回放

12 张同名 PNG 均由 Playwright + Chromium 截取，1280×720、deviceScaleFactor=1。模拟停在初始出生状态；相机缩放到全关，四人、所有机关和终点同时可见。显示 A1 原有开发渲染器，不依赖 A3 美术。`grab:false` 的起台另外绘出虚线和中英文「只能站 / Stand only」。

```sh
# 本机审查页：选择关卡，回放 / 暂停 / 重置；Ctrl+C 停止
npm run levels -- --serve

# 可选：通过 npm exec 临时取得 Playwright，不修改项目依赖或锁文件
npm exec --yes --package=playwright -- playwright install chromium
npm exec --yes --package=playwright -- node scripts/run-levels.mjs --screenshots
```

已有 Playwright 时，可将 `HANG_ON_PLAYWRIGHT` 指向其模块目录；已有浏览器时照常设置 `PLAYWRIGHT_BROWSERS_PATH`。默认 `npm run levels` 不需要 Playwright，只读取随提交保存的截图并验证尺寸。

![table-01](table-01.png)
![table-02](table-02.png)
![table-03](table-03.png)
![table-04](table-04.png)
![table-05](table-05.png)
![table-06](table-06.png)
![van-07](van-07.png)
![van-08](van-08.png)
![van-09](van-09.png)
![van-10](van-10.png)
![van-11](van-11.png)
![van-12](van-12.png)
