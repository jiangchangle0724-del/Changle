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

export type HeadsDeck = { id: string; name: T; words: T[] };

/** The one-phone forehead game: hold it up, the others give clues. */
export const HEADS_DECKS: HeadsDeck[] = [
  {
    id: "animals",
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
    name: s("人物角色", "Characters"),
    words: NOTES.slice(0, 48).map((x) => x.t),
  },
  {
    id: "places",
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

const HANZI = /[㐀-鿿]/;
/** What people say round a guess: "我猜我是一只…吗", "I think I'm a… right?" */
const LEAD_ZH = /^(?:那|嗯|哦|啊|所以|我猜|我觉得|我想|我认为|应该|可能|大概|也许|难道|肯定|一定|会不会|该不会|是不是|就|我|是|叫)*(?:一个|一只|一位|一条|一头|一种|一名|一台|一部|一座|一颗|个|只)?/;
const TAIL_ZH = /(?:吗|吧|呢|啊|呀|嘛|么|对吧|对不对|对吗|是吧|是吗|没错吧)+$/;
const LEAD_EN = new Set("i im am are is it its this that a an the think guess bet say maybe probably perhaps must might could be so oh um uh well ok okay hmm definitely some kind sort of like just my answer".split(" "));
const TAIL_EN = new Set("right maybe probably please lol haha i think guess am is it".split(" "));
const ARTICLES = new Set(["a", "an", "the"]);

const wordsOf = (x: string) =>
  x
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’]/g, "")
    .split(/[\s·・.,，。!！?？"“”\-_()（）]+/)
    .filter(Boolean);

/**
 * A guess with the words round it taken off: "我是不是猫？" and "I think I'm a cat, right?" both
 * say cat. Something is always left: a guess that is nothing but such words stays as it is.
 */
function bareGuess(guess: string) {
  if (HANZI.test(guess)) {
    const all = strip(guess);
    return all.replace(TAIL_ZH, "").replace(LEAD_ZH, "") || all;
  }
  const words = wordsOf(guess);
  let a = 0;
  let b = words.length;
  while (b - a > 1 && LEAD_EN.has(words[a])) a++;
  while (b - a > 1 && TAIL_EN.has(words[b - 1])) b--;
  return words.slice(a, b).join("");
}

/** A note's name without its article ("The Beatles", "A cat"). A Chinese name stays whole: 只狼 is not 狼. */
function bareName(name: string) {
  if (HANZI.test(name)) return strip(name);
  const words = wordsOf(name);
  return words.slice(words.length > 1 && ARTICLES.has(words[0]) ? 1 : 0).join("");
}

/** The same word, give or take a slip in a long name or an s on the end ("cats" for "cat"). */
function same(a: string, b: string) {
  if (close(a, b)) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 3 && !HANZI.test(long) && long === `${short}s`;
}

/** Does a guess name this note, in either language or a common nickname? */
export function guessMatches(guess: string, note: { zh: string; en: string }, alias: string[] = []) {
  const g = strip(guess);
  if (!g) return false;
  const bare = bareGuess(guess);
  return [note.zh, note.en, ...alias].some((name) => {
    const n2 = strip(name);
    if (!n2) return false;
    if (close(g, n2)) return true;
    // "我是猫", "I'm a cat", "cats?": the name itself once the words round it are gone, so a note
    // of one character or three letters can be guessed in a sentence too
    const core = bareName(name);
    if (bare && core && same(bare, core)) return true;
    // "is it harry potter" / "是不是孙悟空": the name inside a short question, not a list of names
    const cjk = /[\u3400-\u9fff]/.test(n2);
    const extra = g.length - n2.length;
    return g.includes(n2) && (n2.length >= 4 || (cjk && n2.length >= 2)) && extra <= (cjk ? 4 : 8);
  });
}
