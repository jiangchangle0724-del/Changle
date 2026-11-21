import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../store";
import type { SelfUser } from "./AccountContext";

/**
 * 换邮箱 (MoneyLens ARCH-9: a lost mailbox shouldn't be a lost account): the email this account
 * signs in with, and a way to change it. The new address gets a code; typed here, the account's
 * email changes and the old address is told (worker/hub.ts, `emailStart` and `emailConfirm`).
 */
const ERRORS: Record<string, [string, string]> = {
  email: ["邮箱格式不对", "That email doesn't look right"],
  same: ["这就是你现在的邮箱", "That's already your email"],
  taken: ["这个邮箱已经有账号了", "That email already has an account"],
  banned: ["这个邮箱用不了", "That email can't be used"],
  wait: ["刚发过，等一会儿再发", "We just sent one. Wait a moment"],
  "slow-down": ["发得太多了，过一小时再试", "Too many tries. Try again in an hour"],
  "no-mail": ["邮件没发出去，过一会儿再试", "The email didn't go out. Try again soon"],
  "mail-failed": ["邮件没发出去，过一会儿再试", "The email didn't go out. Try again soon"],
  code: ["验证码不对", "That code isn't right"],
  expired: ["验证码过期了，重新发一个", "That code expired. Send a new one"],
  tries: ["试错太多次了，重新发一个", "Too many wrong tries. Send a new one"],
  none: ["先发验证码", "Send a code first"],
  admin: ["管理员的邮箱连着后台权限，不能在这里换", "An admin's email carries the admin rights, so it can't be changed here"],
};

export function EmailChange({ me, onChanged }: { me: SelfUser; onChanged(u: SelfUser): void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [step, setStep] = useState<"show" | "email" | "code" | "done">("show");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [dev, setDev] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const say = (e: unknown) => {
    const k = e instanceof ApiError ? e.code : "";
    const m = ERRORS[k];
    setError(m ? m[zh ? 0 : 1] : zh ? "没成功，再试一次" : "That didn't go through. Try again");
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sent: boolean; dev?: string }>("/me/email", { method: "POST", body: { email: email.trim(), lang: zh ? "zh" : "en" } });
      setDev(r.dev ?? "");
      setCode("");
      setStep("code");
    } catch (e) {
      say(e);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (c: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: SelfUser }>("/me/email/confirm", { method: "POST", body: { code: c, lang: zh ? "zh" : "en" } });
      onChanged(r.user);
      setStep("done");
    } catch (e) {
      say(e);
      if (e instanceof ApiError && (e.code === "expired" || e.code === "tries" || e.code === "none" || e.code === "taken")) setStep("email");
    } finally {
      setBusy(false);
    }
  };

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
        <p className="hint">{zh ? `现在用 ${me.email} 登录。新邮箱会收到一个验证码，填回来就换好了，旧邮箱会收到一封通知。` : `You sign in with ${me.email}. The new address gets a code; type it here and it's changed, and the old address gets a note.`}</p>
        <label className="field-label" htmlFor="ec-email">
          {zh ? "新邮箱" : "New email"}
        </label>
        <div className="field">
          <Mail size={18} className="muted" />
          <input id="ec-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(""))} placeholder="you@example.com" enterKeyHint="send" />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="email-change-actions">
          <button type="button" className="btn btn-quiet" onClick={() => (setStep("show"), setError(""))}>
            {zh ? "不换了" : "Cancel"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!email.includes("@") || busy}>
            {busy ? (zh ? "发送中" : "Sending") : zh ? "发验证码" : "Send a code"}
          </button>
        </div>
      </form>
    );

  return (
    <form
      className="stack email-change"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) void confirm(code);
      }}
    >
      <button type="button" className="link-btn" onClick={() => (setStep("email"), setError(""))}>
        <ArrowLeft size={14} /> {email.trim()}
      </button>
      <p className="hint">{zh ? "验证码发到新邮箱了，填进来。看不到的话，查一下垃圾邮件。" : "We emailed a 6-digit code to the new address. Not there? Check spam."}</p>
      <label className="field-label" htmlFor="ec-code">
        {zh ? "验证码" : "Code"}
      </label>
      <div className="field">
        <input
          id="ec-code"
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onChange={(e) => {
            const c = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(c);
            setError("");
            if (c.length === 6) void confirm(c);
          }}
        />
      </div>
      {dev && <p className="hint">dev code {dev}</p>}
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={code.length !== 6 || busy}>
        {busy ? (zh ? "确认中" : "Checking") : zh ? "换成这个邮箱" : "Use this email"}
      </button>
    </form>
  );
}
