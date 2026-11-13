// Phone numbers. A buyer signs nothing: the number is how the merchant reaches them, and its last
// four digits, with the order's code, are how the buyer finds the order again.

/** The digits of a phone number as typed, or null when there are too few or too many to be one. */
export function phoneDigits(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** One buyer however the number was typed (with or without a country code): its last ten digits. */
export const phoneKey = (digits: string): string => digits.slice(-10);

/** The last four digits. */
export const tailOf = (digits: string): string => digits.slice(-4);

export const TAIL_RE = /^\d{4}$/;
