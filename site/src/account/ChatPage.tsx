import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { EASE, LIGHTS, play, reduced, setLight } from "../lib/motion";
import { sfx } from "../lib/sfx";
import { clockOf } from "../lib/time";
import { useStore } from "../store";
import { useAccount, useLive, type ChatMsg, type PublicUser } from "./AccountContext";
import { Avatar, AV_COLORS, colorFor } from "./Avatar";
import { PageLoading } from "../games/GameLoading";

type Line = ChatMsg & { state?: "sending" | "failed" };

const PAGE = 60;
const GAP = 15 * 60_000;

/** A whole message made of one to three emoji shows big, without a bubble. */
function bigEmoji(s: string) {
  const t = s.trim();
  if (!t || t.length > 24) return false;
  if (!/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|[\u{1F3FB}-\u{1F3FF}]|\s)+$/u.test(t)) return false;
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t.replace(/\s/g, ""))].length : t.length / 2;
  return seg <= 3;
}

function dayLabel(at: number, lang: "zh" | "en") {
  const d = new Date(at);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return lang === "zh" ? "今天" : "Today";
  if (diff === 1) return lang === "zh" ? "昨天" : "Yesterday";
  return d.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-CA", { month: "short", day: "numeric", weekday: diff < 7 ? "short" : undefined, year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** /chat/:id: a one-to-one chat with a friend. */
export function ChatPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { me, status, openSignIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [other, setOther] = useState<PublicUser | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [state, setState] = useState<"ok" | "not-friends" | "missing" | "offline">("ok");
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [below, setBelow] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const keep = useRef<{ h: number; y: number } | null>(null);
  const lastId = useRef<number | string | null>(null);
  const temp = useRef(0);
  const readTimer = useRef(0);

  useEffect(() => setLight(LIGHTS.me), []);

  const nearBottom = () => window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 160;
  const toBottom = (smooth = false) => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth && !reduced() ? "smooth" : "auto" });

  const markRead = useCallback(() => {
    window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(() => {
      if (document.visibilityState === "visible") void api(`/chat/${id}/read`, { body: {} }).catch(() => {});
    }, 250);
  }, [id]);

  useEffect(() => {
    if (status !== "in") return;
    let gone = false;
    setLines(null);
    void api<{ user: PublicUser; relation: string }>(`/users/${id}`).then(
      (d) => !gone && setOther(d.user),
      (e) => !gone && e instanceof ApiError && e.status === 404 && setState("missing"),
    );
    void api<{ messages: ChatMsg[] }>(`/chat/${id}`).then(
      (d) => {
        if (gone) return;
        setLines(d.messages);
        setMore(d.messages.length >= PAGE);
        setState("ok");
        markRead();
        requestAnimationFrame(() => toBottom());
      },
      (e) => {
        if (gone) return;
        if (e instanceof ApiError && e.status === 403) setState("not-friends");
        else if (e instanceof ApiError && e.status === 404) setState("missing");
        else setState("offline");
        setLines([]);
      },
    );
    return () => {
      gone = true;
    };
  }, [id, status, markRead]);

  useEffect(() => {
    const on = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [markRead]);

  useEffect(() => {
    const on = () => {
      if (nearBottom()) setBelow(0);
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useLive((e) => {
    if (e.t === "friends") {
      // the friendship may have ended or begun: ask again
      void api<{ messages: ChatMsg[] }>(`/chat/${id}`).then(
        (d) => {
          setState("ok");
          setLines((cur) => (cur && cur.length ? cur : d.messages));
        },
        (err) => err instanceof ApiError && err.status === 403 && setState("not-friends"),
      );
      return;
    }
    if (e.t === "read") {
      if (e.with === id) setLines((cur) => cur?.map((x) => (x.from === me?.id && !x.read ? { ...x, read: true } : x)) ?? cur);
      return;
    }
    if (e.t !== "msg" || e.with !== id) return;
    const m = e.msg;
    const mine = m.from === me?.id;
    const stick = nearBottom();
    setLines((cur) => {
      if (!cur) return cur;
      if (cur.some((x) => x.id === m.id)) return cur;
      if (mine) {
        const i = cur.findIndex((x) => x.state === "sending" && x.body === m.body);
        if (i >= 0) return cur.map((x, j) => (j === i ? m : x));
      }
      return [...cur, m];
    });
    if (!mine) {
      sfx.pluck();
      markRead();
      if (stick) requestAnimationFrame(() => toBottom(true));
      else setBelow((n) => n + 1);
    }
  });

  // a message that just arrived pops out of its side; earlier pages keep the reader's place
  useLayoutEffect(() => {
    if (keep.current) {
      const { h, y } = keep.current;
      keep.current = null;
      window.scrollTo(0, y + document.documentElement.scrollHeight - h);
      return;
    }
    const last = lines?.[lines.length - 1];
    if (!last) return;
    const prev = lastId.current;
    lastId.current = last.id;
    if (prev === null || prev === last.id || reduced()) return;
    const el = log.current?.querySelector<HTMLElement>(`[data-mid="${last.id}"] .bubble, [data-mid="${last.id}"] .bubble-emoji`);
    play(el, [{ transform: "translateY(10px) scale(0.86)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: EASE.pop });
  }, [lines]);

  const loadEarlier = async () => {
    if (!lines?.length || loadingMore) return;
    const first = lines.find((x) => typeof x.id === "number" && x.id > 0);
    if (!first) return;
    setLoadingMore(true);
    try {
      const d = await api<{ messages: ChatMsg[] }>(`/chat/${id}?before=${first.id}`);
      keep.current = { h: document.documentElement.scrollHeight, y: window.scrollY };
      setLines((cur) => [...d.messages.filter((m) => !cur?.some((x) => x.id === m.id)), ...(cur ?? [])]);
      setMore(d.messages.length >= PAGE);
    } finally {
      setLoadingMore(false);
    }
  };

  const send = async (raw: string, retry?: number) => {
    const body = raw.trim();
    if (!body || !me) return;
    const tid = retry ?? -++temp.current;
    if (retry === undefined) {
      setLines((cur) => [...(cur ?? []), { id: tid, from: me.id, body, at: Date.now(), read: false, state: "sending" }]);
      setText("");
      requestAnimationFrame(() => toBottom(true));
    } else setLines((cur) => cur?.map((x) => (x.id === tid ? { ...x, state: "sending" } : x)) ?? cur);
    sfx.pop();
    try {
      const d = await api<{ message: ChatMsg }>(`/chat/${id}`, { body: { body } });
      setLines((cur) => {
        if (!cur) return cur;
        if (cur.some((x) => x.id === d.message.id)) return cur.filter((x) => x.id !== tid);
        return cur.map((x) => (x.id === tid ? d.message : x));
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setState("not-friends");
      setLines((cur) => cur?.map((x) => (x.id === tid ? { ...x, state: "failed" } : x)) ?? cur);
    }
  };

  // the box grows with what you type, up to five lines
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  if (status === "loading") return <PageLoading lang={lang} />;
  if (status === "out")
    return (
      <div className="screen chat">
        <ChatHead onBack={onBack} />
        <div className="empty me-out">
          <p className="me-out-title">{zh ? "登录后才能聊天" : "Sign in to chat"}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => openSignIn()}>
            {zh ? "登录 / 注册" : "Sign in or sign up"}
          </button>
        </div>
      </div>
    );

  const myColor = AV_COLORS[(me?.ac ?? colorFor(me?.id ?? "")) % AV_COLORS.length];
  const lastMine = lines ? [...lines].reverse().find((x) => x.from === me?.id) : undefined;
  const fine = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
  const ideas = zh ? ["嗨 👋", "今晚来玩吗？", "干杯 🍻"] : ["Hey 👋", "Playing tonight?", "Cheers 🍻"];

  return (
    <div className="screen chat" style={{ ["--mine" as string]: myColor } as React.CSSProperties}>
      <ChatHead onBack={onBack} user={other} />

      {state === "missing" && (
        <div className="empty">
          <p>{zh ? "找不到这个人" : "This profile doesn't exist"}</p>
        </div>
      )}
      {state === "not-friends" && (
        <div className="empty chat-blocked">
          <p>{zh ? "加为好友以后才能聊天" : "You can chat once you're friends"}</p>
          <a className="btn btn-primary" href={`/u/${id}`}>
            {zh ? "去 TA 的主页" : "Open their profile"}
          </a>
        </div>
      )}
      {state === "offline" && (
        <div className="empty">
          <p>{zh ? "聊天没加载出来，检查一下网络" : "The chat didn't load. Check your connection"}</p>
        </div>
      )}

      {state === "ok" && (
        <>
          <ol className="chat-log" ref={log} aria-live="polite">
            {more && (
              <li className="chat-more">
                <button type="button" className="link-btn" onClick={() => void loadEarlier()} disabled={loadingMore}>
                  {loadingMore ? (zh ? "加载中" : "Loading") : zh ? "看更早的消息" : "Earlier messages"}
                </button>
              </li>
            )}
            {lines?.length === 0 && other && (
              <li className="chat-hello">
                <Avatar uid={other.id} name={other.name} av={other.av} ac={other.ac} size={72} frame={other.frame} />
                <p>{zh ? `和 ${other.name} 打个招呼` : `Say hi to ${other.name}`}</p>
                <div className="picker chat-ideas">
                  {ideas.map((t) => (
                    <button key={t} type="button" className="chip" onClick={() => void send(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </li>
            )}
            {lines?.map((m, i) => {
              const prev = lines[i - 1];
              const next = lines[i + 1];
              const mine = m.from === me?.id;
              const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
              const stamp = newDay || m.at - prev.at > GAP;
              const endsRun = !next || next.from !== m.from || next.at - m.at > GAP || new Date(next.at).toDateString() !== new Date(m.at).toDateString();
              const startsRun = stamp || prev.from !== m.from;
              const emoji = bigEmoji(m.body);
              return (
                <li key={m.id} data-mid={m.id} className={`chat-line ${mine ? "is-mine" : "is-theirs"} ${startsRun ? "starts" : ""} ${endsRun ? "ends" : ""}`}>
                  {stamp && (
                    <span className="chat-stamp">
                      {newDay ? `${dayLabel(m.at, lang)} ` : ""}
                      {clockOf(m.at, lang)}
                    </span>
                  )}
                  {emoji ? (
                    <span className="bubble-emoji" title={clockOf(m.at, lang)}>
                      {m.body.trim()}
                    </span>
                  ) : (
                    <span className="bubble" title={clockOf(m.at, lang)}>
                      {m.body}
                    </span>
                  )}
                  {m.state === "failed" && (
                    <button type="button" className="chat-note is-failed" onClick={() => void send(m.body, m.id as number)}>
                      {zh ? "没发出去，点这里重发" : "Not sent. Tap to retry"}
                    </button>
                  )}
                  {m.state === "sending" && <span className="chat-note">{zh ? "发送中" : "Sending"}</span>}
                  {m === lastMine && !m.state && m.read && <span className="chat-note">{zh ? "已读" : "Read"}</span>}
                </li>
              );
            })}
          </ol>

          {below > 0 && (
            <button
              type="button"
              className="chat-below"
              onClick={() => {
                setBelow(0);
                toBottom(true);
              }}
            >
              <ArrowDown size={15} />
              {zh ? `${below} 条新消息` : `${below} new`}
            </button>
          )}

          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
              box.current?.focus();
            }}
          >
            <div className="field chat-field">
              <textarea
                ref={box}
                rows={1}
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (fine && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                placeholder={zh ? "发消息" : "Message"}
                aria-label={zh ? "消息" : "Message"}
                enterKeyHint="send"
              />
              <button type="submit" className="chat-send" disabled={!text.trim()} aria-label={zh ? "发送" : "Send"}>
                <ArrowUp size={20} strokeWidth={2.6} />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function ChatHead({ onBack, user }: { onBack: () => void; user?: PublicUser | null }) {
  const { ui } = useStore();
  return (
    <header className="chat-head">
      <button type="button" className="icon-btn" onClick={onBack} aria-label={ui("back")}>
        <ChevronLeft size={22} />
      </button>
      {user && (
        <a className="chat-who" href={`/u/${user.id}`}>
          <Avatar uid={user.id} name={user.name} av={user.av} ac={user.ac} size={36} frame={user.frame} />
          <span>
            <strong>{user.name}</strong>
            <small>{user.city}</small>
          </span>
        </a>
      )}
    </header>
  );
}
