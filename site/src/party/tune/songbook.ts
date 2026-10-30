import { checkRow, fromRow, type Song } from "../../shared/songs";
import { loadCharts } from "./charts";

let book: Promise<Song[]> | null = null;

/** The built-in song list (loaded on demand: it's big), plus today's charts when Apple answers in time. */
export function loadSongbook(): Promise<Song[]> {
  if (!book)
    book = (async () => {
      const [{ SONG_ROWS }, charts] = await Promise.all([import("../../data/songs"), loadCharts(4000)]);
      const list = SONG_ROWS.map(fromRow);
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
