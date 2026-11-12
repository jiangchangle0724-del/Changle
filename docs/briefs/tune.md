# 游戏 · 猜歌名（tune）

对话名「游戏 · 猜歌名」。网址 changle.ca/g/name-that-tune。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

放真歌的 30 秒试听，抢答说出歌名，华语、英文或混着来。也可以只放旋律，或者用自己的音乐 App 放歌，这里只管抢答和计分。

2 到 15 人。单机：手机放真歌或旋律，也能当抢答器。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/tune.ts`
- 画面（单机和联机）：`site/src/party/tune/`
- 内容：`site/src/data/tunes.ts`、`site/src/data/songs.ts`、`site/src/data/songPools.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `tune` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `tune` 开头的测试
- `site/scripts/party_test.py`（单机和联机）
- `site/tests/performer.test.ts`
- `site/scripts/tune_quiz_check.py`（选择题连玩 20 首，看报错和内存）

## 定过的事

- 真歌用 Apple Music 的 30 秒试听，揭晓时附上 Apple Music 的链接。
- 2026-11-05 Steve 定：继续用 Apple 试听。LICENSES.md 记着 Apple 的条款是用试听推广卖歌，他知道，照用。
- 歌单分 7 种语言、8 个分类，可以选几种混着来；还有选择题模式。
- 台上有两个会跳舞的小人，`site/tests/performer.test.ts` 逐帧检查手臂和腿。
- 每首歌只加载一次，省内存。
- 单机选择题是一桌人共用一部手机：猜错一个只锁这一个，其余还能接着猜。
- 四选一分简单和难（参考 Soundle）。简单：每个歌名下写着歌手。难：只写歌名，错的三个尽量是同一个歌手的别的歌，不够再用别的歌手补。单机在选择题里选，联机选择题和抢答后的四选一都算，大屏幕也只写歌名。揭晓时照样写歌手。
- 年代歌单（参考 Soundle）：语言、类别之外还能多选年代（80 年代以前、80、90、00、10、20 年代），按歌第一次发行的年份算。苹果按专辑算年份，老歌上了精选集就写成新年份（月亮代表我的心 写成 2018），所以 11-06 用 MusicBrainz 核过一遍：`scripts/fix-songs.mjs` 查了 3886 首可能有问题的，找到 3041 首，480 首改早了（只往早改，不往晚改，改进老歌年份的也算老歌）。以后加歌要再跑一次它。
- 歌手专场（参考 Soundle）：选一位歌手，整局只放这位歌手的歌，四个选项也全是这位歌手的，所以不写歌手名，也不分简单和难。至少 15 首不同的歌、其中 10 首是自己唱的才有专场，现在 191 位；名单是 `src/data/songPools.ts` 的 SPECIALS，`scripts/song-pools.ts` 生成。选歌手在一个弹层里，按语言分，也能搜名字。
- 一局里同一个歌名只放一次（有的歌在歌单里有两条，署名不同或发了两次）。池子里的歌比这局少（一位歌手、某个年代加某个类别），就每首放一次然后结束。联机同一桌连玩，池子不够时可以再放前几局放过的。
- 歌单里同一个歌手的两种写法合并了（JOLIN蔡依林 就是 蔡依林），去掉了看不见的字符。
- 挑战链接（参考 Soundle）：单机放真歌玩完，「发起挑战」用手机的分享发出一个链接（分享不了就复制），里面是这局的歌、玩法和这桌最高分。朋友打开直接进挑战，手机上没设人也行：同样的歌、同样的顺序、选择题同样的四个选项和顺序，最后和对方的分比。链接里什么都有（`?c=`，带校验），不存在任何地方。为了四个选项一样，每局的错选项都按这局的种子从内置歌单里出（不用当天的榜单歌）；内置歌单一改，旧链接的歌不变，错选项可能变。当天榜单上的歌发不出去，算分也不算它们。
- 一秒猜歌（参考 Soundle 的 Snap）：真歌先放一秒，再放三秒，再一直放，都从同一处（hook）开始，猜到时放到第几段就是几分（3、2、1）。单机由拿手机的人点「多放一点」。联机所有手机一起放：0 秒放一秒，6 秒放三秒，13 秒起一直放，一局 25 秒（选择题 20 秒）；从哪儿放由主人的手机分析试听决定（第一次有人声的拍子，15 秒以内），发给服务器，其他手机照这个放；第一首在设置时就选好，大家先加载。抢答时暂停，答错后接着放刚才那段。

## 还剩什么

- 选择题偶尔闪退（Steve 10-31 报的）：11-05 找到并修了一个很像的原因。台上跟着拍子变的灯光每一帧都改两个小人所在整块的样式，Chrome 内核里页面内存一首涨 150 MB 左右（6 首从 100 MB 到 1.2 GB），关掉这一项就不涨，小人跳舞本身不涨。改成只改发光的那几块、粗一点的台阶、变了才改以后，8 首都稳在 180 MB 上下。iPhone 是另一种内核，还要 Steve 在 iPhone 上连玩几十首确认。`scripts/tune_quiz_check.py` 现在也会在页面内存往上爬时报错。11-11 换了一台机器再量：联机三部手机每首还涨 15 到 20 MB，修之前合并的那版也一样，不是后来的新功能造成的；把封面图挡掉就只涨 6 MB，大头是封面图，多半是浏览器按内存大小留的图片缓存。真 iPhone 上会不会也涨还不知道。
- 参考 Soundle 的四条（Steve 11-05 说都做）都做了。还可以做：联机玩完也能发起挑战（主人的手机记下每首歌），现在只有单机能发。

## 交给别的对话

- 平台（路由、首页）知道一下：挑战链接让 `site/src/router.ts` 给游戏地址留下 `?c=`（游戏自己的链接，现在只有猜歌名用），`site/src/App.tsx` 打开带 `?c=` 的游戏不再先跳到卡片加人。都是一两行，测试在 `site/tests/routes.test.ts`。首页 JS 因此多了大约 0.1 KB（118.9 KB，预算 119 KB）。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-06 Name That Tune: challenges count the songs this phone has, and never break on a repeat
- 2026-11-06 Name That Tune: challenge links (挑战链接)
- 2026-11-06 Name That Tune: a game never plays a title twice, and a small pool's game is as long as its songs
- 2026-11-06 Name That Tune: songs' years from their first release (MusicBrainz)
- 2026-11-05 Name That Tune: decades and singer specials (年代歌单、歌手专场)
- 2026-11-05 Name That Tune: one second (一秒猜歌): a snippet, then three seconds, then the rest
- 2026-11-05 Name That Tune: hard titles: no singers on them, the wrong ones by the same singer
- 2026-11-05 Name That Tune: the stage's lights stop growing the page's memory song after song (#278)
- 2026-11-05 Name That Tune: one phone, multiple choice: a wrong title locks only itself, the table guesses on (#273)
- 2026-11-05 ui(C10): resume songs melodies and buzzers (#206，Codex)
- 2026-11-04 ui-C2：猜歌名三种模式接入游戏壳动作区、玩家条与轮次 (#168，Codex)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Name That Tune: each song loaded once, less memory, no blank screen from the music
- 2026-10-31 Name That Tune: the performers' arms bend like arms
- 2026-10-31 Name That Tune: a unique key for the winner's confetti
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-05 仓库改名 Changle。Steve 定了 Apple 试听照用，参考 Soundle 的四条都做。修了单机选择题猜错一次就全锁。
- 2026-11-11 Steve 同意，#273、#278 合并上线；同意歌手专场这个 PR 换设置页的参考截图（`update-screenshots`）。另一个对话复查了歌手专场和挑战链接，找出的问题都修了。
