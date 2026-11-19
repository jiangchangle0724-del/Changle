# 打碟的舞者：做模型、做舞

做出 `site/public/models/dancer/` 里的文件：打碟电视左边那位跳舞带气氛的女生（打碟对话管，档案 `docs/briefs/dj.md`）。
只在换她的样子或者加舞的时候跑，CI 不跑。

11 月 18 日起是这一版（Steve 11 月 14 日：「我要跟真人看起来一样，要达到我给你照片这个水平…包括动作这些方面都需要去深度优化」）：
设计图做成 3D，把设计图的照片直接烤到模型上，自己绑骨骼，跳真人舞者的动作捕捉。之前用 MakeHuman 捏的人和 11 套衣服拿掉了（git 历史里有）。

## 里面是什么

- `her.glb.gz`：她，一个蒙皮网格（约 6.2 万个三角形），挂在 Mixamo 命名的骨架上（24 根，静止时每根都不转，和 MPFB2 的一样），
  一张 2048 的 WebP 贴图，meshopt 压缩再 gzip，约 1.5 MB
- `dance/<id>.bin.gz`：一支舞一个文件，是她骨架上的循环（整小节，在动作自己的拍子上剪），页面按音箱的拍子放：歌的一拍就是舞的一拍。
  文件里：头（JSON：id、每秒帧数、帧数、拍数、一拍几秒、bpm、能量、骨头的顺序）、每帧每根骨头的转动（4 个 16 位数）、胯的位置（毫米）
- 哪支舞什么时候跳：`site/src/party/dj/dancer/dances.ts`（按当晚这一段和歌的速度挑，8 小节换一支；没歌的时候站着轻轻晃）

| 文件 id | Mixamo 上的名字 |
| --- | --- |
| rumba | Rumba Dancing（Female Rumba Dancing - Loop） |
| belly_slow | Bellydancing（Bellydance Variation 2） |
| bodywave | Hip Hop Dancing（Female Hip Hop 'Body Wave' Dancing） |
| wave | Wave Hip Hop Dance（Waving The Arms Hip Hop Dance） |
| belly | Belly Dance（Belly Dancing Variation One） |
| booty | Booty Hip Hop Dance（Booty Step Hip Hop Dance） |
| hiphop | Hip Hop Dancing（下载时同名的文件互相盖了，是 9 个 hip hop 里最后下的那个） |
| house | House Dancing（House Dance Variation Two） |
| samba | Samba Dancing（Female Fast Samba Enredo Variation Two） |
| idle, idle2 | Catwalk Idle, Catwalk Idle Twist L（Female Standing Idle, Female Twist Left Idle） |

Belly Dancing Variation Three 和 Jazz 'Around The World' 也下了，但胯走得太远（出画面），没用。

## 怎么做的

1. 设计图：Steve 电脑上的 ChatGPT 画的正面、背面全身 A 字姿势（`front.png`、`back.png`，1024×1024，存在他电脑的
   `C:\Claude Playground\OUTPUTS\音效\dj-dancer-front.png`、`dj-dancer-back.png`）。原创的脸，不照真人
2. 做成 3D：微软的 [TRELLIS.2](https://huggingface.co/spaces/microsoft/TRELLIS.2)（Hugging Face 上的免费空间，用 Steve 登录的账号的免费 GPU 额度）：
   正面图，分辨率 1024，seed 7，Extract GLB 用 200000 面、4096 贴图。模型是 MIT 许可的，出来的东西我们随便用
3. `real/` 里的脚本（Python 和 Node），一步一个：

```sh
cd site/scripts/dj-dancer && npm ci
pip install numpy scipy pillow numba opencv-python-headless "rembg[cpu]"
cd real
node extract.mjs trellis.glb work/trellis           # 模型拆成数组和贴图
python3 cutout.py photos work                       # 设计图抠出来（rembg 的 isnet，在本机算）
python3 fit.py work                                 # 每张图配一个相机，让模型的剪影盖住图，剩下的差一点用一个平滑的扭曲补上
python3 bake.py work photos 2048                    # 两张照片烤到模型的贴图上：脸、皮肤、衣服都是设计图的；两张都看不清的地方用模型自己的颜色（调成照片的色调）
python3 metres.py work                              # 换成米：穿靴子 1.74 米，脚踩地，面朝 +z
python3 joints.py work/m                            # 从形状找关节：腿和胳膊看正面剪影，深度看前后的表面，脊柱按 MakeHuman 的比例；画一张 joints.png 来看
python3 cull.py work/m work/mc                      # 去掉模型里面那层朝里的皮（TRELLIS 的模型是一层 3.5 毫米厚的壳），藏着的外表面留着
node simplify.mjs work/mc work/ms 62000             # 减到 6.2 万个三角形（meshoptimizer，UV 的缝保住）
python3 weights.py work/mc work/ms work/m/joints.json work/baked.png   # 蒙皮权重：按穿过她身体的距离（体素），不会跨到手或者另一条腿上；背心只跟胸走
node build_glb.mjs work/ms work/m/joints.json work/baked.png ../../../public/models/dancer/her.glb.gz
```

4. 舞（`mocap/`，在 `site` 里跑）：Mixamo 的 X Bot，FBX、不带皮、每秒 30 帧。

```sh
npx tsx scripts/dj-dancer/mocap/retarget.ts public/models/dancer/her.glb.gz /tmp/rt a.fbx b.fbx …   # 套到她的骨架上
npx tsx scripts/dj-dancer/mocap/loop.ts /tmp/rt /tmp/loops a b …                                     # 找动作自己的拍子，剪成整小节的循环，胯走的路去掉
npx tsx scripts/dj-dancer/mocap/pack.ts /tmp/loops public/models/dancer/dance a=<id> …              # 打包成页面读的文件
```

然后在 `site` 里跑 `npx tsx tests/dancer.test.ts`。看效果：`real/preview.py`（转一圈的图）、`real/posetest.py`（摆几个姿势）、
`real/dancesheet.py`（一支舞的几个瞬间）都是在本机画图，不用浏览器。

## 加一支舞

1. 在 Mixamo（Steve 的 Adobe 账号）挑一支，FBX、Without Skin、30 fps 下载
2. 跑 `retarget.ts`、`loop.ts`、`pack.ts`（上面）
3. 在 `site/src/party/dj/dancer/dances.ts` 的 `DANCES` 加一项：id、`loop.ts` 打出来的 bpm、配哪几段（暖场、推高、顶点、收尾、慢歌）
4. 跑测试：文件在、速度对得上、胯不走出画面

## 换她的样子或者加一套衣服

同一套：新的设计图（正面背面，A 字姿势，和这张一样的构图）→ TRELLIS.2 → `real/` 的脚本。关节是自动找的，换了样子先看一眼
`joints.png`；背心的那条规则（`weights.py` 里按银色亮片认出来的）只对这一件有用，别的衣服要看着改。
