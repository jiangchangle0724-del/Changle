# drama-C10: 新手 scripts for the 18 easy spicy scenes

The same job as [drama-C9](C9-scripts-all-ages.md), for the easy scenes a 微辣 (spicy) table plays.
Follow every rule on C9. Spicy stays playful: flirting, exes, jealousy and gossip, said with a wink;
nothing explicit, nothing mean about anyone's body. Send this card once C9 is merged.

## Files

- Add one entry to `SCRIPTS` in `site/src/data/dramaScripts.ts` for each scene below, after the
  existing ones, in the table's order. Nothing else.

## Scenes (18 scenes, 52 roles)

| id | 剧本 | Roles |
| --- | --- | --- |
| `love-anniversary-gift` | 纪念日的第二份礼物 | 3 |
| `family-ex-seating` | 年夜饭前任桌 | 3 |
| `love-key-under-pot` | 前任的钥匙还没退 | 3 |
| `office-secret-reference` | 推荐信发到了全员群 | 2 |
| `crime-chalet-ransom` | 雪屋里的赎金条 | 3 |
| `palace-cold-palace-menu` | 冷宫突然满房 | 3 |
| `show-secret-sponsor` | 分手声明带了广告 | 3 |
| `family-lipstick-collar` | 寿宴上的口红印 | 3 |
| `office-boardroom-earring` | 会议室里的耳环 | 3 |
| `show-final-night-texts` | 恋综最后一晚的两条短信 | 3 |
| `love-ktv-dedication` | 点歌屏上的告白 | 3 |
| `family-envelope-old-flame` | 礼金里的旧情 | 3 |
| `office-secret-santa-mugs` | 交换礼物里的情侣杯 | 3 |
| `show-couple-account-single` | 情侣号发了单身动态 | 3 |
| `palace-portrait-mole` | 画像上多了一颗痣 | 3 |
| `solo-ex-wedding-toast` | 前任的婚礼致辞 | 1 |
| `solo-dating-show` | 相亲节目的自我介绍 | 1 |
| `love-reunion-letter` | 同学会上的匿名情书 | 6 (at least 4) |

## Check and done

As on C9: the checks pass, the PR lists the 18 scenes and the checks' results.

## Send to Codex

```
先把本机的 Changle 仓库更新到最新的 main，再从 main 开分支 codex/drama-c10-scripts。按 docs/codex-tasks/drama/C10-scripts-spicy.md 做，规矩全照 C9-scripts-all-ages.md：先读 site/src/data/dramaScripts.ts 里已经写好的台词本，照同样的写法，给卡上的 18 个剧本写台词本。只改 site/src/data/dramaScripts.ts，跑检查，通过后开 PR，PR 里用文字写改了哪些剧本和检查结果。不用开浏览器。不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥。
```
