# drama-C11: 新手 scripts for the 24 community scenes

The same job as [drama-C9](C9-scripts-all-ages.md), for the scenes set in one community's everyday
life (the host picks them under 剧本背景). Follow every rule on C9. Their guides are in
`site/src/data/dramaGroupGuides.ts` (`dramaGuide.ts` merges them in). Keep each community's own
words where the scene uses them (Noche Buena, Diwali, hoesik, omiyage, Nowruz...), and write it the
way someone from that community would find warm and funny, never as a stereotype. Send this card
once C10 is merged.

## Files

- Add one entry to `SCRIPTS` in `site/src/data/dramaScripts.ts` for each scene below, after the
  existing ones, in the table's order. Nothing else.

## Scenes (24 scenes, 103 roles)

| id | 剧本 | Roles |
| --- | --- | --- |
| `cn-family-chat-photo` | 家族群里的那张照片 | 3 (at least 2) |
| `cn-singles-day-parcels` | 双十一的十七个快递 | 4 (at least 3) |
| `cn-square-dance-speaker` | 广场舞比赛的音箱 | 6 (at least 4) |
| `ca-cottage-canoe` | 小木屋的独木舟 | 4 (at least 3) |
| `ca-hockey-pool` | 办公室的冰球竞猜 | 3 (at least 2) |
| `ca-snow-day-driveway` | 下雪天的车道 | 6 (at least 4) |
| `sa-diwali-sweets-box` | 排灯节的甜点盒 | 3 (at least 2) |
| `sa-sangeet-song` | 婚礼前夜的舞会 | 6 (at least 4) |
| `sa-cricket-final-password` | 板球决赛的密码 | 4 (at least 3) |
| `ph-noche-buena-flan` | 平安夜的焦糖布丁 | 4 (at least 3) |
| `ph-balikbayan-box` | 寄回家的大纸箱 | 3 (at least 2) |
| `ph-debut-eighteen-roses` | 成人礼的十八朵玫瑰 | 6 (at least 4) |
| `kr-chuseok-jeon` | 中秋节的煎饼 | 4 (at least 3) |
| `kr-hoesik-card` | 聚餐上的公司卡 | 5 (at least 3) |
| `kr-drama-finale-spoiler` | 大结局的剧透 | 3 (at least 2) |
| `jp-hanami-bento` | 赏樱会上的便当 | 6 (at least 4) |
| `jp-omiyage-box` | 少了一个的伴手礼 | 4 (at least 3) |
| `jp-otoshidama-envelopes` | 新年的压岁钱信封 | 3 (at least 2) |
| `ir-nowruz-haft-sin` | 新年桌上少了一样 | 4 (at least 3) |
| `ir-yalda-watermelon` | 雅尔达之夜的西瓜 | 3 (at least 2) |
| `ir-khastegari-tea` | 提亲那天的茶 | 6 (at least 4) |
| `eu-christmas-market-cashbox` | 圣诞市集的钱箱 | 4 (at least 3) |
| `eu-eurovision-scores` | 欧洲歌唱大赛之夜 | 6 (at least 4) |
| `eu-nonna-sauce` | 奶奶的秘方 | 3 (at least 2) |

## Check and done

As on C9: the checks pass, the PR lists the 24 scenes and the checks' results.

## Send to Codex

```
先把本机的 Changle 仓库更新到最新的 main，再从 main 开分支 codex/drama-c11-scripts。按 docs/codex-tasks/drama/C11-scripts-groups.md 做，规矩全照 C9-scripts-all-ages.md：先读 site/src/data/dramaScripts.ts 里已经写好的台词本，照同样的写法，给卡上的 24 个剧本写台词本。只改 site/src/data/dramaScripts.ts，跑检查，通过后开 PR，PR 里用文字写改了哪些剧本和检查结果。不用开浏览器。不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥。
```
