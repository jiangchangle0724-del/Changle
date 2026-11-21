import { ArrowLeft, Mail } from "lucide-react";
import { useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { OTPInput } from "../ui/OTPInput";
import { useToast } from "../ui/Toast";
import type { SelfUser } from "./AccountContext";

/**
 * 换邮箱 (MoneyLens ARCH-9: a lost mailbox shouldn't be a lost account), made so a phone left signed
 * in can't be used to take the account (worker/emailChange.ts). The new address and the one the
 * account has now each get a code: both typed in, it's changed at once. The one it has now lost,
 * only the new code: it changes in three days, and that address is mailed a link that cancels it
 * (also cancelled here, from any of the account's phones). Once changed, the other phones are
 * signed out.
 */
const ERRORS: Record<string, [string, string]> = {
  email: ["邮箱格式不对", "That email doesn't look right"],
  same: ["这就是你现在的邮箱", "That's already your email"],
  taken: ["这个邮箱已经有账号了", "That email already has an account"],
  unusable: ["这个邮箱不能用，换一个", "That email can't be used. Try another"],
  wait: ["刚发过，等一会儿再发", "We just sent one. Wait a moment"],
  "slow-down": ["发得太多了，过一小时再试", "Too many tries. Try again in an hour"],
  "no-mail": ["邮件没发出去，过一会儿再试", "The email didn't go out. Try again soon"],
  "mail-failed": ["邮件没发出去，过一会儿再试", "The email didn't go out. Try again soon"],
  code: ["新邮箱的验证码不对", "The new email's code isn't right"],
  "old-code": ["现在邮箱的验证码不对，重新发一次", "The code for your current email isn't right. Send new codes"],
  expired: ["验证码过期了，重新发一个", "Those codes expired. Send new ones"],
  tries: ["试错太多次了，重新发一个", "Too many wrong tries. Send new codes"],
  none: ["先发验证码", "Send the codes first"],
  pending: ["已经有一个换邮箱在等，先取消它", "A change is already waiting. Cancel it first"],
  admin: ["管理员的邮箱连着后台权限，不能在这里换", "An admin's email carries the admin rights, so it can't be changed here"],
  signin: ["登录过期了，重新登录一下", "You've been signed out. Sign in again"],
  server: ["服务器出了点问题，过一会儿再试", "Something went wrong on our side. Try again soon"],
};

/** a waiting change's day, as the page says it */
function day(at: number, zh: boolean) {
  return new Intl.DateTimeFormat(zh ? "zh-CN" : "en-CA", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}

/**
 * A 换邮箱 waiting its three days: when, to what, and a button that cancels it. In the edit sheet
 * and on /me, so whoever has the account's phones sees it (a change they didn't ask for, too).
 */
export function EmailPending({ me, onChanged }: { me: SelfUser; onChanged(u: SelfUser): void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = me.emailPending;
  if (!pending) return null;
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ user: SelfUser }>("/me/email/cancel", { method: "POST", body: {} });
      onChanged(r.user);
      toast(zh ? "取消了，邮箱不换了" : "Cancelled. Your email stays as it is", { tone: "success" });
    } catch {
      toast(zh ? "没取消成，再试一次" : "That didn't cancel. Try again", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <p className="hint email-pending">
      {zh ? `登录邮箱 ${me.email}，${day(pending.at, zh)}起换成 ${pending.email}` : `Signed in as ${me.email}. Moves to ${pending.email} on ${day(pending.at, zh)}`}{" "}
      <button type="button" className="link-btn danger" disabled={busy} onClick={() => void cancel()}>
        {zh ? "取消" : "Cancel"}
      </button>
    </p>
  );
}

export function EmailChange({ me, onChanged }: { me: SelfUser; onChanged(u: SelfUser): void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const toast = useToast();
  const [step, setStep] = useState<"show" | "email" | "codes" | "done">("show");
  // both: the new address and the current one each typed a code; lost: the current one gets no mail
  const [lost, setLost] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [dev, setDev] = useState<{ code?: string; now?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // (one request at a time: a code filling its last box can send by itself, so a tap right after mustn't send again)
  const going = useRef(false);
  const say = (e: unknown) => {
    const k = e instanceof ApiError ? e.code : "";
    const m = ERRORS[k];
    setError(m ? m[zh ? 0 : 1] : zh ? "没成功，再试一次" : "That didn't go through. Try again");
  };
  const once = async (f: () => Promise<void>) => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    setError("");
    try {
      await f();
    } catch (e) {
      say(e);
      if (e instanceof ApiError && ["expired", "tries", "none", "taken", "unusable", "pending", "old-code"].includes(e.code)) setStep("email");
    } finally {
      going.current = false;
      setBusy(false);
    }
  };

  const send = () =>
    once(async () => {
      const r = await api<{ sent: boolean; dev?: string; devNow?: string }>("/me/email", { method: "POST", body: { email: email.trim(), lang: zh ? "zh" : "en" } });
      setDev({ code: r.dev, now: r.devNow });
      setCode("");
      setOldCode("");
      setLost(false);
      setStep("codes");
    });

  const confirm = (c: string, o: string) =>
    once(async () => {
      const r = await api<{ user: SelfUser }>("/me/email/confirm", { method: "POST", body: lost ? { code: c, lost: true, lang: zh ? "zh" : "en" } : { code: c, oldCode: o, lang: zh ? "zh" : "en" } });
      onChanged(r.user);
      if (r.user.emailPending) setStep("show");
      else {
        setStep("done");
        toast(zh ? "换好了，别的手机已经退出登录" : "Done. Your other phones are signed out", { tone: "success" });
      }
    });

  if ((step === "show" || step === "done") && me.emailPending)
    return (
      <div className="email-change">
        <EmailPending me={me} onChanged={onChanged} />
      </div>
    );

  if (step === "show" || step === "done")
    return (
      <div className="email-change">
        <p className="hint">
          {zh ? `登录邮箱 ${me.email}` : `Signed in as ${me.email}`}
          {step === "done" && (zh ? "（换好了）" : " (changed)")}{" "}
          {/* (an admin's rights go by the email in the settings, so theirs stays put: worker/hub.ts) */}
          {!me.admin && (
            <button type="button" className="link-btn" onClick={() => (setStep("email"), setEmail(""), setError(""))}>
              {zh ? "换邮箱" : "Change email"}
            </button>
          )}
        </p>
      </div>
    );

  if (step === "email")
    return (
      <form
        className="stack email-change"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p className="hint">
          {zh
            ? `现在用 ${me.email} 登录。新邮箱和现在的邮箱各会收到一个验证码，都填回来就换好了，别的手机会退出登录。`
            : `You sign in with ${me.email}. The new address and the one you have now each get a code. Type both in and it's changed, and your other phones are signed out.`}
        </p>
        <label className="field-label" htmlFor="ec-email">
          {zh ? "新邮箱" : "New email"}
        </label>
        <div className="field">
          <Mail size={18} className="muted" />
          <input id="ec-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(""))} placeholder="you@example.com" enterKeyHint="send" />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="email-change-actions">
          <Button tone="quiet" onClick={() => (setStep("show"), setError(""))}>
            {zh ? "不换了" : "Cancel"}
          </Button>
          <Button type="submit" disabled={!email.includes("@")} busy={busy}>
            {zh ? "发验证码" : "Send codes"}
          </Button>
        </div>
      </form>
    );

  const to = email.trim();
  const ready = code.length === 6 && (lost || oldCode.length === 6);
  return (
    <form
      className="stack email-change"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void confirm(code, oldCode);
      }}
    >
      <button type="button" className="link-btn" onClick={() => (setStep("email"), setError(""))}>
        <ArrowLeft size={14} /> {to}
      </button>
      <p className="hint">
        {lost
          ? zh
            ? "那就只填新邮箱的验证码。为了防止别人拿你的手机换走账号，要等 3 天才换，这期间现在的邮箱会收到一封可以取消的信。"
            : "Then type in just the new address's code. So nobody can take your account with your phone, the change waits 3 days, and the address you have now gets a mail that can cancel it."
          : zh
            ? "两个邮箱都收到验证码了，填进来。看不到的话，查一下垃圾邮件。"
            : "Both addresses got a code. Type them in. Not there? Check spam."}
      </p>
      <p className="field-label">{zh ? `新邮箱 ${to} 的验证码` : `Code sent to ${to}`}</p>
      <OTPInput value={code} onChange={(v) => (setCode(v), setError(""))} label={zh ? "新邮箱的验证码" : "The new email's code"} autoFocus />
      {!lost && (
        <>
          <p className="field-label">{zh ? `现在的邮箱 ${me.email} 的验证码` : `Code sent to ${me.email}`}</p>
          <OTPInput value={oldCode} onChange={(v) => (setOldCode(v), setError(""))} onComplete={(v) => code.length === 6 && void confirm(code, v)} label={zh ? "现在邮箱的验证码" : "Your current email's code"} />
        </>
      )}
      {(dev.code || dev.now) && <p className="hint">dev code {dev.code} · now {dev.now}</p>}
      {error && <p className="form-error">{error}</p>}
      <Button type="submit" block disabled={!ready} busy={busy}>
        {lost ? (zh ? "3 天后换成这个邮箱" : "Change it in 3 days") : zh ? "换成这个邮箱" : "Use this email"}
      </Button>
      <button type="button" className="link-btn" onClick={() => (setLost(!lost), setError(""))}>
        {lost ? (zh ? "两个邮箱都能收到信" : "Both addresses get mail") : zh ? "现在的邮箱收不到信了？" : "Can't get mail at your current address?"}
      </button>
    </form>
  );
}
