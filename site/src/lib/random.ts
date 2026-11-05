export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** A deck that deals without repeats and reshuffles when empty. */
export class Deck<T> {
  private cards: T[] = [];
  private used: T[] = [];
  constructor(private readonly source: readonly T[]) {
    this.cards = shuffle(source);
  }
  get remaining() {
    return this.cards.length;
  }
  get total() {
    return this.source.length;
  }
  draw(): { card: T; reshuffled: boolean } {
    let reshuffled = false;
    if (this.cards.length === 0) {
      this.cards = shuffle(this.source);
      this.used = [];
      reshuffled = true;
    }
    const card = this.cards.pop() as T;
    this.used.push(card);
    return { card, reshuffled };
  }
  reset() {
    this.cards = shuffle(this.source);
    this.used = [];
  }
  /** What a game keeps to deal on after a reload: the cards still to come, as places in the source. */
  keep(): number[] {
    return this.cards.map((c) => this.source.indexOf(c)).filter((i) => i >= 0);
  }
  /** Deal on from what keep() gave; places no longer in the source are dropped (empty: a fresh shuffle). */
  restore(kept: readonly number[]) {
    const cards = kept.map((i) => this.source[i]).filter((c): c is T => c !== undefined);
    if (!cards.length) return;
    this.cards = cards;
    this.used = this.source.filter((c) => !cards.includes(c));
  }
}
