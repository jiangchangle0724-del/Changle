import type { T } from "../i18n";

/**
 * 戏精大赏 · Drama Queens: the scene library.
 *
 * A scene is a short improv set-up for 2 to 4 actors. Everyone sees the title, the set-up and the
 * cast list; each actor also gets a private card. One actor, picked at random each time, is secretly
 * the culprit (the 小三, the killer, the mole...) and gets `culpritCard` instead of their own
 * `alibi`; the audience watches, then votes who the culprit is and rates how convincing each actor
 * was. So:
 *
 * - any role can turn out to be the culprit: write `culpritCard` so it fits whoever gets it;
 * - every innocent `alibi` is a small secret of its own that makes that actor act a little guilty
 *   too (that is what makes the guessing hard);
 * - `twist` lands on every phone halfway through and should shake the scene up for everyone.
 *
 * `level`: "all" is fine for any table (family, office, school); "spicy" (微辣) allows affairs,
 * exes, palace schemes, money and scandal, but nothing sexual, no slurs, no real people.
 * `diff`: "easy" scenes are obvious set-ups with 2 or 3 roles; "hard" ones have 3 or 4 roles, a
 * subtler culprit and red herrings that point several ways.
 *
 * Chinese and English are both first-class: write the English as a native would say it, not a
 * translation (names, food and jokes may differ between the two).
 */

export type DramaKind = "family" | "love" | "office" | "crime" | "palace" | "show";
export type DramaLevel = "all" | "spicy";
export type DramaDiff = "easy" | "hard";

export type DramaRole = {
  /** on the cast list: 婆婆, 新郎, 管家 */
  name: T;
  /** what everyone knows about this character (read with the set-up) */
  brief: T;
  /** this actor's private card when innocent: a secret of their own that makes them look guilty */
  alibi: T;
};

export type DramaScene = {
  /** unique, kebab-case */
  id: string;
  kind: DramaKind;
  level: DramaLevel;
  diff: DramaDiff;
  title: T;
  /** the public premise, one or two sentences */
  setup: T;
  /** 2 to 4 roles; any one of them may secretly be the culprit */
  roles: DramaRole[];
  /** the hidden identity the audience hunts for */
  culprit: T;
  /** the culprit's private card: what they did and what to hide */
  culpritCard: T;
  /** the audience's question when voting */
  ask: T;
  /** pushed to every phone halfway through the scene */
  twist: T;
};

const t = (zh: string, en: string): T => ({ zh, en });
const role = (name: T, brief: T, alibi: T): DramaRole => ({ name, brief, alibi });

export const KINDS: { key: DramaKind; name: T }[] = [
  { key: "family", name: t("家庭伦理", "Family drama") },
  { key: "love", name: t("恋爱修罗场", "Love triangle") },
  { key: "office", name: t("职场风云", "Office politics") },
  { key: "crime", name: t("悬疑凶案", "Whodunit") },
  { key: "palace", name: t("古装宫斗", "Palace intrigue") },
  { key: "show", name: t("直播综艺", "Live show") },
];

export const SCENES: DramaScene[] = [
  {
    id: "family-new-year-dumplings",
    kind: "family",
    level: "all",
    diff: "easy",
    title: t("年夜饭的硬币饺子", "The Lucky Coin Dumpling"),
    setup: t(
      "除夕夜，奶奶包了一个藏硬币的饺子，说吃到的人明年发大财。饺子端上桌之前，那个饺子不见了。",
      "New Year's Eve. Grandma hid a coin in one dumpling, and whoever finds it gets rich next year. Before the dumplings even reach the table, that one has vanished.",
    ),
    roles: [
      role(t("奶奶", "Grandma"), t("包了一下午饺子，全家她说了算", "Spent all afternoon folding dumplings; her word is law"), t("你自己偷吃了两个肉饺子，嘴里还有韭菜味", "You sneaked two dumplings yourself and still smell of chives")),
      role(t("大孙子", "Eldest grandson"), t("刚失业，正愁明年的房租", "Just lost his job and is worried about next year's rent"), t("你还没告诉家里你失业了，千万别露馅", "You haven't told anyone you lost your job. Don't let it slip")),
      role(t("小姑", "Auntie"), t("每年都抢着洗碗，其实是去厨房打电话", "Always volunteers to wash up, really to take calls in the kitchen"), t("你在厨房偷偷给男朋友打视频，被看到了就说在看饺子", "You were video-calling a secret boyfriend in the kitchen; say you were checking the dumplings")),
    ],
    culprit: t("偷饺子的人", "The dumpling thief"),
    culpritCard: t("硬币饺子是你偷吃的，硬币还藏在你兜里。别承认，把嫌疑推给别人。", "You ate the coin dumpling and the coin is in your pocket. Deny everything and point at someone else."),
    ask: t("谁偷吃了硬币饺子？", "Who ate the coin dumpling?"),
    twist: t("奶奶宣布：吃到硬币的人，今年的红包全归他！", "Grandma announces: whoever has the coin gets every red envelope this year!"),
  },
  {
    id: "love-anniversary-gift",
    kind: "love",
    level: "spicy",
    diff: "easy",
    title: t("纪念日的第二份礼物", "The Second Anniversary Gift"),
    setup: t(
      "情侣三周年纪念日，男方的车里被发现了一份包好的名牌香水，可他送给女朋友的是一束花。",
      "It's their third anniversary. A wrapped designer perfume turns up in his car, but the gift he gave his girlfriend was flowers.",
    ),
    roles: [
      role(t("女朋友", "Girlfriend"), t("在车上找手机充电器时发现了香水", "Found the perfume looking for a phone charger in the car"), t("你上周偷偷查过他手机，不能让他知道", "You went through his phone last week and he must never find out")),
      role(t("男朋友", "Boyfriend"), t("说香水是给妈妈的生日礼物", "Says the perfume is a birthday present for his mum"), t("你其实忘了纪念日，花是在加油站临时买的", "You forgot the anniversary; the flowers came from a gas station an hour ago")),
      role(t("闺蜜", "Best friend"), t("刚好来送蛋糕，和两个人都很熟", "Just dropped by with a cake; close to both of them"), t("你和男朋友偷偷在策划求婚，香水是道具", "You and the boyfriend are secretly planning a proposal, and the perfume is a prop")),
    ],
    culprit: t("小三", "The other woman"),
    culpritCard: t("你就是那个小三，香水是送给你的。别让女朋友看出来，必要时装得比谁都关心她。", "You're the other woman and the perfume is for you. Keep the girlfriend from noticing; if you must, act like her biggest supporter."),
    ask: t("谁是小三？", "Who's the other woman?"),
    twist: t("香水盒里掉出一张卡片：『给我的宝贝，老地方见』", "A card falls out of the perfume box: 'For my baby. Same place as always.'"),
  },
  {
    id: "office-missing-bonus",
    kind: "office",
    level: "all",
    diff: "hard",
    title: t("消失的年终奖", "The Missing Bonus"),
    setup: t(
      "年会前一小时，财务发现装年终奖红包的箱子少了一个最厚的。老板要求在场的人当场说清楚。",
      "An hour before the year-end party, Finance finds the fattest bonus envelope missing from the box. The boss wants answers from everyone in the room, now.",
    ),
    roles: [
      role(t("老板", "Boss"), t("抠门出名，今年第一次发大红包", "Famously stingy; first big bonus in years"), t("你其实把年终奖缩水了一半，怕被员工发现", "You quietly halved everyone's bonus and are afraid they'll find out")),
      role(t("财务", "Accountant"), t("箱子一直锁在她的柜子里", "The box was locked in her cabinet the whole time"), t("你把柜子钥匙借给了实习生，没登记", "You lent the cabinet key to the intern and didn't log it")),
      role(t("实习生", "Intern"), t("最后一个下班，什么都看见了", "Last to leave the office; saw everything"), t("你偷偷用公司打印机印了一百张简历准备跳槽", "You printed a hundred résumés on the company printer for your job hunt")),
      role(t("销售冠军", "Top salesperson"), t("业绩第一，以为最厚的那个是自己的", "Number one in sales; assumed the fattest envelope was theirs"), t("你的业绩有一半是做假单冲的", "Half your sales this year were fake orders")),
    ],
    culprit: t("内鬼", "The insider"),
    culpritCard: t("红包是你拿的，就藏在你的包里。你要装得比谁都着急，还要找机会把怀疑引到别人身上。", "You took the envelope and it's in your bag. Act more upset than anyone and steer suspicion onto someone else."),
    ask: t("谁拿了红包？", "Who took the envelope?"),
    twist: t("保安来电：监控拍到一个人在箱子前蹲了三分钟。", "Security calls: the camera caught someone crouching by the box for three minutes."),
  },
  {
    id: "crime-mansion-wine",
    kind: "crime",
    level: "all",
    diff: "hard",
    title: t("庄园里的红酒杯", "The Wine Glass at the Manor"),
    setup: t(
      "富豪的生日晚宴上灯突然灭了十秒，灯再亮的时候，富豪最爱的古董红酒被人倒进了花盆，酒窖钥匙也不见了。",
      "At a millionaire's birthday dinner the lights go out for ten seconds. When they come back, his priceless vintage wine has been poured into a plant pot and the cellar key is gone.",
    ),
    roles: [
      role(t("管家", "Butler"), t("在庄园工作三十年，钥匙平时由他保管", "Thirty years at the manor; usually keeps the keys"), t("你一直在偷偷把好酒换成便宜酒拿去卖", "You've been swapping the good wine for cheap bottles and selling the rest")),
      role(t("大少爷", "Heir"), t("欠了一屁股赌债", "Up to his neck in gambling debts"), t("停电那十秒你在给债主发短信求宽限", "During the blackout you were texting your bookie for more time")),
      role(t("私人医生", "Private doctor"), t("说富豪的心脏受不了刺激", "Says the old man's heart can't take a shock"), t("你开的药其实是维生素，收的是天价诊费", "The pills you prescribe are vitamins and you bill a fortune")),
    ],
    culprit: t("凶手", "The culprit"),
    culpritCard: t("酒是你倒的，钥匙在你身上。你要给出一个完美的不在场证明，再把大家的注意力引向别人。", "You poured the wine and you have the key. Give yourself a perfect alibi and turn everyone's attention elsewhere."),
    ask: t("谁是凶手？", "Who did it?"),
    twist: t("花盆里除了红酒，还发现了一枚袖扣。", "Besides the wine, there's a cufflink in the plant pot."),
  },
  {
    id: "palace-poisoned-soup",
    kind: "palace",
    level: "spicy",
    diff: "hard",
    title: t("御膳房的那碗汤", "The Soup from the Imperial Kitchen"),
    setup: t(
      "皇上喝了一口贵妃送来的莲子汤就腹痛不止。太医说汤里被人加了料，而这碗汤经过了好几个人的手。",
      "The emperor takes one sip of the lotus soup the Noble Consort sent and doubles over. The physician says someone tampered with it, and the bowl passed through several hands.",
    ),
    roles: [
      role(t("贵妃", "Noble Consort"), t("汤是她宫里送来的，最受宠", "The soup came from her palace; the emperor's favourite"), t("你偷偷让御膳房多放了糖，想让皇上觉得你的汤最好喝", "You had the kitchen add extra sugar so your soup would taste best")),
      role(t("新来的才人", "New concubine"), t("刚进宫三天，就被皇上召见了两次", "Three days at court and already summoned twice"), t("你进宫前有个青梅竹马，玉佩还藏在身上", "You have a childhood sweetheart outside the palace and still carry his jade pendant")),
      role(t("太监总管", "Chief eunuch"), t("汤是他亲手端给皇上的", "Carried the bowl to the emperor himself"), t("你收了好几位娘娘的银子，答应帮她们说好话", "You've taken silver from several consorts to put in a good word")),
      role(t("宫女", "Maid"), t("在御膳房打下手，看过熬汤全过程", "Helps in the kitchen; watched the soup being made"), t("你打碎了贵妃最爱的玉碗，偷偷换成了一个差不多的", "You broke the consort's favourite jade bowl and swapped in a look-alike")),
    ],
    culprit: t("下毒的人", "The poisoner"),
    culpritCard: t("巴豆是你下的，想让别人背锅。说话要滴水不漏，适当的时候哭一哭、跪一跪。", "You slipped the purgative in so someone else would take the fall. Speak carefully, and weep or kneel when it helps."),
    ask: t("谁在汤里下了药？", "Who tampered with the soup?"),
    twist: t("太医在汤碗底发现了一根长发，还有淡淡的胭脂味。", "The physician finds a long hair at the bottom of the bowl, and a faint smell of rouge."),
  },
  {
    id: "show-livestream-sales",
    kind: "show",
    level: "all",
    diff: "easy",
    title: t("翻车的直播带货", "The Livestream That Crashed"),
    setup: t(
      "网红直播间正在卖『神奇不粘锅』，直播到一半，锅当场粘住了鸡蛋。弹幕炸了，有人故意捣乱。",
      "A famous live-stream is selling the 'miracle non-stick pan', and halfway through the egg sticks on camera. The comments explode: someone sabotaged it.",
    ),
    roles: [
      role(t("主播", "Host"), t("百万粉丝，靠嘴皮子吃饭", "A million followers; lives by the gift of the gab"), t("你自己都没用过这个锅", "You've never actually used the pan")),
      role(t("助播", "Sidekick"), t("负责递东西和喊『三二一上链接』", "Hands things over and shouts 'three, two, one, link's up!'"), t("你在别的直播间也偷偷接了广告", "You're secretly doing ads for a rival stream too")),
      role(t("厂家代表", "Factory rep"), t("坐在镜头外，盯着销量", "Sits off camera watching the sales numbers"), t("这批锅其实是去年的库存", "This batch is last year's leftover stock")),
    ],
    culprit: t("捣乱的人", "The saboteur"),
    culpritCard: t("锅上的胶是你抹的，你收了竞争对手的钱。要表现得很专业，还要帮忙『救场』。", "You smeared the glue on the pan; a rival paid you. Act professional and help 'save the show'."),
    ask: t("谁搞砸了直播？", "Who sabotaged the stream?"),
    twist: t("直播间突然涌进来十万人，全在刷『退钱』。", "A hundred thousand viewers flood in, all spamming 'refund'."),
  },
];

/** A private rule for each actor on top of their card. */
export const TASKS: Record<DramaDiff, T[]> = {
  easy: [
    t("台词里说出『榴莲』", "Say the word 'durian'"),
    t("每句话结尾加一个『呢』", "End every sentence with 'you know'"),
    t("至少叹三次气", "Sigh at least three times"),
    t("夸一次别人的衣服", "Compliment someone's outfit once"),
    t("用手机当道具打一个电话", "Use your phone as a prop and take a call"),
    t("说一句英文（中文场）或一句中文（英文场）", "Slip in one line in the other language"),
  ],
  hard: [
    t("全程不能说『我』", "Never say 'I'"),
    t("说话时一直摸自己的耳朵", "Keep touching your ear while you talk"),
    t("突然唱一句歌", "Burst into a line of song"),
    t("哭一次，要真的挤出眼泪", "Cry once, with real tears"),
    t("把一个人的名字叫错三次", "Get someone's name wrong three times"),
    t("用一句成语或谚语收尾", "Finish on a proverb"),
  ],
};

/** 演技 PK: two actors say the same line in two different styles. */
export const PK_LINES: T[] = [
  t("这道菜是谁做的？", "Who made this?"),
  t("你终于来了。", "So you finally showed up."),
  t("我们分手吧。", "I think we should break up."),
  t("这个月的工资还没发。", "This month's pay still hasn't come in."),
  t("你看我今天有什么不一样？", "Notice anything different about me today?"),
  t("门没锁。", "The door was unlocked."),
];

export const PK_STYLES: { s: T; level: DramaLevel }[] = [
  { s: t("刚失恋", "Just got dumped"), level: "all" },
  { s: t("中了彩票", "Just won the lottery"), level: "all" },
  { s: t("被老板骂了", "Just got chewed out by the boss"), level: "all" },
  { s: t("刚睡醒", "Just woke up"), level: "all" },
  { s: t("琼瑶剧女主", "Melodrama heroine"), level: "all" },
  { s: t("新闻主播", "News anchor"), level: "all" },
  { s: t("霸道总裁", "Domineering CEO"), level: "all" },
  { s: t("喝多了", "One drink too many"), level: "spicy" },
  { s: t("撩人", "Flirting hard"), level: "spicy" },
];

/** When the table plays for exercise or pranks instead of drinks. */
export const PENALTIES: { move: Record<DramaDiff, T[]>; prank: Record<DramaLevel, T[]> } = {
  move: {
    easy: [t("10 个深蹲", "10 squats"), t("10 个开合跳", "10 jumping jacks"), t("平板支撑 20 秒", "Plank for 20 seconds"), t("5 个俯卧撑", "5 push-ups")],
    hard: [t("20 个深蹲", "20 squats"), t("15 个俯卧撑", "15 push-ups"), t("平板支撑 45 秒", "Plank for 45 seconds"), t("30 个开合跳", "30 jumping jacks")],
  },
  prank: {
    all: [
      t("用撒娇的语气对每个人说『人家错了嘛』", "Tell everyone 'I'm so sorry' in your cutest voice"),
      t("学一种动物叫三声", "Do three animal noises"),
      t("给左边的人捶背 30 秒", "Give the person on your left a 30-second shoulder rub"),
      t("用播音腔念一遍自己的微信签名", "Read your status message like a news anchor"),
    ],
    spicy: [
      t("对右边的人深情告白一句", "Make a heartfelt confession to the person on your right"),
      t("用最妖娆的姿势走一圈", "Strut once around the room, full diva"),
      t("让大家翻你手机相册的最后一张照片", "Let everyone see the last photo in your camera roll"),
    ],
  },
};
