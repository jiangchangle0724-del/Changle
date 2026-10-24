// Cuisines, finer than Google's ("Chinese restaurant" is not one thing in Vancouver).
// v1 guesses them from Google's place types and the restaurant's name; v2 adds our own tags.
import type { CuisineId, Text } from "./types";

export const CUISINES: Record<CuisineId, Text & { emoji: string }> = {
  cantonese: { zh: "粤菜 · 点心", en: "Cantonese · dim sum", emoji: "🥟" },
  hk_cafe: { zh: "港式茶餐厅", en: "HK café", emoji: "🧋" },
  sichuan: { zh: "川湘 · 麻辣", en: "Sichuan · Hunan", emoji: "🌶️" },
  hotpot: { zh: "火锅", en: "Hot pot", emoji: "🍲" },
  taiwanese: { zh: "台湾菜", en: "Taiwanese", emoji: "🧆" },
  chinese: { zh: "其他中餐", en: "Other Chinese", emoji: "🍜" },
  japanese: { zh: "日料 · 寿司", en: "Japanese · sushi", emoji: "🍣" },
  ramen: { zh: "拉面", en: "Ramen", emoji: "🍥" },
  korean: { zh: "韩国菜", en: "Korean", emoji: "🥘" },
  vietnamese: { zh: "越南菜", en: "Vietnamese", emoji: "🍲" },
  thai: { zh: "泰国菜", en: "Thai", emoji: "🍛" },
  sea: { zh: "东南亚", en: "Malaysian · Filipino · Indonesian", emoji: "🥥" },
  indian: { zh: "印度菜", en: "Indian", emoji: "🍛" },
  middle_eastern: { zh: "中东 · 地中海", en: "Middle Eastern · Mediterranean", emoji: "🥙" },
  italian: { zh: "意大利 · 披萨", en: "Italian · pizza", emoji: "🍝" },
  mexican: { zh: "墨西哥 · 拉美", en: "Mexican · Latin", emoji: "🌮" },
  western: { zh: "西餐 · 汉堡 · 牛排", en: "Western · burgers · steak", emoji: "🍔" },
  seafood: { zh: "海鲜", en: "Seafood", emoji: "🦞" },
  vegetarian: { zh: "素食", en: "Vegetarian", emoji: "🥗" },
  brunch: { zh: "早午餐 · 咖啡", en: "Brunch · café", emoji: "🥞" },
  other: { zh: "其他", en: "Other", emoji: "🍽️" },
};

// Names first: they are more specific than Google's types for Chinese and Asian places.
const BY_NAME: [RegExp, CuisineId][] = [
  [/火锅|火鍋|hot ?pot|shabu|麻辣烫|麻辣燙/i, "hotpot"],
  [/茶餐[厅廳]|港式|冰室|hk caf|hong kong style/i, "hk_cafe"],
  [/川|蜀|湘|渝|重庆|重慶|sichuan|szechuan|szechwan|hunan|chongqing|麻辣/i, "sichuan"],
  [/点心|點心|茶楼|茶樓|酒家|粤|粵|dim ?sum|cantonese|seafood restaurant/i, "cantonese"],
  [/台湾|台灣|taiwan/i, "taiwanese"],
  [/拉面|拉麵|ramen|ramen-ya/i, "ramen"],
  [/pho\b|phở|banh ?mi|bánh/i, "vietnamese"],
  [/饺子|餃子|面馆|麵館|小笼|小籠|上海|东北|東北|dumpling|noodle house|xiao ?long/i, "chinese"],
  [/sushi|寿司|壽司|izakaya|居酒屋/i, "japanese"],
  [/korean|韩国|韓國|bbq gogi|bibimbap/i, "korean"],
  [/malaysia|singapore|indonesia|filipino|laksa|nasi|roti/i, "sea"],
  [/thai\b|泰/i, "thai"],
  [/halal|shawarma|kebab|falafel|persian|lebanese|turkish|greek/i, "middle_eastern"],
  [/brunch|breakfast|café|cafe\b|coffee/i, "brunch"],
];

const BY_TYPE: Record<string, CuisineId> = {
  dim_sum_restaurant: "cantonese",
  cantonese_restaurant: "cantonese",
  hot_pot_restaurant: "hotpot",
  sichuan_restaurant: "sichuan",
  taiwanese_restaurant: "taiwanese",
  chinese_restaurant: "chinese",
  chinese_noodle_restaurant: "chinese",
  dumpling_restaurant: "chinese",
  japanese_restaurant: "japanese",
  sushi_restaurant: "japanese",
  ramen_restaurant: "ramen",
  korean_restaurant: "korean",
  korean_barbecue_restaurant: "korean",
  vietnamese_restaurant: "vietnamese",
  thai_restaurant: "thai",
  indonesian_restaurant: "sea",
  malaysian_restaurant: "sea",
  filipino_restaurant: "sea",
  singaporean_restaurant: "sea",
  indian_restaurant: "indian",
  pakistani_restaurant: "indian",
  middle_eastern_restaurant: "middle_eastern",
  mediterranean_restaurant: "middle_eastern",
  lebanese_restaurant: "middle_eastern",
  turkish_restaurant: "middle_eastern",
  greek_restaurant: "middle_eastern",
  persian_restaurant: "middle_eastern",
  afghani_restaurant: "middle_eastern",
  italian_restaurant: "italian",
  pizza_restaurant: "italian",
  mexican_restaurant: "mexican",
  latin_american_restaurant: "mexican",
  brazilian_restaurant: "mexican",
  american_restaurant: "western",
  hamburger_restaurant: "western",
  steak_house: "western",
  french_restaurant: "western",
  spanish_restaurant: "western",
  barbecue_restaurant: "western",
  fast_food_restaurant: "western",
  sandwich_shop: "western",
  seafood_restaurant: "seafood",
  vegetarian_restaurant: "vegetarian",
  vegan_restaurant: "vegetarian",
  breakfast_restaurant: "brunch",
  brunch_restaurant: "brunch",
  cafe: "brunch",
  coffee_shop: "brunch",
};

/** Best guess at a place's cuisine from its name, primary type and other types. */
export function guessCuisine(name: string, primaryType: string | undefined, types: string[] = []): CuisineId {
  // A specific Google type beats the name, except plain "chinese_restaurant", which the name refines.
  const typed = primaryType && BY_TYPE[primaryType];
  if (typed && typed !== "chinese") return typed;
  for (const [re, c] of BY_NAME) if (re.test(name)) return c;
  if (typed) return typed;
  for (const t of types) if (BY_TYPE[t]) return BY_TYPE[t];
  return "other";
}
