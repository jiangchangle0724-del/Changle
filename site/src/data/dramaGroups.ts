import type { T } from "../i18n";
import type { DramaGroup, DramaRole, DramaScene } from "./drama";

/**
 * 戏精大赏 · scenes set in one community's everyday life, for the tables that pick it (the host picks
 * any of the groups; their scenes come first, everyone's fill in). The rules in `drama.ts` hold here
 * too: any role can be the culprit, every alibi makes its actor look a little guilty, the twist
 * shakes everyone, and a big scene's first `min` roles carry the story.
 *
 * Everyday life, not stereotypes: a family do, a festival, a workplace, a neighbourhood, the way
 * people there would recognise it themselves. The comedy comes from the secrets, never from who
 * anyone is. The English explains in passing what an English speaker might not know (what a
 * haft-sin table is); the Chinese does the same for a Chinese reader.
 */

const t = (zh: string, en: string): T => ({ zh, en });
const role = (name: T, brief: T, alibi: T): DramaRole => ({ name, brief, alibi });
const g = (group: DramaGroup, scenes: Omit<DramaScene, "group">[]): DramaScene[] => scenes.map((s) => ({ ...s, group }));

export const GROUP_SCENES: DramaScene[] = [
  /* ---------------------------------------------------------------- 中国 Chinese */
  ...g("cn", [
    {
      id: "cn-family-chat-photo",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("家族群里的那张照片", "The Photo in the Family Chat"),
      setup: t(
        "爷爷八十大寿的前一晚，有人往家族微信群里发了一张奶奶年轻时的老照片，配了一句「猜猜这是谁的初恋」，两分钟后撤回了。可奶奶已经看到了，现在全家人都坐在客厅里。",
        "The night before Grandpa's 80th birthday, someone posted an old photo of Grandma as a young woman in the family group chat, captioned “Guess whose first love this is?”, then deleted it two minutes later. Too late: Grandma saw it, and now the whole family is sitting in the living room.",
      ),
      roles: [
        role(t("大姑", "Auntie Lin"), t("家族群的群主，每天早上发一张早安图", "Runs the family group chat and posts a “good morning” picture every day"), t("你偷偷把爷爷的寿宴蛋糕从三层改成了两层，省下来的钱给自己换了新手机。", "You quietly downsized Grandpa's birthday cake from three tiers to two and spent the difference on a new phone for yourself.")),
        role(t("表哥", "Cousin Wei"), t("刚教会奶奶用微信", "Just taught Grandma how to use the chat app"), t("你答应帮奶奶抢群里的红包，结果手太快，红包全进了你自己的账户。", "You promised to grab the red-packet money in the chat for Grandma, but your thumb was faster: it all landed in your own account.")),
        role(t("小外孙女", "Little Mei"), t("在做「我的家族历史」的学校作业", "Doing a school project on family history"), t("你的作业里写着「爷爷年轻时是武林高手」，其实是你编的。", "Your project says Grandpa was a kung fu master when he was young. You made that up.")),
      ],
      min: 2,
      culprit: t("发照片的人", "The one who posted the photo"),
      culpritCard: t(
        "照片是你发的。你在旧相册里翻到它，本来想在寿宴上玩「猜猜这是谁」，手一抖提前发了出去。千万别承认，要说「我手机昨晚一直在充电」。",
        "You posted it. You found it in an old album and planned a “guess who” game for the birthday dinner, but your thumb slipped and sent it early. Don't admit it: say your phone was charging all evening.",
      ),
      ask: t("照片是谁发到群里的？", "Who posted the photo?"),
      twist: t("奶奶突然开口：「那张照片上的人，其实不是我。」", "Grandma suddenly speaks up: “By the way, that photo isn't me.”"),
    },
    {
      id: "cn-singles-day-parcels",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("双十一的十七个快递", "Seventeen Parcels"),
      setup: t(
        "双十一过去一个星期，家门口堆了十七个快递，收件人全写着妈妈的名字，可妈妈说她一个都没买。爸爸召开家庭会议。",
        "A week after Singles' Day, China's biggest online shopping day, seventeen parcels are piled at the door, every one addressed to Mom, and Mom swears she didn't order a single one. Dad calls a family meeting.",
      ),
      roles: [
        role(t("爸爸", "Dad"), t("管家里的账，每一分钱都记下来", "Keeps the family budget and writes down every cent"), t("你偷偷买了一根贵得吓人的钓鱼竿，藏在阳台的拖把后面。", "You secretly bought a scandalously expensive fishing rod and hid it behind the mop on the balcony.")),
        role(t("女儿", "The daughter"), t("大学放假回家，手机不离手", "Home from university, never off her phone"), t("你用妈妈的账号给自己抢了一台半价的游戏机。", "You used Mom's account to snag yourself a half-price game console.")),
        role(t("妈妈", "Mom"), t("说自己一个都没买", "Says she didn't buy any of it"), t("十七个里有一个其实是你买的：一台按摩椅，你打算跟爸爸说是抽奖抽中的。", "Actually one of the seventeen is yours: a massage chair, which you plan to tell Dad you won in a raffle.")),
        role(t("奶奶", "Grandma"), t("刚跟孙女学会网购", "Just learned to shop online from her granddaughter"), t("你给自己买了一双亮闪闪的跳舞鞋，怕被说浪费，用的是妈妈的账号。", "You bought yourself sparkly dancing shoes and, afraid of being called wasteful, used Mom's account.")),
      ],
      min: 3,
      culprit: t("下单的人", "The one who placed the orders"),
      culpritCard: t(
        "十七个快递里有十五个是你下的单：用妈妈的账号凑满减、领优惠券，越买越停不下来。千万别承认，要说「我这是在帮全家省钱」。",
        "Fifteen of the seventeen are your orders, placed on Mom's account to stack the discounts: the more you bought, the more you “saved.” Don't admit it. Say you were only helping the family save money.",
      ),
      ask: t("那十五个快递是谁下的单？", "Who ordered the fifteen parcels?"),
      twist: t("门铃响了：快递员又送来一个大箱子，「货到付款」。", "The doorbell rings: the courier has one more giant box, and it's cash on delivery."),
    },
    {
      id: "cn-square-dance-speaker",
      kind: "show",
      level: "all",
      diff: "easy",
      title: t("广场舞比赛的音箱", "The Square-Dance Showdown"),
      setup: t(
        "小区广场舞比赛还有十分钟开始，领队张阿姨的音箱里放出来的，不是大家练了三个月的那首歌，而是一首儿歌。有人动过音箱。",
        "Ten minutes before the neighbourhood square-dance contest (the evening dance groups that fill Chinese plazas), Auntie Zhang's speaker plays a nursery rhyme instead of the song the team has rehearsed for three months. Someone's been at the speaker.",
      ),
      roles: [
        role(t("领队张阿姨", "Auntie Zhang, team captain"), t("跳了十年，从没输过", "Ten years dancing, never lost"), t("你偷偷也报名了隔壁小区的队，两边谁赢你都有份。", "You've secretly signed up with the next neighbourhood's team too, so you win either way.")),
        role(t("退休的数学老师", "The retired maths teacher"), t("队里节奏最准的人", "Keeps the best time on the team"), t("你膝盖不好，打算比赛跳到下蹲那段时假装系鞋带。", "Your knee's bad, so you plan to “retie your shoelace” during the big squat move.")),
        role(t("物业经理", "The building manager"), t("这场比赛的主办人", "Organized the contest"), t("你答应评委，冠军队免一年停车费，其实你根本没这个权力。", "You promised the judges the winners get a free year of parking. You have no power to do that.")),
        role(t("楼上的小伙子", "The young guy upstairs"), t("每天晚上被音乐吵得睡不着", "Kept awake by the music every night"), t("你上个月偷偷把音箱的音量调小过一次，没人发现。", "Last month you secretly turned the speaker down once, and nobody noticed.")),
        role(t("外卖小哥", "The delivery rider"), t("每天这个点在这儿等单", "Waits here for orders every evening"), t("你其实每天都跟着跳，已经偷偷学会了整支舞。", "You dance along every night, and you've secretly learned the whole routine.")),
        role(t("评委", "The judge"), t("区里请来的舞蹈老师", "A dance teacher hired by the district"), t("你和张阿姨是多年的老对手，今天很想看她出丑。", "You and Auntie Zhang are old rivals, and you'd love to see her stumble today.")),
      ],
      min: 4,
      culprit: t("换歌的人", "The one who swapped the song"),
      culpritCard: t(
        "歌是你换的：你用手机连上了音箱，想放自己练习用的那首，结果点错了，放成了儿歌。要说「音箱是蓝牙的，谁都连得上」，把怀疑引到别人身上。",
        "You swapped it: you connected your phone to the speaker to play your own practice track and hit the nursery rhyme by mistake. Say “It's Bluetooth, anyone could connect,” and steer the suspicion elsewhere.",
      ),
      ask: t("是谁动了音箱？", "Who messed with the speaker?"),
      twist: t("比赛提前开始了，音箱又自己响了：这次放的是一首情歌。", "The contest starts early, and the speaker comes on by itself again: this time, a love song."),
    },
  ]),

  /* ---------------------------------------------------------------- 加拿大本地 Canadian */
  ...g("ca", [
    {
      id: "ca-cottage-canoe",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("小木屋的独木舟", "The Cottage Canoe"),
      setup: t(
        "长周末，一家人去湖边的小木屋度假（加拿大人叫它 cottage）。早上起来，码头上那条祖传了四十年的红色独木舟不见了，只剩下半截绳子。",
        "Long weekend at the family cottage. In the morning, the old red canoe that's been in the family for forty years is gone from the dock. All that's left is the end of a rope.",
      ),
      roles: [
        role(t("爸爸", "Dad"), t("小木屋的主人，独木舟是他爷爷留下的", "Owns the cottage; the canoe was his grandfather's"), t("你昨晚没打招呼就借用了湖对面邻居家的烧烤架，还烤糊了一块。", "Last night you borrowed the neighbours' barbecue without asking, and scorched it.")),
        role(t("女婿", "The son-in-law"), t("第一次来小木屋，城里长大的", "First time at the cottage; a city kid through and through"), t("你根本不会游泳，整个周末都在假装会。", "You can't swim, and you've been pretending you can all weekend.")),
        role(t("十几岁的女儿", "The teenage daughter"), t("整个周末都在抱怨没网", "Has complained about the lack of Wi-Fi all weekend"), t("你每天半夜偷偷走到码头最远的那头，那里有一格信号，你在跟男朋友视频。", "You've been sneaking out to the end of the dock at midnight, the one spot with a bar of signal, to video-call your boyfriend.")),
        role(t("湖对面的邻居", "The neighbour from across the lake"), t("十年来每个夏天都想买这条独木舟", "Has asked to buy the canoe every summer for ten years"), t("你家的狗昨晚游过来，叼走了码头上的一件救生衣。", "Your dog swam over last night and ran off with a life jacket from the dock.")),
      ],
      min: 3,
      culprit: t("弄丢独木舟的人", "The one who lost the canoe"),
      culpritCard: t(
        "是你弄丢的：你天没亮就划出去看日出，回来时没系好绳子，独木舟漂走了。千万别承认，要说「昨晚风那么大，肯定是被吹走的」。",
        "It was you: you paddled out before dawn to watch the sunrise, didn't tie it up properly when you got back, and it drifted off. Don't admit it. Say, “The wind was crazy last night, it must have blown away.”",
      ),
      ask: t("是谁弄丢了独木舟？", "Who lost the canoe?"),
      twist: t("湖对面有人大喊：独木舟漂在湖中间，上面还坐着一只浣熊！", "Someone yells from across the lake: the canoe is floating in the middle of the lake, and there's a raccoon in it!"),
    },
    {
      id: "ca-hockey-pool",
      kind: "office",
      level: "all",
      diff: "easy",
      title: t("办公室的冰球竞猜", "The Office Hockey Pool"),
      setup: t(
        "冰球季后赛期间，办公室搞了一个竞猜：每人出二十块，猜得最准的人拿走所有的钱。今天早上，竞猜表上有一个人的预测被改过了，改完正好全猜中。",
        "The office has a playoff hockey pool: twenty bucks each, best picks take the pot. This morning someone's picks on the sheet have been changed, and now they're a perfect score.",
      ),
      roles: [
        role(t("经理", "The manager"), t("竞猜是他组织的，钱放在他的抽屉里", "Runs the pool; the cash is in his desk drawer"), t("你从奖金里「借」了二十块买咖啡，还没放回去。", "You “borrowed” twenty from the pot for coffee and haven't put it back.")),
        role(t("实习生", "The intern"), t("根本不看冰球", "Doesn't follow hockey at all"), t("你选球队全看队服好不好看。", "You picked your teams by which jerseys looked nicest.")),
        role(t("IT 小哥", "The IT guy"), t("竞猜表是他做的电子表格", "Built the pool's spreadsheet"), t("你在表格里藏了一页，偷偷记录谁上班时间在看比赛直播。", "You hid a tab in the spreadsheet logging who streams games during work hours.")),
      ],
      min: 2,
      culprit: t("改竞猜表的人", "The one who changed the picks"),
      culpritCard: t(
        "表是你改的：昨晚比赛一结束，你半夜登录改了自己的预测。要说「我一开始就是这么猜的，我懂球」，还要提一句「这个表格谁都能远程改」。",
        "You changed it: right after last night's game you logged in and fixed your picks. Say, “That's what I picked from day one, I know my hockey,” and mention that anyone can edit the sheet remotely.",
      ),
      ask: t("是谁改了竞猜表？", "Who doctored the picks?"),
      twist: t("经理打开抽屉：装钱的信封是空的。", "The manager opens his drawer: the envelope with the pot in it is empty."),
    },
    {
      id: "ca-snow-day-driveway",
      kind: "crime",
      level: "all",
      diff: "easy",
      title: t("下雪天的车道", "Snow Day on Maple Street"),
      setup: t(
        "下了一夜大雪，整条街的人都出来铲雪。可街角那对老夫妻家的车道，被人用铲雪机喷满了雪，堆得比车还高。老太太上午要去看医生，车出不去。邻居们都围了过来。",
        "After a big overnight snowfall, the whole street is out shovelling, except the elderly couple on the corner, whose driveway has been buried by someone's snowblower, piled higher than their car. She has a doctor's appointment this morning and can't get out. The neighbours gather round.",
      ),
      roles: [
        role(t("有铲雪机的邻居", "The neighbour with the snowblower"), t("每年冬天都帮半条街铲雪", "Clears half the street every winter"), t("你昨晚把铲雪机借出去了，还答应不告诉任何人借给了谁。", "You lent your snowblower to someone last night and promised not to say who.")),
        role(t("新搬来的爸爸", "The new dad on the street"), t("在加拿大过的第一个冬天", "It's his first Canadian winter"), t("你昨晚偷偷看了一晚上「铲雪机怎么用」的视频。", "You spent last night secretly watching “how to use a snowblower” videos.")),
        role(t("送快递的司机", "The delivery driver"), t("每天早上第一个来这条街", "First on the street every morning"), t("你昨天把一个包裹扔在了雪堆上，现在找不到了。", "Yesterday you tossed a parcel onto a snowbank, and now you can't find it.")),
        role(t("业主协会主席", "The residents' association chair"), t("什么事都要管", "Has an opinion on everything"), t("你一直偷偷把自家门口的雪推到马路中间，等市里的铲雪车来推走，这是不允许的。", "You've been secretly pushing your snow into the road for the city plow to deal with, which isn't allowed.")),
        role(t("拉雪橇的小孩", "The kid with the sled"), t("在人行道上堆了一排雪人", "Built a row of snowmen along the sidewalk"), t("你最大的那个雪人，是用老夫妻车道上的雪堆的。", "Your biggest snowman is made of snow from the old couple's driveway.")),
        role(t("铲雪车司机", "The city plow driver"), t("刚开着铲雪车经过这条街", "Just plowed the street"), t("你今天早上在车里睡着了十分钟，有一段路没铲。", "You dozed off in the cab for ten minutes this morning and skipped a stretch.")),
      ],
      min: 4,
      culprit: t("埋了车道的人", "The one who buried the driveway"),
      culpritCard: t(
        "是你干的：你天没亮用铲雪机清雪，戴着耳机听歌，出雪口转了方向都没发现，雪全喷到了老夫妻家。要说「我一早上都在用铲子」，还要提醒大家「铲雪车也会把雪推进车道」。",
        "It was you: before dawn you ran a snowblower with your earbuds in and never noticed the chute had swung round, so all the snow went onto their driveway. Say you've been using a shovel all morning, and remind everyone that the city plow pushes snow into driveways too.",
      ),
      ask: t("是谁把老夫妻的车道埋了？", "Who buried the old couple's driveway?"),
      twist: t("老太太打开窗户喊：「谁帮我把车道铲干净，我请他吃一整盘我烤的黄油挞！」", "The old lady calls out the window: “Whoever clears my driveway gets a whole tray of my butter tarts!”"),
    },
  ]),

  /* ---------------------------------------------------------------- 南亚 South Asian */
  ...g("sa", [
    {
      id: "sa-diwali-sweets-box",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("排灯节的甜点盒", "The Diwali Sweets Box"),
      setup: t(
        "排灯节（Diwali，印度的灯节，家家点灯、互送甜点）晚上，卡普尔一家提着一大盒甜点去夏尔马家拜访。走到门口才发现，盒子里夹着一张卡片：「祝卡普尔一家节日快乐！夏尔马家」。这就是夏尔马家上星期送来的那盒。",
        "It's Diwali, and the Kapoors are on the Sharmas' doorstep with a big box of mithai (Indian sweets) as a gift. Then someone spots the card tucked inside: “Happy Diwali to the Kapoors! Love, the Sharmas.” It's the very box the Sharmas gave them last week.",
      ),
      roles: [
        role(t("妈妈", "Mom"), t("家里所有的节日礼物都是她准备的", "In charge of every festival gift"), t("你确实买了一盒新的，可路上偷吃了三块，不好意思拿出来了。", "You did buy a fresh box, but you ate three pieces on the way and were too embarrassed to bring it.")),
        role(t("儿子", "The son"), t("大学放假回家", "Home from university"), t("你答应去买烟花，结果把钱拿去买了演唱会门票。", "You promised to buy the fireworks and spent the money on concert tickets.")),
        role(t("奶奶", "Dadi (Grandma)"), t("记得这些年哪家送过什么", "Remembers who gave whom what, going back years"), t("你偷偷把夏尔马家去年送你的那条披肩，送给了你最好的老姐妹。", "You quietly passed the shawl the Sharmas gave you last year on to your best friend.")),
      ],
      min: 2,
      culprit: t("拿错甜点盒的人", "The one who grabbed this box"),
      culpritCard: t(
        "是你拿的：家里的甜点盒堆了一桌，你随手拿了最上面那盒，根本没看卡片。千万别承认，要说「这盒是我早上专门去店里买的」，还要问「是谁把那盒放在最上面的」。",
        "It was you: the table was stacked with sweet boxes and you grabbed the top one without looking. Don't admit it. Say you bought this one fresh this morning, and ask who left that box on top anyway.",
      ),
      ask: t("是谁拿了这盒甜点？", "Who grabbed this box?"),
      twist: t("门开了，夏尔马太太手里也提着一盒甜点，盒子上贴着卡普尔家的名字。", "The door opens, and Mrs. Sharma is holding a box of sweets too, with the Kapoors' name on it."),
    },
    {
      id: "sa-sangeet-song",
      kind: "show",
      level: "all",
      diff: "easy",
      title: t("婚礼前夜的舞会", "The Sangeet Mix-Up"),
      setup: t(
        "旁遮普婚礼的前一晚叫「桑吉特」（sangeet）：两家人轮流上台跳舞。新郎家练了一个月，可音乐一响，放出来的是新娘家的歌，新娘家的表亲已经站起来跳了。",
        "The night before a Punjabi wedding is the sangeet, when each family performs a dance for the other. The groom's side has rehearsed for a month, but when their music starts, it's the bride's side's song, and the bride's cousins are already up and dancing.",
      ),
      roles: [
        role(t("新郎的姐姐", "The groom's sister"), t("舞是她编的，排了一个月", "Choreographed the routine; a month of rehearsals"), t("你偷偷把自己的独舞加长了一分钟，谁都没告诉。", "You secretly made your solo a minute longer and told no one.")),
        role(t("新娘的表哥", "The bride's cousin"), t("今晚的主持人，话筒在他手里", "The MC, holding the mic tonight"), t("你答应新娘不在台上讲她小时候的糗事，可你的稿子上写了三件。", "You promised the bride no embarrassing childhood stories on stage. Your notes have three.")),
        role(t("婚礼 DJ", "The DJ"), t("婚礼请来的打碟师", "The hired DJ"), t("你今天迟到了一个小时，歌单是在车上用手机随便排的。", "You were an hour late, and you threw the playlist together on your phone in the car.")),
        role(t("新郎的叔叔", "The groom's uncle"), t("每次跳舞都第一个冲上去", "First on the dance floor, every time"), t("你偷偷跟新娘家打赌哪家跳得好，输了要帮他们洗一个月的车。", "You made a secret bet with the bride's family on whose dance wins. If you lose, you wash their cars for a month.")),
        role(t("新娘的妈妈", "The bride's mother"), t("今晚的女主人", "Tonight's host"), t("你嫌新郎家那首歌太长，偷偷给 DJ 发了一个剪短的版本。", "You thought the groom's side's song was too long, so you secretly sent the DJ a shorter version.")),
        role(t("摄影师", "The photographer"), t("今晚的每一秒都在他的镜头里", "Filming every second tonight"), t("你的相机半小时前就没电了，这半小时其实什么都没拍到。", "Your camera died half an hour ago, and you haven't filmed a thing since.")),
      ],
      min: 4,
      culprit: t("换歌的人", "The one who switched the song"),
      culpritCard: t(
        "歌是你换的：你用 DJ 的电脑放了一下自己手机里的歌，放完点错了播放列表。千万别承认，要说「我一晚上都在跳舞，哪有空碰电脑」。",
        "You switched it: you used the DJ's laptop to play something from your phone and clicked the wrong playlist afterwards. Don't admit it. Say you've been dancing all night, no time to touch any laptop.",
      ),
      ask: t("是谁把歌换了？", "Who switched the song?"),
      twist: t("新娘的奶奶走上台，拿过话筒：「这首歌，是我五十年前结婚那天跳的。」全场安静下来。", "The bride's grandmother takes the mic: “I danced to this song at my own wedding, fifty years ago.” The room goes quiet."),
    },
    {
      id: "sa-cricket-final-password",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("板球决赛的密码", "The Cricket Final"),
      setup: t(
        "板球世界杯决赛，全家挤在客厅里看直播。比赛打到最紧张的时候，屏幕上突然跳出来：「密码已更改，请重新登录。」这个直播账号是全家一起用的。",
        "It's the Cricket World Cup final, and the whole family is packed into the living room. At the tensest moment, the screen flashes: “Password changed. Please sign in again.” The streaming account is shared by the whole family.",
      ),
      roles: [
        role(t("爸爸", "Dad"), t("账号是他的，每个月他付钱", "The account's his; he pays every month"), t("你把密码偷偷告诉了三个老同学，他们都在用。", "You secretly gave the password to three old college friends, and they all use it.")),
        role(t("女儿", "The daughter"), t("根本不看板球，坐在这儿是为了吃零食", "Doesn't care about cricket; here for the snacks"), t("你用这个账号偷偷追剧，已经追到第五季了，不想让人知道。", "You've been binge-watching a drama on this account, five seasons deep, and don't want anyone to know.")),
        role(t("叔叔", "Uncle"), t("专门从萨里开车过来看比赛", "Drove in from Surrey just for the match"), t("你跟同事打了赌，球队输了你就剃光头。", "You bet a coworker that if your team loses, you'll shave your head.")),
        role(t("邻居家的小孩", "The neighbour's kid"), t("天天来家里蹭电视", "Comes over every day to watch TV"), t("你昨天用这个账号买了一部电影，还没告诉任何人。", "Yesterday you bought a movie on this account and haven't told anyone.")),
      ],
      min: 3,
      culprit: t("改密码的人", "The one who changed the password"),
      culpritCard: t(
        "密码是你改的：手机上跳出「账号异常」的提醒，你一紧张就点了「修改密码」，新密码自己也忘了。要说「我手机一直在充电」，还要说「肯定是有人在外面偷用账号」。",
        "You changed it: your phone popped up a “suspicious login” alert, you panicked and hit “change password,” and now you've forgotten the new one too. Say your phone's been charging the whole time, and blame whoever's been using the account from outside.",
      ),
      ask: t("是谁改了密码？", "Who changed the password?"),
      twist: t("楼上的邻居突然一阵欢呼：比赛结束了，可这屋里谁都不知道谁赢了。", "A roar comes from the neighbours upstairs: the match is over, and nobody in this room knows who won."),
    },
  ]),

  /* ---------------------------------------------------------------- 菲律宾 Filipino */
  ...g("ph", [
    {
      id: "ph-noche-buena-flan",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("平安夜的焦糖布丁", "Noche Buena Leche Flan"),
      setup: t(
        "平安夜，离十二点只差十分钟（菲律宾人圣诞夜半夜一家人一起吃大餐，叫 Noche Buena）。外婆做的那一大盘焦糖布丁（leche flan）只剩下一个空盘子。全家人都说没动过。",
        "Ten minutes to midnight on Christmas Eve, just before Noche Buena, the big family feast. Lola's leche flan is down to an empty tray, and everyone swears they never touched it.",
      ),
      roles: [
        role(t("外婆", "Lola (Grandma)"), t("布丁是她亲手做的，同一个做法做了四十年", "Made the flan herself, the same recipe for forty years"), t("你今年偷偷用了超市买的布丁粉，生怕有人吃出来不是祖传的做法。", "This year you secretly used a store-bought mix, and you're terrified someone will taste that it's not the family recipe.")),
        role(t("姨妈", "Tita Baby (auntie)"), t("刚从马尼拉飞过来", "Just flew in from Manila"), t("你带来的那个「名牌包」礼物，其实是在机场买的仿品。", "The “designer bag” you brought as a gift is a knock-off from the airport.")),
        role(t("表弟", "Cousin JR"), t("一晚上都在厨房「帮忙」", "Has been “helping” in the kitchen all night"), t("你偷吃了半只圣诞火腿，又把剩下的摆成了一整只的样子。", "You ate half the Christmas ham and arranged the rest to look whole.")),
        role(t("邻居", "The neighbour"), t("每年平安夜都来串门", "Drops by every Christmas Eve"), t("你来之前已经在自己家吃过一顿了，现在撑得一口都吃不下，又不好意思说。", "You already ate a full dinner at home and you're stuffed, but you'd never say so.")),
      ],
      min: 3,
      culprit: t("吃掉布丁的人", "The one who ate the flan"),
      culpritCard: t(
        "布丁是你吃的：你本来只想尝一小口，结果一勺接一勺，回过神来盘子已经空了。千万别承认，要说「我一直在看着火腿」，嘴角记得擦干净。",
        "You ate it: you meant to have one tiny taste, then one spoonful led to another, and suddenly the tray was empty. Don't admit it. Say you were watching the ham the whole time, and wipe the corner of your mouth.",
      ),
      ask: t("是谁吃了焦糖布丁？", "Who ate the leche flan?"),
      twist: t("外婆从冰箱里又端出一盘：「我做了两盘。第一盘里我放了辣椒，专门抓偷吃的。」", "Lola pulls a second tray from the fridge: “I made two. The first one had chili in it, to catch whoever sneaks a taste.”"),
    },
    {
      id: "ph-balikbayan-box",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("寄回家的大纸箱", "The Balikbayan Box"),
      setup: t(
        "一家人在装寄回菲律宾的「巴里巴扬箱」（balikbayan box，在海外的菲律宾人寄给老家亲人的一大箱礼物）。快递员来称重：超重十公斤。箱子是全家一起装的，可每个人都说自己只放了一点点。",
        "The family is packing a balikbayan box, the giant box of gifts Filipinos abroad send home to relatives. The courier weighs it: ten kilos over. Everyone packed it together, and everyone swears they only put in a little.",
      ),
      roles: [
        role(t("妈妈", "Mom"), t("寄箱子是她的主意，清单是她列的", "The box was her idea, and she wrote the list"), t("你在箱底藏了一封信，告诉老家的妹妹你其实想搬回去住。", "At the bottom of the box you hid a letter telling your sister back home you're thinking of moving back.")),
        role(t("儿子", "The son"), t("在加拿大出生，第一次帮忙装箱", "Born in Canada; first time helping with the box"), t("你把自己不想要的旧衣服全塞了进去，说是「送给表弟们的」。", "You stuffed in all the old clothes you didn't want, calling them “gifts for the cousins.”")),
        role(t("爸爸", "Dad"), t("负责封箱，胶带已经用了三卷", "On tape duty; three rolls so far"), t("你偷偷放了六罐午餐肉，是答应老同学的，没告诉妈妈。", "You snuck in six cans of corned beef you promised an old friend, without telling Mom.")),
      ],
      min: 2,
      culprit: t("偷偷塞了重东西的人", "The one who snuck in something heavy"),
      culpritCard: t(
        "超重的是你：你在箱子最底下偷偷放了一个旧电饭煲，打算送给老家的朋友，谁都没说。要坚持「我只放了几包巧克力」，还要说「肯定是罐头太重了」。",
        "The extra weight is yours: at the very bottom you hid an old rice cooker for a friend back home and told no one. Insist you only put in a few bags of chocolate, and say it must be all those cans.",
      ),
      ask: t("是谁偷偷塞了重东西？", "Who snuck in something heavy?"),
      twist: t("快递员说：「超重也能寄，每公斤加二十块。谁出钱？」", "The courier says, “Overweight's fine, but it's twenty bucks a kilo. Who's paying?”"),
    },
    {
      id: "ph-debut-eighteen-roses",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("成人礼的十八朵玫瑰", "The Eighteenth Rose"),
      setup: t(
        "菲律宾女孩十八岁的成人礼（debut）上有个传统：十八位对她重要的男士每人送一朵玫瑰、陪她跳一段舞。今晚主持人念到第十八位，念出的名字谁都不认识。",
        "At a Filipino debut, a girl's 18th birthday celebration, there's a tradition called the 18 Roses: eighteen important men in her life each give her a rose and share a dance. Tonight the emcee reaches number eighteen and reads out a name nobody recognizes.",
      ),
      roles: [
        role(t("过生日的女孩", "The debutante"), t("今晚的主角", "Tonight's star"), t("你偷偷改了「十八根蜡烛」的名单（十八位女士每人说一句祝福），删掉了一个你不喜欢的表姐。", "You secretly edited the 18 Candles list (eighteen women who each give you a wish) and cut a cousin you can't stand.")),
        role(t("姨妈", "Tita Gina"), t("整场派对的总策划", "Planned the whole party"), t("你把派对预算的一半花在了自己的礼服上。", "You spent half the party budget on your own gown.")),
        role(t("主持的表哥", "The emcee cousin"), t("名单在他手里", "Holding the list"), t("你根本没提前看名单，好几个名字都是现场硬念的。", "You never looked at the list beforehand, and you've been winging every name.")),
        role(t("爸爸", "Dad"), t("十八支舞的第一支和最后一支都是他跳", "Dances the first and the last of the eighteen"), t("你偷偷学了一个月的舞，老师就是女儿的舞蹈老师，你怕女儿知道。", "You've secretly taken dance lessons for a month, from your daughter's own teacher, and you don't want her to find out.")),
        role(t("最好的朋友", "The best friend"), t("和过生日的女孩从小一起长大", "Grew up with the debutante"), t("你在偷偷跟女孩的哥哥交往，今晚谁都不知道。", "You're secretly dating the debutante's brother, and nobody knows.")),
        role(t("外公", "Lolo (Grandpa)"), t("坐在第一排", "Front row"), t("你答应外孙女今晚少说两句，可你准备了一篇二十分钟的致辞。", "You promised to keep it short tonight. You've prepared a twenty-minute speech.")),
      ],
      min: 4,
      culprit: t("加了第十八个名字的人", "The one who added the eighteenth name"),
      culpritCard: t(
        "第十八个名字是你加的：名单上只有十七位，你一着急就写上了你的新同事，他刚搬来加拿大，今晚一个人过。要说「名单最后是主持人定的」，还要装作也很好奇这个人是谁。",
        "You added number eighteen: the list only had seventeen, so you panicked and wrote in your new coworker, who just moved to Canada and is on his own tonight. Say the emcee finalized the list, and act just as curious as everyone about who he is.",
      ),
      ask: t("第十八个名字是谁加的？", "Who added the eighteenth name?"),
      twist: t("门口走进来一位先生，手里拿着一朵玫瑰：「请问，刚才是叫我吗？」", "A man appears at the door holding a single rose: “Excuse me, did someone call my name?”"),
    },
  ]),
  /* ---------------------------------------------------------------- 韩国 Korean */
  ...g("kr", [
    {
      id: "kr-chuseok-jeon",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("中秋节的煎饼", "The Chuseok Jeon"),
      setup: t(
        "韩国的中秋节（秋夕）一大早，全家在厨房煎「煎饼」（jeon，裹了蛋液的小煎饼），要摆到祭祖的供桌上。煎了两个小时，盘子里的煎饼却越来越少。",
        "Early on Chuseok, Korea's harvest holiday, the family has spent two hours in the kitchen frying jeon (little egg-battered pancakes) for the ancestral table. Somehow the platter keeps getting emptier.",
      ),
      roles: [
        role(t("奶奶", "Halmeoni (Grandma)"), t("供桌上的每一样都要她点头", "Nothing goes on the table without her approval"), t("你偷偷从超市买了一盒现成的煎饼混了进去，觉得没人吃得出来。", "You secretly mixed in a box of store-bought jeon, sure nobody can tell.")),
        role(t("大儿媳", "The eldest daughter-in-law"), t("天没亮就开始煎", "Has been frying since before dawn"), t("你一边煎一边用手机看了两集电视剧，煎糊了一整盘，藏进了垃圾桶。", "You watched two episodes of a drama on your phone while cooking, burned a whole batch, and buried it in the trash.")),
        role(t("刚退伍的孙子", "The grandson, just out of the army"), t("一直在厨房门口转来转去", "Keeps hovering at the kitchen door"), t("今年的过节零花钱你已经找奶奶要过一次了，现在还想再要一次。", "You already got your holiday money from Grandma once this year, and you're angling for it again.")),
        role(t("叔叔", "Uncle"), t("说是来帮忙，一直在看棒球", "Came “to help,” has been watching baseball"), t("你答应妻子今年过节带全家去旅行，结果偷偷把机票退了。", "You promised your wife a holiday trip this year, then secretly cancelled the flights.")),
      ],
      min: 3,
      culprit: t("偷吃煎饼的人", "The one eating the jeon"),
      culpritCard: t(
        "煎饼是你偷吃的：每次路过厨房你都顺手拿一个，一早上吃了十几个。千万别承认，要说「我一直在看着供桌」，嘴边的油记得擦干净。",
        "You've been eating them: every time you passed the kitchen you grabbed one, and you're up to a dozen. Don't admit it. Say you were guarding the ancestral table, and wipe the grease off your lips.",
      ),
      ask: t("是谁偷吃了煎饼？", "Who's been eating the jeon?"),
      twist: t("奶奶宣布：「今年要数数。供桌上少一个，偷吃的人洗所有的碗。」", "Grandma announces: “This year we count. One piece short, and whoever ate it washes every dish.”"),
    },
    {
      id: "kr-hoesik-card",
      kind: "office",
      level: "all",
      diff: "easy",
      title: t("聚餐上的公司卡", "The Team Dinner Card"),
      setup: t(
        "韩国公司下班后的部门聚餐（hoesik）上，烤肉吃到一半，组长发现放在桌上的公司卡不见了。大家都说没看见。",
        "Halfway through a hoesik, the after-work team dinner that's part of office life in Korea, the team leader realizes the company card he left on the table is gone. Nobody saw a thing.",
      ),
      roles: [
        role(t("组长", "The team leader"), t("公司卡归他保管", "The card's his responsibility"), t("你上个月用公司卡请自己家里人吃了一顿，还没想好怎么报账。", "Last month you used the card to treat your own family to dinner and haven't figured out how to expense it.")),
        role(t("新来的职员", "The new hire"), t("第一次参加聚餐，一直在给大家倒水", "First team dinner; has been refilling everyone's water all night"), t("你其实已经找好了新工作，下个月就辞职。", "You've already landed another job, and you're quitting next month.")),
        role(t("科长", "The section chief"), t("在公司待了二十年", "Twenty years at the company"), t("你偷偷把今晚的聚餐订在了你小舅子开的店。", "You quietly booked tonight's dinner at your brother-in-law's restaurant.")),
        role(t("隔壁部门的人", "Someone from another team"), t("说是路过，就坐下了", "Was “just passing by,” and sat down"), t("你其实是来打听组长会不会升职的。", "You're really here to find out whether the team leader is getting promoted.")),
        role(t("烤肉店老板", "The restaurant owner"), t("一直在给这桌加菜", "Keeps bringing extra dishes"), t("你在这桌的账单上多算了两份肉。", "You've padded this table's bill with two extra plates of meat.")),
      ],
      min: 3,
      culprit: t("拿走公司卡的人", "The one who has the card"),
      culpritCard: t(
        "卡在你那儿：刚才你去结第一轮的账，结完顺手放进了自己的钱包，然后就忘了。现在再拿出来太尴尬了。要说「我一直在烤肉，手上全是油」，还要提醒大家「刚才服务员收过桌子」。",
        "The card's with you: you used it to settle the first round, slipped it into your own wallet, and forgot. Now it's too awkward to produce. Say you've been grilling the whole time with greasy hands, and remind everyone the server just cleared the table.",
      ),
      ask: t("公司卡在谁那里？", "Who has the company card?"),
      twist: t("部长推门进来：「听说今晚公司请客？那我也来！」", "The department head walks in: “Heard the company's buying tonight? Count me in!”"),
    },
    {
      id: "kr-drama-finale-spoiler",
      kind: "show",
      level: "all",
      diff: "easy",
      title: t("大结局的剧透", "The Finale Spoiler"),
      setup: t(
        "几个朋友约好周五一起看一部韩剧的大结局，谁都不许提前看。可群里刚刚有人发了一个大哭的表情，配了一句「我就知道是他」。",
        "Friends have sworn to watch the finale of their favourite K-drama together on Friday, no peeking. Then someone in the group chat posts a sobbing emoji and “I KNEW it was him.”",
      ),
      roles: [
        role(t("追剧团团长", "The watch-party organizer"), t("「不许提前看」的规矩是她定的", "Made the no-peeking rule"), t("你偷偷看了开头一分钟，就一分钟。", "You watched the first minute. Just one minute.")),
        role(t("嘴最快的朋友", "The friend who can't keep a secret"), t("群里话最多的人", "The loudest one in the chat"), t("你根本没在追这部剧，前面十五集都是看的剪辑解说。", "You haven't really been watching; you've been catching up on recap videos.")),
        role(t("室友", "The roommate"), t("说自己对韩剧没兴趣", "Says K-dramas aren't their thing"), t("你其实是这部剧最忠实的粉丝，还加入了男主角的粉丝后援会。", "You're secretly the show's biggest fan, and you're in the lead actor's fan club.")),
      ],
      min: 2,
      culprit: t("偷看大结局的人", "The one who watched the finale early"),
      culpritCard: t(
        "是你偷看的：昨晚失眠，你一口气把大结局看完了，哭了一整夜。千万别承认，群里那条消息要说是「在说别的剧」，眼睛肿也要找个理由。",
        "You watched it: you couldn't sleep last night and binged the whole finale, then cried all night. Don't admit it. Say that message was about a different show, and come up with an excuse for your puffy eyes.",
      ),
      ask: t("是谁偷看了大结局？", "Who watched the finale early?"),
      twist: t("电视台突然宣布：大结局拍了两个版本，周五播哪一个，由观众投票决定。", "The network announces the finale was shot two ways, and viewers will vote on which one airs Friday."),
    },
  ]),

  /* ---------------------------------------------------------------- 日本 Japanese */
  ...g("jp", [
    {
      id: "jp-hanami-bento",
      kind: "office",
      level: "all",
      diff: "easy",
      title: t("赏樱会上的便当", "The Hanami Bento"),
      setup: t(
        "今天是公司的赏樱会（hanami，日本人春天在樱花树下野餐）。最年轻的员工天没亮就去公园铺好垫子占位置。中午大家到的时候，垫子还在，可垫子上多了一个空便当盒，吃得干干净净，盒子上写着部长的名字。",
        "It's the office hanami, the spring picnic under the cherry blossoms. The newest employee went before dawn to spread the tarp and hold the spot. When everyone arrives at noon, the tarp's still there, but on it sits an empty bento box with the department head's name on it, licked clean.",
      ),
      roles: [
        role(t("新员工", "The new hire"), t("天没亮就来占位置", "Has held the spot since dawn"), t("你中间睡着了两个小时，位置差点被别的公司抢走。", "You fell asleep for two hours and nearly lost the spot to another company.")),
        role(t("课长", "The section manager"), t("赏樱会是他组织的", "Organized the hanami"), t("你跟部长说订的是最贵的便当，其实是便利店买的。", "You told the department head you ordered premium bento. They're from the convenience store.")),
        role(t("前辈", "The senior coworker"), t("什么都懂一点", "Knows a little about everything"), t("你偷偷带了自己做的饭团，因为你早就猜到便当是便利店的。", "You secretly brought your own rice balls, because you guessed the bento would be from the convenience store.")),
        role(t("派遣员工", "The temp"), t("合同下个月就到期", "Contract ends next month"), t("你口袋里装着简历，想在赏樱会上找下一份工作。", "You've got résumés in your pocket, hoping to network for your next job.")),
        role(t("隔壁公司的人", "Someone from the company next door"), t("他们的垫子就挨着", "Their tarp's right next to yours"), t("你们公司的人刚才偷偷把垫子往这边挪了一米。", "Your team just tried to inch your tarp a metre over.")),
        role(t("卖团子的小贩", "The dango vendor"), t("一上午都在这棵树下", "Under this tree all morning"), t("你早上把一盒卖不掉的团子偷偷放在了垫子上，想让他们买。", "This morning you left a box of unsold dango on their tarp, hoping they'd buy it.")),
      ],
      min: 4,
      culprit: t("吃了部长便当的人", "The one who ate the boss's bento"),
      culpritCard: t(
        "便当是你吃的：你以为是大家分着吃的，打开就吃光了，吃完才看见盒子上的名字。千万别承认，要说「我来的时候盒子就是空的」，还要说「乌鸦经常偷吃便当」。",
        "You ate it: you thought it was for sharing, opened it and finished it, and only then saw the name on the box. Don't admit it. Say it was empty when you got there, and mention that crows steal bentos all the time.",
      ),
      ask: t("是谁吃了部长的便当？", "Who ate the department head's bento?"),
      twist: t("部长打来电话：「我马上到。对了，便当里有一封我太太写的信，帮我收好。」", "The department head calls: “I'm on my way. Oh, and there's a letter from my wife in my bento. Keep it safe for me.”"),
    },
    {
      id: "jp-omiyage-box",
      kind: "office",
      level: "all",
      diff: "easy",
      title: t("少了一个的伴手礼", "One Omiyage Short"),
      setup: t(
        "同事出差回来，带了一盒伴手礼（omiyage，日本人出门回来分给同事的点心），正好一人一个。下午三点，最后一个人去拿，打开盒子，空了。",
        "A coworker back from a business trip brought omiyage, the box of local sweets you bring back for the office in Japan, exactly one each. At three o'clock the last person opens the box, and it's empty.",
      ),
      roles: [
        role(t("出差回来的同事", "The coworker back from the trip"), t("点心是他买的", "Bought the sweets"), t("你出差时偷偷多玩了一天，点心是回来那天在车站买的。", "You secretly took an extra day off on the trip and grabbed the sweets at the station on the way home.")),
        role(t("爱吃甜食的经理", "The manager with a sweet tooth"), t("办公桌抽屉里全是零食", "Desk drawer full of snacks"), t("你跟大家说你戒糖了。", "You told everyone you've quit sugar.")),
        role(t("实习生", "The intern"), t("不知道伴手礼是一人一个", "Didn't know it's one each"), t("你上个星期把大家的咖啡杯弄混了，到现在还没人发现。", "Last week you mixed up everyone's coffee mugs, and nobody's noticed yet.")),
        role(t("保洁阿姨", "The cleaner"), t("每天下午三点来打扫", "Comes through at three every day"), t("你每天都会带几块茶水间的零食回家给孙子。", "Every day you take a few snacks from the break room home to your grandson.")),
      ],
      min: 3,
      culprit: t("拿了两个的人", "The one who took two"),
      culpritCard: t(
        "你拿了两个：第一个你一口吞了，根本没尝出味道，就又拿了一个。千万别承认，要说「我只拿了一个」，还要问「盒子上写十二个，会不会其实只装了十一个？」",
        "You took two: you inhaled the first one without tasting it, so you took another. Don't admit it. Say you only took one, and wonder aloud whether the box said twelve but only had eleven.",
      ),
      ask: t("是谁拿了两个？", "Who took two?"),
      twist: t("出差回来的同事从包里又拿出一盒：「这盒是给部长的。」可盒子已经被打开过了。", "The traveller pulls a second box from their bag: “This one's for the department head.” It's already been opened."),
    },
    {
      id: "jp-otoshidama-envelopes",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("新年的压岁钱信封", "The New Year Envelopes"),
      setup: t(
        "日本过新年，大人们要给孩子压岁钱（otoshidama，装在小信封里）。今年的信封都长得一样，发完才发现：一个信封里装了两份钱，另一个是空的。",
        "At New Year in Japan, the grown-ups give the kids otoshidama, money in little envelopes. This year the envelopes all look the same, and after they're handed out, one turns out to hold double, and another is empty.",
      ),
      roles: [
        role(t("舅舅", "Uncle"), t("今年第一次给压岁钱", "Giving otoshidama for the first time this year"), t("你今年的奖金被扣了，其实每一块钱都心疼。", "Your bonus got cut this year, and secretly every yen hurts.")),
        role(t("姐姐", "The older sister"), t("帮大家装的信封", "Helped stuff the envelopes"), t("你给自己的孩子偷偷多装了一点。", "You slipped a little extra into your own kid's envelope.")),
        role(t("奶奶", "Grandma"), t("记得每个孙子孙女今年几岁", "Knows every grandchild's age by heart"), t("你偷偷用一部分压岁钱给自己买了一张演唱会门票。", "You quietly used some of the New Year money to buy yourself a concert ticket.")),
      ],
      min: 2,
      culprit: t("装错信封的人", "The one who mixed up the envelopes"),
      culpritCard: t(
        "是你装错的：你一边看电视一边装信封，一个装了两次，一个忘了装。千万别承认，要说「我只负责写名字」，还要说「信封都长一样，谁分得清」。",
        "You did it: you were stuffing envelopes in front of the TV and filled one twice and the other not at all. Don't admit it. Say you only wrote the names, and point out that the envelopes all look the same.",
      ),
      ask: t("是谁装错了信封？", "Who mixed up the envelopes?"),
      twist: t("拿到空信封的孩子说：「没关系，我已经拍照发到网上了，标题是《我家大人送我的新年礼物》。」", "The kid with the empty envelope pipes up: “That's okay. I already posted a photo online: ‘What my family gave me for New Year.’”"),
    },
  ]),

  /* ---------------------------------------------------------------- 伊朗 Iranian */
  ...g("ir", [
    {
      id: "ir-nowruz-haft-sin",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("新年桌上少了一样", "The Haft-Sin Table"),
      setup: t(
        "伊朗新年（诺鲁孜节，在春分那天）的前一晚，家里摆好了「七喜桌」（haft-sin：七样波斯语名字以 S 开头的东西，每一样都是新年的祝福）。早上起来，桌上只剩六样：那盘发芽的麦苗不见了。",
        "The night before Nowruz, the Persian New Year at the spring equinox, the family set up the haft-sin table: seven things whose Persian names start with “S,” each a wish for the year ahead. In the morning there are only six. The dish of sprouted wheat, the sabzeh, is gone.",
      ),
      roles: [
        role(t("妈妈", "Maman (Mom)"), t("麦苗是她泡了两个星期种出来的", "Grew the sabzeh herself over two weeks"), t("你第一次种的麦苗失败了，现在这盘是在花店买的。", "Your first batch of sprouts failed; this one's from the florist.")),
        role(t("爸爸", "Baba (Dad)"), t("新年的东西都是他去买的", "Did all the New Year shopping"), t("你把给亲戚买新年礼物的钱，拿去买了一套新音响。", "You spent the money for the relatives' New Year gifts on a new sound system.")),
        role(t("女儿", "The daughter"), t("大学生，带男朋友回家过节", "Brought her boyfriend home for the holiday"), t("你跟爸妈说男朋友会说波斯语，其实他只会说「你好」和「谢谢」。", "You told your parents your boyfriend speaks Farsi. He knows “hello” and “thank you.”")),
        role(t("外婆", "Grandma"), t("每年新年都讲同一个故事", "Tells the same New Year story every year"), t("你偷偷换了桌上的金鱼，原来那条前几天死了。", "You secretly replaced the goldfish on the table; the first one died a few days ago.")),
      ],
      min: 3,
      culprit: t("拿走麦苗的人", "The one who took the sabzeh"),
      culpritCard: t(
        "麦苗是你拿走的：半夜你不小心把它碰翻了，想天亮前偷偷补一盘，结果睡过头了。千万别承认，要说「肯定是猫干的」，可是你家没有猫。",
        "You took it: you knocked it over in the night and meant to replace it before dawn, but you overslept. Don't admit it. Say the cat must have done it, even though you don't have a cat.",
      ),
      ask: t("是谁拿走了麦苗？", "Who took the sabzeh?"),
      twist: t("门铃响了：舅舅一家提前来拜年，他们进门第一眼就会看那张桌子。", "The doorbell rings: the uncle's family has come early for New Year visits, and the first thing they'll look at is that table."),
    },
    {
      id: "ir-yalda-watermelon",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("雅尔达之夜的西瓜", "The Yalda Night Watermelon"),
      setup: t(
        "今晚是雅尔达之夜（Yalda，一年里最长的一夜，伊朗人一家人熬夜吃西瓜、石榴、读诗）。外婆特地留了一个西瓜，说要到半夜一起切。刚过十点，有人发现西瓜底下被挖了一个洞，里面空了一半。",
        "It's Yalda night, the longest night of the year, when Iranian families stay up late eating watermelon and pomegranate and reading poetry. Grandma saved a watermelon to cut at midnight. At ten o'clock, someone notices a hole carved in the bottom and half the inside scooped out.",
      ),
      roles: [
        role(t("外婆", "Grandma"), t("西瓜是她亲自挑的", "Picked the watermelon herself"), t("你答应今年读诗，可你把眼镜弄丢了，一个字都看不清。", "You promised to read the poems this year, but you've lost your glasses and can't see a word.")),
        role(t("小儿子", "The youngest son"), t("说自己在减肥", "Says he's on a diet"), t("你在阳台上偷偷藏了一盒石榴，打算一个人吃。", "You've hidden a box of pomegranates on the balcony, all for yourself.")),
        role(t("表姐", "The cousin"), t("从多伦多回来过节", "Home from Toronto for the holiday"), t("你答应带回来的枫糖浆，在行李箱里打翻了，整箱衣服都是黏的。", "The maple syrup you promised to bring spilled in your suitcase, and all your clothes are sticky.")),
      ],
      min: 2,
      culprit: t("偷挖西瓜的人", "The one who dug into the watermelon"),
      culpritCard: t(
        "是你挖的：你实在等不到半夜，从底下挖了一个洞，以为把瓜翻过来就没人发现。千万别承认，要说「这个瓜买回来就是这样的」。",
        "It was you: you couldn't wait till midnight, so you carved a hole in the bottom, figuring if you turned it over nobody would notice. Don't admit it. Say that's how it was when it came home from the store.",
      ),
      ask: t("是谁偷挖了西瓜？", "Who dug into the watermelon?"),
      twist: t("外婆拿出一本诗集：「按老规矩，每人随手翻一页，诗里写的就是你的心事。」她让每个人都大声念出来。", "Grandma brings out a book of poetry: “By tradition, open it anywhere and the poem tells your heart's secret.” Everyone has to read theirs out loud."),
    },
    {
      id: "ir-khastegari-tea",
      kind: "love",
      level: "all",
      diff: "easy",
      title: t("提亲那天的茶", "The Proposal Visit"),
      setup: t(
        "伊朗的传统提亲（khastegari）：男方一家正式上门拜访，女方亲手端茶出来。今天男方的妈妈往茶里放了一块糖，喝了一口，脸色就变了：糖罐里装的全是盐。",
        "It's a khastegari, the traditional visit where a young man's family formally comes to ask for a woman's hand, and she serves the tea herself. His mother drops a sugar cube in her tea, takes a sip, and her face changes: the sugar bowl is full of salt.",
      ),
      roles: [
        role(t("女方", "The bride-to-be"), t("今天要亲手端茶", "Serving the tea herself today"), t("你其实还没想好要不要嫁，今天是想先看看他的家人。", "You haven't actually decided yet; today you're just sizing up his family.")),
        role(t("男方", "The groom-to-be"), t("紧张得一直出汗", "Sweating with nerves"), t("你跟家里说你升职了，其实面试在下个月。", "You told your family you got promoted. The interview's next month.")),
        role(t("女方的爸爸", "Her father"), t("一直在问男方的工作", "Keeps grilling him about his job"), t("你心里偷偷希望女儿嫁给你老朋友的儿子。", "You're secretly hoping she'll marry your old friend's son instead.")),
        role(t("男方的妈妈", "His mother"), t("第一次正式来这家", "Her first formal visit to this house"), t("你来之前偷偷跟邻居打听过这家的所有事。", "Before coming, you quizzed the neighbours about everything in this family.")),
        role(t("女方的弟弟", "Her little brother"), t("十二岁，什么都敢说", "Twelve, and says whatever he thinks"), t("你收了男方二十块钱，答应在姐姐面前说他好话。", "The groom paid you twenty bucks to put in a good word with your sister.")),
        role(t("男方的姑姑", "His aunt"), t("说自己最会看人", "Claims she can read anyone"), t("你跟别人打了赌，赌这门亲事成不了。", "You bet someone this match won't happen.")),
      ],
      min: 4,
      culprit: t("把盐放进糖罐的人", "The one who swapped the salt and sugar"),
      culpritCard: t(
        "是你弄的：刚才你进厨房帮忙拿点心，顺手把糖罐和盐罐放反了，后来发现了也没敢说。千万别承认，要说「我今天一直坐在客厅」，还要说「谁都知道厨房那两个罐子一模一样」。",
        "It was you: you popped into the kitchen to help bring out the sweets, put the salt and sugar jars back in each other's places, and noticed too late to say anything. Don't admit it. Say you've been in the living room all day, and add that everyone knows those two jars look identical.",
      ),
      ask: t("糖罐里的盐是谁弄的？", "Who swapped the salt and sugar?"),
      twist: t("男方的妈妈放下茶杯：「再给我倒一杯。」然后把咸茶递给儿子：「你也尝尝。」", "His mother sets down her cup: “Pour me another.” Then she hands the salty tea to her son: “You try it too.”"),
    },
  ]),

  /* ---------------------------------------------------------------- 欧洲 European */
  ...g("eu", [
    {
      id: "eu-christmas-market-cashbox",
      kind: "crime",
      level: "all",
      diff: "easy",
      title: t("圣诞市集的钱箱", "The Christmas Market Cash Box"),
      setup: t(
        "欧洲小镇的圣诞市集上，一个卖热巧克力和姜饼的小摊收摊时发现，钱箱里少了一百欧元。一晚上摊位后面只有这几个人。",
        "At a small-town Christmas market in Europe, a stall selling hot chocolate and gingerbread closes for the night and finds €100 missing from the cash box. Only these few people were behind the counter all evening.",
      ),
      roles: [
        role(t("摊主", "The stall owner"), t("这个摊子开了三十年", "Has run this stall for thirty years"), t("你今年偷偷涨了价，价目牌却没改。", "You quietly raised your prices this year without changing the sign.")),
        role(t("来帮忙的侄女", "The niece helping out"), t("放寒假来打工", "Working the holidays"), t("你一晚上都在免费给自己的朋友送热巧克力。", "You've been giving your friends free hot chocolate all night.")),
        role(t("隔壁摊的木雕师傅", "The woodcarver from the next stall"), t("一晚上一直过来借零钱", "Kept coming over to borrow change"), t("你借的零钱一直没还，加起来有三十欧。", "You've borrowed €30 in change tonight and haven't paid it back.")),
        role(t("扮圣诞老人的人", "The man playing Santa"), t("在摊子旁边和小孩合影", "Taking photos with kids by the stall"), t("你今晚本来还该去另一个市集扮圣诞老人，你接了两份活。", "You're supposed to be Santa at another market tonight too; you double-booked.")),
      ],
      min: 3,
      culprit: t("拿了一百欧的人", "The one who took the €100"),
      culpritCard: t(
        "钱是你拿的：刚才零钱不够，你从钱箱里拿了一张一百欧去隔壁换零钱，换回来的钱塞进了自己的口袋，忘了放回去。要说「我一晚上都在搅热巧克力」，还要说「刚才有个客人找错了钱」。",
        "You took it: you ran short of change, took a €100 note from the box to break at the next stall, then stuffed the change in your own pocket and forgot. Say you've been stirring hot chocolate all night, and mention a customer who got the wrong change earlier.",
      ),
      ask: t("一百欧去哪了？", "Where did the €100 go?"),
      twist: t("一个小孩跑过来：「圣诞老人，我在雪地里捡到好多硬币！」", "A kid runs up: “Santa, I found loads of coins in the snow!”"),
    },
    {
      id: "eu-eurovision-scores",
      kind: "show",
      level: "all",
      diff: "easy",
      title: t("欧洲歌唱大赛之夜", "Eurovision Night"),
      setup: t(
        "朋友们在家开「欧洲歌唱大赛」派对（Eurovision，欧洲各国比赛唱歌的年度盛事，大家边看边打分）。每人一张评分表，最后加起来选出「客厅冠军」。可算分时发现有一张表被人改过：当晚最难听的那首歌，被改成了满分。",
        "Friends are throwing a Eurovision party, the huge annual song contest where European countries compete and everyone at home keeps score. Each guest has a scoresheet, to be added up for the “living-room champion.” But at the count, one sheet has been doctored: the worst song of the night now has full marks.",
      ),
      roles: [
        role(t("派对主人", "The host"), t("每年都办这个派对", "Throws this party every year"), t("你偷偷押了这首歌会赢，赌注是请一顿饭。", "You've secretly bet a dinner on this song winning.")),
        role(t("算分的朋友", "The scorekeeper"), t("拿着计算器的人", "The one with the calculator"), t("你数学很差，前面几轮的分数其实都是估的。", "Your maths is terrible; you've been estimating every round.")),
        role(t("从意大利来的同事", "The colleague from Italy"), t("第一次参加这种派对", "First Eurovision party"), t("你只给自己国家打了满分，别的都是随便打的。", "You gave full marks to your own country and guessed the rest.")),
        role(t("带零食来的邻居", "The neighbour who brought snacks"), t("一晚上都在厨房", "In the kitchen all night"), t("你带来的「自己做的」蛋糕其实是买的。", "The “homemade” cake you brought is store-bought.")),
        role(t("超级粉丝", "The superfan"), t("穿着去年冠军的演出服", "Wearing last year's winner's costume"), t("你偷偷给一首歌的官方投票打了二十次电话。", "You secretly called the official vote line twenty times for one song.")),
        role(t("迟到的人", "The latecomer"), t("前半场没看到", "Missed the first half"), t("你前半场的分数是抄别人的。", "You copied someone else's scores for the first half.")),
      ],
      min: 4,
      culprit: t("改评分表的人", "The one who doctored the scoresheet"),
      culpritCard: t(
        "是你改的：那首最难听的歌是你最好的朋友写的，你想让它至少在这个客厅里赢一次。要说「我的表一直在我手里」，还要提醒大家「算分的人刚才离开过」。",
        "You did it: that terrible song was written by your best friend, and you wanted it to win somewhere, even just in this living room. Say your sheet never left your hands, and point out that the scorekeeper stepped away earlier.",
      ),
      ask: t("是谁改了评分表？", "Who doctored the scoresheet?"),
      twist: t("电视上宣布今年的冠军：就是那首最难听的歌。", "The TV announces this year's winner: the worst song of the night."),
    },
    {
      id: "eu-nonna-sauce",
      kind: "family",
      level: "all",
      diff: "easy",
      title: t("奶奶的秘方", "Nonna's Sauce"),
      setup: t(
        "意大利家庭的周日午饭，大家都夸今天的番茄酱汁「跟奶奶做的一模一样」。可有人在回收桶里发现了一个超市卖的罐装酱汁的空瓶子。",
        "Sunday lunch with the Italian side of the family, and everyone's raving that today's sauce tastes “exactly like Nonna's.” Then someone finds an empty jar of supermarket sauce in the recycling.",
      ),
      roles: [
        role(t("今天掌勺的姑姑", "Zia Lucia, cooking today"), t("第一次接手奶奶的秘方", "Taking over Nonna's recipe for the first time"), t("你偷偷改了奶奶的秘方，大蒜多放了一倍。", "You secretly changed Nonna's recipe and doubled the garlic.")),
        role(t("女婿", "The son-in-law"), t("不会做饭，负责摆桌子", "Can't cook; on table duty"), t("你打碎了奶奶最喜欢的那个大盘子，把碎片藏在了柜子最里面。", "You broke Nonna's favourite serving dish and hid the pieces at the back of the cupboard.")),
        role(t("奶奶", "Nonna"), t("今年第一次只坐着吃", "Just eating this year, for the first time"), t("你其实很多年前就把秘方写下来给了邻居，一直没告诉家里人。", "You gave the secret recipe to the neighbour years ago and never told the family.")),
      ],
      min: 2,
      culprit: t("用了罐装酱汁的人", "The one who used the jarred sauce"),
      culpritCard: t(
        "瓶子是你的：早上熬的酱汁糊了，你偷偷跑去超市买了一瓶，倒进锅里，加了点罗勒。要说「我一早上都不在厨房」，还要说「那个瓶子是上个星期的」。",
        "The jar's yours: this morning's sauce burned, so you snuck out to the supermarket, poured a jar into the pot and added some basil. Say you were out of the kitchen all morning, and that the jar's been in the recycling since last week.",
      ),
      ask: t("是谁用了罐装酱汁？", "Who used the jarred sauce?"),
      twist: t("奶奶尝了一口，放下叉子：「这个味道……跟我妈妈做的一模一样。」", "Nonna takes a bite and sets down her fork: “This tastes... exactly like my mother's.”"),
    },
  ]),
];
