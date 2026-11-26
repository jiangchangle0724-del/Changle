# 打碟的舞者：做模型、做舞

做出 `site/public/models/dancer/` 里的文件：打碟电视左边那位跳舞带气氛的女生（打碟对话管，档案 `docs/briefs/dj.md`）。
只在换她的样子或者加舞的时候跑，CI 不跑。

11 月 18 日起是这一版（Steve 11 月 14 日：「我要跟真人看起来一样，要达到我给你照片这个水平…包括动作这些方面都需要去深度优化」）：
设计图做成 3D，把设计图的照片直接烤到模型上，自己绑骨骼，跳真人舞者的动作捕捉。之前用 MakeHuman 捏的人和 11 套衣服拿掉了（git 历史里有）。

## 里面是什么

- `her.glb.gz`：她（夜店那套），一个蒙皮网格（约 6.2 万个三角形），挂在 Mixamo 命名的骨架上（24 根，静止时每根都不转，和 MPFB2 的一样），
  外加头发发梢的几根骨头（页面上用弹簧甩，`springs.ts`），一张 2048 的 WebP 贴图，meshopt 压缩再 gzip，约 1.6 MB
- `her-sweet.glb.gz`：初恋那套（白衬衫、粉色百褶短裙，11 月 19 日），同一个骨架，加头发和裙子的骨头，约 1.8 MB。
- `her-party.glb.gz`：派对小礼服那套（玫瑰金亮片吊带裙，11 月 20 日），同上，约 1.9 MB。
  哪首歌穿哪套、跳哪些舞：`dances.ts` 的 `lookOf`、`OUTFIT`
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
| timid | Hip Hop Dancing（Timid Dancing），11 月 20 日起，下同 |
| salsa_side | Salsa Dancing（Salsa Dancing Side To Side） |
| salsa | Salsa Dancing（Female Salsa Dancing） |
| ribpops | Hip Hop Dancing（Female Hip Hop 'Rib Pops' Dancing） |
| kickstep | Hip Hop Dancing（Female Hip Hop 'Kick Step' Dancing），11 月 21 日起不跳：她的脚比舞者自己滑得多 |
| shimmy | Hip Hop Dancing（Hip Hop Dancing Shimmy） |
| walk_soft, walk_cat, walk_sexy | 走路，11 月 20 日，In Place 下载：Walking（Feminine Walk Forward）、Catwalk Walk Forward（Female Walk Forward）、Walking（Female Sexy Walk） |

Belly Dancing Variation Three 和 Jazz 'Around The World' 也下了，但胯走得太远（出画面），没用。11 月 20 日的 Ballet Dance Variation One（跳起来、走 1 米）、Jazz 'Around The World' - Loop 和 Dance Swing Charleston（胯走出半米多）、Snake Hip Hop Dance（蹲得太低，裙子的骨头扎进腿里）也没用，测试不让过。

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
python3 facewarp.py work photos face_landmarker.task  # （新衣服的）脸：照片的五官挪到模型自己的五官上（见下面）
python3 bake.py work photos 2048                    # 两张照片烤到模型的贴图上：脸、皮肤、衣服都是设计图的；两张都看不清的地方用模型自己的颜色（调成照片的色调）
python3 metres.py work                              # 换成米：穿靴子 1.74 米，脚踩地，面朝 +z
python3 joints.py work/m                            # 从形状找关节：腿和胳膊看正面剪影，深度看前后的表面，脊柱按 MakeHuman 的比例；画一张 joints.png 来看
python3 cull.py work/m work/mc                      # 去掉模型里面那层朝里的皮（TRELLIS 的模型是一层 3.5 毫米厚的壳），藏着的外表面留着
node simplify.mjs work/mc work/ms 62000             # 减到 6.2 万个三角形（meshoptimizer，UV 的缝保住）
python3 fill.py work                                # 头发上两张照片都没看清的地方（发丝之间的缝），TRELLIS 涂成了浅色的，用最近的照片里的头发颜色补（不然她一转身头发里有白条）
python3 eyes.py work photos                          # 眼睛在贴图里的哪里（写进贴图的透明通道），和眼皮的颜色（lid.json）：页面上让她眨眼
python3 weights.py work/mc work/ms work/m/joints.json work/baked.png   # 蒙皮权重：按穿过她身体的距离（体素），不会跨到手或者另一条腿上；背心只跟胸走
python3 springs.py work/ms work/m/joints.json work/baked.png outfit.json  # 头发发梢（和裙子）自己的骨头，页面上用弹簧甩；outfit.json 写头发和裙子在多高
python3 facekit.py swap work/ms work/baked.png face.png face_landmarker.task work/swap/baked.png  # 她的脸（11 月 21 日起每套都一样），见下面
node build_glb.mjs work/ms work/m/joints.json work/swap/baked.png ../../../public/models/dancer/her.glb.gz
```

`fill.py` 在 `bake.py` 后面跑（`bake.py` 的那张也存成 `baked_photo.png`），然后 `eyes.py`（眼睛的位置：`facewarp.py` 在照片上找到的，存在 `face.json`；夜店那套是手量的，`eyes.py work photos 560,87 600,87`）。

`facewarp.py`（11 月 20 日）：TRELLIS 做出来的脸比设计图的低一点（眼睛低 8 像素，下巴低 6 像素，照片是 1024 的），照片的眼睛就烤到了眉骨上，模型自己的眼睛在下面露出来：两双眼睛。它用 MediaPipe 的人脸关键点（478 个点，Apache 2.0，只在本机跑，不进网站）在照片上和模型自己的颜色上各找一遍，把正面的扭曲在脸上挪一下，让照片的每个点落到模型的点上。要 `pip install mediapipe`，模型下载：`storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`。它把 `fit.py` 的扭曲存成 `warp_front_body.npy`，每次从这个开始；跑完看 `work/face_warp.png`。

11 月 21 日深夜起（Steve 看了电视：「脸很明显是贴图上去的很不自然」「第二个这个人物头部和身体非常的不协调」「直接用第一个人物的模型脸，只给她换几套衣服」）：每个造型都穿回第一个人物（11 月 14 日夜店那套，`her.glb.gz`，她自己的脸），`her-party`、`her-sweet` 两个文件不用了（还在）。新衣服的做法：设计图照下面的办法画（同一个人只换衣服，Steve 说这样画的很好），然后衣服画到她身上、裙子单独加一层，不再用 TRELLIS 重做一个人。下面 `facekit.py` 的换脸也不用了。

`facekit.py`（11 月 21 日；Steve：「面部跟之前那个模特保持一致就好，只需要换不同的衣服」「面部看起来有点扭曲」）：每套衣服的脸都换成同一张：Steve 选的参考图（他 11 月 21 日发的第三张，粉色盘扣那位，他说是 AI 生成的人；图不在仓库里，问 Steve 要）。从正面看她，MediaPipe 找出照片和她的脸上各 478 个点，照片的脸只转、缩放、平移（五官比例照原样），贴到她脸的轮廓里面，OpenCV 的 seamless clone 让四周的皮肤接上，写回贴图；眨眼的眼睛位置和眼皮颜色（lid.json）一起重做。最后写 `face_w.f32`（每个顶点有多少是脸，在她身上平滑过），`build_glb.mjs` 放进模型的 `_FACE`，页面上脸照照片原来的光来画（`her.ts`：脸的影子是照片的，不是模型的凹凸在舞台灯下照出来的，之前就是这样把脸照歪的）。只要重新算 `_FACE`：`python3 facekit.py mask work/ms work/swap/baked.png face_landmarker.task`。看结果：`work/swap/face_swap.png`（原来的、照片的、换好的）。

`outfit.json` 例子：
`{"hair": {"top": 1.36, "bottom": 1.17, "chains": 3, "bones": 2}, "skirt": {"waist": 1.0, "hem": 0.79, "crotch": 0.87, "chains": 8}}`
（头发只让发梢甩：模型里头发上半截和后背长在一起，整片甩会把后背的颜色拉出来；裙子从腰到裙摆，腿在裙子里面动）

4. 舞（`mocap/`，在 `site` 里跑）：Mixamo 的 X Bot，FBX、不带皮、每秒 30 帧。

```sh
npx tsx scripts/dj-dancer/mocap/retarget.ts public/models/dancer/her.glb.gz /tmp/rt a.fbx b.fbx …   # 套到她的骨架上，脚踩在舞者踩的地方
npx tsx scripts/dj-dancer/mocap/loop.ts --travel /tmp/rt /tmp/loops a@<bpm> b …                     # 剪成整小节的循环，首尾接得上
npx tsx scripts/dj-dancer/mocap/srcfacts.ts /tmp/rt /tmp/loops a.fbx b.fbx …                        # 真人动捕自己在这段里脚滑多少
npx tsx scripts/dj-dancer/mocap/pack.ts /tmp/loops public/models/dancer/dance a=<id> …              # 打包成页面读的文件
```

11 月 21 日起（Steve：「舞蹈动作…一定要…检查没有常见的的AI生成错误，要符合现实物理逻辑」）：

* `retarget.ts`：她的腿和舞者的腿长短不一样，同样的转法脚会落在别处，站着的脚就在地上滑。现在每一帧她的脚踝放到舞者脚踝的位置（按身高缩放），膝盖朝舞者膝盖的方向弯，脚的朝向照舞者。输出里的 feet off by 是够不着的最大距离
* `loop.ts --travel`：她跳到哪儿就在哪儿（以前每小节把胯走的路去掉，脚就跟着滑）。页面让她的画布跟着她在舞台上走，人留在画布中间（`Dancer3D.tsx`），胳膊不会被画布边切掉。选循环：首尾的姿势最接近、走出去的路最少、整段在画面里的那一段，接缝那半拍一直过渡到开头前一帧。`@bpm` 是 `dances.ts` 里定好的拍子，重剪不会变
* `srcfacts.ts`：真人自己的动捕在每段循环里脚滑多少，写进 `tests/support/captured.ts`。跳 house、桑巴的人脚本来就擦着地走，这个数就是她的上限（多 0.1，最少 0.15）

然后在 `site` 里跑 `npx tsx tests/dancer.test.ts`：除了文件、拍子和画面，每支舞还量一遍常见的毛病（`tests/support/motion.ts`）：站着的脚在地上滑、脚陷进地里、两只脚都离地太久、膝盖往后折、手插进身体或头里、单脚站着重心离脚太远、关节抖、循环接缝跳一下。`MOTION_TABLE=1` 打出每支舞的数。看效果：`real/preview.py`（转一圈的图）、`real/posetest.py`（摆几个姿势）、
`real/dancesheet.py`（一支舞的几个瞬间）都是在本机画图，不用浏览器。

走路（`dances.ts` 的 `WALKS`，一种风格一个）：`stride` 是她走一步移动多远，量的是着地那只脚一拍往后滑多远（原地走，所以这就是一步），`tests/dancer.test.ts` 会再量一遍对不对。量法也可以自己跑：`loop.ts` 之后看 `stride` 那条测试的输出。

## 给第一个人物换一套衣服（11 月 21 日起）

Steve：「直接用第一个人物的模型脸，只给她换几套衣服」。她的脸、头发、身材都是第一个人物的（`her.glb.gz` 的那个模型），只换衣服：

1. 设计图：ChatGPT，给它她的设计图（夜店那套的正背面）和衣服的参考照片，只换衣服（Steve 说这样画的「很好」）。
2. `register.py <设计图> <她的照片文件夹> <out>`：按人的头顶、脚底、中线对齐到她的正面、背面照片。
3. `reskin.py <她当初的 bake 工作文件夹> <她的照片> <新照片> <她的贴图.png> <out.png>`：新设计图和她原来的照片不一样的地方（衣服，衣服底下露出来的皮肤）换成新颜色；一样的地方（她的脸、头发、皮肤）用她原来的贴图。膝盖以下的靴子留着（靴子的形状在模型里，画成光腿会像肉色靴子），颜色换成设计图里鞋子的颜色（浅色才换）。两张照片都看不到的地方取模型上最近的那块。
4. `skirt.py`：裙子单独做一层（画在大腿上的裙子会跟着两条腿分开）：从腰到下摆一圈一圈，每圈宽度按正面设计图量（胳膊除外），不会穿进她身体，颜色从正背面设计图取，贴图下面加一条 2048 × 512 放它。
5. `hairshell.py`：她背上的长发离开后背（TRELLIS 把头发和后背做成了一个面，头发一甩后背跟着拉，Steve：「背部头发粘在一起」）。头发还是她自己的：原来那些三角形、原来的颜色，往外复制 3 毫米成单独一层（贴图在一条新的长条里，从原贴图照搬），挂在脊柱和脖子上，肩膀胳膊在它底下动；原来那片变成头发下面的后背，涂成旁边不是头发的颜色，跟后背走。静止时和原来一模一样。
6. `springs.py`（`"only"`：头发只让这层摆、裙子只让那层摆，`outfit.json` 里写 `"hair": {…, "only": "hair.npy"}`）、`build_glb.mjs`。
7. `legs.py`（夜店那套和皮夹克那套不用）：靴筒从脚踝到膝盖往里收成光腿的粗细（只收不放），涂成她夜店贴图里大腿的皮肤（同一条腿、同一侧）；靴子的脚（带跟）留着，就是她的高跟鞋。第一次跑会留 `pos.boots.f32`、`*.boots.png`，重跑从它们开始。
8. `hemfix.py`（有裙子的都跑）：裙子贴图长条最下面几行比上面的裙子浅的那几列（设计图里裙边下面是背景或腿，深色裙子就多出一圈白边），换成上面的裙子镜像过来。长过膝盖的裙子，`springs.py` 也会让裙子躲开小腿（膝盖往下一半，`lshin`、`rshin`），踢腿时裙子被腿顶起来，不穿过去。
9. `facenormals.py`（每个模型都要，从夜店那套的网格算一次写进各个目录）：头部的法线和邻居平均几遍，房间的光在脸上不再碎成三角形；形状和贴图不变。
10. 表情（每个模型都要）：`expressions.py` 在她正脸的图上找脸部关键点（MediaPipe face landmarker，Apache 2.0，本机跑），做两个很小的变形：`smile`（嘴角往上往后、脸颊和下眼睑跟着上来，最多 3 毫米）、`brows`（眉毛上抬，1.5 毫米左右），存成 `smile.f32`、`brows.f32`；模型目录里放 `morphs.json`（名字和文件），`build_glb.mjs` 就把它们做成 morph target。页面跳舞时微微笑，一个乐句里多一点少一点，换舞时眉毛抬一下（`her.ts` 的 `face`）。

（`hairsheet.py` 照背面照片新做一片头发，11 月 21 日上线一次，Steve 看了说「背面头发你做成双层的的了和原始的头发看起来不匹配，完全错误」，当天撤回，不用。）`fullview.py` 看正面、侧面、背面。

五套（`her-qipao`、`her-lace`、`her-leather`、`her-eyelet`、`her-cardigan`）在 `dances.ts` 的 `OUTFITS` 里分到三个造型，每首歌按歌的 id 固定穿其中一套（`outfitFor`）。

## 从视频学一支舞（11 月 21 日起）

Steve：「我给你youtube舞蹈你可以照着学吗」。视频要一个人跳、全身在画面里、镜头不动（翻跳视频最好）。

```sh
# 1. 在 Steve 电脑上下载（云端连不上 YouTube）：yt-dlp，H.264 的 mp4（AV1 的先用 ffmpeg 转成 H.264）
# 2. 每一帧她的身体（MediaPipe 人体关键点，heavy 模型，Apache 2.0，本机跑）和歌的拍子
python3 scripts/dj-dancer/mocap/pose.py video.mp4 marks.json pose_landmarker_heavy.task
python3 scripts/dj-dancer/mocap/tempo.py video.mp4                       # 例：143.6
# 3. 套到她身上，一段一段切（每段 16 秒左右），剪循环，打包
npx tsx scripts/dj-dancer/mocap/fromvideo.ts public/models/dancer/her.glb.gz marks.json /tmp/rt name1 8 24
npx tsx scripts/dj-dancer/mocap/loop.ts --travel /tmp/rt /tmp/loops name1@143.6 …
npx tsx scripts/dj-dancer/mocap/pack.ts /tmp/loops public/models/dancer/dance name1=name1 …
```

`fromvideo.ts`：胯、胸、头按视频里的转，胳膊腿按视频里的方向、她自己的长度，肘和膝盖往视频里的那边弯（膝盖只往前弯：视频里往后弯的多半是直腿读歪了，从背后拍、长裙挡着时常见，改成往前弯同样多、最多 20 度），手脚的朝向照视频。站在哪：画面里不动的那只脚（比另一只低）在地上钉住，胯跟着它走；最后站着的脚用腿的 IK 钉在原地，脚不进地板。然后每段都过 `tests/dancer.test.ts` 的动作检查（视频里学的没有真人动捕可比，脚滑上限 0.15），过不了的那段不要。11 月 21 日：ILLIT「It's Me」切 8 段过了 4 段（itsme1、3、4、5），KATSEYE「Gnarly」切 10 段留了 4 段（gnarly1、4、5、7；3 和 8 只有一小节，9、10 是片尾不动）。同一天自己找的三个：华尔兹（KAEFOWT5MF8）、探戈（xq418tlO1JE，都是 Ballroom with Anna 的教学，老师多半背对镜头走步）、古典舞（14SkwYL8ZSc，长裙盖住脚）切了 24 段，过检查的只有 3 段，看着像在站着、走步，不像跳舞，没上。古典舞要找穿练功服、正对镜头、镜头不动的。后来找到一个：古典舞身韵「摇臂组合」正面教学示范（N2yDRrqMOmM，黑色练功服、正对镜头、镜头不动，107.7 bpm），切 8 段过了 2 段（shenyun4、5），抒情的歌跳。芭蕾：一个老师的 centre adagio 课堂示范（kluF9swNZsk，92.3 bpm），切 7 段过了 2 段（ballet2、3）；老师背对镜头的段落学出来她也背对观众，就把那两段整支转了 180 度（只转胯的朝向和位置，别的骨头不动），再循环、打包。

视频学来的舞，`loop.ts` 之前要再顺一遍（11 月 23 日，Steve「跳舞的动作太多问题了」：视频舞的抖动 jerk 550–730，动捕的舞只有 80–230）：`python3 mocap/smooth_rt.py <rt> <out rt> 2.2 <名字>…`（每根骨头的转动、胯的位置按时间做高斯平滑，2.2 帧；手穿进身体的那支用小一点，比如 1.5，或者不用）。平滑后十支舞 jerk 都在 50–210。

## 加一支舞

1. 在 Mixamo（Steve 的 Adobe 账号）挑一支，FBX、Without Skin、30 fps 下载
2. 跑 `retarget.ts`、`loop.ts`、`pack.ts`（上面）
3. 在 `site/src/party/dj/dancer/dances.ts` 的 `DANCES` 加一项：id、`loop.ts` 打出来的 bpm、配哪几段（暖场、推高、顶点、收尾、慢歌）
4. 跑 `srcfacts.ts` 更新 `tests/support/captured.ts`，再跑测试：文件在、速度对得上、胯不走出画面、动作像真人

## 换她的样子或者加一套衣服

同一套：新的设计图（正面背面，A 字姿势，和这张一样的构图）→ TRELLIS.2 → `real/` 的脚本。

- 设计图：把 `sheet1.png`（夜店那套的正背面）给 ChatGPT，说「同一个人、同样的脸和身材、同样的 A 字姿势和构图，只换衣服」。
  初恋那套（11 月 19 日）和派对小礼服那套（11 月 20 日）都是这样画的
- 给 TRELLIS 之前自己抠好图（`cutout.py`），按 TRELLIS 自己的处理裁成正方形、背景涂黑（`trellis_in.png`），直接调 `image_to_3d`，
  这样它不跑 BRIA 的抠图
- 关节：穿裙子、连衣裙的，`joints.py` 从外形找不到胯和大腿根（被裙子挡住了），跑完再跑
  `python3 joints_from.py work/m <夜店那套的 joints.json>`：上半身、胳膊、胯用夜店那套的（设计图里同一个人站在同一个地方），膝盖和脚用自己的
- `weights.py` 不加最后那个贴图参数（背心那条规则只对夜店那套有用）
- `fit.py` 后面跑 `facewarp.py`（脸），然后 `bake.py`、`fill.py`、`eyes.py`、`springs.py`（裙子写进 `outfit.json`）、`build_glb.mjs` 输出 `her-<名字>.glb.gz`，在 `dances.ts` 的 `OUTFIT` 里换上
