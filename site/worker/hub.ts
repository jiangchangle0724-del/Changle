/**
 * The Hub: one Durable Object (SQLite) for everything that isn't a single table:
 * the wishlist, accounts (email codes, profiles, avatars), friends, chat and game history.
 * Phones talk to it through the Worker's /api routes (one `call` per request) and keep one
 * live socket open while signed in, for chat and friend requests as they happen.
 */
import { DurableObject } from "cloudflare:workers";
import Stripe from "stripe";
import { cleanChoices, type Choices } from "../src/shared/draw";
import { cleanScene } from "../src/shared/dramaScene";
import { checkLook } from "../src/shared/figureLook";
import { COPY_LIMIT, COPY_MAX, emptyCopy, type CopyEdit, type CopyMap } from "../src/shared/copy";
import { goneTables, nextDue, noteGone, sendGone } from "./goneNotices";
import { accountsThere, appsUsed, forgetHandoffs, giveHandoff, handoffTables, redeemHandoff } from "./handoffCodes";
import { afterPause, cancelByLink, cancelPending, confirmEmail, dropEmail, EMAIL_RE, emailTables, forgetEmail, makeEmail, nextPending, pendingOf, postponeDue, startEmail, takeDue } from "./emailChange";
import { mailTables, nextMail, queueMail, sendMail, type Mail } from "./mailOut";
import { cleanNotice, esc, NOTICES_A_DAY, renderNotice, type Sent } from "./notice";
import { sfAdmin, sfPublic, sfSchema } from "./straightface";
import { grant, lifeLeft, listMembers, memberOf, memberSchema, revoke, standingOf, useTool } from "./membership";
import { isPlan, modeOf, Pay, siteOf, stripeSchema } from "./stripe";
import { isCounted, type Standing, type UseResult } from "../src/shared/member";

/** The tables (Room objects), reached by code: the hub asks one to let someone go, or to close. */
type RoomRpc = { adminKick(pid: string, ban: boolean): Promise<boolean>; pauseAll(keepUid: string): Promise<void> };

export type HubEnv = {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  ADMIN_EMAILS?: string;
  /** where a reply to the "your email changed" mail goes; without it, the first of ADMIN_EMAILS */
  CONTACT_EMAIL?: string;
  /** the owner: the back office, and the only one let in while the site is paused */
  MASTER_EMAIL?: string;
  DEV_SHOW_CODES?: string;
  /** local runs only: where mail is posted instead of Resend (scripts/fake_mail.mjs) */
  DEV_MAIL_URL?: string;
  ROOMS?: DurableObjectNamespace;
  /** the DJ booth's Lyria test: hours a month, all tables together (default 20) */
  DJ_LYRIA_HOURS?: string;
  /** 两清 (tools/split), its Internal entrypoint: told when an account is deleted, it lets go of that account's receipt photos and ledgers */
  SPLIT?: { accountGone(account: string): Promise<unknown> };
  /** MoneyLens (tools/moneylens), its Internal entrypoint, once it's bound (after its first deploy): told the same, it deletes that account's records and keys */
  MONEY?: { accountGone(account: string): Promise<unknown>; accountChanged(account: string): Promise<unknown> };
  /** Stripe's secret key (a secret in Cloudflare): sk_ or rk_, test or live. Without it nothing can be bought (worker/stripe.ts) */
  STRIPE_SECRET_KEY?: string;
  /** local runs only: the signing secret `stripe listen` prints (the deployed hub makes and keeps its own) */
  STRIPE_WEBHOOK_SECRET?: string;
  /** "on": Stripe adds tax at checkout (once registered for GST and PST; prices already include it) */
  STRIPE_TAX?: string;
  /** tests only: a stand-in for Stripe's client */
  STRIPE_CLIENT?: unknown;
};

export type Call = { method: string; path: string; token: string; device: string; ip: string; body?: unknown; bytes?: ArrayBuffer; type?: string };
export type Reply = { status: number; json?: unknown; bytes?: ArrayBuffer; type?: string; cache?: string };

/** `text`: the game's (or feature's) name; `desc`: what it is; `rules`: how it's played (both "" on wishes from before they were asked for). */
export type WishRow = { id: number; text: string; desc: string; rules: string; kind: "game" | "feature"; name: string; votes: number; status: "new" | "planned" | "done"; at: number; voted: boolean; mine: boolean };
export type GameRecord = { game: string; room: string; started: number; ended: number; players: { pid: string; uid?: string; name: string; drinks: number }[] };
/** `fg`: their figure cut out for the games' stages (its version), 0 for none. */
export type Who = { uid: string; name: string; av: number; ac: number; fg: number; fr?: string };
/** What a table tells the hub about itself, so the back office can see who is playing where. */
export type RoomReport = { code: string; game: string; screens: number; seats: { pid: string; name: string; on: boolean; uid?: string }[] };
/** May this phone sit down? `block` says why not. `owner`: one of the site owner's accounts. */
export type Admit = { who: Who | null; block?: "paused" | "banned"; owner?: boolean };

// the first wishes; every one of these games is on the site now, so they count as made
const SEEDS: [string, string][] = [
  ["Punchline 神回复", "game"],
  ["Euchre 尤克牌", "game"],
  ["Freeze Dance 木头人蹦迪", "game"],
  ["Limbo 林波舞", "game"],
  ["Name That Tune 猜歌名", "game"],
  ["Post-it Note 额头便利贴", "game"],
  ["Superlatives 最佳称号", "game"],
];
/** How long a wish's description and rules may be, in characters after tidying (the form in WishlistTab.tsx says the same). */
const WISH_DESC: [number, number] = [10, 300];
const WISH_RULES: [number, number] = [10, 600];

const CODE_TTL = 10 * 60_000;
// (an hour: the sign-up form now includes drawing an avatar)
const TICKET_TTL = 60 * 60_000;
/**
 * AI avatars: one a month each. A month's go is a few drawings (the first, then changes to hair,
 * clothes and so on); choosing one ("use this one") ends the month's go. Per network and for
 * everyone together there is also a daily ceiling (the bill's). The owner and admins draw freely.
 */
export const DRAWS_PER_MONTH = 6;
const DRAWS_PER_IP = 40;
const DRAWS_PER_DAY = 400;
/** Signed in stays signed in: a session lasts five years past the last time it was used. */
const SESSION_TTL = 5 * 365 * 86400_000;
const GENDERS = ["female", "male", "nonbinary", "private"];
const HANDLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 戏精大赏 scenes players send in: a few a day each, and not too many waiting at once. */
const SCENES_PER_DAY = 5;
const SCENES_WAITING = 10;

type Limit = { n: number; until: number };
type Row = Record<string, SqlStorageValue>;
type LiveRoom = { code: string; game: string; screens: number; at: number; seats: { pid: string; name: string; on: boolean; uid?: string }[] };
/** `perks`: rewards on the account ("wish": a game they wished for went live: a gold frame, limited outfits). */
type U = { id: string; email: string; name: string; phone: string; city: string; gender: string; bio: string; av: number; ac: number; handle: string; created_at: number; last_seen: number; banned: boolean; perks: string[] };

function asUser(r: Row): U {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    phone: String(r.phone),
    city: String(r.city),
    gender: String(r.gender),
    bio: String(r.bio ?? ""),
    av: Number(r.av),
    ac: Number(r.ac),
    handle: String(r.handle),
    created_at: Number(r.created_at),
    last_seen: Number(r.last_seen ?? 0),
    banned: Number(r.banned ?? 0) === 1,
    perks: String(r.perks ?? "")
      .split(",")
      .filter(Boolean),
  };
}

const ok = (json: unknown): Reply => ({ status: 200, json });
/** an address in a mail to someone else's mailbox: the first letter, then the domain */
const masked = (email: string) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
};
/** a day and time, Vancouver time, as a mail says it */
const when = (at: number, lang: "zh" | "en") =>
  new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-CA", { timeZone: "America/Vancouver", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
const err = (status: number, error: string): Reply => ({ status, json: { error } });
/** what went wrong with Stripe, in a word the back office can show (never the message, which can quote a key) */
const stripeWhy = (e: unknown) => {
  const t = (e as { type?: string } | null)?.type ?? "";
  if (t === "StripeAuthenticationError") return "stripe-key";
  if (t === "StripePermissionError") return "stripe-permission";
  if (t === "StripeRateLimitError") return "stripe-busy";
  if (t === "StripeConnectionError" || t === "StripeAPIError") return "stripe-down";
  if (t === "StripeInvalidRequestError") return "stripe-request";
  return "stripe";
};

export class Hub extends DurableObject<HubEnv> {
  private sql: SqlStorage;
  private limits = new Map<string, Limit>();
  private pepper = "";
  /** the whole site paused by the owner (kept in meta; read once) */
  private paused = false;
  /** which phones a signed-in person used lately, noted at most hourly */
  private seenDevice = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: HubEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      // (notices waiting with no alarm, or a later one, say the hub stopped before setting it: wake in time for them)
      const due = this.dueAt();
      if (due != null) {
        const at = Math.max(due, Date.now() + 1000);
        const set = await ctx.storage.getAlarm();
        if (set == null || set > at) await ctx.storage.setAlarm(at);
      }
    });
  }

  private migrate() {
    const q = (s: string) => this.sql.exec(s);
    q(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    q(`CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL, device TEXT NOT NULL DEFAULT '', user_id TEXT,
      votes INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0)`);
    q(`CREATE TABLE IF NOT EXISTS wish_votes (wish_id INTEGER NOT NULL, voter TEXT NOT NULL, PRIMARY KEY (wish_id, voter))`);
    // a wish also says what the game is and how it's played (wishes from before have neither)
    const wcols = this.sql.exec(`PRAGMA table_info(wishes)`).toArray().map((c) => String(c.name));
    if (!wcols.includes("description")) q(`ALTER TABLE wishes ADD COLUMN description TEXT NOT NULL DEFAULT ''`);
    if (!wcols.includes("rules")) q(`ALTER TABLE wishes ADD COLUMN rules TEXT NOT NULL DEFAULT ''`);
    q(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL,
      gender TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', av INTEGER NOT NULL DEFAULT 0, ac INTEGER NOT NULL DEFAULT 0,
      handle TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)`);
    q(`CREATE TABLE IF NOT EXISTS avatars (user_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, updated_at INTEGER NOT NULL)`);
    // the anime figure an AI drew for someone (whole, and the round crop their avatar shows), kept
    // while a photo is the avatar so switching back is one tap; `shown` is which of the two is up
    q(`CREATE TABLE IF NOT EXISTS figures (user_id TEXT PRIMARY KEY, mime TEXT NOT NULL, full BLOB NOT NULL, round BLOB NOT NULL, choices TEXT NOT NULL, shown INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)`);
    // the 3D figure's look (/me/figure): a few dozen numbers, as src/shared/figureLook.ts checks them
    q(`CREATE TABLE IF NOT EXISTS looks (user_id TEXT PRIMARY KEY, look TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
    // codes that take a signed-in account to an app on its own domain (handoffCodes.ts), and the
    // apps still to be told an account is gone (goneNotices.ts)
    handoffTables(this.sql);
    goneTables(this.sql);
    emailTables(this.sql);
    mailTables(this.sql);
    // AI drawings counted per day (k: e:<email>, ip:<address>, all)
    q(`CREATE TABLE IF NOT EXISTS draws (k TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL)`);
    // notices sent for other Workers, counted per day (k: the app; worker/notice.ts)
    q(`CREATE TABLE IF NOT EXISTS mails (k TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL)`);
    q(`CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL)`);
    q(`CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)`);
    q(`CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER NOT NULL, expires INTEGER NOT NULL)`);
    q(`CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`);
    q(`CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, by TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (a, b))`);
    q(`CREATE INDEX IF NOT EXISTS friends_b ON friends (b)`);
    q(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT NOT NULL, b TEXT NOT NULL, from_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER)`);
    q(`CREATE INDEX IF NOT EXISTS messages_pair ON messages (a, b, id)`);
    q(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, game TEXT NOT NULL, mode TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', players TEXT NOT NULL, drinks INTEGER NOT NULL DEFAULT 0, minutes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
    q(`CREATE INDEX IF NOT EXISTS history_user ON history (user_id, id)`);
    q(`CREATE TABLE IF NOT EXISTS blocks (user_id TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY (user_id, blocked))`);
    // the owner's back office: who is banned (k: e:<email> or d:<phone id>), the phones each
    // account used, and every table with people at it right now
    const ucols = this.sql.exec(`PRAGMA table_info(users)`).toArray().map((c) => String(c.name));
    if (!ucols.includes("banned")) q(`ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0`);
    // rewards on an account, comma-separated (see U.perks)
    if (!ucols.includes("perks")) q(`ALTER TABLE users ADD COLUMN perks TEXT NOT NULL DEFAULT ''`);
    q(`CREATE TABLE IF NOT EXISTS bans (k TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)`);
    q(`CREATE TABLE IF NOT EXISTS devices (user_id TEXT NOT NULL, device TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, device))`);
    q(`CREATE TABLE IF NOT EXISTS rooms_live (code TEXT PRIMARY KEY, game TEXT NOT NULL, seats TEXT NOT NULL, screens INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)`);
    // AI avatars this month, per person (k: e:<email>): drawings so far, and whether one was chosen
    q(`CREATE TABLE IF NOT EXISTS months (k TEXT PRIMARY KEY, month TEXT NOT NULL, n INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0)`);
    // 戏精大赏 scenes players wrote for everyone: 'new' waits for the owner, 'live' is played at
    // every table, 'no' was turned down. `body` is the tidied scene; `name` the writer when sent
    q(`CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, lang TEXT NOT NULL,
      level TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL, decided_at INTEGER)`);
    q(`CREATE INDEX IF NOT EXISTS scenes_status ON scenes (status, id)`);
    q(`CREATE INDEX IF NOT EXISTS scenes_user ON scenes (user_id, id)`);
    // 一本正经: how each card plays, and the cards players flag (worker/straightface.ts)
    sfSchema(q);
    // members and the free uses of the counted tools (worker/membership.ts, docs/membership.md)
    memberSchema(q);
    // what was paid with Stripe, and what setting it up made there (worker/stripe.ts)
    stripeSchema(q);
    // the owner's edits to the site's words: by language and the exact text they replace (src/shared/copy.ts)
    q(`CREATE TABLE IF NOT EXISTS copy (lang TEXT NOT NULL, orig TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (lang, orig))`);
    // the figure lifted off its backdrop, for the games' stages, and a version that changes with it
    const fcols = this.sql.exec(`PRAGMA table_info(figures)`).toArray().map((c) => String(c.name));
    if (!fcols.includes("cut")) q(`ALTER TABLE figures ADD COLUMN cut BLOB`);
    if (!fcols.includes("cut_mime")) q(`ALTER TABLE figures ADD COLUMN cut_mime TEXT NOT NULL DEFAULT ''`);
    if (!fcols.includes("ver")) q(`ALTER TABLE figures ADD COLUMN ver INTEGER NOT NULL DEFAULT 0`);
    this.paused = this.sql.exec(`SELECT v FROM meta WHERE k = 'paused'`).toArray()[0]?.v === "1";

    const seeded = this.sql.exec(`SELECT v FROM meta WHERE k = 'seeded'`).toArray();
    if (!seeded.length) {
      const now = Date.now();
      SEEDS.forEach(([text, kind], i) => {
        this.sql.exec(`INSERT INTO wishes (text, kind, name, status, created_at, device) VALUES (?, ?, 'Steve', 'done', ?, 'seed')`, text, kind, now - (SEEDS.length - i) * 1000);
      });
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('seeded', '1')`);
    }
    // seeded back when these games were still being built: made now (once, so the owner can still change them)
    if (!this.sql.exec(`SELECT v FROM meta WHERE k = 'seeds-made'`).toArray().length) {
      this.sql.exec(`UPDATE wishes SET status = 'done' WHERE device = 'seed' AND text IN (${SEEDS.map(() => "?").join(", ")})`, ...SEEDS.map(([text]) => text));
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('seeds-made', '1')`);
    }
    const p = this.sql.exec(`SELECT v FROM meta WHERE k = 'pepper'`).toArray();
    if (p.length) this.pepper = String(p[0].v);
    else {
      this.pepper = randomToken(24);
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('pepper', ?)`, this.pepper);
    }
  }

  /** a small fixed-window limiter: n actions per window per key */
  private allow(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const l = this.limits.get(key);
    if (!l || l.until < now) {
      this.limits.set(key, { n: 1, until: now + windowMs });
      if (this.limits.size > 5000) for (const [k, v] of this.limits) if (v.until < now) this.limits.delete(k);
      return true;
    }
    if (l.n >= max) return false;
    l.n++;
    return true;
  }

  private one(query: string, ...args: SqlStorageValue[]): Row | null {
    const rows = this.sql.exec(query, ...args).toArray();
    return rows.length ? (rows[0] as Row) : null;
  }

  /* ================= the router ================= */

  async call(c: Call): Promise<Reply> {
    try {
      return await this.route(c);
    } catch (e) {
      console.error("hub", c.method, c.path, e);
      return err(500, "server");
    }
  }

  private async route(c: Call): Promise<Reply> {
    const { method: m, path } = c;
    const b = (c.body ?? {}) as Record<string, unknown>;
    const me = c.token ? await this.session(c.token) : null;
    const master = !!me && this.isMaster(me);
    // signing in, the pictures of people's faces, and cancelling a waiting email change (so a pause
    // or a banned phone can't keep an owner from it) stay open; the rest is shut to a banned phone,
    // and to everyone but the owner while the site is paused
    const open = path.startsWith("/auth/") || path === "/email/cancel" || path === "/me/email/cancel" || /^\/(avatar|figure)\/u[a-z0-9]{6,20}(\/cut)?$/.test(path);
    if (!master && !open) {
      if (c.device && this.isBanned(`d:${c.device}`)) return err(403, "banned");
      if (this.paused) return err(503, "paused");
    }
    if (me && c.device) this.noteDevice(me.id, c.device);

    // ---- wishlist ----
    if (path === "/wishes" && m === "GET") return ok({ wishes: this.listWishes(c.device, me?.id ?? "") });
    if (path === "/wishes" && m === "POST") {
      const r = this.addWish(c.device, c.ip, { text: b.text, desc: b.desc, rules: b.rules, kind: b.kind, name: b.name }, me?.id ?? null);
      return "error" in r ? err(r.error === "slow-down" ? 429 : 400, r.error) : ok({ wish: r });
    }
    let mm = /^\/wishes\/(\d+)\/vote$/.exec(path);
    if (mm && m === "POST") {
      const r = this.vote(c.device, c.ip, Number(mm[1]), b.up !== false);
      return "error" in r ? err(r.error === "slow-down" ? 429 : 400, r.error) : ok(r);
    }
    mm = /^\/wishes\/(\d+)$/.exec(path);
    if (mm && (m === "PUT" || m === "DELETE")) {
      if (!me || !this.isAdmin(me)) return err(403, "forbidden");
      const id = Number(mm[1]);
      if (m === "DELETE") this.sql.exec(`UPDATE wishes SET hidden = 1 WHERE id = ?`, id);
      else {
        const st = String(b.status ?? "");
        if (!["new", "planned", "done"].includes(st)) return err(400, "bad");
        this.sql.exec(`UPDATE wishes SET status = ? WHERE id = ?`, st, id);
        // a wish that came true: whoever made it (signed in) gets the gold frame and the limited outfits
        if (st === "done") {
          const w = this.one(`SELECT user_id, text FROM wishes WHERE id = ?`, id);
          if (w?.user_id) this.grantPerk(String(w.user_id), "wish", String(w.text));
        }
      }
      return ok({ ok: true });
    }

    // ---- sign in ----
    if (path === "/auth/code" && m === "POST") return this.sendCode(String(b.email ?? ""), c.ip, b.lang === "en" ? "en" : "zh");
    if (path === "/auth/verify" && m === "POST") return this.verify(String(b.email ?? ""), String(b.code ?? ""), c.ip);
    if (path === "/auth/signup" && m === "POST") return this.signup(String(b.ticket ?? ""), b);
    // a change waiting its three days, cancelled by the link mailed to the address the account has now
    if (path === "/email/cancel" && m === "POST") {
      if (!this.allow(`cancel:${c.ip}`, 20, 3600_000)) return err(429, "slow-down");
      const who = await cancelByLink(this.sql, b.token);
      if (!who) return err(400, "link");
      this.push(who, { t: "me" });
      return ok({ cancelled: true });
    }
    if (path === "/auth/logout" && m === "POST") {
      if (c.token) {
        const h = await sha(c.token);
        const s = this.one(`SELECT user_id FROM sessions WHERE hash = ?`, h);
        this.sql.exec(`DELETE FROM sessions WHERE hash = ?`, h);
        // (and a handoff code from the last minute, not yet traded)
        if (s) forgetHandoffs(this.sql, String(s.user_id), false);
      }
      return ok({ ok: true });
    }

    // ---- public ----
    mm = /^\/avatar\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "GET") {
      const r = this.one(`SELECT mime, data FROM avatars WHERE user_id = ?`, mm[1]);
      if (!r) return err(404, "none");
      const data = r.data as ArrayBuffer;
      return { status: 200, bytes: data, type: String(r.mime), cache: "public, max-age=31536000, immutable" };
    }

    mm = /^\/figure\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "GET") {
      const r = this.one(`SELECT mime, full FROM figures WHERE user_id = ? AND shown = 1`, mm[1]);
      if (!r) return err(404, "none");
      return { status: 200, bytes: r.full as ArrayBuffer, type: String(r.mime), cache: "public, max-age=31536000, immutable" };
    }
    // the figure alone, see-through around it: what the games put on their stages
    mm = /^\/figure\/(u[a-z0-9]{6,20})\/cut$/.exec(path);
    if (mm && m === "GET") {
      const r = this.one(`SELECT cut, cut_mime FROM figures WHERE user_id = ? AND shown = 1 AND cut IS NOT NULL`, mm[1]);
      if (!r) return err(404, "none");
      return { status: 200, bytes: r.cut as ArrayBuffer, type: String(r.cut_mime) || "image/png", cache: "public, max-age=31536000, immutable" };
    }

    // ---- 戏精大赏's public library: approved scenes, in the table's language ----
    if (path === "/scenes" && m === "GET") return ok({ scenes: this.liveScenes(String(b.lang ?? ""), Number(b.n ?? 12)) });

    // ---- 一本正经: a round played, the cards' numbers, a card flagged (worker/straightface.ts) ----
    const sf = sfPublic(path, m, b, { sql: this.sql, allow: (k, n, w) => this.allow(k, n, w), device: c.device, ip: c.ip, uid: me?.id ?? null });
    if (sf) return sf;

    // ---- membership: what's for sale, open to anyone (the member page, src/member/) ----
    if (path === "/member" && m === "GET") return ok({ lifeLeft: lifeLeft(this.sql), pay: this.payOpen(me) });

    // ---- a code that takes this account to an app on its own domain (MoneyLens) ----
    if (path === "/handoff" && m === "POST") {
      const r = await giveHandoff(this.sql, me, b);
      return { status: r.status, json: r.json };
    }

    if (!me) return err(401, "signin");
    this.sql.exec(`UPDATE users SET last_seen = ? WHERE id = ?`, Date.now(), me.id);

    // ---- the owner's back office ----
    if (path.startsWith("/admin/")) return master ? this.admin(me, c, path, b) : err(403, "forbidden");

    // ---- me ----
    if (path === "/me" && m === "GET") return ok({ user: this.selfView(me) });
    // your membership and the free uses left of each counted tool
    if (path === "/me/member" && m === "GET") return ok({ ...this.memberView(me, master), lifeLeft: lifeLeft(this.sql) });
    // ---- paying for a membership (worker/stripe.ts): Checkout, the billing page, back from paying ----
    if (path.startsWith("/stripe/")) return this.stripeRoute(me, master, c, path, b);
    if (path === "/me" && m === "PUT") {
      const p = profileFields(b);
      if ("error" in p) return err(400, p.error);
      this.sql.exec(`UPDATE users SET name = ?, phone = ?, city = ?, gender = ?, bio = ?, ac = ? WHERE id = ?`, p.name, p.phone, p.city, p.gender, p.bio, p.ac, me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    // 换邮箱: a code to the new address; typed back, the account's email changes and the old address is told
    if (path === "/me/email" && m === "POST") return this.emailStart(me, String(b.email ?? ""), c.ip, b.lang === "en" ? "en" : "zh");
    if (path === "/me/email/confirm" && m === "POST") return this.emailConfirm(me, b, b.lang === "en" ? "en" : "zh", c);
    // a change waiting its three days, cancelled from one of the account's phones
    if (path === "/me/email/cancel" && m === "POST") {
      if (cancelPending(this.sql, me.id)) this.push(me.id, { t: "me" });
      return ok({ user: this.selfView(me) });
    }
    // the account's phones signed in before this one, signed out (this one stays; see signOutOlder)
    if (path === "/me/sessions/others" && m === "POST") {
      const r = this.signOutOlder(me.id, await sha(c.token));
      return ok({ ...r, user: this.selfView(me) });
    }
    if (path === "/me" && m === "DELETE") {
      this.deleteUser(me.id);
      return ok({ ok: true });
    }
    if (path === "/me/avatar" && m === "PUT") {
      const bytes = c.bytes;
      const type = (c.type ?? "").split(";")[0];
      if (!bytes || bytes.byteLength < 100 || bytes.byteLength > 400_000) return err(400, "size");
      if (!["image/jpeg", "image/webp", "image/png"].includes(type)) return err(400, "type");
      if (!this.allow(`av:${me.id}`, 20, 3600_000)) return err(429, "slow-down");
      this.sql.exec(`INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`, me.id, type, bytes, Date.now());
      this.sql.exec(`UPDATE users SET av = av + 1 WHERE id = ?`, me.id);
      this.sql.exec(`UPDATE figures SET shown = 0 WHERE user_id = ?`, me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    if (path === "/me/figure" && m === "PUT") {
      // an AI drawing the player chose: the whole figure and its round crop, both made on the phone
      const full = fromB64(b.full, 450_000);
      const round = fromB64(b.round, 120_000);
      const mime = String(b.mime ?? "");
      if (!full || !round || full.byteLength < 2000 || round.byteLength < 500) return err(400, "size");
      if (!["image/jpeg", "image/webp", "image/png"].includes(mime) || !isImage(full) || !isImage(round)) return err(400, "type");
      if (!this.allow(`av:${me.id}`, 20, 3600_000)) return err(429, "slow-down");
      const now = Date.now();
      const choices = JSON.stringify(cleanChoices(b.choices));
      const cut = this.cutOf(b);
      this.sql.exec(
        `INSERT INTO figures (user_id, mime, full, round, choices, shown, updated_at, cut, cut_mime, ver) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, full = excluded.full, round = excluded.round, choices = excluded.choices, shown = 1, updated_at = excluded.updated_at, cut = excluded.cut, cut_mime = excluded.cut_mime, ver = figures.ver + 1`,
        me.id,
        mime,
        full,
        round,
        choices,
        now,
        cut?.bytes ?? null,
        cut?.mime ?? "",
      );
      this.showFigure(me.id);
      // choosing a drawing is this month's AI avatar
      if (!this.drawsFree(me)) this.monthDone(`e:${me.email}`);
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    // a figure saved before figures were cut out: the phone cuts it out now (no drawing counted)
    if (path === "/me/figure/cut" && m === "PUT") {
      const cut = this.cutOf(b);
      if (!cut) return err(400, "size");
      if (!this.one(`SELECT user_id FROM figures WHERE user_id = ?`, me.id)) return err(404, "none");
      if (!this.allow(`av:${me.id}`, 20, 3600_000)) return err(429, "slow-down");
      this.sql.exec(`UPDATE figures SET cut = ?, cut_mime = ?, ver = ver + 1 WHERE user_id = ?`, cut.bytes, cut.mime, me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    // your own figure, whole (the phone cuts it out from this)
    if (path === "/me/figure/full" && m === "GET") {
      const r = this.one(`SELECT mime, full FROM figures WHERE user_id = ?`, me.id);
      if (!r) return err(404, "none");
      return { status: 200, bytes: r.full as ArrayBuffer, type: String(r.mime), cache: "no-store" };
    }
    if (path === "/me/figure/use" && m === "POST") {
      if (!this.one(`SELECT user_id FROM figures WHERE user_id = ?`, me.id)) return err(404, "none");
      this.sql.exec(`UPDATE figures SET shown = 1 WHERE user_id = ?`, me.id);
      this.showFigure(me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    // the 3D figure's look, kept on the account (the phone keeps it too, and sends it up a moment after each change)
    if (path === "/me/look" && m === "GET") {
      const r = this.one(`SELECT look, updated_at FROM looks WHERE user_id = ?`, me.id);
      return ok({ look: r ? checkLook(JSON.parse(String(r.look))) : null, at: r ? Number(r.updated_at) : 0 });
    }
    if (path === "/me/look" && m === "PUT") {
      if (!b.look || typeof b.look !== "object" || JSON.stringify(b.look).length > 4000) return err(400, "bad");
      if (!this.allow(`look:${me.id}`, 300, 3600_000)) return err(429, "slow-down");
      const look = checkLook(b.look);
      const at = Date.now();
      this.sql.exec(`INSERT INTO looks (user_id, look, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET look = excluded.look, updated_at = excluded.updated_at`, me.id, JSON.stringify(look), at);
      return ok({ look, at });
    }
    if (path === "/me/avatar" && m === "DELETE") {
      this.sql.exec(`DELETE FROM avatars WHERE user_id = ?`, me.id);
      this.sql.exec(`UPDATE figures SET shown = 0 WHERE user_id = ?`, me.id);
      this.sql.exec(`UPDATE users SET av = 0 WHERE id = ?`, me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    // ---- 戏精大赏: a scene for everyone, which waits for the owner's yes ----
    if (path === "/scenes" && m === "POST") {
      const r = cleanScene(b.scene);
      if ("error" in r) return err(400, r.error);
      const day = Number(this.one(`SELECT COUNT(*) AS n FROM scenes WHERE user_id = ? AND created_at > ?`, me.id, Date.now() - 86400_000)?.n ?? 0);
      const waiting = Number(this.one(`SELECT COUNT(*) AS n FROM scenes WHERE user_id = ? AND status = 'new'`, me.id)?.n ?? 0);
      if (day >= SCENES_PER_DAY || waiting >= SCENES_WAITING) return err(429, "slow-down");
      const at = Date.now();
      this.sql.exec(`INSERT INTO scenes (user_id, name, lang, level, body, status, created_at) VALUES (?, ?, ?, ?, ?, 'new', ?)`, me.id, me.name, r.lang, r.scene.level, JSON.stringify(r.scene), at);
      return ok({ id: Number(this.one(`SELECT last_insert_rowid() AS id`)?.id ?? 0) });
    }
    if (path === "/scenes/mine" && m === "GET") {
      const rows = this.sql.exec(`SELECT id, body, status, created_at FROM scenes WHERE user_id = ? ORDER BY id DESC LIMIT 40`, me.id).toArray() as Row[];
      return ok({ scenes: rows.map((r) => ({ id: Number(r.id), title: (JSON.parse(String(r.body)) as { title: unknown }).title, status: String(r.status), at: Number(r.created_at) })) });
    }
    mm = /^\/scenes\/(\d+)$/.exec(path);
    if (mm && m === "DELETE") {
      this.sql.exec(`DELETE FROM scenes WHERE id = ? AND user_id = ?`, Number(mm[1]), me.id);
      return ok({ ok: true });
    }

    if (path === "/me/history" && m === "GET") return ok({ history: this.history(me.id), stats: this.stats(me.id) });
    if (path === "/me/history" && m === "POST") {
      if (!this.allow(`h:${me.id}`, 60, 3600_000)) return err(429, "slow-down");
      const game = String(b.game ?? "").slice(0, 20);
      const players = Array.isArray(b.players) ? b.players.map((x) => clean(x, 20)).filter(Boolean).slice(0, 15) : [];
      const minutes = Math.max(0, Math.min(600, Math.round(Number(b.minutes) || 0)));
      if (!/^[a-z]{2,20}$/.test(game)) return err(400, "bad");
      this.sql.exec(`INSERT INTO history (user_id, game, mode, room, players, drinks, minutes, created_at) VALUES (?, ?, 'single', '', ?, 0, ?, ?)`, me.id, game, JSON.stringify(players), minutes, Date.now());
      return ok({ ok: true });
    }

    // ---- people ----
    mm = /^\/users\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "GET") {
      const u = this.userById(mm[1]);
      if (!u) return err(404, "none");
      const rel = this.relation(me.id, u.id);
      // (blockedByMe: the block is mine, so the page can offer to undo it; the person I blocked is told nothing)
      const mine = rel === "blocked" && !!this.one(`SELECT 1 AS x FROM blocks WHERE user_id = ? AND blocked = ?`, me.id, u.id);
      return ok({ user: { ...this.publicView(u), figure: this.figure(u.id).shown }, relation: rel, stats: this.stats(u.id), recent: rel === "friends" || rel === "self" ? this.history(u.id, 8) : [], ...(mine ? { blockedByMe: true } : {}) });
    }
    if (path === "/users" && m === "GET") {
      const q = clean((c.body as { q?: string } | undefined)?.q ?? "", 30);
      return ok({ users: this.search(me.id, q) });
    }

    // ---- friends ----
    if (path === "/friends" && m === "GET") return ok(this.friendList(me.id));
    mm = /^\/friends\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "POST") return this.befriend(me, mm[1]);
    if (mm && m === "DELETE") {
      const [a, z] = pair(me.id, mm[1]);
      this.sql.exec(`DELETE FROM friends WHERE a = ? AND b = ?`, a, z);
      this.parted(me.id, mm[1]);
      return ok({ ok: true });
    }
    mm = /^\/blocks\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "POST") {
      const [a, z] = pair(me.id, mm[1]);
      this.sql.exec(`DELETE FROM friends WHERE a = ? AND b = ?`, a, z);
      this.sql.exec(`INSERT OR IGNORE INTO blocks (user_id, blocked) VALUES (?, ?)`, me.id, mm[1]);
      this.parted(me.id, mm[1]);
      return ok({ ok: true });
    }
    if (mm && m === "DELETE") {
      // undone: they're strangers again (the friendship went when the block came), either side may ask anew
      this.sql.exec(`DELETE FROM blocks WHERE user_id = ? AND blocked = ?`, me.id, mm[1]);
      this.push(me.id, { t: "friends" });
      return ok({ relation: this.relation(me.id, mm[1]) });
    }

    // ---- chat ----
    mm = /^\/chat\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "GET") {
      if (this.relation(me.id, mm[1]) !== "friends") return err(403, "not-friends");
      const before = Number((c.body as { before?: number } | undefined)?.before) || 0;
      return ok({ messages: this.thread(me.id, mm[1], before) });
    }
    if (mm && m === "POST") {
      if (this.relation(me.id, mm[1]) !== "friends") return err(403, "not-friends");
      const body = clean(b.body, 1000);
      if (!body) return err(400, "empty");
      if (!this.allow(`msg:${me.id}`, 120, 60_000)) return err(429, "slow-down");
      const [a, z] = pair(me.id, mm[1]);
      const now = Date.now();
      const r = this.sql.exec(`INSERT INTO messages (a, b, from_id, body, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id`, a, z, me.id, body, now).one();
      const msg = { id: Number(r.id), from: me.id, body, at: now, read: false };
      this.push(mm[1], { t: "msg", with: me.id, msg });
      this.push(me.id, { t: "msg", with: mm[1], msg });
      return ok({ message: msg });
    }
    mm = /^\/chat\/(u[a-z0-9]{6,20})\/read$/.exec(path);
    if (mm && m === "POST") {
      const [a, z] = pair(me.id, mm[1]);
      const r = this.sql.exec(`UPDATE messages SET read_at = ? WHERE a = ? AND b = ? AND from_id = ? AND read_at IS NULL`, Date.now(), a, z, mm[1]);
      r.toArray();
      this.push(me.id, { t: "unread", n: this.unread(me.id) });
      // the sender sees "read" under their last message right away
      if (r.rowsWritten > 0) this.push(mm[1], { t: "read", with: me.id });
      return ok({ ok: true });
    }

    return err(404, "not-found");
  }

  /* ================= paying (worker/stripe.ts) ================= */

  private stripeClient: { key: string; client: Stripe } | null = null;
  /** Stripe, when a key is set (one client per key, kept while this hub runs) */
  private payFor(): Pay | null {
    const key = this.env.STRIPE_SECRET_KEY?.trim();
    const mode = modeOf(key);
    if (!key || !mode) return null;
    if (this.stripeClient?.key !== key) {
      const client = (this.env.STRIPE_CLIENT as Stripe | undefined) ?? new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "changle.ca", url: "https://changle.ca" } });
      this.stripeClient = { key, client };
    }
    const owner = (this.env.MASTER_EMAIL ?? "").trim().toLowerCase();
    return new Pay(this.sql, this.stripeClient.client, mode, {
      tax: this.env.STRIPE_TAX === "on",
      hookSecret: this.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
      alert: owner
        ? (subject, text) => {
            queueMail(this.sql, { to: owner, subject, text, html: `<p>${esc(text).replace(/\n/g, "<br>")}</p>` });
            this.kickNotices();
          }
        : undefined,
    });
  }

  /** whether this person may buy now: "live", "test" (a sandbox key: the owner and his admins only), or null */
  private payOpen(me: U | null): "live" | "test" | null {
    const pay = this.payFor();
    if (!pay || !pay.open()) return null;
    if (pay.mode === "test" && !(me && this.isAdmin(me))) return null;
    return pay.mode;
  }

  /** your membership, free uses, and (when you pay with Stripe) your subscription */
  private memberView(me: U, master: boolean) {
    const pay = this.payFor();
    const customer = !!pay && this.sql.exec(`SELECT 1 FROM stripe_customers WHERE uid = ? AND mode = ?`, me.id, pay.mode).toArray().length > 0;
    return { standing: standingOf(this.sql, me.id, Date.now(), master), pay: this.payOpen(me), sub: pay?.subOf(me.id) ?? null, billing: customer };
  }

  private payAdmin() {
    const pay = this.payFor();
    return { key: !!this.env.STRIPE_SECRET_KEY?.trim(), status: pay?.status() ?? null };
  }

  private async stripeRoute(me: U, master: boolean, c: Call, path: string, b: Record<string, unknown>): Promise<Reply> {
    const pay = this.payFor();
    if (!pay || this.payOpen(me) === null) return err(503, "closed");
    const lang = b.lang === "en" ? "en" : "zh";
    const site = siteOf(b.site);
    if (!this.allow(`pay:${me.id}`, 30, 600_000)) return err(429, "slow-down");
    try {
      if (path === "/stripe/checkout" && c.method === "POST") {
        if (!isPlan(b.plan)) return err(400, "plan");
        const r = await pay.checkout({ id: me.id, email: me.email, name: me.name }, b.plan, lang, site);
        return "url" in r ? ok(r) : err(r.status ?? 400, r.error);
      }
      if (path === "/stripe/portal" && c.method === "POST") {
        const r = await pay.portal(me.id, lang, site);
        return "url" in r ? ok(r) : err(r.status ?? 400, r.error);
      }
      if (path === "/stripe/done" && c.method === "GET") {
        const r = await pay.done(me.id, typeof b.id === "string" ? b.id : "");
        if ("error" in r) return err(r.status ?? 400, r.error);
        return ok({ ...r, ...this.memberView(this.userById(me.id) ?? me, master), lifeLeft: lifeLeft(this.sql) });
      }
    } catch (e) {
      console.error("stripe", path, e);
      return err(502, stripeWhy(e));
    }
    return err(404, "not-found");
  }

  /** Stripe's word for an event, from the webhook (worker/index.ts hands it over unread) */
  async stripeWebhook(raw: string, sig: string): Promise<{ status: number; body: string }> {
    const pay = this.payFor();
    if (!pay) return { status: 503, body: "no key" };
    return pay.webhook(raw, sig);
  }

  /* ================= accounts ================= */

  private isAdmin(u: U) {
    const list = (this.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    return list.includes(String(u.email)) || this.isMaster(u);
  }

  /** The owner's own account: the back office, and the one way in while the site is paused. */
  private isMaster(u: U) {
    const m = (this.env.MASTER_EMAIL ?? "").trim().toLowerCase();
    return !!m && u.email === m;
  }

  private async session(token: string): Promise<U | null> {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
    const h = await sha(token);
    const s = this.one(`SELECT user_id, expires, last_used FROM sessions WHERE hash = ?`, h);
    const now = Date.now();
    if (!s || Number(s.expires) < now) return null;
    if (now - Number(s.last_used) > 3600_000) this.sql.exec(`UPDATE sessions SET last_used = ?, expires = ? WHERE hash = ?`, now, now + SESSION_TTL, h);
    const u = this.userById(String(s.user_id));
    return u && !u.banned ? u : null;
  }

  private isBanned(k: string) {
    return !!this.one(`SELECT 1 AS x FROM bans WHERE k = ?`, k);
  }

  /** Note the phone a signed-in person is using (so a ban can reach the phone too). */
  private noteDevice(uid: string, device: string) {
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(device)) return;
    const k = `${uid}|${device}`;
    const now = Date.now();
    if (now - (this.seenDevice.get(k) ?? 0) < 3600_000) return;
    this.seenDevice.set(k, now);
    if (this.seenDevice.size > 5000) this.seenDevice.clear();
    this.sql.exec(`INSERT INTO devices (user_id, device, at) VALUES (?, ?, ?) ON CONFLICT(user_id, device) DO UPDATE SET at = excluded.at`, uid, device, now);
  }

  private userById(id: string): U | null {
    const r = this.one(`SELECT * FROM users WHERE id = ?`, id);
    return r ? asUser(r) : null;
  }

  private userByEmail(email: string): U | null {
    const r = this.one(`SELECT * FROM users WHERE email = ?`, email);
    return r ? asUser(r) : null;
  }

  private selfView(u: U) {
    const f = this.figure(u.id);
    return { ...this.publicView(u), email: u.email, phone: u.phone, admin: this.isAdmin(u), master: this.isMaster(u), figure: f.shown, hasFigure: f.has, choices: f.choices, cut: f.cut, perks: u.perks, member: memberOf(this.sql, u.id, Date.now()), emailPending: pendingOf(this.sql, u.id) };
  }

  /**
   * Someone's AI-drawn figure: whether there is one, whether it's the face they show, what they
   * chose, and whether it's cut out for the stages (`fg`, its version, when shown and cut out).
   */
  private figure(id: string): { has: boolean; shown: boolean; choices: Choices | null; cut: boolean; fg: number } {
    const r = this.one(`SELECT shown, choices, cut IS NOT NULL AS has_cut, ver FROM figures WHERE user_id = ?`, id);
    if (!r) return { has: false, shown: false, choices: null, cut: false, fg: 0 };
    let choices: Choices | null = null;
    try {
      choices = cleanChoices(JSON.parse(String(r.choices)));
    } catch {
      choices = null;
    }
    const shown = Number(r.shown) === 1;
    const cut = Number(r.has_cut) === 1;
    return { has: true, shown, choices, cut, fg: shown && cut ? Math.max(1, Number(r.ver)) : 0 };
  }

  /** A cut-out figure sent in (base64): a WebP or PNG of a sensible size. */
  private cutOf(b: Record<string, unknown>): { bytes: ArrayBuffer; mime: string } | null {
    const bytes = fromB64(b.cut, 400_000);
    const mime = String(b.cutMime ?? "");
    if (!bytes || bytes.byteLength < 1000 || !["image/png", "image/webp"].includes(mime) || !isImage(bytes)) return null;
    return { bytes, mime };
  }

  /** Make the figure's round crop the avatar everyone sees. */
  private showFigure(id: string) {
    const r = this.one(`SELECT round FROM figures WHERE user_id = ?`, id);
    if (!r) return;
    this.sql.exec(`INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?, 'image/jpeg', ?, ?) ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`, id, r.round as ArrayBuffer, Date.now());
    this.sql.exec(`UPDATE users SET av = av + 1 WHERE id = ?`, id);
  }

  /** Owner and admins draw without the monthly limit (they test it). */
  private drawsFree(u: U | null) {
    return !!u && this.isAdmin(u);
  }

  /** Who is asking to draw: a session, or a sign-up in progress (a ticket, no account yet). */
  private async drawer(g: { token: string; ticket: string }): Promise<{ who: string; u: U | null } | null> {
    if (g.token) {
      const u = await this.session(g.token);
      if (u) return { who: `e:${u.email}`, u };
    }
    if (g.ticket && /^[A-Za-z0-9_-]{20,80}$/.test(g.ticket)) {
      const t = this.one(`SELECT email, expires FROM tickets WHERE hash = ?`, await sha(g.ticket));
      if (t && Number(t.expires) > Date.now()) return { who: `e:${String(t.email)}`, u: null };
    }
    return null;
  }

  private month(who: string) {
    const month = new Date().toISOString().slice(0, 7);
    const r = this.one(`SELECT month, n, done FROM months WHERE k = ?`, who);
    if (!r || r.month !== month) return { month, n: 0, done: false };
    return { month, n: Number(r.n), done: Number(r.done) === 1 };
  }

  private monthDone(who: string) {
    const month = new Date().toISOString().slice(0, 7);
    this.sql.exec(
      `INSERT INTO months (k, month, n, done) VALUES (?, ?, 0, 1) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN month = excluded.month THEN n ELSE 0 END, done = 1, month = excluded.month`,
      who,
      month,
    );
  }

  /** How many drawings are left this month (null: no limit), before anyone takes a photo. */
  async drawAllowance(g: { token: string; ticket: string }): Promise<{ left: number | null; done: boolean; per: number } | { error: string }> {
    const p = await this.drawer(g);
    if (!p) return { error: "signin" };
    if (this.drawsFree(p.u)) return { left: null, done: false, per: DRAWS_PER_MONTH };
    const m = this.month(p.who);
    return { left: m.done ? 0 : Math.max(0, DRAWS_PER_MONTH - m.n), done: m.done, per: DRAWS_PER_MONTH };
  }

  /**
   * May this person have another AI drawing? Counts it if so (`drawRefund` gives it back when
   * the drawing failed on our side). `left` is what remains this month, or null for no limit.
   */
  async drawGate(g: { token: string; ticket: string; ip: string; limited?: boolean }): Promise<{ key: string; left: number | null } | { error: string }> {
    const p = await this.drawer(g);
    if (!p) return { error: "signin" };
    const free = this.drawsFree(p.u);
    // the limited outfits are the wishlist's reward (admins try them out freely)
    if (g.limited && !free && !p.u?.perks.includes("wish")) return { error: "locked" };
    if (this.paused && !(p.u && this.isMaster(p.u))) return { error: "paused" };
    if (this.isBanned(p.who)) return { error: "banned" };
    const day = new Date().toISOString().slice(0, 10);
    const used = (k: string) => Number(this.one(`SELECT n FROM draws WHERE k = ? AND day = ?`, k, day)?.n ?? 0);
    if (used("all") >= DRAWS_PER_DAY) return { error: "closed" };
    const m = this.month(p.who);
    if (!free) {
      if (m.done || m.n >= DRAWS_PER_MONTH) return { error: "month" };
      if (g.ip && used(`ip:${g.ip}`) >= DRAWS_PER_IP) return { error: "limit" };
    }
    for (const k of ["all", ...(g.ip && !free ? [`ip:${g.ip}`] : [])])
      this.sql.exec(`INSERT INTO draws (k, day, n) VALUES (?, ?, 1) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN day = excluded.day THEN n + 1 ELSE 1 END, day = excluded.day`, k, day);
    this.sql.exec(
      `INSERT INTO months (k, month, n, done) VALUES (?, ?, 1, 0) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN month = excluded.month THEN n + 1 ELSE 1 END, done = CASE WHEN month = excluded.month THEN done ELSE 0 END, month = excluded.month`,
      p.who,
      m.month,
    );
    return { key: p.who, left: free ? null : DRAWS_PER_MONTH - (m.n + 1) };
  }

  async drawRefund(g: { key: string; ip: string }) {
    const day = new Date().toISOString().slice(0, 10);
    for (const k of ["all", ...(g.ip ? [`ip:${g.ip}`] : [])]) this.sql.exec(`UPDATE draws SET n = MAX(0, n - 1) WHERE k = ? AND day = ?`, k, day);
    this.sql.exec(`UPDATE months SET n = MAX(0, n - 1) WHERE k = ? AND month = ?`, g.key, new Date().toISOString().slice(0, 7));
  }

  /** The figure someone chose, to redraw from (the phone needn't fetch and send it back). */
  async savedFigure(token: string): Promise<{ mime: string; b64: string } | null> {
    const u = await this.session(token);
    if (!u) return null;
    const r = this.one(`SELECT mime, full FROM figures WHERE user_id = ?`, u.id);
    return r ? { mime: String(r.mime), b64: toB64(r.full as ArrayBuffer) } : null;
  }

  /** A session kept in the sign-in cookie: still good? (For a phone whose storage was wiped.) */
  async restore(token: string): Promise<{ token: string; user: unknown } | null> {
    const u = await this.session(token);
    return u ? { token, user: this.selfView(u) } : null;
  }

  /** Is the site open? (Read by every phone now and then.) */
  async status(): Promise<{ paused: boolean }> {
    return { paused: this.paused };
  }

  /** The owner's edits to the site's words, for every page (lib/copy.ts). */
  async copy(): Promise<CopyMap> {
    return this.copyMap();
  }
  private copyMap(): CopyMap {
    const out = emptyCopy();
    for (const r of this.sql.exec(`SELECT lang, orig, text FROM copy`).toArray()) {
      if (r.lang === "zh" || r.lang === "en") out[r.lang][String(r.orig)] = String(r.text);
    }
    return out;
  }

  /** A phone sitting down at a table: who it is, and whether it may (paused site, banned phone). */
  async admit(a: { auth: string; pid: string }): Promise<Admit> {
    const u = a.auth ? await this.session(a.auth) : null;
    const master = !!u && this.isMaster(u);
    if (!master) {
      if (this.isBanned(`d:${a.pid}`)) return { who: null, block: "banned" };
      if (this.paused) return { who: null, block: "paused" };
    }
    if (u) this.noteDevice(u.id, a.pid);
    return {
      who: u ? { uid: u.id, name: u.name, av: u.av, ac: u.ac, fg: this.figure(u.id).fg, ...(u.perks.includes("wish") ? { fr: "gold" } : {}) } : null,
      ...(u && this.isAdmin(u) ? { owner: true } : {}),
    };
  }

  /**
   * The DJ booth's Lyria test, all tables together this month: adds `add` seconds streamed and
   * says how much is used of the cap (an experimental model with no published price: the cap is
   * the guard). A table stops its stream when the cap is reached.
   */
  async lyriaMeter(add: number): Promise<{ used: number; cap: number }> {
    // DJ_LYRIA_HOURS=0 switches Lyria off; unset (or not a number) is 20
    const h = Number(this.env.DJ_LYRIA_HOURS ?? "");
    const cap = Math.round((this.env.DJ_LYRIA_HOURS !== undefined && this.env.DJ_LYRIA_HOURS !== "" && Number.isFinite(h) ? Math.max(0, h) : 20) * 3600);
    const month = new Date().toISOString().slice(0, 7);
    const secs = Math.max(0, Math.min(3600, Math.round(Number(add) || 0)));
    this.sql.exec(
      `INSERT INTO months (k, month, n, done) VALUES ('lyria', ?, ?, 0) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN month = excluded.month THEN n + excluded.n ELSE excluded.n END, month = excluded.month`,
      month,
      secs,
    );
    const r = this.one(`SELECT n FROM months WHERE k = 'lyria' AND month = ?`, month);
    return { used: Number(r?.n ?? 0), cap };
  }

  /** A table says who is at it (only when that changed). An empty table drops off the list. */
  async roomReport(r: RoomReport) {
    if (!/^[A-Z0-9]{4}$/.test(r.code)) return;
    const live = r.seats.some((s) => s.on) || r.screens > 0;
    if (!live) {
      this.sql.exec(`DELETE FROM rooms_live WHERE code = ?`, r.code);
      return;
    }
    const seats = r.seats.slice(0, 20).map((s) => ({ pid: String(s.pid).slice(0, 48), name: clean(s.name, 14), on: !!s.on, ...(s.uid ? { uid: String(s.uid).slice(0, 24) } : {}) }));
    this.sql.exec(
      `INSERT INTO rooms_live (code, game, seats, screens, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET game = excluded.game, seats = excluded.seats, screens = excluded.screens, at = excluded.at`,
      r.code,
      clean(r.game, 20),
      JSON.stringify(seats),
      Math.max(0, Math.min(20, Number(r.screens) || 0)),
      Date.now(),
    );
  }

  private publicView(u: U) {
    return {
      id: u.id,
      name: u.name,
      city: u.city,
      gender: u.gender,
      bio: u.bio,
      av: u.av,
      ac: u.ac,
      handle: u.handle,
      since: u.created_at,
      ...(u.perks.includes("wish") ? { frame: "gold" } : {}),
      // a member's mark beside their face (docs/membership.md)
      ...(memberOf(this.sql, u.id, Date.now()) ? { member: true } : {}),
    };
  }

  /** A reward onto an account (once), and the news to their phone if it's open. */
  private grantPerk(uid: string, perk: string, about: string) {
    const u = this.userById(uid);
    if (!u || u.perks.includes(perk)) return;
    this.sql.exec(`UPDATE users SET perks = ? WHERE id = ?`, [...u.perks, perk].join(","), uid);
    this.push(uid, { t: "perk", perk, about: clean(about, 200) });
  }

  /** Who holds this session (for the table server). */
  async whoami(token: string): Promise<Who | null> {
    const u = await this.session(token);
    return u ? { uid: u.id, name: u.name, av: u.av, ac: u.ac, fg: this.figure(u.id).fg, ...(u.perks.includes("wish") ? { fr: "gold" } : {}) } : null;
  }

  private async sendCode(raw: string, ip: string, lang: "zh" | "en"): Promise<Reply> {
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return err(400, "email");
    if (this.isBanned(`e:${email}`)) return err(403, "banned");
    const now = Date.now();
    const prev = this.one(`SELECT sent_at FROM codes WHERE email = ?`, email);
    if (prev && now - Number(prev.sent_at) < 45_000) return err(429, "wait");
    if (!this.allow(`code:${email}`, 6, 3600_000) || !this.allow(`codeip:${ip}`, 20, 3600_000)) return err(429, "slow-down");
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const hash = await sha(`${this.pepper}|${email}|${code}`);
    this.sql.exec(
      `INSERT INTO codes (email, hash, expires, attempts, sent_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(email) DO UPDATE SET hash = excluded.hash, expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at`,
      email,
      hash,
      now + CODE_TTL,
      now,
    );
    if (this.env.DEV_SHOW_CODES === "1") return ok({ sent: true, dev: code });
    try {
      await this.mail(email, code, lang);
    } catch (e) {
      console.error("mail", e);
      this.sql.exec(`DELETE FROM codes WHERE email = ?`, email);
      return err(503, String((e as Error).message) === "no-mail" ? "no-mail" : "mail-failed");
    }
    return ok({ sent: true });
  }

  /* ================= 换邮箱 (emailChange.ts) ================= */

  /** the peppered hash of an address and a code, for this account's 换邮箱 codes */
  private emailHash(id: string) {
    return (email: string, code: string) => sha(`${this.pepper}|email|${id}|${email}|${code}`);
  }

  /** banned, or an address the settings give an admin's rights to */
  private emailUnusable(u: U, email: string) {
    return this.isBanned(`e:${email}`) || this.isAdmin({ ...u, email });
  }

  private async emailStart(me: U, raw: string, ip: string, lang: "zh" | "en"): Promise<Reply> {
    const r = await startEmail(this.sql, { id: me.id, email: me.email, admin: this.isAdmin(me) }, raw, {
      // (a sign-in code to the address moments ago counts as one of these)
      recent: (email) => !!this.one(`SELECT 1 AS x FROM codes WHERE email = ? AND sent_at > ?`, email, Date.now() - 45_000),
      // the address's hourly limit shared with its sign-in codes, and 20 an hour per IP (with sign-in's)
      allow: (email) => this.allow(`code:${email}`, 6, 3600_000) && this.allow(`codeip:${ip}`, 20, 3600_000),
      hash: this.emailHash(me.id),
    });
    if ("status" in r) return r;
    if (this.env.DEV_SHOW_CODES === "1") return ok({ sent: true, dev: r.code, devNow: r.oldCode });
    try {
      await this.mail(r.email, r.code, lang, "email");
      await this.mail(me.email, r.oldCode, lang, "email-now", r.email);
    } catch (e) {
      console.error("mail", e);
      dropEmail(this.sql, me.id, r.hash);
      return err(503, String((e as Error).message) === "no-mail" ? "no-mail" : "mail-failed");
    }
    return ok({ sent: true });
  }

  private async emailConfirm(me: U, b: Record<string, unknown>, lang: "zh" | "en", c: Call): Promise<Reply> {
    const session = await sha(c.token);
    const typed = { code: String(b.code ?? ""), oldCode: typeof b.oldCode === "string" ? b.oldCode : undefined, lost: b.lost === true };
    const r = await confirmEmail(this.sql, { id: me.id, email: me.email, admin: this.isAdmin(me) }, typed, {
      hash: this.emailHash(me.id),
      unusable: (email) => this.emailUnusable(me, email),
      ip: c.ip,
      device: c.device,
      session,
      lang,
    });
    if ("status" in r) return r;
    if ("waiting" in r) {
      // the address the account has now hears at once, with the link that cancels it; the account's
      // other phones show it too
      queueMail(this.sql, this.waitingNote(me.email, r.waiting.email, r.waiting.due, r.waiting.token));
      this.push(me.id, { t: "me" });
      this.kickNotices();
    } else this.emailMade(me.id, r.made, lang, session, true);
    return ok({ user: this.selfView(this.userById(me.id)!) });
  }

  /**
   * A change made (now, or on its day): the account's other phones signed out (`keep`: the one
   * that asked), its handoff codes dropped; the old address told, and MoneyLens (an account that
   * has used it, bound yet or not) told to end its sessions there, both tried until they're heard.
   */
  private emailMade(id: string, made: { old: string; email: string }, lang: "zh" | "en", keep: string, kick: boolean) {
    this.signOutOthers(id, keep);
    // (waiting handoff codes go even with no other phone to sign out: one asked for just before the change can't be traded after it)
    forgetHandoffs(this.sql, id, false);
    this.push(id, { t: "me" });
    queueMail(this.sql, this.changedNote(made.old, made.email));
    if (appsUsed(this.sql, id).includes("money")) noteGone(this.sql, id, ["money-changed"]);
    if (kick) this.kickNotices();
  }

  /**
   * Every phone signed in to the account signed out but one (`keep`: its session's hash): their
   * sessions gone, their live sockets closed (4006: the app signs out), handoff codes dropped.
   * Gives how many sessions went.
   */
  private signOutOthers(id: string, keep: string) {
    const gone = this.sql.exec(`SELECT hash FROM sessions WHERE user_id = ? AND hash != ?`, id, keep).toArray().map((r) => String(r.hash));
    this.endSessions(id, gone);
    return gone.length;
  }

  /**
   * 退出其他手机: the account's phones signed in BEFORE this one, signed out. A fresh sign-in needs
   * the mailbox, so the owner signing in again always wins over an older session someone else
   * holds; a stolen session can't sign out the newer ones. A waiting 换邮箱 whose phone is now
   * signed out (or already was) is cancelled with it; one asked from a phone still signed in stays.
   * Gives how many went, how many newer ones are left, and whether a waiting change was cancelled.
   */
  private signOutOlder(id: string, keep: string) {
    const mine = Number(this.one(`SELECT created_at FROM sessions WHERE hash = ?`, keep)?.created_at ?? 0);
    const gone = this.sql.exec(`SELECT hash FROM sessions WHERE user_id = ? AND hash != ? AND created_at <= ?`, id, keep, mine).toArray().map((r) => String(r.hash));
    this.endSessions(id, gone);
    const had = !!this.one(`SELECT 1 AS x FROM email_pending WHERE user_id = ?`, id);
    this.sql.exec(`DELETE FROM email_pending WHERE user_id = ? AND session NOT IN (SELECT hash FROM sessions WHERE user_id = ?)`, id, id);
    const cancelled = had && !this.one(`SELECT 1 AS x FROM email_pending WHERE user_id = ?`, id);
    if (cancelled) this.push(id, { t: "me" });
    const left = Number(this.one(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND hash != ?`, id, keep)?.n ?? 0);
    return { out: gone.length, left, cancelled };
  }

  /** these sessions of the account gone: their live sockets closed (4006: the app signs out), handoff codes dropped */
  private endSessions(id: string, hashes: string[]) {
    if (!hashes.length) return;
    const gone = new Set(hashes);
    for (const h of hashes) this.sql.exec(`DELETE FROM sessions WHERE hash = ?`, h);
    forgetHandoffs(this.sql, id, false);
    for (const ws of this.ctx.getWebSockets(id)) {
      const a = ws.deserializeAttachment() as { s?: string } | null;
      // (a socket from before sockets carried their session: closed too, and back at once if its session lives)
      if (!a?.s || gone.has(a.s))
        try {
          ws.close(4006, "signed out");
        } catch {
          /* gone */
        }
    }
  }

  /** the notices and mail just queued: sent now, the alarm set in case they don't go */
  private kickNotices() {
    this.ctx.waitUntil(
      this.armGone()
        .then(() => this.tellGone())
        .catch((e) => console.error("hub: notices", e)),
    );
  }

  /** the waiting changes whose three days are up: checked again and made (on the alarm) */
  private makeDueEmails() {
    // (paused, nobody can cancel: nothing is made, and what's due waits another hour)
    if (this.paused) return postponeDue(this.sql, Date.now());
    for (const p of takeDue(this.sql, Date.now())) {
      const u = this.userById(p.id);
      if (!u || u.banned || this.isAdmin(u)) continue;
      const made = makeEmail(this.sql, p.id, p.email, { unusable: (e) => this.emailUnusable(u, e), ip: p.ip, device: p.device, now: Date.now() });
      if ("status" in made) {
        console.error(`hub: a waiting email change wasn't made (${made.json.error})`);
        // the new address hears why, and the account's phones stop showing it
        queueMail(this.sql, this.notMadeNote(p.email, made.json.error, p.lang));
        this.push(p.id, { t: "me" });
        continue;
      }
      this.emailMade(p.id, made, p.lang, p.session, false);
      queueMail(this.sql, this.newAddressNote(made.email, p.lang));
    }
  }

  /** the site's contact for replies to these mails: CONTACT_EMAIL, or else the first of ADMIN_EMAILS (not the sending address) */
  private replyTo() {
    const contact = (this.env.CONTACT_EMAIL || (this.env.ADMIN_EMAILS ?? "").split(",")[0] || "").trim();
    return contact ? { replyTo: contact } : {};
  }

  /** a mail in the sign-in code's frame: lines of text, and a button if there's a link */
  private frame(lines: string[], note: string, link?: { href: string; label: string }) {
    const body = lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("\n");
    const button = link
      ? `<p style="margin:8px 0 18px"><a href="${esc(link.href)}" style="display:inline-block;background:#b072ff;color:#0e0c22;font-weight:800;text-decoration:none;padding:12px 20px;border-radius:999px">${esc(link.label)}</a></p>`
      : "";
    return `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#0e0c22;color:#f5f4fd;padding:32px;border-radius:20px;max-width:440px">
<p style="font-size:22px;font-weight:800;margin:0 0 18px">changle<span style="color:#b072ff">.</span></p>
${body}${button}${note ? `\n<p style="margin:0;color:#b6b4d0;font-size:14px">${esc(note)}</p>` : ""}</div>`;
  }

  /**
   * The note to the old address once the change is made: the new one masked, and what to do if it
   * wasn't them. In both languages: whoever asked chose the language, and it might not be the
   * owner's.
   */
  private changedNote(old: string, now: string): Mail {
    const subject = `你的 changle 账号换了邮箱 · Your changle account has a new email`;
    const zh = [`你的 changle 账号的登录邮箱换成了 ${masked(now)}，以后用它登录。不是你本人换的话，请马上回复这封邮件告诉我们。`];
    const en = [`Your changle account now signs in with ${masked(now)}. If you didn't change it, reply to this email right away.`];
    return { to: old, subject, html: this.frame([...zh, ...en], ""), text: [...zh, ...en].join("\n\n"), ...this.replyTo() };
  }

  /**
   * To the address the account has now, when the change waits its three days: when, and the link
   * that cancels it. In both languages, as above.
   */
  private waitingNote(old: string, now: string, due: number, token: string): Mail {
    const href = `https://changle.ca/me/email-cancel#${token}`;
    const subject = `你的 changle 账号 3 天后换邮箱 · Your changle account's email changes in 3 days`;
    const zh = `有人要把你的 changle 账号的登录邮箱换成 ${masked(now)}，${when(due, "zh")}生效。对方说这个邮箱收不到信了，所以要等 3 天。是你本人的话，不用做什么；不是你的话，马上点下面的按钮取消。`;
    const en = `Someone asked to move your changle account to ${masked(now)}. It happens ${when(due, "en")}. They said this address no longer gets mail, so it waits 3 days. If it was you, there's nothing to do. If not, cancel it now with the button below.`;
    const label = "取消这次换邮箱 · Cancel this change";
    return { to: old, subject, html: this.frame([zh, en], "", { href, label }), text: `${zh}\n\n${en}\n\n${label}: ${href}`, ...this.replyTo() };
  }

  /** to the new address when a waiting change couldn't be made on its day: why */
  private notMadeNote(now: string, why: string, lang: "zh" | "en"): Mail {
    const zh = lang === "zh";
    const subject = zh ? "你的 changle 账号没换成这个邮箱" : "Your changle account didn't move to this email";
    const lead = why === "taken" ? (zh ? "这个邮箱这几天里有了一个 changle 账号，所以没换成。" : "This address got a changle account of its own in the meantime, so the change wasn't made.") : zh ? "这个邮箱不能用，所以没换成。" : "This address can't be used, so the change wasn't made.";
    const note = zh ? "账号还用原来的邮箱登录。" : "The account still signs in with its old email.";
    return { to: now, subject, html: this.frame([lead], note), text: `${lead}\n\n${note}`, ...this.replyTo() };
  }

  /** to the new address once a waiting change is made */
  private newAddressNote(now: string, lang: "zh" | "en"): Mail {
    const zh = lang === "zh";
    const subject = zh ? "你的 changle 账号换好邮箱了" : "Your changle account's email has changed";
    const lead = zh ? "以后用这个邮箱登录 changle。" : "From now on, sign in to changle with this address.";
    const note = zh ? "不是你本人操作的话，请马上回复这封邮件告诉我们。" : "If this wasn't you, reply to this email right away.";
    return { to: now, subject, html: this.frame([lead], note), text: `${lead}\n\n${note}`, ...this.replyTo() };
  }

  private async mail(to: string, code: string, lang: "zh" | "en", what: "signin" | "email" | "email-now" = "signin", newAddress = "") {
    if (what === "email-now") return this.nowCodeMail(to, code, newAddress);
    const zh = lang === "zh";
    const subject = what === "signin" ? (zh ? `changle 验证码 ${code}` : `Your changle code: ${code}`) : zh ? `changle 换邮箱验证码 ${code}` : `Your changle code for the new email: ${code}`;
    const lead = what === "email" ? (zh ? "确认这是你的新邮箱，验证码：" : "To make this your changle email, the code is:") : zh ? "你的登录验证码：" : "Your sign-in code:";
    const note = zh ? "10 分钟内有效。不是你本人操作的话，忽略这封邮件就好。" : "It works for 10 minutes. If you didn't ask for it, ignore this email.";
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#0e0c22;color:#f5f4fd;padding:32px;border-radius:20px;max-width:440px">
<p style="font-size:22px;font-weight:800;margin:0 0 18px">changle<span style="color:#b072ff">.</span></p>
<p style="margin:0 0 8px;color:#b6b4d0">${esc(lead)}</p>
<p style="font-size:40px;font-weight:800;letter-spacing:8px;margin:0 0 18px">${code}</p>
<p style="margin:0;color:#7f7c9d;font-size:13px">${note}</p></div>`;
    await this.deliver({ to, subject, html, text: `${lead} ${code}\n\n${note}` });
  }

  /** the code for the address the account has now: what's asked, in both languages (whoever asked chose the language) */
  private async nowCodeMail(to: string, code: string, newAddress: string) {
    const subject = `changle 换邮箱验证码 ${code} · Your changle code to confirm the email change`;
    const zh = `有人要把你的 changle 账号的登录邮箱换成 ${masked(newAddress)}。是你本人的话，把这个验证码也填进去。不是你的话，别把它告诉任何人。`;
    const en = `Someone asked to move your changle account to ${masked(newAddress)}. If it was you, type this code in too. If not, don't give it to anyone.`;
    const note = "10 分钟内有效 · It works for 10 minutes.";
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#0e0c22;color:#f5f4fd;padding:32px;border-radius:20px;max-width:440px">
<p style="font-size:22px;font-weight:800;margin:0 0 18px">changle<span style="color:#b072ff">.</span></p>
<p style="margin:0 0 8px;color:#b6b4d0">${esc(zh)}</p>
<p style="margin:0 0 8px;color:#b6b4d0">${esc(en)}</p>
<p style="font-size:40px;font-weight:800;letter-spacing:8px;margin:0 0 18px">${code}</p>
<p style="margin:0;color:#7f7c9d;font-size:13px">${esc(note)}</p></div>`;
    await this.deliver({ to, subject, html, text: `${zh}\n${en}\n\n${code}\n\n${note}` });
  }

  /** One mail out through Resend (or, locally, DEV_MAIL_URL). Throws "no-mail" without a key, "resend …" when Resend says no. */
  private async deliver(m: Mail) {
    const key = this.env.RESEND_API_KEY;
    const url = this.env.DEV_MAIL_URL || "https://api.resend.com/emails";
    if (!key && !this.env.DEV_MAIL_URL) throw new Error("no-mail");
    // (Resend turns away any request without a User-Agent, and a Worker's fetch sends none)
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key ?? ""}`, "Content-Type": "application/json", "User-Agent": "changle/1.0 (+https://changle.ca)" },
      body: JSON.stringify({ from: this.env.MAIL_FROM || "changle <hello@changle.ca>", to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
    });
    if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  /**
   * A notice another Worker sends through the Mail door (worker/mail.ts, worker/notice.ts): to an
   * account here, within the app's allowance for the day, in the sign-in mail's frame. The answer is
   * one of three: sent, full (the day's allowance is used up), failed (and why).
   */
  async notice(raw: unknown): Promise<Sent> {
    const n = cleanNotice(raw, this.env.DEV_SHOW_CODES === "1");
    if (typeof n === "string") return { status: "failed", why: n };
    const who = this.one(`SELECT id, banned FROM users WHERE email = ?`, n.to);
    if (!who || Number(who.banned ?? 0) === 1) return { status: "failed", why: "to" };
    const day = new Date().toISOString().slice(0, 10);
    const used = Number(this.one(`SELECT n FROM mails WHERE k = ? AND day = ?`, n.app, day)?.n ?? 0);
    if (used >= NOTICES_A_DAY[n.app]) return { status: "full" };
    // counted before it goes out (two at once can't both take the last one), given back if it didn't
    this.sql.exec(`INSERT INTO mails (k, day, n) VALUES (?, ?, 1) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN day = excluded.day THEN n + 1 ELSE 1 END, day = excluded.day`, n.app, day);
    try {
      await this.deliver({ to: n.to, ...renderNotice(n) });
    } catch (e) {
      console.error("notice", n.app, e);
      this.sql.exec(`UPDATE mails SET n = MAX(0, n - 1) WHERE k = ? AND day = ?`, n.app, day);
      return { status: "failed", why: String((e as Error).message) === "no-mail" ? "no-mail" : "mail" };
    }
    return { status: "sent" };
  }

  private async verify(raw: string, code: string, ip: string): Promise<Reply> {
    const email = raw.trim().toLowerCase();
    if (!this.allow(`verify:${ip}`, 40, 3600_000)) return err(429, "slow-down");
    if (this.isBanned(`e:${email}`)) return err(403, "banned");
    const row = this.one(`SELECT hash, expires, attempts FROM codes WHERE email = ?`, email);
    if (!row) return err(400, "no-code");
    if (Number(row.expires) < Date.now()) return err(400, "expired");
    if (Number(row.attempts) >= 5) return err(429, "too-many");
    const hash = await sha(`${this.pepper}|${email}|${code.replace(/\D/g, "")}`);
    if (hash !== row.hash) {
      this.sql.exec(`UPDATE codes SET attempts = attempts + 1 WHERE email = ?`, email);
      return err(400, "wrong");
    }
    this.sql.exec(`DELETE FROM codes WHERE email = ?`, email);
    const found = this.one(`SELECT * FROM users WHERE email = ?`, email);
    if (found) {
      const user = asUser(found);
      return ok({ token: await this.newSession(user.id), user: this.selfView(user) });
    }
    const ticket = randomToken(32);
    this.sql.exec(`INSERT INTO tickets (hash, email, expires) VALUES (?, ?, ?)`, await sha(ticket), email, Date.now() + TICKET_TTL);
    return ok({ ticket, email });
  }

  private async signup(ticket: string, b: Record<string, unknown>): Promise<Reply> {
    const t = this.one(`SELECT email, expires FROM tickets WHERE hash = ?`, await sha(ticket));
    if (!t || Number(t.expires) < Date.now()) return err(400, "ticket");
    if (b.adult !== true) return err(400, "adult");
    const p = profileFields(b);
    if ("error" in p) return err(400, p.error);
    const email = String(t.email);
    if (this.isBanned(`e:${email}`)) return err(403, "banned");
    if (this.one(`SELECT id FROM users WHERE email = ?`, email)) return err(400, "exists");
    const id = "u" + randomId(12);
    let handle = randomHandle();
    while (this.one(`SELECT id FROM users WHERE handle = ?`, handle)) handle = randomHandle();
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO users (id, email, name, phone, city, gender, bio, av, ac, handle, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      id,
      email,
      p.name,
      p.phone,
      p.city,
      p.gender,
      p.bio,
      p.ac,
      handle,
      now,
      now,
    );
    this.sql.exec(`DELETE FROM tickets WHERE hash = ?`, await sha(ticket));
    return ok({ token: await this.newSession(id), user: this.selfView(this.userById(id)!) });
  }

  private async newSession(uid: string) {
    const token = randomToken(32);
    const now = Date.now();
    this.sql.exec(`INSERT INTO sessions (hash, user_id, created_at, last_used, expires) VALUES (?, ?, ?, ?, ?)`, await sha(token), uid, now, now, now + SESSION_TTL);
    this.sql.exec(`DELETE FROM sessions WHERE expires < ?`, now);
    return token;
  }

  private deleteUser(id: string) {
    // a subscription stops renewing at once (a lifetime place comes back)
    const pay = this.payFor();
    if (pay) this.ctx.waitUntil(pay.end(id));
    for (const s of [
      `DELETE FROM sessions WHERE user_id = ?`,
      `DELETE FROM devices WHERE user_id = ?`,
      `DELETE FROM avatars WHERE user_id = ?`,
      `DELETE FROM figures WHERE user_id = ?`,
      `DELETE FROM looks WHERE user_id = ?`,
      `DELETE FROM history WHERE user_id = ?`,
      `DELETE FROM friends WHERE a = ? OR b = ?`,
      `DELETE FROM messages WHERE a = ? OR b = ?`,
      `DELETE FROM blocks WHERE user_id = ? OR blocked = ?`,
      `UPDATE wishes SET user_id = NULL WHERE user_id = ?`,
      `DELETE FROM scenes WHERE user_id = ?`,
      `UPDATE sf_reports SET user_id = NULL WHERE user_id = ?`,
      `DELETE FROM members WHERE uid = ?`,
      `DELETE FROM users WHERE id = ?`,
    ]) {
      const n = (s.match(/\?/g) ?? []).length;
      this.sql.exec(s, ...Array(n).fill(id));
    }
    for (const ws of this.ctx.getWebSockets(id)) {
      try {
        ws.close(4003, "deleted");
      } catch {
        /* gone */
      }
    }
    // the apps that keep their own for an account (两清's receipt photos and ledgers; MoneyLens's
    // records and keys, for an account that has used it, its binding in place yet or not): told
    // now, and again on the alarm until each has heard (goneNotices.ts)
    // (a waiting 换邮箱 code and the account's email history go; MoneyLens's "email changed" notice
    // gives way to "gone")
    forgetEmail(this.sql, id);
    this.sql.exec(`DELETE FROM gone_notices WHERE user_id = ? AND app = 'money-changed'`, id);
    const apps = [this.env.SPLIT ? "split" : "", ...forgetHandoffs(this.sql, id, true)].filter(Boolean);
    if (apps.length) {
      noteGone(this.sql, id, apps);
      this.ctx.waitUntil(
        this.armGone()
          .then(() => this.tellGone())
          .catch((e) => console.error("hub: gone notices", e)),
      );
    }
  }

  /** the alarm in a minute, unless one is set sooner: the next try, should this one not finish */
  private async armGone() {
    const at = Date.now() + 60_000;
    const set = await this.ctx.storage.getAlarm();
    if (set == null || set > at) await this.ctx.storage.setAlarm(at);
  }

  /** when the alarm should go off next: the earliest notice, mail or waiting email change (null: nothing waits) */
  private dueAt() {
    const at = [nextDue(this.sql), nextMail(this.sql), nextPending(this.sql)].filter((x): x is number => x != null);
    return at.length ? Math.min(...at) : null;
  }

  /**
   * The apps still to be told an account is gone (or its email changed), and the mail still to go
   * out (mailOut.ts); the alarm set for whichever is next, before the sends and after.
   */
  private async tellGone() {
    // (an email change whose three days are up is made first: what it says to send goes out in this pass)
    this.makeDueEmails();
    const wake = async () => {
      const at = this.dueAt();
      if (at != null) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 1000));
    };
    const money = this.env.MONEY;
    await Promise.all([
      sendGone(
        this.sql,
        {
          split: this.env.SPLIT && ((id) => this.env.SPLIT!.accountGone(id)),
          money: money && ((id) => money.accountGone(id)),
          // (not gone: its email changed, so MoneyLens ends its sessions there)
          "money-changed": money && ((id) => money.accountChanged(id)),
        },
        wake,
      ),
      sendMail(this.sql, (m) => this.deliver(m), wake),
    ]);
    await wake();
  }

  async alarm() {
    await this.tellGone();
  }

  /* ================= the Handoff door (handoff.ts): apps on their own domain ================= */

  /** a handoff code traded by its app: the account, or null (handoffCodes.ts) */
  async redeemHandoff(code: string, aud: string) {
    return redeemHandoff(this.sql, code, aud, (id) => {
      const u = this.userById(id);
      return u ? { banned: u.banned, master: this.isMaster(u) } : null;
    });
  }

  /** which of these accounts are still here (throws on a wrong question) */
  async accountsThere(ids: string[]) {
    return accountsThere(this.sql, ids);
  }

  /* ================= the Member door (member.ts): the tools ask before a counted step ================= */

  /** one use of a counted tool by an account: allowed and counted, or not (an unknown tool or account, a banned one: not) */
  async memberUse(uid: string, tool: string): Promise<UseResult> {
    const u = this.userById(uid);
    if (!u || u.banned || !isCounted(tool)) return { ok: false, member: false, left: null };
    return useTool(this.sql, u.id, tool, Date.now(), this.isMaster(u));
  }

  /** an account's membership and free uses left; null for an unknown account */
  async memberStatus(uid: string): Promise<Standing | null> {
    const u = this.userById(uid);
    return u ? standingOf(this.sql, u.id, Date.now(), this.isMaster(u)) : null;
  }

  /* ================= 戏精大赏's public library ================= */

  /** Up to n approved scenes, at random, in this language (or written in both), none by a banned writer. */
  private liveScenes(lang: string, n: number) {
    const l = lang === "en" ? "en" : "zh";
    const count = Math.max(1, Math.min(24, Number.isFinite(n) ? Math.round(n) : 12));
    const rows = this.sql
      .exec(`SELECT s.id, s.user_id, s.body, COALESCE(u.name, s.name) AS name FROM scenes s LEFT JOIN users u ON u.id = s.user_id WHERE s.status = 'live' AND s.lang IN (?, 'both') AND COALESCE(u.banned, 0) = 0 ORDER BY RANDOM() LIMIT ?`, l, count)
      .toArray() as Row[];
    return rows.map((r) => ({ id: Number(r.id), uid: String(r.user_id), name: String(r.name), scene: JSON.parse(String(r.body)) as unknown }));
  }

  /* ================= people and friends ================= */

  private relation(me: string, other: string): "self" | "friends" | "sent" | "received" | "none" | "blocked" {
    if (me === other) return "self";
    if (this.one(`SELECT 1 AS x FROM blocks WHERE (user_id = ? AND blocked = ?) OR (user_id = ? AND blocked = ?)`, me, other, other, me)) return "blocked";
    const [a, b] = pair(me, other);
    const f = this.one(`SELECT status, by FROM friends WHERE a = ? AND b = ?`, a, b);
    if (!f) return "none";
    if (f.status === "accepted") return "friends";
    return f.by === me ? "sent" : "received";
  }

  private befriend(me: U, other: string): Reply {
    const uid = me.id;
    if (uid === other || !this.userById(other)) return err(404, "none");
    const rel = this.relation(uid, other);
    if (rel === "blocked") return err(403, "blocked");
    if (!this.allow(`fr:${uid}`, 40, 3600_000)) return err(429, "slow-down");
    const [a, b] = pair(uid, other);
    if (rel === "received") this.sql.exec(`UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?`, a, b);
    else if (rel === "none") this.sql.exec(`INSERT INTO friends (a, b, status, by, created_at) VALUES (?, ?, 'pending', ?, ?)`, a, b, uid, Date.now());
    this.push(other, { t: "friends" });
    this.push(uid, { t: "friends" });
    return ok({ relation: this.relation(uid, other) });
  }

  private friendList(me: string) {
    const rows = this.sql
      .exec(
        `SELECT f.status, f.by, u.* FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END WHERE f.a = ? OR f.b = ? ORDER BY u.name`,
        me,
        me,
        me,
      )
      .toArray() as Row[];
    const friends: unknown[] = [];
    const incoming: unknown[] = [];
    const outgoing: unknown[] = [];
    for (const r of rows) {
      const view = this.publicView(asUser(r));
      if (r.status === "accepted") {
        const [a, b] = pair(me, String(r.id));
        const last = this.one(`SELECT from_id, body, created_at FROM messages WHERE a = ? AND b = ? ORDER BY id DESC LIMIT 1`, a, b);
        const unread = Number(this.one(`SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND from_id = ? AND read_at IS NULL`, a, b, String(r.id))?.n ?? 0);
        friends.push({ ...view, last: last ? { from: String(last.from_id), body: String(last.body), at: Number(last.created_at) } : null, unread });
      } else if (r.by === me) outgoing.push(view);
      else incoming.push(view);
    }
    friends.sort((x, y) => ((y as { last: { at: number } | null }).last?.at ?? 0) - ((x as { last: { at: number } | null }).last?.at ?? 0));
    const blocked = (this.sql.exec(`SELECT u.* FROM blocks k JOIN users u ON u.id = k.blocked WHERE k.user_id = ? ORDER BY u.name`, me).toArray() as Row[]).map((r) => this.publicView(asUser(r)));
    return { friends, incoming, outgoing, blocked };
  }

  private search(me: string, q: string) {
    if (!q) return [];
    const handle = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const rows = this.sql
      .exec(`SELECT * FROM users WHERE id != ? AND (handle = ? OR name LIKE ? ESCAPE '\\') ORDER BY (handle = ?) DESC, last_seen DESC LIMIT 20`, me, handle, `${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`, handle)
      .toArray() as Row[];
    return rows.map((r) => ({ ...this.publicView(asUser(r)), relation: this.relation(me, String(r.id)) }));
  }

  private thread(me: string, other: string, before: number) {
    const [a, b] = pair(me, other);
    const rows = this.sql
      .exec(`SELECT id, from_id, body, created_at, read_at FROM messages WHERE a = ? AND b = ? ${before ? "AND id < ?" : ""} ORDER BY id DESC LIMIT 60`, ...(before ? [a, b, before] : [a, b]))
      .toArray() as Row[];
    return rows.reverse().map((r) => ({ id: Number(r.id), from: String(r.from_id), body: String(r.body), at: Number(r.created_at), read: r.read_at !== null }));
  }

  /** Friend requests waiting for this person's answer. */
  private requests(me: string) {
    return Number(this.one(`SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND status = 'pending' AND by != ?`, me, me, me)?.n ?? 0);
  }

  /**
   * Unread messages, counted only in threads with people who are still friends: a thread that
   * ended (unfriended, or blocked by either side) can't be opened any more, so its unread messages
   * mustn't keep the badge up.
   */
  private unread(me: string) {
    return Number(
      this.one(
        `SELECT COUNT(*) AS n FROM messages m JOIN friends f ON f.a = m.a AND f.b = m.b AND f.status = 'accepted' WHERE (m.a = ? OR m.b = ?) AND m.from_id != ? AND m.read_at IS NULL`,
        me,
        me,
        me,
      )?.n ?? 0,
    );
  }

  /** Two people are no longer friends (one left, or blocked the other): both phones' lists and badges follow. */
  private parted(me: string, other: string) {
    for (const uid of [me, other]) {
      this.push(uid, { t: "friends" });
      this.push(uid, { t: "unread", n: this.unread(uid) });
    }
  }

  /* ================= history ================= */

  private history(uid: string, limit = 50) {
    const rows = this.sql.exec(`SELECT id, game, mode, room, players, drinks, minutes, created_at FROM history WHERE user_id = ? ORDER BY id DESC LIMIT ?`, uid, limit).toArray() as Row[];
    return rows.map((r) => ({ id: Number(r.id), game: String(r.game), mode: String(r.mode), room: String(r.room), players: safeJson(String(r.players)), drinks: Number(r.drinks), minutes: Number(r.minutes), at: Number(r.created_at) }));
  }

  private stats(uid: string) {
    const total = Number(this.one(`SELECT COUNT(*) AS n FROM history WHERE user_id = ?`, uid)?.n ?? 0);
    const drinks = Number(this.one(`SELECT COALESCE(SUM(drinks), 0) AS n FROM history WHERE user_id = ?`, uid)?.n ?? 0);
    const fav = this.one(`SELECT game, COUNT(*) AS n FROM history WHERE user_id = ? GROUP BY game ORDER BY n DESC LIMIT 1`, uid);
    const friends = Number(this.one(`SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'`, uid, uid)?.n ?? 0);
    return { games: total, drinks, favorite: fav ? String(fav.game) : null, friends };
  }

  /** The table server reports a finished online game. */
  recordGame(rec: GameRecord) {
    const minutes = Math.max(0, Math.round((rec.ended - rec.started) / 60000));
    const names = rec.players.map((p) => p.name).slice(0, 15);
    for (const p of rec.players) {
      if (!p.uid || !this.userById(p.uid)) continue;
      this.sql.exec(
        `INSERT INTO history (user_id, game, mode, room, players, drinks, minutes, created_at) VALUES (?, ?, 'online', ?, ?, ?, ?, ?)`,
        p.uid,
        rec.game.slice(0, 20),
        rec.room.slice(0, 8),
        JSON.stringify(names),
        Math.max(0, Math.min(999, p.drinks)),
        minutes,
        rec.ended,
      );
    }
  }

  /* ================= the owner's back office ================= */

  /** Every table with someone at it (one that went quiet for half a day is gone). */
  private liveRooms(): LiveRoom[] {
    this.sql.exec(`DELETE FROM rooms_live WHERE at < ?`, Date.now() - 12 * 3600_000);
    return (this.sql.exec(`SELECT code, game, seats, screens, at FROM rooms_live ORDER BY at DESC LIMIT 200`).toArray() as Row[]).map((r) => ({
      code: String(r.code),
      game: String(r.game),
      screens: Number(r.screens),
      at: Number(r.at),
      seats: (safeJson(String(r.seats)) as LiveRoom["seats"]) ?? [],
    }));
  }

  /** Signed-in people with the site open right now (their live socket). */
  private onlineUids(): string[] {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as { uid?: string } | null;
      if (a?.uid) ids.add(a.uid);
    }
    return [...ids];
  }

  private adminPerson(u: U, online: boolean, rooms: LiveRoom[]) {
    const at = rooms.find((r) => r.seats.some((s) => s.uid === u.id && s.on));
    return { ...this.publicView(u), email: u.email, banned: u.banned, online, seen: u.last_seen, master: this.isMaster(u), where: at ? { code: at.code, game: at.game } : null };
  }

  private roomStub(code: string): RoomRpc | null {
    const ns = this.env.ROOMS;
    return ns ? (ns.get(ns.idFromName(code)) as unknown as RoomRpc) : null;
  }

  private async roomKick(code: string, pid: string, ban: boolean) {
    try {
      return (await this.roomStub(code)?.adminKick(pid, ban)) ?? false;
    } catch (e) {
      console.error("admin kick", code, e);
      return false;
    }
  }

  /** Sign someone out everywhere and take them off any table they're at. */
  private async dropUser(u: U, ban: boolean) {
    this.sql.exec(`DELETE FROM sessions WHERE user_id = ?`, u.id);
    forgetHandoffs(this.sql, u.id, false);
    dropEmail(this.sql, u.id);
    cancelPending(this.sql, u.id);
    const msg = JSON.stringify({ t: ban ? "banned" : "kicked" });
    for (const ws of this.ctx.getWebSockets(u.id)) {
      try {
        ws.send(msg);
        ws.close(ban ? 4005 : 4006, ban ? "banned" : "kicked");
      } catch {
        /* gone */
      }
    }
    const jobs: Promise<boolean>[] = [];
    for (const r of this.liveRooms()) for (const s of r.seats) if (s.uid === u.id) jobs.push(this.roomKick(r.code, s.pid, ban));
    await Promise.allSettled(jobs);
  }

  private async admin(me: U, c: Call, path: string, b: Record<string, unknown>): Promise<Reply> {
    const m = c.method;
    const now = Date.now();

    // ---- members: everyone with a membership, and the owner giving or ending one (docs/membership.md) ----
    if (path === "/admin/members" && m === "GET") return ok({ members: listMembers(this.sql, now), lifeLeft: lifeLeft(this.sql) });
    if (path === "/admin/members" && m === "POST") {
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      const target = typeof b.uid === "string" ? this.userById(b.uid) : email ? this.userByEmail(email) : null;
      if (!target) return err(404, "no-account");
      if (b.end === true) {
        await this.payFor()?.end(target.id);
        revoke(this.sql, target.id);
        return ok({ members: listMembers(this.sql, now), lifeLeft: lifeLeft(this.sql) });
      }
      const note = typeof b.note === "string" ? b.note.trim().slice(0, 120) : "";
      const r = grant(this.sql, target.id, b.life === true ? { life: true } : { months: Number(b.months) }, note, me.id, now);
      if ("error" in r) return err(400, r.error);
      if (b.life === true) await this.payFor()?.stopRenewing(target.id);
      return ok({ members: listMembers(this.sql, now), lifeLeft: lifeLeft(this.sql) });
    }

    // ---- payments: what's set up in Stripe, and setting up what's missing (worker/stripe.ts) ----
    if (path === "/admin/stripe" && m === "GET") return ok(this.payAdmin());
    if (path === "/admin/stripe/setup" && m === "POST") {
      const pay = this.payFor();
      if (!pay) return err(400, this.env.STRIPE_SECRET_KEY ? "bad-key" : "no-key");
      try {
        await pay.setup();
      } catch (e) {
        console.error("stripe setup", e);
        return err(502, stripeWhy(e));
      }
      return ok(this.payAdmin());
    }

    // ---- the site's words, as the owner changed them by long-pressing (src/shared/copy.ts) ----
    if (path === "/admin/copy" && m === "GET") {
      const edits: CopyEdit[] = this.sql
        .exec(`SELECT lang, orig, text, at FROM copy ORDER BY at DESC`)
        .toArray()
        .map((r) => ({ lang: r.lang === "en" ? "en" : "zh", orig: String(r.orig), text: String(r.text), at: Number(r.at) }));
      return ok({ edits });
    }
    if (path === "/admin/copy" && m === "POST") {
      const lang = b.lang === "zh" || b.lang === "en" ? b.lang : null;
      const orig = typeof b.orig === "string" ? b.orig.trim() : "";
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!lang || !orig || orig.length > COPY_MAX || text.length > COPY_MAX) return err(400, "bad");
      // nothing, or the words as they were: back to the original
      if (!text || text === orig) this.sql.exec(`DELETE FROM copy WHERE lang = ? AND orig = ?`, lang, orig);
      else {
        const known = this.sql.exec(`SELECT 1 FROM copy WHERE lang = ? AND orig = ?`, lang, orig).toArray().length > 0;
        const count = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM copy`).one().n);
        if (!known && count >= COPY_LIMIT) return err(400, "full");
        this.sql.exec(
          `INSERT INTO copy (lang, orig, text, at) VALUES (?, ?, ?, ?) ON CONFLICT (lang, orig) DO UPDATE SET text = excluded.text, at = excluded.at`,
          lang,
          orig,
          text,
          now,
        );
      }
      return ok({ copy: this.copyMap() });
    }

    if (path === "/admin/overview" && m === "GET") {
      const rooms = this.liveRooms();
      // signed in with the site open, or sitting at a table (a phone can be at a table without the live socket)
      const ids = new Set([...this.onlineUids(), ...rooms.flatMap((r) => r.seats.filter((s) => s.on && s.uid).map((s) => s.uid!))]);
      const online = [...ids]
        .map((id) => this.userById(id))
        .filter((u): u is U => !!u)
        .map((u) => this.adminPerson(u, true, rooms))
        .sort((x, y) => Number(!!y.where) - Number(!!x.where) || x.name.localeCompare(y.name));
      const banned = (this.sql.exec(`SELECT * FROM users WHERE banned = 1 ORDER BY name LIMIT 200`).toArray() as Row[]).map((r) => this.adminPerson(asUser(r), false, rooms));
      // phones banned on their own (a guest at a table), not the ones that came with a banned account
      const devices = (this.sql.exec(`SELECT k, note, at FROM bans WHERE k LIKE 'd:%' AND note NOT LIKE 'user:%' ORDER BY at DESC LIMIT 200`).toArray() as Row[]).map((r) => ({
        device: String(r.k).slice(2),
        name: String(r.note),
        at: Number(r.at),
      }));
      const users = Number(this.one(`SELECT COUNT(*) AS n FROM users`)?.n ?? 0);
      const guests = rooms.reduce((n, r) => n + r.seats.filter((s) => s.on && !s.uid).length, 0);
      return ok({
        paused: this.paused,
        counts: { users, online: online.length, rooms: rooms.length, guests },
        online,
        rooms: rooms.map((r) => ({ ...r, seats: r.seats.map((s) => ({ ...s, banned: this.isBanned(`d:${s.pid}`), master: s.uid === me.id })) })),
        banned: { users: banned, devices },
      });
    }

    if (path === "/admin/users" && m === "GET") {
      const q = clean((c.body as { q?: string } | undefined)?.q ?? "", 60);
      const like = `%${q.replace(/[\\%_]/g, (x) => "\\" + x)}%`;
      const rows = (
        q
          ? this.sql.exec(`SELECT * FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR handle = ? ORDER BY last_seen DESC LIMIT 40`, like, like, q.toUpperCase())
          : this.sql.exec(`SELECT * FROM users ORDER BY last_seen DESC LIMIT 40`)
      ).toArray() as Row[];
      const rooms = this.liveRooms();
      const online = new Set(this.onlineUids());
      return ok({ users: rows.map((r) => asUser(r)).map((u) => this.adminPerson(u, online.has(u.id), rooms)) });
    }

    if (path === "/admin/kick" && m === "POST") {
      const uid = String(b.uid ?? "");
      if (uid) {
        if (uid === me.id) return err(400, "self");
        const u = this.userById(uid);
        if (!u) return err(404, "none");
        await this.dropUser(u, false);
        return ok({ ok: true });
      }
      const code = String(b.code ?? "").toUpperCase();
      const pid = String(b.pid ?? "");
      if (!/^[A-Z0-9]{4}$/.test(code) || !/^[A-Za-z0-9_-]{1,48}$/.test(pid)) return err(400, "bad");
      if (this.ownDevice(me.id, pid)) return err(400, "self");
      await this.roomKick(code, pid, false);
      return ok({ ok: true });
    }

    if (path === "/admin/ban" && m === "POST") {
      const on = b.on !== false;
      const uid = String(b.uid ?? "");
      if (uid) {
        if (uid === me.id) return err(400, "self");
        const u = this.userById(uid);
        if (!u) return err(404, "none");
        if (on) {
          this.sql.exec(`UPDATE users SET banned = 1 WHERE id = ?`, uid);
          this.sql.exec(`INSERT OR REPLACE INTO bans (k, note, at) VALUES (?, ?, ?)`, `e:${u.email}`, `user:${uid}`, now);
          // their phones too, so they can't sit down as a guest instead (never the owner's own)
          for (const r of this.sql.exec(`SELECT device FROM devices WHERE user_id = ?`, uid).toArray() as Row[])
            if (!this.ownDevice(me.id, String(r.device))) this.sql.exec(`INSERT OR IGNORE INTO bans (k, note, at) VALUES (?, ?, ?)`, `d:${String(r.device)}`, `user:${uid}`, now);
          await this.dropUser(u, true);
        } else {
          this.sql.exec(`UPDATE users SET banned = 0 WHERE id = ?`, uid);
          this.sql.exec(`DELETE FROM bans WHERE k = ? OR note = ?`, `e:${u.email}`, `user:${uid}`);
        }
        return ok({ ok: true });
      }
      const device = String(b.device ?? b.pid ?? "");
      if (!/^[A-Za-z0-9_-]{1,48}$/.test(device)) return err(400, "bad");
      if (!on) {
        this.sql.exec(`DELETE FROM bans WHERE k = ?`, `d:${device}`);
        return ok({ ok: true });
      }
      if (this.ownDevice(me.id, device)) return err(400, "self");
      this.sql.exec(`INSERT OR REPLACE INTO bans (k, note, at) VALUES (?, ?, ?)`, `d:${device}`, clean(b.name, 14), now);
      const jobs: Promise<boolean>[] = [];
      for (const r of this.liveRooms()) if (r.seats.some((s) => s.pid === device)) jobs.push(this.roomKick(r.code, device, true));
      await Promise.allSettled(jobs);
      return ok({ ok: true });
    }

    // 戏精大赏 scenes players sent in: the ones waiting, and the latest on the air
    if (path === "/admin/scenes" && m === "GET") {
      const rows = (status: string, n: number) =>
        (this.sql.exec(`SELECT s.*, u.email AS email, u.name AS uname FROM scenes s LEFT JOIN users u ON u.id = s.user_id WHERE s.status = ? ORDER BY s.id ${status === "new" ? "ASC" : "DESC"} LIMIT ?`, status, n).toArray() as Row[]).map((r) => ({
          id: Number(r.id),
          uid: String(r.user_id),
          name: String(r.uname ?? r.name),
          email: String(r.email ?? ""),
          lang: String(r.lang),
          status: String(r.status),
          at: Number(r.created_at),
          scene: JSON.parse(String(r.body)) as unknown,
        }));
      return ok({ waiting: rows("new", 100), live: rows("live", 100), counts: { waiting: Number(this.one(`SELECT COUNT(*) AS n FROM scenes WHERE status = 'new'`)?.n ?? 0), live: Number(this.one(`SELECT COUNT(*) AS n FROM scenes WHERE status = 'live'`)?.n ?? 0) } });
    }
    const sm = /^\/admin\/scenes\/(\d+)$/.exec(path);
    if (sm && m === "POST") {
      const st = String(b.status ?? "");
      if (!["live", "no", "new"].includes(st)) return err(400, "bad");
      this.sql.exec(`UPDATE scenes SET status = ?, decided_at = ? WHERE id = ?`, st, now, Number(sm[1]));
      return ok({ ok: true });
    }

    // 一本正经: the cards players flagged, and how every card plays (worker/straightface.ts)
    const sfa = sfAdmin(path, m, b, this.sql);
    if (sfa) return sfa;

    if (path === "/admin/pause" && m === "POST") {
      const on = b.on === true;
      // (open again: a 换邮箱 waiting through the pause gets at least a day more, for cancelling it)
      if (this.paused && !on) afterPause(this.sql, Date.now());
      this.paused = on;
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('paused', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, on ? "1" : "0");
      const msg = JSON.stringify({ t: "paused", on });
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as { uid?: string } | null;
        if (a?.uid === me.id) continue;
        try {
          ws.send(msg);
        } catch {
          /* gone */
        }
      }
      // every table empties at once, except the owner's own seat
      if (on)
        await Promise.allSettled(
          this.liveRooms().map(async (r) => {
            try {
              await this.roomStub(r.code)?.pauseAll(me.id);
            } catch (e) {
              console.error("pause", r.code, e);
            }
          }),
        );
      return ok({ paused: on });
    }

    return err(404, "not-found");
  }

  /** A phone the owner has used: never banned or kicked by mistake. */
  private ownDevice(uid: string, device: string) {
    return !!this.one(`SELECT 1 AS x FROM devices WHERE user_id = ? AND device = ?`, uid, device);
  }

  /* ================= live sockets ================= */

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const me = await this.session(token);
    if (!me) return new Response("signin", { status: 401 });
    // (`s`: the session's hash, so the account's other phones can be signed out and this one kept;
    // worked out before the socket is taken on, so nothing can happen between the two)
    const s = await sha(token);
    const pairSock = new WebSocketPair();
    const [client, server] = Object.values(pairSock) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [me.id]);
    server.serializeAttachment({ uid: me.id, s });
    server.send(JSON.stringify({ t: "hello", unread: this.unread(me.id), requests: this.requests(me.id), paused: this.paused && !this.isMaster(me) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 200) return;
    if (raw === "ping") {
      try {
        ws.send("pong");
      } catch {
        /* gone */
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* closed */
    }
  }

  private push(uid: string, msg: unknown) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(uid)) {
      try {
        ws.send(text);
      } catch {
        /* gone */
      }
    }
  }

  /* ================= wishlist ================= */

  private listWishes(device: string, uid: string): WishRow[] {
    const voter = uid || device;
    const rows = this.sql
      .exec(
        `SELECT w.id, w.text, w.description, w.rules, w.kind, w.name, w.status, w.created_at, w.votes, w.device, w.user_id,
           EXISTS(SELECT 1 FROM wish_votes v WHERE v.wish_id = w.id AND (v.voter = ? OR v.voter = ?)) AS voted
         FROM wishes w WHERE w.hidden = 0 ORDER BY w.created_at DESC LIMIT 300`,
        voter,
        device,
      )
      .toArray() as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      text: String(r.text),
      desc: String(r.description ?? ""),
      rules: String(r.rules ?? ""),
      kind: r.kind === "feature" ? "feature" : "game",
      name: String(r.name ?? ""),
      votes: Number(r.votes),
      status: (r.status === "planned" || r.status === "done" ? r.status : "new") as WishRow["status"],
      at: Number(r.created_at),
      voted: !!r.voted,
      mine: (device !== "" && r.device === device) || (!!uid && r.user_id === uid),
    }));
  }

  /** A new wish: its name, what it is and how it's played (each checked here, whatever the phone said). */
  private addWish(device: string, ip: string, w: { text: unknown; desc: unknown; rules: unknown; kind: unknown; name: unknown }, uid: string | null): WishRow | { error: string } {
    const t = clean(w.text, 200);
    // (two characters make a name: 掼蛋, 猜拳)
    if (t.length < 2) return { error: "too-short" };
    const desc = cleanLines(w.desc);
    if (desc.length < WISH_DESC[0]) return { error: "desc-short" };
    if (desc.length > WISH_DESC[1]) return { error: "desc-long" };
    const rules = cleanLines(w.rules);
    if (rules.length < WISH_RULES[0]) return { error: "rules-short" };
    if (rules.length > WISH_RULES[1]) return { error: "rules-long" };
    if (!this.allow(`w:${device}`, 6, 3600_000) || !this.allow(`wip:${ip}`, 20, 3600_000)) return { error: "slow-down" };
    const k = w.kind === "feature" ? "feature" : "game";
    const n = clean(w.name, 14);
    const now = Date.now();
    const row = this.sql.exec(`INSERT INTO wishes (text, description, rules, kind, name, created_at, device, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, t, desc, rules, k, n, now, device, uid).one();
    return { id: Number(row.id), text: t, desc, rules, kind: k, name: n, votes: 0, status: "new", at: now, voted: false, mine: true };
  }

  private vote(device: string, ip: string, id: number, up: boolean): { votes: number; voted: boolean } | { error: string } {
    if (!device) return { error: "no-device" };
    if (!this.allow(`v:${device}`, 120, 3600_000) || !this.allow(`vip:${ip}`, 400, 3600_000)) return { error: "slow-down" };
    if (!this.one(`SELECT id FROM wishes WHERE id = ? AND hidden = 0`, id)) return { error: "not-found" };
    const had = !!this.one(`SELECT 1 AS x FROM wish_votes WHERE wish_id = ? AND voter = ?`, id, device);
    if (up && !had) {
      this.sql.exec(`INSERT INTO wish_votes (wish_id, voter) VALUES (?, ?)`, id, device);
      this.sql.exec(`UPDATE wishes SET votes = votes + 1 WHERE id = ?`, id);
    } else if (!up && had) {
      this.sql.exec(`DELETE FROM wish_votes WHERE wish_id = ? AND voter = ?`, id, device);
      this.sql.exec(`UPDATE wishes SET votes = MAX(0, votes - 1) WHERE id = ?`, id);
    }
    return { votes: Number(this.one(`SELECT votes FROM wishes WHERE id = ?`, id)?.votes ?? 0), voted: up };
  }
}

/* ================= helpers ================= */

function pair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** Trim, collapse whitespace, drop control characters, cap the length. */
export function clean(s: unknown, max: number) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * clean() for a wish's description and rules, keeping line breaks (at most one empty line in a
 * row). Not cut short: addWish turns away what is too long. The wish form tidies the same way.
 */
function cleanLines(s: unknown) {
  return (typeof s === "string" ? s : "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function profileFields(b: Record<string, unknown>): { name: string; phone: string; city: string; gender: string; bio: string; ac: number } | { error: string } {
  const name = clean(b.name, 20);
  const phone = clean(b.phone, 24);
  const city = clean(b.city, 40);
  const gender = String(b.gender ?? "");
  const bio = clean(b.bio, 200);
  const ac = Math.max(0, Math.min(14, Math.round(Number(b.ac) || 0)));
  if (!name) return { error: "name" };
  if (!/^[+()\d\s.-]{7,24}$/.test(phone) || (phone.match(/\d/g) ?? []).length < 7) return { error: "phone" };
  if (!city) return { error: "city" };
  if (!GENDERS.includes(gender)) return { error: "gender" };
  return { name, phone, city, gender, bio, ac };
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(n: number) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

function randomId(n: number) {
  const a = "abcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (x) => a[x % a.length]).join("");
}

function randomHandle() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(r, (x) => HANDLE_ALPHABET[x % HANDLE_ALPHABET.length]).join("");
}

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return b64url(new Uint8Array(d));
}

function toB64(b: ArrayBuffer): string {
  const u = new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Base64 to bytes, or null if it isn't, or is bigger than `max` bytes. */
function fromB64(x: unknown, max: number): ArrayBuffer | null {
  if (typeof x !== "string" || x.length > Math.ceil((max * 4) / 3) + 4 || !/^[A-Za-z0-9+/]+=*$/.test(x)) return null;
  try {
    const bin = atob(x);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch {
    return null;
  }
}

/** Starts like a JPEG, PNG or WebP file. */
function isImage(b: ArrayBuffer): boolean {
  const u = new Uint8Array(b.slice(0, 12));
  const jpeg = u[0] === 0xff && u[1] === 0xd8;
  const png = u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47;
  const webp = u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45;
  return jpeg || png || webp;
}
