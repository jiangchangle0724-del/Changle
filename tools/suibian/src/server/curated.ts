// Things we add to Google's places by hand: the Greater Vancouver lists a place is on
// (src/data/lists.json) and Steve's own picks with food-blogger links (src/data/picks.json).
// Matched by name, and by street number when the entry gives an address (branches share names).
// Google often shows two names at once ("Sea Harbour Seafood Restaurant 海港酒家") and puts a unit
// before the street number ("150-8888 River Rd"); both still match an entry that has an address.
import type { Badge, Recommend, RecommendLink, Text } from "../engine";
import listsData from "../data/lists.json";
import picksData from "../data/picks.json";

export interface ListAward {
  source: string;
  label: Text;
  year?: number;
  url?: string;
}

interface Entry {
  name: string;
  aliases?: string[];
  /** Street address ("3593 Main St"); only its number is compared. */
  address?: string;
  city?: string;
}

export interface ListEntry extends Entry {
  awards: ListAward[];
}

export interface PickEntry extends Entry {
  note: Text;
  by?: string;
  links?: RecommendLink[];
}

export interface ListsFile {
  updated: string;
  sources: Record<string, Text & { url: string }>;
  places: ListEntry[];
}

export interface PicksFile {
  updated: string;
  places: PickEntry[];
}

/** A name as compared: no accents, case, punctuation, branch suffix (" - Robson St") or filler words. */
export function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+[-–—|·•]\s+.*$/, "")
    .replace(/\s*[(（[].*$/, "")
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(the|restaurant|restaurants|ltd|inc|vancouver)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const streetNumber = (address?: string) => address?.match(/\d+/)?.[0];
/** Every number in an address from Google: a unit can come before the street number. */
const numbers = (address?: string): string[] => [...(address?.match(/\d+/g) ?? [])];

const CJK_ONLY = /^[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]{2,}$/u;

/** A listed name inside Google's name: as whole words, or for a Chinese name, as its characters. */
function within(google: string, listed: string): boolean {
  return ` ${google} `.includes(` ${listed} `) || (CJK_ONLY.test(listed) && google.includes(listed));
}

function index<E extends Entry>(entries: E[]): Map<string, E[]> {
  const m = new Map<string, E[]>();
  for (const e of entries) {
    for (const n of [e.name, ...(e.aliases ?? [])]) {
      const k = normName(n);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
  }
  return m;
}

function find<E extends Entry>(idx: Map<string, E[]>, name: string, address?: string): E | undefined {
  const g = normName(name);
  const nums = numbers(address);
  const atNumber = (e: E) => !!e.address && nums.includes(streetNumber(e.address)!);
  // An entry with an address only matches the branch at that street number.
  const exact = idx.get(g)?.find((e) => !e.address || !nums.length || atNumber(e));
  if (exact || !nums.length) return exact;
  // Otherwise a listed name inside Google's longer name, for entries with an address at that number.
  for (const [k, entries] of idx) {
    if (!within(g, k)) continue;
    const e = entries.find(atNumber);
    if (e) return e;
  }
  return undefined;
}

const LISTS = listsData as unknown as ListsFile;
const PICKS = picksData as unknown as PicksFile;
const listIndex = index(LISTS.places);
const pickIndex = index(PICKS.places);

/** The lists and pick for one place, or nothing. Works on the data files bundled with the Worker. */
export function curatedFor(name: string, address?: string, files: { lists?: ListsFile; picks?: PicksFile } = {}): { badges?: Badge[]; recommend?: Recommend } {
  const lists = files.lists ? index(files.lists.places) : listIndex;
  const picks = files.picks ? index(files.picks.places) : pickIndex;
  const out: { badges?: Badge[]; recommend?: Recommend } = {};
  const l = find(lists, name, address);
  if (l?.awards.length) {
    out.badges = [...l.awards]
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
      .slice(0, 3)
      .map((a) => ({ source: a.source, label: a.label, year: a.year, url: a.url }));
  }
  const p = find(picks, name, address);
  if (p) out.recommend = { note: p.note, by: p.by, links: (p.links ?? []).slice(0, 4) };
  return out;
}

// ---- checks for the data files (run by the tests, so a bad edit fails CI instead of the app) ----

const isText = (x: unknown): x is Text => !!x && typeof x === "object" && typeof (x as Text).zh === "string" && typeof (x as Text).en === "string" && !!(x as Text).zh.trim() && !!(x as Text).en.trim();
const isHttps = (x: unknown) => typeof x === "string" && /^https:\/\/[^\s]+$/.test(x);

function checkEntry(e: Entry, where: string, problems: string[]) {
  if (typeof e.name !== "string" || !e.name.trim()) problems.push(`${where}: name is missing`);
  if (e.aliases !== undefined && (!Array.isArray(e.aliases) || e.aliases.some((a) => typeof a !== "string"))) problems.push(`${where}: aliases must be a list of names`);
  if (e.address !== undefined && typeof e.address !== "string") problems.push(`${where}: address must be text`);
}

export function checkLists(data: unknown): string[] {
  const problems: string[] = [];
  const d = data as ListsFile;
  if (!d || typeof d !== "object") return ["lists.json is not an object"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.updated ?? "")) problems.push("updated must be a date like 2026-11-01");
  const sources = d.sources ?? {};
  for (const [id, s] of Object.entries(sources)) {
    if (!isText(s) || !isHttps(s.url)) problems.push(`source ${id}: needs zh, en and an https url`);
  }
  if (!Array.isArray(d.places)) return [...problems, "places must be a list"];
  const seen = new Set<string>();
  d.places.forEach((p, i) => {
    const where = `places[${i}] ${p?.name ?? ""}`.trim();
    checkEntry(p, where, problems);
    const key = `${normName(p.name ?? "")}|${streetNumber(p.address) ?? ""}`;
    if (seen.has(key)) problems.push(`${where}: listed twice`);
    seen.add(key);
    if (!Array.isArray(p.awards) || !p.awards.length) problems.push(`${where}: needs at least one award`);
    for (const a of p.awards ?? []) {
      if (!(a.source in sources)) problems.push(`${where}: unknown source "${a.source}"`);
      if (!isText(a.label)) problems.push(`${where}: award label needs zh and en`);
      if (a.year !== undefined && !(Number.isInteger(a.year) && a.year >= 2000 && a.year <= 2100)) problems.push(`${where}: year looks wrong`);
      if (!isHttps(a.url)) problems.push(`${where}: each award needs the https page that lists it`);
    }
  });
  return problems;
}

export function checkPicks(data: unknown): string[] {
  const problems: string[] = [];
  const d = data as PicksFile;
  if (!d || typeof d !== "object") return ["picks.json is not an object"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.updated ?? "")) problems.push("updated must be a date like 2026-11-01");
  if (!Array.isArray(d.places)) return [...problems, "places must be a list"];
  d.places.forEach((p, i) => {
    const where = `places[${i}] ${p?.name ?? ""}`.trim();
    checkEntry(p, where, problems);
    if (!isText(p.note)) problems.push(`${where}: note needs zh and en`);
    else if (p.note.zh.length > 60 || p.note.en.length > 140) problems.push(`${where}: keep the note to one line (zh 60, en 140 characters)`);
    for (const l of p.links ?? []) {
      if (typeof l.platform !== "string" || !l.platform.trim()) problems.push(`${where}: each link needs a platform`);
      if (!isHttps(l.url)) problems.push(`${where}: each link needs an https url`);
    }
  });
  return problems;
}

export const LISTS_FILE = LISTS;
export const PICKS_FILE = PICKS;
