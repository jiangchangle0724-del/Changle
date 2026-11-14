# 3D 小人：做模型和编动作

做出 `site/public/models/figure/` 里的文件，/me/figure 用的 3D 小人（账号那个对话管，档案
`docs/briefs/accounts.md`）。只在改动作、换衣服发型、加滑杆时跑，CI 不跑。

## 里面是什么

- 人：MakeHuman 的写实人模（CC0），用 MPFB2 的数据和 MakeHuman 的系统素材，在 `human.mjs` 里做（我们自己的代码；
  MPFB2 的代码是 GPL，一行没用，只用它的数据）。男女各一个：年轻成人、普通身材。默认的脸偏东亚一点（MakeHuman 的
  亚洲 0.6、欧洲 0.3、非洲 0.1 混起来；页面上没有任何按种族分的东西），再按 `SEXES` 的 `face` 微调几处。滑杆从这里开始
- 穿的：男的白 T 恤、牛仔裤（`male_casualsuit06`）、蓝运动鞋（`shoes06`）；女的蓝 T 恤、牛仔裤（`female_casualsuit01`）、
  白运动鞋（`shoes05`）。T 恤上 MakeHuman 的标志抹掉了（`CLEAN`）。衣服鞋子盖住的身体删掉。眼睛（high-poly，棕色调暗）、眉毛、睫毛
- 发型 10 款：每个人自己那款（男 `short02`，女 `long01`）在主文件里，别的一款一个文件（`hair/<发型>-<male|female>.glb.gz`），
  点了才下载，页面把它挂到同一副骨架上。头发和眉毛的贴图做成灰的，页面按发色上色；皮肤贴图按肤色乘（文件里记着每张贴图的平均色）
- 骨架：MPFB2 的 Mixamo 骨架（52 根，名字去掉 `mixamorig:`）加两只眼睛各一根，权重也是它的；衣服、头发的权重从它们挂着的身体顶点上插出来
- 捏脸：30 根滑杆，每根是 MakeHuman 的一对 target（`SHAPES`，名字和页面 `src/account/figure/look.ts` 的一样），做成 morph target `S_…`。
  页面在 CPU 上把它们混进形状，再重算法线（`_WELD` 属性说哪些顶点本是同一个点，只是贴图上分开了）
- 表情：MakeHuman 的表情单元（眨左眼、眨右眼、眯眼、笑、嘴角下垂、嘟嘴、挑眉、八字眉、皱眉）做成 morph target `X_…`，
  页面每帧按动作调（`moves.ts` 的 `face`），还会眨眼
- 动作：`moves.mjs` 的 11 段（站着、摆酷、照相、睡觉和它先躺下的一段、挥刀、干杯、比心、打碟、大哭、抱拳），`rig.mjs` 解到骨头上。
  人按眼睛的高度缩放到第一个替身的大小（眼睛离地 1.7257 米），动作里写的位置照用；胸、头、髋三个坐标系按这个身体挪一挪
  （`frames`，记在文件场景的 extras 里），脚踝的高度也按这个身体
- 道具的挂点：两只手心里的 `Grip_R`、`Grip_L`，头上的 `Head_Anchor`（`bake.mjs`）。道具本身和冒出来的东西是页面上用代码画的：
  `site/src/account/figure/props.ts`、`fx.ts`
- 压缩：皮肤贴图 1024 px、衣服鞋子头发 512、眼睛眉毛睫毛 256，都是 WebP；关键帧去重，顶点量化，meshopt，最后 gzip
  （Cloudflare 不压 .glb）。男的主文件 562 KB，女的 546 KB，每款头发 70 到 240 KB。同样的输入做出来的文件一样

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

1. 在 `moves.mjs` 里写：`{ name, dur, fps, keys: [{ t, pose, ease }], add }`。`pose` 只写和站着（`BASE`）不一样的地方：
   - `hips`：`pos` 挪多少米，`yaw`（向它的左转 +）、`pitch`（前倾 +）、`roll`（向它的右倒 +），度
   - `spine`：`bend` 前弯、`side` 向左弯、`twist` 向左扭；`head`：`nod` 低头、`turn`、`tilt`，或 `look` 看一个点
   - `L` / `R`（左右手）：`hand` 手腕放哪，或 `grip` 手心握的那一点放哪；`pole` 手肘朝哪；`orient` 手的朝向
     （`fingers` + `palm`，或 `thumb` + `palm`：握刀时 `thumb` 就是刀的方向）；`fingers` 手型（`rig.mjs` 的 `HANDS`：
     relaxed、open、flat、fist、grip、cup、point、v、thumbsup、phone）；`clav` 耸肩
   - `legL` / `legR`：`foot` 脚踝放哪（不写就站在原地，臀部一低膝盖自己弯），`pole` 膝盖朝哪，`footDir`、`footYaw`
   - 点和方向都带坐标系：`char`（地面上，x 是它的左边、y 向上、z 向前，米）、`hips`、`chest`、`head`（跟着那块身体走）
   - `ease`：到这一帧怎么过渡（inout、snap 快出手、out、in、linear）；`add(t, pose)` 叠一点呼吸、抽泣
2. 在页面的 `site/src/account/figure/moves.ts` 里加一行：`id` 就是这里的 `name`，中英文名，道具 `props`，
   冒出来的 `fx`，照相的 `flash`，刀光 `trail`，先播一次的 `intro`，表情 `face`（`introFace` 是开场那段的）
3. `node build.mjs …` 重做

## 加一根捏脸的滑杆

`human.mjs` 的 `SHAPES` 加一行（MakeHuman 的 target 名，在 MPFB2 的 `targets/` 下面，`*` 是左右两边一起），
`look.ts` 的 `SHAPES` 加同样 id 的一行（中英文名、哪一组），重做模型。

## 看效果

网站开着开发服务器（`site` 里 `npm run dev`）时：

```sh
python3 look.py /tmp/a.png 'sword:0,0.85,1.12,1.65' 'sleep:0.8,1.8,2.6::intro' 'cool:2.4:0::0,1.75,0.75,0,1.65,0'
python3 play.py /tmp/b.png 'photo:0.5,1.6,2.2' 'cry:0.5,1'
```

`look.py` 把动作停在某一秒拍下来（可以转个角度 `:35`、看开场 `:intro`、拉近镜头），`play.py` 点了按钮实时拍，
看道具、Zzz、眼泪、闪光、刀光。这台机器没有图形芯片，实时只有十几帧，手机上是 60。
`python3 ../figure_check.py` 是正式的检查。
