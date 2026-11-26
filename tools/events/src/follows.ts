// The Eventbrite organizations What's On follows (Steve's call, 25 November 2026: option A). Each
// is learned from one of its events: a seed below, or an event someone sent in and Steve let in.
// Eventbrite's API gives an event's organization (its organization_id); the morning's run then
// reads each organization's public events (src/sources.ts, "eventbrite"), one a part.

/**
 * Events to start from, each one an organization's: Vancouver organizers who put on something most
 * weeks. Only the id is needed (the number at the end of the event's address).
 */
export const EVENTBRITE_SEEDS: { event: string; who: string }[] = [
  { event: "1993949843658", who: "Rickshaw Theatre" },
  { event: "1992669810043", who: "The Invisible Orange" },
];

const API = "https://www.eventbriteapi.com/v3";
/** Organizations learned in one go, at most: each is a request of its own. */
const LEARN_AT_ONCE = 10;

type FollowEnv = Pick<Env, "DB" | "EVENTBRITE_TOKEN">;

/** Follow the organization of an event (an approved submission's): learned on the next morning's run. */
export async function followEvent(db: D1Database, event: string, by: string, now = Date.now()): Promise<void> {
  if (!/^\d{6,20}$/.test(event)) return;
  await db.prepare("INSERT OR IGNORE INTO eventbrite_follows (event_id, added_by, added_at) VALUES (?1, ?2, ?3)").bind(event, by, new Date(now).toISOString()).run();
}

/**
 * The organizations followed, oldest first. `learn`: first ask Eventbrite which organization each
 * new event is (the seeds too): a few a morning, so one bad answer can't hold the run up. An event
 * Eventbrite doesn't know (404) is set aside with the reason; anything else is asked again tomorrow.
 */
export async function followedOrganizations(env: FollowEnv, learn: boolean, now = Date.now()): Promise<string[]> {
  const db = env.DB;
  if (learn) {
    const at = new Date(now).toISOString();
    await db.batch(EVENTBRITE_SEEDS.map((s) => db.prepare("INSERT OR IGNORE INTO eventbrite_follows (event_id, added_by, added_at) VALUES (?1, 'seed', ?2)").bind(s.event, at)));
    const token = env.EVENTBRITE_TOKEN;
    const { results } = await db
      .prepare("SELECT event_id FROM eventbrite_follows WHERE organization_id IS NULL AND error IS NULL ORDER BY added_at, event_id LIMIT ?1")
      .bind(LEARN_AT_ONCE)
      .all<{ event_id: string }>();
    for (const { event_id } of token ? results : []) {
      let res: Response;
      try {
        res = await fetch(`${API}/events/${event_id}/?expand=organizer&token=${encodeURIComponent(token ?? "")}`, { headers: { accept: "application/json" } });
      } catch {
        continue;
      }
      if (res.status === 404) {
        await db.prepare("UPDATE eventbrite_follows SET error = 'not found' WHERE event_id = ?1").bind(event_id).run();
        continue;
      }
      if (!res.ok) continue;
      const ev = (await res.json().catch(() => null)) as { organization_id?: unknown; organizer?: { name?: unknown } | null } | null;
      const org = typeof ev?.organization_id === "string" && /^\d{1,20}$/.test(ev.organization_id) ? ev.organization_id : null;
      if (!org) continue;
      const name = typeof ev?.organizer?.name === "string" ? ev.organizer.name.slice(0, 120) : null;
      await db.prepare("UPDATE eventbrite_follows SET organization_id = ?2, name = ?3 WHERE event_id = ?1").bind(event_id, org, name).run();
    }
  }
  const { results } = await db
    .prepare("SELECT organization_id FROM eventbrite_follows WHERE organization_id IS NOT NULL GROUP BY organization_id ORDER BY min(added_at), organization_id")
    .all<{ organization_id: string }>();
  return results.map((r) => r.organization_id);
}
