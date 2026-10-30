import { Check, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount, type PublicUser } from "../account/AccountContext";
import { Avatar, colorFor } from "../account/Avatar";
import { Sheet } from "../components/Sheet";
import { api } from "../lib/api";
import { sfx } from "../lib/sfx";
import type { SeatView } from "../shared/protocol";
import { useStore } from "../store";

/** A seat's face: the profile photo or color for signed-in players, a steady color from the phone id for everyone else. */
export function SeatFace({ seat, size = 40, className = "" }: { seat: SeatView | undefined; size?: number; className?: string }) {
  if (!seat) return <Avatar name="?" size={size} className={className} />;
  return <Avatar uid={seat.uid} name={seat.name} av={seat.av ?? 0} ac={seat.uid ? seat.ac : colorFor(seat.id)} size={size} className={className} />;
}

type Relation = "self" | "friends" | "sent" | "received" | "none" | "blocked";

/** Tap a face at the table: who they are, and a friend request without leaving the game. */
export function PersonSheet({ seat, onClose }: { seat: SeatView | null; onClose: () => void }) {
  const { me, status, openSignIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [user, setUser] = useState<PublicUser | null>(null);
  const [rel, setRel] = useState<Relation | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = seat?.uid;

  useEffect(() => {
    setUser(null);
    setRel(null);
    if (!uid || status !== "in") return;
    let gone = false;
    void api<{ user: PublicUser; relation: Relation }>(`/users/${uid}`).then(
      (d) => {
        if (gone) return;
        setUser(d.user);
        setRel(d.relation);
      },
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [uid, status]);

  const add = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      const d = await api<{ relation: Relation }>(`/friends/${uid}`, { body: {} });
      setRel(d.relation);
      sfx.pop();
    } catch {
      /* stays as it was */
    } finally {
      setBusy(false);
    }
  };

  const name = user?.name ?? seat?.name ?? "";
  return (
    <Sheet open={!!seat} onClose={onClose} gel="#ff9cc5">
      {seat && (
        <div className="person-card">
          <SeatFace seat={seat} size={84} />
          <h3 className="person-card-name">{name}</h3>
          {user && (
            <p className="me-tags">
              <span className="tag">{user.city}</span>
            </p>
          )}
          {user?.bio && <p className="person-card-bio">{user.bio}</p>}

          {!uid && <p className="hint">{zh ? `${seat.name} 还没有 changle 账号，暂时加不了好友。` : `${seat.name} hasn't signed up yet, so you can't add them for now.`}</p>}

          {uid && status !== "in" && (
            <>
              <p className="hint">{zh ? "登录以后就能加 TA 为好友。" : "Sign in to add them as a friend."}</p>
              <button type="button" className="btn btn-primary btn-block" onClick={() => openSignIn()}>
                {zh ? "登录 / 注册" : "Sign in or sign up"}
              </button>
            </>
          )}

          {uid && status === "in" && uid !== me?.id && rel && (
            <div className="person-card-actions">
              {rel === "none" && (
                <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void add()}>
                  <UserPlus size={17} />
                  {zh ? "加好友" : "Add friend"}
                </button>
              )}
              {rel === "received" && (
                <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void add()}>
                  <Check size={17} />
                  {zh ? "通过好友请求" : "Accept friend request"}
                </button>
              )}
              {rel === "sent" && <p className="hint">{zh ? "好友请求已发送，等 TA 通过。" : "Friend request sent."}</p>}
              {rel === "friends" && <p className="hint">{zh ? "你们已经是好友了，散场后可以在你的主页里聊天。" : "You're friends. Chat from your profile after the game."}</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
