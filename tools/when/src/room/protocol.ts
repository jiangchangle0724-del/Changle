// What the phone pages and the server say to each other. Every request carries the phone's own
// key for this gathering in the `x-when-key` header (src/room/event.ts says what a key is for).
import type { Answers, Day, EventState, Grain, Times } from "../engine/types";
import type { ErrorCode, HostAction } from "./event";

export const KEY_HEADER = "x-when-key";

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
};

/** POST /when/api/e/<code>/me */
export type SaveBody = { id?: string; name: string; answers: Answers; times?: Times };
export type Saved = { id: string; state: EventState };

/** POST /when/api/e/<code>/host */
export type HostBody = HostAction;
export type Hosted = { state: EventState };

/** POST /when/api/e/<code>/claim */
export type ClaimBody = { adminCode: string };
export type Claimed = { host: true };

/** An answer that isn't the thing asked for: `limit` is today's allowance used up, `notfound` no such gathering. */
export type ApiError = { error: ErrorCode | "limit" | "notfound" | "key" };

/** What the server pushes over the WebSocket at /when/api/e/<code>/ws. */
export type Push = { t: "state"; state: EventState } | { t: "gone" };
