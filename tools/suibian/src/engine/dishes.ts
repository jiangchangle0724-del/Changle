// What a place mainly serves, for the card's short intro ("主打：牛肉面、小笼包"). Only what its name
// or its Google type says: a place called 台北牛肉面 does beef noodles, a ramen_restaurant does ramen.
// Nothing is guessed for places whose name and type say nothing more than the cuisine.
import type { CuisineId, Text } from "./types";

export const DISHES: Record<string, Text> = {
  beef_noodle: { zh: "牛肉面", en: "beef noodle soup" },
  lanzhou: { zh: "兰州拉面", en: "Lanzhou hand-pulled noodles" },
  daoxiao: { zh: "刀削面", en: "knife-cut noodles" },
  xlb: { zh: "小笼包", en: "xiao long bao" },
  shengjian: { zh: "生煎包", en: "pan-fried buns" },
  roast_duck: { zh: "烤鸭", en: "roast duck" },
  siu_mei: { zh: "烧腊", en: "Cantonese roast meats" },
  malatang: { zh: "麻辣烫", en: "malatang" },
  dry_pot: { zh: "麻辣香锅", en: "mala dry pot" },
  chuanchuan: { zh: "串串", en: "chuan chuan skewers" },
  maocai: { zh: "冒菜", en: "maocai" },
  pickled_fish: { zh: "酸菜鱼", en: "pickled cabbage fish" },
  grilled_fish: { zh: "烤鱼", en: "grilled fish" },
  crawfish: { zh: "小龙虾", en: "crawfish" },
  mixian: { zh: "米线", en: "rice noodles" },
  luosifen: { zh: "螺蛳粉", en: "luosifen" },
  suanlafen: { zh: "酸辣粉", en: "hot and sour noodles" },
  liangpi: { zh: "凉皮", en: "liangpi" },
  roujiamo: { zh: "肉夹馍", en: "roujiamo" },
  jianbing: { zh: "煎饼", en: "jianbing" },
  baozi: { zh: "包子", en: "steamed buns" },
  congee: { zh: "粥", en: "congee" },
  claypot: { zh: "煲仔饭", en: "claypot rice" },
  wonton: { zh: "云吞", en: "wontons" },
  dumplings: { zh: "饺子", en: "dumplings" },
  skewers: { zh: "烤串", en: "skewers" },
  lamb: { zh: "羊肉", en: "lamb" },
  braised_pork_rice: { zh: "卤肉饭", en: "braised pork rice" },
  popcorn_chicken: { zh: "盐酥鸡", en: "popcorn chicken" },
  pineapple_bun: { zh: "菠萝包", en: "pineapple buns" },
  chicken_rice: { zh: "海南鸡饭", en: "Hainanese chicken rice" },
  laksa: { zh: "叻沙", en: "laksa" },
  nasi_lemak: { zh: "椰浆饭", en: "nasi lemak" },
  pho: { zh: "越南河粉", en: "pho" },
  banh_mi: { zh: "越南法包", en: "banh mi" },
  pad_thai: { zh: "泰式炒河粉", en: "pad thai" },
  tom_yum: { zh: "冬阴功", en: "tom yum" },
  biryani: { zh: "印度香饭", en: "biryani" },
  curry: { zh: "咖喱", en: "curry" },
  shawarma: { zh: "沙威玛", en: "shawarma" },
  kebab: { zh: "烤肉串", en: "kebabs" },
  falafel: { zh: "炸鹰嘴豆丸", en: "falafel" },
  ramen: { zh: "拉面", en: "ramen" },
  lamian: { zh: "拉面", en: "hand-pulled noodles" },
  udon: { zh: "乌冬", en: "udon" },
  soba: { zh: "荞麦面", en: "soba" },
  sushi: { zh: "寿司", en: "sushi" },
  omakase: { zh: "主厨套餐", en: "omakase" },
  izakaya: { zh: "居酒屋小菜", en: "izakaya plates" },
  yakitori: { zh: "日式串烧", en: "yakitori" },
  yakiniku: { zh: "日式烤肉", en: "yakiniku" },
  tonkatsu: { zh: "炸猪排", en: "tonkatsu" },
  jp_curry: { zh: "日式咖喱", en: "Japanese curry" },
  teppanyaki: { zh: "铁板烧", en: "teppanyaki" },
  tempura: { zh: "天妇罗", en: "tempura" },
  poke: { zh: "夏威夷拌饭", en: "poke" },
  bibimbap: { zh: "韩式拌饭", en: "bibimbap" },
  tteokbokki: { zh: "炒年糕", en: "tteokbokki" },
  kbbq: { zh: "韩式烤肉", en: "Korean barbecue" },
  hot_pot: { zh: "火锅", en: "hot pot" },
  dim_sum: { zh: "点心", en: "dim sum" },
  noodles: { zh: "面", en: "noodles" },
  pizza: { zh: "披萨", en: "pizza" },
  pasta: { zh: "意面", en: "pasta" },
  burgers: { zh: "汉堡", en: "burgers" },
  steak: { zh: "牛排", en: "steak" },
  tacos: { zh: "塔可", en: "tacos" },
  fried_chicken: { zh: "炸鸡", en: "fried chicken" },
  oysters: { zh: "生蚝", en: "oysters" },
  crab: { zh: "螃蟹", en: "crab" },
  lobster: { zh: "龙虾", en: "lobster" },
  seafood: { zh: "海鲜", en: "seafood" },
  fish_chips: { zh: "炸鱼薯条", en: "fish and chips" },
  poutine: { zh: "肉汁薯条", en: "poutine" },
  bagels: { zh: "贝果", en: "bagels" },
  pancakes: { zh: "松饼", en: "pancakes" },
  brunch: { zh: "早午餐", en: "brunch" },
  breakfast: { zh: "早餐", en: "breakfast" },
  tapas: { zh: "西班牙小吃", en: "tapas" },
  buffet: { zh: "自助餐", en: "buffet" },
  bbq: { zh: "烧烤", en: "barbecue" },
  vegan: { zh: "纯素", en: "vegan food" },
  dessert: { zh: "甜品", en: "desserts" },
  sandwiches: { zh: "三明治", en: "sandwiches" },
};

// The name first, most specific first. No lookbehind in these: older iPhones can't read it, and one
// such pattern would stop the whole page from loading.
const BY_NAME: [RegExp, string][] = [
  [/牛肉[面麵]|beef noodle/i, "beef_noodle"],
  [/[兰蘭]州|lanzhou/i, "lanzhou"],
  [/刀削/, "daoxiao"],
  [/小[笼籠]|xiao ?long ?bao|\bxlb\b/i, "xlb"],
  [/生煎/, "shengjian"],
  [/烤[鸭鴨]|peking duck|roast duck/i, "roast_duck"],
  [/[烧燒][腊臘味]|siu ?mei/i, "siu_mei"],
  [/麻辣[烫燙]|mala ?tang/i, "malatang"],
  [/香[锅鍋]|dry ?pot/i, "dry_pot"],
  [/串串/, "chuanchuan"],
  [/冒菜/, "maocai"],
  [/酸菜[鱼魚]/, "pickled_fish"],
  [/烤[鱼魚]|grilled fish/i, "grilled_fish"],
  [/小[龙龍][虾蝦]|crawfish|crayfish/i, "crawfish"],
  [/米[线線]|mixian/i, "mixian"],
  [/螺[蛳螄]粉/, "luosifen"],
  [/酸辣粉/, "suanlafen"],
  [/[凉涼]皮/, "liangpi"],
  [/肉[夹夾][馍饃]/, "roujiamo"],
  [/煎[饼餅]|jianbing/i, "jianbing"],
  [/包子|baozi/i, "baozi"],
  [/粥|congee/i, "congee"],
  [/煲仔/, "claypot"],
  [/[云雲]吞|[馄餛][饨飩]|wonton|wanton/i, "wonton"],
  [/[饺餃]子|水[饺餃]|dumpling/i, "dumplings"],
  [/烤串|肉串|skewer/i, "skewers"],
  [/羊[肉蝎]|lamb/i, "lamb"],
  [/[卤滷魯]肉[饭飯]/, "braised_pork_rice"],
  [/[盐鹽]酥[鸡雞]|popcorn chicken/i, "popcorn_chicken"],
  [/菠[萝蘿]包/, "pineapple_bun"],
  [/海南[鸡雞]|chicken rice/i, "chicken_rice"],
  [/叻沙|laksa/i, "laksa"],
  [/椰[浆漿][饭飯]|nasi lemak/i, "nasi_lemak"],
  [/\bpho\b|phở|河粉/i, "pho"],
  [/banh ?mi|bánh mì/i, "banh_mi"],
  [/pad ?thai/i, "pad_thai"],
  [/tom ?yum|冬[阴陰]功/i, "tom_yum"],
  [/biryani/i, "biryani"],
  [/shawarma|沙威玛/i, "shawarma"],
  [/kebab|kabob|kebap/i, "kebab"],
  [/falafel/i, "falafel"],
  [/ramen|ラーメン/i, "ramen"],
  [/拉[面麵]/, "lamian"],
  [/udon|[乌烏]冬|うどん/i, "udon"],
  [/\bsoba\b|[荞蕎]麦[面麵]|蕎麥麵/i, "soba"],
  [/sushi|[寿壽]司|鮨/i, "sushi"],
  [/omakase/i, "omakase"],
  [/izakaya|居酒屋/i, "izakaya"],
  [/yakitori|焼鳥|[烧燒][鸟鳥]/i, "yakitori"],
  [/yakiniku|焼肉/i, "yakiniku"],
  [/katsu|炸猪排|豚カツ/i, "tonkatsu"],
  [/teppanyaki|[铁鐵]板[烧燒]/i, "teppanyaki"],
  [/tempura|天[妇婦]羅|天妇罗/i, "tempura"],
  [/\bpoke\b|poké/i, "poke"],
  [/bibimbap|石[锅鍋]拌[饭飯]/i, "bibimbap"],
  [/tteok|炒年糕/i, "tteokbokki"],
  [/korean (bbq|barbecue)|[韩韓](式|国|國)?烤肉|\bgogi\b/i, "kbbq"],
  [/hot ?pot|火[锅鍋]|shabu/i, "hot_pot"],
  [/dim ?sum|[点點]心|茶[楼樓]|yum ?cha/i, "dim_sum"],
  [/curry|咖喱|カレー/i, "curry"],
  [/pizz|披萨|比萨/i, "pizza"],
  [/pasta|spaghetti|意[面粉]/i, "pasta"],
  [/burger|[汉漢]堡/i, "burgers"],
  [/steak|牛排/i, "steak"],
  [/taco|taquer/i, "tacos"],
  [/fried chicken|[炸][鸡雞]|chicken wing|\bwings\b/i, "fried_chicken"],
  [/oyster|生[蚝蠔]/i, "oysters"],
  [/crab|螃蟹/i, "crab"],
  [/lobster|[龙龍][虾蝦]/i, "lobster"],
  [/seafood|海[鲜鮮]/i, "seafood"],
  [/fish (and|&|n'?) ?chips|炸[鱼魚]薯条/i, "fish_chips"],
  [/poutine/i, "poutine"],
  [/bagel/i, "bagels"],
  [/pancake|松[饼餅]/i, "pancakes"],
  [/brunch/i, "brunch"],
  [/breakfast|早餐/i, "breakfast"],
  [/tapas/i, "tapas"],
  [/buffet|自助/i, "buffet"],
  [/noodle|[面麵]馆|[面麵]館|[面麵]家/i, "noodles"],
  [/\bbbq\b|barbecue|[烧燒]烤|smokehouse/i, "bbq"],
  [/vegan|[纯純]素/i, "vegan"],
  [/dessert|甜品|糖水/i, "dessert"],
];

/**
 * Google's place types that say what a place serves (not just its cuisine). Not the ones for a kind of
 * meal (brunch, buffet, dessert, vegan): Google gives those to an Italian place that does brunch on
 * Sundays, and "mainly brunch" would be wrong there.
 */
const BY_TYPE: Record<string, string> = {
  dim_sum_restaurant: "dim_sum",
  hot_pot_restaurant: "hot_pot",
  dumpling_restaurant: "dumplings",
  chinese_noodle_restaurant: "noodles",
  noodle_shop: "noodles",
  ramen_restaurant: "ramen",
  sushi_restaurant: "sushi",
  japanese_izakaya_restaurant: "izakaya",
  japanese_curry_restaurant: "jp_curry",
  tonkatsu_restaurant: "tonkatsu",
  yakiniku_restaurant: "yakiniku",
  yakitori_restaurant: "yakitori",
  korean_barbecue_restaurant: "kbbq",
  pizza_restaurant: "pizza",
  hamburger_restaurant: "burgers",
  steak_house: "steak",
  taco_restaurant: "tacos",
  chicken_restaurant: "fried_chicken",
  chicken_wings_restaurant: "fried_chicken",
  seafood_restaurant: "seafood",
  fish_and_chips_restaurant: "fish_chips",
  barbecue_restaurant: "bbq",
  shawarma_restaurant: "shawarma",
};

/** A more specific dish makes the general one say nothing more: 兰州拉面 isn't Japanese ramen. */
const COVERS: Record<string, string[]> = {
  noodles: ["beef_noodle", "lanzhou", "daoxiao", "lamian", "mixian", "luosifen", "suanlafen", "pho", "ramen", "udon", "soba", "pad_thai", "laksa"],
  lamian: ["lanzhou", "daoxiao"],
  lobster: ["crawfish"],
  seafood: ["oysters", "crab", "lobster", "crawfish"],
  bbq: ["kbbq", "siu_mei", "yakiniku", "skewers"],
  curry: ["jp_curry"],
  kbbq: ["yakiniku"],
  fried_chicken: ["popcorn_chicken"],
  breakfast: ["brunch"],
};

/** At most this many on a card. */
export const MAX_DISHES = 3;

/** The same words mean different dishes in different kitchens: "BBQ" at a Korean place, 拉面 at a Japanese one. */
function inKitchen(d: string, cuisine?: CuisineId): string {
  if (d === "bbq" && (cuisine === "korean" || cuisine === "kbbq")) return "kbbq";
  if (d === "bbq" && (cuisine === "japanese" || cuisine === "izakaya")) return "yakiniku";
  if (d === "bbq" && cuisine === "chinese_bbq") return "skewers";
  if (d === "bbq" && (cuisine === "cantonese" || cuisine === "hk_cafe")) return "siu_mei";
  // A Chinese barbecue place nothing more is known about: roast meats or skewers, so neither.
  if (d === "bbq" && cuisine === "chinese") return "";
  if (d === "lamian" && (cuisine === "ramen" || cuisine === "japanese" || cuisine === "izakaya")) return "ramen";
  return d;
}

/** What the place's name and Google types say it serves, most specific first, at most MAX_DISHES. */
export function dishesFor(name: string, types: readonly string[] = [], cuisine?: CuisineId): string[] {
  const found: string[] = [];
  const add = (d: string) => {
    const x = inKitchen(d, cuisine);
    if (x && !found.includes(x)) found.push(x);
  };
  for (const [re, d] of BY_NAME) if (re.test(name)) add(d);
  for (const t of types) if (BY_TYPE[t]) add(BY_TYPE[t]);
  return found.filter((d) => !(COVERS[d] ?? []).some((x) => found.includes(x))).slice(0, MAX_DISHES);
}
