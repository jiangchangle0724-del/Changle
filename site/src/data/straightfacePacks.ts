/**
 * 一本正经 · In All Seriousness: the packs (their names, the table each is made for), without the
 * cards. The screens that only show which packs are on (the online phones, the big screen) import
 * this file, so the 400-odd definitions stay with the one-phone game and the rooms server.
 */
export const PACKS = [
  "zi", "fangyan", "chengyu", "caiming", "xiehouyu", "zhongyao", "diming", "laowujian", "wangluo", "yueyu", "hangdang",
  "trivia", "vancouver", "food", "animals",
  "oddwords", "idioms", "phobias", "placenames", "slang", "oldjobs",
] as const;
export type Pack = (typeof PACKS)[number];
export const PACK_NAMES: Record<Pack, { zh: string; en: string }> = {
  zi: { zh: "生僻字", en: "Rare characters" },
  fangyan: { zh: "方言", en: "Dialects" },
  chengyu: { zh: "成语典故", en: "Chinese idioms" },
  caiming: { zh: "菜名来历", en: "Dish names" },
  xiehouyu: { zh: "歇后语", en: "Two-part sayings" },
  zhongyao: { zh: "中药名", en: "Herb names" },
  diming: { zh: "地名由来", en: "Chinese place names" },
  laowujian: { zh: "老物件", en: "Old things" },
  wangluo: { zh: "网络热词", en: "Chinese net slang" },
  yueyu: { zh: "粤语俚语", en: "Cantonese slang" },
  hangdang: { zh: "老行当", en: "Old trades" },
  trivia: { zh: "冷知识", en: "Trivia" },
  vancouver: { zh: "温村", en: "Vancouver" },
  food: { zh: "吃喝", en: "Food & drink" },
  animals: { zh: "动物冷知识", en: "Odd animals" },
  oddwords: { zh: "冷僻英文词", en: "Odd words" },
  idioms: { zh: "英文俗语", en: "Idiom origins" },
  phobias: { zh: "恐惧症", en: "Phobias" },
  placenames: { zh: "加拿大怪地名", en: "Canadian place names" },
  slang: { zh: "英文网络词", en: "Online slang" },
  oldjobs: { zh: "冷门旧职业", en: "Old jobs" },
};
/**
 * Who a pack is made for. A Chinese pack's words are Chinese originals (term.en is the same characters
 * plus the reading); an English pack's are English words (term.zh is the English word itself); "both"
 * packs work at any table. The setup picks the table's language's packs plus "both" to start with.
 */
export type Audience = "zh" | "en" | "both";
export const PACK_AUDIENCE: Record<Pack, Audience> = {
  zi: "zh", fangyan: "zh", chengyu: "zh", caiming: "zh", xiehouyu: "zh", zhongyao: "zh", diming: "zh", laowujian: "zh", wangluo: "zh", yueyu: "zh", hangdang: "zh",
  trivia: "both", vancouver: "both", food: "both", animals: "both",
  oddwords: "en", idioms: "en", phobias: "en", placenames: "en", slang: "en", oldjobs: "en",
};
/** The packs a table in this language starts with. */
export function defaultPacks(lang: "zh" | "en"): Pack[] {
  return PACKS.filter((p) => PACK_AUDIENCE[p] === lang || PACK_AUDIENCE[p] === "both");
}
