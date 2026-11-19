# The notes on the design canvas, as Steve saw them

The yellow notes beside the five screens of the canvas "随便 · 夜场改版样稿", word for word. They
describe the motion and feel that the still screens can't show. S3 builds them; S1 and S2 only need
the look.

Above the screens: 随便 · 夜场改版：规则不变，换样子、动画和手感

首页 (`Main.dc.html`)
- 跟主站一样的夜色底，顶上一盏琥珀色的灯（工具的颜色）
- 顶栏：‹ 工具、随便的中英文名、语言
- 场景、时间、距离都是胶囊形的选择，一屏一个主按钮
- 按下去缩一下，松手弹回

等人 (`Lobby.dc.html`)
- 桌号用大号等宽数字，二维码放在白卡上
- 每进来一个人，头像从下往上冒出来，亮一圈琥珀色
- 填好饮食卡的人打个勾
- 「开始！」固定在底部，拇指正下方

第 1 轮 (`Round1.dc.html`)
- 点一下 👍（薄荷绿圈，图标弹一下），再点一下 🚫（变暗、左右摇一下），再点回到没选
- 倒计时在顶栏，最后 10 秒变红、每秒跳一下
- 下面一排小圆点：谁选好了谁亮
- 手机支持的话，点的时候轻轻震一下

第 2 轮 (`Round2.dc.html`)
- 卡片一张接一张从下面滑进来（前 6 张，每张晚 40 毫秒）
- 「想去」：从手指点的地方铺满琥珀色，打勾的线画出来
- 「否决」：卡片变暗，店名划一道线，只能用一次
- 有人想吃的排在最前，卡上先写这一类

出结果 (`Result.dc.html`)，全程唯一响的一刻
- 背景暗下去，赢的卡从小放大
- 「就它了！」像盖章一样砸下来，停一下，再散一圈琥珀色的光点
- 打平的话先转一个转盘，越转越慢，每过一格震一下
- 系统打开「减弱动态效果」时：没有滑动、摇晃和转盘，只淡入

## Where the drawings and the app differ

The drawings were made before the cards, with sample words. Where they disagree with the app, the
app wins, except where a card says otherwise:

- **Words.** The app's words in `src/client/i18n.ts` stay, and the browser tests look for many of
  them. The drawings say 什么场合, 在哪儿, 多远, 挑店, 投好了, 吃完回来评一下; the app keeps 什么场景,
  从哪里出发, 多远以内, 抢卡, 好了, 吃完回来评分 ⭐. The only new words are the ones a card lists.
- **Choices.** The options for when, how far and the occasion are the app's own (`WhenPicker`,
  `RangePicker`, `OccasionPicker`), not the sample ones drawn.
- **Marks on the menu.** The drawing tags a chip 想吃 / 不想; the app keeps 👍 / 🚫, because the hint
  above the menu explains them by those two signs.
- **Result buttons.** 导航 and 订位 in the drawing are the app's existing 🗺️ 地图 and 📞 打电话 links
  (shown only when the place has them). There is no booking in the app and no card adds one.
- **The restaurant photo** is the place's own photo when it has one; the grey box is a placeholder.
- The "样稿用：再放一次动画" button on the result screen is only for the canvas.
