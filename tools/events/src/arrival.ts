// A library's page handed over after the morning's run has gone past that library (src/handoff.ts).
// The GitHub job is meant for 05:50, but GitHub starts it hours late: every day from 6 to 11 November
// 2026 it ran between 10:52 and 15:44, long after the run had asked the library itself (refused, 403)
// and published at 06:00. Its pages were kept and never read. So now a page that comes after the run
// went past its library is read when it comes: the very step the run would have taken (fetchStep,
// through the same loopback binding, a request of its own), and once the library's last page is in,
// the list is published again. A page that comes before the run gets to its library is left for the
// run, which reads it as before (src/run.ts).
import type { PublishResult } from "./publish";
import type { StepRunner } from "./run";
import { ensureSchema } from "./schema";
import { SOURCE_BY_ID, SOURCES } from "./sources";
import { vanParts } from "./time";

/** What became of a page that came: kept for the morning's run, or read at once. */
export type Arrival =
  | { read: false }
  | {
      read: true;
      /** As the run's log counts them. */
      found: number;
      inWindow: number;
      added: number;
      updated: number;
      error: string | null;
      /** The list published again (after the library's last page): how many, and whether yesterday's was kept instead. */
      published: { count: number; kept: boolean } | null;
    };

export interface ArrivedPage {
  runId: string;
  source: string;
  part: number;
}

/**
 * Read a page that came, or leave it for the run. The run hasn't started (no row yet in `runs`), or
 * hasn't got to this library: left. Otherwise read now, as a step; and after the library's last page,
 * publish again, unless the run is still going (it publishes itself: everything read so far is in).
 */
export async function useArrival(steps: StepRunner, db: D1Database, page: ArrivedPage, now = Date.now()): Promise<Arrival> {
  await ensureSchema(db);
  const run = await db
    .prepare("SELECT next_source, published_at FROM runs WHERE run_id = ?1")
    .bind(page.runId)
    .first<{ next_source: string | null; published_at: string | null }>();
  if (!run) return { read: false };
  const reached = run.next_source === null ? SOURCES.length : SOURCES.findIndex((s) => s.id === run.next_source);
  if (!run.published_at && reached <= SOURCES.findIndex((s) => s.id === page.source)) return { read: false };

  const step = await steps.fetchSource({ ...page, arrived: true });
  const { found, inWindow, added, updated, error } = step.log;
  // The run published this morning (or its last trigger, 06:40, has come and gone without it).
  const morningOver = run.published_at !== null || vanParts(now).hour >= 7;
  let published: { count: number; kept: boolean } | null = null;
  if (error === null && step.next === null && morningOver) {
    const name = SOURCE_BY_ID[page.source]?.name ?? page.source;
    const r = (await steps.publish({ runId: page.runId, note: `again, with ${name}'s pages as they came` })) as PublishResult;
    published = { count: r.count, kept: r.kept };
  }
  return { read: true, found, inWindow, added, updated, error, published };
}
