# ho-C7 · 验证结果

2026-11-11，main 基线 `7ffd856`，Windows Git Bash、Node v22.23.4。`npm ci` 未改变锁文件。以下四条命令均退出 0；保留完整输出，包含 12 关验收表。

## npm test

退出码 0，完整 stdout/stderr：

```text
> @changle/hang-on@0.1.0 test
> vitest run


 RUN  v5.1.0 C:/Users/OWNER/Documents/Codex/2026-11-01/github-https-github-com-jiangchangle0724-del/work/changle-ca/games/hang-on


 Test Files  6 passed (6)
      Tests  45 passed (45)
   Start at  21:18:28
   Duration  4.45s (tests 61%, transform 28%, import 9%, worker 2%)
```

## npm run typecheck

退出码 0，完整 stdout/stderr：

```text
> @changle/hang-on@0.1.0 typecheck
> wrangler types > /dev/null && tsc --noEmit && tsc --noEmit -p tsconfig.server.json
```

## npm run ip-check

退出码 0，完整 stdout/stderr：

```text
> @changle/hang-on@0.1.0 ip-check
> node scripts/ip-check.mjs

ip-check: 0 处（查了 2709 个文件）
```

## npm run levels

退出码 0，完整 stdout/stderr：

```text
> @changle/hang-on@0.1.0 levels
> node scripts/run-levels.mjs

| Level | Seconds | P1 deaths | P2 deaths | P3 deaths | P4 deaths | All reached | Par ratio | Size | Checkpoint segments (s) | Cookie grabs / Candle bounces |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: | --- | --- | --- |
| table-01 | 111.50 | 0 | 0 | 0 | 0 | YES | 1.014 | 2560×720 | 45.78 / 38.03 / 27.68 | — / — |
| table-02 | 97.62 | 1 | 0 | 1 | 0 | YES | 0.976 | 2560×720 | 35.57 / 18.93 / 43.12 | 6 / — |
| table-03 | 85.38 | 0 | 0 | 0 | 2 | YES | 0.949 | 2560×720 | 28.90 / 15.83 / 40.65 | 3 / 3 |
| table-04 | 108.63 | 0 | 1 | 0 | 0 | YES | 0.988 | 2560×1440 | 39.50 / 44.02 / 25.12 | — / 10 |
| table-05 | 68.68 | 0 | 0 | 1 | 1 | YES | 0.981 | 2560×720 | 32.95 / 18.88 / 16.85 | — / — |
| table-06 | 76.32 | 0 | 0 | 0 | 0 | YES | 0.954 | 2560×720 | 28.27 / 26.23 / 21.82 | — / — |
| van-07 | 97.50 | 0 | 1 | 0 | 0 | YES | 0.975 | 2560×720 | 30.35 / 19.07 / 48.08 | — / — |
| van-08 | 102.48 | 0 | 0 | 0 | 0 | YES | 1.025 | 2560×1440 | 41.55 / 19.27 / 41.67 | — / 9 |
| van-09 | 95.32 | 0 | 1 | 0 | 0 | YES | 0.953 | 2560×720 | 57.42 / 16.37 / 21.53 | — / — |
| van-10 | 92.85 | 0 | 0 | 1 | 0 | YES | 1.032 | 2560×720 | 18.00 / 49.62 / 25.23 | — / — |
| van-11 | 78.26 | 1 | 2 | 2 | 2 | YES | 0.978 | 2560×720 | 28.62 / 33.95 / 15.69 | 4 / — |
| van-12 | 124.64 | 4 | 0 | 1 | 2 | YES | 1.039 | 3200×720 | 21.58 / 27.53 / 57.03 / 18.49 | 6 / 4 |
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4
levels: 12/12 PASS; geometry, materials, four pads/frame, par, deaths, mechanics, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```

## 坏数据反例

逐个在最终关卡副本上注入错误，运行同一个 `scripts/run-levels.mjs` 子进程；每例同时断言退出码为 1 和对应错误消息。每次用 finally 恢复原始字节，结束后重新运行全套 `npm run levels`，结果为上表。

```text
PASS rejects short level (exit 1): levels: FAIL — table-01: width must be 2400–3600
PASS rejects short climb (exit 1): levels: FAIL — table-04: climb height must be 1400–2200
PASS rejects missing screen flag (exit 1): levels: FAIL — table-01: screen 2 lacks checkpoint
PASS rejects unsupported flag (exit 1): levels: FAIL — table-01: checkpoint 0 lacks permanent footing within 80px for P1
PASS rejects early flag (exit 1): levels: FAIL — table-01: checkpoint segment outside 15–60s: 0.02/83.80/27.68
PASS rejects unused cookie (exit 1): levels: FAIL — table-02: cookie was bypassed (needs terrain grab point inside every cookie)
PASS rejects unused candle (exit 1): levels: FAIL — table-03: candle was bypassed (needs bounce from every candle)
PASS rejects 41 moving bodies (exit 1): levels: FAIL — table-01: moving objects exceed 40 (rope links + seesaws + crates)
PASS rejects 61 platforms (exit 1): levels: FAIL — table-01: platforms exceed 60
PASS rejects overlap (exit 1): levels: FAIL — table-01: platforms 0 and 4 overlap at spawn
PASS rejects changed C1 name (exit 1): levels: FAIL — table-01: C1 name changed
PASS rejects zero par (exit 1): levels: FAIL — par must be 1–3 minutes
PASS rejects missing controller (exit 1): levels: FAIL — table-01 frame 0: missing controller
negative cases: 13/13 PASS; every mutated file restored
```

反例分别覆盖尺寸、攀爬高度、每屏检查点、四人复活落点、15–60 秒分段、逐块饼干/逐根蜡烛真实使用、两类物体预算，并保留 C1 的重叠、身份、par 和四手柄坏输入检查。

## 截图与合作机制复核

`npm run levels -- --screenshots` 退出码 0；12 张截图重拍、逐张目检，均为 1280×720，四人出生位置、机关、终点可见。默认验收也重新检查所有 PNG 的签名和尺寸。`git diff --check` 通过。

第六关真实悬空链 0.35 秒；第十关释放向右上飞行的队友 4 次；两关各四份录制输入的单人投影均 0/4 通关。第十二关额外复核：3 次 rope grab，8 次 prop grab，最大浮筒倾角 0.1378977448 rad，27 次 ice grab，6 次 cookie grab，4 次 candle bounce，五种机制全部实际使用。

总复习 124.64 秒、全队死亡 7 次；所有关全队死亡总数均 ≤8，检查点段落范围 15.69–57.42 秒。每关最多 16 个会动物体、15 个初始矩形，低于 40 / 60 的上限。

变更范围仅为任务卡的三个路径，src、物理参数、package.json、锁文件和 C4 文件均未改动。没有合并、部署或执行 Cloudflare 发布命令。
