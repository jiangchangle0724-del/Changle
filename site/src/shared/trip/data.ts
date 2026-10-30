import type { T } from "../../i18n";

/**
 * 到此一游 · Been There, Bought That: the board, the cities and the cards. One source for the
 * paper prototype, the rules engine and the screens. Prices are a first guess by board position;
 * the simulation in step 3 tunes them.
 */

const t = (zh: string, en: string): T => ({ zh, en });

export type GroupId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Each group has a shape as well as a color, so nobody needs to tell colors apart. */
export type Shape = "triangle" | "circle" | "diamond" | "square" | "star" | "hexagon" | "plus" | "wave";

export type Group = { id: GroupId; name: T; color: string; shape: Shape; house: number };

export const GROUPS: Group[] = [
  { id: 1, name: t("非洲", "Africa"), color: "#9c6b3c", shape: "triangle", house: 50 },
  { id: 2, name: t("拉丁美洲", "Latin America"), color: "#56b4e9", shape: "circle", house: 50 },
  { id: 3, name: t("中东与南亚", "Middle East & South Asia"), color: "#cc79a7", shape: "diamond", house: 100 },
  { id: 4, name: t("北美", "North America"), color: "#e69f00", shape: "square", house: 100 },
  { id: 5, name: t("东亚", "East Asia"), color: "#d55e00", shape: "star", house: 150 },
  { id: 6, name: t("东南亚与大洋洲", "Southeast Asia & Oceania"), color: "#e8d33f", shape: "hexagon", house: 150 },
  { id: 7, name: t("欧洲", "Europe"), color: "#009e73", shape: "plus", house: 200 },
  { id: 8, name: t("天价", "Sky High"), color: "#0072b2", shape: "wave", house: 200 },
];

export type City = {
  id: string;
  group: GroupId;
  name: T;
  price: number;
  /** what happens when someone stops here (a few are always on) */
  rule: { title: T; text: T; always?: boolean };
  /** the real thing behind the rule */
  basis: T;
  source: string;
  greeting: { text: string; roman?: string };
  currency: T;
  /** city-centre apartment price, US$ per m2 (Numbeo, 24 Oct 2026): sets the order, not the amounts */
  real: number;
};

export const CITIES: City[] = [
  {
    id: "cairo",
    group: 1,
    name: t("开罗", "Cairo"),
    price: 60,
    rule: {
      title: t("金字塔", "The Pyramids"),
      text: t("开罗的房子不会被任何卡拆掉。游戏结束算资产时，开罗的每栋房子按两倍计。", "No card can knock down a building in Cairo. At the end of the game, each building here counts double."),
      always: true,
    },
    basis: t("吉萨到达舒尔的金字塔群 1979 年列入世界遗产，古时就被算作世界七大奇迹之一。", "The pyramid fields from Giza to Dahshur joined the World Heritage List in 1979; in ancient times they were counted among the Seven Wonders of the World."),
    source: "https://whc.unesco.org/en/list/86/",
    greeting: { text: "أهلاً", roman: "ahlan" },
    currency: t("埃及镑", "Egyptian pound"),
    real: 806,
  },
  {
    id: "capetown",
    group: 1,
    name: t("开普敦", "Cape Town"),
    price: 80,
    rule: {
      title: t("零日", "Day Zero"),
      text: t("每队同时暗选“省水”或“用水”。用水的队过半，每队各付银行 $50；否则用水的队各领 $30。", "Every team secretly picks Save or Use water at once. If most teams pick Use, every team pays the bank $50. Otherwise each team that picked Use collects $30."),
    },
    basis: t("2018 年大旱，开普敦从 2 月 1 日起限水每人每天 50 升，为的是推迟全城停水的“零日”。", "In the 2018 drought, Cape Town limited water to 50 litres a person a day from 1 February to push back Day Zero, when the taps would run dry."),
    source: "https://sanews.gov.za/node/37579",
    greeting: { text: "Molo" },
    currency: t("南非兰特", "South African rand"),
    real: 2410,
  },
  {
    id: "buenosaires",
    group: 2,
    name: t("布宜诺斯艾利斯", "Buenos Aires"),
    price: 100,
    rule: {
      title: t("探戈", "Tango"),
      text: t("邀请一位玩家跳探戈：你们交换位置，各自执行新格子（他不用再跳探戈）。他拒绝就付你 $50。", "Ask another player to tango. You swap places and each of you does your new space (no second tango). If they say no, they pay you $50."),
    },
    basis: t("探戈出自布宜诺斯艾利斯和蒙得维的亚的城市底层，2009 年列入人类非物质文化遗产。", "Tango grew up in the working-class neighbourhoods of Buenos Aires and Montevideo, and became UNESCO intangible heritage in 2009."),
    source: "https://ich.unesco.org/en/RL/tango-00258",
    greeting: { text: "¡Hola! ¿Qué tal?" },
    currency: t("阿根廷比索", "Argentine peso"),
    real: 2753,
  },
  {
    id: "mexicocity",
    group: 2,
    name: t("墨西哥城", "Mexico City"),
    price: 110,
    rule: {
      title: t("今日限行", "No Driving Today"),
      text: t("挑一组限行号：1 和 2、3 和 4，或 5 和 6。到你下回合之前，谁掷出这两个数，那颗骰子都不算步数。", "Pick a pair: 1 and 2, 3 and 4, or 5 and 6. Until your next turn, any die that shows one of them doesn't count."),
    },
    basis: t("墨西哥城都会区的 Hoy No Circula 按车牌尾号限行，周一是 5 和 6，周二是 7 和 8。", "Hoy No Circula keeps cars off the road by the last digit of the plate: 5 and 6 on Mondays, 7 and 8 on Tuesdays."),
    source: "https://sseguridad.edomex.gob.mx/hoy-no-circula",
    greeting: { text: "¡Hola! ¿Qué onda?" },
    currency: t("墨西哥比索", "Mexican peso"),
    real: 3550,
  },
  {
    id: "rio",
    group: 2,
    name: t("里约热内卢", "Rio de Janeiro"),
    price: 130,
    rule: {
      title: t("狂欢节打分", "Carnival Judges"),
      text: t("你可以跳 10 秒桑巴。其他每队同时亮出 1 到 10 分，去掉一个最低分（只有一个就不去），每分 $5，银行付给你。", "You may dance samba for 10 seconds. Every other team shows 1 to 10 at once; drop the lowest unless it's the only one. The bank pays you $5 a point."),
    },
    basis: t("里约狂欢节特级组每项由 4 位评委打分，四个分数都有效时去掉最低的一个。", "At Rio's carnival, four judges score each category, and the lowest of the four scores is dropped."),
    source: "https://liesa.org.br/downloads/carnaval/Resultado2026.pdf",
    greeting: { text: "Oi! Tudo bem?" },
    currency: t("巴西雷亚尔", "Brazilian real"),
    real: 3707,
  },
  {
    id: "istanbul",
    group: 3,
    name: t("伊斯坦布尔", "Istanbul"),
    price: 150,
    rule: {
      title: t("横跨欧亚", "Two Continents"),
      text: t("伊斯坦布尔可以顶替欧洲组里缺的一座城：有它加欧洲组任意两座，就算集齐欧洲组。", "Istanbul can stand in for one missing Europe city: own it plus any two Europe cities and you have the full Europe set."),
      always: true,
    },
    basis: t("博斯普鲁斯海峡把伊斯坦布尔分在欧洲和亚洲两边，历史城区 1985 年列入世界遗产。", "The Bosphorus splits Istanbul between Europe and Asia; its historic areas joined the World Heritage List in 1985."),
    source: "https://whc.unesco.org/en/list/356",
    greeting: { text: "Merhaba" },
    currency: t("土耳其里拉", "Turkish lira"),
    real: 3097,
  },
  {
    id: "mumbai",
    group: 3,
    name: t("孟买", "Mumbai"),
    price: 160,
    rule: {
      title: t("送饭工", "Dabbawalas"),
      text: t("你可以把自己的一栋民宿免费搬到你的另一座城市（两边都要符合平均盖房）。", "You may move one of your houses to another of your cities for free (both sides still built evenly)."),
    },
    basis: t("孟买的达巴瓦拉送饭工从 1890 年干到今天，约 5000 人，每天送 20 万份以上的饭盒。", "Since 1890 Mumbai's dabbawalas, about 5,000 of them, have carried more than 200,000 lunch boxes a day."),
    source: "https://mumbaidabbawala.in/",
    greeting: { text: "नमस्कार", roman: "namaskār" },
    currency: t("印度卢比", "Indian rupee"),
    real: 5669,
  },
  {
    id: "dubai",
    group: 3,
    name: t("迪拜", "Dubai"),
    price: 180,
    rule: {
      title: t("塔顶望远", "View from the Top"),
      text: t("偷看旅途卡最上面 3 张，按你想要的顺序放回去。", "Look at the top three Journey cards and put them back in any order you like."),
    },
    basis: t("哈利法塔高 828 米、163 层，2010 年建成时是世界最高的楼。", "The Burj Khalifa, 828 metres and 163 floors, was the world's tallest building when it opened in 2010."),
    source: "https://www.skyscrapercenter.com/building/burj-khalifa/3",
    greeting: { text: "مرحبا", roman: "marhaba" },
    currency: t("阿联酋迪拉姆", "UAE dirham"),
    real: 7182,
  },
  {
    id: "lasvegas",
    group: 4,
    name: t("拉斯维加斯", "Las Vegas"),
    price: 200,
    rule: {
      title: t("押一把", "Place a Bet"),
      text: t("你可以押最多 $200，再掷两颗骰子：掷出 7，押金退回，庄家再付你 4 倍；不是 7，押金归庄家。业主当庄家，没业主就是银行。", "Bet up to $200 and roll two dice. A 7 pays 4 to 1; anything else, the house keeps your bet. The owner is the house, or the bank if nobody owns it."),
    },
    basis: t("内华达博彩管理局的数据：2025 年拉斯维加斯大道的赌场一共赢了约 88 亿美元。", "Nevada's Gaming Control Board reports the Las Vegas Strip casinos won about US$8.8 billion in 2025."),
    source: "https://www.gaming.nv.gov/siteassets/content/about/gaming-revenue/december-2025-monthly-revenue-report.pdf",
    greeting: { text: "Hey there" },
    currency: t("美元", "US dollar"),
    real: 4786,
  },
  {
    id: "vancouver",
    group: 4,
    name: t("温哥华", "Vancouver"),
    price: 210,
    rule: {
      title: t("空置税", "Empty Homes Tax"),
      text: t("温哥华有业主但还没盖房时，停在这里的人把租金交给银行，不交给业主。", "If Vancouver has an owner but no houses yet, rent goes to the bank instead of the owner."),
      always: true,
    },
    basis: t("温哥华从 2017 年起征收空置税，空置的住宅按评估价的 3% 交税。", "Since 2017 Vancouver has taxed empty homes, at 3% of the assessed value."),
    source: "https://vancouver.ca/home-property-development/empty-homes-tax.aspx",
    greeting: { text: "Hello · Bonjour" },
    currency: t("加元", "Canadian dollar"),
    real: 8444,
  },
  {
    id: "newyork",
    group: 4,
    name: t("纽约", "New York"),
    price: 230,
    rule: {
      title: t("冻租表决", "Rent Freeze Vote"),
      text: t("付租金之前，全桌同时举手表决，过半数赞成，你只付基础租金。", "Before you pay rent, the whole table votes at once. If most say yes, you pay only the base rent."),
    },
    basis: t("纽约租金指导委员会每年为约 100 万套租金稳定公寓定涨幅，2026 年 6 月表决冻租。", "New York's Rent Guidelines Board sets increases for about a million rent-stabilized apartments; in June 2026 it voted for a freeze."),
    source: "https://rentguidelinesboard.cityofnewyork.us/adopted-summary-of-guidelines-2026-27/",
    greeting: { text: "Hey, how you doin'?" },
    currency: t("美元", "US dollar"),
    real: 18299,
  },
  {
    id: "tokyo",
    group: 5,
    name: t("东京", "Tokyo"),
    price: 250,
    rule: {
      title: t("满员电车", "Rush Hour"),
      text: t("把离你最近的另一位玩家往前挤一格，他执行新的那一格。", "Push the nearest other player one space forward. They do the space they land on."),
    },
    basis: t("日本国土交通省：2025 年度东京圈早高峰最挤的一小时，平均拥挤率 143%。", "Japan's transport ministry measured an average 143% load on Tokyo's busiest morning rush hour in 2025."),
    source: "https://www.mlit.go.jp/report/press/content/002013572.pdf",
    greeting: { text: "こんにちは", roman: "konnichiwa" },
    currency: t("日元", "Japanese yen"),
    real: 10944,
  },
  {
    id: "beijing",
    group: 5,
    name: t("北京", "Beijing"),
    price: 260,
    rule: {
      title: t("中轴线", "Central Axis"),
      text: t("这一格处理完以后，你可以直接跳到棋盘正对面的格子（隔 20 格），执行那一格，路过起飞格照领 $200。", "Once this space is settled, you may jump straight across the board, 20 spaces, and do that space, collecting $200 as you pass Departure."),
    },
    basis: t("北京中轴线南北长 7.8 公里，两边建筑东西对称，2024 年列入世界遗产。", "Beijing's Central Axis runs 7.8 km north to south with buildings mirrored on either side; it joined the World Heritage List in 2024."),
    source: "https://whc.unesco.org/en/list/1714",
    greeting: { text: "您好", roman: "nín hǎo" },
    currency: t("人民币", "Renminbi"),
    real: 12020,
  },
  {
    id: "shanghai",
    group: 5,
    name: t("上海", "Shanghai"),
    price: 280,
    rule: {
      title: t("垃圾分类", "Sort Your Trash"),
      text: t("业主从出题卡上念一样东西，你 3 秒内答出它是可回收物、有害垃圾、湿垃圾还是干垃圾。答对租金减半，答错租金翻倍。", "The owner reads an item off the quiz card. Within 3 seconds, say if it's recyclable, hazardous, wet or dry waste. Right: half rent. Wrong: double."),
    },
    basis: t("《上海市生活垃圾管理条例》2019 年 7 月 1 日施行，把生活垃圾分成四类。", "Shanghai's household waste rules took effect on 1 July 2019 and split rubbish into four kinds."),
    source: "https://faolex.fao.org/docs/pdf/chn197199.pdf",
    greeting: { text: "侬好", roman: "nong ho" },
    currency: t("人民币", "Renminbi"),
    real: 13416,
  },
  {
    id: "bangkok",
    group: 6,
    name: t("曼谷", "Bangkok"),
    price: 300,
    rule: {
      title: t("泼水节", "Songkran"),
      text: t("数到 3，所有人同时指向一个人“泼水”。被指最多的人从银行领 $50，平手都领。", "On three, everyone points at someone to splash. Whoever gets the most fingers collects $50 from the bank; ties all collect."),
    },
    basis: t("泰国新年宋干节在 4 月中，泼水代表洁净、敬意和好运，2023 年列入人类非物质文化遗产。", "Songkran, the Thai New Year in mid-April, splashes water for cleansing, respect and luck; it became UNESCO intangible heritage in 2023."),
    source: "https://ich.unesco.org/en/RL/songkran-in-thailand-traditional-thai-new-year-festival-01719",
    greeting: { text: "สวัสดี", roman: "sawatdi" },
    currency: t("泰铢", "Thai baht"),
    real: 6023,
  },
  {
    id: "sydney",
    group: 6,
    name: t("悉尼", "Sydney"),
    price: 310,
    rule: {
      title: t("南半球", "Down Under"),
      text: t("你可以宣布轮流的方向反过来：顺时针改逆时针，或者反过来。", "You may reverse the turn order: clockwise becomes counterclockwise, or the other way round."),
    },
    basis: t("澳大利亚气象局：悉尼的夏天是 12 月到 2 月，和北半球正好相反。", "Australia's Bureau of Meteorology: Sydney's summer runs December to February, the other way round from the north."),
    source: "https://www.bom.gov.au/climate/ahead/archive/outlooks/20161124-outlook.shtml",
    greeting: { text: "G'day" },
    currency: t("澳元", "Australian dollar"),
    real: 13495,
  },
  {
    id: "singapore",
    group: 6,
    name: t("新加坡", "Singapore"),
    price: 330,
    rule: {
      title: t("拥车证", "Car Permit"),
      text: t("每队暗标一张拥车证，出价最高的队拿到，付第二高的出价给银行。移动时可以用它一次，多走或少走一格，用完交回。", "Teams bid in secret for a car permit; the top bidder pays the bank the second-highest bid. Use it once to move one space more or less, then hand it back."),
    },
    basis: t("在新加坡买车先要竞标拥车证，每月两轮，一张证用 10 年。", "To own a car in Singapore you first bid for a Certificate of Entitlement; bidding runs twice a month and a certificate lasts 10 years."),
    source: "https://onemotoring.lta.gov.sg/content/onemotoring/home/buying/upfront-vehicle-costs/certificate-of-entitlement--coe-.html",
    greeting: { text: "Apa khabar?" },
    currency: t("新加坡元", "Singapore dollar"),
    real: 23255,
  },
  {
    id: "venice",
    group: 7,
    name: t("威尼斯", "Venice"),
    price: 350,
    rule: {
      title: t("涨潮", "Acqua Alta"),
      text: t("停在这里的人掷一颗骰子：掷出 1 或 2 就是涨潮，租金减半。业主可以当场付 $50 升起挡潮闸，照收全租。", "Roll one die. On a 1 or 2 the tide is in and rent is halved, unless the owner pays $50 on the spot to raise the flood gates."),
    },
    basis: t("威尼斯潮汐中心把 110 厘米以上算高潮位；2020 年起，MOSE 挡潮闸在大潮时升起护城。", "Venice's tide centre counts 110 cm and up as high water; since 2020 the MOSE gates rise to shield the city."),
    source: "https://comune.venezia.it/sites/comune.venezia.it/files/documenti/centro_maree/bibliografia/calendario_maree_anno_2024.pdf",
    greeting: { text: "Ciao" },
    currency: t("欧元", "Euro"),
    real: 6858,
  },
  {
    id: "paris",
    group: 7,
    name: t("巴黎", "Paris"),
    price: 360,
    rule: {
      title: t("打折季", "Les Soldes"),
      text: t("每局最多两次：你可以宣布打折季，到你下回合开始之前，所有人盖房半价。", "Twice a game at most: you may call the sales. Until your next turn starts, everyone builds at half price."),
    },
    basis: t("法国商店每年只能在政府定下的冬、夏两段时间打折，每段四周。", "French shops may hold sales only in two government-set windows a year, winter and summer, four weeks each."),
    source: "https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-un-commerce/commercants-quelle-reglementation-durant-les-soldes",
    greeting: { text: "Bonjour" },
    currency: t("欧元", "Euro"),
    real: 14472,
  },
  {
    id: "london",
    group: 7,
    name: t("伦敦", "London"),
    price: 380,
    rule: {
      title: t("劳合社保单", "Lloyd's Policy"),
      text: t("你可以花 $50 向伦敦的业主（没业主就向银行）买一张保单：下次付租金只付一半，用完交回。", "You may pay London's owner (or the bank) $50 for a policy: your next rent is halved, then hand it back."),
    },
    basis: t("1688 年伦敦的劳埃德咖啡馆里，商人互相卖船运保险，劳合社由此开始。", "In 1688 merchants at Edward Lloyd's coffee house in London sold each other shipping insurance; Lloyd's grew from there."),
    source: "https://www.lloyds.com/about-lloyds/history/coffee-and-commerce",
    greeting: { text: "Alright?" },
    currency: t("英镑", "Pound sterling"),
    real: 17400,
  },
  {
    id: "seoul",
    group: 8,
    name: t("首尔", "Seoul"),
    price: 420,
    rule: {
      title: t("高考听力", "Listening Exam"),
      text: t("全场安静 10 秒，你可以做鬼脸。第一个出声的人替你付租金；没人出声你就自己付。没业主时，出声的人付你 $50。", "Ten seconds of silence while you pull faces. The first person to make a sound pays your rent; if nobody does, you pay. With no owner, they pay you $50."),
    },
    basis: t("韩国高考英语听力的 25 分钟里，飞机起降要调整时间避开。", "During the 25-minute English listening test of Korea's college entrance exam, takeoffs and landings are rescheduled around it."),
    source: "https://m.korea.kr/news/policyNewsView.do?newsId=148973935",
    greeting: { text: "안녕하세요", roman: "annyeonghaseyo" },
    currency: t("韩元", "Korean won"),
    real: 27676,
  },
  {
    id: "hongkong",
    group: 8,
    name: t("香港", "Hong Kong"),
    price: 480,
    rule: {
      title: t("八号风球", "Signal No. 8"),
      text: t("掷两颗骰子，点数和是 8、9 或 10 就挂风球：到你下回合之前，全场免租。", "Roll two dice. On 8, 9 or 10 the typhoon signal goes up, and nobody pays rent until your next turn."),
    },
    basis: t("香港天文台的热带气旋警告信号只有 1、3、8、9、10 号，8 号代表烈风或暴风。", "The Hong Kong Observatory's tropical cyclone signals are numbered 1, 3, 8, 9 and 10; No. 8 means gale or storm-force winds."),
    source: "https://www.hko.gov.hk/textonly/v2/explain/intro.htm",
    greeting: { text: "你好", roman: "nei5 hou2" },
    currency: t("港元", "Hong Kong dollar"),
    real: 28929,
  },
];

export type RouteId = "polar" | "pacific" | "atlantic" | "silk";
export const ROUTES: { id: RouteId; name: T }[] = [
  { id: "silk", name: t("丝路航线", "Silk Road Route") },
  { id: "atlantic", name: t("大西洋航线", "Atlantic Route") },
  { id: "pacific", name: t("太平洋航线", "Pacific Route") },
  { id: "polar", name: t("北极航线", "Polar Route") },
];
export const ROUTE_PRICE = 200;
export const ROUTE_RENT = [35, 75, 145, 290];

export type ServiceId = "exchange" | "esim";
export const SERVICES: { id: ServiceId; name: T }[] = [
  { id: "exchange", name: t("外币兑换", "Currency Exchange") },
  { id: "esim", name: t("旅行流量卡", "Travel SIM") },
];
export const SERVICE_PRICE = 150;
/** rent is the dice total times this: one service, both services */
export const SERVICE_TIMES = [7, 17];

export type Space =
  | { k: "go" }
  | { k: "city"; id: string }
  | { k: "route"; id: RouteId }
  | { k: "service"; id: ServiceId }
  | { k: "journey" }
  | { k: "postcard" }
  | { k: "tax"; id: "departure" | "baggage"; amount: number }
  | { k: "immigration" }
  | { k: "lounge" }
  | { k: "expired" };

const c = (id: string): Space => ({ k: "city", id });

/** The loop, from Departure. Corners at 0, 10, 20 and 30. */
export const BOARD: Space[] = [
  { k: "go" },
  c("cairo"),
  { k: "postcard" },
  c("capetown"),
  { k: "tax", id: "departure", amount: 200 },
  { k: "route", id: "silk" },
  c("buenosaires"),
  { k: "journey" },
  c("mexicocity"),
  c("rio"),
  { k: "immigration" },
  c("istanbul"),
  { k: "service", id: "exchange" },
  c("mumbai"),
  c("dubai"),
  { k: "route", id: "atlantic" },
  c("lasvegas"),
  { k: "postcard" },
  c("vancouver"),
  c("newyork"),
  { k: "lounge" },
  c("tokyo"),
  { k: "journey" },
  c("beijing"),
  c("shanghai"),
  { k: "route", id: "pacific" },
  c("bangkok"),
  c("sydney"),
  { k: "service", id: "esim" },
  c("singapore"),
  { k: "expired" },
  c("venice"),
  c("paris"),
  { k: "postcard" },
  c("london"),
  { k: "route", id: "polar" },
  { k: "journey" },
  c("seoul"),
  { k: "tax", id: "baggage", amount: 100 },
  c("hongkong"),
];

export const START_CASH = 1500;
export const SALARY = 200;
export const IMMIGRATION_FEE = 50;

/** Rent for a city: base, full set, 1 to 4 houses, hotel. A formula for now; the simulation tunes it. */
export function rentTable(price: number) {
  const r10 = (x: number) => Math.round(x / 10) * 10;
  // in fives, so the paper money needs nothing smaller than $5
  const base = Math.max(5, Math.round((price * (0.04 + price / 6000)) / 5) * 5);
  return {
    base,
    set: base * 2,
    houses: [r10(price * (0.2 + price / 1600)), r10(price * (0.6 + price / 480)), r10(price * (1.6 + price / 240)), r10(price * (2.6 + price / 280))],
    hotel: r10(price * (3.6 + price / 300)),
  };
}

/**
 * Rent on every city: base, full set, 1 to 4 houses, hotel. Step 3's simulation set these
 * (see sim/): the formula above was the starting point, then each group's rents moved until
 * every group earns back about as much per dollar (a little less for the pricier ones), and a
 * pricier city never rents for less than a cheaper one.
 */
export const RENTS: Record<string, number[]> = {
  cairo: [5, 10, 15, 20, 60, 90, 120],
  capetown: [5, 10, 15, 30, 80, 120, 160],
  buenosaires: [5, 10, 30, 70, 180, 270, 350],
  mexicocity: [5, 10, 30, 80, 200, 290, 390],
  rio: [10, 20, 40, 100, 250, 360, 460],
  istanbul: [10, 20, 40, 150, 350, 500, 650],
  mumbai: [10, 20, 50, 160, 380, 540, 700],
  dubai: [15, 30, 60, 190, 440, 610, 800],
  lasvegas: [15, 30, 70, 200, 480, 650, 830],
  vancouver: [15, 30, 70, 220, 500, 670, 860],
  newyork: [20, 40, 70, 230, 520, 700, 890],
  tokyo: [25, 50, 120, 370, 860, 1140, 1450],
  beijing: [25, 50, 120, 390, 920, 1200, 1520],
  shanghai: [35, 70, 140, 430, 1010, 1320, 1660],
  bangkok: [40, 80, 190, 570, 1340, 1710, 2140],
  sydney: [45, 90, 190, 610, 1400, 1790, 2240],
  singapore: [45, 90, 200, 650, 1520, 1940, 2410],
  venice: [60, 120, 260, 800, 1820, 2300, 2840],
  paris: [60, 120, 260, 830, 1910, 2390, 2950],
  london: [70, 140, 290, 900, 2060, 2550, 3150],
  seoul: [70, 140, 290, 960, 2210, 2680, 3280],
  hongkong: [80, 160, 330, 1040, 2350, 2810, 3410],
};

/** Net worth that wins the no-limit game: two players play to more, so their game runs as long. */
export const TARGET = { two: 4500, more: 3500 };
/** Moving first is a small edge: each later seat starts with this much more. */
export const SEAT_BONUS = 25;

export const groupOf = (id: GroupId) => GROUPS[id - 1];
export const cityById = (id: string) => CITIES.find((x) => x.id === id)!;

/**
 * Shanghai's quiz card: the owner reads out one item, the visitor names its bin. Bins and the
 * plain items follow the 2019 regulation's own examples; the bones and shells are the trick
 * questions from Tsinghua's Liu Jianguo (NBD, July 2019).
 */
export const SORT_QUIZ: { bin: T; items: T[] }[] = [
  { bin: t("可回收物", "Recyclable"), items: [t("旧报纸", "old newspaper"), t("塑料瓶", "plastic bottle"), t("玻璃瓶", "glass bottle"), t("易拉罐", "drink can"), t("旧衣服", "old clothes")] },
  { bin: t("有害垃圾", "Hazardous"), items: [t("过期药", "expired medicine"), t("旧灯管", "fluorescent tube"), t("油漆桶", "paint tin")] },
  { bin: t("湿垃圾", "Wet"), items: [t("剩饭", "leftovers"), t("果皮", "fruit peel"), t("过期食品", "expired food"), t("鸡骨头", "chicken bones"), t("小龙虾壳", "crayfish shells")] },
  { bin: t("干垃圾", "Dry"), items: [t("用过的纸巾", "used tissue"), t("烟头", "cigarette butt"), t("猪骨头", "pork bones"), t("螃蟹壳", "crab shells")] },
];

export type Card = { id: string; title: T; text: T; keep?: boolean };

/** Journey cards: things that happen on the road. */
export const JOURNEY: Card[] = [
  { id: "upgrade", title: t("航班超售", "Overbooked"), text: t("免费升舱：前进到下一个航线格。有业主的话付双倍票价。", "You're bumped up to first class: go to the next route space. If it's owned, pay double.") },
  { id: "miles", title: t("里程兑换", "Air Miles"), text: t("飞到任意一个航线格。经过起飞格照领 $200。", "Fly to any route space. Collect $200 if you pass Departure.") },
  { id: "redeye", title: t("红眼航班", "Red-eye"), text: t("后退 3 格。", "Go back three spaces.") },
  { id: "home", title: t("直飞回家", "Nonstop Home"), text: t("前进到起飞格，领 $200。", "Go to Departure and collect $200.") },
  { id: "expired", title: t("护照过期", "Passport Expired"), text: t("直接去入境审查，不经过起飞格，不领钱。", "Go straight to Immigration. Don't pass Departure, don't collect $200.") },
  { id: "waiver", title: t("免签卡", "Visa Waiver"), text: t("留着用：出入境审查时交回这张卡。也可以卖给别人。", "Keep this: hand it in to leave Immigration. You can also sell it."), keep: true },
  { id: "luggage", title: t("行李寄错城市", "Lost Luggage"), text: t("付 $50。", "Pay $50.") },
  { id: "rate", title: t("汇率走运", "Good Exchange Rate"), text: t("领 $100。", "Collect $100.") },
  { id: "share", title: t("同舟共济", "Share the Ride"), text: t("现金最多的玩家分 $150 给现金最少的玩家。", "Whoever has the most cash gives $150 to whoever has the least.") },
  { id: "audit", title: t("税务稽查", "Tax Audit"), text: t("你每栋民宿付 $25，每座酒店付 $100。", "Pay $25 for each house and $100 for each hotel you own.") },
  { id: "typhoon", title: t("台风过境", "Typhoon"), text: t("拆掉你的一栋民宿（开罗的不算）。", "Take down one of your houses (not in Cairo).") },
  { id: "hitch", title: t("顺风车", "Hitchhike"), text: t("再掷一次。", "Roll again.") },
  { id: "guide", title: t("当导游", "Tour Guide"), text: t("每位玩家付你 $20 导游费。", "Every player pays you a $20 guide fee.") },
  { id: "points", title: t("旅行积分", "Travel Points"), text: t("留着用：下一次买城市打八折。", "Keep this: 20% off the next city you buy."), keep: true },
  { id: "lost", title: t("迷路了", "Lost"), text: t("抽一张明信片。", "Draw a postcard.") },
  { id: "lounge", title: t("转机", "Layover"), text: t("前进到转机休息室。", "Go to the Transit Lounge.") },
];

/** Postcards: news from home and the people you meet. */
export const POSTCARDS: Card[] = [
  { id: "redenvelope", title: t("家里的红包", "A Red Envelope"), text: t("每位玩家给你 $10。", "Every player gives you $10.") },
  { id: "viral", title: t("朋友圈火了", "Your Post Went Viral"), text: t("领 $100。", "Collect $100.") },
  { id: "gifts", title: t("给家里买礼物", "Gifts for Home"), text: t("付 $50。", "Pay $50.") },
  { id: "jetlag", title: t("时差", "Jet Lag"), text: t("下回合只掷一颗骰子。", "Roll only one die on your next turn.") },
  { id: "airport", title: t("在机场睡了一晚", "A Night at the Airport"), text: t("前进到转机休息室。", "Go to the Transit Lounge.") },
  { id: "classmate", title: t("偶遇老同学", "An Old Classmate"), text: t("选一位玩家，你们各从银行领 $50。", "Pick a player. You each collect $50 from the bank.") },
  { id: "refund", title: t("退税到账", "Tax Refund"), text: t("领 $75。", "Collect $75.") },
  { id: "review", title: t("五星好评", "Five-star Review"), text: t("你的一座城市免费加一栋民宿（要符合平均盖房）。", "Add a free house to one of your cities (building evenly).") },
  { id: "insurance", title: t("保险理赔", "Insurance Pays Out"), text: t("领 $50。", "Collect $50.") },
  { id: "leader", title: t("给第一名的信", "A Letter to the Leader"), text: t("总资产最多的玩家付其他每位玩家 $25。", "The richest player pays every other player $25.") },
  { id: "koi", title: t("锦鲤附体", "Lucky Koi"), text: t("留着用：免付一次租金。", "Keep this: skip one rent payment."), keep: true },
  { id: "postage", title: t("寄明信片", "Postage"), text: t("付 $20 邮费。", "Pay $20 postage.") },
  { id: "cash", title: t("急需现金", "Short on Cash"), text: t("把你的一栋民宿半价卖回银行（开罗的不算）。没有就算了。", "Sell one of your houses back to the bank at half price (not in Cairo). None? Nothing happens.") },
  { id: "wire", title: t("家里汇款", "Money from Home"), text: t("领 $150。", "Collect $150.") },
  { id: "visa", title: t("签证加急", "Rush Visa"), text: t("付 $50。", "Pay $50.") },
  { id: "waiver2", title: t("免签卡", "Visa Waiver"), text: t("留着用：出入境审查时交回这张卡。也可以卖给别人。", "Keep this: hand it in to leave Immigration. You can also sell it."), keep: true },
];
