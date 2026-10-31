// What the maker offers, tab by tab: each group is a row of pictures, colors or switches, and the
// look it changes. Pictures show your own look with that one thing changed.
import {
  BEARDS,
  BROWS,
  BUILDS,
  CLOTH,
  EARRINGS,
  EYE_COLORS,
  EYES,
  FACES,
  FRINGES,
  GLASSES,
  HAIR_COLORS,
  HAIRS,
  HATS,
  HEIGHTS,
  MOUTHS,
  OUTFITS,
  SKINS,
  STARTS,
  preset,
  type AvatarCfg,
  type Opt,
} from "../../shared/avatar/cfg";
import type { View } from "../../shared/avatar/render";

export type Words = { zh: string; en: string };

type Key<V> = { [K in keyof AvatarCfg]: AvatarCfg[K] extends V ? K : never }[keyof AvatarCfg];

export type Group =
  | {
      kind: "pics";
      title: Words;
      key: keyof AvatarCfg;
      options: readonly Opt[];
      view: View;
      cols: 3 | 4;
      /** Apply a choice (default: set `key`). */
      pick?: (c: AvatarCfg, id: string) => AvatarCfg;
      /** Hide some choices for this look. */
      only?: (c: AvatarCfg) => readonly string[] | null;
      hidden?: (c: AvatarCfg) => boolean;
    }
  | { kind: "colors"; title: Words; key: Key<number>; colors: readonly string[]; style: "skin" | "hair" | "eye" | "cloth"; hidden?: (c: AvatarCfg) => boolean }
  | { kind: "switches"; title: Words; items: { key: Key<boolean>; zh: string; en: string }[]; hidden?: (c: AvatarCfg) => boolean }
  | { kind: "steps"; title: Words; key: "browWeight"; options: Words[]; hidden?: (c: AvatarCfg) => boolean };

export type TabId = "photo" | "body" | "face" | "eyes" | "hair" | "outfit" | "extras";

export const TABS: { id: TabId; zh: string; en: string }[] = [
  { id: "photo", zh: "照片", en: "Photo" },
  { id: "body", zh: "身材", en: "Body" },
  { id: "face", zh: "脸", en: "Face" },
  { id: "eyes", zh: "眼睛", en: "Eyes" },
  { id: "hair", zh: "发型", en: "Hair" },
  { id: "outfit", zh: "衣服", en: "Clothes" },
  { id: "extras", zh: "配饰", en: "Extras" },
];

/** Start over from a style, keeping what's yours: skin, eyes, hair color. */
export function restyle(c: AvatarCfg, start: AvatarCfg["start"]): AvatarCfg {
  return { ...preset(start), skin: c.skin, eyeColor: c.eyeColor, hairColor: c.hairColor, height: c.height, build: c.build };
}

const colorsOf = (xs: readonly (readonly string[])[]) => xs.map((x) => x[0]);

export const GROUPS: Record<Exclude<TabId, "photo">, Group[]> = {
  body: [
    { kind: "pics", title: { zh: "风格", en: "Style" }, key: "start", options: STARTS, view: "full", cols: 3, pick: (c, id) => restyle(c, id as AvatarCfg["start"]) },
    { kind: "pics", title: { zh: "身高", en: "Height" }, key: "height", options: HEIGHTS, view: "full", cols: 3 },
    { kind: "pics", title: { zh: "体型", en: "Build" }, key: "build", options: BUILDS, view: "full", cols: 3 },
  ],
  face: [
    { kind: "colors", title: { zh: "肤色", en: "Skin" }, key: "skin", colors: colorsOf(SKINS), style: "skin" },
    { kind: "pics", title: { zh: "脸型", en: "Face shape" }, key: "face", options: FACES, view: "head", cols: 3 },
    { kind: "pics", title: { zh: "表情", en: "Expression" }, key: "mouth", options: MOUTHS, view: "face", cols: 3 },
    {
      kind: "switches",
      title: { zh: "脸上", en: "Details" },
      items: [
        { key: "blush", zh: "腮红", en: "Blush" },
        { key: "freckles", zh: "雀斑", en: "Freckles" },
        { key: "mole", zh: "小痣", en: "Beauty mark" },
      ],
    },
  ],
  eyes: [
    { kind: "pics", title: { zh: "眼型", en: "Eye shape" }, key: "eyes", options: EYES, view: "face", cols: 3 },
    { kind: "colors", title: { zh: "瞳色", en: "Eye color" }, key: "eyeColor", colors: EYE_COLORS, style: "eye" },
    { kind: "switches", title: { zh: "睫毛", en: "Lashes" }, items: [{ key: "lashes", zh: "长睫毛", en: "Long lashes" }] },
    { kind: "pics", title: { zh: "眉形", en: "Brows" }, key: "brows", options: BROWS, view: "face", cols: 4 },
    {
      kind: "steps",
      title: { zh: "眉毛粗细", en: "Brow weight" },
      key: "browWeight",
      options: [
        { zh: "细", en: "Fine" },
        { zh: "中", en: "Medium" },
        { zh: "浓", en: "Bold" },
      ],
    },
  ],
  hair: [
    { kind: "pics", title: { zh: "发型", en: "Hairstyle" }, key: "hair", options: HAIRS, view: "head", cols: 4 },
    {
      kind: "pics",
      title: { zh: "刘海", en: "Fringe" },
      key: "fringe",
      options: FRINGES,
      view: "head",
      cols: 4,
      hidden: (c) => c.hair === "bald" || c.hat === "hijab" || c.hat === "turban",
      only: (c) => (c.hair === "buzz" || c.hair === "afro" ? ["back", "side", "middle"] : null),
    },
    { kind: "colors", title: { zh: "发色", en: "Hair color" }, key: "hairColor", colors: colorsOf(HAIR_COLORS), style: "hair" },
    { kind: "pics", title: { zh: "胡子", en: "Facial hair" }, key: "beard", options: BEARDS, view: "face", cols: 3 },
  ],
  outfit: [
    { kind: "pics", title: { zh: "潮流", en: "Everyday" }, key: "outfit", options: OUTFITS.filter((o) => o.kind === "trend"), view: "full", cols: 3 },
    { kind: "pics", title: { zh: "各地传统服饰", en: "Traditional dress" }, key: "outfit", options: OUTFITS.filter((o) => o.kind === "culture"), view: "full", cols: 3 },
    { kind: "colors", title: { zh: "颜色", en: "Color" }, key: "outfitColor", colors: CLOTH, style: "cloth" },
  ],
  extras: [
    { kind: "pics", title: { zh: "帽子和头饰", en: "Hats" }, key: "hat", options: HATS, view: "head", cols: 4 },
    { kind: "colors", title: { zh: "帽子颜色", en: "Hat color" }, key: "hatColor", colors: CLOTH, style: "cloth", hidden: (c) => c.hat === "none" || c.hat === "flowers" },
    { kind: "pics", title: { zh: "眼镜", en: "Glasses" }, key: "glasses", options: GLASSES, view: "face", cols: 3 },
    { kind: "pics", title: { zh: "耳饰", en: "Earrings" }, key: "earrings", options: EARRINGS, view: "head", cols: 4, hidden: (c) => c.hat === "hijab" },
  ],
};
