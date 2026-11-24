/**
 * The owner's edits to the site's words (Steve 2026-11-21): signed in as the master account, he
 * long-presses any text and changes it, for everyone, right away. Kept by the exact text they
 * replace and the page's language at the time (worker/hub.ts, table copy); swapped into the pages
 * by lib/copyPatch.ts, in both languages.
 */
export type CopyMap = { zh: Record<string, string>; en: Record<string, string> };
export type CopyEdit = { lang: "zh" | "en"; orig: string; text: string; at: number };

/** the longest piece of text one edit takes, before and after */
export const COPY_MAX = 2000;
/** how many edits the site keeps at most */
export const COPY_LIMIT = 3000;

export const emptyCopy = (): CopyMap => ({ zh: {}, en: {} });
export const copyCount = (m: CopyMap | null | undefined) => (m ? Object.keys(m.zh ?? {}).length + Object.keys(m.en ?? {}).length : 0);
