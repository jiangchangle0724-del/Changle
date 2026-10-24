// The phone's state: the latest room view from the server, connection status, little messages.
import { useEffect, useState } from "preact/hooks";
import type { ClientMsg, RoomView, ServerMsg } from "../room/protocol";
import { has, t } from "./i18n";
import type { Conn, Status } from "./net";

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
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    return () => void subs.delete(fn);
  }, []);
  return state;
}

export function setConn(c: Conn | null) {
  conn?.close();
  conn = c;
}

export const send = (msg: ClientMsg) => conn?.send(msg);

export function toast(text: string) {
  const id = ++toastId;
  update({ toasts: [...state.toasts, { id, text }].slice(-3) });
  setTimeout(() => update({ toasts: state.toasts.filter((x) => x.id !== id) }), 3500);
}

export function onServer(msg: ServerMsg) {
  if (msg.t === "view") update({ view: msg.view, offset: msg.view.now - Date.now() });
  else if (msg.t === "toast") toast(has(msg.key) ? t(msg.key, msg.vars) : msg.key);
  else if (msg.t === "saved") update({ saved: msg.code });
  else if (msg.t === "fatal") update({ fatal: msg.key });
}

/** Server time now, in ms. */
export const serverNow = () => Date.now() + state.offset;
