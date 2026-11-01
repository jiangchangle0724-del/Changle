import { ArrowLeft, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "../components/Sheet";
import { api, ApiError } from "../lib/api";
import { sfx } from "../lib/sfx";
import { savedName } from "../online/config";
import { useStore } from "../store";
import { useAccount, type SelfUser } from "./AccountContext";
import type { Drawn } from "./avatar/Maker";
import { figureBody } from "./avatar/pics";
import { ProfileForm, type FaceKind, type ProfileValues } from "./ProfileForm";

type Step = { k: "email" } | { k: "code"; email: string; dev?: string } | { k: "profile"; email: string; ticket: string };

/** Sign in or sign up with an email code. New people fill in their profile after the code. */
export function SignInSheet() {
  const { signInOpen, openSignIn, signedIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [step, setStep] = useState<Step>({ k: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [drawn, setDrawn] = useState<(Drawn & { round_url: string; full_url: string }) | null>(null);
  const [show, setShow] = useState<FaceKind>("none");
  const codeRef = useRef<HTMLInputElement>(null);
  const [codeFocus, setCodeFocus] = useState(false);

  useEffect(() => {
    if (!signInOpen) {
      const id = window.setTimeout(() => {
        setStep({ k: "email" });
        setCode("");
        setError("");
        setPhoto(null);
        setDrawn((d) => {
          if (d) [d.round_url, d.full_url].forEach((u) => URL.revokeObjectURL(u));
          return null;
        });
        setShow("none");
      }, 400);
      return () => window.clearTimeout(id);
    }
  }, [signInOpen]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const message = (e: unknown) => {
    const c = e instanceof ApiError ? e.code : "";
    const m: Record<string, [string, string]> = {
      email: ["邮箱格式不对", "That email doesn't look right"],
      wait: ["刚发过，稍等一下再试", "Just sent one. Give it a moment"],
      "slow-down": ["试得太频繁了，过一会儿再来", "Too many tries. Come back in a bit"],
      "no-mail": ["发邮件的服务还没设置好，过几天再来", "Email sign-in isn't set up yet. Check back soon"],
      "mail-failed": ["邮件没发出去，再试一次", "The email didn't go out. Try again"],
      wrong: ["验证码不对", "That code isn't right"],
      expired: ["验证码过期了，重新发一个", "That code expired. Send a new one"],
      "no-code": ["先发一个验证码", "Send a code first"],
      "too-many": ["错太多次了，重新发一个", "Too many wrong tries. Send a new one"],
      ticket: ["太久没完成，重新登录一次", "That took a while. Start again"],
      phone: ["手机号不对", "That phone number doesn't look right"],
      adult: ["需要年满 19 岁", "You need to be 19 or older"],
    };
    const t = m[c];
    return t ? (zh ? t[0] : t[1]) : zh ? "出错了，检查一下网络" : "Something went wrong. Check your connection";
  };

  const send = async () => {
    const e = email.trim();
    if (!e || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ sent: boolean; dev?: string }>("/auth/code", { body: { email: e, lang } });
      setStep({ k: "code", email: e, dev: d.dev });
      setCode(d.dev ?? "");
      setWait(45);
      sfx.pop();
      window.setTimeout(() => codeRef.current?.focus(), 350);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (c: string) => {
    if (step.k !== "code" || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ token?: string; user?: SelfUser; ticket?: string }>("/auth/verify", { body: { email: step.email, code: c } });
      if (d.token && d.user) {
        signedIn(d.token, d.user);
        sfx.correct();
        openSignIn(false);
      } else if (d.ticket) {
        setStep({ k: "profile", email: step.email, ticket: d.ticket });
        sfx.correct();
      }
    } catch (err) {
      setError(message(err));
      setCode("");
      sfx.wrong();
    } finally {
      setBusy(false);
    }
  };

  const signup = async (v: ProfileValues, adult: boolean) => {
    if (step.k !== "profile") return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ token: string; user: SelfUser }>("/auth/signup", { body: { ticket: step.ticket, ...v, adult } });
      signedIn(d.token, d.user);
      // the face: a drawn figure is kept even when the photo is what shows
      try {
        if (drawn) {
          const body = await figureBody(drawn);
          signedIn(d.token, (await api<{ user: SelfUser }>("/me/figure", { method: "PUT", body })).user);
        }
        if (show === "photo" && photo) signedIn(d.token, (await api<{ user: SelfUser }>("/me/avatar", { method: "PUT", raw: photo, type: "image/jpeg" })).user);
      } catch {
        /* the face can be added later */
      }
      sfx.win();
      openSignIn(false);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const title = step.k === "profile" ? (zh ? "建你的主页" : "Make your profile") : zh ? "登录 / 注册" : "Sign in or sign up";

  return (
    <Sheet open={signInOpen} onClose={() => openSignIn(false)} title={title} gel="#ff9cc5">
      {step.k === "email" && (
        <form
          className="stack signin"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className="signin-lead">{zh ? "用邮箱就能登录，没注册过的话，验证完会帮你建一个账号。" : "Use your email. New here? After the code, you'll set up your profile."}</p>
          <label className="field-label" htmlFor="si-email">
            {zh ? "邮箱" : "Email"}
          </label>
          <div className="field">
            <Mail size={18} className="muted" />
            <input id="si-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" enterKeyHint="send" />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!email.includes("@") || busy}>
            {busy ? (zh ? "发送中" : "Sending") : zh ? "发验证码" : "Send me a code"}
          </button>
        </form>
      )}

      {step.k === "code" && (
        <form
          className="stack signin"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void verify(code);
          }}
        >
          <button type="button" className="link-btn signin-back" onClick={() => setStep({ k: "email" })}>
            <ArrowLeft size={14} /> {step.email}
          </button>
          <p className="signin-lead">{zh ? "验证码发到你的邮箱了，填进来。看不到的话，查一下垃圾邮件。" : "We emailed you a 6-digit code. Not there? Check spam."}</p>
          <div className={`otp ${codeFocus ? "is-focused" : ""}`}>
            <input
              ref={codeRef}
              className="otp-input"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label={zh ? "验证码" : "Code"}
              onFocus={() => setCodeFocus(true)}
              onBlur={() => setCodeFocus(false)}
              onChange={(e) => {
                const c = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(c);
                if (c.length === 6) void verify(c);
              }}
            />
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`otp-box ${code[i] ? "is-filled" : ""} ${i === Math.min(code.length, 5) ? "is-next" : ""}`} aria-hidden="true">
                {code[i] ?? ""}
              </span>
            ))}
          </div>
          {step.dev && <p className="hint">dev code {step.dev}</p>}
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={code.length !== 6 || busy}>
            {busy ? (zh ? "验证中" : "Checking") : zh ? "确认" : "Confirm"}
          </button>
          <button type="button" className="link-btn" disabled={wait > 0 || busy} onClick={() => void send()}>
            {wait > 0 ? (zh ? `${wait} 秒后可以重发` : `Resend in ${wait}s`) : zh ? "重发验证码" : "Send a new code"}
          </button>
        </form>
      )}

      {step.k === "profile" && (
        <ProfileForm
          mode="signup"
          initial={{ name: savedName(), phone: "", city: "", gender: "", bio: "", ac: Math.floor(Math.random() * 10) }}
          show={show}
          figure={drawn && { round: drawn.round_url, full: drawn.full_url }}
          hasFigure={!!drawn}
          choices={drawn?.choices}
          ticket={step.ticket}
          photo={photo}
          busy={busy}
          error={error}
          onFigure={(f) => {
            setDrawn((old) => {
              if (old) [old.round_url, old.full_url].forEach((u) => URL.revokeObjectURL(u));
              return { ...f, round_url: URL.createObjectURL(f.round), full_url: URL.createObjectURL(f.full) };
            });
            setShow("anime");
          }}
          onUseFigure={() => setShow("anime")}
          onPhoto={(b) => {
            setPhoto(b);
            setShow("photo");
          }}
          onRemovePhoto={() => setShow("none")}
          onSubmit={(v, adult) => void signup(v, adult)}
        />
      )}
    </Sheet>
  );
}
