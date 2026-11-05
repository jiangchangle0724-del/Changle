import type { T } from "../../i18n";

/**
 * 最后一张 · Last Card: the game's name, and the call a player makes when they are down to one card.
 * Both live here and nowhere else, so a new name is one edit: the board's registry entry, the phones,
 * the big screen and the rooms server's penalty lines all read them from this file.
 */
export const LC_NAME: T = { zh: "最后一张", en: "Last Card" };

/** What you call out at one card (it can stay as it is if the game's name changes). */
export const LC_CALL: T = { zh: "最后一张！", en: "Last card!" };
