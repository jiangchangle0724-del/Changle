// An item the merchant gets only by the case (Foodsoft's "unit quantity"): the orders fill cases
// together, and everyone can see how much the case being filled still wants. What happens to a case
// that isn't full when the group buy closes is the merchant's call: nothing here cancels anything.

/** How far `held` (what orders hold, in thousandths of the unit) fills cases of `size`. */
export interface CaseFill {
  size: number;
  /** cases filled to the brim */
  full: number;
  /** in the case being filled */
  part: number;
  /** what the case being filled still wants: a whole case when nothing is ordered, none when the last one is just full */
  short: number;
}

export function caseFill(size: number, held: number): CaseFill {
  const full = Math.floor(held / size);
  const part = held - full * size;
  return { size, full, part, short: held > 0 && part === 0 ? 0 : size - part };
}
