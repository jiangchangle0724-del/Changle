# 3D 小人：做模型和编动作

做出 `site/public/models/figure.glb.gz`，/me/figure 那个小样用的 3D 小人（账号那个对话管，档案
`docs/briefs/accounts.md`）。只在改动作或换模型时跑，CI 不跑。

## 里面是什么

- 人：Ready Player Me 动作库自带的男性样例（`Masculine_TPose.glb`），衣服上的标志抹掉了（`clean_texture.py`）
- 17 个借来的动作：同一个动作库里挑的（`build.mjs` 里的 `CLIPS`），许可只许配 Ready Player Me 的人，换人时一起换掉
- 10 段我们自己编的动作（`moves.mjs`）：摆酷、照相、睡觉（先躺下，再睡）、挥刀、干杯、比心、打碟、大哭、抱拳。
  写的是关键姿势（手放哪、脚放哪、身子怎么弯、看哪），`rig.mjs` 按骨头名解出每根骨头的转动，
  所以换一个骨头名一样（Mixamo 那套名字）的人也能用
- 道具的挂点：两只手心里的 `Grip_R`、`Grip_L`，头上的 `Head_Anchor`（`bake.mjs`）。道具本身（刀、手机、啤酒、墨镜、耳机）
  和冒出来的东西（Zzz、爱心、音符、眼泪、闪光、刀光）是页面上用代码画的：`site/src/account/figure/props.ts`、`fx.ts`
- 压缩：关键帧去重、贴图 512 px WebP、顶点量化、meshopt，最后 gzip（Cloudflare 不压 .glb，gzip 后 858 KB 变 331 KB；
  页面自己解压，`FigureStage.ts`）。同样的输入做出来的文件一模一样

## 做一次

```sh
cd site/scripts/figure
npm ci
pip install opencv-python-headless pillow numpy      # 抹标志用
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/readyplayerme/animation-library /tmp/rpm-anim
node build.mjs /tmp/rpm-anim                          # 写 ../../public/models/figure.glb.gz，一两秒
node build.mjs /tmp/rpm-anim --out /tmp/figure.glb    # 要一个没压的 .glb 来看
```

动作库用的是 2025 年 3 月的 `c841f8b`；它的 .glb 不在 LFS 里，浅克隆就够。

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
   冒出来的 `fx`，照相的 `flash`，刀光 `trail`，先播一次的 `intro`
3. `node build.mjs …` 重做模型

## 看效果

网站开着开发服务器（`site` 里 `npm run dev`）时：

```sh
python3 look.py /tmp/a.png 'sword:0,0.85,1.12,1.65' 'sleep:0.8,1.8,2.6::intro' 'cool:2.4:0::0,1.75,0.75,0,1.65,0'
python3 play.py /tmp/b.png 'photo:0.5,1.6,2.2' 'cry:0.5,1'
```

`look.py` 把动作停在某一秒拍下来（可以转个角度 `:35`、看开场 `:intro`、拉近镜头），`play.py` 点了按钮实时拍，
看道具、Zzz、眼泪、闪光、刀光。这台机器没有图形芯片，实时只有十几帧，手机上是 60。
`python3 ../figure_check.py` 是正式的检查。
