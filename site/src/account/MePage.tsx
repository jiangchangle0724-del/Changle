import { Copy, LogOut, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { api } from "../lib/api";
import { LIGHTS, setLight } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { useStore } from "../store";
import { API } from "../config";
import { useAccount, useLive, type SelfUser } from "./AccountContext";
import type { Drawn } from "./avatar/Maker";
import { figureBody } from "./avatar/pics";
import { Face } from "./avatar/Face";
import { FriendsPanel, useFriends } from "./Friends";
import { FavoriteGame, HistoryList, type HistoryRow } from "./History";
import { ProfileForm } from "./ProfileForm";

export type Stats = { games: number; drinks: number; favorite: string | null; friends: number };

export const GENDER_LABEL: Record<string, [string, string]> = { female: ["女", "Female"], male: ["男", "Male"], nonbinary: ["非二元", "Non-binary"], private: ["", ""] };

/** /me: your profile, the games you played, your friends. */
export function MePage({ onBack }: { onBack: () => void }) {
  const { me, status, openSignIn, signOut, setMe } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [tab, setTab] = useState<"history" | "friends">(() => (/^\/me\/friends\b/.test(window.location.pathname) ? "friends" : "history"));
  const [hist, setHist] = useState<{ history: HistoryRow[]; stats: Stats } | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const { lists, load } = useFriends();

  useEffect(() => setLight(LIGHTS.me), []);
  useEffect(() => {
    if (status !== "in") return;
    void api<{ history: HistoryRow[]; stats: Stats }>("/me/history").then(setHist, () => {});
  }, [status]);
  useLive((e) => {
    if (e.t === "friends") void api<{ history: HistoryRow[]; stats: Stats }>("/me/history").then(setHist, () => {});
  });

  if (status === "loading") return <div className="screen" />;
  if (!me)
    return (
      <div className="screen me">
        <TopBar onBack={onBack} />
        <div className="empty me-out">
          <p className="me-out-title">{zh ? "登录后就有自己的主页" : "Sign in for a profile of your own"}</p>
          <p>{zh ? "头像会出现在每一桌上，玩过的游戏都有记录，还能加好友聊天。" : "Your face shows at every table, your games are saved, and you can add friends and chat."}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => openSignIn()}>
            {zh ? "登录 / 注册" : "Sign in or sign up"}
          </button>
        </div>
      </div>
    );

  const incoming = lists?.incoming.length ?? 0;
  const unread = lists?.friends.reduce((n, f) => n + f.unread, 0) ?? 0;
  const gender = GENDER_LABEL[me.gender]?.[zh ? 0 : 1];

  const save = async (v: Parameters<Parameters<typeof ProfileForm>[0]["onSubmit"]>[0]) => {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ user: SelfUser }>("/me", { method: "PUT", body: v });
      setMe(d.user);
      setEditing(false);
      sfx.correct();
    } catch {
      setError(zh ? "没保存上，检查一下填的内容" : "Couldn't save. Check the fields");
    } finally {
      setBusy(false);
    }
  };

  const photo = async (b: Blob) => {
    try {
      const d = await api<{ user: SelfUser }>("/me/avatar", { method: "PUT", raw: b, type: "image/jpeg" });
      setMe(d.user);
      sfx.pop();
    } catch {
      setError(zh ? "照片没传上去，换一张试试" : "The photo didn't upload. Try another");
    }
  };

  const keepFigure = async (f: Drawn) => {
    try {
      const body = await figureBody(f);
      const d = await api<{ user: SelfUser }>("/me/figure", { method: "PUT", body });
      setMe(d.user);
      sfx.pop();
    } catch {
      setError(zh ? "头像没存上，再试一次" : "The avatar didn't save. Try again");
    }
  };

  const showFigure = async () => {
    try {
      setMe((await api<{ user: SelfUser }>("/me/figure/use", { method: "POST", body: {} })).user);
      sfx.pop();
    } catch {
      setError(zh ? "没换过来，再试一次" : "That didn't switch. Try again");
    }
  };

  return (
    <div className="screen me">
      <TopBar
        onBack={onBack}
        right={
          <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label={zh ? "编辑主页" : "Edit profile"}>
            <Pencil size={19} />
          </button>
        }
      />
      <header className="me-head">
        <Face user={me} />
        <div className="me-id">
          <h1 className="me-name">{me.name}</h1>
          <p className="me-tags">
            <span className="tag">{me.city}</span>
            {gender && <span className="tag">{gender}</span>}
            <button
              type="button"
              className="tag tag-code"
              onClick={() => {
                void navigator.clipboard?.writeText(me.handle).catch(() => {});
                setCopied(true);
                sfx.pop();
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (zh ? "复制好了" : "Copied") : `${zh ? "好友码" : "Code"} ${me.handle}`}
              <Copy size={12} />
            </button>
          </p>
        </div>
      </header>
      {me.bio && <p className="me-bio">{me.bio}</p>}

      <div className="stats">
        <div className="stat">
          <strong className="tabular">{hist?.stats.games ?? "–"}</strong>
          <span>{zh ? "局游戏" : "games"}</span>
        </div>
        <div className="stat">
          <strong className="tabular">{hist?.stats.drinks ?? "–"}</strong>
          <span>{zh ? "次惩罚" : "penalties"}</span>
        </div>
        <div className="stat">
          <strong className="tabular">{lists?.friends.length ?? "–"}</strong>
          <span>{zh ? "个好友" : "friends"}</span>
        </div>
      </div>
      <FavoriteGame id={hist?.stats.favorite ?? null} />

      <div className="seg me-tabs" role="tablist">
        <button type="button" role="tab" aria-pressed={tab === "history"} onClick={() => setTab("history")}>
          {zh ? "游戏记录" : "Games"}
        </button>
        <button type="button" role="tab" aria-pressed={tab === "friends"} onClick={() => setTab("friends")}>
          {zh ? "好友" : "Friends"}
          {incoming + unread > 0 && <span className="badge">{incoming + unread}</span>}
        </button>
      </div>

      {tab === "history" ? <HistoryList rows={hist?.history ?? []} /> : <FriendsPanel lists={lists} reload={() => void load()} />}

      <div className="me-foot">
        {me.master && (
          <a className="btn btn-moon btn-sm" href="/admin">
            <ShieldCheck size={15} />
            {zh ? "后台" : "Back office"}
          </a>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          <LogOut size={15} />
          {zh ? "退出登录" : "Sign out"}
        </button>
        <button type="button" className="link-btn danger" onClick={() => setDeleting(true)}>
          <Trash2 size={14} /> {zh ? "删除账号" : "Delete account"}
        </button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title={zh ? "编辑主页" : "Edit profile"} gel="#ff9cc5">
        <p className="hint" style={{ marginBottom: 12 }}>
          {zh ? `登录邮箱 ${me.email}` : `Signed in as ${me.email}`}
        </p>
        <ProfileForm
          mode="edit"
          uid={me.id}
          av={me.av}
          initial={{ name: me.name, phone: me.phone, city: me.city, gender: me.gender, bio: me.bio, ac: me.ac }}
          show={me.figure ? "anime" : me.av > 0 ? "photo" : "none"}
          figure={me.figure ? { round: `${API}/avatar/${me.id}?v=${me.av}`, full: `${API}/figure/${me.id}?v=${me.av}` } : null}
          hasFigure={!!me.hasFigure}
          choices={me.choices}
          busy={busy}
          error={error}
          onFigure={(f) => void keepFigure(f)}
          onUseFigure={() => void showFigure()}
          onPhoto={(b) => void photo(b)}
          onRemovePhoto={() => void api<{ user: SelfUser }>("/me/avatar", { method: "DELETE" }).then((d) => setMe(d.user), () => {})}
          onSubmit={(v) => void save(v)}
        />
      </Sheet>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title={zh ? "删除账号" : "Delete account"}>
        <p style={{ marginBottom: 16 }}>{zh ? "主页、头像、游戏记录、好友和聊天都会删掉，找不回来。" : "Your profile, photo, game history, friends and chats are deleted for good."}</p>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setDeleting(false)}>
            {zh ? "算了" : "Keep it"}
          </button>
          <button
            type="button"
            className="btn btn-penalty btn-block"
            onClick={async () => {
              await api("/me", { method: "DELETE" }).catch(() => {});
              setDeleting(false);
              await signOut();
            }}
          >
            {zh ? "删除" : "Delete"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
