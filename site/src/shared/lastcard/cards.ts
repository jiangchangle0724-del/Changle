import type { T } from "../../i18n";

/**
 * 最后一张 · Last Card's 108 cards and the one rule for what may be played on what. Shared by the
 * rooms server (shared/engine/games/lastcard.ts), the phones and the big screen.
 *
 * A card is a number from 0 to 107, so two red 7s are still two different cards. The ids run colour
 * by colour (red, yellow, green, blue), each as 0, 1 1, 2 2 ... 9 9, skip skip, reverse reverse,
 * +2 +2; then the four wilds and the four +4 wilds. Sorting a hand by id sorts it by colour, then
 * by number, with the wilds last.
 */

export type LcColor = "r" | "y" | "g" | "b";
export type LcKind = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "skip" | "rev" | "d2" | "wild" | "d4";
/** `c` is null for the two wild kinds: they take whatever colour their player picks */
export type LcFace = { c: LcColor | null; k: LcKind };
/** a draw stack waiting on the player whose turn it is (stacking on): only the same kind answers it */
export type LcPending = "d2" | "d4" | null;

export const LC_COLORS: readonly LcColor[] = ["r", "y", "g", "b"];
const NUMBERS: readonly LcKind[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const ACTIONS: readonly LcKind[] = ["skip", "rev", "d2"];

function build(): LcFace[] {
  const out: LcFace[] = [];
  for (const c of LC_COLORS) {
    out.push({ c, k: "0" });
    for (const k of NUMBERS) out.push({ c, k }, { c, k });
    for (const k of ACTIONS) out.push({ c, k }, { c, k });
  }
  for (let i = 0; i < 4; i++) out.push({ c: null, k: "wild" });
  for (let i = 0; i < 4; i++) out.push({ c: null, k: "d4" });
  return out;
}

/** every card's face, by id */
export const FACES: readonly LcFace[] = build();
export const DECK_SIZE = FACES.length;

export const faceOf = (id: number): LcFace => FACES[id];
/** The first card with this face (its twin, when there is one, is the next id). */
export const cardOf = (c: LcColor | null, k: LcKind) => FACES.findIndex((f) => f.c === c && f.k === k);
export const isCard = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id >= 0 && id < DECK_SIZE;
export const isColor = (c: unknown): c is LcColor => LC_COLORS.includes(c as LcColor);
export const isWild = (id: number) => FACES[id].c === null;
export const isNumberCard = (id: number) => /^[0-9]$/.test(FACES[id].k);

/** How many cards a kind makes the next player draw: +2 and +4. */
export const drawOf = (k: LcKind) => (k === "d2" ? 2 : k === "d4" ? 4 : 0);

/**
 * Whether card `id` may go on `top` while `color` is the colour in force: the same colour, the same
 * number or symbol, or a wild (any time). With a draw stack waiting, only another of that kind.
 */
export function canPlay(id: number, top: number | null, color: LcColor | null, pending: LcPending = null): boolean {
  const f = FACES[id];
  if (!f) return false;
  if (pending) return f.k === pending;
  if (f.c === null || top === null) return true;
  return f.c === color || f.k === FACES[top].k;
}

/** A hand in the order it's held: by colour, then number, wilds last. */
export const sortHand = (ids: readonly number[]) => ids.slice().sort((a, b) => a - b);

/* ---------- words ---------- */

const t = (zh: string, en: string): T => ({ zh, en });

export const COLOR_NAME: Record<LcColor, T> = { r: t("红", "Red"), y: t("黄", "Yellow"), g: t("绿", "Green"), b: t("蓝", "Blue") };

const KIND_NAME: Partial<Record<LcKind, T>> = { skip: t("跳过", "Skip"), rev: t("反转", "Reverse"), d2: t("+2", "+2"), wild: t("变色", "Wild"), d4: t("+4 变色", "+4 Wild") };

/** A card's name, as a screen reader and the table's running commentary say it: 红 7, Blue Skip, +4 Wild. */
export function cardName(id: number): T {
  const f = FACES[id];
  const kind = KIND_NAME[f.k] ?? t(f.k, f.k);
  if (f.c === null) return kind;
  const c = COLOR_NAME[f.c];
  return t(`${c.zh} ${kind.zh}`, `${c.en} ${kind.en}`);
}
