import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { API, SERVER } from "../config";
import { api, sessionToken, setSessionToken, siteNotice } from "../lib/api";
import type { Choices } from "../shared/draw";

export type Gender = "female" | "male" | "nonbinary" | "private";
/** `figure`: their face is an AI-drawn anime figure (at /figure/:id), not a photo or a letter. */
/** `frame`: a reward frame round their face ("gold": a game they wished for went live). */
export type PublicUser = { id: string; name: string; city: string; gender: Gender; bio: string; av: number; ac: number; handle: string; since: number; figure?: boolean; frame?: string };
/** `hasFigure`: you have a drawn figure (kept while a photo shows); `choices`: what you picked for it. `master`: the site's owner. */
export type SelfUser = PublicUser & { email: string; phone: string; admin: boolean; master?: boolean; hasFigure?: boolean; choices?: Choices | null; cut?: boolean; perks?: string[] };
export type ChatMsg = { id: number; from: string; body: string; at: number; read: boolean };

export type LiveEvent =
  | { t: "msg"; with: string; msg: ChatMsg }
  | { t: "friends" }
  | { t: "unread"; n: number }
  | { t: "hello"; unread: number; requests?: number; paused?: boolean }
  | { t: "read"; with: string }
  | { t: "paused"; on: boolean }
  | { t: "kicked" }
  | { t: "banned" }
  /** a reward came: "wish" (a game they wished for went live) */
  | { t: "perk"; perk: string; about: string };

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

// Who you are, kept on the phone, so a signed-in phone opens signed in straight away (and stays
// so when the network is down) while the server is asked in the background.
const ME = "changle.me";
const KEPT = "changle.kept";
function cachedMe(): SelfUser | null {
  try {
    const s = localStorage.getItem(ME);
    return s ? (JSON.parse(s) as SelfUser) : null;
  } catch {
    return null;
  }
}
function cacheMe(u: SelfUser | null) {
  try {
    if (u) localStorage.setItem(ME, JSON.stringify(u));
    else localStorage.removeItem(ME);
  } catch {
    /* fine */
  }
}
function markKept() {
  try {
    localStorage.setItem(KEPT, String(Date.now()));
  } catch {
    /* fine */
  }
}
function keptLately() {
  try {
    return Date.now() - Number(localStorage.getItem(KEPT) ?? 0) < 20 * 3600_000;
  } catch {
    return true;
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<SelfUser | null>(() => (sessionToken() ? cachedMe() : null));
  // a phone with a session and a remembered profile is signed in from the first frame
  const [status, setStatus] = useState<"loading" | "out" | "in">(() => (sessionToken() ? (cachedMe() ? "in" : "loading") : "out"));
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [signInOpen, setSignInOpen] = useState(false);
  const fns = useRef(new Set<(e: LiveEvent) => void>());
  const cutTried = useRef(false);

  const setMe = useCallback((u: SelfUser | null) => {
    setMeState(u);
    cacheMe(u);
  }, []);

  /** Gone from this phone: the session was ended (signed out elsewhere, kicked, deleted). */
  const dropLocal = useCallback(() => {
    setSessionToken(null);
    cacheMe(null);
    setMeState(null);
    setStatus("out");
    setUnread(0);
    setRequests(0);
  }, []);

  // the sign-in cookie gets renewed about once a day (and set for the first time on phones that
  // signed in before there was one)
  const keep = useCallback(() => {
    const tok = sessionToken();
    if (!tok || keptLately()) return;
    void fetch(`${API}/auth/keep`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${tok}` } }).then(
      (r) => r.ok && markKept(),
      () => {},
    );
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionToken()) {
      setMeState(null);
      setStatus("out");
      return;
    }
    try {
      const d = await api<{ user: SelfUser }>("/me");
      setMe(d.user);
      setStatus("in");
      keep();
      // a figure from before the games' stages: cut it out for them now, once
      if (d.user.figure && d.user.hasFigure && d.user.cut === false && !cutTried.current) {
        cutTried.current = true;
        void import("./avatar/backfill")
          .then((m) => m.cutSavedFigure())
          .then((u) => u && setMe(u))
          .catch(() => {});
      }
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st === 401) dropLocal();
      // offline, or the server is busy: still signed in; asked again when the phone is back
      else setStatus((s) => (s === "loading" ? (cachedMe() ? "in" : "out") : s));
    }
  }, [dropLocal, keep, setMe]);

  useEffect(() => {
    if (sessionToken()) {
      void refresh();
      return;
    }
    // no session on this phone: Safari may have wiped it; the cookie may still hold one
    let gone = false;
    void fetch(`${API}/auth/restore`, { method: "POST", credentials: "include" })
      .then((r) => (r.status === 200 ? (r.json() as Promise<{ token: string; user: SelfUser }>) : null))
      .then((d) => {
        if (gone || !d?.token || sessionToken()) return;
        setSessionToken(d.token);
        setMe(d.user);
        setStatus("in");
        markKept();
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [refresh, setMe]);

  // back online, or back to the app: check in again if the last try didn't get through
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible" && sessionToken()) void refresh();
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
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
      if (dead || !sessionToken()) return;
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
          if (e.paused) siteNotice("paused");
        }
        if (e.t === "paused") siteNotice(e.on ? "paused" : "open");
        if (e.t === "banned") siteNotice("banned");
        if (e.t === "friends")
          void api<{ incoming: unknown[] }>("/friends").then(
            (d) => setRequests(d.incoming.length),
            () => {},
          );
        if (e.t === "unread") setUnread(e.n);
        // a reward: fetch the profile again (the frame, the outfits)
        if (e.t === "perk") void refresh();
        if (e.t === "msg" && e.msg.from !== me?.id) setUnread((n) => n + 1);
        for (const fn of fns.current) fn(e);
      };
      ws.onclose = (ev) => {
        window.clearInterval(ping);
        // 4003 the account was deleted, 4005 banned, 4006 the owner signed this person out
        if (ev.code === 4003 || ev.code === 4005 || ev.code === 4006) {
          if (ev.code === 4005) siteNotice("banned");
          dropLocal();
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
        // (signing in set the cookie too)
        markKept();
      },
      signOut: async () => {
        try {
          await api("/auth/logout", { body: {} });
        } catch {
          /* gone anyway */
        }
        dropLocal();
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
    [me, status, unread, requests, refresh, signInOpen, setMe, dropLocal],
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
