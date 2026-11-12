// The phone's state: the latest room view from the server, connection status, little messages.
import { useEffect, useState } from "preact/hooks";
import type { ClientMsg, RoomView, ServerMsg } from "../room/protocol";
import { has, t } from "./i18n";
import type { Conn, Status } from "./net";
import { showReaction } from "./reactions";

export interface AppState {
  view: RoomView | null;
  status: Status;
  fatal: string | null;
  toasts: { id: number; text: string }[];
  saved: string | null;
  /** Server clock minus this phone's clock, for countdowns. */
  offset: number;
}

let state: AppState = { view: null, status: "idle", fatal: null, toasts: [], saved: null, offset: 0 };
const subs = new Set<() => void>();
let conn: Conn | null = null;
let toastId = 0;

export const getState = () => state;

export function update(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const fn of subs) fn();
}

export function useApp(): AppState {
  const [, force] = useState(0);
  const rendered = state;
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    // Anything that changed between the first render and now (the demo's first view arrives at once).
    if (state !== rendered) fn();
    return () => void subs.delete(fn);
  }, []);
  return state;
}

export function setConn(c: Conn | null) {
  conn?.close();
  conn = c;
}

export const send = (msg: ClientMsg) => conn?.send(msg);

export function toast(text: string, ms = 3500) {
  const id = ++toastId;
  update({ toasts: [...state.toasts, { id, text }].slice(-3) });
  setTimeout(() => update({ toasts: state.toasts.filter((x) => x.id !== id) }), ms);
}

/**
 * The server's clock against ours, from the views it sends (its time when it sent each). A view that
 * took long to arrive, or to be read (a busy page, a slow network), makes the server look behind by
 * that delay: the quickest of the last few is the truest. Every screen plays a throw from the server's
 * moment of it, so this is what keeps them in step.
 */
const samples: number[] = [];
function clockOffset(serverTime: number) {
  samples.push(serverTime - Date.now());
  if (samples.length > 24) samples.shift();
  return Math.max(...samples);
}

export function onServer(msg: ServerMsg) {
  if (msg.t === "view") update({ view: msg.view, offset: clockOffset(msg.view.now) });
  else if (msg.t === "toast") toast(has(msg.key) ? t(msg.key, msg.vars) : msg.key);
  else if (msg.t === "saved") update({ saved: msg.code });
  else if (msg.t === "fatal") update({ fatal: msg.key });
  else if (msg.t === "react") showReaction({ id: msg.id, team: msg.team, r: msg.r });
}

/** Server time now, in ms. */
export const serverNow = () => Date.now() + state.offset;
