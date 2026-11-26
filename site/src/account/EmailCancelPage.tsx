import { MailX } from "lucide-react";
import { useEffect, useState } from "react";
import { TopBar } from "../components/TopBar";
import { api, ApiError } from "../lib/api";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

/**
 * /me/email-cancel#<link>: from the mail to the address an account has now, when someone asked to
 * move the account to another address and said this one gets no mail, so the change waits three
 * days (worker/emailChange.ts). One button cancels it, signed in or not. The link is a key: read
 * once, then taken off the address bar.
 */
export function EmailCancelPage({ onBack }: { onBack(): void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [token] = useState(() => window.location.hash.slice(1));
  const [state, setState] = useState<"ask" | "done" | "bad" | "failed">(token ? "ask" : "bad");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  const cancel = async () => {
    setBusy(true);
    try {
      await api("/email/cancel", { method: "POST", body: { token } });
      setState("done");
    } catch (e) {
      setState(e instanceof ApiError && e.code === "link" ? "bad" : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen me">
      <TopBar onBack={onBack} />
      {state === "ask" && (
        <div className="empty me-out">
          <MailX size={40} aria-hidden />
          <p className="me-out-title">{zh ? "取消换邮箱" : "Cancel the email change"}</p>
          <p>
            {zh
              ? "有人要把你的 changle 账号的登录邮箱换掉，3 天后生效。不是你本人的话，点下面取消。"
              : "Someone asked to move your changle account to another email, and it happens in 3 days. If it wasn't you, cancel it here."}
          </p>
          <Button tone="danger" busy={busy} onClick={() => void cancel()}>
            {zh ? "取消这次换邮箱" : "Cancel this change"}
          </Button>
        </div>
      )}
      {state === "done" && (
        <EmptyState
          icon={MailX}
          title={zh ? "取消了，账号的邮箱没变" : "Cancelled. The account's email stays as it is"}
          body={zh ? "不是你本人要换的话，可能有人用过你登录着的手机。" : "If it wasn't you, someone may have used a phone you're signed in on."}
        />
      )}
      {state === "bad" && (
        <EmptyState
          tone="error"
          title={zh ? "这个链接用不了" : "This link doesn't work"}
          body={zh ? "可能已经取消过、3 天已经过了，或者链接没复制全。" : "It may have been used already, the 3 days may be up, or the link was cut short."}
        />
      )}
      {state === "failed" && (
        <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void cancel() }} />
      )}
    </div>
  );
}
