// Who has just filled in (有人填完): someone else's answers changed, and then stayed as they were for
// a moment. The top of the page says so for a few seconds (ui/Here.tsx).
import type { Person } from "../engine/types";

/** After someone's last change, this long without another and they're done. */
export const QUIET_MS = 3000;
/** The same person done again within this long is still the same filling in: it is said once. */
export const AGAIN_MS = 90_000;

/** `first`: they had nothing filled in before (填好了); otherwise they changed what they had (改了时间). */
export type Finish = { id: string; name: string; first: boolean };
export type Clock = { now(): number; after(ms: number, run: () => void): unknown; cancel(timer: unknown): void };
const realClock: Clock = { now: () => Date.now(), after: (ms, run) => setTimeout(run, ms), cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };

/** Someone's answers and times, the same however their slots happen to be ordered. */
const sign = (p: Person) =>
  Object.keys(p.answers)
    .sort()
    .map((slot) => `${slot}=${p.answers[slot]}${p.times?.[slot] ? `@${p.times[slot].join("-")}` : ""}`)
    .join(" ");

export class Finished {
  /** each row's answers as last seen; null before the first look */
  private seen: Map<string, string> | null = null;
  private people: readonly Person[] = [];
  /** the rows changing right now: whether it's their first filling in, and the wait for them to stop */
  private filling = new Map<string, { first: boolean; timer: unknown }>();
  /** when each was last said to be done */
  private said = new Map<string, number>();

  constructor(
    private say: (finish: Finish) => void,
    private clock: Clock = realClock,
  ) {}

  /** The people as the server has them now. `skip`: the rows this phone fills in itself (its own, one it fills in for someone). */
  look(people: readonly Person[], skip: readonly (string | null | undefined)[]): void {
    const before = this.seen;
    const now = new Map(people.map((p) => [p.id, sign(p)]));
    this.seen = now;
    this.people = people;
    // the first look: nothing has just happened
    if (!before) return;
    for (const p of people) {
      const was = before.get(p.id);
      if (skip.includes(p.id) || was === now.get(p.id)) continue;
      const going = this.filling.get(p.id);
      if (going) this.clock.cancel(going.timer);
      this.filling.set(p.id, { first: going ? going.first : !was, timer: this.clock.after(QUIET_MS, () => this.done(p.id)) });
    }
  }

  private done(id: string): void {
    const going = this.filling.get(id);
    this.filling.delete(id);
    const p = this.people.find((x) => x.id === id);
    // removed, or everything taken back: nothing to say
    if (!going || !p || Object.keys(p.answers).length === 0) return;
    const now = this.clock.now();
    const last = this.said.get(id);
    if (last !== undefined && now - last < AGAIN_MS) return;
    this.said.set(id, now);
    this.say({ id, name: p.name, first: going.first });
  }

  stop(): void {
    for (const { timer } of this.filling.values()) this.clock.cancel(timer);
    this.filling.clear();
  }
}
