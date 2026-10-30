import { Check, Search, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { sfx } from "../lib/sfx";
import { ago } from "../lib/time";
import { useStore } from "../store";
import { useAccount, useLive, type PublicUser } from "./AccountContext";
import { Avatar } from "./Avatar";

type FriendRow = PublicUser & { last: { from: string; body: string; at: number } | null; unread: number };
type Lists = { friends: FriendRow[]; incoming: PublicUser[]; outgoing: PublicUser[] };
type Found = PublicUser & { relation: "self" | "friends" | "sent" | "received" | "none" | "blocked" };

export function useFriends() {
  const { status } = useAccount();
  const [lists, setLists] = useState<Lists | null>(null);
  const load = useCallback(async () => {
    try {
      setLists(await api<Lists>("/friends"));
    } catch {
      /* keep what we had */
    }
  }, []);
  useEffect(() => {
    if (status === "in") void load();
  }, [status, load]);
  useLive((e) => {
    if (e.t === "friends" || e.t === "msg") void load();
  });
  return { lists, load };
}

/** Friends, requests, and finding people by friend code or name. */
export function FriendsPanel({ lists, reload }: { lists: Lists | null; reload: () => void }) {
  const { me } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    const s = q.trim();
    if (!s) return;
    setSearching(true);
    try {
      const d = await api<{ users: Found[] }>(`/users?q=${encodeURIComponent(s)}`);
      setFound(d.users);
    } catch {
      setFound([]);
    } finally {
      setSearching(false);
    }
  };

  const add = async (id: string) => {
    sfx.pop();
    await api(`/friends/${id}`, { body: {} }).catch(() => {});
    setFound((f) => f?.map((u) => (u.id === id ? { ...u, relation: u.relation === "received" ? "friends" : "sent" } : u)) ?? null);
    reload();
  };
  const drop = async (id: string) => {
    await api(`/friends/${id}`, { method: "DELETE" }).catch(() => {});
    reload();
  };

  return (
    <div className="friends">
      <form
        className="friend-find"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="field">
          <Search size={17} className="muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? "好友码或名字" : "Friend code or name"} maxLength={30} enterKeyHint="search" aria-label={zh ? "找朋友" : "Find friends"} />
          <button type="submit" className="btn btn-moon btn-sm" disabled={!q.trim() || searching}>
            {zh ? "找" : "Find"}
          </button>
        </div>
        {me && <p className="hint">{zh ? `你的好友码是 ${me.handle}，发给朋友就能加你。` : `Your friend code is ${me.handle}. Share it so friends can add you.`}</p>}
      </form>

      {found && (
        <ul className="people">
          {found.length === 0 && <li className="hint">{zh ? "没找到这个人" : "Nobody by that name or code"}</li>}
          {found.map((u) => (
            <li key={u.id} className="person">
              <a className="person-main" href={`#/u/${u.id}`}>
                <Avatar uid={u.id} name={u.name} av={u.av} ac={u.ac} size={44} />
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.city}</small>
                </span>
              </a>
              {u.relation === "none" && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void add(u.id)}>
                  <UserPlus size={15} />
                  {zh ? "加好友" : "Add"}
                </button>
              )}
              {u.relation === "received" && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void add(u.id)}>
                  <Check size={15} />
                  {zh ? "通过" : "Accept"}
                </button>
              )}
              {u.relation === "sent" && <span className="hint">{zh ? "已发送" : "Requested"}</span>}
              {u.relation === "friends" && <span className="hint">{zh ? "已是好友" : "Friends"}</span>}
            </li>
          ))}
        </ul>
      )}

      {!!lists?.incoming.length && (
        <section>
          <h3 className="list-title">{zh ? "好友请求" : "Friend requests"}</h3>
          <ul className="people">
            {lists.incoming.map((u) => (
              <li key={u.id} className="person">
                <a className="person-main" href={`#/u/${u.id}`}>
                  <Avatar uid={u.id} name={u.name} av={u.av} ac={u.ac} size={44} />
                  <span>
                    <strong>{u.name}</strong>
                    <small>{u.city}</small>
                  </span>
                </a>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void add(u.id)}>
                  <Check size={15} />
                  {zh ? "通过" : "Accept"}
                </button>
                <button type="button" className="icon-btn" onClick={() => void drop(u.id)} aria-label={zh ? "拒绝" : "Decline"}>
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="list-title">{zh ? `好友 ${lists?.friends.length ?? 0}` : `Friends ${lists?.friends.length ?? 0}`}</h3>
        {lists && lists.friends.length === 0 ? (
          <p className="hint">{zh ? "还没有好友。在联机桌上点别人的头像，也能加好友。" : "No friends yet. You can also add people by tapping their face at an online table."}</p>
        ) : (
          <ul className="people">
            {lists?.friends.map((u) => (
              <li key={u.id} className="person">
                <a className="person-main" href={`#/chat/${u.id}`}>
                  <Avatar uid={u.id} name={u.name} av={u.av} ac={u.ac} size={46} />
                  <span>
                    <strong>{u.name}</strong>
                    <small className={u.unread ? "is-unread" : ""}>{u.last ? `${u.last.from === me?.id ? (zh ? "你：" : "You: ") : ""}${u.last.body}` : zh ? "打个招呼" : "Say hi"}</small>
                  </span>
                </a>
                <span className="person-side">
                  {u.last && <small className="muted">{ago(u.last.at, lang)}</small>}
                  {u.unread > 0 && <span className="badge">{u.unread}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!!lists?.outgoing.length && (
        <section>
          <h3 className="list-title">{zh ? "等对方通过" : "Waiting for them"}</h3>
          <ul className="people">
            {lists.outgoing.map((u) => (
              <li key={u.id} className="person">
                <a className="person-main" href={`#/u/${u.id}`}>
                  <Avatar uid={u.id} name={u.name} av={u.av} ac={u.ac} size={40} />
                  <span>
                    <strong>{u.name}</strong>
                    <small>{u.city}</small>
                  </span>
                </a>
                <button type="button" className="link-btn" onClick={() => void drop(u.id)}>
                  {zh ? "撤回" : "Cancel"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
