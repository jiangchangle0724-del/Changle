// Being there: how to say each city's hello and what it means, and what the game's money comes to
// in the city's own (for prices and rent: "$250 ≈ ¥39,000"). The arrival card shows them with the
// local time and the weather (ui/Local.tsx). The hello itself is in the city data (engine/data.ts).
import type { Lang } from "../room/protocol";
import type { Text } from "../engine";

export interface Hello {
  /** How to say it, written so a reader of that language can: 谐音 for Chinese, a respelling with
   * the stressed part in capitals for English. Missing where the reader can read it already. */
  say: Partial<Text>;
  /** What it means. */
  means: Text;
}

export const HELLO: Record<string, Hello> = {
  cairo: { say: { zh: "阿哈兰", en: "AH-lan" }, means: { zh: "你好，欢迎", en: "Hi, welcome" } },
  capetown: { say: { zh: "莫洛", en: "MAW-law" }, means: { zh: "你好（科萨语）", en: "Hello, in isiXhosa" } },
  buenosaires: { say: { zh: "欧拉！给塔尔？", en: "OH-la! keh TAL?" }, means: { zh: "你好！怎么样？", en: "Hi! How's it going?" } },
  mexicocity: { say: { zh: "欧拉！给温达？", en: "OH-la! keh ON-da?" }, means: { zh: "你好！在干嘛呢？", en: "Hi! What's up?" } },
  rio: { say: { zh: "哦伊！图度本？", en: "OY! TOO-doo bayn?" }, means: { zh: "嗨！都好吗？", en: "Hi! All good?" } },
  istanbul: { say: { zh: "梅尔哈巴", en: "MEHR-ha-ba" }, means: { zh: "你好", en: "Hello" } },
  mumbai: { say: { zh: "那马斯卡", en: "nuh-muh-SKAR" }, means: { zh: "你好（双手合十说）", en: "Hello, said with palms pressed together" } },
  dubai: { say: { zh: "马尔哈巴", en: "MAR-ha-ba" }, means: { zh: "你好", en: "Hello" } },
  lasvegas: { say: {}, means: { zh: "嗨，你好", en: "A friendly American hello" } },
  vancouver: { say: { zh: "哈喽 · 蓬如", en: "bon-ZHOOR" }, means: { zh: "你好（加拿大的两种官方语言：英语和法语）", en: "Hello, in Canada's two official languages" } },
  newyork: { say: {}, means: { zh: "嘿，最近怎么样？（纽约口音）", en: "Hi, how are you? The New York way" } },
  tokyo: { say: { zh: "空尼奇哇", en: "kon-NEE-chee-wa" }, means: { zh: "你好（白天说）", en: "Hello, in the daytime" } },
  beijing: { say: { en: "neen HOW" }, means: { zh: "你好（客气的说法，北京人爱说「您」）", en: "Hello, politely: 您 is the respectful you" } },
  shanghai: { say: { zh: "浓好", en: "nong HO" }, means: { zh: "你好（上海话）", en: "Hello, in Shanghainese" } },
  bangkok: { say: { zh: "萨瓦迪", en: "sa-wat-DEE" }, means: { zh: "你好（女生后面加「卡」，男生加「克拉」）", en: "Hello (women add ka, men krap)" } },
  sydney: { say: { zh: "格戴", en: "g'DAY" }, means: { zh: "你好（澳洲人说，Good day 的缩写）", en: "Hello: Aussie for good day" } },
  singapore: { say: { zh: "阿巴卡巴？", en: "AH-pa KAH-bar?" }, means: { zh: "你好吗？（马来语，新加坡的国语）", en: "How are you? In Malay, Singapore's national language" } },
  venice: { say: { zh: "乔", en: "CHOW" }, means: { zh: "你好，也是再见", en: "Hi, and also bye" } },
  paris: { say: { zh: "蓬如", en: "bon-ZHOOR" }, means: { zh: "你好（白天说）", en: "Hello, in the daytime" } },
  london: { say: { zh: "哦莱特？", en: "orl-RIGHT?" }, means: { zh: "你好呀（伦敦人打招呼，不是问你有没有事）", en: "Hi! A London hello, not a question about your health" } },
  seoul: { say: { zh: "阿尼哈塞哟", en: "AHN-nyong-ha-SAY-yo" }, means: { zh: "你好（敬语）", en: "Hello, politely" } },
  hongkong: { say: { zh: "雷猴", en: "nay HO" }, means: { zh: "你好（粤语）", en: "Hello, in Cantonese" } },
};

/**
 * What US$1 comes to in each city's money, on 2 November 2026: the European Central Bank's reference
 * rates (api.frankfurter.dev), and for the three it doesn't quote (EGP, ARS, AED) open.er-api.com the
 * same day. The game's $ counts as US dollars. Fixed on purpose: the game never asks for rates.
 */
export const RATES_DATE = "2026-11-02";
export const RATES: Record<string, number> = {
  EGP: 55.42,
  ZAR: 16.64,
  ARS: 1545,
  MXN: 18.72,
  BRL: 5.438,
  TRY: 49.97,
  INR: 94.91,
  AED: 3.6725,
  USD: 1,
  CAD: 1.397,
  JPY: 157.9,
  CNY: 6.648,
  THB: 33.76,
  AUD: 1.427,
  SGD: 1.279,
  EUR: 0.8916,
  GBP: 0.7452,
  KRW: 1343,
  HKD: 7.846,
};

/** Each city's money (ISO 4217). */
export const CURRENCY: Record<string, string> = {
  cairo: "EGP",
  capetown: "ZAR",
  buenosaires: "ARS",
  mexicocity: "MXN",
  rio: "BRL",
  istanbul: "TRY",
  mumbai: "INR",
  dubai: "AED",
  lasvegas: "USD",
  vancouver: "CAD",
  newyork: "USD",
  tokyo: "JPY",
  beijing: "CNY",
  shanghai: "CNY",
  bangkok: "THB",
  sydney: "AUD",
  singapore: "SGD",
  venice: "EUR",
  paris: "EUR",
  london: "GBP",
  seoul: "KRW",
  hongkong: "HKD",
};

/** How each is written in English, before the figure ("¥39,000"); and its short name in Chinese, after it ("3.9 万日元"). */
const SIGN: Record<string, [en: string, zh: string]> = {
  EGP: ["E£", "埃及镑"],
  ZAR: ["R", "兰特"],
  ARS: ["ARS ", "比索"],
  MXN: ["MX$", "比索"],
  BRL: ["R$", "雷亚尔"],
  TRY: ["₺", "里拉"],
  INR: ["₹", "卢比"],
  AED: ["AED ", "迪拉姆"],
  USD: ["US$", "美元"],
  CAD: ["C$", "加元"],
  JPY: ["¥", "日元"],
  CNY: ["CN¥", "元"],
  THB: ["฿", "泰铢"],
  AUD: ["A$", "澳元"],
  SGD: ["S$", "新元"],
  EUR: ["€", "欧元"],
  GBP: ["£", "英镑"],
  KRW: ["₩", "韩元"],
  HKD: ["HK$", "港元"],
};

/** Two significant figures: an amount that only says roughly how much ("≈"). */
function round2(x: number): number {
  if (x <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

const digits = (x: number) => (x < 10 ? String(Math.round(x * 10) / 10) : Math.round(x).toLocaleString("en-US"));

/**
 * The game's `dollars` in a city's money, roughly: "≈ ¥39,000" or "约 3.9 万日元". Null where the
 * city's money is the dollar already (Las Vegas, New York), or the city isn't one of the 22.
 */
export function localMoney(city: string, dollars: number, lang: Lang): string | null {
  const code = CURRENCY[city];
  if (!code || code === "USD" || !(dollars > 0)) return null;
  const x = round2(dollars * RATES[code]);
  const [sign, name] = SIGN[code];
  if (lang === "en") return `≈ ${sign}${digits(x)}`;
  if (x >= 1e8) return `约 ${digits(round2(x / 1e8))} 亿${name}`;
  if (x >= 1e4) return `约 ${digits(round2(x / 1e4))} 万${name}`;
  return `约 ${digits(x)} ${name}`;
}

/** What $1 comes to there, for the arrival card: "$1 ≈ ₺50" or "$1 约 50 里拉". Null for the dollar's own cities. */
export const rateLine = (city: string, lang: Lang) => {
  const one = localMoney(city, 1, lang);
  return one ? `$1 ${one}` : null;
};
