// What the phone pages and the server say to each other. Every request carries the phone's own
// key for this gathering in the `x-when-key` header (src/room/event.ts says what a key is for).
import type { Answers, Day, EventState, Grain, Here, Times } from "../engine/types";
import type { ErrorCode, HostAction } from "./event";

export const KEY_HEADER = "x-when-key";

/**
 * The first thing a phone says over the WebSocket, once it is open: which key is its own, so the
 * others can be told who has the page open. (A browser can't send a header with a WebSocket, and
 * a key never goes in an address, where it would be logged.)
 */
export type Hello = { t: "hi"; key: string };

/** POST /when/api/events */
export type CreateBody = { title: string; days: Day[]; grain: Grain };
/** The admin code is shown once, here, and never again. */
export type Created = { code: string; adminCode: string; state: EventState };

/** GET /when/api/e/<code> */
export type Snapshot = {
  state: EventState;
  /** this phone manages the gathering */
  host: boolean;
  /** this phone's own row, if it has made one */
  me: string | null;
  /** who else has the page open right now */
  here: Here;
};

/** POST /when/api/e/<code>/me */
export type SaveBody = { id?: string; name: string; answers: Answers; times?: Times };
export type Saved = { id: string; state: EventState };

/** POST /when/api/e/<code>/host */
export type HostBody = HostAction;
/** `id`: the row just filled in for someone (代填) */
export type Hosted = { state: EventState; id?: string };

/** POST /when/api/e/<code>/start: the start times asked about that suit this phone's person (几点开始) */
export type VoteBody = { starts: number[] };
export type Voted = { state: EventState };

/** POST /when/api/e/<code>/claim */
export type ClaimBody = { adminCode: string };
export type Claimed = { host: true };

/** An answer that isn't the thing asked for: `limit` is today's allowance used up, `notfound` no such gathering. */
export type ApiError = { error: ErrorCode | "limit" | "notfound" | "key" };

/**
 * What the server pushes over the WebSocket at /when/api/e/<code>/ws: the gathering whenever it
 * changes; who else has the page open whenever that changes (each phone is told it without
 * itself); and that the gathering is gone.
 */
export type Push = { t: "state"; state: EventState } | { t: "here"; here: Here } | { t: "gone" };
