// 旅行快讯 · Travel news, a lobby switch that is off by default. Every few rounds something real and
// recurring happens in one of the cities (a festival, the monsoon, a tourist fee, a visa change) and
// changes the rules there for two rounds. Like the city rules, each one rests on a sourced fact.
// No wars, borders or politicians: it's a party game.
import type { Text } from "./data";
import type { GameState } from "./state";

const t = (zh: string, en: string): Text => ({ zh, en });

export interface NewsItem {
  id: string;
  /** Cities it applies to. */
  cities: string[];
  /** Rent there is multiplied by this. */
  rent?: number;
  /** A team landing there (not the owner) first pays the bank this much. */
  fee?: number;
  /** Buying there costs this share of the price. */
  buy?: number;
  title: Text;
  /** What it does in the game. */
  text: Text;
  /** The real thing behind it. */
  basis: Text;
  source: string;
}

/** A piece of news lasts this many rounds, and one comes every NEWS_EVERY rounds. */
export const NEWS_ROUNDS = 2;
export const NEWS_EVERY = 3;

export const NEWS: NewsItem[] = [
  {
    id: "sakura",
    cities: ["tokyo"],
    rent: 2,
    title: t("东京樱花开了", "Cherry Blossom in Tokyo"),
    text: t("两轮内，东京租金翻倍。", "For two rounds, rent in Tokyo doubles."),
    basis: t(
      "东京的樱花开花日以靖国神社的标本树为准，常年在 3 月 24 日（1991–2020 年平均）。",
      "Tokyo's cherry blossom is called from the sample tree at Yasukuni Shrine; the normal date is 24 March (1991–2020 average).",
    ),
    source: "https://www.data.jma.go.jp/tokyo/shosai/kanyoho/sakura/sakura.html",
  },
  {
    id: "muertos",
    cities: ["mexicocity"],
    rent: 2,
    title: t("亡灵节", "Day of the Dead"),
    text: t("两轮内，墨西哥城租金翻倍。", "For two rounds, rent in Mexico City doubles."),
    basis: t(
      "墨西哥的亡灵节在十月底、十一月初，2008 年列入联合国教科文组织人类非物质文化遗产名录（2003 年已获宣布）。",
      "Mexico's Day of the Dead falls at the end of October and the start of November; UNESCO inscribed it as intangible heritage in 2008 (proclaimed in 2003).",
    ),
    source: "https://ich.unesco.org/en/RL/00054",
  },
  {
    id: "nye",
    cities: ["sydney"],
    rent: 2,
    title: t("悉尼跨年烟花", "New Year's Eve in Sydney"),
    text: t("两轮内，悉尼租金翻倍。", "For two rounds, rent in Sydney doubles."),
    basis: t(
      "悉尼跨年夜吸引一百多万人到悉尼港一带看烟花。",
      "Sydney's New Year's Eve draws more than a million people to the harbour to watch the fireworks.",
    ),
    source: "https://www.sydneynewyearseve.com/visiting-sydney",
  },
  {
    id: "fete",
    cities: ["paris"],
    rent: 2,
    title: t("音乐节", "Fête de la Musique"),
    text: t("两轮内，巴黎租金翻倍。", "For two rounds, rent in Paris doubles."),
    basis: t(
      "法国音乐节在每年 6 月 21 日夏至，1982 年由法国文化部发起。",
      "France's Fête de la Musique is held every 21 June, the summer solstice; the Ministry of Culture started it in 1982.",
    ),
    source: "https://fetedelamusique.culture.gouv.fr/actualites/historique-de-la-fete-de-la-musique",
  },
  {
    id: "monsoon",
    cities: ["mumbai"],
    rent: 0.5,
    title: t("孟买季风到了", "Monsoon in Mumbai"),
    text: t("两轮内，孟买租金减半。", "For two rounds, rent in Mumbai halves."),
    basis: t(
      "印度气象局：西南季风常年在 6 月 11 日前后到达孟买（1961–2019 年的常年值）。",
      "India Meteorological Department: the southwest monsoon normally reaches Mumbai around 11 June (the 1961–2019 normal).",
    ),
    source: "https://internal.imd.gov.in/press_release/20200515_pr_804.pdf",
  },
  {
    id: "venicefee",
    cities: ["venice"],
    fee: 20,
    title: t("威尼斯收进城费", "Venice's Access Fee"),
    text: t("两轮内，到威尼斯的外来队先付银行 $20。", "For two rounds, visiting teams that land in Venice first pay the bank $20."),
    basis: t(
      "威尼斯在最忙的日子向一日游客人收进城费：2025 年共 54 天，提前预订 5 欧元，临时 10 欧元。",
      "Venice charges day-trippers an access fee on its busiest days: 54 days in 2025, €5 booked ahead or €10 at short notice.",
    ),
    source: "https://live.comune.venezia.it/it/2025/08/contributo-di-accesso-i-numeri-del-2025",
  },
  {
    id: "visafree",
    cities: ["beijing", "shanghai"],
    rent: 1.5,
    title: t("240 小时过境免签", "240-Hour Visa-Free Transit"),
    text: t("两轮内，北京和上海租金加五成。", "For two rounds, rent in Beijing and Shanghai goes up by half."),
    basis: t(
      "2024 年 12 月 17 日起，中国把过境免签停留延长到 240 小时，54 个国家的旅客可以用。",
      "From 17 December 2024, China extended visa-free transit stays to 240 hours for travellers from 54 countries.",
    ),
    source: "https://english.beijing.gov.cn/latest/news/202412/t20241217_3967583.html",
  },
  {
    id: "nightrace",
    cities: ["singapore"],
    rent: 2,
    title: t("新加坡 F1 夜赛", "The Singapore Night Race"),
    text: t("两轮内，新加坡租金翻倍。", "For two rounds, rent in Singapore doubles."),
    basis: t(
      "2008 年的新加坡大奖赛是一级方程式第一场夜赛，赛道是滨海湾一带的街道。",
      "The 2008 Singapore Grand Prix was Formula 1's first night race, run on the streets around Marina Bay.",
    ),
    source: "https://singaporegp.sg/en/news/2008/timetable-set-for-first-ever-night-race-in-formula-1a-history/",
  },
  {
    id: "dsf",
    cities: ["dubai"],
    buy: 0.75,
    title: t("迪拜购物节", "Dubai Shopping Festival"),
    text: t("两轮内，在迪拜买地打七五折。", "For two rounds, Dubai sells at 25% off."),
    basis: t(
      "迪拜购物节每年 12 月到 1 月办，2024 年冬天已是第 30 届。",
      "The Dubai Shopping Festival runs every December to January; winter 2024 saw its 30th edition.",
    ),
    source: "https://www.dubaidet.gov.ae/en/newsroom/press-releases/dsf-30th-edition-announcement",
  },
  {
    id: "ces",
    cities: ["lasvegas"],
    rent: 2,
    title: t("CES 来了", "CES Comes to Town"),
    text: t("两轮内，拉斯维加斯租金翻倍。", "For two rounds, rent in Las Vegas doubles."),
    basis: t(
      "每年 1 月，消费电子展 CES 在拉斯维加斯举行；2026 年经审计有 148,392 人参加。",
      "Every January, CES takes over Las Vegas; 148,392 people attended in 2026, by audited count.",
    ),
    source: "https://www.ces.tech/press-releases/ces-2026-audit-shows-four-percent-growth-in-participation-as-innovators-showed-up-in-las-vegas",
  },
  {
    id: "tulips",
    cities: ["istanbul"],
    rent: 2,
    title: t("伊斯坦布尔郁金香节", "Istanbul Tulip Festival"),
    text: t("两轮内，伊斯坦布尔租金翻倍。", "For two rounds, rent in Istanbul doubles."),
    basis: t(
      "每年春天，伊斯坦布尔的公园开出上百万朵郁金香，埃米尔甘林园是其中之一。",
      "Every spring, millions of tulips flower in Istanbul's parks and gardens, Emirgan Grove among them.",
    ),
    source: "https://goturkiye.com/branding/press-releases/enjoy-the-colours-of-spring-in-istanbul",
  },
  {
    id: "carnival",
    cities: ["london"],
    rent: 2,
    title: t("诺丁山狂欢节", "Notting Hill Carnival"),
    text: t("两轮内，伦敦租金翻倍。", "For two rounds, rent in London doubles."),
    basis: t(
      "诺丁山狂欢节在八月银行假日周末的周日和周一，免费参加。",
      "Notting Hill Carnival fills the Sunday and Monday of the August bank holiday weekend, and it's free.",
    ),
    source: "https://nhcarnival.org/faqs",
  },
];

const BY_ID: Record<string, NewsItem> = Object.fromEntries(NEWS.map((n) => [n.id, n]));

export const newsById = (id: string): NewsItem | undefined => BY_ID[id];

/** The news in force in a city, if the game has travel news switched on. */
export function newsFor(s: GameState, city: string): NewsItem | null {
  if (!s.cfg.news || !s.news) return null;
  const n = BY_ID[s.news.id];
  return n && n.cities.includes(city) ? n : null;
}
