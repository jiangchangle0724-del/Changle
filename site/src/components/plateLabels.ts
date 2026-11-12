import type { T } from "../i18n";

/*
 * What a screen reader says for the drawing plate's tools (你画我猜, one phone and online), in both
 * languages. The inks are INK_COLORS (shared/protocol.ts), in that order.
 */
export const INK_NAMES: T[] = [
  { zh: "白色", en: "White" },
  { zh: "粉色", en: "Pink" },
  { zh: "蓝色", en: "Blue" },
  { zh: "黄色", en: "Yellow" },
  { zh: "绿色", en: "Green" },
];

/** Brush widths as a fraction of the plate, so a line looks the same on every screen size. */
export const BRUSHES = [0.012, 0.024, 0.042];
export const BRUSH_NAMES: T[] = [
  { zh: "细", en: "Thin" },
  { zh: "中", en: "Medium" },
  { zh: "粗", en: "Thick" },
];

export const PLATE_LABELS = {
  inks: { zh: "颜色", en: "Ink" },
  brushes: { zh: "粗细", en: "Brush" },
  undo: { zh: "撤销一笔", en: "Undo" },
} satisfies Record<string, T>;
