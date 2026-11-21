import { useEffect, useRef, useState } from "preact/hooks";
import { BASE } from "../../base";
import { t } from "../i18n";
import { api } from "../net";
import { identity, inWeChat, prefs } from "../prefs";
import { update, useApp } from "../store";
import type { OccasionId } from "../../engine";
import { Btn, DemoBanner, Dock, Message, TopBar } from "./common";
import { OccasionPicker } from "./OccasionPicker";
import { WhenPicker } from "./WhenPicker";
import { WhereFields, useWhere } from "./Where";

export function Home({ go }: { go: (path: string) => void }) {
  const { me } = useApp();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (joining) codeInput.current?.focus(); }, [joining]);
  const [err, setErr] = useState(new URLSearchParams(location.search).get("login") === "failed" ? t("loginFailed") : "");
  const where = useWhere(setErr);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [occasion, setOccasion] = useState<OccasionId>("casual");

  const create = async () => {
    const c = where.center();
    if (!c) return setErr(t("noLocation"));
    const range = where.range;
    setBusy(true);
    prefs.start = { center: c, range };
    const res = await api<{ code?: string; error?: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ cid: identity().cid, center: c, range, lang: prefs.lang, at, occasion }) });
    setBusy(false);
    if (res.ok && res.data.code) return go(`/r/${res.data.code}`);
    setErr(res.data.error === "quota" ? t("quota") : res.data.error === "login" ? t("loginWhy") : t("offline"));
  };

  const join = async () => {
    if (!/^\d{4}$/.test(code)) return setErr(t("noRoom"));
    setBusy(true);
    const res = await api<{ exists?: boolean }>(`/api/rooms/${code}`);
    setBusy(false);
    if (res.ok && res.data.exists) go(`/r/${code}`);
    else setErr(res.status === 0 ? t("offline") : t("noRoom"));
  };

  const mustLogin = !!me?.loginEnabled && !me.user;
  const loginHref = `${BASE}/auth/google?back=${encodeURIComponent(location.pathname)}`;
  // The last table, within three days: rated on its own page.
  const last = me?.last?.code && Date.now() - me.last.at < 3 * 24 * 3600_000 ? me.last : null;
  const askRating = last && !last.rated && !prefs.rated(last.code) ? last : null;

  return (
    <main class="home">
      <TopBar title="title" tools />
      <p class="tagline">{t("tagline")}</p>
      {me && <DemoBanner demo={me.demo} />}

      {askRating && (
        <a class="card nudge" href={`${BASE}/r/${askRating.code}/rate`}>
          <span>{t("lastMeal", { name: askRating.name })}</span>
          <b>{t("rateIt")} →</b>
        </a>
      )}

      <section class="card">
        {mustLogin ? (
          <>
            <p class="muted small">{t("loginWhy")}</p>
            {inWeChat() ? <Message>{t("wechatLogin")}</Message> : <a class="btn quiet press wide" href={loginHref}>{t("login")}</a>}
          </>
        ) : (
          <>
            <div class="field">
              <span>{t("occasion")}</span>
              <OccasionPicker value={occasion} onChange={setOccasion} />
            </div>
            <div class="field">
              <span>{t("when")}</span>
              <WhenPicker value={at} onChange={setAt} />
            </div>
            <WhereFields w={where} />
          </>
        )}
      </section>

      {!mustLogin && <Dock>
        <Btn kind="primary" wide disabled={busy || where.waiting} onClick={() => void create()}>{t("startTable")}</Btn>
      </Dock>}
      {!joining ? <Btn kind="quiet" wide onClick={() => setJoining(true)}>{t("join")}</Btn> : (
        <form
          class="joinrow"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <input
            ref={codeInput}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder={t("roomCode")}
            aria-label={t("roomCode")}
            value={code}
            onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, ""))}
          />
          <Btn disabled={busy || code.length !== 4} onClick={() => void join()}>
            {t("go")}
          </Btn>
        </form>
      )}

      {err && (
        <Message error>{err}</Message>
      )}

      {me?.user && (
        <footer class="account">
          <span>{t("hi", { name: me.user.name })}</span>
          <Btn
            kind="quiet"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              update({ me: { ...me, user: null, card: null, last: null } });
            }}
          >
            {t("logout")}
          </Btn>
          <Btn
            kind="quiet"
            class="danger-text"
            onClick={async () => {
              if (!sure) return setSure(true);
              await api("/api/me", { method: "DELETE" });
              update({ me: { ...me, user: null, card: null, last: null } });
              setSure(false);
            }}
          >
            {sure ? t("forgetSure") : t("forgetMe")}
          </Btn>
        </footer>
      )}

      <nav class="legal-links small" aria-label={`${t("privacy")} · ${t("terms")}`}>
        <a href={`${BASE}/privacy`}>{t("privacy")}</a>
        <a href={`${BASE}/terms`}>{t("terms")}</a>
      </nav>
    </main>
  );
}
