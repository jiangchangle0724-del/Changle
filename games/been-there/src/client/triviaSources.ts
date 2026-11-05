// The quiz questions' sources, for the credits page. They live with the questions, which only the server
// holds (phones never hold the answers): the server lists them at /api/trivia-sources. The one-phone
// demo, which runs the room in the page, hands them over itself.
import { api } from "./net";

/** Each city's sources, in board order. */
export type TriviaSources = { city: string; sources: string[] }[];

let known: TriviaSources | null = null;

export const setTriviaSources = (list: TriviaSources) => {
  known = list;
};

export const knownTriviaSources = () => known;

/** The list, asking the server the first time; null if it can't be had (offline). */
export async function loadTriviaSources(): Promise<TriviaSources | null> {
  if (known) return known;
  const res = await api<{ cities?: TriviaSources }>("/api/trivia-sources");
  if (res.ok && Array.isArray(res.data.cities)) known = res.data.cities.filter((x) => typeof x?.city === "string" && Array.isArray(x.sources));
  return known;
}
