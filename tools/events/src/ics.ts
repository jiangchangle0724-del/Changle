// The calendar feed (task C6, docs/codex-tasks/C6-ics.md): published events as an iCalendar file
// that Apple and Google Calendar subscribe to, at /go/api/events.ics (same filters as the API).
import type { PublicEvent } from "./types";

export interface IcsOptions {
  /** The calendar's name, shown in people's calendar apps. */
  name: string;
  /** When the file is made (DTSTAMP). */
  now: Date;
}

/** Not built yet: task C6. The route answers 501 until it is. */
export function toIcs(_events: PublicEvent[], _opts: IcsOptions): string | null {
  return null;
}
