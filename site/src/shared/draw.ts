// An anime avatar drawn by an image model from a photo: the choices the maker offers, and the
// prompt the server builds from them. Every choice is an id from these lists, so nothing a player
// sends reaches the prompt as words of their own (the server runs them through `cleanChoices`).

export type Choice = { id: string; zh: string; en: string; say: string };

const c = (id: string, zh: string, en: string, say: string): Choice => ({ id, zh, en, say });

/** How to draw them: as in the photo, or as a woman, a man, or neither. */
export const STYLES = [
  c("keep", "照片里的样子", "As in the photo", ""),
  c("f", "女", "Woman", "Draw them as a woman."),
  c("m", "男", "Man", "Draw them as a man."),
  c("x", "中性", "Androgynous", "Give them an androgynous look."),
];

export const HEIGHTS = [c("short", "矮", "Short", "a short, petite frame"), c("mid", "中等", "Medium", ""), c("tall", "高", "Tall", "a tall frame")];

export const BUILDS = [c("slim", "瘦", "Slim", "a slim build"), c("mid", "匀称", "Medium", ""), c("round", "胖", "Round", "a chubby, round build")];

export const HAIRS = [
  c("keep", "照片里的", "My own", ""),
  c("short", "短发", "Short", "short hair"),
  c("buzz", "寸头", "Buzz cut", "a buzz cut"),
  c("bob", "波波头", "Bob", "a bob cut"),
  c("long", "长直发", "Long", "long straight hair"),
  c("wavy", "长卷发", "Long waves", "long wavy hair"),
  c("curly", "短卷发", "Curls", "short curly hair"),
  c("afro", "爆炸头", "Afro", "an afro"),
  c("wolf", "狼尾", "Wolf cut", "a wolf cut"),
  c("pony", "高马尾", "Ponytail", "a high ponytail"),
  c("twin", "双马尾", "Twin tails", "twin tails"),
  c("bun", "丸子头", "Bun", "a bun on top of the head"),
  c("braids", "麻花辫", "Braids", "two braids"),
  c("bald", "光头", "Bald", "a bald head"),
];

export const HAIR_COLORS = [
  c("keep", "照片里的", "My own", ""),
  c("black", "黑", "Black", "black"),
  c("brown", "棕", "Brown", "brown"),
  c("blonde", "金", "Blonde", "blonde"),
  c("auburn", "红棕", "Auburn", "auburn"),
  c("silver", "银白", "Silver", "silver-white"),
  c("pink", "粉", "Pink", "pastel pink"),
  c("violet", "紫", "Violet", "lavender"),
  c("blue", "蓝", "Blue", "sky blue"),
  c("mint", "薄荷", "Mint", "mint green"),
];

/** Swatches for the hair colors (the drawing decides the shades). */
export const HAIR_SWATCH: Record<string, string> = {
  black: "#2a2530",
  brown: "#6e4a34",
  blonde: "#e2b866",
  auburn: "#a8442e",
  silver: "#dcdae4",
  pink: "#ff9cc5",
  violet: "#b8a2ff",
  blue: "#6cb6ff",
  mint: "#7fe0bf",
};

export const OUTFITS = [
  c("keep", "照片里穿的", "What I'm wearing", ""),
  // everyday
  c("hoodie", "卫衣", "Hoodie", "a cozy oversized hoodie with jeans and sneakers"),
  c("tee", "宽松T恤", "Oversized tee", "a plain oversized t-shirt with cargo pants and sneakers"),
  c("bomber", "飞行员夹克", "Bomber", "a bomber jacket over a t-shirt, slim trousers and sneakers"),
  c("denim", "牛仔外套", "Denim jacket", "a denim jacket over a white t-shirt, with jeans"),
  c("suit", "西装", "Suit", "a sharp tailored suit with a shirt"),
  c("sweater", "毛衣配裙", "Sweater & skirt", "a knit sweater with a pleated skirt and loafers"),
  c("dress", "连衣裙", "Dress", "a simple summer dress with sandals"),
  c("track", "运动套装", "Tracksuit", "a matching tracksuit with sneakers"),
  c("puffer", "羽绒服", "Puffer", "a puffer jacket with jeans and boots"),
  c("overalls", "背带裤", "Overalls", "denim overalls over a striped t-shirt"),
  // from around the world
  c("qipao", "旗袍", "Qipao", "a Chinese qipao (cheongsam) with a mandarin collar and frog buttons"),
  c("tang", "唐装", "Tang jacket", "a Chinese Tang jacket (tangzhuang) with frog buttons"),
  c("hanfu", "汉服", "Hanfu", "a traditional Chinese hanfu with a crossed collar and wide flowing sleeves"),
  c("hanbok", "韩服", "Hanbok", "a Korean hanbok"),
  c("kimono", "和服", "Kimono", "a Japanese kimono with an obi sash"),
  c("aodai", "奥黛", "Áo dài", "a Vietnamese áo dài"),
  c("sari", "纱丽", "Sari", "an Indian sari"),
  c("kurta", "库尔塔", "Kurta", "a South Asian kurta with loose trousers"),
  c("ankara", "非洲印花", "Ankara print", "a West African Ankara wax-print outfit"),
  c("kilt", "苏格兰裙", "Kilt", "a Scottish tartan kilt outfit"),
];
export const EVERYDAY = ["hoodie", "tee", "bomber", "denim", "suit", "sweater", "dress", "track", "puffer", "overalls"];
export const TRADITIONAL = ["qipao", "tang", "hanfu", "hanbok", "kimono", "aodai", "sari", "kurta", "ankara", "kilt"];

export const CLOTH_COLORS = [
  c("auto", "AI 来配", "AI picks", ""),
  c("red", "红", "Red", "red"),
  c("coral", "珊瑚", "Coral", "coral"),
  c("orange", "橙", "Orange", "orange"),
  c("yellow", "黄", "Yellow", "mustard yellow"),
  c("green", "绿", "Green", "green"),
  c("teal", "青", "Teal", "teal"),
  c("sky", "天蓝", "Sky", "sky blue"),
  c("navy", "藏青", "Navy", "navy blue"),
  c("lavender", "淡紫", "Lavender", "lavender"),
  c("pink", "粉", "Pink", "pink"),
  c("white", "白", "White", "white"),
  c("black", "黑", "Black", "black"),
  c("beige", "米色", "Beige", "beige"),
];
export const CLOTH_SWATCH: Record<string, string> = {
  red: "#d6404d",
  coral: "#ff7a63",
  orange: "#ff9446",
  yellow: "#e8b43c",
  green: "#3ea36b",
  teal: "#29a39a",
  sky: "#6cb6ff",
  navy: "#2d3b66",
  lavender: "#a99cf2",
  pink: "#ff9cc5",
  white: "#f4f1ea",
  black: "#2a2733",
  beige: "#d9c7a5",
};

export const HATS = [
  c("none", "不戴", "None", ""),
  c("cap", "棒球帽", "Cap", "a baseball cap"),
  c("beanie", "毛线帽", "Beanie", "a knit beanie"),
  c("bucket", "渔夫帽", "Bucket hat", "a bucket hat"),
  c("beret", "贝雷帽", "Beret", "a beret"),
  c("straw", "草帽", "Straw hat", "a straw hat"),
  c("cowboy", "牛仔帽", "Cowboy hat", "a cowboy hat"),
  c("ears", "猫耳发箍", "Cat ears", "a cat-ear headband"),
  c("flowers", "花环", "Flower crown", "a flower crown"),
  c("hijab", "头巾", "Hijab", "a hijab covering the hair"),
  c("turban", "包头巾", "Turban", "a turban"),
];

export const GLASSES = [
  c("keep", "照片里的", "As in the photo", ""),
  c("none", "不戴", "None", "no glasses"),
  c("round", "圆框", "Round", "round thin-framed glasses"),
  c("bold", "黑框", "Bold", "bold black-framed glasses"),
  c("sun", "墨镜", "Sunglasses", "sunglasses"),
];

export const EXTRAS = [
  c("earrings", "耳环", "Earrings", "small earrings"),
  c("necklace", "项链", "Necklace", "a delicate necklace"),
  c("headphones", "耳机", "Headphones", "headphones around the neck"),
  c("scarf", "围巾", "Scarf", "a scarf"),
  c("bag", "小包", "Bag", "a small shoulder bag"),
];

/** The backdrop, behind the figure and the round avatar: the site's avatar gels, in order. */
export const BACKDROPS = [
  { hex: "#b072ff", say: "violet" },
  { hex: "#4be38f", say: "mint green" },
  { hex: "#ffb82e", say: "warm amber" },
  { hex: "#31b9ff", say: "sky blue" },
  { hex: "#ff5fa2", say: "hot pink" },
  { hex: "#b6e83a", say: "lime green" },
  { hex: "#ff6b5e", say: "coral" },
  { hex: "#8c86ff", say: "periwinkle" },
  { hex: "#2ed3d9", say: "aqua" },
  { hex: "#ff8c42", say: "tangerine" },
  { hex: "#e765f0", say: "orchid" },
  { hex: "#5b9bff", say: "cornflower blue" },
  { hex: "#f5df3b", say: "lemon yellow" },
  { hex: "#22d3a6", say: "jade green" },
  { hex: "#ff9cc5", say: "rose pink" },
];

export type Choices = {
  style: string;
  height: string;
  build: string;
  hair: string;
  hairColor: string;
  outfit: string;
  outfitColor: string;
  hat: string;
  glasses: string;
  extras: string[];
  backdrop: number;
};

export const DEFAULT_CHOICES: Choices = {
  style: "keep",
  height: "mid",
  build: "mid",
  hair: "keep",
  hairColor: "keep",
  outfit: "keep",
  outfitColor: "auto",
  hat: "none",
  glasses: "keep",
  extras: [],
  backdrop: 0,
};

const pick = (x: unknown, list: Choice[], fallback: string) => (typeof x === "string" && list.some((o) => o.id === x) ? x : fallback);
const find = (list: Choice[], id: string) => list.find((o) => o.id === id)!;

/** Whatever was sent, as choices from the lists (anything else falls back to the default). */
export function cleanChoices(raw: unknown): Choices {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CHOICES;
  const extras = Array.isArray(o.extras) ? [...new Set(o.extras.filter((x): x is string => typeof x === "string" && EXTRAS.some((e) => e.id === x)))] : [];
  const bd = typeof o.backdrop === "number" && Number.isInteger(o.backdrop) && o.backdrop >= 0 && o.backdrop < BACKDROPS.length ? o.backdrop : d.backdrop;
  return {
    style: pick(o.style, STYLES, d.style),
    height: pick(o.height, HEIGHTS, d.height),
    build: pick(o.build, BUILDS, d.build),
    hair: pick(o.hair, HAIRS, d.hair),
    hairColor: pick(o.hairColor, HAIR_COLORS, d.hairColor),
    outfit: pick(o.outfit, OUTFITS, d.outfit),
    outfitColor: pick(o.outfitColor, CLOTH_COLORS, d.outfitColor),
    hat: pick(o.hat, HATS, d.hat),
    glasses: pick(o.glasses, GLASSES, d.glasses),
    extras,
    backdrop: bd,
  };
}

/**
 * The words sent with the picture. `from` is what the picture is: a photo of the player, or the
 * anime figure they already have (then only what they changed is redrawn).
 */
export function drawPrompt(ch: Choices, from: "photo" | "figure"): string {
  const photo = from === "photo";
  const lines: string[] = [];
  lines.push(
    photo
      ? "Draw the person in this photo as a cute chibi anime character."
      : "Redraw the chibi anime character in this picture as the very same character, changing only what is asked below.",
  );
  lines.push("Full body, standing, facing the viewer, about 2.5 heads tall: a big head on a small body.");
  lines.push(
    photo
      ? "Keep them clearly recognizable as themselves: the same face shape, eyes, eyebrows, nose, mouth, skin tone and age as in the photo, and any facial hair."
      : "Keep the same face, eyes, skin tone, facial hair and art style.",
  );
  const style = find(STYLES, ch.style).say;
  if (style) lines.push(style);
  const body = [find(HEIGHTS, ch.height).say, find(BUILDS, ch.build).say].filter(Boolean);
  if (body.length) lines.push(`Give them ${body.join(" and ")}, still in chibi proportions.`);

  // hair
  const hairWas = photo ? "as in the photo" : "as in the picture";
  if (ch.hat === "hijab" || ch.hat === "turban") lines.push(`The hair is covered by ${find(HATS, ch.hat).say}.`);
  else if (ch.hair === "keep" && ch.hairColor === "keep") lines.push(`Keep their hairstyle and hair color ${hairWas}.`);
  else {
    const style = ch.hair === "keep" ? `their hairstyle ${hairWas}` : find(HAIRS, ch.hair).say;
    const color = ch.hairColor === "keep" ? `their hair color ${hairWas}` : `${find(HAIR_COLORS, ch.hairColor).say} hair`;
    lines.push(ch.hair === "bald" ? "Give them a bald head." : `Give them ${style}, with ${color}.`);
  }

  // glasses
  if (ch.glasses === "keep") lines.push(photo ? "Glasses only if they wear them in the photo." : "Keep the glasses as they are, if any.");
  else lines.push(`Give them ${find(GLASSES, ch.glasses).say}.`);

  // clothes
  const color = ch.outfitColor === "auto" ? "" : `, mainly ${find(CLOTH_COLORS, ch.outfitColor).say}`;
  if (ch.outfit === "keep") lines.push(photo ? `Dress them in what they are wearing in the photo${color}.` : `Keep the same outfit${color}.`);
  else lines.push(`Dress them in ${find(OUTFITS, ch.outfit).say}${color}.`);
  if (ch.hat !== "none" && ch.hat !== "hijab" && ch.hat !== "turban") lines.push(`Add ${find(HATS, ch.hat).say}.`);
  else if (ch.hat === "none" && !photo) lines.push("No hat.");
  if (ch.extras.length) lines.push(`Add ${ch.extras.map((e) => find(EXTRAS, e).say).join(", ")}.`);

  // the look of the picture
  lines.push(
    "Polished modern anime illustration: clean confident line art, soft cel shading with gentle highlights, big expressive eyes with detailed irises and catchlights, finely drawn hair strands, crisp details on the clothes.",
  );
  const bd = BACKDROPS[ch.backdrop] ?? BACKDROPS[0];
  lines.push(`A plain, flat, solid ${bd.say} background (${bd.hex}) and nothing else: no text, no logo, no frame, no scenery, no floor.`);
  lines.push("The whole figure fits in the picture with some space around it, centered, with the head in the upper part of the picture.");
  lines.push("Friendly and tasteful, made for a profile picture.");
  return lines.join(" ");
}
