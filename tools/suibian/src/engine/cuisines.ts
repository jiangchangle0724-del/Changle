// Cuisines, finer than Google's ("Chinese restaurant" is not one thing in Vancouver). Round 1 shows
// them all as a menu, in three groups; a place's cuisine is guessed from its Google types and name.
import type { CuisineId, Text } from "./types";

/** Round 1's menu is in these groups, in this order. */
export type CuisineGroup = "chinese" | "asian" | "west";

export const CUISINE_GROUPS: Record<CuisineGroup, Text> = {
  chinese: { zh: "中餐", en: "Chinese" },
  asian: { zh: "亚洲菜", en: "Asian" },
  west: { zh: "西餐和其他", en: "Western and more" },
};

/**
 * How to look for a cuisine when someone at the table wants it: Google's place types where Google
 * has them (a Nearby Search), otherwise words (a Text Search; Google has no type for Sichuan,
 * Shanghainese or Hong Kong-style cafés). Types are all from Google's Table A.
 */
export interface CuisineSearch {
  types?: string[];
  text?: string;
}

export const CUISINES: Record<CuisineId, Text & { emoji: string; group?: CuisineGroup; search?: CuisineSearch }> = {
  cantonese: { zh: "粤菜 · 点心", en: "Cantonese · dim sum", emoji: "🥟", group: "chinese", search: { types: ["cantonese_restaurant", "dim_sum_restaurant"] } },
  hk_cafe: { zh: "港式茶餐厅", en: "HK café", emoji: "🧋", group: "chinese", search: { text: "Hong Kong style cafe" } },
  sichuan: { zh: "川菜 · 湘菜", en: "Sichuan · Hunan", emoji: "🌶️", group: "chinese", search: { text: "Sichuan restaurant" } },
  hotpot: { zh: "火锅", en: "Hot pot", emoji: "🍲", group: "chinese", search: { types: ["hot_pot_restaurant"] } },
  taiwanese: { zh: "台湾菜", en: "Taiwanese", emoji: "🍚", group: "chinese", search: { types: ["taiwanese_restaurant"] } },
  shanghai: { zh: "上海 · 江浙菜", en: "Shanghai · Jiangzhe", emoji: "🦀", group: "chinese", search: { text: "Shanghainese restaurant" } },
  northern: { zh: "东北 · 西北菜", en: "Northern Chinese", emoji: "🫓", group: "chinese", search: { text: "Northern Chinese restaurant Lanzhou Xi'an Dongbei" } },
  noodles: { zh: "面馆 · 饺子", en: "Noodles · dumplings", emoji: "🍜", group: "chinese", search: { types: ["chinese_noodle_restaurant", "dumpling_restaurant"] } },
  chinese_bbq: { zh: "中式烧烤 · 串串", en: "Chinese BBQ skewers", emoji: "🍢", group: "chinese", search: { text: "Chinese BBQ skewers" } },
  chinese: { zh: "其他中餐", en: "Other Chinese", emoji: "🥡", group: "chinese", search: { types: ["chinese_restaurant"] } },
  japanese: { zh: "日料 · 寿司", en: "Japanese · sushi", emoji: "🍣", group: "asian", search: { types: ["japanese_restaurant", "sushi_restaurant"] } },
  ramen: { zh: "拉面", en: "Ramen", emoji: "🍥", group: "asian", search: { types: ["ramen_restaurant"] } },
  izakaya: { zh: "居酒屋 · 日式烤肉", en: "Izakaya · yakiniku", emoji: "🏮", group: "asian", search: { types: ["japanese_izakaya_restaurant", "yakiniku_restaurant", "yakitori_restaurant"] } },
  korean: { zh: "韩国菜", en: "Korean", emoji: "🥘", group: "asian", search: { types: ["korean_restaurant"] } },
  kbbq: { zh: "韩国烤肉", en: "Korean BBQ", emoji: "🔥", group: "asian", search: { types: ["korean_barbecue_restaurant"] } },
  vietnamese: { zh: "越南菜", en: "Vietnamese", emoji: "🍲", group: "asian", search: { types: ["vietnamese_restaurant"] } },
  thai: { zh: "泰国菜", en: "Thai", emoji: "🍤", group: "asian", search: { types: ["thai_restaurant"] } },
  filipino: { zh: "菲律宾菜", en: "Filipino", emoji: "🍖", group: "asian", search: { types: ["filipino_restaurant"] } },
  sea: { zh: "马来 · 新加坡 · 印尼", en: "Malaysian · Singaporean · Indonesian", emoji: "🥥", group: "asian", search: { types: ["malaysian_restaurant", "indonesian_restaurant"] } },
  indian: { zh: "印度 · 巴基斯坦", en: "Indian · Pakistani", emoji: "🍛", group: "asian", search: { types: ["indian_restaurant", "north_indian_restaurant", "south_indian_restaurant", "pakistani_restaurant"] } },
  italian: { zh: "意大利 · 披萨", en: "Italian · pizza", emoji: "🍝", group: "west", search: { types: ["italian_restaurant", "pizza_restaurant"] } },
  mexican: { zh: "墨西哥 · 拉美", en: "Mexican · Latin", emoji: "🌮", group: "west", search: { types: ["mexican_restaurant", "latin_american_restaurant", "taco_restaurant"] } },
  western: { zh: "美式 · 汉堡", en: "American · burgers", emoji: "🍔", group: "west", search: { types: ["american_restaurant", "hamburger_restaurant", "bar_and_grill"] } },
  steak: { zh: "牛排 · 烧烤", en: "Steak · barbecue", emoji: "🥩", group: "west", search: { types: ["steak_house", "barbecue_restaurant"] } },
  french: { zh: "法国 · 西班牙", en: "French · Spanish", emoji: "🥖", group: "west", search: { types: ["french_restaurant", "spanish_restaurant", "tapas_restaurant", "bistro"] } },
  mediterranean: { zh: "希腊 · 地中海", en: "Greek · Mediterranean", emoji: "🫒", group: "west", search: { types: ["mediterranean_restaurant", "greek_restaurant"] } },
  middle_eastern: { zh: "中东 · 波斯 · 土耳其", en: "Middle Eastern · Persian · Turkish", emoji: "🥙", group: "west", search: { types: ["middle_eastern_restaurant", "lebanese_restaurant", "turkish_restaurant", "persian_restaurant"] } },
  seafood: { zh: "海鲜", en: "Seafood", emoji: "🦞", group: "west", search: { types: ["seafood_restaurant"] } },
  vegetarian: { zh: "素食", en: "Vegetarian", emoji: "🥗", group: "west", search: { types: ["vegetarian_restaurant", "vegan_restaurant"] } },
  brunch: { zh: "早午餐", en: "Brunch", emoji: "🥞", group: "west", search: { types: ["brunch_restaurant", "breakfast_restaurant"] } },
  cafe: { zh: "咖啡 · 甜品", en: "Café · desserts", emoji: "☕", group: "west", search: { types: ["cafe", "coffee_shop", "dessert_restaurant"] } },
  other: { zh: "其他", en: "Other", emoji: "🍽️" },
};

/** Round 1's menu: every cuisine that has a group, in order. */
export const MENU: CuisineId[] = (Object.keys(CUISINES) as CuisineId[]).filter((c) => CUISINES[c].group);

// Names first, most specific first: they say more than Google's types for Chinese and Asian places.
const BY_NAME: [RegExp, CuisineId][] = [
  [/korean (bbq|barbecue)|[韩韓](式|国|國)?(烤肉|烧烤|燒烤)|\bgogi\b|\bkbbq\b/i, "kbbq"],
  [/火锅|火鍋|hot ?pot|shabu|麻辣烫|麻辣燙/i, "hotpot"],
  [/茶餐[厅廳]|港式|冰室|hk caf|hong kong style/i, "hk_cafe"],
  // Cantonese roast meats ("HK BBQ Master") before Chinese barbecue skewers.
  [/[烧燒][腊臘味]|bbq master|bbq house|roast meat/i, "cantonese"],
  [/烧烤|燒烤|烤串|串串|串[烧燒]|肉串|撸串|skewer/i, "chinese_bbq"],
  [/川|蜀|湘|渝|重庆|重慶|sichuan|szechuan|szechwan|hunan|chongqing|麻辣/i, "sichuan"],
  [/点心|點心|茶楼|茶樓|酒家|粤|粵|粥|dim ?sum|cantonese|congee|seafood restaurant/i, "cantonese"],
  [/台湾|台灣|台北|taiwan|taipei/i, "taiwanese"],
  [/上海|沪|滬|江南|杭州|苏州|蘇州|南京|无锡|無錫|宁波|寧波|小笼|小籠|生煎|shanghai|jiangnan|hangzhou|xiao ?long/i, "shanghai"],
  // Chinese hand-pulled noodles before Japanese ramen: 兰州拉面 isn't a ramen shop.
  [/[兰蘭]州|西安|陕西|陝西|新疆|东北|東北|哈尔滨|哈爾濱|山西|刀削|肉夹馍|肉夾饃|[凉涼]皮|手[工拉]拉?[面麵]|biang|lanzhou|\bxi'?an\b|xinjiang|dongbei|uyghur|uighur|hand[- ]pulled/i, "northern"],
  [/[面麵](馆|館|家)|[饺餃]子|水[饺餃]|[云雲]吞|[馄餛][饨飩]|米[线線]|noodle house|dumpling|wonton/i, "noodles"],
  [/拉面|拉麵|ramen|ラーメン/i, "ramen"],
  [/pho\b|phở|banh ?mi|bánh|vietnam|越南|河粉/i, "vietnamese"],
  [/izakaya|居酒屋|yakiniku|焼肉|yakitori|焼鳥|[烧燒]鸟|robata/i, "izakaya"],
  [/sushi|寿司|壽司|鮨|omakase|日本料理|和食|udon|[乌烏]冬|tempura|donburi/i, "japanese"],
  [/korean|韩国|韓國|bibimbap|tofu house|tteok/i, "korean"],
  [/filipino|pinoy|philippine|lechon|kamayan|jollibee|菲律[宾賓]/i, "filipino"],
  [/malaysia|singapore|indonesia|laksa|nasi|roti|satay|hainanese|马来|馬來|新加坡|印尼|海南[鸡雞]/i, "sea"],
  [/thai\b|泰国|泰國|泰式|bangkok|siam|pad thai|tom yum/i, "thai"],
  [/india|tandoor|biryani|masala|punjab|dosa|pakistan|印度/i, "indian"],
  [/shawarma|kebab|kabob|falafel|persian|lebanese|turkish|afghan|iranian|arabic/i, "middle_eastern"],
  [/greek|souvlaki|gyro|mediterranean|taverna/i, "mediterranean"],
  [/taco|taquer|burrito|mexic|cantina|peruvian|brazil|churrasc|pupusa/i, "mexican"],
  [/pizz|pasta|trattoria|osteria|ristorante|italian|italia/i, "italian"],
  [/bistro|brasserie|french|crêpe|crepe|tapas|taperia|spanish|paella/i, "french"],
  [/steak|牛排|chop ?house|smokehouse/i, "steak"],
  [/oyster|seafood|crab|lobster|海鲜|海鮮|生[蚝蠔]|fish (and|&|n'?) ?chips/i, "seafood"],
  [/vegan|vegetarian|素食|素菜|plant[- ]based/i, "vegetarian"],
  [/burger|[汉漢]堡|diner\b|\bpub\b|tap ?house|bar (and|&) grill|\bjoey\b|cactus club|\bearls\b|browns socialhouse|milestones|white spot|denny|moxies/i, "western"],
  [/brunch|breakfast|早午餐|pancake/i, "brunch"],
  [/café|cafe\b|coffee|espresso|dessert|gelato|bakery|bubble tea|奶茶|甜品|糖水|咖啡/i, "cafe"],
];

const BY_TYPE: Record<string, CuisineId> = {
  dim_sum_restaurant: "cantonese",
  cantonese_restaurant: "cantonese",
  hot_pot_restaurant: "hotpot",
  taiwanese_restaurant: "taiwanese",
  chinese_noodle_restaurant: "noodles",
  dumpling_restaurant: "noodles",
  noodle_shop: "noodles",
  mongolian_barbecue_restaurant: "chinese_bbq",
  chinese_restaurant: "chinese",
  japanese_restaurant: "japanese",
  sushi_restaurant: "japanese",
  japanese_curry_restaurant: "japanese",
  tonkatsu_restaurant: "japanese",
  japanese_izakaya_restaurant: "izakaya",
  yakiniku_restaurant: "izakaya",
  yakitori_restaurant: "izakaya",
  ramen_restaurant: "ramen",
  korean_restaurant: "korean",
  korean_barbecue_restaurant: "kbbq",
  vietnamese_restaurant: "vietnamese",
  thai_restaurant: "thai",
  filipino_restaurant: "filipino",
  indonesian_restaurant: "sea",
  malaysian_restaurant: "sea",
  singaporean_restaurant: "sea",
  indian_restaurant: "indian",
  north_indian_restaurant: "indian",
  south_indian_restaurant: "indian",
  pakistani_restaurant: "indian",
  bangladeshi_restaurant: "indian",
  sri_lankan_restaurant: "indian",
  middle_eastern_restaurant: "middle_eastern",
  lebanese_restaurant: "middle_eastern",
  turkish_restaurant: "middle_eastern",
  persian_restaurant: "middle_eastern",
  afghani_restaurant: "middle_eastern",
  kebab_shop: "middle_eastern",
  shawarma_restaurant: "middle_eastern",
  falafel_restaurant: "middle_eastern",
  israeli_restaurant: "middle_eastern",
  mediterranean_restaurant: "mediterranean",
  greek_restaurant: "mediterranean",
  gyro_restaurant: "mediterranean",
  italian_restaurant: "italian",
  pizza_restaurant: "italian",
  mexican_restaurant: "mexican",
  taco_restaurant: "mexican",
  burrito_restaurant: "mexican",
  tex_mex_restaurant: "mexican",
  latin_american_restaurant: "mexican",
  brazilian_restaurant: "mexican",
  peruvian_restaurant: "mexican",
  american_restaurant: "western",
  hamburger_restaurant: "western",
  diner: "western",
  bar_and_grill: "western",
  pub: "western",
  gastropub: "western",
  sports_bar: "western",
  sandwich_shop: "western",
  fast_food_restaurant: "western",
  chicken_restaurant: "western",
  chicken_wings_restaurant: "western",
  hot_dog_restaurant: "western",
  steak_house: "steak",
  barbecue_restaurant: "steak",
  french_restaurant: "french",
  bistro: "french",
  spanish_restaurant: "french",
  tapas_restaurant: "french",
  seafood_restaurant: "seafood",
  oyster_bar_restaurant: "seafood",
  fish_and_chips_restaurant: "seafood",
  vegetarian_restaurant: "vegetarian",
  vegan_restaurant: "vegetarian",
  breakfast_restaurant: "brunch",
  brunch_restaurant: "brunch",
  cafe: "cafe",
  coffee_shop: "cafe",
  dessert_restaurant: "cafe",
  dessert_shop: "cafe",
  bakery: "cafe",
  tea_house: "cafe",
  ice_cream_shop: "cafe",
};

/** Types that say little: the name refines them (an HK café Google calls a café, a pub called "… Ramen"). */
const WEAK = new Set(["chinese_restaurant", "asian_restaurant", "cafe", "coffee_shop", "fast_food_restaurant", "bar_and_grill", "pub", "diner", "sandwich_shop", "meal_takeaway", "buffet_restaurant", "family_restaurant", "fusion_restaurant", "asian_fusion_restaurant"]);

/**
 * Best guess at a place's cuisine: its primary type if that says enough, then its name, then its
 * other types (a "Chinese restaurant" that Google also calls a hot pot restaurant is a hot pot place).
 */
export function guessCuisine(name: string, primaryType: string | undefined, types: string[] = []): CuisineId {
  const typed = primaryType && BY_TYPE[primaryType];
  if (typed && !WEAK.has(primaryType!)) return typed;
  for (const [re, c] of BY_NAME) if (re.test(name)) return c;
  for (const t of types) if (BY_TYPE[t] && !WEAK.has(t)) return BY_TYPE[t];
  if (typed) return typed;
  for (const t of types) if (BY_TYPE[t]) return BY_TYPE[t];
  return "other";
}
