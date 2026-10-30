import type { T } from "../i18n";

export type Difficulty = 1 | 2 | 3;
export type DrawWord = T & { d: Difficulty };

const w = (d: Difficulty) => (zh: string, en: string): DrawWord => ({ zh, en, d });
const easy = w(1);
const mid = w(2);
const hard = w(3);

export const DRAW_WORDS: DrawWord[] = [
  easy("苹果", "Apple"), easy("房子", "House"), easy("太阳", "Sun"), easy("猫", "Cat"), easy("鱼", "Fish"),
  easy("雨伞", "Umbrella"), easy("汽车", "Car"), easy("书", "Book"), easy("花", "Flower"), easy("蛋糕", "Cake"),
  easy("眼镜", "Glasses"), easy("月亮", "Moon"), easy("树", "Tree"), easy("杯子", "Cup"), easy("手机", "Phone"),
  easy("帽子", "Hat"), easy("钥匙", "Key"), easy("星星", "Star"), easy("香蕉", "Banana"), easy("鸡蛋", "Egg"),
  easy("椅子", "Chair"), easy("钟表", "Clock"), easy("爱心", "Heart"), easy("皮球", "Ball"), easy("鞋子", "Shoe"),
  easy("冰淇淋", "Ice cream"), easy("蜡烛", "Candle"), easy("桥", "Bridge"), easy("气球", "Balloon"), easy("雪人", "Snowman"),
  easy("蝴蝶", "Butterfly"), easy("云", "Cloud"), easy("牙刷", "Toothbrush"), easy("披萨", "Pizza"), easy("吉他", "Guitar"),
  easy("门", "Door"), easy("自行车", "Bicycle"), easy("饺子", "Dumpling"), easy("筷子", "Chopsticks"), easy("火锅", "Hot pot"),
  easy("电视", "TV"), easy("面条", "Noodles"), easy("西瓜", "Watermelon"), easy("飞机", "Airplane"), easy("船", "Boat"),
  easy("蜗牛", "Snail"), easy("蛇", "Snake"), easy("钱包", "Wallet"), easy("耳机", "Headphones"), easy("灯泡", "Light bulb"),

  mid("牙医", "Dentist"), mid("地铁", "Subway"), mid("婚礼", "Wedding"), mid("感冒", "A cold"), mid("加班", "Overtime"),
  mid("失眠", "Insomnia"), mid("堵车", "Traffic jam"), mid("相亲", "Blind date"), mid("减肥", "Dieting"), mid("熬夜", "All-nighter"),
  mid("麻将", "Mahjong"), mid("火山", "Volcano"), mid("海盗", "Pirate"), mid("宇航员", "Astronaut"), mid("骆驼", "Camel"),
  mid("企鹅", "Penguin"), mid("龙", "Dragon"), mid("熊猫", "Panda"), mid("滑雪", "Skiing"), mid("烧烤", "Barbecue"),
  mid("奶茶", "Bubble tea"), mid("网红", "Influencer"), mid("直播", "Livestream"), mid("快递", "Delivery"), mid("外卖", "Takeout"),
  mid("健身房", "Gym"), mid("瑜伽", "Yoga"), mid("自拍", "Selfie"), mid("春节", "Lunar New Year"), mid("红包", "Red envelope"),
  mid("放鞭炮", "Firecrackers"), mid("包饺子", "Making dumplings"), mid("刷牙", "Brushing teeth"), mid("洗澡", "Taking a shower"), mid("打喷嚏", "Sneeze"),
  mid("打哈欠", "Yawn"), mid("钓鱼", "Fishing"), mid("露营", "Camping"), mid("爬山", "Hiking"), mid("迷路", "Getting lost"),
  mid("下雨", "Rain"), mid("彩虹", "Rainbow"), mid("地震", "Earthquake"), mid("灯塔", "Lighthouse"), mid("摩天轮", "Ferris wheel"),
  mid("过山车", "Roller coaster"), mid("机场", "Airport"), mid("护照", "Passport"), mid("温哥华", "Vancouver"), mid("枫叶", "Maple leaf"),
  mid("考试", "Exam"), mid("理发", "Haircut"), mid("求婚", "Proposal"), mid("搬家", "Moving house"), mid("堆雪人", "Building a snowman"),
  mid("放风筝", "Flying a kite"), mid("追公交", "Chasing the bus"), mid("睡懒觉", "Sleeping in"), mid("塞车", "Gridlock"), mid("消防员", "Firefighter"),

  hard("中年危机", "Midlife crisis"), hard("社恐", "Social anxiety"), hard("内卷", "Rat race"), hard("躺平", "Lying flat"), hard("尴尬", "Awkward"),
  hard("嫉妒", "Jealousy"), hard("拖延症", "Procrastination"), hard("选择困难", "Indecision"), hard("暧昧", "Flirting"), hard("吃醋", "Jealous in love"),
  hard("鬼压床", "Sleep paralysis"), hard("时差", "Jet lag"), hard("宿醉", "Hangover"), hard("断舍离", "Decluttering"), hard("养生", "Wellness"),
  hard("冷暴力", "Silent treatment"), hard("打工人", "Wage slave"), hard("画饼", "Empty promises"), hard("社死", "Public humiliation"), hard("深夜emo", "Late-night blues"),
  hard("塑料友情", "Fake friendship"), hard("柠檬精", "Sour grapes"), hard("凡尔赛", "Humblebrag"), hard("网恋", "Online romance"), hard("摸鱼", "Slacking off"),
  hard("剧透", "Spoiler"), hard("上头", "Getting hooked"), hard("摆烂", "Giving up"), hard("破防", "Emotional meltdown"), hard("佛系", "Zen chill"),
  hard("秒回", "Instant reply"), hard("已读不回", "Left on read"), hard("空巢", "Empty nest"), hard("开盲盒", "Blind box"), hard("灵感", "Inspiration"),
  hard("自由", "Freedom"), hard("怀旧", "Nostalgia"), hard("第六感", "Sixth sense"), hard("月光族", "Living paycheck to paycheck"), hard("间歇性努力", "On-and-off hustle"),
];
