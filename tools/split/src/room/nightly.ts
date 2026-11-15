// When the nightly checks run (src/server/worker.ts): a ledger's, which lets go of files no expense
// has used for UNUSED_DAYS (src/room/ledger.ts), and an account's, which makes what it is charged
// what the ledgers really keep (src/room/account.ts). In the small hours on the coast, each a few
// minutes apart, so they don't all wake at once.

const DAY_MS = 86_400_000;
/** 10:00 UTC: 2 a.m. in Vancouver in winter, 3 a.m. in summer. */
const HOUR_UTC = 10;

/** The next night for this name (a ledger's id, or an account's): a minute of its own in the hour, from its name. */
export function nextNight(name: string, now: number): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const d = new Date(now);
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), HOUR_UTC, h % 60);
  // (tonight's minute already gone, or just now: tomorrow's)
  return at > now + 60_000 ? at : at + DAY_MS;
}
