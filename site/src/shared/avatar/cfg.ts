// A changle face: a chibi anime character (about two and a half heads tall) made from a handful of
// choices. The same choices draw the face everywhere (render.ts): in the maker, on a profile, and as
// the round avatar the server keeps (worker/hub.ts renders it once when it's saved). Every choice is
// an id from the lists below or a small number, so a saved face is a few hundred bytes of JSON and
// nothing in it is drawn as text.

export type Opt<T extends string = string> = { id: T; zh: string; en: string };

export const FACES = [
  { id: "oval", zh: "鹅蛋脸", en: "Oval" },
  { id: "round", zh: "圆脸", en: "Round" },
  { id: "heart", zh: "瓜子脸", en: "Heart" },
  { id: "square", zh: "方脸", en: "Square" },
  { id: "long", zh: "长脸", en: "Long" },
] as const satisfies readonly Opt[];

export const EYES = [
  { id: "round", zh: "圆眼", en: "Round" },
  { id: "almond", zh: "杏眼", en: "Almond" },
  { id: "droopy", zh: "下垂眼", en: "Gentle" },
  { id: "sharp", zh: "上挑眼", en: "Upturned" },
  { id: "narrow", zh: "细长眼", en: "Narrow" },
  { id: "sleepy", zh: "睡眼", en: "Sleepy" },
] as const satisfies readonly Opt[];

export const BROWS = [
  { id: "soft", zh: "柔眉", en: "Soft" },
  { id: "straight", zh: "平眉", en: "Straight" },
  { id: "arched", zh: "挑眉", en: "Arched" },
  { id: "bold", zh: "剑眉", en: "Bold" },
] as const satisfies readonly Opt[];

export const MOUTHS = [
  { id: "smile", zh: "微笑", en: "Smile" },
  { id: "grin", zh: "大笑", en: "Grin" },
  { id: "cat", zh: "猫猫嘴", en: "Cat" },
  { id: "calm", zh: "淡定", en: "Calm" },
  { id: "wink", zh: "眨眼", en: "Wink" },
  { id: "shy", zh: "害羞", en: "Shy" },
] as const satisfies readonly Opt[];

/** How long the hair is, and its shape behind the face. */
export const HAIRS = [
  { id: "buzz", zh: "寸头", en: "Buzz" },
  { id: "short", zh: "短发", en: "Short" },
  { id: "curly", zh: "短卷发", en: "Curly" },
  { id: "afro", zh: "爆炸头", en: "Afro" },
  { id: "wolf", zh: "狼尾", en: "Wolf cut" },
  { id: "bob", zh: "波波头", en: "Bob" },
  { id: "long", zh: "长直发", en: "Long" },
  { id: "wavy", zh: "长卷发", en: "Wavy" },
  { id: "pony", zh: "高马尾", en: "Ponytail" },
  { id: "twin", zh: "双马尾", en: "Twin tails" },
  { id: "bun", zh: "丸子头", en: "Bun" },
  { id: "braids", zh: "麻花辫", en: "Braids" },
  { id: "bald", zh: "光头", en: "Bald" },
] as const satisfies readonly Opt[];

/** What the hair does over the forehead. */
export const FRINGES = [
  { id: "full", zh: "齐刘海", en: "Full bangs" },
  { id: "swept", zh: "斜刘海", en: "Swept bangs" },
  { id: "wisps", zh: "空气刘海", en: "Wispy bangs" },
  { id: "middle", zh: "中分", en: "Middle part" },
  { id: "side", zh: "侧分", en: "Side part" },
  { id: "spiky", zh: "碎发", en: "Spiky" },
  { id: "back", zh: "背头", en: "Slicked back" },
] as const satisfies readonly Opt[];

export const BEARDS = [
  { id: "none", zh: "无", en: "None" },
  { id: "stubble", zh: "胡茬", en: "Stubble" },
  { id: "mustache", zh: "八字胡", en: "Mustache" },
  { id: "goatee", zh: "山羊胡", en: "Goatee" },
  { id: "full", zh: "络腮胡", en: "Full beard" },
] as const satisfies readonly Opt[];

export const OUTFITS = [
  // 潮流 / everyday
  { id: "hoodie", zh: "卫衣", en: "Hoodie", kind: "trend" },
  { id: "tee", zh: "宽松T恤", en: "Oversized tee", kind: "trend" },
  { id: "bomber", zh: "飞行员夹克", en: "Bomber", kind: "trend" },
  { id: "denim", zh: "牛仔外套", en: "Denim jacket", kind: "trend" },
  { id: "suit", zh: "西装", en: "Suit", kind: "trend" },
  { id: "sweater", zh: "毛衣配裙", en: "Sweater & skirt", kind: "trend" },
  { id: "dress", zh: "连衣裙", en: "Dress", kind: "trend" },
  { id: "track", zh: "运动套装", en: "Tracksuit", kind: "trend" },
  { id: "puffer", zh: "羽绒服", en: "Puffer", kind: "trend" },
  { id: "overalls", zh: "背带裤", en: "Overalls", kind: "trend" },
  // 民族和传统服饰 / from around the world
  { id: "qipao", zh: "旗袍", en: "Qipao", kind: "culture" },
  { id: "tang", zh: "唐装", en: "Tang jacket", kind: "culture" },
  { id: "hanfu", zh: "汉服", en: "Hanfu", kind: "culture" },
  { id: "hanbok", zh: "韩服", en: "Hanbok", kind: "culture" },
  { id: "kimono", zh: "和服", en: "Kimono", kind: "culture" },
  { id: "aodai", zh: "奥黛", en: "Áo dài", kind: "culture" },
  { id: "sari", zh: "纱丽", en: "Sari", kind: "culture" },
  { id: "kurta", zh: "库尔塔", en: "Kurta", kind: "culture" },
  { id: "ankara", zh: "非洲印花", en: "Ankara print", kind: "culture" },
  { id: "kilt", zh: "苏格兰裙", en: "Kilt", kind: "culture" },
] as const satisfies readonly (Opt & { kind: "trend" | "culture" })[];

export const HATS = [
  { id: "none", zh: "不戴", en: "None" },
  { id: "cap", zh: "棒球帽", en: "Cap" },
  { id: "beanie", zh: "毛线帽", en: "Beanie" },
  { id: "bucket", zh: "渔夫帽", en: "Bucket hat" },
  { id: "beret", zh: "贝雷帽", en: "Beret" },
  { id: "straw", zh: "草帽", en: "Straw hat" },
  { id: "cowboy", zh: "牛仔帽", en: "Cowboy hat" },
  { id: "ears", zh: "猫耳发箍", en: "Cat ears" },
  { id: "flowers", zh: "花环", en: "Flower crown" },
  { id: "hijab", zh: "头巾", en: "Hijab" },
  { id: "turban", zh: "包头巾", en: "Turban" },
] as const satisfies readonly Opt[];

export const GLASSES = [
  { id: "none", zh: "不戴", en: "None" },
  { id: "round", zh: "圆框", en: "Round" },
  { id: "square", zh: "方框", en: "Square" },
  { id: "bold", zh: "黑框", en: "Bold" },
  { id: "cateye", zh: "猫眼框", en: "Cat-eye" },
  { id: "sun", zh: "墨镜", en: "Sunglasses" },
] as const satisfies readonly Opt[];

export const EARRINGS = [
  { id: "none", zh: "不戴", en: "None" },
  { id: "stud", zh: "耳钉", en: "Studs" },
  { id: "hoop", zh: "耳圈", en: "Hoops" },
  { id: "drop", zh: "耳坠", en: "Drops" },
] as const satisfies readonly Opt[];

export const HEIGHTS = [
  { id: "short", zh: "矮", en: "Short" },
  { id: "mid", zh: "中等", en: "Medium" },
  { id: "tall", zh: "高", en: "Tall" },
] as const satisfies readonly Opt[];

export const BUILDS = [
  { id: "slim", zh: "瘦", en: "Slim" },
  { id: "mid", zh: "匀称", en: "Medium" },
  { id: "round", zh: "胖", en: "Round" },
] as const satisfies readonly Opt[];

/** Where a look starts from: the profile's own gender (the choices stay open to everyone). */
export const STARTS = [
  { id: "f", zh: "女", en: "Woman" },
  { id: "m", zh: "男", en: "Man" },
  { id: "x", zh: "中性", en: "Androgynous" },
] as const satisfies readonly Opt[];

/** Skin, from light to deep: [skin, shadow, line]. */
export const SKINS: readonly [string, string, string][] = [
  ["#fde8dc", "#f2c9b8", "#b77563"],
  ["#f9dac6", "#ecbca3", "#ad6d55"],
  ["#f2cba8", "#e2ad86", "#a5643f"],
  ["#e7b68c", "#d4986c", "#9a5a34"],
  ["#d49f70", "#bd8357", "#86502c"],
  ["#bf8659", "#a56c43", "#704024"],
  ["#a06b45", "#865533", "#5a321b"],
  ["#815034", "#6a3f27", "#4a2615"],
  ["#633b26", "#512f1e", "#371c0f"],
  ["#4a2b1c", "#3b2216", "#26130a"],
];

/** Hair, natural then dyed: [hair, shadow, shine, line]. */
export const HAIR_COLORS: readonly [string, string, string, string][] = [
  ["#2a2530", "#1a1620", "#5a5468", "#100d14"],
  ["#43302a", "#2f211c", "#7a5a4c", "#1d1310"],
  ["#6e4a34", "#563726", "#a5785a", "#351f13"],
  ["#93582f", "#764424", "#c8895a", "#47260f"],
  ["#a8442e", "#863324", "#de7a5c", "#561e13"],
  ["#d9a75e", "#bd8a44", "#f3d295", "#7e5523"],
  ["#eee0bd", "#d7c49c", "#fffaf0", "#9b8762"],
  ["#a2a1ab", "#83828d", "#d2d1d8", "#4c4b55"],
  ["#eceaf2", "#cfccd9", "#ffffff", "#8a8698"],
  ["#ff8fbd", "#e66a9f", "#ffc4dc", "#9c3a66"],
  ["#a68cff", "#8669e8", "#d0c4ff", "#4e3a9e"],
  ["#5aa7ff", "#3d86e0", "#a6d0ff", "#1f4d8c"],
  ["#5fdcb0", "#3dbb90", "#a8f0d6", "#1f7a5a"],
];

export const EYE_COLORS: readonly string[] = ["#3b2219", "#6b3c20", "#8a6a2c", "#b67a25", "#3f8752", "#3a71c6", "#6e7f94", "#8a5fd6"];

/** Clothes: a garment's own color; its shade and seams are worked out from it. */
export const CLOTH: readonly string[] = [
  "#f4f1ea",
  "#2a2733",
  "#2d3b66",
  "#4d6f9f",
  "#d6404d",
  "#ff7a63",
  "#ff9446",
  "#e8b43c",
  "#7d8c4a",
  "#3ea36b",
  "#29a39a",
  "#6cb6ff",
  "#a99cf2",
  "#ff9cc5",
  "#8f2f47",
  "#d9c7a5",
  "#8b5a3c",
  "#9b98a8",
];

export interface AvatarCfg {
  v: 1;
  start: (typeof STARTS)[number]["id"];
  height: (typeof HEIGHTS)[number]["id"];
  build: (typeof BUILDS)[number]["id"];
  skin: number;
  face: (typeof FACES)[number]["id"];
  eyes: (typeof EYES)[number]["id"];
  eyeColor: number;
  lashes: boolean;
  brows: (typeof BROWS)[number]["id"];
  browWeight: 0 | 1 | 2;
  mouth: (typeof MOUTHS)[number]["id"];
  blush: boolean;
  freckles: boolean;
  mole: boolean;
  hair: (typeof HAIRS)[number]["id"];
  fringe: (typeof FRINGES)[number]["id"];
  hairColor: number;
  beard: (typeof BEARDS)[number]["id"];
  outfit: (typeof OUTFITS)[number]["id"];
  outfitColor: number;
  hat: (typeof HATS)[number]["id"];
  hatColor: number;
  glasses: (typeof GLASSES)[number]["id"];
  earrings: (typeof EARRINGS)[number]["id"];
}

const ids = <T extends readonly Opt[]>(list: T) => list.map((o) => o.id) as T[number]["id"][];

/** The starting looks. */
export function preset(start: AvatarCfg["start"]): AvatarCfg {
  const base: AvatarCfg = {
    v: 1,
    start,
    height: "mid",
    build: "mid",
    skin: 2,
    face: "oval",
    eyes: "almond",
    eyeColor: 1,
    lashes: false,
    brows: "soft",
    browWeight: 1,
    mouth: "smile",
    blush: true,
    freckles: false,
    mole: false,
    hair: "short",
    fringe: "swept",
    hairColor: 1,
    beard: "none",
    outfit: "hoodie",
    outfitColor: 12,
    hat: "none",
    hatColor: 15,
    glasses: "none",
    earrings: "none",
  };
  if (start === "f") return { ...base, hair: "long", fringe: "wisps", lashes: true, eyes: "round", outfit: "sweater", outfitColor: 13, face: "heart", earrings: "stud" };
  if (start === "m") return { ...base, hair: "short", fringe: "side", brows: "straight", browWeight: 2, outfit: "bomber", outfitColor: 8, face: "oval" };
  return { ...base, hair: "wolf", fringe: "middle", outfit: "tee", outfitColor: 0 };
}

const pick = <T>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length) % xs.length];

/** A random look from a start (the maker's dice). `r` is a 0..1 random source. */
export function randomCfg(start: AvatarCfg["start"], r: () => number = Math.random): AvatarCfg {
  const c = preset(start);
  const femme = start === "f" || (start === "x" && r() < 0.5);
  const hairs = femme
    ? (["bob", "long", "wavy", "pony", "twin", "bun", "braids", "curly", "short", "wolf"] as const)
    : (["buzz", "short", "curly", "afro", "wolf", "short", "bob", "bald"] as const);
  const outfits = OUTFITS.filter((o) => (femme ? true : !["dress", "sweater", "qipao", "aodai", "sari"].includes(o.id)));
  const hat =
    r() < 0.35
      ? pick(
          HATS.filter((h) => h.id !== "none"),
          r,
        ).id
      : "none";
  return {
    ...c,
    height: pick(ids(HEIGHTS), r),
    build: r() < 0.6 ? "mid" : pick(ids(BUILDS), r),
    skin: Math.floor(r() * SKINS.length),
    face: pick(ids(FACES), r),
    eyes: pick(ids(EYES), r),
    eyeColor: r() < 0.6 ? Math.floor(r() * 3) : Math.floor(r() * EYE_COLORS.length),
    lashes: femme ? r() < 0.8 : r() < 0.1,
    brows: pick(ids(BROWS), r),
    browWeight: Math.floor(r() * 3) as 0 | 1 | 2,
    mouth: r() < 0.5 ? "smile" : pick(ids(MOUTHS), r),
    freckles: r() < 0.15,
    mole: r() < 0.1,
    hair: pick(hairs, r),
    fringe: pick(ids(FRINGES), r),
    hairColor: r() < 0.7 ? Math.floor(r() * 6) : Math.floor(r() * HAIR_COLORS.length),
    beard: !femme && r() < 0.3 ? pick(["stubble", "mustache", "goatee", "full"] as const, r) : "none",
    outfit: pick(outfits, r).id,
    outfitColor: Math.floor(r() * CLOTH.length),
    hat: hat === "hijab" && !femme ? "none" : hat,
    hatColor: Math.floor(r() * CLOTH.length),
    glasses:
      r() < 0.25
        ? pick(
            ids(GLASSES).filter((g) => g !== "none"),
            r,
          )
        : "none",
    earrings:
      femme && r() < 0.5
        ? pick(
            ids(EARRINGS).filter((e) => e !== "none"),
            r,
          )
        : "none",
  };
}

const one = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T => (typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : fallback);
const num = (x: unknown, n: number, fallback: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n ? x : fallback);

/**
 * A saved look made safe: anything missing or unknown becomes the start's own choice. The server
 * runs every face it's sent through this before drawing it.
 */
export function sanitize(raw: unknown): AvatarCfg {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = preset(one(o.start, ids(STARTS), "x"));
  return {
    v: 1,
    start: d.start,
    height: one(o.height, ids(HEIGHTS), d.height),
    build: one(o.build, ids(BUILDS), d.build),
    skin: num(o.skin, SKINS.length, d.skin),
    face: one(o.face, ids(FACES), d.face),
    eyes: one(o.eyes, ids(EYES), d.eyes),
    eyeColor: num(o.eyeColor, EYE_COLORS.length, d.eyeColor),
    lashes: typeof o.lashes === "boolean" ? o.lashes : d.lashes,
    brows: one(o.brows, ids(BROWS), d.brows),
    browWeight: num(o.browWeight, 3, d.browWeight) as 0 | 1 | 2,
    mouth: one(o.mouth, ids(MOUTHS), d.mouth),
    blush: typeof o.blush === "boolean" ? o.blush : d.blush,
    freckles: typeof o.freckles === "boolean" ? o.freckles : d.freckles,
    mole: typeof o.mole === "boolean" ? o.mole : d.mole,
    hair: one(o.hair, ids(HAIRS), d.hair),
    fringe: one(o.fringe, ids(FRINGES), d.fringe),
    hairColor: num(o.hairColor, HAIR_COLORS.length, d.hairColor),
    beard: one(o.beard, ids(BEARDS), d.beard),
    outfit: one(o.outfit, ids(OUTFITS), d.outfit),
    outfitColor: num(o.outfitColor, CLOTH.length, d.outfitColor),
    hat: one(o.hat, ids(HATS), d.hat),
    hatColor: num(o.hatColor, CLOTH.length, d.hatColor),
    glasses: one(o.glasses, ids(GLASSES), d.glasses),
    earrings: one(o.earrings, ids(EARRINGS), d.earrings),
  };
}
