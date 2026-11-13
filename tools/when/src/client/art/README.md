# 约时间 · When Works: pictures / 图片

AI-made with OpenAI's built-in image generation by Codex on 2026-11-13, then resized and
compressed to WebP. Prompts describe only what to draw; no other product's name or picture was
used as a reference. The site's own `site/src/party/straightface/art/backdrop.webp` was inspected
for the shared night palette before drawing. The pages will use these files in a separate PR.

由 Codex 于 2026-11-13 使用 OpenAI 内置图片生成工具绘制，再缩放、压缩为 WebP。提示词只描述
要画的东西，不使用其他产品的名称或图片作参考。绘制前查看了本站自己的
`site/src/party/straightface/art/backdrop.webp`，沿用夜色色调；页面接入由另一个 PR 完成。

All four: flat illustration, soft gradients, no outlines; calm, low contrast deep indigo and
purple night (around `#0e0c22`) with warm amber lamp light. No text, letters, numbers, logos,
brands, watermarks, people, faces or hands; no pale areas beyond small highlights. Cards and
calendar pages are blank, except for the result's single circle. The portrait backgrounds keep
the middle three fifths (y = 288–1151 at the final size) empty and dark for the code's text and QR.

四张共用提示词要点：扁平插画、柔和渐变、无描边，深靛紫夜色（约 `#0e0c22`）、暖琥珀灯光，
安静、低对比。没有文字、字母、数字、标志、品牌、水印、人、脸或手；仅小高光允许浅色。
牌面与日历留空，结果图只多一个圆圈。竖版中间五分之三（成图 y = 288–1151）留空、均匀暗色，
由代码叠加文字和二维码。

| File / 文件 | Scene / 画面 | Prompt main points / 提示词要点 | Date / 日期 |
| --- | --- | --- | --- |
| `home.webp` (1200 × 675) | Friends are about to arrive / 等朋友到来的圆桌 | Slightly elevated view of a round wooden table under one hanging lamp; blank desk calendar, cups, teapot, chopsticks, deck of blank cards, empty chairs; bottom fades into night. / 稍俯视圆木桌，一盏吊灯；空白台历、茶杯、茶壶、筷子、空白纸牌、空椅，底部渐入夜色。 | 2026-11-13 |
| `empty.webp` (800 × 600) | The same table, waiting / 同一张桌子，安静等待 | Round wooden table, lamp on, chairs tucked in, one steaming cup; otherwise empty. / 圆木桌、亮着的吊灯、收好的空椅，桌上只有一杯冒热气的茶。 | 2026-11-13 |
| `invite-bg.webp` (1080 × 1440) | Invitation background / 邀请背景 | Portrait; lamp and paper lantern string only in top fifth; table edge, cups and blank calendar only in bottom fifth; middle three fifths plain dark with a faint soft glow. Layout refinement lowers all bottom objects below 80%. / 竖版，上五分之一为吊灯和小纸灯笼，下五分之一为桌沿、茶杯和空白台历，中间均匀暗色、微光留空；调整底部物件，完整放到 80% 以下。 | 2026-11-13 |
| `result-bg.webp` (1080 × 1440) | A time is set / 定好时间的庆祝背景 | Same portrait arrangement; centered lamp, brighter lanterns, a little confetti confined to top and bottom edges; blank calendar with one circle only; empty dark middle three fifths. Layout refinement centers the lamp and keeps all props in the outer fifths. / 同样的竖版构图，居中吊灯、更亮的灯笼，少量彩纸只在上下边缘；台历空白页只有一个圈；调整灯的位置和物件边界，中间五分之三保持暗色留空。 | 2026-11-13 |

Checks / 检查：the four WebP dimensions and byte budgets are checked after compression. A temporary
script overlays a block of white Chinese and English text across the middle three fifths of both
portrait files for visual inspection; the check images and script are not shipped.

压缩后检查四张 WebP 的尺寸和字节预算；用临时脚本在两张竖版中间五分之三铺上中英文白字，
查看是否处处易读。检查图和脚本不随素材提交。
