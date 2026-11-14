/**
 * The 3D figure's moves (Steve on Nov 13: a 3D version of the avatar, more lifelike, moving on the
 * page, poses the player picks: 摆酷, 照相, 睡觉, 挥刀, and more designed here).
 *
 * Two kinds, all clips in one file (`site/public/models/figure.glb.gz`, LICENSES.md):
 * - `own`: written here, key poses solved onto the skeleton (`site/scripts/figure/`), so they
 *   carry over to any figure with the same bone names. Some hold a prop or show an effect.
 * - the rest: from Ready Player Me's animation library, licensed with their avatars only; they go
 *   when the stand-in does.
 */
/** gzipped (FigureStage.ts unzips it): Cloudflare doesn't compress .glb, and this is a third of the size */
export const MODEL = "/models/figure.glb.gz";

export type PropId = "sword" | "phone" | "beer" | "shades" | "headphones";
export type FxKind = "z" | "heart" | "note" | "tear";

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
  own?: true;
};

export const MOVES = [
  { id: "stand", zh: "站着", en: "Stand" },
  // the four Steve named
  { id: "cool", zh: "摆酷", en: "Cool", props: ["shades"], own: true },
  { id: "photo", zh: "照相", en: "Selfie", props: ["phone"], flash: [1.45, 3.65], own: true },
  { id: "sleep", zh: "睡觉", en: "Sleep", intro: "sleep_in", fx: { kind: "z", every: 1.1, from: "head" }, own: true },
  { id: "sword", zh: "挥刀", en: "Sword", props: ["sword"], trail: true, own: true },
  // for the party games
  { id: "toast", zh: "干杯", en: "Cheers", props: ["beer"], own: true },
  { id: "heart", zh: "比心", en: "Heart", fx: { kind: "heart", every: 0.45, from: "head" }, own: true },
  { id: "dj", zh: "打碟", en: "DJ", props: ["headphones"], fx: { kind: "note", every: 0.5, from: "hand" }, own: true },
  { id: "cry", zh: "大哭", en: "Cry", fx: { kind: "tear", every: 0.09, from: "eyes" }, own: true },
  { id: "fist", zh: "抱拳", en: "Fist salute", own: true },
  // the stand-in's own
  { id: "wave", zh: "挥手", en: "Wave" },
  { id: "salute", zh: "敬礼", en: "Salute" },
  { id: "clap", zh: "鼓掌", en: "Clap" },
  { id: "thumbs", zh: "点赞", en: "Thumbs up" },
  { id: "cheer", zh: "欢呼", en: "Cheer" },
  { id: "bow", zh: "鞠躬", en: "Bow" },
  { id: "shrug", zh: "摊手", en: "Shrug" },
  { id: "think", zh: "思考", en: "Think" },
  { id: "lookout", zh: "眺望", en: "Look out" },
  { id: "flex", zh: "秀肌肉", en: "Flex" },
  { id: "stretch", zh: "伸懒腰", en: "Stretch" },
  { id: "watch", zh: "看表", en: "Check the time" },
  { id: "dance", zh: "跳舞", en: "Dance" },
  { id: "party", zh: "蹦迪", en: "Party" },
  { id: "walk", zh: "走路", en: "Walk" },
  { id: "run", zh: "跑步", en: "Run" },
] as const satisfies readonly Move[];

export type MoveId = (typeof MOVES)[number]["id"];

export const moveOf = (id: string): Move => (MOVES as readonly Move[]).find((m) => m.id === id) ?? MOVES[0];
