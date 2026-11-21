// Signing in on a merchant's page, without going to the site and back: the site's own sign-in
// (a code by email, site/worker/hub.ts: POST /api/auth/code, then /api/auth/verify), asked from
// here, and the session kept where the site keeps it, so both are signed in. An email with no
// account yet gets one at changle.ca, where signing up asks for a little more (the profile).

import { useEffect, useRef, useState } from "preact/hooks";
import { getLang, t } from "../i18n";
import { useLang } from "./common";

/** What the site's sign-in answers when it says no, as words. */
const WORDS: Record<string, Parameters<typeof t>[0]> = {
  email: "signInErrEmail",
  wait: "signInErrWait",
  "slow-down": "signInErrSlow",
  "too-many": "signInErrTooMany",
  "no-mail": "signInErrMail",
  "mail-failed": "signInErrMail",
  wrong: "signInErrWrong",
  expired: "signInErrExpired",
  "no-code": "signInErrExpired",
  banned: "signInErrBanned",
  network: "netDown",
};

async function account<T>(path: "code" | "verify", body: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    // (the site's sign-in also keeps a cookie of its own, as when signing in on the site)
    res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include", cache: "no-store" });
  } catch {
    throw new Error("network");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(String(data?.error ?? res.status));
  return data;
}

export function SignInForm({ onIn }: { onIn: () => void }) {
  useLang();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [wait, setWait] = useState(0);
  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const say = (e: unknown) => setProblem(t(WORDS[e instanceof Error ? e.message : ""] ?? "failed"));

  async function send(to: string) {
    if (!to || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const got = await account<{ sent: boolean; dev?: string }>("code", { email: to, lang: getLang() });
      setSentTo(to);
      // (a test server says the code instead of mailing it)
      setCode(got.dev ?? "");
      setWait(45);
      setTimeout(() => codeField.current?.focus(), 50);
    } catch (e) {
      say(e);
    }
    setBusy(false);
  }

  async function check() {
    if (!sentTo || busy || !/^\d{4,8}$/.test(code.trim())) return void setProblem(t("signInErrWrong"));
    setBusy(true);
    setProblem(null);
    try {
      const got = await account<{ token?: string; ticket?: string }>("verify", { email: sentTo, code: code.trim() });
      if (got.token) {
        try {
          localStorage.setItem("changle.session", got.token);
        } catch {
          setBusy(false);
          return void setProblem(t("signInErrStore"));
        }
        setBusy(false);
        return onIn();
      }
      setFresh(true);
    } catch (e) {
      say(e);
      setCode("");
    }
    setBusy(false);
  }

  if (fresh) {
    return (
      <div class="signin">
        <p>{t("signInNew", { email: sentTo ?? "" })}</p>
        <a class="btn btn-primary" href="/login">
          {t("signInGo")}
        </a>
      </div>
    );
  }

  return (
    <form
      class="signin"
      onSubmit={(event) => {
        event.preventDefault();
        void (sentTo ? check() : send(email.trim()));
      }}
    >
      {!sentTo ? (
        <label class="field">
          <span class="field-label">{t("signInEmail")}</span>
          <input type="email" name="email" inputMode="email" autocomplete="email" maxLength={200} value={email} onInput={(event) => setEmail(event.currentTarget.value)} />
        </label>
      ) : (
        <>
          <p class="hint">{t("signInSent", { email: sentTo })}</p>
          <label class="field">
            <span class="field-label">{t("signInCode")}</span>
            <input ref={codeField} type="text" name="code" inputMode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxLength={8} value={code} onInput={(event) => setCode(event.currentTarget.value.replace(/\D/g, ""))} />
          </label>
        </>
      )}
      {problem && (
        <p class="problem" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" class="btn btn-primary" disabled={busy || (!sentTo && !email.trim())}>
        {busy ? t("signInBusy") : sentTo ? t("signInCheck") : t("signInSend")}
      </button>
      {sentTo && (
        <div class="row">
          <button type="button" class="btn btn-quiet btn-sm" disabled={busy || wait > 0} onClick={() => void send(sentTo)}>
            {wait > 0 ? t("signInAgainIn", { n: wait }) : t("signInAgain")}
          </button>
          <button
            type="button"
            class="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => {
              setSentTo(null);
              setCode("");
              setProblem(null);
            }}
          >
            {t("signInOther")}
          </button>
        </div>
      )}
    </form>
  );
}
