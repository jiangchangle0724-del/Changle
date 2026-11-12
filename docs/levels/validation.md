# ho-C7b · 新复活规则下的回放验收

2026-11-11，Windows Git Bash、Node v22.23.4。依赖以 `npm ci` 安装，锁文件未变。四条 npm 命令全部退出 0；70 项测试全部通过，没有 it.fails。新回放通过原 C7 验收器的 12/12 检查，无需调整 par。

## 五关重录结果

| 关卡 | 新用时（秒） | P1/P2/P3/P4 死亡 | 全队死亡 | 复活次数 | 挪位次数 | P1/P2/P3/P4 挪位 |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| table-02 | 77.38 | 2/2/0/0 | 4 | 4 | 1 | 0/1/0/0 |
| table-04 | 111.83 | 0/1/0/1 | 2 | 2 | 1 | 0/1/0/0 |
| table-05 | 70.88 | 0/0/1/1 | 2 | 2 | 1 | 0/0/0/1 |
| van-09 | 158.02 | 0/1/0/0 | 1 | 1 | 1 | 0/1/0/0 |
| van-11 | 84.24 | 1/0/1/1 | 3 | 3 | 3 | 1/0/1/1 |

## 录制与复活证据

沿用 C7 的离线真实模拟录制：每帧四个手柄输入、60 Hz，物理固定 120 Hz。按新规则实际算出的复活点继续抓、走、荡；安全的已有输入段保留操作节奏，受到挪位影响的后续段重新按当前身体/手的位置操作，最终保存为完整展开帧，不在验收中运行控制器。没有传送、速度注入、召唤或物理覆盖。

挪位统计来自**独立重放最终 JSON**：在临时无头模拟中只观察原 respawnPoint 的入参和返回值，照常调用原方法并原样返回。默认点按当时的检查点 cp.x + id×30（无检查点时 spawn.x + id×44）计算，实际点与默认点不同计一次；不把初次出生或正常落地算作挪位。总计 12 次自然复活，其中 7 次挪位。

| 关卡 | 玩家 | 模拟时刻（秒） | 默认位置 | 实际复活位置 | 水平挪位（px） |
| --- | --- | ---: | --- | --- | ---: |
| table-02 | P2 | 40.467 | (1270, 536) | (1294, 536) | +24 |
| table-04 | P2 | 45.800 | (1240, 936) | (1160, 936) | -80 |
| table-05 | P4 | 54.042 | (2120, 496) | (2144, 496) | +24 |
| van-09 | P2 | 23.083 | (144, 536) | (64, 536) | -80 |
| van-11 | P1 | 33.308 | (1240, 536) | (1216, 536) | -24 |
| van-11 | P3 | 37.608 | (1300, 536) | (1252, 536) | -48 |
| van-11 | P4 | 41.425 | (1330, 536) | (1282, 536) | -48 |

## 范围与未改回放核对

本分支从 `origin/claude/ho-respawn-spacing` 的 `150bd8571f929eebc7e66453846555504cc75522` 建立，main 核对基线为 `3c812a464483d29fabcec7112a1407e494d77758`。Claude 已有的复活点规则、三条不叠人测试和去除预期失败的改动原样包含在 PR 中，本次不改动它们。

本次只改五个指定回放和本验证文档，共六个文件。12 个关卡 JSON（包括 par）全部未变，src、scripts、package.json、锁文件和截图均未改动；C7 的尺寸、检查点段落、逐块饼干、逐根蜡烛、物体预算、死亡、par、成链/抛接和单人投影检查全部保留。

七份回放的 Git blob 和工作文件均与 origin/main **逐字节相同**；限定这七份路径的 `git diff origin/main -- ...` 为空，SHA-256 核对如下。

| 回放 | SHA-256（与 origin/main 相同） | 字节数 |
| --- | --- | ---: |
| table-01 | `3cb12f23729d43589ddec5c5ce26f3faef07b983c87f33bb6c1e72a5f2342f72` | 1619372 |
| table-03 | `aed14a31d68e002025521b2a7ce77cbcb330b7d3ed41823b6a0751b76a926ea0` | 1255383 |
| table-06 | `8ef40b5888cd740ae459255555597e1593a89d87ab1dd5084b73a35e9c8b6fa4` | 1110369 |
| van-07 | `6c6d3a2bd71755278d1d79fdff011c0e93c725e2faa29c12f98c3178e6869a0f` | 1422769 |
| van-08 | `18bca3899e0e906a8abc9bddd92ec93784c738ee7539a68bdd7d11bae84bbc7b` | 1505532 |
| van-10 | `ac3c9e82d1ef773a294d563a66f8639a49695ef8b0eac909d681d8b986832769` | 1350826 |
| van-12 | `1224a1e8b748b4e4779da4234e93bf5665ad28975308d47b3405881acec99016` | 1828191 |

## npm test

退出码 0，完整 stdout/stderr：

```text
> @changle/hang-on@0.1.0 test
> vitest run


 RUN  v5.1.0 C:/Users/OWNER/Documents/Codex/2026-11-01/github-https-github-com-jiangchangle0724-del/work/changle-ca/games/hang-on


 Test Files  9 passed (9)
      Tests  70 passed (70)
   Start at  22:27:35
   Duration  2.47s (tests 70%, transform 19%, import 10%, worker 1%)
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

ip-check: 0 处（查了 2746 个文件）
```

## npm run levels

退出码 0，完整 stdout/stderr：

```text
> @changle/hang-on@0.1.0 levels
> node scripts/run-levels.mjs

| Level | Seconds | P1 deaths | P2 deaths | P3 deaths | P4 deaths | All reached | Par ratio | Size | Checkpoint segments (s) | Cookie grabs / Candle bounces |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: | --- | --- | --- |
| table-01 | 111.50 | 0 | 0 | 0 | 0 | YES | 1.014 | 2560×720 | 45.78 / 38.03 / 27.68 | — / — |
| table-02 | 77.38 | 2 | 2 | 0 | 0 | YES | 0.774 | 2560×720 | 35.37 / 20.62 / 21.40 | 3 / — |
| table-03 | 85.38 | 0 | 0 | 0 | 2 | YES | 0.949 | 2560×720 | 28.90 / 15.83 / 40.65 | 3 / 3 |
| table-04 | 111.83 | 0 | 1 | 0 | 1 | YES | 1.017 | 2560×1440 | 39.50 / 30.52 / 41.82 | — / 12 |
| table-05 | 70.88 | 0 | 0 | 1 | 1 | YES | 1.013 | 2560×720 | 32.95 / 18.88 / 19.05 | — / — |
| table-06 | 76.32 | 0 | 0 | 0 | 0 | YES | 0.954 | 2560×720 | 28.27 / 26.23 / 21.82 | — / — |
| van-07 | 97.50 | 0 | 1 | 0 | 0 | YES | 0.975 | 2560×720 | 30.35 / 19.07 / 48.08 | — / — |
| van-08 | 102.48 | 0 | 0 | 0 | 0 | YES | 1.025 | 2560×1440 | 41.55 / 19.27 / 41.67 | — / 9 |
| van-09 | 158.02 | 0 | 1 | 0 | 0 | YES | 1.580 | 2560×720 | 53.22 / 50.77 / 54.03 | — / — |
| van-10 | 92.85 | 0 | 0 | 1 | 0 | YES | 1.032 | 2560×720 | 18.00 / 49.62 / 25.23 | — / — |
| van-11 | 84.24 | 1 | 0 | 1 | 1 | YES | 1.053 | 2560×720 | 28.67 / 36.95 / 18.63 | 4 / — |
| van-12 | 124.64 | 4 | 0 | 1 | 2 | YES | 1.039 | 3200×720 | 21.58 / 27.53 / 57.03 / 18.49 | 6 / 4 |
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4
levels: 12/12 PASS; geometry, materials, four pads/frame, par, deaths, mechanics, sizes, checkpoint segments, cookies/candles, object budgets and solo controls PASS
```

## 补充复核

`git diff --check` 通过。全部检查点段落仍在 15–60 秒；四块饼干和四根蜡烛均有实际抓取/弹跳。第六关悬空链 0.35 秒，第十关抛接 4 次，两关单人投影仍为 0/4。截图保持 C7 的版本，没有重拍；没有合并、部署或执行 Cloudflare 发布命令。
