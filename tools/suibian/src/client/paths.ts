// Round 1's two ways into the menu (Steve, 2026-11-19): by cuisine (Chinese, Japanese, Italian…)
// or by what you feel like eating (BBQ, hot pot, noodles, seafood…). Each way is a row of big
// groups; a group can be liked or refused whole, or opened to pick inside it. Both ways lead to the
// same menu items (CUISINES), so what's picked one way shows the other way too, and the server
// still only hears which menu items each person likes or refuses.
import { CUISINES, type CuisineId, type MoodPick, type Text } from "../engine";

export type PathId = "cuisine" | "dish";

/** One menu item inside a group, with its own words there when the group asks for them. */
export interface Leaf {
  id: CuisineId;
  /** Its name inside this group ("日式拉面" under noodles); the menu's own name when missing. */
  text?: Text;
}

export interface Group {
  id: string;
  text: Text;
  emoji: string;
  leaves: Leaf[];
}

const leaf = (id: CuisineId, zh?: string, en?: string): Leaf => (zh && en ? { id, text: { zh, en } } : { id });
const group = (id: string, zh: string, en: string, emoji: string, leaves: Leaf[]): Group => ({ id, text: { zh, en }, emoji, leaves });
/** A group of one: on the screen it's just that menu item. */
const one = (id: CuisineId): Group => group(id, CUISINES[id].zh, CUISINES[id].en, CUISINES[id].emoji, [leaf(id)]);

export const PATHS: Record<PathId, Group[]> = {
  // Every menu item is in here once (tests/paths.test.ts checks).
  cuisine: [
    group("chinese", "中餐", "Chinese", "🥢", [
      leaf("cantonese"),
      leaf("hk_cafe"),
      leaf("sichuan"),
      leaf("hotpot"),
      leaf("taiwanese"),
      leaf("shanghai"),
      leaf("northern"),
      leaf("noodles"),
      leaf("chinese_bbq"),
      leaf("chinese"),
    ]),
    group("japanese", "日料", "Japanese", "🍣", [leaf("japanese"), leaf("ramen"), leaf("izakaya")]),
    group("korean", "韩餐", "Korean", "🥘", [leaf("korean"), leaf("kbbq")]),
    group("southeast", "东南亚", "Southeast Asian", "🍤", [leaf("thai"), leaf("vietnamese"), leaf("sea"), leaf("filipino")]),
    one("indian"),
    group("mideast", "中东 · 地中海", "Middle East · Mediterranean", "🥙", [leaf("middle_eastern"), leaf("mediterranean")]),
    one("italian"),
    one("french"),
    one("mexican"),
    group("american", "美式", "American", "🍔", [leaf("western"), leaf("steak")]),
    group("any", "不分菜系", "Any cuisine", "🍽️", [leaf("seafood"), leaf("vegetarian"), leaf("brunch"), leaf("cafe"), leaf("ayce")]),
  ],
  // What people feel like eating; inside, where it's from. Not every menu item needs a way in here.
  dish: [
    group("bbq", "烧烤 · 烤肉", "BBQ · grill", "🔥", [
      leaf("kbbq", "韩式烤肉", "Korean BBQ"),
      leaf("chinese_bbq", "中式烧烤 · 串串", "Chinese skewers"),
      leaf("izakaya", "日式烧肉 · 烤串", "Japanese yakiniku · yakitori"),
      leaf("steak", "美式烧烤 · 牛排", "American BBQ · steak"),
    ]),
    one("hotpot"),
    group("noodles", "面", "Noodles", "🍜", [
      leaf("ramen", "日式拉面", "Japanese ramen"),
      leaf("noodles", "中式面馆 · 饺子", "Chinese noodles · dumplings"),
      leaf("vietnamese", "越南河粉", "Vietnamese pho"),
      leaf("italian", "意大利面", "Italian pasta"),
    ]),
    group("seafood", "海鲜", "Seafood", "🦞", [
      leaf("seafood", "西式海鲜 · 生蚝", "Seafood · oysters"),
      leaf("cantonese", "粤式海鲜酒家", "Cantonese seafood"),
      leaf("japanese", "日式寿司 · 刺身", "Sushi · sashimi"),
    ]),
    one("steak"),
    group("stirfry", "炒菜 · 家常菜", "Stir-fry · home-style", "🥘", [
      leaf("sichuan"),
      leaf("cantonese", "粤菜", "Cantonese"),
      leaf("shanghai"),
      leaf("northern"),
      leaf("taiwanese"),
      leaf("chinese"),
      leaf("thai", "泰式", "Thai"),
      leaf("korean", "韩式", "Korean"),
    ]),
    group("curry", "咖喱", "Curry", "🍛", [
      leaf("indian", "印度咖喱", "Indian curry"),
      leaf("thai", "泰式咖喱", "Thai curry"),
      leaf("sea", "马来 · 新加坡", "Malaysian · Singaporean"),
    ]),
    group("dimsum", "点心 · 饺子", "Dim sum · dumplings", "🥟", [
      leaf("cantonese", "粤式点心", "Dim sum"),
      leaf("noodles", "饺子 · 面馆", "Dumplings"),
      leaf("shanghai", "小笼包 · 江浙", "Soup dumplings"),
      leaf("hk_cafe"),
    ]),
    group("burgers", "汉堡 · 披萨", "Burgers · pizza", "🍔", [leaf("western", "汉堡 · 美式", "Burgers"), leaf("italian", "披萨", "Pizza")]),
    group("wraps", "卷饼 · 烤肉串", "Tacos · kebabs", "🌯", [
      leaf("mexican", "塔可 · 墨西哥", "Tacos · Mexican"),
      leaf("middle_eastern", "沙威玛 · 中东", "Shawarma · Middle Eastern"),
      leaf("mediterranean", "希腊 · 地中海", "Greek · Mediterranean"),
    ]),
    group("brunch", "早午餐 · 咖啡", "Brunch · café", "🥞", [leaf("brunch"), leaf("cafe"), leaf("hk_cafe")]),
    one("vegetarian"),
    one("ayce"),
  ],
};

export const leafText = (l: Leaf): Text => l.text ?? CUISINES[l.id];

export type Picks = Partial<Record<CuisineId, MoodPick>>;

/** How a group stands: all liked, all refused, nothing yet, or a mix (with how many of each). */
export function groupState(g: Group, picks: Picks): { state: "none" | "like" | "ban" | "some"; likes: number; bans: number } {
  const likes = g.leaves.filter((l) => picks[l.id] === "like").length;
  const bans = g.leaves.filter((l) => picks[l.id] === "ban").length;
  const n = g.leaves.length;
  const state = likes === n ? "like" : bans === n ? "ban" : likes + bans === 0 ? "none" : "some";
  return { state, likes, bans };
}

/** Everything in a group set to one answer at once ("none" takes the answer away). */
export function setAll(picks: Picks, ids: readonly CuisineId[], to: MoodPick | "none"): Picks {
  const next = { ...picks };
  for (const id of ids) {
    if (to === "none") delete next[id];
    else next[id] = to;
  }
  return next;
}
