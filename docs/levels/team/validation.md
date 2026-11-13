# ho-C9 · 完整验收输出

Node 22.23.4；独立 C9 worktree。以下四项均退出码 0，完整 stdout/stderr 如下。

## npm test

退出码 0。

```text

> @changle/hang-on@0.1.0 test
> vitest run


 RUN  v5.1.0 C:/Users/OWNER/Documents/Codex/2026-11-01/github-https-github-com-jiangchangle0724-del/work/changle-c9/games/hang-on


 Test Files  12 passed (12)
      Tests  112 passed (112)
   Start at  21:17:32
   Duration  4.81s (tests 87%, transform 6%, import 6%, worker 1%)
```

## npm run typecheck

退出码 0。

```text

> @changle/hang-on@0.1.0 typecheck
> wrangler types > /dev/null && tsc --noEmit && tsc --noEmit -p tsconfig.server.json
```

## npm run ip-check

退出码 0。

```text

> @changle/hang-on@0.1.0 ip-check
> node scripts/ip-check.mjs

ip-check: 0 处（查了 2983 个文件）
```

## npm run levels

退出码 0。

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
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4

Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / counterweight (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
| team-01 | 4 | 98.69 | 0 / 0 / 1 / 2 | YES | 0.822 | 2560×720 | 32.78 / 29.82 / 36.09 | 0.00 / 20.92 | 14 | 0/4 |
| team-01 | 5 | 70.17 | 2 / 0 / 1 / 1 / 0 | YES | 0.585 | 2560×720 | 15.65 / 34.07 / 20.45 | 0.00 / 13.02 | 4 | 0/5 |
| team-01 | 6 | 104.21 | 3 / 1 / 1 / 3 / 1 / 0 | YES | 0.868 | 2560×720 | 21.85 / 41.70 / 40.66 | 0.00 / 28.33 | 6 | 0/6 |
| team-02 | 4 | 101.56 | 2 / 2 / 1 / 0 | YES | 0.846 | 2880×720 | 20.37 / 33.88 / 30.12 / 17.19 | 0.00 / 9.38 | 0 | 0/4 |
| team-02 | 5 | 116.26 | 0 / 2 / 1 / 1 / 1 | YES | 0.969 | 2880×720 | 16.93 / 50.17 / 24.32 / 24.84 | 0.00 / 22.52 | 1 | 0/5 |
| team-02 | 6 | 112.13 | 1 / 2 / 2 / 3 / 0 / 2 | YES | 0.934 | 2880×720 | 21.02 / 32.00 / 30.62 / 28.49 | 0.03 / 20.27 | 3 | 0/6 |
| team-03 | 4 | 78.88 | 0 / 0 / 0 / 1 | YES | 0.657 | 3200×720 | 16.07 / 25.62 / 21.80 / 15.40 | 0.00 / 5.40 | 1 | 0/4 |
| team-03 | 5 | 141.87 | 3 / 4 / 2 / 3 / 3 | YES | 1.182 | 3200×720 | 19.12 / 48.13 / 54.20 / 20.42 | 0.00 / 21.32 | 1 | 0/5 |
| team-03 | 6 | 110.38 | 1 / 2 / 4 / 0 / 1 / 2 | YES | 0.920 | 3200×720 | 21.97 / 48.35 / 19.73 / 20.33 | 0.00 / 34.98 | 1 | 0/6 |
| team-04 | 4 | 108.38 | 0 / 0 / 1 / 1 | YES | 0.903 | 2560×720 | 57.12 / 30.92 / 20.35 | 0.00 / 40.13 | 36 | 0/4 |
| team-04 | 5 | 85.40 | 2 / 1 / 1 / 1 / 1 | YES | 0.712 | 2560×720 | 15.08 / 45.95 / 24.37 | 0.00 / 19.48 | 22 | 0/5 |
| team-04 | 6 | 87.11 | 1 / 0 / 1 / 1 / 1 / 2 | YES | 0.726 | 2560×720 | 17.58 / 41.63 / 27.89 | 0.00 / 15.75 | 7 | 0/6 |
| team-05 | 4 | 77.22 | 3 / 3 / 3 / 3 | YES | 0.643 | 2880×720 | 18.82 / 21.67 / 20.42 / 16.32 | 0.00 / 9.25 | 4 | 0/4 |
| team-05 | 5 | 104.33 | 1 / 1 / 0 / 0 / 2 | YES | 0.869 | 2880×720 | 18.72 / 47.20 / 18.02 / 20.39 | 0.00 / 31.32 | 2 | 0/5 |
| team-05 | 6 | 170.38 | 3 / 3 / 2 / 3 / 6 / 3 | YES | 1.420 | 2880×720 | 25.80 / 56.00 / 45.83 / 42.74 | 0.00 / 43.83 | 30 | 0/6 |
| team-06 | 4 | 98.45 | 2 / 3 / 1 / 0 | YES | 0.820 | 3200×720 | 35.75 / 19.87 / 21.85 / 20.98 | 0.00 / 20.75 | 3 | 0/4 |
| team-06 | 5 | 81.38 | 2 / 3 / 0 / 1 / 3 | YES | 0.678 | 3200×720 | 16.17 / 31.07 / 15.57 / 18.58 | 0.00 / 4.08 | 2 | 0/5 |
| team-06 | 6 | 146.34 | 1 / 0 / 0 / 0 / 1 / 1 | YES | 1.220 | 3200×720 | 15.53 / 45.67 / 31.00 / 54.14 | 0.00 / 28.73 | 19 | 0/6 |
levels: 12/12 base + 0/12 hard + 6/6 team PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```

## 三个坏数据反例

逐项只改坏一个文件，通过原 `node scripts/run-levels.mjs` 完整运行相同验收器；每项退出码 1，在 finally 中按原字节恢复。三项结束后，上方 `npm run levels` 再次完整通过。

### 删除 team-01.p6.json

退出码 1，完整输出：

```text
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
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4

Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / counterweight (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
| team-01 | 4 | 98.69 | 0 / 0 / 1 / 2 | YES | 0.822 | 2560×720 | 32.78 / 29.82 / 36.09 | 0.00 / 20.92 | 14 | 0/4 |
| team-01 | 5 | 70.17 | 2 / 0 / 1 / 1 / 0 | YES | 0.585 | 2560×720 | 15.65 / 34.07 / 20.45 | 0.00 / 13.02 | 4 | 0/5 |
levels: FAIL — team-01: missing 6-player team replay (levels/team/replays/team-01.p6.json)
```

### 把 team-01 最后检查点 x 移到 2348：P1–P5 有落脚，P6 超出台沿

退出码 1，完整输出：

```text
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
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4

Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / counterweight (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
levels: FAIL — team-01: checkpoint 1 lacks permanent footing within 80px for P6 with 4 players
```

### team-01.p4 的所有手柄 gl/gr 置 false，保留 seq/t/轴值和帧数

退出码 1，完整输出：

```text
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
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4

Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / counterweight (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
levels: FAIL — team-01 (4 players): needs three airborne players in a rooted chain for 0.25s or three players using a seesaw tilted over 0.05 for 0.25s
```
