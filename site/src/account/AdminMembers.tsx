import { Crown, Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { tierName, untilText } from "../member/words";
import { LIFE_SLOTS, type Tier } from "../shared/member";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { AdminStripe } from "./AdminStripe";

type Row = { uid: string; name: string; email: string; tier: Tier; until: number | null; since: number; source: string; note: string; active: boolean };
type Reply = { members: Row[]; lifeLeft: number };
type How = "1" | "12" | "life";

/**
 * 会员 in the back office (docs/membership.md): everyone with a membership, and the owner giving
 * one by email (a month, a year, or one of the five lifetime ones) or ending one. Until payments
 * open, this is how anyone becomes a member.
 */
export function AdminMembers() {
  const toast = useToast();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [data, setData] = useState<Reply | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [how, setHow] = useState<How>("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<Reply>("/admin/members"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const why = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : "";
    if (code === "no-account") return zh ? "没有用这个邮箱的账号" : "No account has that email";
    if (code === "full") return zh ? "终身的 5 个已经都给出去了" : "All 5 lifetime memberships are taken";
    if (code === "life") return zh ? "已经是终身会员了" : "Already a lifetime member";
    return zh ? "没成功，再试一次" : "That didn't go through. Try again";
  };

  const give = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      setData(await api<Reply>("/admin/members", { body: { email: email.trim(), ...(how === "life" ? { life: true } : { months: Number(how) }), note: note.trim() } }));
      setEmail("");
      setNote("");
      toast(zh ? "送好了" : "Given");
    } catch (e) {
      toast(why(e));
    } finally {
      setBusy(false);
    }
  };

  const end = async (r: Row) => {
    if (sure !== r.uid) return setSure(r.uid);
    setSure("");
    setBusy(true);
    try {
      setData(await api<Reply>("/admin/members", { body: { uid: r.uid, end: true } }));
    } catch (e) {
      toast(why(e));
    } finally {
      setBusy(false);
    }
  };

  const active = data?.members.filter((r) => r.active) ?? [];
  const HOWS: [How, string][] = [
    ["1", zh ? "一个月" : "A month"],
    ["12", zh ? "一年" : "A year"],
    ["life", zh ? "终身" : "Lifetime"],
  ];
  return (
    <section className="adm-members" data-copy-off>
      <h2 className="adm-h">
        {zh ? "会员" : "Members"}
        {active.length > 0 && <span className="adm-badge tabular">{active.length}</span>}
      </h2>
      <p className="hint adm-members-hint">
        {data
          ? zh
            ? `终身还剩 ${data.lifeLeft} 个（一共 ${LIFE_SLOTS} 个）。在这里送会员；结束一个付费会员会马上停掉他的订阅，退款在 Stripe 里退。`
            : `${data.lifeLeft} of ${LIFE_SLOTS} lifetime memberships left. Give memberships here; ending a paid one stops its subscription at once (refunds are made in Stripe).`
          : ""}
      </p>
      <AdminStripe />
      <form
        className="adm-members-give"
        onSubmit={(e) => {
          e.preventDefault();
          void give();
        }}
      >
        <label className="field">
          <Mail size={17} aria-hidden="true" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={zh ? "对方账号的邮箱" : "Their account's email"} aria-label={zh ? "对方账号的邮箱" : "Their account's email"} autoComplete="off" required />
        </label>
        <div className="seg" role="group" aria-label={zh ? "送多久" : "How long"}>
          {HOWS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={how === k} onClick={() => setHow(k)} disabled={k === "life" && data?.lifeLeft === 0}>
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={zh ? "备注，可以不填" : "A note, if you like"} aria-label={zh ? "备注" : "Note"} maxLength={120} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
          <Crown size={16} aria-hidden="true" /> {zh ? "送会员" : "Give membership"}
        </button>
      </form>
      {failed ? (
        <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void load() }} />
      ) : !data ? (
        <Skeleton lang={lang} lines={2} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />
      ) : !data.members.length ? (
        <p className="hint adm-empty">{zh ? "还没有会员。" : "No members yet."}</p>
      ) : (
        <ul className="adm-list">
          {data.members.map((r) => (
            <li key={r.uid} className={`adm-row${r.active ? "" : " is-away"}`}>
              <div className="adm-who">
                <span className="adm-name">{r.name || r.email}</span>
                <span className="adm-sub">
                  {[tierName(r.tier, lang), r.source === "stripe" ? "Stripe" : "", r.active ? untilText(r.until, lang) : zh ? "已结束" : "Ended", r.email, r.note].filter(Boolean).join(" · ")}
                </span>
              </div>
              {r.active && (
                <div className="seat-row-actions">
                  <button type="button" className={`btn btn-sm ${sure === r.uid ? "btn-porcelain" : "btn-ghost"}`} disabled={busy} onClick={() => void end(r)}>
                    {sure === r.uid ? (zh ? "确定结束" : "Really end") : zh ? "结束" : "End"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
