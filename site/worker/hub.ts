/**
 * The Hub: one Durable Object (SQLite) for everything that isn't a single table:
 * the wishlist, accounts (email codes, profiles, avatars), friends, chat and game history.
 * Phones talk to it through the Worker's /api routes (one `call` per request) and keep one
 * live socket open while signed in, for chat and friend requests as they happen.
 */
import { DurableObject } from "cloudflare:workers";

export type HubEnv = { RESEND_API_KEY?: string; MAIL_FROM?: string; ADMIN_EMAILS?: string; DEV_SHOW_CODES?: string };

export type Call = { method: string; path: string; token: string; device: string; ip: string; body?: unknown; bytes?: ArrayBuffer; type?: string };
export type Reply = { status: number; json?: unknown; bytes?: ArrayBuffer; type?: string; cache?: string };

export type WishRow = { id: number; text: string; kind: "game" | "feature"; name: string; votes: number; status: "new" | "planned" | "done"; at: number; voted: boolean; mine: boolean };
export type GameRecord = { game: string; room: string; started: number; ended: number; players: { pid: string; uid?: string; name: string; drinks: number }[] };
export type Who = { uid: string; name: string; av: number; ac: number };

const SEEDS: [string, string][] = [
  ["Punchline 神回复", "game"],
  ["Euchre 尤克牌", "game"],
  ["Freeze Dance 木头人蹦迪", "game"],
  ["Limbo 林波舞", "game"],
  ["Name That Tune 猜歌名", "game"],
  ["Post-it Note 额头便利贴", "game"],
  ["Superlatives 最佳称号", "game"],
];

const CODE_TTL = 10 * 60_000;
const TICKET_TTL = 30 * 60_000;
const SESSION_TTL = 180 * 86400_000;
const GENDERS = ["female", "male", "nonbinary", "private"];
const HANDLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

type Limit = { n: number; until: number };
type Row = Record<string, SqlStorageValue>;
type U = { id: string; email: string; name: string; phone: string; city: string; gender: string; bio: string; av: number; ac: number; handle: string; created_at: number };

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
  };
}

const ok = (json: unknown): Reply => ({ status: 200, json });
const err = (status: number, error: string): Reply => ({ status, json: { error } });

export class Hub extends DurableObject<HubEnv> {
  private sql: SqlStorage;
  private limits = new Map<string, Limit>();
  private pepper = "";

  constructor(ctx: DurableObjectState, env: HubEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    const q = (s: string) => this.sql.exec(s);
    q(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    q(`CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL, device TEXT NOT NULL DEFAULT '', user_id TEXT,
      votes INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0)`);
    q(`CREATE TABLE IF NOT EXISTS wish_votes (wish_id INTEGER NOT NULL, voter TEXT NOT NULL, PRIMARY KEY (wish_id, voter))`);
    q(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL,
      gender TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', av INTEGER NOT NULL DEFAULT 0, ac INTEGER NOT NULL DEFAULT 0,
      handle TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)`);
    q(`CREATE TABLE IF NOT EXISTS avatars (user_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, updated_at INTEGER NOT NULL)`);
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

    const seeded = this.sql.exec(`SELECT v FROM meta WHERE k = 'seeded'`).toArray();
    if (!seeded.length) {
      const now = Date.now();
      SEEDS.forEach(([text, kind], i) => {
        this.sql.exec(`INSERT INTO wishes (text, kind, name, status, created_at, device) VALUES (?, ?, 'Steve', 'planned', ?, 'seed')`, text, kind, now - (SEEDS.length - i) * 1000);
      });
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('seeded', '1')`);
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

    // ---- wishlist ----
    if (path === "/wishes" && m === "GET") return ok({ wishes: this.listWishes(c.device, me?.id ?? "") });
    if (path === "/wishes" && m === "POST") {
      const r = this.addWish(c.device, c.ip, String(b.text ?? ""), String(b.kind ?? ""), String(b.name ?? ""), me?.id ?? null);
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
      }
      return ok({ ok: true });
    }

    // ---- sign in ----
    if (path === "/auth/code" && m === "POST") return this.sendCode(String(b.email ?? ""), c.ip, b.lang === "en" ? "en" : "zh");
    if (path === "/auth/verify" && m === "POST") return this.verify(String(b.email ?? ""), String(b.code ?? ""), c.ip);
    if (path === "/auth/signup" && m === "POST") return this.signup(String(b.ticket ?? ""), b);
    if (path === "/auth/logout" && m === "POST") {
      if (c.token) this.sql.exec(`DELETE FROM sessions WHERE hash = ?`, await sha(c.token));
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

    if (!me) return err(401, "signin");
    this.sql.exec(`UPDATE users SET last_seen = ? WHERE id = ?`, Date.now(), me.id);

    // ---- me ----
    if (path === "/me" && m === "GET") return ok({ user: this.selfView(me) });
    if (path === "/me" && m === "PUT") {
      const p = profileFields(b);
      if ("error" in p) return err(400, p.error);
      this.sql.exec(`UPDATE users SET name = ?, phone = ?, city = ?, gender = ?, bio = ?, ac = ? WHERE id = ?`, p.name, p.phone, p.city, p.gender, p.bio, p.ac, me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
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
      return ok({ user: this.selfView(this.userById(me.id)!) });
    }
    if (path === "/me/avatar" && m === "DELETE") {
      this.sql.exec(`DELETE FROM avatars WHERE user_id = ?`, me.id);
      this.sql.exec(`UPDATE users SET av = 0 WHERE id = ?`, me.id);
      return ok({ user: this.selfView(this.userById(me.id)!) });
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
      return ok({ user: this.publicView(u), relation: rel, stats: this.stats(u.id), recent: rel === "friends" || rel === "self" ? this.history(u.id, 8) : [] });
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
      this.push(mm[1], { t: "friends" });
      this.push(me.id, { t: "friends" });
      return ok({ ok: true });
    }
    mm = /^\/blocks\/(u[a-z0-9]{6,20})$/.exec(path);
    if (mm && m === "POST") {
      const [a, z] = pair(me.id, mm[1]);
      this.sql.exec(`DELETE FROM friends WHERE a = ? AND b = ?`, a, z);
      this.sql.exec(`INSERT OR IGNORE INTO blocks (user_id, blocked) VALUES (?, ?)`, me.id, mm[1]);
      return ok({ ok: true });
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

  /* ================= accounts ================= */

  private isAdmin(u: U) {
    const list = (this.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    return list.includes(String(u.email));
  }

  private async session(token: string): Promise<U | null> {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
    const h = await sha(token);
    const s = this.one(`SELECT user_id, expires, last_used FROM sessions WHERE hash = ?`, h);
    const now = Date.now();
    if (!s || Number(s.expires) < now) return null;
    if (now - Number(s.last_used) > 3600_000) this.sql.exec(`UPDATE sessions SET last_used = ?, expires = ? WHERE hash = ?`, now, now + SESSION_TTL, h);
    return this.userById(String(s.user_id));
  }

  private userById(id: string): U | null {
    const r = this.one(`SELECT * FROM users WHERE id = ?`, id);
    return r ? asUser(r) : null;
  }

  private selfView(u: U) {
    return { ...this.publicView(u), email: u.email, phone: u.phone, admin: this.isAdmin(u) };
  }

  private publicView(u: U) {
    return { id: u.id, name: u.name, city: u.city, gender: u.gender, bio: u.bio, av: u.av, ac: u.ac, handle: u.handle, since: u.created_at };
  }

  /** Who holds this session (for the table server). */
  async whoami(token: string): Promise<Who | null> {
    const u = await this.session(token);
    return u ? { uid: u.id, name: u.name, av: u.av, ac: u.ac } : null;
  }

  private async sendCode(raw: string, ip: string, lang: "zh" | "en"): Promise<Reply> {
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return err(400, "email");
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

  private async mail(to: string, code: string, lang: "zh" | "en") {
    const key = this.env.RESEND_API_KEY;
    if (!key) throw new Error("no-mail");
    const subject = lang === "zh" ? `changle 验证码 ${code}` : `Your changle code: ${code}`;
    const lead = lang === "zh" ? "你的登录验证码：" : "Your sign-in code:";
    const note = lang === "zh" ? "10 分钟内有效。不是你本人操作的话，忽略这封邮件就好。" : "It works for 10 minutes. If you didn't ask for it, ignore this email.";
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#0e0c22;color:#f5f4fd;padding:32px;border-radius:20px;max-width:440px">
<p style="font-size:22px;font-weight:800;margin:0 0 18px">changle<span style="color:#b072ff">.</span></p>
<p style="margin:0 0 8px;color:#b6b4d0">${lead}</p>
<p style="font-size:40px;font-weight:800;letter-spacing:8px;margin:0 0 18px">${code}</p>
<p style="margin:0;color:#7f7c9d;font-size:13px">${note}</p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.env.MAIL_FROM || "changle <hello@changle.ca>", to: [to], subject, html, text: `${lead} ${code}\n\n${note}` }),
    });
    if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  private async verify(raw: string, code: string, ip: string): Promise<Reply> {
    const email = raw.trim().toLowerCase();
    if (!this.allow(`verify:${ip}`, 40, 3600_000)) return err(429, "slow-down");
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
    for (const s of [
      `DELETE FROM sessions WHERE user_id = ?`,
      `DELETE FROM avatars WHERE user_id = ?`,
      `DELETE FROM history WHERE user_id = ?`,
      `DELETE FROM friends WHERE a = ? OR b = ?`,
      `DELETE FROM messages WHERE a = ? OR b = ?`,
      `DELETE FROM blocks WHERE user_id = ? OR blocked = ?`,
      `UPDATE wishes SET user_id = NULL WHERE user_id = ?`,
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
    return { friends, incoming, outgoing };
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

  private unread(me: string) {
    return Number(this.one(`SELECT COUNT(*) AS n FROM messages WHERE (a = ? OR b = ?) AND from_id != ? AND read_at IS NULL`, me, me, me)?.n ?? 0);
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

  /* ================= live sockets ================= */

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const me = await this.session(token);
    if (!me) return new Response("signin", { status: 401 });
    const pairSock = new WebSocketPair();
    const [client, server] = Object.values(pairSock) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [me.id]);
    server.serializeAttachment({ uid: me.id });
    server.send(JSON.stringify({ t: "hello", unread: this.unread(me.id), requests: this.requests(me.id) }));
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
        `SELECT w.id, w.text, w.kind, w.name, w.status, w.created_at, w.votes, w.device, w.user_id,
           EXISTS(SELECT 1 FROM wish_votes v WHERE v.wish_id = w.id AND (v.voter = ? OR v.voter = ?)) AS voted
         FROM wishes w WHERE w.hidden = 0 ORDER BY w.created_at DESC LIMIT 300`,
        voter,
        device,
      )
      .toArray() as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      text: String(r.text),
      kind: r.kind === "feature" ? "feature" : "game",
      name: String(r.name ?? ""),
      votes: Number(r.votes),
      status: (r.status === "planned" || r.status === "done" ? r.status : "new") as WishRow["status"],
      at: Number(r.created_at),
      voted: !!r.voted,
      mine: (device !== "" && r.device === device) || (!!uid && r.user_id === uid),
    }));
  }

  private addWish(device: string, ip: string, text: string, kind: string, name: string, uid: string | null): WishRow | { error: string } {
    const t = clean(text, 200);
    if (t.length < 3) return { error: "too-short" };
    if (!this.allow(`w:${device}`, 6, 3600_000) || !this.allow(`wip:${ip}`, 20, 3600_000)) return { error: "slow-down" };
    const k = kind === "feature" ? "feature" : "game";
    const n = clean(name, 14);
    const now = Date.now();
    const row = this.sql.exec(`INSERT INTO wishes (text, kind, name, created_at, device, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`, t, k, n, now, device, uid).one();
    return { id: Number(row.id), text: t, kind: k, name: n, votes: 0, status: "new", at: now, voted: false, mine: true };
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
