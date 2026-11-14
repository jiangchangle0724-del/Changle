// Cuisines, finer than Google's ("Chinese restaurant" is not one thing in Vancouver). Round 1 shows
// them all as a menu, in three groups. What a place is comes from its name, its Google types and
// Google's descriptions of it (cuisineGuess), and a place can be more than one: a hot pot place that
// also grills skewers counts for whoever liked either (Steve, 2026-11-13: a 串串 place the table
// liked came after Earls, because nothing in "The Meat Up BBQ" said skewers).
import type { CuisineId, Place, Text } from "./types";

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

/** Every cuisine a place is, its main one first. */
export const cuisinesOf = (p: Pick<Place, "cuisine" | "also">): CuisineId[] => (p.also?.length ? [p.cuisine, ...p.also] : [p.cuisine]);

/** A word for a cuisine in a name or a description. `generic`: any Chinese restaurant may use it (酒家, 粥). */
type Rule = [RegExp, CuisineId, "generic"?];

// Names, most specific first: they say more than Google's types for Chinese and Asian places. A name
// can say several things ("新疆烤串": skewers, and Northern Chinese); the first is its main cuisine.
// No lookbehind here: older iPhones can't read it, and this file is in the page too.
const BY_NAME: Rule[] = [
  // Grilled at the table, Korean and Japanese, before Chinese barbecue.
  [/korean (bbq|barbecue|grill)|[韩韓](式|国|國)?(烤肉|烧烤|燒烤)|\bgogi\b|\bkbbq\b|고기|갈비|삼겹살|galbi|samgyeopsal/i, "kbbq"],
  [/izakaya|居酒屋|yakiniku|焼肉|日式(烤肉|烧烤|燒烤|烧肉|燒肉)|japanese (bbq|barbecue|grill)|yakitori|焼鳥|[烧燒][鸟鳥]|robata|炉端|kushiyaki|串焼/i, "izakaya"],
  [/火锅|火鍋|hot ?pot|shabu|麻辣[烫燙]|冒菜|steamboat|涮肉|[铜銅][锅鍋]|打[边邊][炉爐]|海底[捞撈]|haidilao|小肥羊|little sheep|dolar shop|豆[捞撈]/i, "hotpot"],
  // 港式 alone: an HK café, but not 港式火锅, 港式点心, 港式烧腊 or 港式茶楼.
  [/茶餐[厅廳]|冰室|港式(?![火海点點烧燒酒粥饮飲]|早茶|茶[楼樓])|\bhk[- ]?(style|caf)|hong kong[- ]style|hong kong caf|caf[eé] de hong kong/i, "hk_cafe"],
  // Northern Chinese barbecue by its English name ("Northern BBQ"), then Cantonese roast meats ("HK
  // BBQ Master"; "Chinese BBQ" alone is mostly those), then skewers.
  [/(northern|beijing|northeast(ern)?|dongbei|xinjiang|sichuan|szechuan|mala|lamb) (bbq|barbecue|skewers?)|chinese (bbq |barbecue )?skewers?/i, "chinese_bbq"],
  [/[烧燒][腊臘味]|叉[烧燒]|[烧燒][鸭鴨鹅鵝]|bbq (master|house)|roast (meat|duck|goose|pork)|siu ?mei|char ?siu/i, "cantonese"],
  [/[烧燒]烤|[烤撸擼]串|串串|串[烧燒吧店儿兒]|[肉羊]串|烤吧|炭烤|shao ?kao|\bchuan'?r\b|\bchuan ?chuan\b/i, "chinese_bbq"],
  [/川|蜀|湘|渝|湖南|重庆|重慶|成都|sichuan|szechuan|szechwan|hunan|chongqing|chengdu|\bmala\b|麻辣|酸菜[鱼魚]|水煮|毛血旺|烤[鱼魚]/i, "sichuan"],
  [/台[湾灣北式中南]|高雄|taiwan|taipei|formosa|[卤滷魯]肉[饭飯]|[盐鹽]酥[鸡雞]|[鸡雞]排/i, "taiwanese"],
  [/上海|[沪滬]|江南|江浙|浙江|杭州|[苏蘇]州|[苏蘇]杭|南京|[无無][锡錫]|[宁寧]波|[扬揚]州|淮[扬揚]|[绍紹][兴興]|本[帮幫]|小[笼籠]|生煎|shanghai|jiangnan|jiangzhe|hangzhou|suzhou|nanjing|yangzhou|xiao ?long ?(bao|bun)|soup dumpling/i, "shanghai"],
  // Chinese hand-pulled noodles before Japanese ramen: 兰州拉面 isn't a ramen shop.
  [/[兰蘭]州|西安|[陕陝]西|新疆|[东東]北|北方|哈[尔爾][滨濱]|山西|山[东東]|北京|天津|河南|[内內]蒙|甘[肃肅]|[宁寧]夏|西北|刀削|肉[夹夾][馍饃]|[凉涼]皮|手[工拉]拉?[面麵]|[锅鍋]包肉|全聚德|biang|lanzhou|\bxi'?an\b|xinjiang|dongbei|uyghur|uighur|harbin|shandong|tianjin|peking|beijing|hand[- ]pulled|northern chinese/i, "northern"],
  // Cantonese last among the Chinese: 酒家, 茶楼 and 粥 are on any Chinese restaurant (上海酒家 is Shanghainese).
  [/[点點]心|dim ?sum|cantonese|[粤粵]|[广廣][东東州]|[顺順]德|潮州|潮汕|chiu ?chow|teochew|yum ?cha|[饮飲]茶|早茶/i, "cantonese"],
  [/茶[楼樓]|酒[家楼樓]|粥|congee|seafood restaurant/i, "cantonese", "generic"],
  [/越南|越式|vietnam|saigon|hanoi|\bpho\b|phở|banh ?mi|bánh|bún|河粉/i, "vietnamese"],
  [/拉[面麵]|ramen|ラーメン|らーめん|tsukemen|つけ[麺麵]/i, "ramen"],
  [/sushi|[寿壽]司|鮨|omakase|日本料理|和食|日式|和[风風]|日本|japan(ese)?\b|udon|うどん|[乌烏]冬|\bsoba\b|そば|蕎麦|tempura|天ぷら|天[妇婦][罗羅]|donburi|丼|teppan|[铁鐵鉄]板|okonomiyaki|お好み|takoyaki|たこ焼|tonkatsu|とんかつ|katsu|kaiseki|懐石|bento|弁当|onigiri|unagi|鰻|[\u3040-\u30ff]/i, "japanese"],
  [/korean|[韩韓][国國式]|首[尔爾]|seoul|bibim|tofu house|tteok|bulgogi|kimchi|pocha|[\uac00-\ud7af]/i, "korean"],
  [/filipino|pinoy|philippine|lechon|kamayan|jollibee|chowking|菲律[宾賓]|sisig|silog|lumpia|halo[- ]halo/i, "filipino"],
  [/malaysia|singapore|indonesia|laksa|nasi|roti canai|satay|hainan|[马馬]来|新加坡|印尼|星[马馬]|南洋|nyonya|penang|[槟檳]城|rendang|mamak|kopitiam/i, "sea"],
  [/thai\b|泰[国國式菜]|bangkok|siam|pad ?thai|tom ?yum|\bisaa?n\b|chiang ?mai/i, "thai"],
  [/india|tandoor|biryani|masala|punjab|dosa|pakistan|印度|nepal|sri lanka|bangladesh|bengal|himalaya|tikka|\bnaan\b|chaat|thali|karahi/i, "indian"],
  // What a place mostly serves, whoever cooks it: after the cuisines ("Pho Noodle House" is Vietnamese).
  [/[面麵](馆|館|家|店|坊|庄|莊)|[饺餃]子|水[饺餃]|[锅鍋][贴貼]|[云雲]吞|[馄餛][饨飩]|米[线線]|粉[面麵]|包子|noodle (house|bar|shop|express)|dumpling|wonton|potsticker/i, "noodles"],
  [/shawarma|kebab|kabob|kebap|falafel|persian|lebanese|turkish|afghan|iranian|arabic|syrian|iraqi|israeli|middle east|hummus|d[oö]ner|mezze|moroccan|中[东東]|土耳其|黎巴嫩|波斯/i, "middle_eastern"],
  [/greek|souvlaki|gyro|mediterranean|taverna|santorini|mykonos|希[腊臘]|地中海/i, "mediterranean"],
  // Skewers with no other word for them ("Mr. Skewer", not satay, souvlaki or yakitori): Chinese ones, in Vancouver.
  [/skewer/i, "chinese_bbq"],
  [/taco|taquer|burrito|mexic|cantina|peruvian|brazil|churrasc|pupusa|latin|arepa|empanada|colombia|venezuela|cuban|argentin|tex[- ]?mex|quesadilla|墨西哥|巴西|秘[鲁魯]/i, "mexican"],
  [/pizz|pasta|trattoria|osteria|ristorante|italian|italia|enoteca|意大利|意式|披[萨薩]|比[萨薩]/i, "italian"],
  [/bistro|brasserie|french|crêpe|crepe|tapas|taperia|spanish|paella|basque|法[国國式]|西班牙/i, "french"],
  [/steak|牛排|chop ?house|smoke ?house|brisket/i, "steak"],
  [/oyster|seafood|crab|lobster|海[鲜鮮]|生[蚝蠔]|fish (and|&|n'?) ?chips|chowder/i, "seafood"],
  [/vegan|vegetarian|素食|素菜|[斋齋][菜食]|素[斋齋]|plant[- ]based/i, "vegetarian"],
  [/burger|[汉漢]堡|diner\b|\bpub\b|tap ?house|bar (and|&) grill|\bjoey\b|cactus club|\bearls\b|browns socialhouse|milestones|white spot|denny|moxie'?s|cheesecake factory|美式|fried chicken|chicken wings|\bwings\b|hot ?dog|sandwich|\bdeli\b/i, "western"],
  [/brunch|breakfast|早午餐|早餐|pancake|bagel|benedict/i, "brunch"],
  [/café|cafe\b|coffee|espresso|dessert|gelato|bakery|bubble tea|奶茶|甜品|糖水|咖啡|蛋糕|patisserie|pâtisserie|boulangerie|donut|doughnut|\bboba\b|macaron/i, "cafe"],
];

/**
 * Kinds of food Google's descriptions of a place name, in English and in Chinese where Google has
 * them ("Lively spot for Chinese BBQ skewers and hot pot"). Only the Asian ones: a description's
 * "coffee" or "desserts" doesn't make a restaurant a café.
 */
const BY_TEXT: Rule[] = [
  [/korean (bbq|barbecue)|[韩韓](式|国|國)(烤肉|烧烤|燒烤)/i, "kbbq"],
  [/izakaya|yakitori|yakiniku|居酒屋|日式(烤肉|烧肉|燒肉)/i, "izakaya"],
  [/hot ?pot|shabu|火[锅鍋]/i, "hotpot"],
  [/hong kong[- ]style|\bhk[- ]style|茶餐[厅廳]/i, "hk_cafe"],
  [/chinese[^.]{0,30}skewer|skewers?[^.]{0,30}chinese|lamb skewer|shao ?kao|\bchuan'?r\b|[烧燒]烤|串串|烤串/i, "chinese_bbq"],
  [/sichuan|szechuan|szechwan|hunan|chongqing|川菜|湘菜/i, "sichuan"],
  [/taiwanese|台式|台[湾灣]菜/i, "taiwanese"],
  [/shanghainese|shanghai[- ]style|xiao ?long ?bao|soup dumpling|上海菜|本[帮幫]菜|小[笼籠]包/i, "shanghai"],
  [/northern chinese|northeastern chinese|dongbei|lanzhou|xinjiang|uyghur|uighur|\bxi'?an\b|shaanxi|hand[- ]pulled|peking duck|[东東]北菜|西北菜|[兰蘭]州|新疆/i, "northern"],
  [/cantonese|siu mei|roast (goose|pork|meats?)|bbq pork|char siu|[粤粵]菜|[烧燒][腊臘]/i, "cantonese"],
  [/ramen/i, "ramen"],
  [/sushi|sashimi|omakase|[寿壽]司|日本料理/i, "japanese"],
  [/korean|[韩韓]国菜|[韩韓]式/i, "korean"],
  [/vietnamese|\bpho\b|phở|banh mi|越南/i, "vietnamese"],
  [/\bthai\b|泰国菜|泰式/i, "thai"],
  [/filipino|菲律[宾賓]/i, "filipino"],
  [/malaysian|singaporean|indonesian|laksa|[马馬]来西亚|新加坡|印尼/i, "sea"],
  [/\bindian\b|pakistani|nepal|tandoori|biryani|印度/i, "indian"],
];

/** A description of a place that does a bit of everything: the cuisines it names say little about it. */
const VARIETY = /fusion|pan[- ]asian|inspired|buffet|eclectic|融合/i;

const BY_TYPE: Record<string, CuisineId> = {
  dim_sum_restaurant: "cantonese",
  cantonese_restaurant: "cantonese",
  hot_pot_restaurant: "hotpot",
  taiwanese_restaurant: "taiwanese",
  chinese_noodle_restaurant: "noodles",
  dumpling_restaurant: "noodles",
  noodle_shop: "noodles",
  // Not types Google searches by, but places may carry them.
  sichuan_restaurant: "sichuan",
  szechuan_restaurant: "sichuan",
  hunan_restaurant: "sichuan",
  shanghainese_restaurant: "shanghai",
  hong_kong_style_cafe: "hk_cafe",
  // A Mongolian barbecue is a stir-fry grill, not skewers.
  mongolian_barbecue_restaurant: "chinese",
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
  moroccan_restaurant: "middle_eastern",
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
  south_american_restaurant: "mexican",
  brazilian_restaurant: "mexican",
  peruvian_restaurant: "mexican",
  colombian_restaurant: "mexican",
  cuban_restaurant: "mexican",
  american_restaurant: "western",
  western_restaurant: "western",
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
  bagel_shop: "brunch",
  cafe: "cafe",
  coffee_shop: "cafe",
  dessert_restaurant: "cafe",
  dessert_shop: "cafe",
  bakery: "cafe",
  cake_shop: "cafe",
  pastry_shop: "cafe",
  donut_shop: "cafe",
  tea_house: "cafe",
  ice_cream_shop: "cafe",
};

/** Types that say little: the name refines them (an HK café Google calls a café, a pub called "… Ramen"). */
const WEAK = new Set(["chinese_restaurant", "mongolian_barbecue_restaurant", "asian_restaurant", "cafe", "coffee_shop", "fast_food_restaurant", "bar_and_grill", "pub", "diner", "sandwich_shop", "meal_takeaway", "buffet_restaurant", "family_restaurant", "fusion_restaurant", "asian_fusion_restaurant"]);

const ZH_TYPES = new Set(["chinese_restaurant", "cantonese_restaurant", "dim_sum_restaurant", "hot_pot_restaurant", "taiwanese_restaurant", "chinese_noodle_restaurant", "dumpling_restaurant", "mongolian_barbecue_restaurant", "sichuan_restaurant", "szechuan_restaurant", "hunan_restaurant", "shanghainese_restaurant", "hong_kong_style_cafe"]);
const JA_TYPES = new Set(["japanese_restaurant", "sushi_restaurant", "ramen_restaurant", "japanese_izakaya_restaurant", "yakiniku_restaurant", "yakitori_restaurant", "japanese_curry_restaurant", "tonkatsu_restaurant"]);
const KO_TYPES = new Set(["korean_restaurant", "korean_barbecue_restaurant"]);

/** Whose food a place's name and types point to, when its type alone can't say (barbecue, seafood…). */
type Ctx = "zh" | "ja" | "ko" | undefined;

function contextOf(name: string, types: string[], text: string): Ctx {
  if (/[\uac00-\ud7af]/.test(name)) return "ko";
  // Kana, or the kanji only Japanese writes (焼, 鮨).
  if (/[\u3040-\u30ff焼鮨]/.test(name)) return "ja";
  if (types.some((t) => KO_TYPES.has(t))) return "ko";
  if (types.some((t) => JA_TYPES.has(t))) return "ja";
  if (/[\u3400-\u9fff]/.test(name) || types.some((t) => ZH_TYPES.has(t))) return "zh";
  // Google's description, last: "Upscale Cantonese restaurant with live seafood".
  if (/korean/i.test(text)) return "ko";
  if (/japanese|sushi|yakiniku|izakaya/i.test(text)) return "ja";
  if (/chinese|cantonese|dim sum|sichuan|szechuan|shanghainese|taiwanese|hong kong|中[餐菜国國]/i.test(text)) return "zh";
  return undefined;
}

/** Cantonese roast meats, and skewers: the two kinds of Chinese place Google calls a barbecue restaurant. */
const ROAST = /[烧燒][腊臘味]|叉[烧燒]|[烧燒][鸭鴨鹅鵝]|roast(ed)? (meat|duck|goose|pork)|bbq (pork|duck)|siu ?(mei|yuk)|char ?siu|bbq (master|house)/i;
const SKEWERS = /串|烤肉|skewer|kebab|kabob|lamb|cumin|\bchuan'?r\b|shao ?kao/i;
/** American barbecue in a description: smoked meats, the South. */
const SMOKED = /southern|texas|memphis|kansas city|carolina|brisket|pulled pork|smoked|smokehouse/i;

/** What one Google type says about a place, or nothing for a type that says little (WEAK). */
interface Typed {
  c: CuisineId;
  also?: CuisineId[];
  sure: boolean;
  vague?: CuisineGuess["vague"];
}

function typed(t: string, ctx: Ctx, types: string[], words: string): Typed | undefined {
  const c = BY_TYPE[t];
  if (!c || WEAK.has(t)) return undefined;
  switch (t) {
    // Barbecue in Vancouver is Korean, Japanese, Chinese (roast meats or skewers) or American.
    case "barbecue_restaurant":
      if (ctx === "ko") return { c: "kbbq", sure: true };
      if (ctx === "ja") return { c: "izakaya", sure: true };
      if (ctx === "zh") {
        if (ROAST.test(words) || types.includes("cantonese_restaurant") || types.includes("dim_sum_restaurant")) return { c: "cantonese", sure: true };
        if (SKEWERS.test(words) || types.includes("hot_pot_restaurant")) return { c: "chinese_bbq", sure: true };
        return { c: "chinese", sure: false, vague: "bbq" };
      }
      if (/korean/i.test(words)) return { c: "kbbq", sure: true };
      if (/japanese|yakiniku/i.test(words)) return { c: "izakaya", sure: true };
      if (/chinese|skewer|shao ?kao/i.test(words) && !SMOKED.test(words)) return { c: "chinese_bbq", sure: true };
      if (SMOKED.test(words) || types.some((x) => x === "american_restaurant" || x === "steak_house" || x === "bar_and_grill")) return { c: "steak", sure: true };
      return { c: "steak", sure: false, vague: "bbq" };
    // A Chinese seafood restaurant is Cantonese (live tanks, dim sum at lunch), and still seafood.
    // A Japanese or Korean one is a sushi bar or the like: not what "seafood" on the menu means.
    case "seafood_restaurant":
      if (ctx === "zh") return { c: "cantonese", also: ["seafood"], sure: true };
      if (ctx === "ja") return { c: "japanese", sure: true };
      if (ctx === "ko") return { c: "korean", sure: true };
      return { c, sure: true };
    // A Japanese steak house is teppanyaki.
    case "steak_house":
      return ctx === "ja" ? { c: "japanese", also: ["steak"], sure: true } : { c, sure: true };
    case "noodle_shop":
      if (ctx === "ja") return { c: "japanese", sure: true };
      if (ctx === "ko") return { c: "korean", sure: true };
      return { c, sure: false, vague: "noodles" };
    case "chicken_restaurant":
    case "chicken_wings_restaurant":
      return ctx === "ko" ? { c: "korean", sure: true } : { c, sure: true };
    default:
      return { c, sure: true };
  }
}

/** Specific, and how: hot pot over the region it comes from, a region over noodles, ramen over Japanese. */
const RANK: Partial<Record<CuisineId, number>> = { chinese: 0, noodles: 1, japanese: 1, korean: 1, hotpot: 3 };

/** Does a cuisine in a place's name say more than Google's main type for it? */
function nameBeats(c: CuisineId, generic: boolean, t: CuisineId): boolean {
  const gn = CUISINES[c].group;
  const gt = CUISINES[t].group;
  // A western word in a name ("Cactus Club Cafe") says less than Google's type.
  if (!gn || gn === "west") return false;
  // A bakery or dessert shop stays one ("台湾甜品"), unless it's a 茶餐厅.
  if (t === "cafe") return c === "hk_cafe";
  // An Asian name beats a western type: 海港酒家, which Google calls a seafood restaurant.
  if (!gt || gt === "west") return true;
  // 酒家, or another kind of Asian (a Chinese 拉面 shop Google calls a noodle place): Google's type.
  if (generic || gn !== gt) return false;
  return (RANK[c] ?? 2) >= (RANK[t] ?? 2);
}

/** Hot pot, seafood, steak and vegetarian are what a place serves, whatever else its name says. */
const ANY_KIND: CuisineId[] = ["hotpot", "seafood", "steak", "vegetarian"];
/** What a type says a place serves, whoever cooks it: an HK café Google calls a breakfast place does breakfast. */
const SERVES: CuisineId[] = [...ANY_KIND, "brunch"];
const isEast = (c: CuisineId) => CUISINES[c].group === "chinese" || CUISINES[c].group === "asian";
/** Kinds of Japanese and Korean a name can add; a second country in a name is mostly a word ("Pho Thai Hoa"). */
const ASIAN_KINDS: CuisineId[] = ["ramen", "izakaya", "kbbq"];
/** What "Japanese" or "Korean" in a ramen shop's or a Korean barbecue's name adds: nothing. */
const PARENT: Partial<Record<CuisineId, CuisineId>> = { ramen: "japanese", izakaya: "japanese", kbbq: "korean" };

/** Does a second cuisine in a name count for the place too ("东北饺子": Northern, and dumplings)? */
function nameAlso(c: CuisineId, main: CuisineId): boolean {
  if (ANY_KIND.includes(c)) return true;
  const g = CUISINES[c].group;
  if (!g || g === "west" || CUISINES[main].group !== g || PARENT[main] === c) return false;
  return g === "chinese" || ASIAN_KINDS.includes(c);
}

function hits(rules: Rule[], s: string): { c: CuisineId; generic: boolean }[] {
  const out: { c: CuisineId; generic: boolean }[] = [];
  if (!s) return out;
  for (const [re, c, g] of rules) if (re.test(s) && !out.some((x) => x.c === c)) out.push({ c, generic: g === "generic" });
  return out;
}

/** What a place is, as far as its name, Google's types and Google's descriptions tell. */
export interface CuisineGuess {
  /** The main one: what its card says first. */
  cuisine: CuisineId;
  /** Other cuisines on round 1's menu it plainly is too: a ramen shop Google also calls Japanese. */
  also: CuisineId[];
  /** False when only a vague type said it ("Chinese restaurant"): a search for one cuisine may say more. */
  sure: boolean;
  /** Its name is in Chinese, or Google calls it a Chinese restaurant of some kind. */
  zh: boolean;
  /** Barbecue, noodles or a café, of which kind nothing says ("The Meat Up BBQ"). */
  vague?: "bbq" | "noodles" | "cafe";
}

/**
 * What a place is: its main Google type if that says enough (or another of its types), unless its
 * name says something more specific (海港酒家 is Cantonese though Google calls it a seafood
 * restaurant; Kintaro Ramen is a ramen shop though Google calls it Japanese); otherwise its name,
 * Google's descriptions, its vaguer types. The rest of what they say goes into `also`.
 */
export function cuisineGuess(name: string, primaryType?: string, types: string[] = [], text = ""): CuisineGuess {
  const all = [...new Set([...(primaryType ? [primaryType] : []), ...types])];
  const ctx = contextOf(name, all, text);
  const words = `${name} ${text}`;
  const named = hits(BY_NAME, name);
  const said = VARIETY.test(text) ? [] : hits(BY_TEXT, text).map((x) => x.c).slice(0, 2);
  const main = primaryType ? typed(primaryType, ctx, all, words) : undefined;
  const others = all.filter((t) => t !== primaryType).flatMap((t) => typed(t, ctx, all, words) ?? []);
  /** The type that says most: the main one, or another when the main one is vague. */
  const best = main?.sure ? main : others.find((o) => o.sure);
  const n = named[0];
  // A Chinese restaurant called "… Cafe" is a 茶餐厅; one called "… Seafood" is Cantonese.
  const zhFood = all.some((t) => t === "chinese_restaurant" || t === "cantonese_restaurant" || t === "dim_sum_restaurant");
  const fromName = (c: CuisineId): CuisineId => (zhFood && c === "cafe" ? "hk_cafe" : zhFood && c === "seafood" ? "cantonese" : c);

  let cuisine: CuisineId;
  let sure = true;
  let vague: CuisineGuess["vague"];
  if (best && !(n && nameBeats(fromName(n.c), n.generic, best.c))) cuisine = best.c;
  else if (n) cuisine = fromName(n.c);
  else if (said.length) cuisine = said[0];
  else if (main) ({ c: cuisine, sure, vague } = main);
  else {
    // Only vague types, or none: "Chinese restaurant", "café", "pub".
    cuisine = all.map((t) => BY_TYPE[t]).find(Boolean) ?? "other";
    sure = false;
  }
  // A bakery or dessert shop, by its type: what its name or description adds is about what it sells.
  const sweets = cuisine === "cafe" && best?.c === "cafe";
  // A café by name or a vague type that Google also calls a restaurant: maybe an HK café.
  if (cuisine === "cafe" && !sweets && all.some((t) => t === "restaurant" || t.endsWith("_restaurant"))) vague = "cafe";

  const also: CuisineId[] = [];
  const add = (c: CuisineId | undefined) => {
    if (c && c !== cuisine && c !== "chinese" && c !== "other" && !also.includes(c)) also.push(c);
  };
  // An Asian place Google also calls American ("Korean Fried Chicken", a chicken restaurant) isn't
  // one for the menu; what a type says it serves (seafood, brunch…) still counts.
  const east = isEast(cuisine);
  const addType = (o: Typed) => {
    if (!(east && !isEast(o.c) && !SERVES.includes(o.c))) add(o.c);
    o.also?.forEach(add);
  };
  if (main?.sure) addType(main);
  for (const o of others) if (o.sure) addType(o);
  for (const h of named) if (!h.generic && nameAlso(h.c, cuisine)) add(h.c);
  if (!sweets) said.forEach(add);
  return { cuisine, also, sure, zh: ctx === "zh", ...(vague ? { vague } : {}) };
}

/** Best guess at a place's main cuisine (see cuisineGuess). */
export const guessCuisine = (name: string, primaryType: string | undefined, types: string[] = [], text = ""): CuisineId => cuisineGuess(name, primaryType, types, text).cuisine;

/** A search for one cuisine that finds a place of another often finds both: skewers at a Xinjiang place. */
const FOUND_TOO: Partial<Record<CuisineId, CuisineId[]>> = { chinese_bbq: ["northern"], northern: ["chinese_bbq"] };
/** What a search for a cuisine can make of a place only a vague type named. */
const VAGUE_FOR: Record<NonNullable<CuisineGuess["vague"]>, CuisineId[]> = {
  bbq: ["chinese_bbq"],
  noodles: ["northern", "sichuan", "shanghai", "taiwanese"],
  cafe: ["hk_cafe"],
};

/**
 * A Text Search for cuisine `c` ("Sichuan restaurant") found this place: when nothing said what it
 * is (a "Chinese restaurant" called "Chef Tony", a barbecue place with an English name), it's that
 * cuisine. Whatever search found it first, the same answer.
 */
export function foundBy(g: CuisineGuess, c: CuisineId): CuisineGuess {
  if (g.cuisine === c || g.also.includes(c)) return g;
  const vague = g.vague && VAGUE_FOR[g.vague].includes(c);
  // A café only its vague type named stays one (a bubble tea shop isn't an HK café): see `vague`.
  if (vague || (!g.sure && g.cuisine !== "cafe" && (g.zh || g.cuisine === "other"))) {
    // A noodle shop is still one; "Chinese restaurant" and an unsure barbecue said nothing.
    const keep: CuisineId[] = g.vague === "noodles" ? ["noodles"] : [];
    return { cuisine: c, also: [...keep, ...g.also.filter((x) => x !== c && !keep.includes(x))], sure: true, zh: g.zh };
  }
  if (FOUND_TOO[c]?.includes(g.cuisine)) return { ...g, also: [...g.also, c] };
  return g;
}
