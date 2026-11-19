// The line at the top of a gathering's page: who else has it open right now (谁在看).
import type { Here, Lang, Person } from "./types";

/** At most this many are named; the rest are counted. */
const NAMED = 3;

/**
 * Who else has the page open, in a few words: "阿May、小王 也在看", "May and Wang are here too".
 * People with a row go by their name, a host's phone without one as 发起人 / the host, and the
 * rest are counted. A row the page doesn't have yet is counted with the rest.
 */
export function hereLine(here: Here, people: readonly Person[], lang: Lang): string {
  const names = here.ids.map((id) => people.find((p) => p.id === id)?.name).filter((name): name is string => !!name);
  const unnamed = here.others + (here.ids.length - names.length);
  const host = lang === "zh" ? "发起人" : "the host";
  const named = [...(here.host ? [host] : []), ...names];
  const total = named.length + unnamed;

  if (lang === "zh") {
    if (total === 0) return "现在只有你在看";
    if (named.length === 0) return `还有 ${unnamed} 个人在看`;
    if (named.length > NAMED) return `${named.slice(0, NAMED).join("、")} 等 ${total} 个人也在看`;
    // a name is set off by a space, as in reason(); 发起人 is a word of the sentence
    const list = `${named.join("、")}${named.length === 1 && here.host ? "" : " "}`;
    return unnamed ? `${list}和另外 ${unnamed} 个人也在看` : `${list}也在看`;
  }
  const start = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  if (total === 0) return "Just you here right now";
  if (named.length === 0) return unnamed === 1 ? "1 other person is here" : `${unnamed} other people are here`;
  const shown = named.slice(0, NAMED);
  const rest = total - shown.length;
  if (rest === 0) return start(`${shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`} ${shown.length === 1 ? "is" : "are"} here too`);
  return start(`${shown.join(", ")} and ${rest} other${rest === 1 ? "" : "s"} are here too`);
}
