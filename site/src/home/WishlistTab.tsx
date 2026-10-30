import { Flame, Gamepad2, Send, Sparkles, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { gsap, reduced } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { savedName, saveName } from "../online/config";
import { useStore } from "../store";
import { useAccount } from "../account/AccountContext";
import { ago } from "../lib/time";

export type Wish = { id: number; text: string; kind: "game" | "feature"; name: string; votes: number; status: "new" | "planned" | "done"; at: number; voted: boolean; mine: boolean };

/** Ideas for what to add next: anyone can post, anyone can upvote. */
export function WishlistTab() {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<"top" | "new">("top");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"game" | "feature">("game");
  const { me } = useAccount();
  const [name, setName] = useState(() => savedName() || me?.name.slice(0, 14) || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLUListElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const d = await api<{ wishes: Wish[] }>("/wishes", { signal });
      setWishes(d.wishes);
      setFailed(false);
    } catch {
      if (!signal?.aborted) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  const sorted = (wishes ?? []).slice().sort((a, b) => (sort === "top" ? b.votes - a.votes || b.at - a.at : b.at - a.at));

  const submit = async () => {
    const tt = text.trim();
    if (tt.length < 3 || sending) return;
    setSending(true);
    setError("");
    try {
      if (name.trim()) saveName(name.trim());
      const d = await api<{ wish: Wish }>("/wishes", { body: { text: tt, kind, name: name.trim() } });
      setWishes((w) => [d.wish, ...(w ?? [])]);
      setText("");
      setSort("new");
      sfx.correct();
      requestAnimationFrame(() => {
        const el = list.current?.querySelector(`[data-wish="${d.wish.id}"]`);
        if (el && !reduced()) gsap.fromTo(el, { y: -16, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, clearProps: "transform,opacity" });
      });
    } catch (e) {
      setError(e instanceof ApiError && e.code === "slow-down" ? (zh ? "发得太快了，过一会儿再试。" : "That's a lot of wishes. Try again in a bit.") : zh ? "没发出去，检查一下网络。" : "Didn't send. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const vote = async (w: Wish, btn: HTMLElement) => {
    const up = !w.voted;
    setWishes((list) => list?.map((x) => (x.id === w.id ? { ...x, voted: up, votes: x.votes + (up ? 1 : -1) } : x)) ?? null);
    if (up) {
      sfx.pop();
      if (!reduced()) {
        gsap.fromTo(btn.querySelector("svg"), { scale: 1.6, rotate: -14 }, { scale: 1, rotate: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
        const plus = document.createElement("span");
        plus.className = "vote-plus";
        plus.textContent = "+1";
        btn.appendChild(plus);
        gsap.fromTo(plus, { y: 0, opacity: 1 }, { y: -26, opacity: 0, duration: 0.8, ease: "power2.out", onComplete: () => plus.remove() });
      }
    }
    try {
      const d = await api<{ votes: number; voted: boolean }>(`/wishes/${w.id}/vote`, { body: { up } });
      setWishes((list) => list?.map((x) => (x.id === w.id ? { ...x, voted: d.voted, votes: d.votes } : x)) ?? null);
    } catch {
      setWishes((list) => list?.map((x) => (x.id === w.id ? { ...x, voted: w.voted, votes: w.votes } : x)) ?? null);
    }
  };

  // the site owner can mark a wish as being built or shipped, or hide it
  const moderate = async (w: Wish, change: { status?: Wish["status"]; hide?: boolean }) => {
    try {
      if (change.hide) {
        await api(`/wishes/${w.id}`, { method: "DELETE" });
        setWishes((list) => list?.filter((x) => x.id !== w.id) ?? null);
      } else if (change.status) {
        await api(`/wishes/${w.id}`, { method: "PUT", body: { status: change.status } });
        setWishes((list) => list?.map((x) => (x.id === w.id ? { ...x, status: change.status! } : x)) ?? null);
      }
      sfx.tap();
    } catch {
      /* nothing changed */
    }
  };

  return (
    <div className="wish">
      <header className="wish-head">
        <h2 className="wish-title">{zh ? "想玩什么？" : "What should we add?"}</h2>
        <p className="hint">{zh ? "好玩的游戏、想要的功能都写在这里。大家点赞，票多的先做。" : "A game you love, a feature you want. Upvote what you'd play; the top wishes get built first."}</p>
      </header>

      <form
        className="wish-form panel"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="seg seg-sm" role="group">
          <button type="button" aria-pressed={kind === "game"} onClick={() => setKind("game")}>
            <Gamepad2 size={15} /> {zh ? "游戏" : "Game"}
          </button>
          <button type="button" aria-pressed={kind === "feature"} onClick={() => setKind("feature")}>
            <Wrench size={15} /> {zh ? "功能" : "Feature"}
          </button>
        </div>
        <div className="field">
          <textarea
            rows={2}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === "game" ? (zh ? "比如：狼人杀，带语音法官" : "e.g. Werewolf with a narrator voice") : zh ? "比如：可以存每晚的比分" : "e.g. Save the scores from each night"}
            aria-label={zh ? "心愿" : "Your wish"}
          />
        </div>
        <div className="wish-form-row">
          <div className="field wish-name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={zh ? "署名（可不填）" : "Your name (optional)"} maxLength={14} aria-label={zh ? "署名" : "Name"} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={text.trim().length < 3 || sending}>
            <Send size={16} />
            {zh ? "许愿" : "Add"}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      <div className="wish-sort">
        <div className="seg seg-sm">
          <button type="button" aria-pressed={sort === "top"} onClick={() => setSort("top")}>
            {zh ? "最多人想要" : "Most wanted"}
          </button>
          <button type="button" aria-pressed={sort === "new"} onClick={() => setSort("new")}>
            {zh ? "最新" : "Newest"}
          </button>
        </div>
      </div>

      {failed && !wishes ? (
        <div className="empty">
          <p>{zh ? "心愿单暂时打不开。" : "The wishlist didn't load."}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            {zh ? "再试一次" : "Try again"}
          </button>
        </div>
      ) : !wishes ? (
        <ul className="wish-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="wish-item is-ghost" />
          ))}
        </ul>
      ) : sorted.length === 0 ? (
        <div className="empty">
          <Sparkles size={22} />
          <p>{zh ? "还没有心愿，第一个由你来写。" : "No wishes yet. Write the first one."}</p>
        </div>
      ) : (
        <ul className="wish-list" ref={list}>
          {sorted.map((w) => (
            <li key={w.id} className="wish-item" data-wish={w.id}>
              <button type="button" className={`vote ${w.voted ? "is-voted" : ""}`} onClick={(e) => void vote(w, e.currentTarget)} aria-pressed={w.voted} aria-label={zh ? `点赞，现在 ${w.votes} 票` : `Upvote, ${w.votes} votes`}>
                <Flame size={20} />
                <span className="tabular">{w.votes}</span>
              </button>
              <div className="wish-body">
                <p className="wish-text">{w.text}</p>
                <p className="wish-meta">
                  <span className={`wish-kind wish-${w.kind}`}>{w.kind === "game" ? (zh ? "游戏" : "Game") : zh ? "功能" : "Feature"}</span>
                  {w.status !== "new" && <span className={`wish-status is-${w.status}`}>{w.status === "planned" ? (zh ? "在做了" : "Building") : zh ? "已上线" : "Shipped"}</span>}
                  <span>{w.name || (zh ? "匿名" : "Anonymous")}</span>
                  <span>{ago(w.at, lang)}</span>
                </p>
                {me?.admin && (
                  <div className="wish-admin">
                    <div className="seg seg-sm" role="group" aria-label={zh ? "状态" : "Status"}>
                      {(["new", "planned", "done"] as const).map((st) => (
                        <button key={st} type="button" aria-pressed={w.status === st} onClick={() => void moderate(w, { status: st })}>
                          {st === "new" ? (zh ? "新" : "New") : st === "planned" ? (zh ? "在做了" : "Building") : zh ? "已上线" : "Shipped"}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="link-btn danger" onClick={() => void moderate(w, { hide: true })}>
                      {zh ? "隐藏" : "Hide"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
