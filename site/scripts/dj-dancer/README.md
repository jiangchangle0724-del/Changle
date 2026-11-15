# 打碟的舞者：做模型、做衣服

做出 `site/public/models/dancer/` 里的文件：打碟电视左边那位跳舞带气氛的女生（11 月 14 日是「跟着跳」的教练，当晚跟着跳拿掉了；打碟对话管，档案 `docs/briefs/dj.md`）。
只在改她的身体、衣服、发型时跑，CI 不跑。动作不在文件里：电视页面拿到她的身体后现解（`site/src/party/dj/dancer/moves.ts`）。

## 里面是什么

- 人：MakeHuman 的写实人模（CC0），用 MPFB2 的数据和 MakeHuman 的系统素材，在 `dancer.mjs` 里做（我们自己的代码，抄了账号对话
  `site/scripts/figure/human.mjs` 的读文件部分；MPFB2 的代码是 GPL，一行没用，只用它的数据）。年轻成年女性，东亚面孔
  （MakeHuman 的亚洲 0.85、欧洲 0.15），偏瘦、匀称（`SHAPE`），身高 1.67 米，眼睛大一点、鼻子窄一点、嘴唇丰满一点、下巴尖一点
- 端庄：乳头磨平成乳房的弧面，裆部的缝填平，皮肤贴图上乳晕抹掉（`modest`、`parts.mjs` 的 `cover`）。不管穿什么都盖着，这一步是
  万一哪件衣服没盖到也什么都看不见。每套衣服都在测试里查一遍：胸和两腿之间都有不透明的布（`tests/dancer.test.ts`）
- 化妆：画进皮肤贴图，按每个像素在脸上的位置画：口红、眼影、腮红；头皮涂深，头发缝里不露白头皮（`parts.mjs` 的 `makeUp`）
- 身体文件 `body.glb.gz`：身体（一个面都不删，衣服盖住的由页面去掉）、眼睛、眉毛、睫毛，三个表情 `X_blinkL`、`X_blinkR`、`X_smile`。
  骨架是 MPFB2 的 Mixamo 骨架（52 根）加两只眼睛，和账号对话的人一样
- 发型：`hair/<发型>.glb.gz`，MakeHuman 的长直发 `long01` 和马尾 `ponytail01`（别的发型刘海遮一只眼，没用）。贴图做成灰的，页面按衣服说的发色上色
- 衣服：`outfit/<id>.glb.gz`，一套一个文件，挂在同一副骨架上，在 `outfits.mjs` 里定义。文件的场景 extras 里写着：中英文名、风格、
  发型和发色、鞋把她垫高多少（`lift`）、盖住了身体哪些顶点（`hide`，页面把这些三角形去掉，衣服下面的皮肤就不会戳出来）

## 衣服怎么做

大多数衣服是从她自己的皮肤上「剪」下来的（`garments.mjs`）：

1. 一件衣服 = 身体上的一块区域（`region(q)`：一个有符号距离，米，里面是负的）+ 一种布（`cloth.mjs`：颜色、花纹、粗糙度、金属度）。
   区域用她的地标写：胸点、裆、髋关节、各根骨头的位置（`landmarks`），所以身材改了衣服跟着改
2. 贴图画在皮肤的 UV 上：每个像素先算出它在她身上的位置（`texels`），再问区域在不在里面、布是什么颜色。花纹是三维的，跨过贴图的缝也连着；
   边缘按距离做抗锯齿，用 alpha 剪出来
3. 网格就是区域碰到的那些皮肤面，沿法线抬高几毫米（`offset`），权重和皮肤一模一样：她怎么动衣服就怎么动，不可能穿模
4. `drape`：布绷紧，只沿法线抬，填平乳沟、盖住小凸起；`hull`：鞋的壳磨圆（Taubin 平滑，不缩），脚趾不露出来
5. 细带子（比基尼的绳、吊带）是贴在皮肤上的折线（`curve`、`string`），量的是贴着皮肤的距离

另外几件用 MakeHuman 自己的衣服（`clothes`）：女式休闲套装（T 恤牛仔裤，T 恤上的标志抹掉、染白）、优雅套装（衬衫铅笔裙，重新上色）、
优雅套装的铅笔裙单独拿来做旗袍的下半截（`paint`：按旗袍的花纹重新画）。它们的权重跟最近的皮肤走再抹匀（账号对话的做法）。
帽子（圣诞帽）在 `hats.mjs` 里用代码做，挂在头骨上，按发型的大小做，头发不会从帽子里穿出来。

11 套，按风格（Steve 11 月 14 日：夜店性感、优雅保守、休闲运动、节日主题、比基尼）：

| id | 名字 | 风格 |
| --- | --- | --- |
| sport | 运动（粉色运动内衣、紧身裤、白色运动鞋，马尾） | 休闲运动 |
| casual | 休闲（白 T 恤、牛仔裤、蓝色运动鞋） | 休闲运动 |
| bikini_red | 红色比基尼（三角杯、系绳） | 比基尼 |
| bikini_tropic | 热带花比基尼（抹胸、高叉） | 比基尼 |
| swim_black | 黑色连体泳衣（深 V、挂脖、露背） | 比基尼 |
| club_sequin | 亮片连体衣（玫瑰金亮片、黑丝袜、黑色平底鞋） | 夜店性感 |
| club_leather | 皮短裤露脐装（银色抹胸、黑皮短裤、长靴） | 夜店性感 |
| elegant_office | 白衬衫铅笔裙 | 优雅保守 |
| qipao_blue | 青花旗袍 | 优雅保守 |
| qipao_red | 红色旗袍（金色花） | 节日主题 |
| santa | 圣诞女郎（红丝绒、白毛边、长靴、圣诞帽） | 节日主题 |

每首歌换一套：页面按歌的 id 算（同一首歌哪台电视都一样），从当晚这一段的风格里挑（暖场休闲优雅、推高夜店节日、顶点夜店比基尼、
收尾优雅），不会连着两首同一套（`site/src/party/dj/dancer/files.ts` 的 `outfitFor`）。

## 做一次

```sh
cd site/scripts/dj-dancer
npm ci
# MPFB2 的数据（只要 src/mpfb/data）和 MakeHuman 的系统素材（CC0，280 MB），和账号对话用的同一份：见 site/scripts/figure/README.md
node build.mjs /tmp/mpfb2/src/mpfb/data /tmp/mh-assets                          # 写 ../../public/models/dancer/，一分多钟
node build.mjs /tmp/mpfb2/src/mpfb/data /tmp/mh-assets --only body,hair,santa   # 只做这几个
node build.mjs /tmp/mpfb2/src/mpfb/data /tmp/mh-assets --plain /tmp/dancer     # 再写一份没压的 .glb 来看
```

然后在 `site` 里跑 `npx tsx tests/dancer.test.ts`。

## 加一套衣服

1. 在 `outfits.mjs` 的 `OUTFITS` 里加一项：`id`、中英文名、`style`、`hair`（发型和发色）、`garments`（区域 + 布）、需要的话 `clothes`、`hat`、`lift`
2. 在 `site/src/party/dj/dancer/files.ts` 的 `OUTFITS` 里加同一个 id、名字、风格（测试会对）
3. `node build.mjs … --only <id>`，再跑测试：文件在、名字对、胸和两腿之间盖住了
4. 看效果：页面上的舞者在 `/dj` 的电视上；本地可以用一个只在自己电脑上的实验页（不提交）把每套衣服、每个动作排成一张图看

## 编一个动作

动作在 `site/src/party/dj/dancer/moves.ts`，用账号对话的姿势语言写（`site/src/account/figure/pose/`，说明在
`site/scripts/figure/README.md` 的「编一个动作」）：关键姿势、缓动、页面上现解，手和胳膊不会穿进身体。一个片段的时间单位是拍，
页面按音箱的拍子放。都是站着的（11 月 14 日 Steve：「她也不需要坐着了」，坐着的动作和凳子拿掉了）。测试把每个片段在她身上解一遍，进身体超过 2.5 厘米就不过。
