/**
 * Paying for a membership with Stripe (docs/membership.md, step 2). Stripe keeps the cards, the
 * receipts and the renewals; the hub keeps who has paid for what, and lets them in.
 *
 * - Monthly and yearly are subscriptions, bought on Stripe's own Checkout page and looked after on
 *   Stripe's billing page (the Customer Portal: change card, switch plan, cancel at the period's end).
 * - Lifetime is one payment. Only five are ever sold, so a place is held while someone pays (30
 *   minutes, as long as Checkout stays open; life_sales in membership.ts).
 * - What Stripe says happened arrives at /api/stripe/webhook, signed. Each event is acted on once,
 *   and always from the object as Stripe has it now (asked again), so events out of order do no harm.
 * - The owner's one step: the secret key in Cloudflare (STRIPE_SECRET_KEY). "设置付款" in the back
 *   office then makes the products, prices, billing page and webhook in Stripe; the webhook's signing
 *   secret is kept here and never shown (STRIPE_WEBHOOK_SECRET, when set, is used instead: local runs
 *   with `stripe listen`).
 * - A test key (sandbox) is for the owner and his admins only: nobody else sees a buy button.
 * - No tax is added yet (under the GST and BC PST thresholds). The prices include tax, so turning
 *   STRIPE_TAX on later changes nothing a member pays.
 */
import Stripe from "stripe";
import { LIFE_SLOTS, PRICES } from "../src/shared/member";
import { dropLife, endPaid, lifeLeft, memberOf, setLife, setPaid } from "./membership";

export type Mode = "test" | "live";
export type Plan = "month" | "year" | "life";
export const isPlan = (p: unknown): p is Plan => p === "month" || p === "year" || p === "life";

/** test or live from the key itself; anything else isn't a Stripe secret key */
export function modeOf(key: string | undefined): Mode | null {
  if (!key) return null;
  if (/^(sk|rk)_live_\w+$/.test(key)) return "live";
  if (/^(sk|rk)_test_\w+$/.test(key)) return "test";
  return null;
}

/** the prices, found again by these names (one product for the renewing plans, one for lifetime) */
const LOOKUP: Record<Plan, string> = { month: "changle_member_month", year: "changle_member_year", life: "changle_member_life" };
const CENTS: Record<Plan, number> = { month: Math.round(PRICES.month * 100), year: Math.round(PRICES.year * 100), life: Math.round(PRICES.life * 100) };
/** Software as a service, personal use (for when tax is turned on) */
const TAX_CODE = "txcd_10103000";
/** tags this site's Checkout sessions in Stripe's Dashboard */
const TAG = "changle-member-qhzvtrmw";
/** the events acted on, and only those */
export const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
] as const;
export const HOOK_URL = "https://rooms.changle.ca/api/stripe/webhook";
/** a lifetime Checkout page stays open this long (Stripe's shortest is 30 minutes); its place is held a minute past it */
const OPEN_MS = 31 * 60_000;
/** a lifetime one paid by a slow method (a bank debit) holds its place this long while it lands */
const PENDING_MS = 14 * 864e5;
const SITES = [/^https:\/\/(www\.)?changle\.ca$/, /^https:\/\/([a-z0-9-]+\.)?changle-ets\.pages\.dev$/, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
/** where Checkout and the billing page send people back to: the page they came from, if it's ours */
export const siteOf = (o: unknown) => (typeof o === "string" && SITES.some((r) => r.test(o)) ? o : "https://changle.ca");

export function stripeSchema(q: (s: string) => void) {
  // what setting up made in Stripe, for each mode: `test:price:month`, `live:hook`, `live:hook-secret`, …
  q(`CREATE TABLE IF NOT EXISTS stripe_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  q(`CREATE TABLE IF NOT EXISTS stripe_customers (uid TEXT NOT NULL, mode TEXT NOT NULL, customer TEXT NOT NULL UNIQUE, PRIMARY KEY (uid, mode))`);
  // each subscription as Stripe last told it: `period_end` (ms) the end of the period it's in
  q(`CREATE TABLE IF NOT EXISTS stripe_subs (sub TEXT PRIMARY KEY, uid TEXT NOT NULL, mode TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL, period_end INTEGER, cancel_at_end INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL)`);
  q(`CREATE INDEX IF NOT EXISTS stripe_subs_uid ON stripe_subs (uid)`);
  // the events already acted on (kept 60 days: Stripe stops retrying after 3)
  q(`CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, at INTEGER NOT NULL)`);
}

/** a subscription that still bills: the member switches or cancels it on the billing page instead of buying again */
const LIVE_SUB = ["active", "trialing", "past_due"];

export type Sub = { plan: "month" | "year"; status: string; periodEnd: number | null; cancelAtEnd: boolean };
export type PayStatus = { mode: Mode; prices: Record<Plan, boolean>; portal: boolean; hook: boolean; tax: boolean; ready: boolean };
export type Buyer = { id: string; email: string; name: string };
type Lang = "zh" | "en";
type Fail = { error: string; status?: number };
const idOf = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : (x?.id ?? null));

export class Pay {
  constructor(
    private sql: SqlStorage,
    private stripe: Stripe,
    readonly mode: Mode,
    private opts: { tax?: boolean; hookSecret?: string; hookUrl?: string; now?: () => number; alert?: (subject: string, text: string) => void } = {},
  ) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }
  private kv(k: string): string | null {
    const r = this.sql.exec(`SELECT v FROM stripe_kv WHERE k = ?`, `${this.mode}:${k}`).toArray()[0];
    return r ? String(r.v) : null;
  }
  private setKv(k: string, v: string) {
    this.sql.exec(`INSERT INTO stripe_kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`, `${this.mode}:${k}`, v);
  }
  private hookSecret() {
    return this.opts.hookSecret || this.kv("hook-secret");
  }
  /** the other mode's webhook secret: its events (a sandbox's, after going live) are acknowledged and left alone */
  private otherSecret() {
    const r = this.sql.exec(`SELECT v FROM stripe_kv WHERE k = ?`, `${this.mode === "live" ? "test" : "live"}:hook-secret`).toArray()[0];
    return r ? String(r.v) : null;
  }

  /* ---------------- set up (the owner, once per mode) ---------------- */

  status(): PayStatus {
    const prices = { month: !!this.kv("price:month"), year: !!this.kv("price:year"), life: !!this.kv("price:life") };
    const hook = !!this.hookSecret();
    return { mode: this.mode, prices, portal: !!this.kv("portal"), hook, tax: !!this.opts.tax, ready: prices.month && prices.year && prices.life && hook };
  }

  /** what a buyer may do: buy (live), or only the owner's people try it (test), or nothing yet */
  open(): boolean {
    return this.status().ready;
  }

  /**
   * Makes what's missing in Stripe: the two products and three prices (found again by their
   * lookup keys), the billing page's settings, and the webhook. Safe to run again.
   */
  async setup(): Promise<PayStatus> {
    const s = this.stripe;
    const products: Record<"member" | "life", string | null> = { member: this.kv("product:member"), life: this.kv("product:life") };
    for (const plan of ["month", "year", "life"] as const) {
      const found = (await s.prices.list({ lookup_keys: [LOOKUP[plan]], active: true, limit: 1 })).data[0];
      const fits =
        found &&
        found.currency === "cad" &&
        found.unit_amount === CENTS[plan] &&
        (plan === "life" ? !found.recurring : found.recurring?.interval === plan) &&
        found.tax_behavior === "inclusive";
      if (found && fits) {
        this.setKv(`price:${plan}`, found.id);
        const pid = idOf(found.product);
        if (pid) products[plan === "life" ? "life" : "member"] = pid;
        if (pid) this.setKv(plan === "life" ? "product:life" : "product:member", pid);
        continue;
      }
      const which = plan === "life" ? "life" : "member";
      if (!products[which]) {
        const p = await s.products.create(
          which === "life"
            ? { name: "changle.ca 终身会员 Lifetime membership", description: "随便、两清、MoneyLens 不限次，还能在跟一单开店。Unlimited use of the tools, for life.", tax_code: TAX_CODE, metadata: { site: "changle.ca" } }
            : { name: "changle.ca 会员 Membership", description: "随便、两清、MoneyLens 不限次，还能在跟一单开店。Unlimited use of the tools.", tax_code: TAX_CODE, metadata: { site: "changle.ca" } },
        );
        products[which] = p.id;
        this.setKv(`product:${which}`, p.id);
      }
      const price = await s.prices.create({
        product: products[which]!,
        currency: "cad",
        unit_amount: CENTS[plan],
        tax_behavior: "inclusive",
        lookup_key: LOOKUP[plan],
        transfer_lookup_key: true,
        ...(plan === "life" ? {} : { recurring: { interval: plan } }),
        metadata: { plan },
      });
      this.setKv(`price:${plan}`, price.id);
    }

    if (!this.kv("portal")) {
      const c = await s.billingPortal.configurations.create({
        name: "changle.ca membership",
        business_profile: { headline: "changle.ca 会员 Membership" },
        default_return_url: "https://changle.ca/member",
        features: {
          customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "missing_features", "other"] } },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price"],
            proration_behavior: "always_invoice",
            products: [{ product: products.member!, prices: [this.kv("price:month")!, this.kv("price:year")!] }],
          },
        },
      });
      this.setKv("portal", c.id);
    }

    // the webhook (a local run gets its events from `stripe listen` instead)
    if (!this.opts.hookSecret) {
      const url = this.opts.hookUrl || HOOK_URL;
      const mine = this.kv("hook");
      const there = (await s.webhookEndpoints.list({ limit: 100 })).data.filter((w) => w.url === url);
      const kept = there.find((w) => w.id === mine && this.kv("hook-secret"));
      for (const w of there) if (w !== kept) await s.webhookEndpoints.del(w.id); // made by hand: its secret can't be read back
      if (kept) {
        const missing = EVENTS.some((e) => !kept.enabled_events.includes(e));
        if (missing || kept.status !== "enabled") await s.webhookEndpoints.update(kept.id, { enabled_events: [...EVENTS], disabled: false });
      } else {
        const w = await s.webhookEndpoints.create({ url, enabled_events: [...EVENTS], api_version: Stripe.API_VERSION as Stripe.WebhookEndpointCreateParams.ApiVersion, description: "changle.ca membership (rooms server)" });
        if (!w.secret) throw new Error("webhook made without a secret");
        this.setKv("hook", w.id);
        this.setKv("hook-secret", w.secret);
      }
    }
    return this.status();
  }

  /* ---------------- buying ---------------- */

  private customerOf(uid: string): string | null {
    const r = this.sql.exec(`SELECT customer FROM stripe_customers WHERE uid = ? AND mode = ?`, uid, this.mode).toArray()[0];
    return r ? String(r.customer) : null;
  }
  private uidOfCustomer(customer: string | null): string | null {
    if (!customer) return null;
    const r = this.sql.exec(`SELECT uid FROM stripe_customers WHERE customer = ?`, customer).toArray()[0];
    return r ? String(r.uid) : null;
  }
  private async customerFor(u: Buyer, lang: Lang): Promise<string> {
    const had = this.customerOf(u.id);
    if (had) return had;
    // (the same key for the same account: two taps at once still make one customer)
    const c = await this.stripe.customers.create({ email: u.email, name: u.name, preferred_locales: [lang], metadata: { uid: u.id } }, { idempotencyKey: `changle-customer-${this.mode}-${u.id}` });
    this.sql.exec(`INSERT INTO stripe_customers (uid, mode, customer) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, u.id, this.mode, c.id);
    return this.customerOf(u.id) ?? c.id;
  }

  /** the account's subscription that still bills, if it has one */
  subOf(uid: string): Sub | null {
    const r = this.sql
      .exec(`SELECT plan, status, period_end, cancel_at_end FROM stripe_subs WHERE uid = ? AND mode = ? AND status IN ('active', 'trialing', 'past_due') ORDER BY updated DESC LIMIT 1`, uid, this.mode)
      .toArray()[0];
    if (!r) return null;
    return { plan: r.plan === "year" ? "year" : "month", status: String(r.status), periodEnd: r.period_end == null ? null : Number(r.period_end), cancelAtEnd: Number(r.cancel_at_end) === 1 };
  }

  /** a Checkout page for one plan; the address to send the buyer to */
  async checkout(u: Buyer, plan: Plan, lang: Lang, site: string): Promise<{ url: string } | Fail> {
    const now = this.now();
    if (!this.open()) return { error: "closed", status: 503 };
    const cur = memberOf(this.sql, u.id, now);
    if (cur?.tier === "life") return { error: "life", status: 409 };
    if (plan !== "life" && this.subOf(u.id)) return { error: "subscribed", status: 409 };
    let hold = "";
    if (plan === "life") {
      const open = this.sql.exec(`SELECT url FROM life_sales WHERE uid = ? AND mode = ? AND state = 'open' AND expires > ? AND url != ''`, u.id, this.mode, now + 5 * 60_000).toArray()[0];
      if (open) return { url: String(open.url) };
      if (this.sql.exec(`SELECT 1 FROM life_sales WHERE uid = ? AND mode = ? AND state = 'pending' AND expires > ?`, u.id, this.mode, now).toArray().length) return { error: "pending", status: 409 };
      // (their own page about to close lets its place go, so it doesn't count against them)
      this.sql.exec(`UPDATE life_sales SET state = 'gone' WHERE uid = ? AND mode = ? AND state = 'open'`, u.id, this.mode);
      if (lifeLeft(this.sql, now) <= 0) return { error: "full", status: 409 };
      // held before Stripe is asked: two people paying for the last place at once can't both get it
      hold = `hold:${u.id}:${now}`;
      this.sql.exec(`INSERT INTO life_sales (session, uid, mode, state, expires, at) VALUES (?, ?, ?, 'open', ?, ?)`, hold, u.id, this.mode, now + OPEN_MS + 60_000, now);
    }
    try {
      // an earlier Checkout page of theirs is closed first, so paying twice in two tabs can't happen
      const prev = this.kv(`checkout:${u.id}`);
      if (prev) await this.stripe.checkout.sessions.expire(prev).catch(() => {});
      const customer = await this.customerFor(u, lang);
      const tax = this.opts.tax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const, name: "auto" as const } } : {};
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: plan === "life" ? "payment" : "subscription",
        customer,
        client_reference_id: u.id,
        line_items: [{ price: this.kv(`price:${plan}`)!, quantity: 1 }],
        metadata: { uid: u.id, plan },
        success_url: `${site}/member?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/member`,
        locale: lang,
        billing_address_collection: "auto",
        integration_identifier: TAG,
        ...tax,
        ...(plan === "life"
          ? { expires_at: Math.floor((Date.now() + OPEN_MS) / 1000), payment_intent_data: { description: "changle.ca 终身会员 Lifetime membership", metadata: { uid: u.id, plan } } }
          : { subscription_data: { billing_mode: { type: "flexible" }, description: "changle.ca 会员 Membership", metadata: { uid: u.id, plan } } }),
      };
      const s = await this.stripe.checkout.sessions.create(params);
      if (!s.url) throw new Error("checkout without a page");
      this.setKv(`checkout:${u.id}`, s.id);
      if (hold) this.sql.exec(`UPDATE life_sales SET session = ?, url = ?, expires = ? WHERE session = ?`, s.id, s.url, (s.expires_at ?? Math.floor((now + OPEN_MS) / 1000)) * 1000 + 60_000, hold);
      return { url: s.url };
    } catch (e) {
      if (hold) this.sql.exec(`DELETE FROM life_sales WHERE session = ?`, hold);
      throw e;
    }
  }

  /** Stripe's billing page for the account: change the card, switch month and year, cancel */
  async portal(uid: string, lang: Lang, site: string): Promise<{ url: string } | Fail> {
    const customer = this.customerOf(uid);
    if (!customer) return { error: "none", status: 404 };
    const configuration = this.kv("portal");
    const s = await this.stripe.billingPortal.sessions.create({ customer, return_url: `${site}/member`, locale: lang, ...(configuration ? { configuration } : {}) });
    return { url: s.url };
  }

  /** back from Checkout: what happened to that payment, acted on now rather than waiting for the webhook */
  async done(uid: string, id: string): Promise<{ paid: boolean; pending: boolean } | Fail> {
    if (!/^cs_(test|live)_\w{10,200}$/.test(id)) return { error: "bad", status: 400 };
    const s = await this.stripe.checkout.sessions.retrieve(id);
    if (s.client_reference_id !== uid) return { error: "not-yours", status: 403 };
    await this.fulfil(s);
    return { paid: s.payment_status === "paid" || s.payment_status === "no_payment_required", pending: s.status === "complete" && s.payment_status === "unpaid" };
  }

  /* ---------------- what Stripe tells us ---------------- */

  async webhook(raw: string, sig: string): Promise<{ status: number; body: string }> {
    const secret = this.hookSecret();
    if (!secret) return { status: 503, body: "not set up" };
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, Stripe.createSubtleCryptoProvider());
    } catch {
      const other = this.otherSecret();
      if (other) {
        try {
          await this.stripe.webhooks.constructEventAsync(raw, sig, other, undefined, Stripe.createSubtleCryptoProvider());
          return { status: 200, body: "other mode" };
        } catch {
          /* neither */
        }
      }
      return { status: 400, body: "bad signature" };
    }
    if (event.livemode !== (this.mode === "live")) return { status: 200, body: "other mode" };
    if (this.sql.exec(`SELECT 1 FROM stripe_events WHERE id = ?`, event.id).toArray().length) return { status: 200, body: "seen" };
    try {
      await this.handle(event);
    } catch (e) {
      console.error("stripe event", event.type, event.id, e);
      return { status: 500, body: "try again" };
    }
    const now = this.now();
    this.sql.exec(`INSERT INTO stripe_events (id, type, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, event.id, event.type, now);
    this.sql.exec(`DELETE FROM stripe_events WHERE at < ?`, now - 60 * 864e5);
    return { status: 200, body: "ok" };
  }

  private async handle(event: Stripe.Event) {
    const s = this.stripe;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return this.fulfil(await s.checkout.sessions.retrieve(event.data.object.id));
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        this.sql.exec(`UPDATE life_sales SET state = 'gone' WHERE session = ? AND state IN ('open', 'pending')`, event.data.object.id);
        return;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return this.sync(await s.subscriptions.retrieve(event.data.object.id));
      case "invoice.paid":
      case "invoice.payment_failed": {
        const sub = idOf(event.data.object.parent?.subscription_details?.subscription);
        if (sub) await this.sync(await s.subscriptions.retrieve(sub));
        return;
      }
      case "charge.refunded":
        if (event.data.object.refunded) await this.takeBack(idOf(event.data.object.payment_intent), "refunded");
        return;
      case "charge.dispute.created": {
        const d = event.data.object;
        const pi = idOf(d.payment_intent) ?? idOf((await s.charges.retrieve(idOf(d.charge)!)).payment_intent);
        const who = await this.takeBack(pi, "disputed");
        this.opts.alert?.(
          "changle.ca：有一笔会员付款被争议 A membership payment was disputed",
          `${who ? `账号 Account ${who}\n` : ""}C$${(d.amount / 100).toFixed(2)} · ${d.reason}\n会员已经停了。去 Stripe 回应争议 Respond in Stripe: https://dashboard.stripe.com/${this.mode === "test" ? "test/" : ""}disputes/${d.id}`,
        );
        return;
      }
      case "radar.early_fraud_warning.created": {
        const w = event.data.object;
        const pi = idOf(w.payment_intent) ?? idOf((await s.charges.retrieve(idOf(w.charge)!)).payment_intent);
        this.opts.alert?.(
          "changle.ca：有一笔会员付款可能是盗刷 A membership payment may be fraud",
          `银行说这笔付款可能是盗刷（${w.fraud_type}）。Stripe 建议退款，免得被争议。The card's bank flagged this payment as possible fraud; Stripe suggests refunding it before it's disputed.\nhttps://dashboard.stripe.com/${this.mode === "test" ? "test/" : ""}payments/${pi ?? ""}`,
        );
        return;
      }
      default:
        return;
    }
  }

  /** a finished Checkout: a subscription started, or a lifetime one paid (or still landing) */
  private async fulfil(session: Stripe.Checkout.Session) {
    const uid = session.client_reference_id;
    if (!uid) return;
    const customer = idOf(session.customer);
    const owner = this.uidOfCustomer(customer);
    if (owner && owner !== uid) return console.error("stripe: session for another account's customer", session.id);
    if (session.mode === "subscription") {
      const sub = idOf(session.subscription);
      if (session.status === "complete" && sub) await this.sync(await this.stripe.subscriptions.retrieve(sub));
      return;
    }
    if (session.mode !== "payment" || session.metadata?.plan !== "life") return;
    const now = this.now();
    const row = this.sql.exec(`SELECT state FROM life_sales WHERE session = ?`, session.id).toArray()[0];
    const state = row ? String(row.state) : null;
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      if (state === "paid" || state === "refunded" || state === "disputed" || state === "ended") return;
      const pi = idOf(session.payment_intent) ?? "";
      if (row) this.sql.exec(`UPDATE life_sales SET state = 'paid', pi = ?, url = '' WHERE session = ?`, pi, session.id);
      else this.sql.exec(`INSERT INTO life_sales (session, uid, mode, state, expires, pi, at) VALUES (?, ?, ?, 'paid', 0, ?, ?)`, session.id, uid, this.mode, pi, now);
      const twice = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM life_sales WHERE uid = ? AND state = 'paid'`, uid).one().n) > 1;
      setLife(this.sql, uid, now);
      if (twice) this.opts.alert?.("changle.ca：有人付了两次终身会员 Someone paid for lifetime twice", `账号 Account ${uid}，这一笔 this payment ${pi}。在 Stripe 退掉一笔。Refund one in Stripe: https://dashboard.stripe.com/${this.mode === "test" ? "test/" : ""}payments/${pi}`);
      await this.stopRenewing(uid);
      const sold = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM members WHERE tier = 'life'`).one().n);
      if (sold > LIFE_SLOTS) this.opts.alert?.("changle.ca：终身会员卖出了第 6 个 A sixth lifetime membership was sold", `账号 Account ${uid}，付款 payment ${pi}。可以退款，或者就留着。Refund it, or let it stand.`);
      return;
    }
    if (session.status === "complete" && session.payment_status === "unpaid" && row && state === "open")
      this.sql.exec(`UPDATE life_sales SET state = 'pending', expires = ? WHERE session = ?`, now + PENDING_MS, session.id);
  }

  /** a subscription as Stripe has it now, kept here, and the membership it pays for */
  private async sync(sub: Stripe.Subscription) {
    const customer = idOf(sub.customer);
    let uid = this.uidOfCustomer(customer);
    if (!uid && sub.metadata?.uid && customer) {
      uid = sub.metadata.uid;
      this.sql.exec(`INSERT INTO stripe_customers (uid, mode, customer) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, uid, this.mode, customer);
    }
    if (!uid) return;
    const item = sub.items.data[0];
    const price = item?.price;
    const plan: "month" | "year" =
      price?.id === this.kv("price:year") || price?.lookup_key === LOOKUP.year || price?.recurring?.interval === "year" ? "year" : "month";
    const periodEnd = item ? item.current_period_end * 1000 : null;
    const now = this.now();
    this.sql.exec(
      `INSERT INTO stripe_subs (sub, uid, mode, plan, status, period_end, cancel_at_end, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (sub) DO UPDATE SET plan = excluded.plan, status = excluded.status, period_end = excluded.period_end, cancel_at_end = excluded.cancel_at_end, updated = excluded.updated`,
      sub.id,
      uid,
      this.mode,
      plan,
      sub.status,
      periodEnd,
      sub.cancel_at_period_end || sub.cancel_at != null ? 1 : 0,
      now,
    );
    // paid up: in to the end of this period. Behind (past_due, incomplete): what was paid runs out
    // on its own. Over: no later than when it ended.
    if ((sub.status === "active" || sub.status === "trialing") && periodEnd) setPaid(this.sql, uid, plan, periodEnd, now);
    const billing = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM stripe_subs WHERE uid = ? AND mode = ? AND status IN ('active', 'trialing', 'past_due') AND cancel_at_end = 0`, uid, this.mode).one().n);
    if (billing > 1 && sub.status === "active" && sub.created * 1000 > now - 3600_000)
      this.opts.alert?.("changle.ca：一个账号有两个会员订阅 One account has two subscriptions", `账号 Account ${uid}。在 Stripe 取消一个并退款。Cancel and refund one in Stripe: https://dashboard.stripe.com/${this.mode === "test" ? "test/" : ""}subscriptions/${sub.id}`);
    else if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") endPaid(this.sql, uid, (sub.ended_at ?? Math.floor(now / 1000)) * 1000);
  }

  /**
   * A payment refunded in full, or disputed: what it bought ends. A lifetime place goes back on
   * sale; a subscription is cancelled at once (no more renewals), so its membership ends now.
   * Returns the account it was.
   */
  private async takeBack(pi: string | null, why: "refunded" | "disputed"): Promise<string | null> {
    if (!pi) return null;
    const life = this.sql.exec(`SELECT session, uid FROM life_sales WHERE pi = ? AND state = 'paid'`, pi).toArray()[0];
    if (life) {
      this.sql.exec(`UPDATE life_sales SET state = ? WHERE session = ?`, why, life.session);
      dropLife(this.sql, String(life.uid));
      return String(life.uid);
    }
    let who: string | null = null;
    for await (const p of this.stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, status: "paid", limit: 20 })) {
      const invoice = await this.stripe.invoices.retrieve(idOf(p.invoice)!);
      const subId = invoice.parent?.type === "subscription_details" ? idOf(invoice.parent.subscription_details?.subscription) : null;
      if (!subId) continue;
      const known = this.sql.exec(`SELECT uid, status FROM stripe_subs WHERE sub = ?`, subId).toArray()[0];
      if (!known) continue;
      who = String(known.uid);
      const sub = await this.stripe.subscriptions.retrieve(subId);
      await this.sync(sub.status === "canceled" ? sub : await this.stripe.subscriptions.cancel(subId));
      endPaid(this.sql, who, this.now());
    }
    return who;
  }

  /* ---------------- the owner, and an account going ---------------- */

  /** lifetime now (paid, or given by the owner): a month or a year alongside stops renewing; it's paid to its end, then lifetime carries on */
  async stopRenewing(uid: string) {
    const subs = this.sql.exec(`SELECT sub FROM stripe_subs WHERE uid = ? AND mode = ? AND status IN ('active', 'trialing', 'past_due') AND cancel_at_end = 0`, uid, this.mode).toArray();
    for (const r of subs) {
      try {
        await this.sync(await this.stripe.subscriptions.update(String(r.sub), { cancel_at_period_end: true }));
      } catch (e) {
        console.error("stripe: couldn't stop a subscription renewing", r.sub, e);
        this.opts.alert?.("changle.ca：一个订阅没停下来 A subscription didn't stop renewing", `账号 Account ${uid} 已经是终身会员，在 Stripe 把这个订阅设成到期取消。This account is lifetime now; set this subscription to cancel at period end: https://dashboard.stripe.com/${this.mode === "test" ? "test/" : ""}subscriptions/${r.sub}`);
      }
    }
  }

  /**
   * The owner ends someone's membership in the back office, or the account is deleted: a
   * subscription stops at once (no refund: that's the owner's call, in Stripe), and a lifetime one
   * paid for gives its place back.
   */
  async end(uid: string) {
    this.sql.exec(`UPDATE life_sales SET state = 'ended' WHERE uid = ? AND state = 'paid'`, uid);
    this.sql.exec(`UPDATE life_sales SET state = 'gone' WHERE uid = ? AND state IN ('open', 'pending')`, uid);
    const subs = this.sql.exec(`SELECT sub FROM stripe_subs WHERE uid = ? AND mode = ? AND status IN ('active', 'trialing', 'past_due', 'incomplete')`, uid, this.mode).toArray();
    for (const r of subs) {
      try {
        await this.sync(await this.stripe.subscriptions.cancel(String(r.sub)));
      } catch (e) {
        console.error("stripe: couldn't cancel", r.sub, e);
        this.opts.alert?.("changle.ca：一个订阅没取消掉 A subscription couldn't be cancelled", `账号 Account ${uid} 的会员结束了（或者账号删了），但 Stripe 里的订阅没取消。去 Stripe 取消，免得再扣钱。Cancel it in Stripe so it isn't charged again: https://dashboard.stripe.com/${this.mode === "test" ? "test/" : ""}subscriptions/${r.sub}`);
      }
    }
  }
}
