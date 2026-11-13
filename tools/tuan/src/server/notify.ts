// Telling a merchant that orders have come in, by mail. The rooms server sends it (its `Mail` door,
// src/server/mail.ts), and gives this whole tool 60 mails a day, so they are spent carefully:
//   - one mail covers every order the merchant hasn't been told of yet (src/engine/notice.ts);
//   - a group buy gets at most one mail every half hour: the first order's goes at once, later
//     ones wait for the half hour to pass (the ten-minute timer in wrangler.jsonc looks for them);
//   - opening the group buy's orders counts as being told (the Worker marks them then);
//   - it goes to the first two accounts that run the shop.
// A notice that fails never fails the order: the order is in, and the merchant's page shows it.
import { BASE } from "../base";
import { NOTICE_GAP_MS, NOTICE_ORDERS_MAX, ordersNotice } from "../engine/notice";
import { bump, used } from "./gate";
import { doorOf, forGood, type Sent } from "./mail";
import { claimNotice, loadBook, mailedAt, markNoticed, membersOf, unclaimNotice, unnoticed, waitingOffers } from "./store";

/** How many of a shop's accounts get the mail. */
const RECIPIENTS_MAX = 2;
/** Group buys looked after in one run of the timer. */
const FLUSH_MAX = 20;

/** A mail went out; the half hour isn't up; nothing to tell; the day's allowance is used up; it didn't go out. */
export type Told = "sent" | "wait" | "none" | "full" | "failed";

/** Once the door says today's allowance is used up, it isn't asked again until its day (UTC) turns. */
const fullKey = (now: number): string => `mailfull:${new Date(now).toISOString().slice(0, 10)}`;

/** Tell the merchant of a group buy's new orders, if there are any and it is time. */
export async function notify(env: Env, offerId: string, now: number): Promise<Told> {
  const db = env.DB;
  if ((await used(db, fullKey(now), now)) > 0) return "full";
  const seen = await mailedAt(db, offerId);
  if (seen === null) return "none";
  if (now - seen < NOTICE_GAP_MS) return "wait";
  const book = await loadBook(db, offerId);
  if (!book) return "none";
  const fresh = await unnoticed(db, offerId, NOTICE_ORDERS_MAX);
  if (fresh.count === 0) return "none";
  const to = await membersOf(db, book.shop.id, RECIPIENTS_MAX);
  if (!to.length) return "none";
  // (two orders landing together: one of them takes the turn, the other's order is in the same mail or the next)
  if (!(await claimNotice(db, offerId, seen, now))) return "wait";

  const { subject, text } = ordersNotice(book, fresh.orders, fresh.count, fresh.standing);
  const link = `https://changle.ca${BASE}/my/t/${offerId}`;
  let sent = false;
  let full = false;
  let worthAnotherTry = false;
  for (const email of to) {
    let reply: Sent;
    try {
      reply = await doorOf(env).send({ app: "tuan", to: email, subject, text, link, lang: "zh" });
    } catch (e) {
      console.error("tuan notice", e);
      reply = { status: "failed", why: "down" };
    }
    if (reply.status === "sent") sent = true;
    else if (reply.status === "full") full = true;
    else if (!forGood(reply.why)) worthAnotherTry = true;
    if (full) break;
  }

  // told (or nobody here can ever be told by mail: the shop's accounts aren't ones the door mails)
  if (sent || (!full && !worthAnotherTry)) {
    await markNoticed(db, offerId, fresh.last);
    return sent ? "sent" : "failed";
  }
  // nothing went out and another try may: the half hour isn't spent
  await unclaimNotice(db, offerId, now, seen);
  if (full) await bump(db, fullKey(now), now);
  return full ? "full" : "failed";
}

/** The timer: every group buy with orders waiting to be told of, and no mail in the last half hour. */
export async function flush(env: Env, now: number): Promise<void> {
  if ((await used(env.DB, fullKey(now), now)) > 0) return;
  for (const offerId of await waitingOffers(env.DB, now - NOTICE_GAP_MS, FLUSH_MAX)) {
    if ((await notify(env, offerId, now)) === "full") return;
  }
}
