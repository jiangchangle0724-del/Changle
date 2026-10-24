// The waiting players' quiz (抢答): one question per city, each taken only from the real fact behind
// that city's rule (CITIES[].basis, which carries its source). The right answer is always first here;
// the room shuffles the options and keeps the answer on the server, so phones never hold the key.
// Only the room imports this file.
import type { Text } from "../engine";

export interface TriviaQuestion {
  city: string;
  q: Text;
  /** Right answer first. */
  options: [Text, Text, Text];
}

const t = (zh: string, en: string): Text => ({ zh, en });

export const TRIVIA: TriviaQuestion[] = [
  {
    city: "cairo",
    q: t("吉萨到达舒尔的金字塔群哪一年列入世界遗产？", "In which year did the pyramid fields from Giza to Dahshur join the World Heritage List?"),
    options: [t("1979 年", "1979"), t("1999 年", "1999"), t("1959 年", "1959")],
  },
  {
    city: "capetown",
    q: t("2018 年大旱时，开普敦限水每人每天多少升？", "In the 2018 drought, how much water a day did Cape Town allow each person?"),
    options: [t("50 升", "50 litres"), t("150 升", "150 litres"), t("250 升", "250 litres")],
  },
  {
    city: "buenosaires",
    q: t("探戈出自布宜诺斯艾利斯和哪座城市的城市底层？", "Tango grew up in the working-class neighbourhoods of Buenos Aires and which other city?"),
    options: [t("蒙得维的亚", "Montevideo"), t("马德里", "Madrid"), t("里约热内卢", "Rio de Janeiro")],
  },
  {
    city: "mexicocity",
    q: t("墨西哥城的「今日限行」，周一不能上路的是车牌尾号几的车？", "On Mondays, Hoy No Circula keeps a car off the road if its plate ends in…"),
    options: [t("5 和 6", "5 or 6"), t("1 和 2", "1 or 2"), t("9 和 0", "9 or 0")],
  },
  {
    city: "rio",
    q: t("里约狂欢节特级组，每项由几位评委打分（再去掉最低分）？", "How many judges score each category at Rio's carnival (before the lowest score is dropped)?"),
    options: [t("4 位", "4"), t("3 位", "3"), t("7 位", "7")],
  },
  {
    city: "istanbul",
    q: t("把伊斯坦布尔分在欧洲和亚洲两边的是哪条海峡？", "Which strait splits Istanbul between Europe and Asia?"),
    options: [t("博斯普鲁斯海峡", "The Bosphorus"), t("直布罗陀海峡", "The Strait of Gibraltar"), t("马六甲海峡", "The Strait of Malacca")],
  },
  {
    city: "mumbai",
    q: t("孟买的达巴瓦拉送饭工每天送多少份饭盒？", "How many lunch boxes do Mumbai's dabbawalas carry a day?"),
    options: [t("20 万份以上", "More than 200,000"), t("2 万份左右", "About 20,000"), t("200 万份以上", "More than 2 million")],
  },
  {
    city: "dubai",
    q: t("迪拜的哈利法塔有多高？", "How tall is Dubai's Burj Khalifa?"),
    options: [t("828 米", "828 m"), t("528 米", "528 m"), t("1028 米", "1,028 m")],
  },
  {
    city: "lasvegas",
    q: t("2025 年拉斯维加斯大道的赌场一共赢了大约多少钱？", "About how much did the Las Vegas Strip casinos win in 2025?"),
    options: [t("88 亿美元", "US$8.8 billion"), t("8.8 亿美元", "US$880 million"), t("880 亿美元", "US$88 billion")],
  },
  {
    city: "vancouver",
    q: t("温哥华的空置税，按住宅评估价的多少来收？", "Vancouver's empty homes tax is what share of a home's assessed value?"),
    options: [t("3%", "3%"), t("0.3%", "0.3%"), t("30%", "30%")],
  },
  {
    city: "newyork",
    q: t("纽约租金指导委员会定涨幅的租金稳定公寓大约有多少套？", "About how many rent-stabilized apartments does New York's Rent Guidelines Board set increases for?"),
    options: [t("约 100 万套", "About a million"), t("约 10 万套", "About 100,000"), t("约 1000 万套", "About 10 million")],
  },
  {
    city: "tokyo",
    q: t("2025 年度东京圈早高峰最挤的一小时，平均拥挤率是多少？", "What was the average load on Tokyo's busiest morning rush hour in 2025?"),
    options: [t("143%", "143%"), t("43%", "43%"), t("243%", "243%")],
  },
  {
    city: "beijing",
    q: t("北京中轴线南北有多长？", "How long is Beijing's Central Axis from north to south?"),
    options: [t("7.8 公里", "7.8 km"), t("2.8 公里", "2.8 km"), t("17.8 公里", "17.8 km")],
  },
  {
    city: "shanghai",
    q: t("《上海市生活垃圾管理条例》把生活垃圾分成几类？", "Into how many kinds do Shanghai's household waste rules split rubbish?"),
    options: [t("4 类", "4"), t("3 类", "3"), t("6 类", "6")],
  },
  {
    city: "bangkok",
    q: t("泰国新年宋干节在什么时候？", "When is Songkran, the Thai New Year?"),
    options: [t("4 月中", "Mid-April"), t("1 月初", "Early January"), t("10 月底", "Late October")],
  },
  {
    city: "sydney",
    q: t("悉尼的夏天是哪几个月？", "Which months are summer in Sydney?"),
    options: [t("12 月到 2 月", "December to February"), t("6 月到 8 月", "June to August"), t("3 月到 5 月", "March to May")],
  },
  {
    city: "singapore",
    q: t("在新加坡，一张拥车证可以用多少年？", "How long does a Singapore Certificate of Entitlement last?"),
    options: [t("10 年", "10 years"), t("3 年", "3 years"), t("25 年", "25 years")],
  },
  {
    city: "venice",
    q: t("威尼斯潮汐中心从多高开始算高潮位？", "From what level does Venice's tide centre count high water?"),
    options: [t("110 厘米", "110 cm"), t("50 厘米", "50 cm"), t("200 厘米", "200 cm")],
  },
  {
    city: "paris",
    q: t("法国商店每年可以打折几段时间？", "How many sales windows may French shops hold a year?"),
    options: [t("两段，冬夏各四周", "Two, winter and summer, four weeks each"), t("一段，夏天八周", "One, eight weeks in summer"), t("四段，每季两周", "Four, two weeks each season")],
  },
  {
    city: "london",
    q: t("劳合社 1688 年起源于伦敦的什么地方？", "Where did Lloyd's begin, in 1688 London?"),
    options: [t("一家咖啡馆", "A coffee house"), t("一座教堂", "A church"), t("一家银行", "A bank")],
  },
  {
    city: "seoul",
    q: t("韩国高考英语听力那 25 分钟里，什么要调整时间避开？", "During the 25-minute English listening test of Korea's college entrance exam, what is rescheduled around it?"),
    options: [t("飞机起降", "Takeoffs and landings"), t("地铁报站", "Subway announcements"), t("教堂钟声", "Church bells")],
  },
  {
    city: "hongkong",
    q: t("香港天文台的 8 号风球代表什么？", "What does the Hong Kong Observatory's No. 8 signal mean?"),
    options: [t("烈风或暴风", "Gale or storm-force winds"), t("大雨", "Heavy rain"), t("酷热天气", "Very hot weather")],
  },
];
