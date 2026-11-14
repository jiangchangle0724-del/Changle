# 3D 小人：做模型，编动作

做出 `site/public/models/figure/` 里的文件，/me/figure 用的 3D 小人（账号那个对话管，档案
`docs/briefs/accounts.md`）。只在换衣服发型、加滑杆时跑，CI 不跑。动作不在文件里：页面拿到身体后现解（下面「编一个动作」）。

## 里面是什么

- 人：MakeHuman 的写实人模（CC0），用 MPFB2 的数据和 MakeHuman 的系统素材，在 `human.mjs` 里做（我们自己的代码；
  MPFB2 的代码是 GPL，一行没用，只用它的数据）。男女各一个：年轻成人、普通身材。默认的脸偏东亚一点（MakeHuman 的
  亚洲 0.6、欧洲 0.3、非洲 0.1 混起来；页面上没有任何按种族分的东西），再按 `SEXES` 的 `face` 微调几处。滑杆从这里开始
- 穿的：男的白 T 恤、牛仔裤（`male_casualsuit06`）、蓝运动鞋（`shoes06`）；女的蓝 T 恤、牛仔裤（`female_casualsuit01`）、
  白运动鞋（`shoes05`）。T 恤上 MakeHuman 的标志抹掉了（`CLEAN`）。衣服鞋子盖住的身体删掉，袖子下面的皮肤也删掉（不然胳膊一动就戳出来）。
  一套衣服拆成上衣 `Shirt` 和裤子 `Pants` 两块（按贴图上的岛分，`SEXES` 的 `shirt` 说哪些岛是上衣），贴图两块各自做成灰的，
  页面按选的颜色上色（`look.ts` 的 `SHIRT_COLORS`、`PANTS_COLORS`，第一个是原来的颜色）。衣服的权重跟最近的皮肤走，再抹匀
- 眼睛（high-poly，棕色调暗）、眉毛、睫毛。别的眼睛颜色是 MakeHuman 的另外 6 张眼睛贴图（`EYE_COLORS`），256 px 的 WebP，
  一张 4 KB，放在 `eyes/<颜色>.webp`，选了才下载
- 发型 10 款：每个人自己那款（男 `short02`，女 `long01`）在主文件里，别的一款一个文件（`hair/<发型>-<male|female>.glb.gz`），
  点了才下载，页面把它挂到同一副骨架上。头发和眉毛的贴图做成灰的，页面按发色上色；皮肤贴图按肤色乘（文件里记着每张贴图的平均色）
- 骨架：MPFB2 的 Mixamo 骨架（52 根，名字去掉 `mixamorig:`）加两只眼睛各一根，权重也是它的；衣服、头发的权重从它们挂着的身体顶点上插出来
- 捏脸：30 根滑杆，每根是 MakeHuman 的一对 target（`SHAPES`，名字和页面 `src/account/figure/look.ts` 的一样），做成 morph target `S_…`。
  页面在 CPU 上把它们混进形状，再重算法线（`_WELD` 属性说哪些顶点本是同一个点，只是贴图上分开了）
- 表情：MakeHuman 的表情单元（眨左眼、眨右眼、眯眼、笑、嘴角下垂、嘟嘴、挑眉、八字眉、皱眉）做成 morph target `X_…`，
  页面每帧按动作调（`moves.ts` 的 `face`），还会眨眼
- 人按眼睛的高度缩放到动作写的那个大小（眼睛离地 1.7257 米），男女一样高
- 身材：3 根滑杆（`BODY`：身高、胖瘦、肌肉），是 MakeHuman 年轻成人的 macro target 和这个身体的差，也做成 `S_…`，鞋底留在地上。
  身高只用 MakeHuman 那段的一部分（往下 0.55、往上 0.28，大约矮或高 12%；它本来从小孩到巨人）。每根滑杆把每个关节挪多少
  记在主文件场景的 extras 里（`body`，关节是它那些顶点的平均，所以跟着形状线性地走）。页面滑杆一停就把骨架挪过去、
  每块网格重新绑上、身体的形状重量一遍、动作重解
- 动作、道具的挂点不在文件里，都在页面上做：见下面「编一个动作」
- 压缩：皮肤贴图 1024 px、衣服鞋子头发 512、眼睛眉毛睫毛 256，都是 WebP；顶点量化，meshopt，最后 gzip
  （Cloudflare 不压 .glb）。男的主文件 686 KB，女的 639 KB（身材的 6 个 target 占 150 KB 上下），每款头发 73 到 247 KB。
  同样的输入做出来的文件一样

## 做一次

```sh
cd site/scripts/figure
npm ci
# MPFB2 的数据：只要 src/mpfb/data
git clone --filter=blob:none --sparse https://github.com/makehumancommunity/mpfb2 /tmp/mpfb2
git -C /tmp/mpfb2 sparse-checkout set src/mpfb/data
git -C /tmp/mpfb2 checkout 9de0707fdc88438d7c53a1a2ac7937d9221e2431
# MakeHuman 的系统素材（CC0，280 MB）
curl -L -o /tmp/mh.zip https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
mkdir -p /tmp/mh-assets && unzip -q /tmp/mh.zip -d /tmp/mh-assets
node build.mjs /tmp/mpfb2/src/mpfb/data /tmp/mh-assets                       # 写 ../../public/models/figure/，一个人二十几秒
node build.mjs /tmp/mpfb2/src/mpfb/data /tmp/mh-assets --only male --plain /tmp/fig   # 只做男的，再写一份没压的 .glb 来看
```

素材包解开后应该直接是 `clothes/`、`hair/`、`skins/` 这些文件夹（2026 年 11 月下载的那份，sha256 `b542127a…a0107`）。

## 编一个动作

动作都在 `site/src/account/figure/pose/` 里，页面拿到身体之后现解（`rig.ts`），所以换了身体、以后加了高矮胖瘦，动作都跟着这个身体走：

- `keys.ts`：21 个动作的关键姿势；`anim.ts`：姿势之间插值、缓动、采样成 three.js 的片段；`rig.ts`：把一个姿势解到骨头上
- 解的时候手和胳膊不穿进身体：身体按骨头分成几段椭圆柱（髋、肚子、肋、胸、脖子、大腿小腿、上臂前臂）和一个椭球的头，
  从这个身体的皮肤和衣服上的点量出来（`fitBody`）。手、手腕、前臂、手肘、上臂各放一个小球，碰到了就先把手肘绕着肩到手腕的轴转开，
  转不开再把手往外推；也不进地板
- 道具的挂点：两只手心里的 `Grip_R`、`Grip_L`，头上的 `Head_Anchor`，页面按这个身体的手放（`FigureStage.ts` 的 `anchor`）。
  道具本身和冒出来的东西是代码画的：`props.ts`、`fx.ts`

加一个动作：

1. 在 `keys.ts` 的 `CLIPS` 里写：`{ name, dur, fps, keys: [{ t, pose, ease }], add }`。`pose` 只写和站着（`BASE`）不一样的地方：
   - `hips`：`pos` 挪多少米，`yaw`（向它的左转 +）、`pitch`（前倾 +）、`roll`（向它的右倒 +），度
   - `spine`：`bend` 前弯、`side` 向左弯、`twist` 向左扭；`head`：`nod` 低头、`turn`、`tilt`，或 `look` 看一个点
   - `L` / `R`（左右手）：`hand` 手腕放哪，或 `grip` 手心握的那一点放哪；`pole` 手肘朝哪；`orient` 手的朝向
     （`fingers` + `palm`，或 `thumb` + `palm`：握刀时 `thumb` 就是刀的方向）；`fingers` 手型（`rig.ts` 的 `HANDS`：
     relaxed、open、flat、fist、grip、cup、point、v、thumbsup、phone、spread、salute）；`clav` 耸肩
   - `legL` / `legR`：`foot` 脚踝放哪（不写就站在原地，臀部一低膝盖自己弯），`pole` 膝盖朝哪，`footDir`、`footYaw`
   - 点和方向都带坐标系：`ch`（地面上，x 是它的左边、y 向上、z 向前，米）、`hp`（髋）、`cs`（胸）、`hd`（头），跟着那块身体走
   - `ease`：到这一帧怎么过渡（inout、snap 快出手、out、in、linear）；`add(t, pose)` 叠一点呼吸、抽泣
2. 在 `moves.ts` 里加一行：`id` 就是这里的 `name`，中英文名，道具 `props`，冒出来的 `fx`，照相的 `flash`，刀光 `trail`，
   先播一次的 `intro`，表情 `face`（`introFace` 是开场那段的）
3. `npx tsx tests/figure.test.ts`（在 `site` 里）：每个动作在男女两个身体上解一遍，手和胳膊进身体超过 2.5 厘米就不过。
   不过的话，多半是两只手要走的路线穿过了身子：加一个中间的关键姿势让手从前面绕过去，或者把手肘的 `pole` 往外摆
4. 用下面的 `look.py` 停帧看正面、侧面、过渡，不用重做模型

## 加一根捏脸的滑杆

`human.mjs` 的 `SHAPES` 加一行（MakeHuman 的 target 名，在 MPFB2 的 `targets/` 下面，`*` 是左右两边一起），
`look.ts` 的 `SHAPES` 加同样 id 的一行（中英文名、哪一组），重做模型。身材的滑杆在 `BODY` 里（它们还挪关节），
加了以后 `tests/figure.test.ts` 的 `BODIES` 也加上两头，看每个动作在那样的身体上还进不进身体。

## 看效果

网站开着开发服务器（`site` 里 `npm run dev`）时：

```sh
python3 look.py /tmp/a.png 'sword:0,0.85,1.12,1.65' 'sleep:0.8,1.8,2.6::intro' 'cool:2.4:0::0,1.75,0.75,0,1.65,0'
python3 play.py /tmp/b.png 'photo:0.5,1.6,2.2' 'cry:0.5,1'
```

`look.py` 把动作停在某一秒拍下来（可以转个角度 `:35`、看开场 `:intro`、拉近镜头，或者对准一根骨头 `@Head,0,0.02,0.9`），`play.py` 点了按钮实时拍，
看道具、Zzz、眼泪、闪光、刀光。这台机器没有图形芯片，实时只有十几帧，手机上是 60。
`python3 ../figure_check.py` 是正式的检查。
