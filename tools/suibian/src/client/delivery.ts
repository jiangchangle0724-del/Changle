// Ordering in instead: links that open one place in a delivery app. Uber Eats and DoorDash take a
// search in the link; SkipTheDishes and 饭团 Fantuan have none (both ask for an address first), so
// the card copies the name and opens their site, where it can be pasted into the search. Only the
// name goes to them, only when someone taps, and without our address as the referrer.
import type { Text } from "../engine";

export interface DeliveryApp {
  id: "ubereats" | "doordash" | "fantuan" | "skip";
  label: Text;
  /** Where the link goes for this place. */
  href: (name: string) => string;
  /** No search link: tapping copies this first, to paste into the app's search. */
  copy?: (name: string) => string;
}

/** Chinese, Japanese and Korean characters, and their punctuation and full-width forms. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]+/gu;
const EDGE = /^[\s\-–—·|,.:;/]+|[\s\-–—·|,.:;/]+$/g;

/**
 * What to search a delivery app for. Google often gives both scripts ("金閣海鮮酒家 Golden Paramount
 * Seafood Restaurant") and a branch in brackets ("鼎泰豐 (Richmond)"); the apps here list places by
 * their English name, so that part is used when there is one, else the name without the bracket.
 */
export function searchName(name: string): string {
  const base = name.replace(/[(（][^)）]*[)）]/g, " ").replace(/\s+/g, " ").trim() || name.trim();
  const latin = base.replace(CJK, " ").replace(/\s+/g, " ").replace(EDGE, "").trim();
  return /\p{Script=Latin}{2}/u.test(latin) ? latin : base;
}

export const DELIVERY_APPS: DeliveryApp[] = [
  { id: "ubereats", label: { zh: "Uber Eats", en: "Uber Eats" }, href: (n) => `https://www.ubereats.com/search?q=${encodeURIComponent(searchName(n))}` },
  // A path segment: a "/" in the name would read as another level.
  { id: "doordash", label: { zh: "DoorDash", en: "DoorDash" }, href: (n) => `https://www.doordash.com/en-CA/search/store/${encodeURIComponent(searchName(n).replace(/\s*\/\s*/g, " "))}` },
  { id: "fantuan", label: { zh: "饭团", en: "Fantuan" }, href: () => "https://www.fantuanorder.com/", copy: searchName },
  { id: "skip", label: { zh: "Skip", en: "Skip" }, href: () => "https://www.skipthedishes.com/", copy: searchName },
];
