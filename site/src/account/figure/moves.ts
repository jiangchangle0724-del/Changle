/**
 * The 3D figure's stand-in (Steve on Nov 13: a 3D version of the avatar, more lifelike, moving on
 * the page, poses the player picks): a Ready Player Me masculine avatar with clips from their
 * animation library moved onto it, one file (`site/public/models/figure.glb`, LICENSES.md). The
 * moves below are the clips in that file, by the names the page shows.
 *
 * Still missing from Steve's list: 睡觉, 挥刀, 照相 (the free set has none of these; 摆酷 is 秀肌肉
 * for now). A real version replaces the figure with the player's own and takes its moves from
 * Mixamo or our own capture.
 */
export const MODEL = "/models/figure.glb";

export type MoveId = (typeof MOVES)[number]["id"];

export const MOVES = [
  { id: "stand", zh: "站着", en: "Stand" },
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
] as const;
