/**
 * The big screen's dancer, in the site's own files (made by site/scripts/dj-dancer/, README.md there): her
 * body, each hairstyle, each outfit. The outfits here are the ones the build makes (its outfits.mjs,
 * the same ids, checked by tests/dancer.test.ts); a song picks one by its id, so the TV and anyone
 * looking agree, and the next song brings the next look.
 */
export const DANCER_DIR = "/models/dancer";
export const bodyFile = () => `${DANCER_DIR}/body.glb.gz`;
export const hairFile = (h: string) => `${DANCER_DIR}/hair/${h}.glb.gz`;
export const outfitFile = (id: string) => `${DANCER_DIR}/outfit/${id}.glb.gz`;

import type { Mood } from "../../../shared/dj/dance";

/** Steve on Nov 14: 夜店性感, 优雅保守, 休闲运动, 节日主题, and bikinis */
export type Style = "club" | "elegant" | "sport" | "party" | "bikini";

export const OUTFITS: readonly { id: string; style: Style; zh: string; en: string }[] = [
  { id: "sport", style: "sport", zh: "运动", en: "Sporty" },
  { id: "casual", style: "sport", zh: "休闲", en: "Casual" },
  { id: "bikini_red", style: "bikini", zh: "红色比基尼", en: "Red bikini" },
  { id: "bikini_tropic", style: "bikini", zh: "热带花比基尼", en: "Tropical bikini" },
  { id: "swim_black", style: "bikini", zh: "黑色连体泳衣", en: "Black swimsuit" },
  { id: "club_sequin", style: "club", zh: "亮片连体衣", en: "Sequin bodysuit" },
  { id: "club_leather", style: "club", zh: "皮短裤露脐装", en: "Leather and boots" },
  { id: "elegant_office", style: "elegant", zh: "白衬衫铅笔裙", en: "Blouse and pencil skirt" },
  { id: "qipao_blue", style: "elegant", zh: "青花旗袍", en: "Blue and white qipao" },
  { id: "qipao_red", style: "party", zh: "红色旗袍", en: "Red qipao" },
  { id: "santa", style: "party", zh: "圣诞女郎", en: "Santa" },
];

/**
 * The looks for the night's stretch (dance.ts's moods): settling in casual or elegant, the build
 * party and club, the peak club and swimwear, winding down elegant again; a slow song elegant.
 */
export const STYLES_FOR: Record<Mood, readonly Style[]> = {
  warm: ["sport", "elegant", "party"],
  build: ["club", "party", "sport", "bikini"],
  peak: ["club", "bikini", "party"],
  cool: ["elegant", "sport", "party"],
  slow: ["elegant", "party"],
};

/**
 * A song's outfit: the same for everyone from its id (a hash), from the looks for the night's
 * stretch, never the one just worn if it can help it.
 */
export function outfitFor(song: string | null | undefined, last: string | null = null, mood: Mood = "build"): string {
  if (!song) return OUTFITS[0].id;
  let h = 2166136261;
  for (let i = 0; i < song.length; i++) h = Math.imul(h ^ song.charCodeAt(i), 16777619);
  const styles = STYLES_FOR[mood] ?? STYLES_FOR.build;
  const pool = OUTFITS.filter((o) => styles.includes(o.style) && o.id !== last);
  const list = pool.length ? pool : OUTFITS.filter((o) => o.id !== last);
  return list[(h >>> 0) % list.length].id;
}
