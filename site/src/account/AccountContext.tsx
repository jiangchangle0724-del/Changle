import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SERVER } from "../config";
import { api, sessionToken, setSessionToken } from "../lib/api";
import type { Choices } from "../shared/draw";

export type Gender = "female" | "male" | "nonbinary" | "private";
/** `figure`: their face is an AI-drawn anime figure (at /figure/:id), not a photo or a letter. */
export type PublicUser = { id: string; name: string; city: string; gender: Gender; bio: string; av: number; ac: number; handle: string; since: number; figure?: boolean };
/** `hasFigure`: you have a drawn figure (kept while a photo shows); `choices`: what you picked for it. */
export type SelfUser = PublicUser & { email: string; phone: string; admin: boolean; hasFigure?: boolean; choices?: Choices | null };
export type ChatMsg = { id: number; from: string; body: string; at: number; read: boolean };

export type LiveEvent = { t: "msg"; with: string; msg: ChatMsg } | { t: "friends" } | { t: "unread"; n: number } | { t: "hello"; unread: number; requests?: number } | { t: "read"; with: string };

type Account = {
  me: SelfUser | null;
  status: "loading" | "out" | "in";
  unread: number;
  /** friend requests waiting for an answer */
  requests: number;
  setMe: (u: SelfUser | null) => void;
  signedIn: (token: string, user: SelfUser) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Live events (chat, friend requests) while signed in. */
  onLive: (fn: (e: LiveEvent) => void) => () => void;
  signInOpen: boolean;
  openSignIn: (open?: boolean) => void;
};

const Ctx = createContext<Account | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SelfUser | null>(null);
  const [status, setStatus] = useState<"loading" | "out" | "in">(() => (sessionToken() ? "loading" : "out"));
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [signInOpen, setSignInOpen] = useState(false);
  const fns = useRef(new Set<(e: LiveEvent) => void>());

  const refresh = useCallback(async () => {
    if (!sessionToken()) {
      setMe(null);
      setStatus("out");
      return;
    }
    try {
      const d = await api<{ user: SelfUser }>("/me");
      setMe(d.user);
      setStatus("in");
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st === 401) {
        setSessionToken(null);
        setMe(null);
        setStatus("out");
      } else setStatus((s) => (s === "loading" ? "out" : s));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // one live socket while signed in: chat messages and friend requests arrive as they happen
  useEffect(() => {
    if (status !== "in") return;
    let ws: WebSocket | null = null;
    let dead = false;
    let tries = 0;
    let ping = 0;
    let retry = 0;
    const open = () => {
      if (dead) return;
      const url = `${SERVER.replace(/^http/, "ws")}/api/live?token=${encodeURIComponent(sessionToken())}`;
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        tries = 0;
        ping = window.setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25_000);
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string" || ev.data === "pong") return;
        let e: LiveEvent;
        try {
          e = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (e.t === "hello") {
          setUnread(e.unread);
          setRequests(e.requests ?? 0);
        }
        if (e.t === "friends")
          void api<{ incoming: unknown[] }>("/friends").then(
            (d) => setRequests(d.incoming.length),
            () => {},
          );
        if (e.t === "unread") setUnread(e.n);
        if (e.t === "msg" && e.msg.from !== me?.id) setUnread((n) => n + 1);
        for (const fn of fns.current) fn(e);
      };
      ws.onclose = (ev) => {
        window.clearInterval(ping);
        if (ev.code === 4003) {
          setSessionToken(null);
          setMe(null);
          setStatus("out");
          return;
        }
        schedule();
      };
    };
    const schedule = () => {
      if (dead) return;
      tries++;
      retry = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(tries, 5)));
    };
    const vis = () => {
      if (document.visibilityState === "visible" && (!ws || ws.readyState > 1)) {
        window.clearTimeout(retry);
        open();
      }
    };
    open();
    document.addEventListener("visibilitychange", vis);
    return () => {
      dead = true;
      window.clearTimeout(retry);
      window.clearInterval(ping);
      document.removeEventListener("visibilitychange", vis);
      try {
        ws?.close();
      } catch {
        /* fine */
      }
    };
    // the socket belongs to the session, not to profile edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, me?.id]);

  const value = useMemo<Account>(
    () => ({
      me,
      status,
      unread,
      requests,
      setMe,
      signedIn: (token, user) => {
        setSessionToken(token);
        setMe(user);
        setStatus("in");
      },
      signOut: async () => {
        try {
          await api("/auth/logout", { body: {} });
        } catch {
          /* gone anyway */
        }
        setSessionToken(null);
        setMe(null);
        setStatus("out");
        setUnread(0);
        setRequests(0);
      },
      refresh,
      onLive: (fn) => {
        fns.current.add(fn);
        return () => {
          fns.current.delete(fn);
        };
      },
      signInOpen,
      openSignIn: (open = true) => setSignInOpen(open),
    }),
    [me, status, unread, requests, refresh, signInOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAccount outside AccountProvider");
  return c;
}

export function useLive(fn: (e: LiveEvent) => void) {
  const { onLive } = useAccount();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onLive((e) => ref.current(e)), [onLive]);
}
