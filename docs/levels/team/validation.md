# C9 第二版验收 / Revision two validation

基线 main `6b00276a`；Node 22.23.4，Windows，npm 在 `games/hang-on` 执行。所有命令退出 0。完整 probe 为每摆法 200 次单人 / 100 次双人 / 每次 60 秒，不带 `--quick`，848 秒完成。probe 后只更换 team-02 五人版收尾输入及 par（160 → 140）；布局、质量和物理均未改变，因此探路结果仍对应提交的几何。
Main baseline `6b00276a`; Node 22.23.4. All commands exit zero. Full probe geometry is unchanged by the final input-only replay replacement and par adjustment.

验收器以 README 段号清单关联完整版 probe 结果；链条必须是不同的活人悬空相抓，根抓地形或绳子，连续至少 0.25 秒。推箱要求三人同时接触或抓住、水平位移至少 40 px 且向右移动，连续至少 0.25 秒。递人统计主动放手且队友向右上方有速度，同帧同一队友只计一次。每份回放都查多人段的证据，03、06 查不同段不同办法。全员无输入连续不超过 3 秒。
Evidence is checked within each declared blocked section, with rooted distinct-player chains, actual horizontal group pushes, and deduplicated deliberate releases.

## npm test

```text
> @changle/hang-on@0.1.0 test
> vitest run


 RUN  v5.1.0 C:/Users/OWNER/Documents/Codex/2026-11-01/github-https-github-com-jiangchangle0724-del/work/changle-c9/games/hang-on


 Test Files  14 passed (14)
      Tests  129 passed (129)
   Start at  20:01:59
   Duration  10.13s (tests 67%, transform 26%, import 5%, worker 2%)
```

## npm run typecheck

```text
> @changle/hang-on@0.1.0 typecheck
> wrangler types > /dev/null && tsc --noEmit && tsc --noEmit -p tsconfig.server.json
```

## npm run ip-check

```text
> @changle/hang-on@0.1.0 ip-check
> node scripts/ip-check.mjs

ip-check: 0 处（查了 3197 个文件）
```

## npm run levels

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

Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / weight+push (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
| team-01 | 4 | 101.55 | 3 / 3 / 4 / 4 | YES | 0.635 | 3000×1440 | 17.92 / 24.75 / 35.50 / 23.38 | 13.13 / 0.00 | 4 | 0/4 |
team-01.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, relay | 3.37 / 0.00 / 0.00 | 3 |
| 1 | no | chain | 0.42 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 9.33 / 0.00 / 0.00 | 1 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-01 | 5 | 84.83 | 2 / 2 / 4 / 2 / 2 | YES | 0.530 | 3000×1440 | 20.10 / 15.85 / 24.27 / 24.62 | 18.17 / 0.00 | 6 | 0/5 |
team-01.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, relay | 5.17 / 0.00 / 0.00 | 1 |
| 1 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 10.08 / 0.00 / 0.00 | 4 |
| 3 | no | relay | 0.00 / 0.00 / 0.00 | 1 |
| team-01 | 6 | 114.23 | 1 / 2 / 4 / 3 / 2 / 2 | YES | 0.714 | 3000×1440 | 29.43 / 17.75 / 24.63 / 42.41 | 6.37 / 0.00 | 6 | 0/6 |
team-01.p6 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, relay | 2.10 / 0.00 / 0.00 | 2 |
| 1 | no | relay | 0.00 / 0.00 / 0.00 | 1 |
| 2 | YES | chain, relay | 4.27 / 0.00 / 0.00 | 2 |
| 3 | no | relay | 0.00 / 0.00 / 0.00 | 1 |
| team-02 | 4 | 85.81 | 1 / 1 / 1 / 2 | YES | 0.613 | 2560×720 | 20.10 / 19.07 / 46.64 | 0.53 / 4.15 | 5 | 0/4 |
team-02.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, push, relay | 0.53 / 0.00 / 0.73 | 5 |
| 1 | YES | push | 0.00 / 0.00 / 0.60 | 0 |
| 2 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-02 | 5 | 70.48 | 4 / 5 / 5 / 3 / 4 | YES | 0.503 | 2560×720 | 16.53 / 25.93 / 28.01 | 2.42 / 3.50 | 5 | 0/5 |
team-02.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, push, relay | 0.43 / 0.00 / 1.08 | 3 |
| 1 | YES | chain, push, relay | 0.77 / 0.00 / 1.18 | 2 |
| 2 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-02 | 6 | 83.18 | 3 / 4 / 5 / 5 / 2 / 4 | YES | 0.594 | 2560×720 | 21.70 / 22.95 / 38.53 | 3.25 / 3.80 | 9 | 0/6 |
team-02.p6 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | push | 0.00 / 0.00 / 1.02 | 0 |
| 1 | YES | chain, push, relay | 1.73 / 0.00 / 0.67 | 8 |
| 2 | no | relay | 0.00 / 0.00 / 0.00 | 1 |
| team-03 | 4 | 120.44 | 0 / 1 / 2 / 1 | YES | 0.753 | 3600×1440 | 48.63 / 19.55 / 16.28 / 35.98 | 8.20 / 1.68 | 3 | 0/4 |
team-03.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 1 | YES | chain, relay | 8.20 / 0.00 / 0.00 | 3 |
| 2 | YES | push | 0.00 / 0.00 / 0.40 | 0 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-03 | 5 | 159.20 | 2 / 1 / 3 / 1 / 2 | YES | 0.995 | 3600×1440 | 38.15 / 39.17 / 44.97 / 36.92 | 5.93 / 2.98 | 3 | 0/5 |
team-03.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 1 | YES | chain, relay | 5.83 / 0.00 / 0.00 | 3 |
| 2 | YES | push | 0.00 / 0.00 / 0.78 | 0 |
| 3 | no | — | 0.10 / 0.00 / 0.00 | 0 |
| team-03 | 6 | 153.71 | 5 / 4 / 4 / 2 / 2 / 1 | YES | 0.961 | 3600×1440 | 16.52 / 53.85 / 52.00 / 31.34 | 27.13 / 11.88 | 5 | 0/6 |
team-03.p6 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 1 | YES | chain, relay | 26.87 / 0.00 / 0.00 | 4 |
| 2 | YES | push, relay | 0.00 / 0.00 / 1.45 | 1 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-04 | 4 | 138.43 | 2 / 1 / 1 / 3 | YES | 0.865 | 3600×2160 | 16.20 / 39.40 / 26.05 / 56.78 | 15.62 / 0.00 | 7 | 0/4 |
team-04.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 1 | YES | chain, relay | 6.75 / 0.00 / 0.00 | 3 |
| 2 | YES | chain, relay | 8.68 / 0.00 / 0.00 | 4 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-04 | 5 | 142.13 | 2 / 3 / 0 / 1 / 2 | YES | 0.888 | 3600×2160 | 17.15 / 32.20 / 33.03 / 59.75 | 13.43 / 0.00 | 8 | 0/5 |
team-04.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 1 | YES | chain, relay | 5.33 / 0.00 / 0.00 | 4 |
| 2 | YES | chain, relay | 8.10 / 0.00 / 0.00 | 4 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-04 | 6 | 131.40 | 1 / 1 / 2 / 2 / 2 / 2 | YES | 0.821 | 3600×2160 | 25.93 / 19.07 / 27.85 / 58.55 | 10.58 / 0.00 | 10 | 0/6 |
team-04.p6 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 1 | YES | chain, relay | 2.63 / 0.00 / 0.00 | 2 |
| 2 | YES | chain, relay | 7.95 / 0.00 / 0.00 | 8 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-05 | 4 | 72.63 | 2 / 4 / 2 / 4 | YES | 0.605 | 2560×720 | 16.52 / 37.45 / 18.67 | 0.60 / 2.35 | 13 | 0/4 |
team-05.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, push, relay | 0.28 / 0.00 / 0.52 | 3 |
| 1 | YES | push, relay | 0.00 / 0.00 / 0.60 | 10 |
| 2 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-05 | 5 | 118.63 | 3 / 0 / 1 / 1 / 2 | YES | 0.989 | 2560×720 | 46.32 / 20.13 / 52.18 | 0.00 / 4.57 | 1 | 0/5 |
team-05.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | push, relay | 0.00 / 0.00 / 0.70 | 1 |
| 1 | YES | push | 0.00 / 0.00 / 0.85 | 0 |
| 2 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-05 | 6 | 74.67 | 1 / 1 / 2 / 3 / 2 / 1 | YES | 0.622 | 2560×720 | 16.27 / 19.55 / 38.85 | 0.00 / 1.92 | 3 | 0/6 |
team-05.p6 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | push | 0.00 / 0.00 / 0.73 | 0 |
| 1 | YES | push | 0.00 / 0.00 / 0.40 | 0 |
| 2 | no | relay | 0.00 / 0.00 / 0.00 | 3 |
| team-06 | 4 | 127.03 | 2 / 2 / 5 / 2 | YES | 0.794 | 3000×1440 | 28.10 / 15.10 / 47.17 / 36.66 | 11.95 / 1.33 | 7 | 0/4 |
team-06.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, push | 0.78 / 0.00 / 0.57 | 0 |
| 1 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 10.28 / 0.00 / 0.05 | 7 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-06 | 5 | 109.91 | 1 / 2 / 1 / 0 / 2 | YES | 0.687 | 3000×1440 | 24.58 / 16.62 / 34.55 / 34.16 | 6.97 / 11.87 | 9 | 0/5 |
team-06.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | push, relay | 0.00 / 0.00 / 1.27 | 1 |
| 1 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 6.93 / 0.00 / 0.00 | 7 |
| 3 | no | relay | 0.00 / 0.00 / 0.00 | 1 |
| team-06 | 6 | 87.38 | 1 / 1 / 1 / 0 / 2 / 0 | YES | 0.546 | 3000×1440 | 21.87 / 15.32 / 30.35 / 19.85 | 7.68 / 4.15 | 2 | 0/6 |
team-06.p6 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | push | 0.00 / 0.00 / 0.98 | 0 |
| 1 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 7.68 / 0.00 / 0.00 | 2 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
levels: 12/12 base + 12/12 hard + 6/6 team PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```

## npm run probe（完整版 / full）

```text
> @changle/hang-on@0.1.0 probe
> node scripts/probe.mjs

乱按探路：1 个人 200 次、2 个人 100 次，每次 60 秒，8 个线程
| Level | 摆法 | 段 | 从 → 到 | 1 个人 | 2 个人 | 要大家 |
| --- | --- | --- | --- | --- | --- | :---: |
| team-01 | 4–6 人 | 1 | 出生点 (120,1256) → 检查点 1 (1020,506) | 0/200，最远 x=889 | 0/100，最远 x=992 | 是 |
| team-01 | 4–6 人 | 2 | 检查点 1 (1020,506) → 检查点 2 (1620,1256) | 过得去（第 2 次） | — | 否 |
| team-01 | 4–6 人 | 3 | 检查点 2 (1620,1256) → 检查点 3 (2610,506) | 0/200，最远 x=2318 | 0/100，最远 x=2342 | 是 |
| team-01 | 4–6 人 | 4 | 检查点 3 (2610,506) → 终点 (2880,450) | 过得去（第 1 次） | — | 否 |
| team-02 | 4 人 | 1 | 出生点 (120,536) → 检查点 1 (1060,536) | 0/200，最远 x=394 | 0/100，最远 x=397 | 是 |
| team-02 | 4 人 | 2 | 检查点 1 (1060,536) → 检查点 2 (1910,536) | 0/200，最远 x=1256 | 0/100，最远 x=1271 | 是 |
| team-02 | 4 人 | 3 | 检查点 2 (1910,536) → 终点 (2440,480) | 过得去（第 1 次） | — | 否 |
| team-02 | 5–6 人 | 1 | 出生点 (120,536) → 检查点 1 (1060,536) | 0/200，最远 x=394 | 0/100，最远 x=394 | 是 |
| team-02 | 5–6 人 | 2 | 检查点 1 (1060,536) → 检查点 2 (1910,536) | 0/200，最远 x=1262 | 0/100，最远 x=1257 | 是 |
| team-02 | 5–6 人 | 3 | 检查点 2 (1910,536) → 终点 (2440,480) | 过得去（第 1 次） | — | 否 |
| team-03 | 4 人 | 1 | 出生点 (120,1256) → 检查点 1 (1100,1256) | 过得去（第 1 次） | — | 否 |
| team-03 | 4 人 | 2 | 检查点 1 (1100,1256) → 检查点 2 (1870,506) | 0/200，最远 x=1739 | 0/100，最远 x=1773 | 是 |
| team-03 | 4 人 | 3 | 检查点 2 (1870,506) → 检查点 3 (3120,506) | 0/200，最远 x=2315 | 0/100，最远 x=2324 | 是 |
| team-03 | 4 人 | 4 | 检查点 3 (3120,506) → 终点 (3480,450) | 过得去（第 1 次） | — | 否 |
| team-03 | 5 人 | 1 | 出生点 (120,1256) → 检查点 1 (1100,1256) | 过得去（第 1 次） | — | 否 |
| team-03 | 5 人 | 2 | 检查点 1 (1100,1256) → 检查点 2 (1870,506) | 0/200，最远 x=1763 | 0/100，最远 x=1769 | 是 |
| team-03 | 5 人 | 3 | 检查点 2 (1870,506) → 检查点 3 (3120,506) | 0/200，最远 x=2314 | 0/100，最远 x=2319 | 是 |
| team-03 | 5 人 | 4 | 检查点 3 (3120,506) → 终点 (3480,450) | 过得去（第 1 次） | — | 否 |
| team-03 | 6 人 | 1 | 出生点 (120,1256) → 检查点 1 (1100,1256) | 过得去（第 1 次） | — | 否 |
| team-03 | 6 人 | 2 | 检查点 1 (1100,1256) → 检查点 2 (1870,506) | 0/200，最远 x=1742 | 0/100，最远 x=1862 | 是 |
| team-03 | 6 人 | 3 | 检查点 2 (1870,506) → 检查点 3 (3120,506) | 0/200，最远 x=2311 | 0/100，最远 x=2312 | 是 |
| team-03 | 6 人 | 4 | 检查点 3 (3120,506) → 终点 (3480,450) | 过得去（第 1 次） | — | 否 |
| team-04 | 4–6 人 | 1 | 出生点 (120,2036) → 检查点 1 (1230,2036) | 过得去（第 1 次） | — | 否 |
| team-04 | 4–6 人 | 2 | 检查点 1 (1230,2036) → 检查点 2 (2110,1286) | 0/200，最远 x=1964 | 0/100，最远 x=1969 | 是 |
| team-04 | 4–6 人 | 3 | 检查点 2 (2110,1286) → 检查点 3 (2900,536) | 0/200，最远 x=2741 | 0/100，最远 x=2740 | 是 |
| team-04 | 4–6 人 | 4 | 检查点 3 (2900,536) → 终点 (3480,480) | 过得去（第 1 次） | — | 否 |
| team-05 | 4 人 | 1 | 出生点 (120,406) → 检查点 1 (1000,576) | 0/200，最远 x=390 | 0/100，最远 x=397 | 是 |
| team-05 | 4 人 | 2 | 检查点 1 (1000,576) → 检查点 2 (1980,576) | 0/200，最远 x=1282 | 0/100，最远 x=1251 | 是 |
| team-05 | 4 人 | 3 | 检查点 2 (1980,576) → 终点 (2440,520) | 过得去（第 1 次） | — | 否 |
| team-05 | 5–6 人 | 1 | 出生点 (120,406) → 检查点 1 (1000,576) | 0/200，最远 x=382 | 0/100，最远 x=384 | 是 |
| team-05 | 5–6 人 | 2 | 检查点 1 (1000,576) → 检查点 2 (1980,576) | 0/200，最远 x=1246 | 0/100，最远 x=1243 | 是 |
| team-05 | 5–6 人 | 3 | 检查点 2 (1980,576) → 终点 (2440,520) | 过得去（第 1 次） | — | 否 |
| team-06 | 4 人 | 1 | 出生点 (120,1256) → 检查点 1 (1230,1256) | 0/200，最远 x=429 | 0/100，最远 x=431 | 是 |
| team-06 | 4 人 | 2 | 检查点 1 (1230,1256) → 检查点 2 (1700,1256) | 过得去（第 1 次） | — | 否 |
| team-06 | 4 人 | 3 | 检查点 2 (1700,1256) → 检查点 3 (2610,506) | 0/200，最远 x=2337 | 0/100，最远 x=2358 | 是 |
| team-06 | 4 人 | 4 | 检查点 3 (2610,506) → 终点 (2880,450) | 过得去（第 1 次） | — | 否 |
| team-06 | 5–6 人 | 1 | 出生点 (120,1256) → 检查点 1 (1230,1256) | 0/200，最远 x=425 | 0/100，最远 x=424 | 是 |
| team-06 | 5–6 人 | 2 | 检查点 1 (1230,1256) → 检查点 2 (1700,1256) | 过得去（第 1 次） | — | 否 |
| team-06 | 5–6 人 | 3 | 检查点 2 (1700,1256) → 检查点 3 (2610,506) | 0/200，最远 x=2319 | 0/100，最远 x=2364 | 是 |
| team-06 | 5–6 人 | 4 | 检查点 3 (2610,506) → 终点 (2880,450) | 过得去（第 1 次） | — | 否 |
probe: 6 个大关每关至少两段 1 个人和 2 个人乱按都过不去 PASS；848 秒
```

## 故意改坏的反例 / Deliberately broken fixtures

前三项调用当前验收器原函数，在异常捕获后检查报错，文件在 finally 中恢复；测试脚本因预期报错而成功，以下并非声称三个完整 CLI 都退出 1。探路反例直接调用原 probeLevels / teamProbeFailure，采样也是 200 / 100 / 60，按失败结果退出 1。没有修改 probe 或物理。
The first three fixtures call the original validator functions, assert their errors and restore bytes in finally. The probe fixture calls original probe APIs and exits one on failure.

### 1. 临时移走 team-01.p6.json / Remove six-player replay

```text
Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / weight+push (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
| team-01 | 4 | 101.55 | 3 / 3 / 4 / 4 | YES | 0.635 | 3000×1440 | 17.92 / 24.75 / 35.50 / 23.38 | 13.13 / 0.00 | 4 | 0/4 |
team-01.p4 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, relay | 3.37 / 0.00 / 0.00 | 3 |
| 1 | no | chain | 0.42 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 9.33 / 0.00 / 0.00 | 1 |
| 3 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| team-01 | 5 | 84.83 | 2 / 2 / 4 / 2 / 2 | YES | 0.530 | 3000×1440 | 20.10 / 15.85 / 24.27 / 24.62 | 18.17 / 0.00 | 6 | 0/5 |
team-01.p5 sections (zero-based):
| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |
| ---: | :---: | --- | --- | ---: |
| 0 | YES | chain, relay | 5.17 / 0.00 / 0.00 | 1 |
| 1 | no | — | 0.00 / 0.00 / 0.00 | 0 |
| 2 | YES | chain, relay | 10.08 / 0.00 / 0.00 | 4 |
| 3 | no | relay | 0.00 / 0.00 / 0.00 | 1 |
ERROR: team-01: missing 6-player team replay (levels/team/replays/team-01.p6.json)
```

### 2. 检查点 0 横移到 x=1278，第六人脚下不足 / Narrow sixth-player footing

```text
ERROR: team-01: checkpoint 0 lacks permanent footing within 80px for P6 with 4 players
```

### 3. team-01.p4 全部改为不抓、仅 ax=0.2 / Remove cooperative input

```text
Team levels (4–6 players)
| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / weight+push (s) | Relays | Solo cleared |
| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |
ERROR: team-01 (4 players): probe-blocked section 0 has no actual 3+ rooted chain, 3+ weight/push, or relay
```

### 4. team-01 内存副本移除热墙，完整探路 / Remove hot walls and probe

```text
乱按探路：1 个人 200 次、2 个人 100 次，每次 60 秒，4 个线程
| Level | 摆法 | 段 | 从 → 到 | 1 个人 | 2 个人 | 要大家 |
| --- | --- | --- | --- | --- | --- | :---: |
| team-01 | 4–6 人 | 1 | 出生点 (120,1256) → 检查点 1 (1020,506) | 过得去（第 1 次） | — | 否 |
| team-01 | 4–6 人 | 2 | 检查点 1 (1020,506) → 检查点 2 (1620,1256) | 过得去（第 2 次） | — | 否 |
| team-01 | 4–6 人 | 3 | 检查点 2 (1620,1256) → 检查点 3 (2610,506) | 过得去（第 30 次） | — | 否 |
| team-01 | 4–6 人 | 4 | 检查点 3 (2610,506) → 终点 (2880,450) | 过得去（第 1 次） | — | 否 |
probe: FAIL — team-01: 1 个人和 2 个人乱按都过不去的段只有 0 段；大关要至少两段，而且不能只有第一段
```
