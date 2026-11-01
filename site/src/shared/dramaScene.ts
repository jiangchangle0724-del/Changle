/**
 * 戏精大赏: a scene a player wrote, checked and tidied the same way everywhere it goes: the
 * writing form on the phone, the table (rooms server) and the public library (hub).
 *
 * A player writes in one language (or both); a field given once is used for both. Blank secrets
 * and a blank twist are filled from the generic ones when the scene is played; a blank question
 * comes from the culprit's name.
 */
import { KINDS, type DramaDiff, type DramaKind, type DramaLevel, type DramaRole, type DramaScene } from "../data/drama";
import type { T } from "../i18n";
import { clean } from "./engine/api";

export const SCENE_LIMITS = { title: 30, setup: 220, name: 16, brief: 60, alibi: 110, culprit: 16, card: 180, ask: 40, twist: 150 } as const;

/** Which language a written scene is in (both, when the writer gave both). */
export type SceneLang = "zh" | "en" | "both";

/** What the form sends: every text either one string or { zh, en }. */
export type SceneDraft = {
  title: unknown;
  setup: unknown;
  kind?: unknown;
  level?: unknown;
  diff?: unknown;
  roles: { name: unknown; brief?: unknown; alibi?: unknown }[];
  culprit: unknown;
  culpritCard: unknown;
  ask?: unknown;
  twist?: unknown;
};

const CJK = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

function both(x: unknown, max: number): T {
  if (x && typeof x === "object") {
    const o = x as { zh?: unknown; en?: unknown };
    const zh = clean(o.zh, max);
    const en = clean(o.en, max);
    return { zh: zh || en, en: en || zh };
  }
  const s = clean(x, max);
  return { zh: s, en: s };
}

export const hasText = (x: T | undefined | null) => !!x && !!(x.zh || x.en);

/** A tidy scene and the language it is written in, or what is missing. */
export function cleanScene(raw: unknown): { scene: DramaScene; lang: SceneLang } | { error: "title" | "setup" | "roles" | "culprit" | "card" | "bad" } {
  if (!raw || typeof raw !== "object") return { error: "bad" };
  const o = raw as SceneDraft;
  const L = SCENE_LIMITS;
  const title = both(o.title, L.title);
  if (!hasText(title)) return { error: "title" };
  const setup = both(o.setup, L.setup);
  if (!hasText(setup)) return { error: "setup" };
  if (!Array.isArray(o.roles)) return { error: "roles" };
  const roles: DramaRole[] = [];
  for (const r of o.roles.slice(0, 4)) {
    if (!r || typeof r !== "object") continue;
    const name = both(r.name, L.name);
    if (!hasText(name)) continue;
    roles.push({ name, brief: both(r.brief, L.brief), alibi: both(r.alibi, L.alibi) });
  }
  if (roles.length < 2) return { error: "roles" };
  const culprit = both(o.culprit, L.culprit);
  if (!hasText(culprit)) return { error: "culprit" };
  const culpritCard = both(o.culpritCard, L.card);
  if (!hasText(culpritCard)) return { error: "card" };
  let ask = both(o.ask, L.ask);
  if (!hasText(ask)) ask = { zh: `谁是「${culprit.zh}」？`, en: `Who's ${/^the /i.test(culprit.en) ? culprit.en.replace(/^the /i, "the ") : culprit.en}?` };
  const kind: DramaKind = KINDS.some((k) => k.key === o.kind) ? (o.kind as DramaKind) : "family";
  const level: DramaLevel = o.level === "spicy" ? "spicy" : "all";
  const diff: DramaDiff = o.diff === "hard" || o.diff === "easy" ? o.diff : roles.length >= 4 ? "hard" : "easy";
  const scene: DramaScene = { id: "", kind, level, diff, title, setup, roles, culprit, culpritCard, ask, twist: both(o.twist, L.twist) };
  // the language: both when the writer gave two different versions, else whichever it reads as
  const texts = [title, setup, culpritCard];
  const lang: SceneLang = texts.some((x) => x.zh !== x.en) ? "both" : texts.some((x) => CJK.test(x.zh)) ? "zh" : LATIN.test(title.en + setup.en) ? "en" : "zh";
  return { scene, lang };
}
