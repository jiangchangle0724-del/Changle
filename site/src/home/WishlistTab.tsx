import { Check, ChevronDown, Crown, Flame, Gamepad2, Send, Sparkles, Wrench } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import { gsap, reduced } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { savedName, saveName } from "../online/config";
import { useStore } from "../store";
import { useAccount } from "../account/AccountContext";
import { Avatar } from "../account/Avatar";
import { ago } from "../lib/time";

/** `text`: the name; `desc`: what it is; `rules`: how it's played (wishes from before they were asked for have neither). */
export type Wish = { id: number; text: string; desc?: string; rules?: string; kind: "game" | "feature"; name: string; votes: number; status: "new" | "planned" | "done"; at: number; voted: boolean; mine: boolean };

type Kind = Wish["kind"];
type Range = [number, number];
/** What a wish needs, in characters (the server checks the same: worker/hub.ts, addWish). */
const NAME_MIN = 2;
const DESC: Range = [10, 300];
const RULES: Range = [10, 600];

/** Tidy a description or rules as the server does (worker/hub.ts, cleanLines), so the count here is the count there. */
function tidy(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const within = (n: number, [min, max]: Range) => n >= min && n <= max;

// a wish half written stays put while you look round the other tabs
type Draft = { kind: Kind; text: string; desc: string; rules: string };
const DRAFT = "changle.wish-draft";
function loadDraft(): Draft {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as Partial<Draft> | null;
    if (d && typeof d === "object") return { kind: d.kind === "feature" ? "feature" : "game", text: String(d.text ?? ""), desc: String(d.desc ?? ""), rules: String(d.rules ?? "") };
  } catch {
    /* none */
  }
  return { kind: "game", text: "", desc: "", rules: "" };
}
function keepDraft(d: Draft) {
  try {
    if (d.text || d.desc || d.rules) sessionStorage.setItem(DRAFT, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT);
  } catch {
    /* fine */
  }
}

/** Why a wish didn't go through, in the reader's language. */
function sorry(code: string, kind: Kind, zh: boolean): string {
  const game = kind === "game";
  const rulesZh = game ? "规则" : "用法";
  const rulesEn = game ? "the rules" : "how it works";
  switch (code) {
    case "too-short":
      return zh ? `${game ? "游戏名" : "功能名"}至少写 ${NAME_MIN} 个字。` : `Write at least ${NAME_MIN} characters for the name.`;
    case "desc-short":
      return zh ? `介绍至少写 ${DESC[0]} 个字。` : `Write at least ${DESC[0]} characters for the description.`;
    case "desc-long":
      return zh ? `介绍最多 ${DESC[1]} 个字。` : `Keep the description to ${DESC[1]} characters or fewer.`;
    case "rules-short":
      return zh ? `${rulesZh}至少写 ${RULES[0]} 个字。` : `Write at least ${RULES[0]} characters for ${rulesEn}.`;
    case "rules-long":
      return zh ? `${rulesZh}最多 ${RULES[1]} 个字。` : `Keep ${rulesEn} to ${RULES[1]} characters or fewer.`;
    case "slow-down":
      return zh ? "发得太快了，过一会儿再试。" : "That's a lot of wishes. Try again in a bit.";
    default:
      return zh ? "没发出去，检查一下网络。" : "Didn't send. Check your connection.";
  }
}

/** Ideas for what to add next: anyone can post, anyone can upvote; what got made folds away at the bottom. */
export function WishlistTab() {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<"top" | "new">("top");
  /** how many times the list has arrived from the server */
  const [loaded, setLoaded] = useState(0);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const { kind, text, desc, rules } = draft;
  const game = kind === "game";
  const { me } = useAccount();
  const [name, setName] = useState(() => savedName() || me?.name.slice(0, 14) || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [madeOpen, setMadeOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const d = await api<{ wishes: Wish[] }>("/wishes", { signal });
      setWishes(d.wishes);
      setLoaded((n) => n + 1);
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

  useEffect(() => keepDraft(draft), [draft]);

  const edit = (d: Partial<Draft>) => {
    setDraft((x) => ({ ...x, ...d }));
    setError("");
  };

  const ready = text.replace(/\s+/g, " ").trim().length >= NAME_MIN && within(tidy(desc).length, DESC) && within(tidy(rules).length, RULES);

  // The order is set when the list arrives, the sort changes or a wish is added, not by a vote: a
  // wish that jumped up or down the list as you voted left a quick second tap on someone else's.
  const count = wishes?.length ?? 0;
  const order = useMemo(
    () => (wishes ?? []).slice().sort((a, b) => (sort === "top" ? b.votes - a.votes || b.at - a.at : b.at - a.at)).map((w) => w.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, count, loaded],
  );
  const byId = new Map((wishes ?? []).map((w) => [w.id, w]));
  const sorted = order.map((id) => byId.get(id)).filter((w): w is Wish => !!w);
  // made ones are off the list: they fold away under "already made"
  const open = sorted.filter((w) => w.status !== "done");
  const made = sorted.filter((w) => w.status === "done");

  const submit = async () => {
    if (!ready || sending) return;
    setSending(true);
    setError("");
    try {
      if (name.trim()) saveName(name.trim());
      const d = await api<{ wish: Wish }>("/wishes", { body: { text: text.trim(), desc: tidy(desc), rules: tidy(rules), kind, name: name.trim() } });
      setWishes((w) => [d.wish, ...(w ?? [])]);
      setDraft({ kind, text: "", desc: "", rules: "" });
      setSort("new");
      sfx.correct();
      requestAnimationFrame(() => {
        const el = list.current?.querySelector(`[data-wish="${d.wish.id}"]`);
        if (el && !reduced()) gsap.fromTo(el, { y: -16, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, clearProps: "transform,opacity" });
      });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(code || "network");
      // (the field the server turned down gets the cursor)
      const field = code === "too-short" ? "text" : code.startsWith("desc-") ? "desc" : code.startsWith("rules-") ? "rules" : "";
      if (field) form.current?.querySelector<HTMLElement>(`#wish-${field}`)?.focus();
    } finally {
      setSending(false);
    }
  };

  // one vote on its way per wish, and a quick double tap is one tap (even when the answer is quicker
  // than the second tap): it counts once, and answers can't land out of order
  const voting = useRef(new Set<number>());
  const tapped = useRef(new Map<number, number>());
  const vote = async (w: Wish, btn: HTMLElement) => {
    const now = performance.now();
    if (voting.current.has(w.id) || now - (tapped.current.get(w.id) ?? -Infinity) < 450) return;
    tapped.current.set(w.id, now);
    voting.current.add(w.id);
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
    } finally {
      voting.current.delete(w.id);
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

  const card = (w: Wish) => <WishCard key={w.id} w={w} zh={zh} lang={lang} admin={!!me?.admin} onVote={vote} onModerate={moderate} />;

  return (
    <div className="wish">
      <header className="wish-head">
        <h2 className="wish-title">{zh ? "想玩什么？" : "What should we add?"}</h2>
        <p className="hint">{zh ? "好玩的游戏、想要的功能都写在这里。大家点赞，票多的先做。" : "A game you love, a feature you want. Upvote what you'd play; the top wishes get built first."}</p>
      </header>

      <form
        className="wish-form panel"
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Reward kind={kind} zh={zh} />
        <div className="seg seg-sm" role="group" aria-label={zh ? "许什么愿" : "What you're wishing for"}>
          <button type="button" aria-pressed={game} onClick={() => edit({ kind: "game" })}>
            <Gamepad2 size={15} /> {zh ? "游戏" : "Game"}
          </button>
          <button type="button" aria-pressed={!game} onClick={() => edit({ kind: "feature" })}>
            <Wrench size={15} /> {zh ? "功能" : "Feature"}
          </button>
        </div>

        <div className="wish-field">
          <label className="field-label" htmlFor="wish-text">
            {game ? (zh ? "游戏名" : "Game name") : zh ? "功能名" : "Feature name"}
          </label>
          <div className="field">
            <input
              id="wish-text"
              value={text}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="next"
              onChange={(e) => edit({ text: e.target.value })}
              onKeyDown={(e) => {
                // (Enter goes on to the description, not off with a half-made wish)
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                form.current?.querySelector<HTMLElement>("#wish-desc")?.focus();
              }}
              placeholder={game ? (zh ? "比如：狼人杀" : "e.g. Werewolf") : zh ? "比如：每晚比分存档" : "e.g. Save each night's scores"}
            />
          </div>
        </div>
        <LongField
          id="wish-desc"
          zh={zh}
          range={DESC}
          rows={3}
          value={desc}
          onChange={(v) => edit({ desc: v })}
          label={zh ? "介绍" : "Description"}
          hint={game ? (zh ? "这是个什么游戏，好玩在哪里。" : "What the game is, and what makes it fun.") : zh ? "这个功能是做什么的，为什么想要。" : "What it does, and why you'd want it."}
          placeholder={
            game
              ? zh
                ? "比如：大家闭眼，狼人夜里悄悄杀人，天亮后全桌一起把狼找出来。"
                : "e.g. Werewolves pick someone off each night; by day the whole table hunts them down."
              : zh
                ? "比如：一晚的比分和惩罚都记下来，下次聚会接着算。"
                : "e.g. Keep the night's scores and penalties, so the next party picks up where we left off."
          }
        />
        <LongField
          id="wish-rules"
          zh={zh}
          range={RULES}
          rows={4}
          value={rules}
          onChange={(v) => edit({ rules: v })}
          label={game ? (zh ? "规则" : "Rules") : zh ? "用法" : "How it works"}
          hint={game ? (zh ? "几个人玩，怎么轮流，怎么分输赢，输了怎么罚。" : "How many play, how a turn goes, who wins, and what the loser does.") : zh ? "什么时候用，一步一步怎么操作。" : "When you'd use it, and how it works step by step."}
          placeholder={
            game
              ? zh
                ? "比如：6 到 12 人。每晚狼人选一个人出局，白天大家投票，票最多的出局……"
                : "e.g. 6 to 12 players. Each night the wolves pick someone; each day everyone votes someone out..."
              : zh
                ? "比如：散场时点保存，下次开桌选上次的存档，比分接着算。"
                : "e.g. Tap Save when the night ends; next time, pick last night's save and the scores carry on."
          }
        />

        <div className="wish-form-row">
          <div className="field wish-name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={zh ? "署名（可不填）" : "Your name (optional)"} maxLength={14} aria-label={zh ? "署名" : "Name"} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!ready || sending}>
            <Send size={16} />
            {zh ? "许愿" : "Add"}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {sorry(error, kind, zh)}
          </p>
        )}
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
      ) : open.length === 0 ? (
        <div className="empty">
          <Sparkles size={22} />
          <p>{made.length ? (zh ? "心愿都实现了，下一个由你来许。" : "Every wish so far came true. Make the next one.") : zh ? "还没有心愿，第一个由你来写。" : "No wishes yet. Write the first one."}</p>
        </div>
      ) : (
        <ul className="wish-list" ref={list}>
          {open.map(card)}
        </ul>
      )}

      {made.length > 0 && (
        <section className="wish-made">
          <button type="button" className="wish-made-head" aria-expanded={madeOpen} aria-controls="wish-made-list" onClick={() => setMadeOpen((o) => !o)}>
            <span className="wish-made-tick" aria-hidden="true">
              <Check size={15} strokeWidth={3} />
            </span>
            <span>{zh ? "已经做出来了" : "Already made"}</span>
            <span className="wish-made-n tabular">{made.length}</span>
            <ChevronDown size={18} className="wish-chev" aria-hidden="true" />
          </button>
          <Reveal open={madeOpen} id="wish-made-list">
            <ul className="wish-list">{made.map(card)}</ul>
          </Reveal>
        </section>
      )}
    </div>
  );
}

/** The promise on the form: a wish that goes live earns its maker the gold frame and the limited outfits. */
function Reward({ kind, zh }: { kind: Kind; zh: boolean }) {
  const { me, openSignIn } = useAccount();
  const game = kind === "game";
  return (
    <div className="wish-reward">
      {me ? (
        <Avatar uid={me.id} name={me.name} av={me.av} ac={me.ac} size={40} frame="gold" className="wish-reward-face" />
      ) : (
        <span className="avatar avatar-gold wish-reward-face wish-reward-crown" aria-hidden="true">
          <Crown size={20} />
        </span>
      )}
      <div className="wish-reward-text">
        <p>
          {game
            ? zh
              ? "这个游戏上线后，许愿的人会得到专属金色头像框和限量服饰。"
              : "If this game goes live, whoever wished for it gets an exclusive gold avatar frame and limited outfits."
            : zh
              ? "这个功能上线后，许愿的人会得到专属金色头像框和限量服饰。"
              : "If this feature goes live, whoever wished for it gets an exclusive gold avatar frame and limited outfits."}
        </p>
        {!me && (
          <p className="wish-reward-signin">
            <button type="button" className="link-btn" onClick={() => openSignIn()}>
              {zh ? "登录" : "Sign in"}
            </button>
            {zh ? "后再许愿，才领得到。" : " before you wish to claim it."}
          </p>
        )}
      </div>
    </div>
  );
}

/** A description or the rules: label, a line of help, how many characters so far, and the box. */
function LongField({ id, label, hint, placeholder, value, onChange, range, rows, zh }: { id: string; label: string; hint: string; placeholder: string; value: string; onChange: (v: string) => void; range: Range; rows: number; zh: boolean }) {
  const [min, max] = range;
  const n = tidy(value).length;
  const ok = within(n, range);
  const box = useRef<HTMLTextAreaElement>(null);
  // the box grows with what you write (from its first few lines up to about a dozen)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);
  return (
    <div className="wish-field">
      <div className="wish-field-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <span className={`wish-count tabular ${ok ? "is-ok" : ""}`} id={`${id}-count`}>
          {ok && <Check size={13} strokeWidth={3} aria-hidden="true" />}
          {n === 0 ? (zh ? `${min} 到 ${max} 字` : `${min} to ${max} characters`) : n < min ? (zh ? `还差 ${min - n} 字` : `${min - n} more to go`) : `${n}/${max}`}
        </span>
      </div>
      <p className="wish-field-hint" id={`${id}-hint`}>
        {hint}
      </p>
      <div className="field">
        <textarea ref={box} id={id} rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-describedby={`${id}-hint ${id}-count`} />
      </div>
    </div>
  );
}

/** One wish: its name and what it is, the rules folded away, who wished and when. Made ones have no vote. */
function WishCard({ w, zh, lang, admin, onVote, onModerate }: { w: Wish; zh: boolean; lang: "zh" | "en"; admin: boolean; onVote: (w: Wish, btn: HTMLElement) => Promise<void>; onModerate: (w: Wish, change: { status?: Wish["status"]; hide?: boolean }) => Promise<void> }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesId = useId();
  const made = w.status === "done";
  const game = w.kind === "game";
  return (
    <li className={`wish-item ${made ? "is-made" : ""}`} data-wish={w.id}>
      {made ? (
        <span className="wish-made-mark" title={zh ? "已上线" : "Shipped"}>
          <Check size={17} strokeWidth={3} />
        </span>
      ) : (
        <button type="button" className={`vote ${w.voted ? "is-voted" : ""}`} onClick={(e) => void onVote(w, e.currentTarget)} aria-pressed={w.voted} aria-label={zh ? `点赞，现在 ${w.votes} 票` : `Upvote, ${w.votes} votes`}>
          <Flame size={20} />
          <span className="tabular">{w.votes}</span>
        </button>
      )}
      <div className="wish-body">
        <p className="wish-text">{w.text}</p>
        {w.desc && <p className="wish-desc">{w.desc}</p>}
        {w.rules && (
          <>
            <button type="button" className="wish-rules-btn" aria-expanded={rulesOpen} aria-controls={rulesId} onClick={() => setRulesOpen((o) => !o)}>
              {game ? (zh ? "规则" : "Rules") : zh ? "用法" : "How it works"}
              <ChevronDown size={16} className="wish-chev" aria-hidden="true" />
            </button>
            <Reveal open={rulesOpen} id={rulesId}>
              <p className="wish-rules">{w.rules}</p>
            </Reveal>
          </>
        )}
        <p className="wish-meta">
          <span className={`wish-kind wish-${w.kind}`}>{game ? (zh ? "游戏" : "Game") : zh ? "功能" : "Feature"}</span>
          {w.status === "planned" && <span className="wish-status is-planned">{zh ? "在做了" : "Building"}</span>}
          <span>{w.name || (zh ? "匿名" : "Anonymous")}</span>
          <span>{ago(w.at, lang)}</span>
        </p>
        {admin && (
          <div className="wish-admin">
            <div className="seg seg-sm" role="group" aria-label={zh ? "状态" : "Status"}>
              {(["new", "planned", "done"] as const).map((st) => (
                <button key={st} type="button" aria-pressed={w.status === st} onClick={() => void onModerate(w, { status: st })}>
                  {st === "new" ? (zh ? "新" : "New") : st === "planned" ? (zh ? "在做了" : "Building") : zh ? "已上线" : "Shipped"}
                </button>
              ))}
            </div>
            <button type="button" className="link-btn danger" onClick={() => void onModerate(w, { hide: true })}>
              {zh ? "隐藏" : "Hide"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Its children when `open`: they grow in and fold away on the house ease (at once with reduced motion). */
function Reveal({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef(open);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const changed = was.current !== open;
    was.current = open;
    gsap.killTweensOf(el);
    if (!changed || reduced()) {
      el.hidden = !open;
      gsap.set(el, { clearProps: "height,opacity,overflow" });
      return;
    }
    gsap.set(el, { overflow: "hidden" });
    if (open) {
      if (el.hidden) gsap.set(el, { height: 0, opacity: 0 });
      el.hidden = false;
      gsap.to(el, { height: "auto", opacity: 1, duration: 0.45, clearProps: "height,opacity,overflow" });
    } else
      gsap.to(el, {
        height: 0,
        opacity: 0,
        duration: 0.26,
        ease: "power2.in",
        onComplete: () => {
          el.hidden = true;
          gsap.set(el, { clearProps: "height,opacity,overflow" });
        },
      });
  }, [open]);
  return (
    <div ref={ref} id={id} className="wish-reveal">
      {children}
    </div>
  );
}
