import { Check, MessageCircle, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { TopBar } from "../components/TopBar";
import { api } from "../lib/api";
import { LIGHTS, setLight } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { useStore } from "../store";
import { useAccount, useLive, type PublicUser } from "./AccountContext";
import { Face } from "./avatar/Face";
import { FavoriteGame, HistoryList, type HistoryRow } from "./History";
import { GENDER_LABEL, type Stats } from "./MePage";

type Relation = "self" | "friends" | "sent" | "received" | "none" | "blocked";
type Data = { user: PublicUser; relation: Relation; stats: Stats; recent: HistoryRow[] };

/** #/u/:id: someone else's profile, and what you can do about them. */
export function UserPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { me, status, openSignIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [d, setD] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<Data>(`/users/${id}`).then(
      (x) => {
        setD(x);
        setMissing(false);
      },
      () => setMissing(true),
    );
  useEffect(() => setLight(LIGHTS.me), []);
  useEffect(() => {
    if (status === "in") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status]);
  useLive((e) => {
    if (e.t === "friends") void load();
  });

  if (status === "out")
    return (
      <div className="screen me">
        <TopBar onBack={onBack} />
        <div className="empty me-out">
          <p className="me-out-title">{zh ? "登录后才能看别人的主页" : "Sign in to see profiles"}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => openSignIn()}>
            {zh ? "登录 / 注册" : "Sign in or sign up"}
          </button>
        </div>
      </div>
    );
  if (missing)
    return (
      <div className="screen me">
        <TopBar onBack={onBack} />
        <div className="empty">
          <p>{zh ? "找不到这个人" : "This profile doesn't exist"}</p>
        </div>
      </div>
    );
  if (!d) return <div className="screen" />;

  const u = d.user;
  const gender = GENDER_LABEL[u.gender]?.[zh ? 0 : 1];
  const act = async (method: "POST" | "DELETE", path: string) => {
    setBusy(true);
    try {
      await api(path, { method, body: method === "POST" ? {} : undefined });
      sfx.pop();
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen me">
      <TopBar onBack={onBack} />
      <header className="me-head">
        <Face user={u} />
        <div className="me-id">
          <h1 className="me-name">{u.name}</h1>
          <p className="me-tags">
            <span className="tag">{u.city}</span>
            {gender && <span className="tag">{gender}</span>}
          </p>
        </div>
      </header>
      {u.bio && <p className="me-bio">{u.bio}</p>}

      <div className="stats">
        <div className="stat">
          <strong className="tabular">{d.stats.games}</strong>
          <span>{zh ? "局游戏" : "games"}</span>
        </div>
        <div className="stat">
          <strong className="tabular">{d.stats.friends}</strong>
          <span>{zh ? "个好友" : "friends"}</span>
        </div>
      </div>
      <FavoriteGame id={d.stats.favorite} />

      {d.relation !== "self" && d.relation !== "blocked" && me && (
        <div className="user-actions">
          {d.relation === "none" && (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void act("POST", `/friends/${u.id}`)}>
              <UserPlus size={18} />
              {zh ? "加好友" : "Add friend"}
            </button>
          )}
          {d.relation === "received" && (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void act("POST", `/friends/${u.id}`)}>
              <Check size={18} />
              {zh ? "通过好友请求" : "Accept friend request"}
            </button>
          )}
          {d.relation === "sent" && (
            <button type="button" className="btn btn-ghost btn-lg btn-block" disabled={busy} onClick={() => void act("DELETE", `/friends/${u.id}`)}>
              {zh ? "已发送，点这里撤回" : "Requested. Tap to cancel"}
            </button>
          )}
          {d.relation === "friends" && (
            <>
              <a className="btn btn-primary btn-lg btn-block" href={`#/chat/${u.id}`}>
                <MessageCircle size={18} />
                {zh ? "发消息" : "Message"}
              </a>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act("DELETE", `/friends/${u.id}`)}>
                <UserMinus size={15} />
                {zh ? "删除好友" : "Unfriend"}
              </button>
            </>
          )}
        </div>
      )}

      {d.relation === "friends" && (
        <>
          <h3 className="list-title">{zh ? "最近玩的" : "Recent games"}</h3>
          <HistoryList rows={d.recent} empty={zh ? "还没玩过" : "No games yet"} />
        </>
      )}

      {d.relation !== "self" && d.relation !== "blocked" && (
        <button
          type="button"
          className="link-btn danger user-block"
          onClick={async () => {
            if (!window.confirm(zh ? `屏蔽 ${u.name}？对方不能再加你，也不能给你发消息。` : `Block ${u.name}? They can't add or message you.`)) return;
            await api(`/blocks/${u.id}`, { body: {} }).catch(() => {});
            onBack();
          }}
        >
          {zh ? "屏蔽" : "Block"}
        </button>
      )}
    </div>
  );
}
