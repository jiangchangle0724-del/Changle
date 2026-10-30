import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Action, PenaltyEvent, RoomEvent, RoomView, ServerMsg, Stroke, StrokeOp } from "../shared/protocol";
import { clearIntent, phoneId, saveLastRoom, saveName, screenId } from "./config";
import { useAccount } from "../account/AccountContext";
import { RoomSocket, type Status, type Stop } from "./socket";

/** The drawing on the board, kept outside React: points arrive many times a second. */
export class StrokeStore {
  list: Stroke[] = [];
  private fns = new Set<() => void>();
  reset(list: Stroke[]) {
    this.list = list.map((s) => ({ ...s, p: [...s.p] }));
    this.emit();
  }
  apply(op: StrokeOp) {
    switch (op.o) {
      case "b":
        this.list.push({ id: op.id, c: op.c, w: op.w, p: [...op.p] });
        break;
      case "p": {
        const s = this.list.find((x) => x.id === op.id);
        if (s) s.p.push(...op.p);
        break;
      }
      case "u":
        this.list.pop();
        break;
      case "c":
        this.list = [];
        break;
      default:
        return;
    }
    this.emit();
  }
  subscribe(fn: () => void) {
    this.fns.add(fn);
    return () => {
      this.fns.delete(fn);
    };
  }
  private emit() {
    for (const fn of this.fns) fn();
  }
}

type RoomApi = {
  code: string;
  me: string;
  /** this device is a big screen showing the table (no seat) */
  screen: boolean;
  status: Status;
  room: RoomView | null;
  stopped: Stop | null;
  /** Server time minus this phone's time, in ms. */
  offset: number;
  now: () => number;
  isHost: boolean;
  act: (a: Action) => void;
  g: (x: string, rest?: Record<string, unknown>) => void;
  /** Draw on this phone's plate and send it to the table. */
  stroke: (op: StrokeOp) => void;
  /** Send only (the plate already drew it). */
  sendStroke: (op: StrokeOp) => void;
  on: (fn: (e: RoomEvent) => void) => () => void;
  strokes: StrokeStore;
  nameOf: (pid: string | null | undefined) => string;
  reconnect: () => void;
  leave: () => void;
  rename: (name: string) => void;
  /** Penalties waiting to be shown, oldest first. */
  pens: PenaltyEvent[];
  drank: Record<string, string[]>;
  dismissPen: (id: string) => void;
};

const Ctx = createContext<RoomApi | null>(null);

export function RoomProvider({ code, name, create, children, screen = false, game }: { code: string; name: string; create: boolean; children: ReactNode; screen?: boolean; game?: string }) {
  const me = useMemo(() => (screen ? screenId() : phoneId()), [screen]);
  const [status, setStatus] = useState<Status>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [stopped, setStopped] = useState<Stop | null>(null);
  const [offset, setOffset] = useState(0);
  const [pens, setPens] = useState<PenaltyEvent[]>([]);
  const [drank, setDrank] = useState<Record<string, string[]>>({});
  const offsetRef = useRef(0);
  const listeners = useRef(new Set<(e: RoomEvent) => void>());
  const strokes = useMemo(() => new StrokeStore(), []);
  const sock = useRef<RoomSocket | null>(null);
  const nameRef = useRef(name);
  // events can arrive before React has rendered the room message just before them
  const roomRef = useRef<RoomView | null>(null);

  const onMessage = useCallback(
    (m: ServerMsg) => {
      switch (m.t) {
        case "room":
          roomRef.current = m.room;
          setRoom(m.room);
          if (import.meta.env.DEV) (window as unknown as { __room: RoomView }).__room = m.room;
          return;
        case "event": {
          const e = m.e;
          if (e.k === "penalty") setPens((q) => [...q, e].slice(-6));
          if (e.k === "drank") setDrank((d) => ({ ...d, [e.pen]: [...(d[e.pen] ?? []), e.pid] }));
          for (const fn of listeners.current) fn(e);
          return;
        }
        case "stroke":
          strokes.apply(m.op);
          return;
        case "strokes":
          strokes.reset(m.list);
          return;
      }
    },
    [strokes],
  );

  const startSocket = useCallback(
    (asCreate: boolean) => {
      sock.current?.stop();
      setStopped(null);
      const s = new RoomSocket(
        code,
        me,
        nameRef.current,
        asCreate,
        {
          onStatus: (st) => {
            if (import.meta.env.DEV) (window as unknown as { __status: string }).__status = st;
            setStatus(st);
          },
          onMessage,
          onStop: setStopped,
          onOffset: (ms) => {
            offsetRef.current = ms;
            setOffset(ms);
          },
        },
        { screen, game },
      );
      sock.current = s;
      s.start();
    },
    [code, me, onMessage, screen, game],
  );

  useEffect(() => {
    startSocket(create);
    return () => {
      sock.current?.stop();
      sock.current = null;
    };
    // the provider is keyed by table code: one socket for its lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // signing in or out (or a new photo) while seated: the table hears hello again and updates your face
  const { me: account } = useAccount();
  const faceKey = account ? `${account.id}:${account.av}:${account.ac}` : "";
  const firstFace = useRef(true);
  useEffect(() => {
    if (firstFace.current) {
      firstFace.current = false;
      return;
    }
    sock.current?.rehello();
  }, [faceKey]);

  // once seated: remember the table so a reload sits straight back down (a big screen has no seat)
  const seated = !!room && !screen;
  useEffect(() => {
    if (!seated) return;
    saveLastRoom(code);
    saveName(nameRef.current);
    clearIntent();
  }, [seated, code]);

  const act = useCallback((a: Action) => {
    sock.current?.send({ t: "act", a });
  }, []);
  const g = useCallback((x: string, rest: Record<string, unknown> = {}) => act({ a: "g", g: { x, ...rest } }), [act]);
  const stroke = useCallback(
    (op: StrokeOp) => {
      strokes.apply(op);
      sock.current?.send({ t: "stroke", op });
    },
    [strokes],
  );
  const sendStroke = useCallback((op: StrokeOp) => {
    sock.current?.send({ t: "stroke", op });
  }, []);
  const on = useCallback((fn: (e: RoomEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const reconnect = useCallback(() => {
    if (!sock.current || sock.current.status === "stopped") startSocket(false);
    else sock.current.kick();
  }, [startSocket]);
  const leave = useCallback(() => {
    sock.current?.send({ t: "act", a: { a: "leave" } });
    saveLastRoom(null);
    // give the goodbye a moment to leave the phone
    const s = sock.current;
    window.setTimeout(() => s?.stop({ kind: "left" }), 120);
  }, []);
  const rename = useCallback(
    (n: string) => {
      const clean = n.trim().slice(0, 14);
      if (!clean) return;
      nameRef.current = clean;
      saveName(clean);
      sock.current?.rename(clean);
      act({ a: "rename", name: clean });
    },
    [act],
  );
  const dismissPen = useCallback((id: string) => setPens((q) => q.filter((p) => p.id !== id)), []);

  const nameOf = useCallback((pid: string | null | undefined) => {
    if (!pid) return "";
    return roomRef.current?.seats.find((s) => s.id === pid)?.name ?? "?";
  }, []);

  const value = useMemo<RoomApi>(
    () => ({
      code,
      me,
      screen,
      status,
      room,
      stopped,
      offset,
      now,
      isHost: !!room && room.host === me,
      act,
      g,
      stroke,
      sendStroke,
      on,
      strokes,
      nameOf,
      reconnect,
      leave,
      rename,
      pens,
      drank,
      dismissPen,
    }),
    [code, me, screen, status, room, stopped, offset, now, act, g, stroke, sendStroke, on, strokes, nameOf, reconnect, leave, rename, pens, drank, dismissPen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRoom outside RoomProvider");
  return c;
}

/** Listen to the table's events (penalties, spins, reactions, effects). */
export function useRoomEvent(fn: (e: RoomEvent) => void) {
  const { on } = useRoom();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => on((e) => ref.current(e)), [on]);
}

/** True once the server clock passes `at`; re-renders exactly then. */
export function useReached(at: number | null | undefined) {
  const { now } = useRoom();
  const [, bump] = useState(0);
  const reached = at === null || at === undefined ? false : now() >= at;
  useEffect(() => {
    if (at === null || at === undefined || reached) return;
    const id = window.setTimeout(() => bump((n) => n + 1), Math.max(0, at - now()) + 20);
    return () => window.clearTimeout(id);
  }, [at, reached, now]);
  return reached;
}

/** Re-render every `ms` while `on` (for countdown text). */
export function useTicker(on: boolean, ms = 250) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => bump((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [on, ms]);
}

/** Run `fn` when `cond` turns true (your turn came round, a phase began). */
export function useCue(cond: boolean, fn: () => void) {
  const prev = useRef(cond);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (cond && !prev.current) ref.current();
    prev.current = cond;
  }, [cond]);
}
