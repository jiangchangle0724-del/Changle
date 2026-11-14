/**
 * How a player's figure looks (Steve on Nov 14: 捏脸 with MakeHuman's free human, sliders for the
 * face shape, eyes, nose, mouth, skin and hair; each person keeps a few dozen numbers). The model
 * files carry the sliders' targets (site/scripts/figure/human.mjs, the same ids), the page mixes them.
 * Kept on this phone for now (localStorage); later on the account, for the games.
 */
export type Sex = "male" | "female";
export type ShapeGroup = "face" | "eyes" | "nose" | "mouth";

/** a slider: -1 to 1, or 0 to 1 where `one` (a shape you have more or less of) */
type Shape = { id: string; group: ShapeGroup; zh: string; en: string; one?: true };

export const SHAPES = [
  { id: "faceWidth", group: "face", zh: "脸宽", en: "Width" },
  { id: "faceLength", group: "face", zh: "脸长", en: "Length" },
  { id: "round", group: "face", zh: "圆脸", en: "Round", one: true },
  { id: "square", group: "face", zh: "方脸", en: "Square", one: true },
  { id: "vface", group: "face", zh: "瓜子脸", en: "V-shaped", one: true },
  { id: "cheekbones", group: "face", zh: "颧骨", en: "Cheekbones" },
  { id: "cheeks", group: "face", zh: "脸颊", en: "Cheeks" },
  { id: "chinWidth", group: "face", zh: "下巴宽", en: "Chin width" },
  { id: "chinLength", group: "face", zh: "下巴长", en: "Chin length" },
  { id: "chinOut", group: "face", zh: "下巴前翘", en: "Chin forward" },
  { id: "ears", group: "face", zh: "耳朵", en: "Ears" },
  { id: "eyeSize", group: "eyes", zh: "大小", en: "Size" },
  { id: "eyeApart", group: "eyes", zh: "眼距", en: "Spacing" },
  { id: "eyeHeight", group: "eyes", zh: "高低", en: "Height" },
  { id: "eyeTilt", group: "eyes", zh: "眼角", en: "Tilt" },
  { id: "eyeFold", group: "eyes", zh: "眼皮", en: "Eyelids" },
  { id: "eyeOpen", group: "eyes", zh: "睁大", en: "Open" },
  { id: "browHeight", group: "eyes", zh: "眉毛高低", en: "Brow height" },
  { id: "browAngle", group: "eyes", zh: "眉毛角度", en: "Brow angle" },
  { id: "noseWidth", group: "nose", zh: "宽窄", en: "Width" },
  { id: "noseLength", group: "nose", zh: "长短", en: "Length" },
  { id: "noseHeight", group: "nose", zh: "鼻梁高", en: "Bridge" },
  { id: "noseHump", group: "nose", zh: "驼峰", en: "Hump" },
  { id: "nostrils", group: "nose", zh: "鼻翼", en: "Nostrils" },
  { id: "noseTip", group: "nose", zh: "鼻尖", en: "Tip" },
  { id: "mouthWidth", group: "mouth", zh: "宽窄", en: "Width" },
  { id: "upperLip", group: "mouth", zh: "上唇", en: "Upper lip" },
  { id: "lowerLip", group: "mouth", zh: "下唇", en: "Lower lip" },
  { id: "mouthHeight", group: "mouth", zh: "高低", en: "Height" },
  { id: "corners", group: "mouth", zh: "嘴角", en: "Corners" },
] as const satisfies readonly Shape[];
export type ShapeId = (typeof SHAPES)[number]["id"];

/**
 * The skin and hair colours (what a swatch shows, and what the figure is tinted to). They're the
 * figure's own colours, like a photo's, so they live here as data, not as design tokens.
 */
export const SKINS = ["#f4dccb", "#ecc8ae", "#e1b495", "#c99e83", "#b9855f", "#a06c49", "#845436", "#653d27", "#47291b"] as const;
export const HAIR_COLORS = ["#1c1714", "#3b2a1f", "#68482f", "#7f3f22", "#b98e5a", "#ddc79e", "#b8b4ad", "#8e2a1e", "#e58fb6", "#4c6fd6", "#8a5bd6"] as const;
export const SKIN_NAMES = { zh: ["白皙", "浅", "自然偏浅", "自然", "小麦", "健康", "古铜", "深", "很深"], en: ["Fair", "Light", "Light medium", "Medium", "Tan", "Warm", "Bronze", "Deep", "Very deep"] };
export const HAIR_COLOR_NAMES = { zh: ["黑", "深棕", "棕", "栗色", "金棕", "浅金", "银灰", "酒红", "粉", "蓝", "紫"], en: ["Black", "Dark brown", "Brown", "Chestnut", "Golden brown", "Blonde", "Silver", "Wine red", "Pink", "Blue", "Purple"] };

/** the hairstyles; "none" is a buzz cut (the skin's own) */
export const HAIRS = [
  { id: "short02", zh: "碎短发", en: "Messy short" },
  { id: "short04", zh: "侧分", en: "Side part" },
  { id: "short01", zh: "短发", en: "Short" },
  { id: "short03", zh: "刘海", en: "Fringe" },
  { id: "bob01", zh: "波波头", en: "Bob" },
  { id: "bob02", zh: "齐刘海", en: "Blunt bangs" },
  { id: "long01", zh: "长直发", en: "Long" },
  { id: "ponytail01", zh: "马尾", en: "Ponytail" },
  { id: "braid01", zh: "辫子", en: "Braid" },
  { id: "afro01", zh: "爆炸头", en: "Afro" },
  { id: "none", zh: "寸头", en: "Buzz cut" },
] as const;
export type HairId = (typeof HAIRS)[number]["id"];

export type Look = {
  v: 1;
  sex: Sex;
  /** the sliders that aren't 0 */
  shape: Partial<Record<ShapeId, number>>;
  /** indexes into SKINS and HAIR_COLORS */
  skin: number;
  hair: HairId;
  hairColor: number;
};

/** each figure's own hair is in its file; the others load when picked */
export const FIRST_HAIR: Record<Sex, HairId> = { male: "short02", female: "long01" };

export const defaultLook = (sex: Sex): Look => ({ v: 1, sex, shape: {}, skin: 3, hair: FIRST_HAIR[sex], hairColor: 1 });

const KEY = "figure.look";
const clamp = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0);

/** what's kept on this phone, checked (an old or broken one gives the default) */
export function readLook(): Look {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    raw = null;
  }
  const o = raw as Partial<Look> | null;
  const sex: Sex = o?.sex === "female" ? "female" : "male";
  const look = defaultLook(sex);
  if (!o || o.v !== 1) return look;
  for (const s of SHAPES) {
    const x = clamp(o.shape?.[s.id], "one" in s ? 0 : -1, 1);
    if (x) look.shape[s.id] = Math.round(x * 100) / 100;
  }
  look.skin = Math.round(clamp(o.skin, 0, SKINS.length - 1));
  look.hairColor = Math.round(clamp(o.hairColor, 0, HAIR_COLORS.length - 1));
  if (HAIRS.some((h) => h.id === o.hair)) look.hair = o.hair as HairId;
  return look;
}

export function saveLook(look: Look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // private mode or full: it just won't be remembered
  }
}

/** a random face (mostly mild), skin and hair, for the same body */
export function randomLook(sex: Sex): Look {
  const r = (a: number) => Math.round((Math.random() * 2 - 1) * a * 100) / 100;
  const look = defaultLook(sex);
  for (const s of SHAPES) {
    if ("one" in s) continue;
    const x = r(0.65);
    if (Math.abs(x) > 0.08) look.shape[s.id] = x;
  }
  const kind = (["round", "square", "vface"] as const)[Math.floor(Math.random() * 3)];
  look.shape[kind] = Math.round(Math.random() * 60) / 100;
  look.skin = Math.floor(Math.random() * SKINS.length);
  look.hair = HAIRS[Math.floor(Math.random() * HAIRS.length)].id;
  // mostly natural hair colours, now and then a bright one
  look.hairColor = Math.random() < 0.8 ? Math.floor(Math.random() * 7) : 7 + Math.floor(Math.random() * 4);
  return look;
}

/** the targets' weights for the sliders: S_<id>_incr for above 0, S_<id>_decr for below */
export function shapeWeights(look: Look): Map<string, number> {
  const w = new Map<string, number>();
  for (const s of SHAPES) {
    const x = look.shape[s.id] ?? 0;
    if (x > 0) w.set(`S_${s.id}_incr`, x);
    else if (x < 0) w.set(`S_${s.id}_decr`, -x);
  }
  return w;
}
