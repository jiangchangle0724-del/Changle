import type { T } from "../i18n";

const s = (zh: string, en: string): T => ({ zh, en });

/** A forehead note: what it says, plus other ways people might name it when they guess. */
export type Note = { t: T; alias?: string[] };
const n = (zh: string, en: string, ...alias: string[]): Note => ({ t: s(zh, en), alias });

/** Notes for the online forehead game when a player lets the deck choose. */
export const NOTES: Note[] = [
  n("孙悟空", "Sun Wukong", "悟空", "美猴王", "齐天大圣", "monkey king", "wukong"),
  n("猪八戒", "Zhu Bajie", "八戒", "pigsy"),
  n("哪吒", "Nezha", "nezha", "ne zha"),
  n("嫦娥", "Chang'e", "change", "chang e", "moon goddess"),
  n("哈利·波特", "Harry Potter", "哈利波特", "harry"),
  n("皮卡丘", "Pikachu"),
  n("米老鼠", "Mickey Mouse", "米奇", "mickey"),
  n("蜘蛛侠", "Spider-Man", "spiderman", "spider man"),
  n("超人", "Superman"),
  n("蝙蝠侠", "Batman"),
  n("钢铁侠", "Iron Man", "ironman"),
  n("白雪公主", "Snow White"),
  n("灰姑娘", "Cinderella", "辛德瑞拉"),
  n("美人鱼", "Mermaid", "小美人鱼", "little mermaid", "ariel"),
  n("圣诞老人", "Santa Claus", "santa", "father christmas"),
  n("福尔摩斯", "Sherlock Holmes", "sherlock"),
  n("匹诺曹", "Pinocchio", "木偶奇遇记"),
  n("小猪佩奇", "Peppa Pig", "佩奇", "peppa"),
  n("海绵宝宝", "SpongeBob", "spongebob squarepants", "sponge bob"),
  n("哆啦A梦", "Doraemon", "机器猫", "叮当猫", "多啦a梦"),
  n("蜡笔小新", "Crayon Shin-chan", "小新", "shinchan", "shin chan"),
  n("加菲猫", "Garfield"),
  n("史努比", "Snoopy"),
  n("马里奥", "Mario", "马力欧", "super mario", "超级马里奥"),
  n("艾莎", "Elsa", "爱莎", "冰雪女王"),
  n("小熊维尼", "Winnie the Pooh", "维尼", "pooh", "winnie"),
  n("唐老鸭", "Donald Duck", "donald"),
  n("美国队长", "Captain America"),
  n("绿巨人", "The Hulk", "hulk", "浩克"),
  n("柯南", "Detective Conan", "名侦探柯南", "conan", "江户川柯南"),
  n("奥特曼", "Ultraman"),
  n("葫芦娃", "Calabash Brothers", "calabash brother", "calabash kid"),
  n("关羽", "Guan Yu", "关公", "关二爷"),
  n("诸葛亮", "Zhuge Liang", "孔明", "zhuge"),
  n("秦始皇", "Qin Shi Huang", "嬴政", "first emperor"),
  n("武则天", "Wu Zetian", "empress wu"),
  n("李白", "Li Bai", "li po"),
  n("孔子", "Confucius", "孔夫子"),
  n("爱因斯坦", "Albert Einstein", "einstein"),
  n("拿破仑", "Napoleon", "napoleon bonaparte"),
  n("莎士比亚", "Shakespeare", "william shakespeare"),
  n("蒙娜丽莎", "Mona Lisa"),
  n("达·芬奇", "Leonardo da Vinci", "达芬奇", "da vinci", "leonardo"),
  n("牛顿", "Isaac Newton", "newton"),
  n("贝多芬", "Beethoven"),
  n("梵高", "Van Gogh", "vincent van gogh"),
  n("埃及艳后", "Cleopatra", "克娄巴特拉"),
  n("成吉思汗", "Genghis Khan"),
  n("熊猫", "Panda", "大熊猫", "giant panda"),
  n("长颈鹿", "Giraffe"),
  n("企鹅", "Penguin"),
  n("袋鼠", "Kangaroo"),
  n("恐龙", "Dinosaur", "霸王龙", "t rex"),
  n("章鱼", "Octopus"),
  n("考拉", "Koala", "树袋熊"),
  n("树懒", "Sloth"),
  n("独角兽", "Unicorn"),
  n("龙", "Dragon", "中国龙"),
  n("吸血鬼", "Vampire", "德古拉", "dracula"),
  n("机器人", "Robot"),
  n("外星人", "Alien"),
  n("僵尸", "Zombie", "丧尸"),
  n("忍者", "Ninja"),
  n("海盗", "Pirate"),
  n("宇航员", "Astronaut", "航天员"),
  n("魔术师", "Magician"),
  n("厨师", "Chef", "cook"),
  n("医生", "Doctor"),
  n("消防员", "Firefighter", "fireman"),
  n("榴莲", "Durian"),
  n("珍珠奶茶", "Bubble Tea", "奶茶", "boba", "bubble milk tea"),
  n("火锅", "Hot Pot", "hotpot"),
  n("饺子", "Dumplings", "dumpling"),
  n("披萨", "Pizza", "比萨"),
  n("寿司", "Sushi"),
  n("自由女神像", "Statue of Liberty", "自由女神"),
  n("埃菲尔铁塔", "Eiffel Tower", "巴黎铁塔"),
  n("长城", "The Great Wall", "万里长城", "great wall"),
  n("金字塔", "Pyramids", "pyramid"),
  n("泰坦尼克号", "Titanic"),
  n("月亮", "The Moon", "moon", "月球"),
];

/** Which shelf of the deck picker a deck is on. */
export type DeckGroup = "classic" | "party" | "world";
export type HeadsDeck = { id: string; name: T; group: DeckGroup; words: T[] };

/**
 * The one-phone forehead game: hold it up, the others give clues. The first three words of each
 * deck are its sample on the picker. Every word works as a clue in either language: a mixed table
 * reads the word in theirs, the other one under it.
 */
export const HEADS_DECKS: HeadsDeck[] = [
  {
    id: "animals",
    group: "classic",
    name: s("动物", "Animals"),
    words: [
      s("猫", "Cat"), s("狗", "Dog"), s("大象", "Elephant"), s("长颈鹿", "Giraffe"), s("企鹅", "Penguin"), s("袋鼠", "Kangaroo"),
      s("猴子", "Monkey"), s("熊猫", "Panda"), s("狮子", "Lion"), s("老虎", "Tiger"), s("蛇", "Snake"), s("青蛙", "Frog"),
      s("鸭子", "Duck"), s("兔子", "Rabbit"), s("猪", "Pig"), s("鸡", "Chicken"), s("马", "Horse"), s("奶牛", "Cow"),
      s("绵羊", "Sheep"), s("鲨鱼", "Shark"), s("海豚", "Dolphin"), s("章鱼", "Octopus"), s("螃蟹", "Crab"), s("乌龟", "Turtle"),
      s("蝴蝶", "Butterfly"), s("蜜蜂", "Bee"), s("蚊子", "Mosquito"), s("蜘蛛", "Spider"), s("猫头鹰", "Owl"), s("鹦鹉", "Parrot"),
      s("孔雀", "Peacock"), s("火烈鸟", "Flamingo"), s("骆驼", "Camel"), s("斑马", "Zebra"), s("河马", "Hippo"), s("犀牛", "Rhino"),
      s("松鼠", "Squirrel"), s("刺猬", "Hedgehog"), s("树懒", "Sloth"), s("考拉", "Koala"), s("狐狸", "Fox"), s("狼", "Wolf"),
      s("恐龙", "Dinosaur"), s("海狸", "Beaver"), s("驼鹿", "Moose"),
    ],
  },
  {
    id: "food",
    group: "classic",
    name: s("吃的喝的", "Food & Drink"),
    words: [
      s("火锅", "Hot pot"), s("饺子", "Dumplings"), s("包子", "Steamed bun"), s("面条", "Noodles"), s("寿司", "Sushi"), s("披萨", "Pizza"),
      s("汉堡", "Burger"), s("薯条", "Fries"), s("炸鸡", "Fried chicken"), s("北京烤鸭", "Peking duck"), s("小笼包", "Soup dumplings"), s("煎饼果子", "Jianbing"),
      s("臭豆腐", "Stinky tofu"), s("榴莲", "Durian"), s("西瓜", "Watermelon"), s("香蕉", "Banana"), s("菠萝", "Pineapple"), s("柠檬", "Lemon"),
      s("珍珠奶茶", "Bubble tea"), s("咖啡", "Coffee"), s("啤酒", "Beer"), s("红酒", "Red wine"), s("可乐", "Cola"), s("冰淇淋", "Ice cream"),
      s("巧克力", "Chocolate"), s("生日蛋糕", "Birthday cake"), s("爆米花", "Popcorn"), s("月饼", "Mooncake"), s("粽子", "Zongzi"), s("汤圆", "Tangyuan"),
      s("方便面", "Instant noodles"), s("烤串", "Skewers"), s("牛排", "Steak"), s("三明治", "Sandwich"), s("热狗", "Hot dog"), s("甜甜圈", "Donut"),
      s("煎蛋", "Fried egg"), s("辣椒", "Chili pepper"), s("大蒜", "Garlic"), s("枫糖浆", "Maple syrup"), s("肉汁奶酪薯条", "Poutine"),
    ],
  },
  {
    id: "act",
    group: "classic",
    name: s("动作表演", "Act It Out"),
    words: [
      s("刷牙", "Brushing teeth"), s("开车", "Driving"), s("游泳", "Swimming"), s("打篮球", "Playing basketball"), s("骑自行车", "Riding a bike"), s("弹钢琴", "Playing piano"),
      s("打电话", "On the phone"), s("自拍", "Taking a selfie"), s("跳绳", "Jumping rope"), s("钓鱼", "Fishing"), s("化妆", "Putting on makeup"), s("洗澡", "Taking a shower"),
      s("睡觉", "Sleeping"), s("打喷嚏", "Sneezing"), s("求婚", "Proposing"), s("踢足球", "Playing soccer"), s("打拳击", "Boxing"), s("冲浪", "Surfing"),
      s("滑雪", "Skiing"), s("跳舞", "Dancing"), s("唱 K", "Karaoke"), s("吃面条", "Eating noodles"), s("遛狗", "Walking a dog"), s("做俯卧撑", "Doing push-ups"),
      s("做瑜伽", "Doing yoga"), s("打字", "Typing"), s("切菜", "Chopping vegetables"), s("剥香蕉", "Peeling a banana"), s("放风筝", "Flying a kite"), s("指挥交通", "Directing traffic"),
      s("弹吉他", "Playing guitar"), s("打太极", "Tai chi"), s("划船", "Rowing a boat"), s("攀岩", "Rock climbing"), s("当僵尸", "Being a zombie"), s("走 T 台", "Walking the runway"),
      s("变魔术", "Doing a magic trick"), s("包饺子", "Making dumplings"), s("喝醉了", "Being drunk"), s("打保龄球", "Bowling"),
    ],
  },
  {
    id: "people",
    group: "classic",
    name: s("人物角色", "Characters"),
    words: NOTES.slice(0, 48).map((x) => x.t),
  },
  {
    id: "places",
    group: "classic",
    name: s("地方", "Places"),
    words: [
      s("长城", "Great Wall"), s("故宫", "Forbidden City"), s("埃菲尔铁塔", "Eiffel Tower"), s("自由女神像", "Statue of Liberty"), s("金字塔", "Pyramids"), s("迪士尼乐园", "Disneyland"),
      s("机场", "Airport"), s("医院", "Hospital"), s("学校", "School"), s("超市", "Supermarket"), s("健身房", "Gym"), s("电影院", "Movie theater"),
      s("KTV", "Karaoke bar"), s("海滩", "Beach"), s("沙漠", "Desert"), s("雪山", "Snowy mountain"), s("动物园", "Zoo"), s("游乐园", "Amusement park"),
      s("图书馆", "Library"), s("厨房", "Kitchen"), s("温哥华", "Vancouver"), s("多伦多", "Toronto"), s("巴黎", "Paris"), s("东京", "Tokyo"),
      s("纽约", "New York"), s("伦敦", "London"), s("北京", "Beijing"), s("上海", "Shanghai"), s("香港", "Hong Kong"), s("拉斯维加斯", "Las Vegas"),
      s("悉尼歌剧院", "Sydney Opera House"), s("威尼斯", "Venice"), s("月球", "The Moon"), s("南极", "Antarctica"), s("尼亚加拉大瀑布", "Niagara Falls"), s("班夫", "Banff"),
    ],
  },
  {
    id: "things",
    group: "classic",
    name: s("日常用品", "Everyday Things"),
    words: [
      s("牙刷", "Toothbrush"), s("雨伞", "Umbrella"), s("手机", "Phone"), s("钥匙", "Keys"), s("眼镜", "Glasses"), s("拖鞋", "Slippers"),
      s("枕头", "Pillow"), s("吹风机", "Hair dryer"), s("冰箱", "Fridge"), s("微波炉", "Microwave"), s("洗衣机", "Washing machine"), s("遥控器", "Remote control"),
      s("充电器", "Charger"), s("耳机", "Headphones"), s("口红", "Lipstick"), s("镜子", "Mirror"), s("钱包", "Wallet"), s("背包", "Backpack"),
      s("筷子", "Chopsticks"), s("剪刀", "Scissors"), s("蜡烛", "Candle"), s("气球", "Balloon"), s("闹钟", "Alarm clock"), s("卫生纸", "Toilet paper"),
      s("行李箱", "Suitcase"), s("红绿灯", "Traffic light"), s("吉他", "Guitar"), s("相机", "Camera"), s("电视", "TV"), s("沙发", "Sofa"),
      s("电风扇", "Electric fan"), s("帽子", "Hat"), s("围巾", "Scarf"), s("袜子", "Socks"), s("口罩", "Face mask"), s("锅", "Wok"),
    ],
  },

  // ---- party: a bit spicy (dating and nights out, nothing explicit), good times, funny moments to act out
  {
    id: "spicy",
    group: "party",
    name: s("有点辣", "Spicy"),
    words: [
      s("前任", "Ex"), s("暗恋", "Secret crush"), s("初吻", "First kiss"), s("一见钟情", "Love at first sight"), s("表白", "Confessing your feelings"), s("第一次约会", "First date"),
      s("约会软件", "Dating app"), s("左滑右滑", "Swiping left and right"), s("相亲", "Blind date"), s("土味情话", "Cheesy pickup line"), s("抛媚眼", "Flirty wink"), s("吃醋", "Getting jealous"),
      s("查手机", "Checking their phone"), s("已读不回", "Left on read"), s("冷战", "Silent treatment"), s("分手", "Breakup"), s("复合", "Getting back together"), s("劈腿", "Cheating"),
      s("异地恋", "Long-distance relationship"), s("电灯泡", "Third wheel"), s("被发好人卡", "Friend-zoned"), s("舔狗", "Simp"), s("偷看前任朋友圈", "Stalking your ex online"), s("喝醉给前任打电话", "Drunk-dialing your ex"),
      s("见家长", "Meeting the parents"), s("丈母娘", "Mother-in-law"), s("情侣装", "Matching couple outfits"), s("秀恩爱", "PDA"), s("情人节", "Valentine's Day"), s("烛光晚餐", "Candlelit dinner"),
      s("订婚戒指", "Engagement ring"), s("婚前协议", "Prenup"), s("蜜月", "Honeymoon"), s("单身派对", "Bachelor party"), s("夜店", "Nightclub"), s("宿醉", "Hangover"),
      s("断片", "Blackout"), s("法式接吻", "French kiss"), s("槲寄生下接吻", "Kissing under the mistletoe"), s("撒娇", "Acting cute"),
    ],
  },
  {
    id: "good-times",
    group: "party",
    name: s("欢乐时光", "Good Times"),
    words: [
      s("生日派对", "Birthday party"), s("吹蜡烛", "Blowing out candles"), s("惊喜派对", "Surprise party"), s("烟花", "Fireworks"), s("跨年倒数", "New Year's countdown"), s("圣诞树", "Christmas tree"),
      s("拆礼物", "Opening presents"), s("万圣节", "Halloween"), s("不给糖就捣蛋", "Trick or treat"), s("南瓜灯", "Jack-o'-lantern"), s("找复活节彩蛋", "Easter egg hunt"), s("感恩节火鸡", "Thanksgiving turkey"),
      s("婚礼", "Wedding"), s("抛捧花", "Bouquet toss"), s("毕业典礼", "Graduation"), s("抛学士帽", "Throwing graduation caps"), s("中彩票", "Winning the lottery"), s("发工资", "Payday"),
      s("小长假", "Long weekend"), s("演唱会", "Concert"), s("音乐节", "Music festival"), s("过山车", "Roller coaster"), s("摩天轮", "Ferris wheel"), s("旋转木马", "Carousel"),
      s("蹦床", "Trampoline"), s("吹泡泡", "Blowing bubbles"), s("彩虹", "Rainbow"), s("野餐", "Picnic"), s("露营", "Camping"), s("篝火", "Campfire"),
      s("烤棉花糖", "Roasting marshmallows"), s("打雪仗", "Snowball fight"), s("堆雪人", "Building a snowman"), s("水枪大战", "Water gun fight"), s("枕头大战", "Pillow fight"), s("捉迷藏", "Hide and seek"),
      s("抓娃娃机", "Claw machine"), s("拍立得", "Polaroid camera"), s("大合照", "Group photo"), s("击掌", "High five"), s("熊抱", "Bear hug"), s("干杯", "Cheers"),
      s("后院烧烤", "Backyard barbecue"), s("泳池派对", "Pool party"),
    ],
  },
  {
    id: "funny",
    group: "party",
    name: s("爆笑瞬间", "Funny Moments"),
    words: [
      s("踩到乐高", "Stepping on a Lego"), s("打嗝停不下来", "Hiccups that won't stop"), s("被蜜蜂追", "Chased by a bee"), s("冰淇淋掉了", "Dropping your ice cream"), s("撞上玻璃门", "Walking into a glass door"), s("开会忘了关麦", "Forgetting to mute on a call"),
      s("发错群", "Texting the wrong group chat"), s("输入法翻车", "Autocorrect fail"), s("憋喷嚏", "Holding in a sneeze"), s("吃冰头疼", "Brain freeze"), s("吃到超辣的", "Eating something way too spicy"), s("鸟屎掉头上", "Bird poop on your head"),
      s("平地摔", "Tripping over nothing"), s("一屁股坐空", "Missing the chair"), s("认错人挥手", "Waving back at a stranger"), s("手机砸脸", "Dropping your phone on your face"), s("腿麻了", "Your leg fell asleep"), s("上课打瞌睡", "Nodding off in class"),
      s("梦游", "Sleepwalking"), s("晕车", "Carsick"), s("被狗追", "Chased by a dog"), s("抢最后一块披萨", "Fighting over the last slice"), s("自拍找角度", "Finding your selfie angle"), s("拉链没拉", "Your fly is down"),
      s("牙缝里有菜", "Spinach in your teeth"), s("头发炸毛", "Bad hair day"), s("衣服穿反", "Shirt on inside out"), s("找头上的眼镜", "Looking for the glasses on your head"), s("踩到口香糖", "Stepping in gum"), s("喝水呛到", "Water down the wrong pipe"),
      s("憋笑", "Trying not to laugh"), s("笑到停不下来", "Giggle fit"), s("打呼噜", "Snoring"), s("打哈欠传染", "Contagious yawn"), s("放屁坐垫", "Whoopee cushion"), s("踩到香蕉皮", "Slipping on a banana peel"),
      s("冷笑话", "Dad joke"), s("恶作剧", "Prank"), s("装忙", "Pretending to be busy"), s("上班摸鱼", "Slacking off at work"), s("小鸡舞", "Chicken dance"), s("做鬼脸", "Pulling a funny face"),
      s("模仿老板", "Impersonating your boss"), s("尬舞", "Awkward dancing"),
    ],
  },

  // ---- around the world: what a culture is known and loved for (food, places, festivals, films, stars), never jokes about its people
  {
    id: "china",
    group: "world",
    name: s("中国风", "China"),
    words: [
      s("春节", "Chinese New Year"), s("舞狮", "Lion dance"), s("早茶", "Dim sum"), s("红包", "Red envelope"), s("舞龙", "Dragon dance"), s("放鞭炮", "Firecrackers"),
      s("灯笼", "Lantern"), s("孔明灯", "Sky lantern"), s("中秋节", "Mid-Autumn Festival"), s("赛龙舟", "Dragon boat race"), s("麻将", "Mahjong"), s("京剧", "Peking opera"),
      s("变脸", "Face-changing opera"), s("功夫", "Kung fu"), s("少林寺", "Shaolin Temple"), s("兵马俑", "Terracotta Army"), s("旗袍", "Qipao"), s("书法", "Calligraphy"),
      s("剪纸", "Paper cutting"), s("算盘", "Abacus"), s("十二生肖", "Chinese zodiac"), s("西游记", "Journey to the West"), s("花木兰", "Mulan"), s("功夫熊猫", "Kung Fu Panda"),
      s("李小龙", "Bruce Lee"), s("成龙", "Jackie Chan"), s("姚明", "Yao Ming"), s("微信", "WeChat"), s("抖音", "TikTok"), s("蛋挞", "Egg tart"),
      s("菠萝包", "Pineapple bun"), s("叉烧", "Char siu"), s("麻婆豆腐", "Mapo tofu"), s("宫保鸡丁", "Kung Pao chicken"), s("糖葫芦", "Tanghulu"),
    ],
  },
  {
    id: "japan",
    group: "world",
    name: s("日本", "Japan"),
    words: [
      s("拉面", "Ramen"), s("富士山", "Mount Fuji"), s("宝可梦", "Pokémon"), s("回转寿司", "Conveyor belt sushi"), s("天妇罗", "Tempura"), s("章鱼烧", "Takoyaki"),
      s("抹茶", "Matcha"), s("味噌汤", "Miso soup"), s("芥末", "Wasabi"), s("便当", "Bento box"), s("清酒", "Sake"), s("居酒屋", "Izakaya"),
      s("和牛", "Wagyu beef"), s("和服", "Kimono"), s("武士", "Samurai"), s("忍者", "Ninja"), s("相扑", "Sumo wrestling"), s("樱花", "Cherry blossoms"),
      s("新干线", "Bullet train"), s("东京塔", "Tokyo Tower"), s("温泉", "Hot spring"), s("鸟居", "Torii gate"), s("招财猫", "Lucky cat"), s("折纸", "Origami"),
      s("盆栽", "Bonsai"), s("空手道", "Karate"), s("动漫", "Anime"), s("任天堂", "Nintendo"), s("哥斯拉", "Godzilla"), s("龙猫", "Totoro"),
      s("千与千寻", "Spirited Away"), s("海贼王", "One Piece"), s("鬼灭之刃", "Demon Slayer"), s("凯蒂猫", "Hello Kitty"), s("胶囊旅馆", "Capsule hotel"),
    ],
  },
  {
    id: "korea",
    group: "world",
    name: s("韩国", "Korea"),
    words: [
      s("泡菜", "Kimchi"), s("韩国烤肉", "Korean BBQ"), s("鱿鱼游戏", "Squid Game"), s("石锅拌饭", "Bibimbap"), s("炸鸡配啤酒", "Fried chicken and beer"), s("辣炒年糕", "Tteokbokki"),
      s("紫菜包饭", "Kimbap"), s("部队锅", "Army stew"), s("冷面", "Cold noodles"), s("参鸡汤", "Ginseng chicken soup"), s("辛拉面", "Shin Ramyun"), s("烧酒", "Soju"),
      s("香蕉牛奶", "Banana milk"), s("韩剧", "K-drama"), s("韩流", "K-pop"), s("防弹少年团", "BTS"), s("BLACKPINK", "BLACKPINK"), s("江南Style", "Gangnam Style"),
      s("寄生虫", "Parasite"), s("釜山行", "Train to Busan"), s("爱的迫降", "Crash Landing on You"), s("孙兴慜", "Son Heung-min"), s("三星", "Samsung"), s("现代汽车", "Hyundai"),
      s("首尔", "Seoul"), s("南山塔", "N Seoul Tower"), s("济州岛", "Jeju Island"), s("韩服", "Hanbok"), s("跆拳道", "Taekwondo"), s("比心", "Finger heart"),
      s("欧巴", "Oppa"), s("汗蒸房", "Korean spa"), s("面膜", "Sheet mask"),
    ],
  },
  {
    id: "southeast-asia",
    group: "world",
    name: s("东南亚", "Southeast Asia"),
    words: [
      s("越南河粉", "Pho"), s("泰式炒河粉", "Pad Thai"), s("快乐蜂", "Jollibee"), s("越南法棍", "Banh mi"), s("越南春卷", "Vietnamese spring rolls"), s("越南滴漏咖啡", "Vietnamese iced coffee"),
      s("冬阴功汤", "Tom yum soup"), s("芒果糯米饭", "Mango sticky rice"), s("泰式奶茶", "Thai iced tea"), s("青木瓜沙拉", "Papaya salad"), s("沙爹", "Satay"), s("海南鸡饭", "Hainanese chicken rice"),
      s("叻沙", "Laksa"), s("椰浆饭", "Nasi lemak"), s("菲律宾刨冰", "Halo-halo"), s("椰子", "Coconut"), s("山竹", "Mangosteen"), s("红毛丹", "Rambutan"),
      s("泰拳", "Muay Thai"), s("夜市", "Night market"), s("嘟嘟车", "Tuk-tuk"), s("水上市场", "Floating market"), s("泼水节", "Songkran water festival"), s("曼谷", "Bangkok"),
      s("吴哥窟", "Angkor Wat"), s("下龙湾", "Ha Long Bay"), s("巴厘岛", "Bali"), s("鱼尾狮", "Merlion"), s("滨海湾金沙", "Marina Bay Sands"), s("双子塔", "Petronas Towers"),
      s("蜡染", "Batik"),
    ],
  },
  {
    id: "india",
    group: "world",
    name: s("印度", "India"),
    words: [
      s("咖喱", "Curry"), s("泰姬陵", "Taj Mahal"), s("宝莱坞", "Bollywood"), s("黄油鸡", "Butter chicken"), s("印度烤饼", "Naan"), s("咖喱角", "Samosa"),
      s("唐杜里烤鸡", "Tandoori chicken"), s("印度奶茶", "Chai"), s("芒果拉西", "Mango lassi"), s("印度香米", "Basmati rice"), s("印度豆汤", "Dal"), s("姜黄", "Turmeric"),
      s("排灯节", "Diwali"), s("洒红节", "Holi"), s("纱丽", "Sari"), s("海娜手绘", "Henna"), s("板球", "Cricket"), s("邦格拉舞", "Bhangra"),
      s("西塔琴", "Sitar"), s("曼陀罗", "Mandala"), s("恒河", "The Ganges"), s("孟买", "Mumbai"), s("印度门", "India Gate"), s("金庙", "Golden Temple"),
      s("甘地", "Gandhi"), s("三傻大闹宝莱坞", "3 Idiots"), s("摔跤吧！爸爸", "Dangal"), s("阿米尔·汗", "Aamir Khan"), s("沙鲁克·汗", "Shah Rukh Khan"), s("大吉岭红茶", "Darjeeling tea"),
      s("印度婚礼", "Indian wedding"),
    ],
  },
  {
    id: "middle-east",
    group: "world",
    name: s("中东", "Middle East"),
    words: [
      s("沙威玛", "Shawarma"), s("阿拉丁", "Aladdin"), s("迪拜", "Dubai"), s("土耳其烤肉", "Kebab"), s("鹰嘴豆泥", "Hummus"), s("炸豆丸子", "Falafel"),
      s("皮塔饼", "Pita"), s("果仁蜜饼", "Baklava"), s("土耳其软糖", "Turkish delight"), s("土耳其冰淇淋", "Turkish ice cream"), s("土耳其咖啡", "Turkish coffee"), s("椰枣", "Dates"),
      s("石榴", "Pomegranate"), s("藏红花", "Saffron"), s("波斯地毯", "Persian rug"), s("波斯猫", "Persian cat"), s("波斯新年", "Nowruz"), s("肚皮舞", "Belly dancing"),
      s("神灯", "Magic lamp"), s("芝麻开门", "Open sesame"), s("塔布勒沙拉", "Tabbouleh"), s("沙漠冲沙", "Dune bashing"), s("卡塔尔世界杯", "Qatar World Cup"), s("哈利法塔", "Burj Khalifa"),
      s("伊斯坦布尔", "Istanbul"), s("热气球", "Hot air balloons"), s("佩特拉古城", "Petra"), s("死海漂浮", "Floating in the Dead Sea"), s("土耳其浴", "Turkish bath"),
      s("阿布扎比", "Abu Dhabi"), s("蓝眼睛护身符", "Evil eye charm"),
    ],
  },
  {
    id: "italy",
    group: "world",
    name: s("意大利", "Italy"),
    words: [
      s("意大利面", "Spaghetti"), s("比萨斜塔", "Leaning Tower of Pisa"), s("提拉米苏", "Tiramisu"), s("千层面", "Lasagna"), s("意式饺子", "Ravioli"), s("意式烩饭", "Risotto"),
      s("意式冰淇淋", "Gelato"), s("意式浓缩", "Espresso"), s("卡布奇诺", "Cappuccino"), s("马苏里拉", "Mozzarella"), s("帕玛森奶酪", "Parmesan"), s("帕尔马火腿", "Prosciutto"),
      s("橄榄油", "Olive oil"), s("罗马斗兽场", "The Colosseum"), s("贡多拉", "Gondola"), s("许愿池", "Trevi Fountain"), s("庞贝古城", "Pompeii"), s("法拉利", "Ferrari"),
      s("兰博基尼", "Lamborghini"), s("古驰", "Gucci"), s("普拉达", "Prada"), s("米兰时装周", "Milan Fashion Week"), s("歌剧", "Opera"), s("文艺复兴", "The Renaissance"),
      s("角斗士", "Gladiator"), s("凯撒大帝", "Julius Caesar"), s("大卫像", "Michelangelo's David"), s("罗密欧与朱丽叶", "Romeo and Juliet"), s("罗马假日", "Roman Holiday"),
      s("范思哲", "Versace"), s("托斯卡纳", "Tuscany"),
    ],
  },
  {
    id: "france",
    group: "world",
    name: s("法国", "France"),
    words: [
      s("法棍", "Baguette"), s("卢浮宫", "The Louvre"), s("马卡龙", "Macaron"), s("可颂", "Croissant"), s("可丽饼", "Crêpe"), s("舒芙蕾", "Soufflé"),
      s("焗蜗牛", "Escargot"), s("鹅肝", "Foie gras"), s("香槟", "Champagne"), s("干邑", "Cognac"), s("法式吐司", "French toast"), s("凯旋门", "Arc de Triomphe"),
      s("凡尔赛宫", "Palace of Versailles"), s("巴黎圣母院", "Notre-Dame"), s("红磨坊", "Moulin Rouge"), s("薰衣草花田", "Lavender fields"), s("戛纳电影节", "Cannes Film Festival"), s("环法自行车赛", "Tour de France"),
      s("香奈儿", "Chanel"), s("路易威登", "Louis Vuitton"), s("香水", "Perfume"), s("贝雷帽", "Beret"), s("小王子", "The Little Prince"), s("悲惨世界", "Les Misérables"),
      s("料理鼠王", "Ratatouille"), s("米其林轮胎人", "Michelin Man"), s("法国大革命", "French Revolution"), s("莫奈", "Monet"), s("法国斗牛犬", "French bulldog"),
      s("迪奥", "Dior"), s("卡门贝尔奶酪", "Camembert"),
    ],
  },
  {
    id: "latin",
    group: "world",
    name: s("拉丁美洲", "Latin America"),
    words: [
      s("塔可", "Tacos"), s("马丘比丘", "Machu Picchu"), s("桑巴", "Samba"), s("墨西哥卷饼", "Burrito"), s("牛油果酱", "Guacamole"), s("玉米片", "Nachos"),
      s("墨西哥芝士饼", "Quesadilla"), s("龙舌兰", "Tequila"), s("玛格丽特", "Margarita"), s("莫吉托", "Mojito"), s("巴西烤肉", "Brazilian BBQ"), s("墨西哥摔角", "Lucha libre"),
      s("亡灵节", "Day of the Dead"), s("寻梦环游记", "Coco"), s("皮纳塔", "Piñata"), s("马里亚奇乐队", "Mariachi band"), s("仙人掌", "Cactus"), s("玛雅金字塔", "Mayan pyramid"),
      s("坎昆", "Cancún"), s("弗里达", "Frida Kahlo"), s("吉娃娃", "Chihuahua"), s("羊驼", "Llama"), s("亚马逊雨林", "Amazon rainforest"), s("里约热内卢", "Rio de Janeiro"),
      s("里约基督像", "Christ the Redeemer"), s("狂欢节", "Carnival"), s("探戈", "Tango"), s("萨尔萨舞", "Salsa dancing"), s("梅西", "Messi"), s("复活节岛石像", "Easter Island heads"),
      s("Despacito", "Despacito"),
    ],
  },
  {
    id: "canada",
    group: "world",
    name: s("加拿大", "Canada"),
    words: [
      s("冰球", "Hockey"), s("Tim Hortons", "Tim Hortons"), s("北极光", "Northern lights"), s("枫叶", "Maple leaf"), s("加拿大鹅", "Canada goose"), s("落基山脉", "Rocky Mountains"),
      s("路易斯湖", "Lake Louise"), s("CN塔", "CN Tower"), s("斯坦利公园", "Stanley Park"), s("狮门大桥", "Lions Gate Bridge"), s("卡皮拉诺吊桥", "Capilano Suspension Bridge"), s("惠斯勒", "Whistler"),
      s("格兰维尔岛", "Granville Island"), s("双奶双糖", "Double-double"), s("露露乐蒙", "Lululemon"), s("冰酒", "Ice wine"), s("野生三文鱼", "Wild salmon"), s("纳奈莫条", "Nanaimo bar"),
      s("加元硬币", "Loonie"), s("加拿大骑警", "Mountie"), s("加拿大日", "Canada Day"), s("多伦多猛龙", "Toronto Raptors"), s("温哥华加人", "Vancouver Canucks"), s("独木舟", "Canoe"),
      s("冰上钓鱼", "Ice fishing"), s("狗拉雪橇", "Dog sledding"), s("德雷克", "Drake"), s("贾斯汀·比伯", "Justin Bieber"), s("席琳·迪翁", "Celine Dion"), s("瑞安·雷诺兹", "Ryan Reynolds"),
    ],
  },
];

/** The deck picker's shelves, in order. */
export const DECK_GROUPS: { id: DeckGroup; name: T }[] = [
  { id: "classic", name: s("经典", "Classics") },
  { id: "party", name: s("派对", "Party") },
  { id: "world", name: s("世界", "World") },
];

const strip = (x: string) =>
  x
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s·・.,，。!！?？'’"“”\-_()（）]/g, "");

/** Edit distance with swaps (optimal string alignment): "einstien" is one slip from "einstein". */
function slips(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

function close(a: string, b: string) {
  if (a === b) return true;
  // typos are forgiven in longer latin names only; a different hanzi is a different answer
  if (/[\u3400-\u9fff]/.test(a + b) || Math.min(a.length, b.length) < 5) return false;
  return slips(a, b) <= (b.length >= 9 ? 2 : 1);
}

/** Does a guess name this note, in either language or a common nickname? */
export function guessMatches(guess: string, note: { zh: string; en: string }, alias: string[] = []) {
  const g = strip(guess);
  if (!g) return false;
  return [note.zh, note.en, ...alias].some((name) => {
    const n2 = strip(name);
    if (!n2) return false;
    if (close(g, n2)) return true;
    // "is it harry potter" / "是不是孙悟空": the name inside a short question, not a list of names
    const cjk = /[\u3400-\u9fff]/.test(n2);
    const extra = g.length - n2.length;
    return g.includes(n2) && (n2.length >= 4 || (cjk && n2.length >= 2)) && extra <= (cjk ? 4 : 8);
  });
}
