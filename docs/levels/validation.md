# ho-C8 · 第二版验收

2026-11-13，PR #418，`codex/ho-c8-hard-levels`，已合入 main `c15877c`。只改新增难关、回放、截图与关卡文档；`src/**`、物理参数、`scripts/run-levels.mjs`、package 与锁文件和 main 一致。基础 12 关及 12 份回放逐字节保留。

12 个四人回放、4 个人数摆法双人回放全部通过；112 条测试通过（包括六人出生与所有检查点复活落脚），没有 it.fails；typecheck 通过，ip-check 0 处。四人段长 15.92–54.72 秒，全部难关每关至少两段真实合作，单手柄投影全部 0/4。截图使用原脚本重拍 12 张 1280×720 全关图，基础截图恢复原字节。

## 两处合作与独立布局

S0 为出生到第一检查点，之后依检查点事件顺序编号。以下统计来自最终关卡原模拟回放，与原验收器相同的挂链、释放速度规则；位置列指出第一处和第二处合作发生在哪里。

| 关卡 | 两处实际合作位置（x 范围，px） | 各段挂链秒数 S0… | 各段抛接次数 S0… | 合作段数 |
| --- | --- | --- | --- | ---: |
| table-13 | 起段抛接（420–600）＋高碗抛接（1560–1740） | 0.00 / 0.00 / 0.00 / 0.00 | 2 / 4 / 2 / 0 | 3 |
| table-14 | 下降动盘（500–1000）＋向上抛接（1400–1580） | 14.78 / 0.00 / 0.00 | 0 / 2 / 2 | 3 |
| table-15 | 红油沟抛接（600–820）＋中段转筷接应（1400–1700） | 0.00 / 4.92 / 0.02 | 2 / 3 / 0 | 2 |
| table-16 | 首段转筷（520–820）＋中段高差抛接（1280–1520） | 5.47 / 0.00 / 0.00 | 1 / 2 / 2 | 3 |
| table-17 | 下层抛接（400–600）＋上升动盘（1360–1880） | 0.00 / 11.87 / 0.02 | 2 / 2 / 1 | 3 |
| table-18 | 折线动盘（400–900）＋中段转筷（1320–1660） | 14.35 / 4.83 / 0.20 / 0.00 | 0 / 0 / 1 / 0 | 3 |
| van-19 | 低码头抛接（360–560）＋转梁接应（1280–1600） | 0.00 / 5.43 / 0.00 | 2 / 2 / 0 | 2 |
| van-20 | 斜行摆渡（360–880）＋反转钢梁（1400–1720） | 10.52 / 0.38 / 0.00 | 0 / 0 / 1 | 3 |
| van-21 | L 形平台（480–1000）＋两层高岸抛接（1400–1640） | 13.52 / 0.00 / 0.00 | 0 / 2 / 2 | 3 |
| van-22 | 港底转梁（320–700）＋高层升降台（1360–1840） | 0.05 / 17.10 / 0.00 | 1 / 0 / 0 | 2 |
| van-23 | 夜市抛接（660–860）＋长烤架斜台（1380–1900） | 0.00 / 9.77 / 0.00 | 2 / 2 / 0 | 2 |
| van-24 | 首段转梁（280–640）＋两层岸抛接（1280–1500） | 3.77 / 0.00 / 9.40 / 1.63 | 0 / 2 / 2 / 0 | 4 |

| 关卡 | 整关最接近 | 重合率 | 第一屏最接近 | 重合率 |
| --- | --- | ---: | --- | ---: |
| table-13 | van-10 | 16.2% | table-16 | 18.3% |
| table-14 | van-21 | 25.5% | van-19 | 23.3% |
| table-15 | van-23 | 36.3% | van-23 | 44.9% |
| table-16 | van-10 | 23.3% | table-13 | 18.3% |
| table-17 | table-04 | 18.1% | van-22 | 3.4% |
| table-18 | van-20 | 24.4% | table-13 | 0.0% |
| van-19 | table-14 | 20.7% | table-14 | 23.3% |
| van-20 | van-23 | 26.4% | van-23 | 20.4% |
| van-21 | van-23 | 31.4% | table-15 | 28.8% |
| van-22 | table-17 | 17.6% | table-17 | 3.4% |
| van-23 | table-15 | 36.3% | table-15 | 44.9% |
| van-24 | table-18 | 16.9% | van-20 | 16.7% |

整关与任意基础/难关的重合率均 ≤36.3%，第一屏与其他难关均 ≤44.9%，低于 #422 的 60% / 85% 上限。12 份四人输入 frames 的 SHA-256 均不同。布局、检查点、预算与按人数变化见 [README](README.md)。

## 新规则反例

每个反例都实际执行未修改的 `node scripts/run-levels.mjs`，退出 1 后在 finally 中恢复关卡与回放的原始字节；恢复后再次运行完整验收与截图。

1. **照搬布局**：临时把 table-13 的最终几何、机关及可过关回放复制给 table-15，只保留后者的 id、名字、teaches 和回放路径。单关能过，但两关平台重合 100%，原脚本拒绝。
2. **只在一段合作**：临时把 table-13 和回放换回第一版提交 `59f9de2` 的原始文件。72.72 秒通关、挂链 0.68 秒，但只在一个检查点段落发生合作，原脚本拒绝。

## 布局照搬：完整输出

```text
node scripts/run-levels.mjs
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
| table-13 | 4 | 88.25 | 1 / 2 / 1 / 0 | YES | 0.588 | 3000×720 | 16.08 / 27.03 / 24.43 / 20.70 | — / — | 18.9,0.0 |
| table-14 | 4 | 125.29 | 1 / 3 / 2 / 0 | YES | 0.696 | 2560×720 | 42.33 / 36.98 / 45.98 | — / — | 31.6,0.0,26.5 |
| table-14 | 2 | 73.34 | 2 / 3 | YES | 0.407 | 2560×720 | 44.03 / 9.23 / 20.08 | — / — | 18.8,0.0,11.4 |
| table-15 | 4 | 88.25 | 1 / 2 / 1 / 0 | YES | 0.588 | 3000×720 | 16.08 / 27.03 / 24.43 / 20.70 | — / — | 18.9,0.0 |
| table-16 | 4 | 69.45 | 1 / 1 / 2 / 0 | YES | 0.579 | 2560×720 | 21.80 / 19.57 / 28.08 | — / — | 29.4,8.8,0.0 |
| table-16 | 2 | 113.56 | 1 / 0 | YES | 0.946 | 2560×720 | 51.05 / 27.48 / 35.03 | — / — | 13.8,5.3,0.0 |
| table-17 | 4 | 107.23 | 2 / 1 / 10 / 0 | YES | 0.596 | 2560×1440 | 21.68 / 49.32 / 36.23 | — / — | 14.2,0.0,24.1 |
| table-18 | 4 | 155.33 | 8 / 4 / 11 / 6 | YES | 0.863 | 3000×720 | 53.75 / 16.67 / 54.72 / 30.20 | — / — | 17.6,26.1,0.0,15.1,0.0 |
| van-19 | 4 | 95.06 | 1 / 1 / 0 / 0 | YES | 0.634 | 2560×720 | 21.38 / 33.73 / 39.94 | — / — | 19.8,0.0,7.5,0.0 |
| van-20 | 4 | 121.68 | 1 / 3 / 7 / 5 | YES | 0.676 | 2560×720 | 43.32 / 38.12 / 40.25 | — / — | 30.1,0.0,10.7 |
| van-20 | 2 | 124.98 | 14 / 7 | YES | 0.694 | 2560×720 | 103.12 / 16.07 / 5.80 | — / — | 24.9,0.0,4.0 |
| van-21 | 4 | 100.24 | 2 / 3 / 13 / 3 | YES | 0.668 | 2560×720 | 47.55 / 23.68 / 29.01 | — / — | 14.5,0.0,13.6,0.0 |
| van-22 | 4 | 134.66 | 2 / 3 / 3 / 5 | YES | 0.748 | 2560×1440 | 38.80 / 52.72 / 43.14 | — / — | 18.2,0.0,25.0,21.5 |
| van-22 | 2 | 182.15 | 15 / 5 | YES | 1.012 | 2560×1440 | 52.00 / 115.45 / 14.70 | — / — | 17.4,0.0,22.9,7.4 |
| van-23 | 4 | 108.20 | 2 / 1 / 3 / 3 | YES | 0.721 | 2560×720 | 31.80 / 37.53 / 38.87 | — / — | 13.9,0.0,30.3,0.0 |
| van-24 | 4 | 149.01 | 3 / 2 / 2 / 1 | YES | 0.828 | 3000×720 | 40.42 / 51.25 / 31.23 / 26.11 | — / — | 13.5,0.0,52.5,0.0 |
levels: FAIL — table-13 and table-15 share 100% of their platforms; every hard level needs its own layout (at most 60%)

exit=1
```

## 只在一段合作：完整输出

```text
node scripts/run-levels.mjs
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
| table-13 | 4 | 72.72 | 2 / 1 / 5 / 4 | YES | 0.808 | 2560×720 | 27.72 / 29.58 / 15.42 | — / — | 13.7 |
levels: FAIL — table-13: teamwork in only 1 checkpoint segment(s); a hard level needs it in at least two

exit=1
```

## npm test：完整输出，退出 0

```text
> @changle/hang-on@0.1.0 test
> vitest run


 RUN  v5.1.0 C:/Users/OWNER/Documents/Codex/2026-11-01/github-https-github-com-jiangchangle0724-del/work/changle-ca/games/hang-on


 Test Files  12 passed (12)
      Tests  112 passed (112)
   Start at  07:53:07
   Duration  7.79s (tests 82%, import 9%, transform 8%, worker 1%)
```

## npm run typecheck：完整输出，退出 0

```text
> @changle/hang-on@0.1.0 typecheck
> wrangler types > /dev/null && tsc --noEmit && tsc --noEmit -p tsconfig.server.json
```

## npm run ip-check：完整输出，退出 0

```text
> @changle/hang-on@0.1.0 ip-check
> node scripts/ip-check.mjs

ip-check: 0 处（查了 3013 个文件）
```

## npm run levels：完整输出，退出 0

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
| table-13 | 4 | 88.25 | 1 / 2 / 1 / 0 | YES | 0.588 | 3000×720 | 16.08 / 27.03 / 24.43 / 20.70 | — / — | 18.9,0.0 |
| table-14 | 4 | 125.29 | 1 / 3 / 2 / 0 | YES | 0.696 | 2560×720 | 42.33 / 36.98 / 45.98 | — / — | 31.6,0.0,26.5 |
| table-14 | 2 | 73.34 | 2 / 3 | YES | 0.407 | 2560×720 | 44.03 / 9.23 / 20.08 | — / — | 18.8,0.0,11.4 |
| table-15 | 4 | 89.55 | 3 / 4 / 2 / 2 | YES | 0.597 | 2560×720 | 15.92 / 21.67 / 51.97 | — / — | 7.9,0.0,25.5 |
| table-16 | 4 | 69.45 | 1 / 1 / 2 / 0 | YES | 0.579 | 2560×720 | 21.80 / 19.57 / 28.08 | — / — | 29.4,8.8,0.0 |
| table-16 | 2 | 113.56 | 1 / 0 | YES | 0.946 | 2560×720 | 51.05 / 27.48 / 35.03 | — / — | 13.8,5.3,0.0 |
| table-17 | 4 | 107.23 | 2 / 1 / 10 / 0 | YES | 0.596 | 2560×1440 | 21.68 / 49.32 / 36.23 | — / — | 14.2,0.0,24.1 |
| table-18 | 4 | 155.33 | 8 / 4 / 11 / 6 | YES | 0.863 | 3000×720 | 53.75 / 16.67 / 54.72 / 30.20 | — / — | 17.6,26.1,0.0,15.1,0.0 |
| van-19 | 4 | 95.06 | 1 / 1 / 0 / 0 | YES | 0.634 | 2560×720 | 21.38 / 33.73 / 39.94 | — / — | 19.8,0.0,7.5,0.0 |
| van-20 | 4 | 121.68 | 1 / 3 / 7 / 5 | YES | 0.676 | 2560×720 | 43.32 / 38.12 / 40.25 | — / — | 30.1,0.0,10.7 |
| van-20 | 2 | 124.98 | 14 / 7 | YES | 0.694 | 2560×720 | 103.12 / 16.07 / 5.80 | — / — | 24.9,0.0,4.0 |
| van-21 | 4 | 100.24 | 2 / 3 / 13 / 3 | YES | 0.668 | 2560×720 | 47.55 / 23.68 / 29.01 | — / — | 14.5,0.0,13.6,0.0 |
| van-22 | 4 | 134.66 | 2 / 3 / 3 / 5 | YES | 0.748 | 2560×1440 | 38.80 / 52.72 / 43.14 | — / — | 18.2,0.0,25.0,21.5 |
| van-22 | 2 | 182.15 | 15 / 5 | YES | 1.012 | 2560×1440 | 52.00 / 115.45 / 14.70 | — / — | 17.4,0.0,22.9,7.4 |
| van-23 | 4 | 108.20 | 2 / 1 / 3 / 3 | YES | 0.721 | 2560×720 | 31.80 / 37.53 / 38.87 | — / — | 13.9,0.0,30.3,0.0 |
| van-24 | 4 | 149.01 | 3 / 2 / 2 / 1 | YES | 0.828 | 3000×720 | 40.42 / 51.25 / 31.23 / 26.11 | — / — | 13.5,0.0,52.5,0.0 |
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4
table-13: solo projections 0/4 cleared; chain=0.00s, throws=8
table-14: solo projections 0/4 cleared; chain=14.78s, throws=4
table-15: solo projections 0/4 cleared; chain=4.93s, throws=5
table-16: solo projections 0/4 cleared; chain=5.47s, throws=5
table-17: solo projections 0/4 cleared; chain=11.88s, throws=5
table-18: solo projections 0/4 cleared; chain=19.38s, throws=1
van-19: solo projections 0/4 cleared; chain=5.43s, throws=4
van-20: solo projections 0/4 cleared; chain=10.90s, throws=1
van-21: solo projections 0/4 cleared; chain=13.52s, throws=4
van-22: solo projections 0/4 cleared; chain=17.15s, throws=1
van-23: solo projections 0/4 cleared; chain=9.77s, throws=4
van-24: solo projections 0/4 cleared; chain=14.80s, throws=4
levels: 12/12 base + 12/12 hard PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```

## 恢复后截图复跑（退出 0）

使用原 npm run levels -- --screenshots。下列为截图行与最终结论；上面的全部结果表和单人投影行与这次复跑逐行相同。基础 12 张 PNG 随后恢复原字节。

```text
Screenshot: docs/levels/table-01.png (1280×720, spawn)
Screenshot: docs/levels/table-02.png (1280×720, spawn)
Screenshot: docs/levels/table-03.png (1280×720, spawn)
Screenshot: docs/levels/table-04.png (1280×720, spawn)
Screenshot: docs/levels/table-05.png (1280×720, spawn)
Screenshot: docs/levels/table-06.png (1280×720, spawn)
Screenshot: docs/levels/van-07.png (1280×720, spawn)
Screenshot: docs/levels/van-08.png (1280×720, spawn)
Screenshot: docs/levels/van-09.png (1280×720, spawn)
Screenshot: docs/levels/van-10.png (1280×720, spawn)
Screenshot: docs/levels/van-11.png (1280×720, spawn)
Screenshot: docs/levels/van-12.png (1280×720, spawn)
Screenshot: docs/levels/table-13.png (1280×720, spawn)
Screenshot: docs/levels/table-14.png (1280×720, spawn)
Screenshot: docs/levels/table-15.png (1280×720, spawn)
Screenshot: docs/levels/table-16.png (1280×720, spawn)
Screenshot: docs/levels/table-17.png (1280×720, spawn)
Screenshot: docs/levels/table-18.png (1280×720, spawn)
Screenshot: docs/levels/van-19.png (1280×720, spawn)
Screenshot: docs/levels/van-20.png (1280×720, spawn)
Screenshot: docs/levels/van-21.png (1280×720, spawn)
Screenshot: docs/levels/van-22.png (1280×720, spawn)
Screenshot: docs/levels/van-23.png (1280×720, spawn)
Screenshot: docs/levels/van-24.png (1280×720, spawn)
levels: 12/12 base + 12/12 hard PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```
