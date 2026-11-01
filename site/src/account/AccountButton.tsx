import { UserRound } from "lucide-react";
import { useStore } from "../store";
import { useAccount } from "./AccountContext";
import { Avatar } from "./Avatar";

/** Top-right of the front door: your face (with what's waiting for you), or a way in. */
export function AccountButton() {
  const { me, status, unread, requests, openSignIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  if (status === "loading") return <span className="acct-btn acct-btn-ghost" aria-hidden="true" />;
  if (!me)
    return (
      <button type="button" className="acct-btn acct-signin" onClick={() => openSignIn()} aria-label={zh ? "登录 / 注册" : "Sign in or sign up"} title={zh ? "登录 / 注册" : "Sign in or sign up"}>
        <UserRound size={19} strokeWidth={2.2} />
      </button>
    );
  const waiting = unread + requests;
  const label = zh ? `我的主页${waiting ? `，${waiting} 条新消息` : ""}` : `My profile${waiting ? `, ${waiting} new` : ""}`;
  return (
    <a className="acct-btn acct-me" href="#/me" aria-label={label}>
      <Avatar uid={me.id} name={me.name} av={me.av} ac={me.ac} size={36} frame={me.frame} />
      {waiting > 0 && <span className="badge acct-badge tabular">{waiting > 99 ? "99+" : waiting}</span>}
    </a>
  );
}
