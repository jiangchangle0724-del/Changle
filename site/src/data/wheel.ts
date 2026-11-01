import type { T } from "../i18n";

export type Slice = { id: string; label: T; kind: "drink" | "safe" | "truth" | "dare" | "again" | "custom" };

const s = (id: string, zh: string, en: string, kind: Slice["kind"] = "drink"): Slice => ({ id, label: { zh, en }, kind });

export const DEFAULT_SLICES: Slice[] = [
  s("sip", "喝一口", "A sip"),
  s("full", "喝一杯", "Finish it"),
  s("pick", "指定一人喝", "Pick one"),
  s("neighbors", "左右两人喝", "Neighbors"),
  s("all", "全桌喝", "Everyone"),
  s("safe", "免罪", "Safe", "safe"),
  s("truth", "真心话", "Truth", "truth"),
  s("dare", "大冒险", "Dare", "dare"),
  s("two", "喝两口", "Two sips"),
  s("again", "再转一次", "Spin again", "again"),
];

/**
 * The drinking slices when the table plays for its own penalty: the wheel picks who takes it.
 * A sip, two sips and a whole glass all come to the same penalty, so those three read the same.
 */
const CUSTOM_LABELS: Record<string, T> = {
  sip: { zh: "自己罚", en: "You" },
  full: { zh: "自己罚", en: "You" },
  two: { zh: "自己罚", en: "You" },
  pick: { zh: "指定一人罚", en: "Pick one" },
  neighbors: { zh: "左右两人罚", en: "Neighbors" },
  all: { zh: "全桌罚", en: "Everyone" },
};

/** What a slice says: a built-in drinking slice reads as the table's own penalty when there is one. */
export function sliceLabel(slice: Pick<Slice, "id" | "kind" | "label">, custom: boolean): T {
  return custom && slice.kind === "drink" ? CUSTOM_LABELS[slice.id] ?? slice.label : slice.label;
}
