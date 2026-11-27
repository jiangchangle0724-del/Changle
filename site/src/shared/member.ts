/**
 * Membership (docs/membership.md; Steve approved the plan 2026-11-26). Shared by the site, the
 * rooms server (worker/membership.ts) and, through the `Member` door, the tools' Workers.
 *
 * Three tools count: each account gets FREE_USES of each, then a member uses them without limit.
 * 玩什么 stays free and counts nothing; MoneyLens counts nothing while it is an invited beta
 * (the app simply doesn't ask yet). Becoming a 跟一单 merchant needs a membership.
 */
export const COUNTED = ["suibian", "split", "moneylens"] as const;
export type Counted = (typeof COUNTED)[number];
export const isCounted = (t: unknown): t is Counted => typeof t === "string" && (COUNTED as readonly string[]).includes(t);

/** free uses of each counted tool, per account, for good (not each month) */
export const FREE_USES = 3;
/** lifetime memberships ever sold */
export const LIFE_SLOTS = 5;
/** Canadian dollars */
export const PRICES = { month: 5.2, year: 52, life: 520 } as const;

/** month / year: paid and renewing (Stripe, step 2); life: paid once; gift: given by the owner, for a set time */
export type Tier = "month" | "year" | "life" | "gift";
/** `until`: when it ends (ms); null for a lifetime one */
export type Membership = { tier: Tier; until: number | null; since: number };
/** what an account has: a membership or not, whether it's the owner's, and its free uses left */
export type Standing = { member: Membership | null; master: boolean; left: Record<Counted, number> };
/** one use asked for: `ok` = go ahead (and it was counted, unless a member's); `left` = free uses left after it (null for a member) */
export type UseResult = { ok: boolean; member: boolean; left: number | null };
