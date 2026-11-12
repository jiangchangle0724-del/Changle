import { checkRow, fromRow, type Song } from "../../shared/songs";
import { loadCharts } from "./charts";

let book: Promise<Song[]> | null = null;
/** how many of the book's songs are the built-in list's (today's charts come after them) */
let built = 0;

/** The built-in song list (loaded on demand: it's big), plus today's charts when Apple answers in time. */
export function loadSongbook(): Promise<Song[]> {
  if (!book)
    book = (async () => {
      const [{ SONG_ROWS }, charts] = await Promise.all([import("../../data/songs"), loadCharts(4000)]);
      const list = SONG_ROWS.map(fromRow);
      built = list.length;
      const ids = new Set(list.map((s) => s.id));
      for (const r of charts.slice(0, 1000)) {
        const s = checkRow(r);
        if (s && !ids.has(s.id)) {
          ids.add(s.id);
          list.push(s);
        }
      }
      return list;
    })().catch((e) => {
      book = null;
      throw e;
    });
  return book;
}

/**
 * The built-in songs alone, without today's charts: every phone has the same ones, so a challenge's
 * songs and its four titles come from these (a phone tomorrow won't have today's charts).
 */
export const builtIn = (book: Song[]) => book.slice(0, built || book.length);
