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
