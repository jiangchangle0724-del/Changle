import { SPECIALS } from "../../data/songPools";

/** A singer special: [the folded name (the pool is "@" and this), the name shown, in English ("" = the same), language, songs] */
export type Special = (typeof SPECIALS)[number];
const BY_KEY = new Map<string, Special>(SPECIALS.map((s) => [s[0], s]));

/** A singer special by its singer, or null when the list has no such singer. */
export const specialBy = (singer: string): Special | null => BY_KEY.get(singer) ?? null;
/** A singer special's name, as the table reads it. */
export const specialName = (s: Special, zh: boolean) => (zh || !s[2] ? s[1] : s[2]);
