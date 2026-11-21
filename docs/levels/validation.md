# ho-C8 · #435 后的回放验收

2026-11-13，PR #418，`codex/ho-c8-hard-levels`。合入 main `e3abe00`，包含 #435「互相抓着飞不上天」和 #436 `npm run probe`。对修好后的原物理重新录制 12 份四人回放及 table-14 / table-16 / van-20 / van-22 四份双人回放，16 份 frames 均与 `7f42a65` 不同。

12 条关卡布局（包括出生点、终点、检查点、平台和机关）与 `7f42a65` 完全一致；只因新回放的死亡次数调整下表五关的 par.deathsPerPlayer，par.seconds 全部不变。基础 12 关及回放的 24 个 blob 与 main、开工前哈希一致，24 张原截图保持原字节。`src/**`、物理参数、`scripts/**`、package 与锁文件均和 main 一致，没有添加传送、初速、召唤或复活覆盖。

| 关卡 | 原每人死亡预算 | 新每人死亡预算 |
| --- | ---: | ---: |
| table-13 | 2 | 4 |
| table-15 | 3 | 6 |
| table-17 | 4 | 5 |
| van-20 | 6 | 8 |
| van-24 | 2 | 5 |

## 结果

115 条测试全部通过，包括新物理的三条回归检查；typecheck 通过，ip-check 0 处。原 `npm run levels` 全过，12 个难关的四份录制手柄分别投影为单人，全部 0/4。四人主回放各段 17.50–58.37 秒；安全机关、危险物距离、人数摆法、预算和两段合作等 C8 规则全部保留。双人摆法也通关，逐项检查机关使用、危险物距离与死亡预算；15–60 秒分段及 par 的 0.5 下界仍按契约只查四人主回放。

| 关卡 | 两处实际合作位置（x 范围，px） | 各段挂链秒数 S0… | 各段抛接次数 S0… | 合作段数 |
| --- | --- | --- | --- | ---: |
| table-13 | 起段抛接（420–600）＋高碗抛接（1560–1740） | 0.00 / 0.00 / 6.78 / 0.00 | 5 / 4 / 2 / 0 | 3 |
| table-14 | 下降动盘（500–1000）＋向上抛接（1400–1580） | 14.78 / 14.77 / 0.02 | 0 / 2 / 4 | 3 |
| table-15 | 红油沟抛接（600–820）＋中段转筷接应（1400–1700） | 0.00 / 4.82 / 9.98 | 2 / 2 / 1 | 3 |
| table-16 | 首段转筷（520–820）＋中段高差抛接（1280–1520） | 5.90 / 0.02 / 0.02 | 3 / 5 / 2 | 3 |
| table-17 | 下层抛接（400–600）＋上升动盘（1360–1880） | 0.02 / 12.75 / 0.02 | 5 / 2 / 0 | 2 |
| table-18 | 折线动盘（400–900）＋中段转筷（1320–1660） | 16.22 / 5.35 / 0.00 / 0.00 | 0 / 0 / 0 / 0 | 2 |
| van-19 | 低码头抛接（360–560）＋转梁接应（1280–1600） | 0.00 / 4.78 / 7.17 | 2 / 2 / 2 | 3 |
| van-20 | 斜行摆渡（360–880）＋反转钢梁（1400–1720） | 1.35 / 0.00 / 1.00 | 1 / 1 / 0 | 3 |
| van-21 | L 形平台（480–1000）＋两层高岸抛接（1400–1640） | 12.50 / 0.08 / 0.02 | 0 / 2 / 2 | 3 |
| van-22 | 港底转梁（320–700）＋高层升降台（1360–1840） | 6.68 / 17.40 / 0.02 | 2 / 0 / 4 | 3 |
| van-23 | 夜市抛接（660–860）＋长烤架斜台（1380–1900） | 0.00 / 7.05 / 0.02 | 2 / 2 / 0 | 2 |
| van-24 | 首段转梁（280–640）＋两层岸抛接（1280–1500） | 6.70 / 0.00 / 6.52 / 0.68 | 0 / 4 / 2 / 0 | 4 |

S0 是出生到第一面旗，之后按实际检查点事件划段。位置列指明两个不同合作障碍；挂链、抛接与分段均按原验收器在新物理下统计。12 关布局不变，整关最高重合 36.3%、第一屏最高 44.9%；布局表与相似度表见 [README](README.md)。

## table-13 探路参考

执行完整默认次数（单人 200 次、双人 100 次、每次 60 秒，2 个线程），未使用 --quick。四段都找到单人通过样本：第 1 段第 168 次，第 2 段第 2 次，第 3、4 段第 1 次。探路从各段起点分别开始；依本轮要求只报告，难关不以这项作为验收条件，关卡规则未修改。

```text
> @changle/hang-on@0.1.0 probe
> node scripts/probe.mjs table-13 --threads 2

乱按探路：1 个人 200 次、2 个人 100 次，每次 60 秒，2 个线程
| Level | 摆法 | 段 | 从 → 到 | 1 个人 | 2 个人 | 要大家 |
| --- | --- | --- | --- | --- | --- | :---: |
| table-13 | — | 1 | 出生点 (180,556) → 检查点 1 (1200,316) | 过得去（第 168 次） | — | 否 |
| table-13 | — | 2 | 检查点 1 (1200,316) → 检查点 2 (2200,156) | 过得去（第 2 次） | — | 否 |
| table-13 | — | 3 | 检查点 2 (2200,156) → 检查点 3 (2800,336) | 过得去（第 1 次） | — | 否 |
| table-13 | — | 4 | 检查点 3 (2800,336) → 终点 (2910,280) | 过得去（第 1 次） | — | 否 |
probe: 只报告；49 秒
```

## 历史反例

#422 两项新规则的反例及第二版完整输出保留在 [7f42a65 的验收记录](https://github.com/jiangchangle0724-del/Changle/blob/7f42a65076bfb2d1f32df15b3c73c800902037f7/docs/levels/validation.md)。那次输出对应当时的物理；本轮重新验证的是以下 #435 后的完整输出，不把历史数字当作本轮结果。

## npm test（退出 0，完整输出）

```text
> @changle/hang-on@0.1.0 test
> vitest run


 RUN  v5.1.0 C:/Users/OWNER/Documents/Codex/2026-11-01/github-https-github-com-jiangchangle0724-del/work/changle-ca/games/hang-on


 Test Files  12 passed (12)
      Tests  115 passed (115)
   Start at  11:32:37
   Duration  9.37s (tests 65%, transform 28%, import 5%, worker 2%)
```

## npm run typecheck（退出 0，完整输出）

```text
> @changle/hang-on@0.1.0 typecheck
> wrangler types > /dev/null && tsc --noEmit && tsc --noEmit -p tsconfig.server.json
```

## npm run ip-check（退出 0，完整输出）

```text
> @changle/hang-on@0.1.0 ip-check
> node scripts/ip-check.mjs

ip-check: 0 处（查了 3015 个文件）
```

## npm run levels（退出 0，完整输出）

```text
> @changle/hang-on@0.1.0 levels
> node scripts/run-levels.mjs

| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | Cookie grabs / Candle bounces | Machines used (s) |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | --- |
| table-01 | 4 | 111.50 | 0 / 0 / 0 / 0 | YES | 1.014 | 2560×720 | 45.78 / 38.03 / 27.68 | — / — | — |
| table-02 | 4 | 77.38 | 2 / 2 / 0 / 0 | YES | 0.774 | 2560×720 | 35.37 / 20.62 / 21.40 | 3 / — | — |
| table-03 | 4 | 85.38 | 0 / 0 / 0 / 2 | YES | 0.949 | 2560×720 | 28.90 / 15.83 / 40.65 | 3 / 3 | — |
| table-04 | 4 | 111.83 | 0 / 1 / 0 / 1 | YES | 1.017 | 2560×1440 | 39.50 / 30.52 / 41.82 | — / 12 | — |
| table-05 | 4 | 70.88 | 0 / 0 / 1 / 1 | YES | 1.013 | 2560×720 | 32.95 / 18.88 / 19.05 | — / — | — |
| table-06 | 4 | 76.32 | 0 / 0 / 0 / 0 | YES | 0.954 | 2560×720 | 28.27 / 26.23 / 21.82 | — / — | — |
| van-07 | 4 | 97.50 | 0 / 1 / 0 / 0 | YES | 0.975 | 2560×720 | 30.35 / 19.07 / 48.08 | — / — | — |
| van-08 | 4 | 102.48 | 0 / 0 / 0 / 0 | YES | 1.025 | 2560×1440 | 41.55 / 19.27 / 41.67 | — / 9 | — |
| van-09 | 4 | 158.02 | 0 / 1 / 0 / 0 | YES | 1.580 | 2560×720 | 53.22 / 50.77 / 54.03 | — / — | — |
| van-10 | 4 | 92.85 | 0 / 0 / 1 / 0 | YES | 1.032 | 2560×720 | 18.00 / 49.62 / 25.23 | — / — | — |
| van-11 | 4 | 84.24 | 1 / 0 / 1 / 1 | YES | 1.053 | 2560×720 | 28.67 / 36.95 / 18.63 | 4 / — | — |
| van-12 | 4 | 124.64 | 4 / 0 / 1 / 2 | YES | 1.039 | 3200×720 | 21.58 / 27.53 / 57.03 / 18.49 | 6 / 4 | — |
| table-13 | 4 | 113.10 | 4 / 3 / 2 / 5 | YES | 0.754 | 3000×720 | 26.97 / 19.88 / 40.47 / 25.78 | — / — | 8.1,0.0 |
| table-14 | 4 | 141.41 | 0 / 1 / 4 / 0 | YES | 0.786 | 2560×720 | 42.33 / 58.37 / 40.71 | — / — | 31.8,0.0,17.1 |
| table-14 | 2 | 137.88 | 4 / 2 | YES | 0.766 | 2560×720 | 43.05 / 70.15 / 24.68 | — / — | 16.6,0.0,7.4 |
| table-15 | 4 | 95.10 | 8 / 8 / 4 / 1 | YES | 0.634 | 2560×720 | 17.50 / 31.27 / 46.33 | — / — | 14.0,0.0,9.8 |
| table-16 | 4 | 97.83 | 2 / 0 / 2 / 2 | YES | 0.815 | 2560×720 | 48.15 / 25.48 / 24.20 | — / — | 24.7,11.9,0.0 |
| table-16 | 2 | 103.33 | 1 / 6 | YES | 0.861 | 2560×720 | 50.03 / 26.88 / 26.41 | — / — | 54.8,13.2,0.0 |
| table-17 | 4 | 158.17 | 1 / 2 / 10 / 7 | YES | 0.879 | 2560×1440 | 53.22 / 47.55 / 57.40 | — / — | 14.4,0.0,31.8 |
| table-18 | 4 | 147.98 | 4 / 3 / 8 / 1 | YES | 0.822 | 3000×720 | 53.68 / 36.08 / 35.87 / 22.35 | — / — | 18.0,12.7,0.0,17.9,0.0 |
| van-19 | 4 | 95.08 | 2 / 1 / 0 / 1 | YES | 0.634 | 2560×720 | 23.03 / 19.45 / 52.59 | — / — | 7.8,0.0,31.5,0.0 |
| van-20 | 4 | 114.96 | 10 / 4 / 9 / 8 | YES | 0.639 | 2560×720 | 42.58 / 32.52 / 39.86 | — / — | 15.1,0.0,5.0 |
| van-20 | 2 | 154.60 | 17 / 7 | YES | 0.859 | 2560×720 | 75.68 / 68.98 / 9.93 | — / — | 26.8,0.0,13.6 |
| van-21 | 4 | 114.81 | 0 / 1 / 17 / 1 | YES | 0.765 | 2560×720 | 45.55 / 38.03 / 31.23 | — / — | 28.6,0.0,10.2,0.0 |
| van-22 | 4 | 118.49 | 4 / 2 / 1 / 3 | YES | 0.658 | 2560×1440 | 44.10 / 46.95 / 27.44 | — / — | 18.6,0.0,17.0,18.5 |
| van-22 | 2 | 73.28 | 4 / 6 | YES | 0.407 | 2560×1440 | 35.13 / 18.17 / 19.98 | — / — | 13.6,0.0,12.0,11.8 |
| van-23 | 4 | 97.73 | 2 / 1 / 0 / 1 | YES | 0.652 | 2560×720 | 18.22 / 22.13 / 57.38 | — / — | 10.0,0.0,29.8,0.0 |
| van-24 | 4 | 155.19 | 4 / 4 / 5 / 6 | YES | 0.862 | 3000×720 | 35.20 / 52.18 / 36.82 / 30.99 | — / — | 24.3,0.0,42.9,0.0 |
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4
table-13: solo projections 0/4 cleared; chain=6.78s, throws=11
table-14: solo projections 0/4 cleared; chain=29.57s, throws=6
table-15: solo projections 0/4 cleared; chain=14.80s, throws=5
table-16: solo projections 0/4 cleared; chain=5.93s, throws=10
table-17: solo projections 0/4 cleared; chain=12.78s, throws=7
table-18: solo projections 0/4 cleared; chain=21.57s, throws=0
van-19: solo projections 0/4 cleared; chain=11.95s, throws=6
van-20: solo projections 0/4 cleared; chain=2.35s, throws=2
van-21: solo projections 0/4 cleared; chain=12.60s, throws=4
van-22: solo projections 0/4 cleared; chain=24.10s, throws=6
van-23: solo projections 0/4 cleared; chain=7.07s, throws=4
van-24: solo projections 0/4 cleared; chain=13.90s, throws=6
levels: 12/12 base + 12/12 hard PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```


## 按手酸重录（C15，2026-11-21）

本节为这17关的当前结果，早先C8/C10/C11表保留为历史记录。17关全部写入stamina，23份回放全部按对应难度重录；每帧只有ax/ay/gl/gr/seq/t，60Hz，没有注入位置、速度或动作。困难关的既有mover至少1.5倍速、wait不高于原值0.6倍，转杆绝对spin至少1.5倍；15关各加1个路线摆锤。具体布局见README的C15逐关记录。

### 最长连续悬挂与tired

每列按P1、P2……排列。连续悬挂定义为活着且未完成、至少一只手抓着、脚不着地且不在失重区；两手都松开或落脚即结束这一段。每物理步读取状态并累计，边界约有1/60秒采样误差。tired只计物理引擎实际发出的事件，滑脱后继续换手、落脚和接应都保留在回放里。

| 回放 | 各人最长连续悬挂（秒） | 各人tired次数 |
| --- | --- | --- |
| table-13.json | 5.82 / 6.27 / 3.35 / 0.55 | 0 / 0 / 0 / 0 |
| table-14.json | 1.77 / 6.17 / 1.57 / 3.62 | 0 / 0 / 0 / 0 |
| table-14.p2.json | 8.10 / 3.42 | 0 / 0 |
| table-15.json | 6.25 / 3.80 / 5.75 / 4.93 | 0 / 0 / 1 / 0 |
| table-16.json | 3.05 / 5.93 / 6.08 / 5.05 | 0 / 1 / 2 / 1 |
| table-16.p2.json | 3.27 / 5.98 | 0 / 1 |
| table-17.json | 4.03 / 5.85 / 5.18 / 5.13 | 0 / 0 / 0 / 0 |
| table-18.json | 7.60 / 7.47 / 7.35 / 9.12 | 0 / 0 / 1 / 0 |
| van-19.json | 3.60 / 3.82 / 4.13 / 7.70 | 0 / 0 / 0 / 1 |
| van-20.json | 5.52 / 7.08 / 6.87 / 4.33 | 0 / 3 / 2 / 1 |
| van-20.p2.json | 9.60 / 10.42 | 0 / 1 |
| van-21.json | 7.40 / 1.35 / 5.55 / 4.08 | 0 / 0 / 0 / 0 |
| van-22.json | 2.70 / 6.02 / 6.90 / 6.83 | 0 / 5 / 3 / 1 |
| van-22.p2.json | 4.75 / 3.52 | 0 / 0 |
| van-23.json | 1.55 / 2.08 / 6.03 / 5.42 | 0 / 0 / 0 / 0 |
| van-24.json | 3.95 / 7.65 / 6.87 / 5.75 | 2 / 1 / 3 / 1 |
| kitchen-29.json | 1.08 / 0.92 / 2.55 / 2.55 | 0 / 0 / 0 / 0 |
| kitchen-30.json | 1.20 / 6.00 / 2.55 / 0.65 | 0 / 2 / 1 / 0 |
| snow-33.json | 12.63 / 12.22 / 18.00 / 14.65 | 1 / 1 / 1 / 0 |
| snow-33.p1.json | 14.85 | 1 |
| snow-34.json | 14.73 / 12.77 / 18.00 / 12.70 | 0 / 1 / 1 / 0 |
| snow-34.p1.json | 18.00 | 5 |
| snow-36.json | 11.00 / 5.07 / 9.43 / 10.90 | 2 / 0 / 4 / 10 |

### 验收与反例

Node 22.23.4：npm test为234/234，29/29测试文件；npm run typecheck通过；npm run ip-check为0处；npm run levels完整通过，末三行为：

```text
stamina: 39/40 medium and hard levels replayed with tired hands
long: 0 long levels
levels: 12/12 base + 12/12 hard + 6/6 team + 6/6 kitchen + 6/6 snow + 6/6 house + 6/6 space + 9/9 multi PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, red envelopes, object budgets and solo controls PASS
```

两项反例逐个运行原node scripts/run-levels.mjs（npm run levels的入口），均退出1；每次finally用保存的原字节恢复，SHA-256逐字节校验一致。

- 删除table-16的stamina:true：`levels: FAIL — table-16: replay missed checkpoint`。
- 把table-13的重录回放换回基线原回放：`levels: FAIL — table-13: replay missed checkpoint`。

删除flag的反例由轨迹检查拒绝；stamina覆盖率目前仍是原验收器的汇总行，按任务卡第5条留给C16/C17合并后的收口，不改验收器。

已运行只含本卡17关的npm run envelopes命令；原挑选脚本使用默认物理，最终红包按手酸模拟的实际手部轨迹重选，保留160px旗/出生/终点避让、360px红包间距及危险物/台面避让；分时段不足时从全程安全轨迹补选。最终三枚可达仍由原npm run levels检查。

仓库Playwright无头Chromium检查了table-13四人stamina=1&record=1及proto-09双人开发页，规则、摆锤和录制按钮正常，页面错误0；17张前后截图均用原Pixi Stage、1280×720全关视图。后厨/雪山仅在临时截图服务器中兼容JSON路由，源码未改。

本轮kitchen-29/30平台上沿重合56.52%，首屏83.93%，低于60%/85%上限。困难关的两段合作、各手柄单人投影、全部机关使用、危险物贴近路线、缆车座椅净空、永久落脚与人数摆法均由原验收器通过。
