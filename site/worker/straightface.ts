/**
 * 一本正经 · In All Seriousness in the hub: how each card plays, and the cards players say are off.
 * The hub (hub.ts) calls these from one line each: the tables, the public routes, the owner's back
 * office. A round's outcome comes from the phone that ran it (the host's, online), a report from
 * any phone; both are rate limited per phone and per address, and only real card ids count.
 */
import { CARDS } from "../src/data/straightface";
import type { Reply } from "./hub";

const ok = (json: unknown): Reply => ({ status: 200, json });
const err = (status: number, error: string): Reply => ({ status, json: { error } });

const IDS = new Set(CARDS.map((c) => c.id));
export const SF_REASONS = ["wrong", "easy", "unfit", "other"] as const;
const NOTE_MAX = 300;

type Ctx = {
  sql: SqlStorage;
  allow: (key: string, max: number, windowMs: number) => boolean;
  device: string;
  ip: string;
  uid: string | null;
};

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * sf_cards: rounds played with each card, and how often the judge was fooled (the balance rule:
 * after ten rounds, a card the judge sees through four times in five is too easy). sf_sizes: the
 * same by how many played (the judge's hit rate has a target for each table size). sf_reports:
 * what players flag, through the owner's desk (SF_STATUSES).
 */
export function sfSchema(q: (s: string) => void) {
  q(`CREATE TABLE IF NOT EXISTS sf_cards (card TEXT PRIMARY KEY, rounds INTEGER NOT NULL DEFAULT 0, fooled INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)`);
  q(`CREATE TABLE IF NOT EXISTS sf_sizes (players INTEGER PRIMARY KEY, rounds INTEGER NOT NULL DEFAULT 0, fooled INTEGER NOT NULL DEFAULT 0)`);
  q(`CREATE TABLE IF NOT EXISTS sf_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, card TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '', user_id TEXT, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL, decided_at INTEGER)`);
  q(`CREATE INDEX IF NOT EXISTS sf_reports_status ON sf_reports (status, id)`);
}

/** The public routes: a round played, the cards' numbers, a report. Null for any other path. */
export function sfPublic(path: string, m: string, b: Record<string, unknown>, c: Ctx): Reply | null {
  if (path === "/sf/round" && m === "POST") {
    const card = String(b.card ?? "");
    const players = Math.round(Number(b.players));
    if (!IDS.has(card) || typeof b.fooled !== "boolean" || !(players >= 3 && players <= 9)) return err(400, "bad");
    if (!c.allow(`sfr:${c.device}`, 40, 3600_000) || !c.allow(`sfrip:${c.ip}`, 150, 3600_000)) return err(429, "slow-down");
    const f = b.fooled ? 1 : 0;
    const now = Date.now();
    c.sql.exec(`INSERT INTO sf_cards (card, rounds, fooled, at) VALUES (?, 1, ?, ?) ON CONFLICT(card) DO UPDATE SET rounds = rounds + 1, fooled = fooled + excluded.fooled, at = excluded.at`, card, f, now);
    c.sql.exec(`INSERT INTO sf_sizes (players, rounds, fooled) VALUES (?, 1, ?) ON CONFLICT(players) DO UPDATE SET rounds = rounds + 1, fooled = fooled + excluded.fooled`, players, f);
    return ok({ ok: true });
  }
  if (path === "/sf/stats" && m === "GET") {
    const cards: Record<string, [number, number]> = {};
    for (const r of c.sql.exec(`SELECT card, rounds, fooled FROM sf_cards WHERE rounds > 0`).toArray()) cards[String(r.card)] = [Number(r.rounds), Number(r.fooled)];
    return ok({ cards });
  }
  if (path === "/sf/report" && m === "POST") {
    const card = String(b.card ?? "");
    const reason = String(b.reason ?? "");
    if (!IDS.has(card) || !(SF_REASONS as readonly string[]).includes(reason)) return err(400, "bad");
    if (!c.allow(`sfp:${c.device}`, 8, 86400_000) || !c.allow(`sfpip:${c.ip}`, 30, 86400_000)) return err(429, "slow-down");
    // the same phone flagging the same card twice is one report (until the owner has dealt with it)
    const dup = c.sql.exec(`SELECT id FROM sf_reports WHERE card = ? AND device = ? AND status IN ('new', 'fix')`, card, c.device).toArray();
    if (dup.length) return ok({ ok: true });
    c.sql.exec(
      `INSERT INTO sf_reports (card, reason, note, lang, device, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      card,
      reason,
      clean(b.note, NOTE_MAX),
      b.lang === "en" ? "en" : "zh",
      c.device,
      c.uid,
      Date.now(),
    );
    return ok({ ok: true });
  }
  return null;
}

/**
 * A report's way through the owner's desk: 'new' until read; then 'fix' (the card needs changing,
 * the card bank is code, so a chat makes the change) and 'done' once it has; or 'no' (nothing wrong).
 */
export const SF_STATUSES = ["new", "fix", "done", "no"] as const;

/** The owner's desk: the reports waiting, those to fix, the latest decided, every card's numbers, the hit rate by table size. */
export function sfAdmin(path: string, m: string, b: Record<string, unknown>, sql: SqlStorage): Reply | null {
  if (path === "/admin/sf" && m === "GET") {
    const reports = (where: string, order: "ASC" | "DESC", n: number) =>
      sql
        .exec(`SELECT id, card, reason, note, lang, status, created_at, decided_at FROM sf_reports WHERE ${where} ORDER BY id ${order} LIMIT ?`, n)
        .toArray()
        .map((r) => ({ id: Number(r.id), card: String(r.card), reason: String(r.reason), note: String(r.note), lang: String(r.lang), status: String(r.status), at: Number(r.created_at), decidedAt: r.decided_at == null ? null : Number(r.decided_at) }));
    const count = (status: string) => Number(sql.exec(`SELECT COUNT(*) AS n FROM sf_reports WHERE status = ?`, status).one().n);
    const cards = sql
      .exec(`SELECT card, rounds, fooled, at FROM sf_cards ORDER BY rounds DESC LIMIT 400`)
      .toArray()
      .map((r) => ({ card: String(r.card), rounds: Number(r.rounds), fooled: Number(r.fooled), at: Number(r.at) }));
    const sizes = sql
      .exec(`SELECT players, rounds, fooled FROM sf_sizes ORDER BY players`)
      .toArray()
      .map((r) => ({ players: Number(r.players), rounds: Number(r.rounds), fooled: Number(r.fooled) }));
    return ok({
      waiting: reports("status = 'new'", "ASC", 200),
      fixing: reports("status = 'fix'", "ASC", 200),
      decided: reports("status IN ('done', 'no')", "DESC", 50),
      counts: { waiting: count("new"), fixing: count("fix") },
      cards,
      sizes,
    });
  }
  // one decision for several reports at once (a card flagged by several phones is decided once)
  if (path === "/admin/sf/reports" && m === "POST") {
    const st = String(b.status ?? "");
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200) : [];
    if (!(SF_STATUSES as readonly string[]).includes(st) || !ids.length) return err(400, "bad");
    const now = Date.now();
    for (const id of ids) sql.exec(`UPDATE sf_reports SET status = ?, decided_at = ? WHERE id = ?`, st, st === "new" ? null : now, id);
    return ok({ ok: true });
  }
  return null;
}
