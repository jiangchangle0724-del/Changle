import type { Rng } from "./rng";
import type { Card, Level } from "./types";

export const ZH_DEFINITION_MAX = 60;
export const EN_DEFINITION_MAX = 160;
export const ZH_FUNFACT_MAX = 60;
export const EN_FUNFACT_MAX = 160;
export const SEED_MAX = 40;

/** Returns a list of problems; empty = valid. Used by tests and by the content pipeline. */
export function validateCard(c: Card): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9-]{3,48}$/.test(c.id)) errs.push(`id "${c.id}" must be lowercase slug`);
  if (![1, 2, 3].includes(c.level)) errs.push(`${c.id}: level must be 1|2|3`);
  if (!c.term?.zh?.trim() || !c.term?.en?.trim()) errs.push(`${c.id}: term zh/en required`);
  if (!c.definition?.zh?.trim() || !c.definition?.en?.trim()) errs.push(`${c.id}: definition zh/en required`);
  if ((c.definition?.zh ?? "").length > ZH_DEFINITION_MAX) errs.push(`${c.id}: zh definition > ${ZH_DEFINITION_MAX} chars`);
  if ((c.definition?.en ?? "").length > EN_DEFINITION_MAX) errs.push(`${c.id}: en definition > ${EN_DEFINITION_MAX} chars`);
  if ((c.bluffSeeds?.zh?.length ?? 0) < 2 || (c.bluffSeeds?.en?.length ?? 0) < 2) errs.push(`${c.id}: need ≥ 2 bluff seeds per language`);
  const def = (c.definition?.zh ?? "") + " " + (c.definition?.en ?? "").toLowerCase();
  for (const s of [...(c.bluffSeeds?.zh ?? []), ...(c.bluffSeeds?.en ?? [])]) {
    if (s.length > SEED_MAX) errs.push(`${c.id}: seed too long: ${s}`);
    if (def.includes(s.toLowerCase())) errs.push(`${c.id}: seed leaks the definition: ${s}`);
  }
  if (!c.funFact?.zh?.trim() || !c.funFact?.en?.trim()) errs.push(`${c.id}: funFact zh/en required (the reveal screen shows it)`);
  if ((c.funFact?.zh ?? "").length > ZH_FUNFACT_MAX) errs.push(`${c.id}: zh funFact > ${ZH_FUNFACT_MAX} chars`);
  if ((c.funFact?.en ?? "").length > EN_FUNFACT_MAX) errs.push(`${c.id}: en funFact > ${EN_FUNFACT_MAX} chars`);
  if (!c.source?.trim()) errs.push(`${c.id}: source required (a URL, or 'editorial')`);
  if (c.source && c.source !== "editorial" && !/^https?:\/\//.test(c.source)) errs.push(`${c.id}: source must be a URL or 'editorial'`);
  if (/\(|（/.test(c.term?.en ?? "") || /\(|（/.test(c.term?.zh ?? "")) errs.push(`${c.id}: term must not carry a gloss in brackets`);
  if (!c.pack) errs.push(`${c.id}: pack required`);
  return errs;
}

/**
 * Warnings, not errors: things an editor must look at. The big one is a Chinese term that is really a
 * translation of the meaning ("雨后泥土味 Petrichor"): the term is shown to the whole table, so a gloss
 * gives the answer away. Flags any run of 2+ Chinese characters shared by term.zh and definition.zh.
 * A Chinese original (an idiom, a dish, a dialect word: the English side shows the same characters)
 * is the word itself, not a gloss, so its definition may quote it.
 */
export function lintCard(c: Card): string[] {
  const warns: string[] = [];
  const zhTerm = c.term?.zh ?? "";
  const zhDef = c.definition?.zh ?? "";
  if (zhTerm.trim() && (c.term?.en ?? "").trim().startsWith(zhTerm.trim())) return warns;
  const seen = new Set<string>();
  for (let i = 0; i + 1 < zhTerm.length; i++) {
    const pair = zhTerm.slice(i, i + 2);
    if (!/^[一-鿿]{2}$/.test(pair) || seen.has(pair)) continue;
    seen.add(pair);
    if (zhDef.includes(pair)) warns.push(`${c.id}: term.zh shares "${pair}" with the definition; is the Chinese term a gloss?`);
  }
  return warns;
}

export function validateDeck(cards: Card[]): string[] {
  const errs = cards.flatMap(validateCard);
  const seen = new Set<string>();
  const terms = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.id)) errs.push(`duplicate id ${c.id}`);
    seen.add(c.id);
    const own = new Set([c.term?.zh, c.term?.en].map((k) => (k ?? "").trim().toLowerCase()).filter(Boolean));
    for (const key of own) {
      if (terms.has(key)) errs.push(`${c.id}: duplicate term "${key}"`);
      terms.add(key);
    }
  }
  return errs;
}

export function lintDeck(cards: Card[]): string[] {
  return cards.flatMap(lintCard);
}

export interface PickOptions {
  level: Level;
  /** empty = all */
  packs: string[];
  /** seen before, this game or earlier ones (the phones and the table remember): dealt last */
  used: string[];
  /** dealt this game: never again while any other card in scope is left */
  tonight?: string[];
  allowAdult: boolean;
}

/**
 * Pick an unseen card at the requested level from the allowed packs.
 * Fallback order: other levels (nearest first) → then cards seen in earlier games → then, only when
 * the packs hold fewer cards than the game has rounds, tonight's again. Returns null only on an empty
 * deck. The round records the level actually dealt (card.level); the UI shows that, not the level asked for.
 */
export function pickCard(cards: Card[], opts: PickOptions, rng: Rng): Card | null {
  const inScope = cards.filter((c) => (opts.packs.length === 0 || opts.packs.includes(c.pack)) && (opts.allowAdult || !c.adult));
  if (inScope.length === 0) return null;
  const used = new Set(opts.used);
  const tonight = new Set(opts.tonight ?? []);
  const levelsByDistance: Level[] = ([1, 2, 3] as Level[]).sort((a, b) => Math.abs(a - opts.level) - Math.abs(b - opts.level));
  const passes: ((c: Card) => boolean)[] = [(c) => !used.has(c.id) && !tonight.has(c.id), (c) => !tonight.has(c.id), () => true];
  for (const allowed of passes) {
    for (const lvl of levelsByDistance) {
      const pool = inScope.filter((c) => c.level === lvl && allowed(c));
      if (pool.length > 0) return rng.pick(pool);
    }
  }
  return null;
}
