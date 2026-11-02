import { hash } from "./store";

const STOP_WORDS = new Set([
  "tickets", "ticket", "vancouver", "yvr", "the", "a", "an", "and", "at", "vs", "v",
  "with", "presents", "live", "in", "of",
]);

/** Lexicographic Unicode code point order, including letters outside the BMP. */
function compareWords(a: string, b: string): number {
  const left = Array.from(a, (c) => c.codePointAt(0)!);
  const right = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

/** Sorted unique title words used for matching across sources; the source title stays intact. */
export function normalize(title: string): string {
  const words = title.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/([\u3400-\u9FFF\uF900-\uFAFF]) +(?=[\u3400-\u9FFF\uF900-\uFAFF])/gu, "$1")
    .split(" ")
    .filter((word) => !STOP_WORDS.has(word) && !/^20[23]\d$/.test(word))
    .map((word) => word.replaceAll("温哥华", ""))
    .filter(Boolean);
  return [...new Set(words)].sort(compareWords).join(" ");
}

/** Character LCS ratio, with one row of storage for the shorter string. */
function ratio(a: string, b: string): number {
  let left = Array.from(a);
  let right = Array.from(b);
  if (left.length < right.length) [left, right] = [right, left];
  const row = new Uint32Array(right.length + 1);
  for (const character of left) {
    let diagonal = 0;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j];
      row[j] = character === right[j - 1] ? diagonal + 1 : Math.max(above, row[j - 1]);
      diagonal = above;
    }
  }
  return 2 * row[right.length] / (left.length + right.length);
}

/** Token set ratio in [0, 1]; a title with no meaningful words never matches. */
export function similarity(a: string, b: string): number {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  if (!normalizedA || !normalizedB) return 0;
  const wordsA = normalizedA.split(" ");
  const wordsB = normalizedB.split(" ");
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const common = wordsA.filter((word) => setB.has(word)).join(" ");
  const onlyA = wordsA.filter((word) => !setB.has(word)).join(" ");
  const onlyB = wordsB.filter((word) => !setA.has(word)).join(" ");
  if (common && (!onlyA || !onlyB)) return 1;
  const titleA = `${common} ${onlyA}`.trim();
  const titleB = `${common} ${onlyB}`.trim();
  const fullRatio = ratio(titleA, titleB);
  return common ? Math.max(fullRatio, ratio(common, titleA), ratio(common, titleB)) : fullRatio;
}

/** A matching title, Vancouver date (YYYY-MM-DD), and venue identify one event. */
export function fingerprint(title: string, date: string, venueId: string | null): string {
  return `fp-${hash(`${normalize(title)}|${date}|${venueId ?? ""}`)}`;
}
