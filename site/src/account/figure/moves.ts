/**
 * The 3D figure's moves (Steve on Nov 13: a 3D version of the avatar, more lifelike, moving on the
 * page, poses the player picks: 摆酷, 照相, 睡觉, 挥刀, and more designed here).
 *
 * All written here: key poses solved onto the skeleton (`site/scripts/figure/`), baked into each
 * figure's file (`site/public/models/figure/<sex>.glb.gz`, LICENSES.md). Some hold a prop, show
 * an effect or pull a face.
 */
import type { HairId, Sex } from "./look";

/** gzipped (FigureStage.ts unzips it): Cloudflare doesn't compress .glb, and this is a third of the size */
export const figureFile = (sex: Sex) => `/models/figure/${sex}.glb.gz`;
/** the hairstyles other than a figure's own, one file each */
export const hairFile = (hair: HairId, sex: Sex) => `/models/figure/hair/${hair}-${sex}.glb.gz`;

export type PropId = "sword" | "phone" | "beer" | "shades" | "headphones";
export type FxKind = "z" | "heart" | "note" | "tear";
/** the expressions in the files (X_…), 0 to 1 */
export type Expr = "blinkL" | "blinkR" | "squint" | "smile" | "sadMouth" | "kiss" | "browsUp" | "browsSad" | "browsDown";

export type Move = {
  id: string;
  zh: string;
  en: string;
  /** the clip that loops, if not named like the move */
  clip?: string;
  /** a clip played once first, then the loop */
  intro?: string;
  props?: readonly PropId[];
  /** little things floating off it: every so many seconds, from the head, the eyes or the right hand; only between two of the clip's times, if given */
  fx?: { kind: FxKind; every: number; from: "head" | "eyes" | "hand"; during?: readonly [number, number] };
  /** times in the clip when the phone's flash goes */
  flash?: readonly number[];
  /** the sword leaves a streak */
  trail?: boolean;
  /** the face it pulls (it still blinks, unless its eyes are shut); during the intro, `introFace` */
  face?: Partial<Record<Expr, number>>;
  introFace?: Partial<Record<Expr, number>>;
};

export const MOVES = [
  { id: "stand", zh: "站着", en: "Stand", face: { smile: 0.08 } },
  // the four Steve named
  { id: "cool", zh: "摆酷", en: "Cool", props: ["shades"], face: { browsDown: 0.3, smile: 0.2 } },
  { id: "photo", zh: "照相", en: "Selfie", props: ["phone"], flash: [1.45, 3.65], face: { smile: 0.85, squint: 0.3 } },
  { id: "sleep", zh: "睡觉", en: "Sleep", intro: "sleep_in", fx: { kind: "z", every: 1.1, from: "head" }, face: { blinkL: 1, blinkR: 1, smile: 0.1 }, introFace: { browsUp: 0.5, squint: 0.6 } },
  { id: "sword", zh: "挥刀", en: "Sword", props: ["sword"], trail: true, face: { browsDown: 0.75, squint: 0.25 } },
  // for the party games
  { id: "toast", zh: "干杯", en: "Cheers", props: ["beer"], face: { smile: 0.8, squint: 0.2 } },
  { id: "heart", zh: "比心", en: "Heart", fx: { kind: "heart", every: 0.45, from: "head" }, face: { smile: 0.9, squint: 0.35, browsUp: 0.2 } },
  { id: "dj", zh: "打碟", en: "DJ", props: ["headphones"], fx: { kind: "note", every: 0.5, from: "hand" }, face: { smile: 0.4 } },
  { id: "cry", zh: "大哭", en: "Cry", fx: { kind: "tear", every: 0.09, from: "eyes" }, face: { browsSad: 1, sadMouth: 0.9, squint: 0.7 } },
  { id: "fist", zh: "抱拳", en: "Fist salute", face: { browsDown: 0.15, smile: 0.25 } },
] as const satisfies readonly Move[];

export type MoveId = (typeof MOVES)[number]["id"];

export const moveOf = (id: string): Move => (MOVES as readonly Move[]).find((m) => m.id === id) ?? MOVES[0];
