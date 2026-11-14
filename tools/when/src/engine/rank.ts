// Who can come when, and the best three. The rule is fixed so a person can count it by hand:
//   1. A slot is out when someone who must be there isn't free for it, or when fewer than the
//      least number of people (free plus could-move-things) can come.
//   2. The rest go by how many are free; then by how many could move things; then the earlier slot.
// By the period, a slot's people are those who suit its best stretch (minutes.ts: half an hour or
// more that suits the most), so someone free only before seven and someone free only after eight
// don't count as meeting on the same evening; the stretch is one everyone who must be there can
// make. A best stretch that is the whole period says no more than the slot does: such a slot
// counts as it always has, everyone who answered it.
import { covering, entriesOf, isWhole, meet, type Meet } from "./minutes";
import { parseSlot, partRange, slotsOf } from "./slots";
import type { Day, EventState, Lang, Part, Person, SlotKey } from "./types";

export type Tally = {
  slot: SlotKey;
  day: Day;
  part: Part;
  /** people's ids, in the order they joined: everyone who answered it, whatever part of it they gave */
  yes: string[];
  maybe: string[];
  no: string[];
  /** by the period: the stretch of it that suits the most people, and who it suits (what the best three go by); null when that's all of it, or not by the period */
  meet: Meet | null;
  /** why it can't be picked as one of the best: a must-be-there person can't, or too few can */
  out: null | "must" | "few";
};

type Asked = Pick<EventState, "days" | "grain" | "people" | "minPeople">;

/** Every slot of the gathering, in order, with who answered what. */
export function tally(event: Asked): Tally[] {
  const must = event.people.filter((p) => p.must);
  const mustIds = must.map((p) => p.id);
  return slotsOf(event.days, event.grain).map((slot) => {
    const { day, part } = parseSlot(slot)!;
    const yes: string[] = [];
    const maybe: string[] = [];
    const no: string[] = [];
    for (const p of event.people) (p.answers[slot] === 2 ? yes : p.answers[slot] === 1 ? maybe : no).push(p.id);
    const range = partRange(event.grain, part);
    const best = range ? meet(range, entriesOf(event.people, slot, range), mustIds) : null;
    // by the period, someone who must be there and answered but shares no half hour with the others who must
    const apart = !!range && !best && mustIds.length > 0 && yes.length + maybe.length > 0;
    const narrower = best && range && !isWhole([best.from, best.to], range) ? best : null;
    const t: Tally = { slot, day, part, yes, maybe, no, meet: narrower, out: null };
    return { ...t, out: apart ? "must" : outOf(t, must, event.minPeople) };
  });
}

/** Who counts for a slot: who suits its best stretch by the period, everyone who answered it otherwise. */
export const counted = (t: Tally): { yes: string[]; maybe: string[] } => t.meet ?? t;

function outOf(t: Tally, must: readonly Person[], minPeople: number): Tally["out"] {
  const { yes, maybe } = counted(t);
  if (must.some((p) => !yes.includes(p.id) && !maybe.includes(p.id))) return "must";
  return yes.length + maybe.length < minPeople ? "few" : null;
}

/**
 * A slot at a set time of it (the time the host set): who is free, and who could move things, for
 * all of it. Without minutes, or for the whole period, the slot as everyone answered it.
 */
export function atTime(t: Tally, people: readonly Person[], grain: EventState["grain"], from?: number, to?: number): Tally {
  const range = partRange(grain, t.part);
  if (!range) return t;
  if (from === undefined || to === undefined || isWhole([from, to], range)) return { ...t, meet: null };
  return { ...t, meet: { ...covering(entriesOf(people, t.slot, range), from, to), from, to } };
}

/** The best `n` slots, best first. A slot nobody can make is never one of them. */
export function best(tallies: readonly Tally[], n = 3): Tally[] {
  return tallies
    .map((t, order) => ({ t, order }))
    .filter(({ t }) => t.out === null && counted(t).yes.length + counted(t).maybe.length > 0)
    .sort((a, b) => counted(b.t).yes.length - counted(a.t).yes.length || counted(b.t).maybe.length - counted(a.t).maybe.length || a.order - b.order)
    .slice(0, n)
    .map(({ t }) => t);
}

/** Why a slot is where it is: "8 个人里 7 个有空，阿May 可以调" / "7 of 8 free, May could move things". */
export function reason(t: Tally, people: readonly Person[], lang: Lang): string {
  const total = people.length;
  const { yes, maybe } = counted(t);
  const names = maybe.map((id) => people.find((p) => p.id === id)?.name ?? "").filter(Boolean);
  if (lang === "zh") {
    const head = `${total} 个人里 ${yes.length} 个有空`;
    if (!names.length) return head;
    return names.length <= 3 ? `${head}，${names.join("、")} 可以调` : `${head}，${names.length} 个可以调`;
  }
  const head = `${yes.length} of ${total} free`;
  if (!names.length) return head;
  return names.length <= 3 ? `${head}, ${names.join(", ")} could move things` : `${head}, ${names.length} could move things`;
}
