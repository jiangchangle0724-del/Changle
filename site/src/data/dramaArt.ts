/**
 * 戏精大赏 · the pictures drawn after the first set (`site/public/drama/`). The first set (the six
 * kinds, the duel, the empty stage, the curtain, the cards, the masks, the trophy) is always there;
 * these are added one at a time, by the Codex card in `docs/codex-tasks/drama/`, each name here
 * with its file. A name that isn't here isn't asked for: the backdrop falls back to the scene's
 * kind, or the empty stage, without a failed download.
 *
 * - `classic`: the film set, for a famous scene
 * - `group-cn`, `group-ca`, `group-sa`, `group-ph`, `group-kr`, `group-jp`, `group-ir`, `group-eu`:
 *   a scene set in that community's everyday life
 */
export const DRAWN_ART: ReadonlySet<string> = new Set<string>([]);
