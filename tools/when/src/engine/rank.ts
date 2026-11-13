// Who can come when, and the best three. The rule is fixed so a person can count it by hand:
//   1. A slot is out when someone who must be there isn't free for it, or when fewer than the
//      least number of people (free plus could-move-things) can come.
//   2. The rest go by how many are free; then by how many could move things; then the earlier slot.
import { parseSlot, slotsOf } from "./slots";
import type { Day, EventState, Lang, Part, Person, SlotKey } from "./types";

export type Tally = {
  slot: SlotKey;
  day: Day;
  part: Part;
  /** people's ids, in the order they joined */
  yes: string[];
  maybe: string[];
  no: string[];
  /** why it can't be picked as one of the best: a must-be-there person can't, or too few can */
  out: null | "must" | "few";
};

type Asked = Pick<EventState, "days" | "grain" | "people" | "minPeople">;

/** Every slot of the gathering, in order, with who answered what. */
export function tally(event: Asked): Tally[] {
  const must = event.people.filter((p) => p.must);
  return slotsOf(event.days, event.grain).map((slot) => {
    const { day, part } = parseSlot(slot)!;
    const yes: string[] = [];
    const maybe: string[] = [];
    const no: string[] = [];
    for (const p of event.people) (p.answers[slot] === 2 ? yes : p.answers[slot] === 1 ? maybe : no).push(p.id);
    const out = must.some((p) => p.answers[slot] === undefined) ? "must" : yes.length + maybe.length < event.minPeople ? "few" : null;
    return { slot, day, part, yes, maybe, no, out };
  });
}

/** The best `n` slots, best first. A slot nobody can make is never one of them. */
export function best(tallies: readonly Tally[], n = 3): Tally[] {
  return tallies
    .map((t, order) => ({ t, order }))
    .filter(({ t }) => t.out === null && t.yes.length + t.maybe.length > 0)
    .sort((a, b) => b.t.yes.length - a.t.yes.length || b.t.maybe.length - a.t.maybe.length || a.order - b.order)
    .slice(0, n)
    .map(({ t }) => t);
}

/** Why a slot is where it is: "8 个人里 7 个有空，阿May 可以调" / "7 of 8 free, May could move things". */
export function reason(t: Tally, people: readonly Person[], lang: Lang): string {
  const total = people.length;
  const names = t.maybe.map((id) => people.find((p) => p.id === id)?.name ?? "").filter(Boolean);
  if (lang === "zh") {
    const head = `${total} 个人里 ${t.yes.length} 个有空`;
    if (!names.length) return head;
    return names.length <= 3 ? `${head}，${names.join("、")} 可以调` : `${head}，${names.length} 个可以调`;
  }
  const head = `${t.yes.length} of ${total} free`;
  if (!names.length) return head;
  return names.length <= 3 ? `${head}, ${names.join(", ")} could move things` : `${head}, ${names.length} could move things`;
}
