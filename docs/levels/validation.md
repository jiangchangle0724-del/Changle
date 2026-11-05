# ho-C1 · 验证结果

以下为最新 main（已含 A2）上 Node 22.23.4 下命令输出的结果部分，所有命令退出码为 0。Windows 使用 Git Bash 执行 npm 脚本，以兼容 main 的 `/dev/null` 重定向。`npm ci` 没有改变锁文件。

```text
Node v22.23.4

npm ci
added 71 packages, and audited 72 packages
found 0 vulnerabilities

npm test
Test Files  4 passed (4)
Tests       30 passed (30)

npm run typecheck
tsc --noEmit
(exit 0)

npm run ip-check
ip-check: 0 处（查了 1582 个文件）

npm run levels
| Level | Seconds | P1 deaths | P2 deaths | P3 deaths | P4 deaths | All reached | Par ratio |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: |
| table-01 | 42.86 | 0 | 0 | 0 | 0 | YES | 0.714 |
| table-02 | 31.97 | 0 | 0 | 0 | 0 | YES | 0.533 |
| table-03 | 30.72 | 0 | 1 | 1 | 2 | YES | 0.512 |
| table-04 | 30.88 | 0 | 0 | 0 | 0 | YES | 0.515 |
| table-05 | 36.44 | 0 | 0 | 0 | 0 | YES | 0.607 |
| table-06 | 77.79 | 0 | 0 | 0 | 0 | YES | 0.864 |
| van-07 | 30.88 | 0 | 0 | 0 | 0 | YES | 0.515 |
| van-08 | 43.00 | 0 | 0 | 0 | 0 | YES | 0.717 |
| van-09 | 35.88 | 1 | 3 | 0 | 0 | YES | 0.598 |
| van-10 | 39.59 | 0 | 0 | 0 | 0 | YES | 0.660 |
| van-11 | 31.44 | 0 | 0 | 0 | 0 | YES | 0.524 |
| van-12 | 61.82 | 1 | 0 | 0 | 0 | YES | 0.687 |
table-06: solo projections 0/4 cleared; chain=0.35s, throws=0
van-10: solo projections 0/4 cleared; chain=0.00s, throws=4
levels: 12/12 PASS; geometry, materials, four pads/frame, par, deaths, mechanics and solo controls PASS
```

12 张截图通过 Playwright Chromium 生成；每张 PNG 均验证为 1280×720。`git diff --check` 通过；变更仅在任务允许路径。

验收器坏数据反例（恢复原文件后再跑完整验收）：

```text
PASS rejects overlap
PASS rejects missing controller
PASS rejects par must be
```
