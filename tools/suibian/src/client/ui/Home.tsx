import { useState } from "preact/hooks";
import { NEIGHBOURHOODS, RANGES, type Center, type RangeId } from "../../engine";
import { t, tx } from "../i18n";
import { api } from "../net";
import { identity, inWeChat, prefs } from "../prefs";
import { update, useApp } from "../store";
import { Btn, DemoBanner, LangToggle } from "./common";

const inVancouver = (c: Center) => c.lat > 48.9 && c.lat < 49.6 && c.lng > -123.6 && c.lng < -122.2;

export function Home({ go }: { go: (path: string) => void }) {
  const { me } = useApp();
  const last = prefs.start;
  const [hood, setHood] = useState<string>(last?.center.label ?? (last ? "gps" : NEIGHBOURHOODS[0].en));
  const [gps, setGps] = useState<Center | null>(last && !last.center.label ? last.center : null);
  const [range, setRange] = useState<RangeId>(last?.range ?? "walk20");
  const [code, setCode] = useState("");
  const [err, setErr] = useState(new URLSearchParams(location.search).get("login") === "failed" ? t("loginFailed") : "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) return setErr(t("noLocation"));
    setErr(t("locating"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inVancouver(c)) {
          setErr(t("outsideVancouver"));
          setHood(NEIGHBOURHOODS[0].en);
          return;
        }
        setErr("");
        setGps(c);
        setHood("gps");
      },
      () => {
        setErr(t("noLocation"));
        setHood(NEIGHBOURHOODS[0].en);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };

  const center = (): Center | null => {
    if (hood === "gps") return gps;
    const n = NEIGHBOURHOODS.find((x) => x.en === hood);
    return n ? { lat: n.lat, lng: n.lng, label: n.en } : null;
  };

  const create = async () => {
    const c = center();
    if (!c) return setErr(t("noLocation"));
    setBusy(true);
    prefs.start = { center: c, range };
    const res = await api<{ code?: string; error?: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ cid: identity().cid, center: c, range, lang: prefs.lang }) });
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
  const loginHref = `/auth/google?back=${encodeURIComponent(location.pathname)}`;
  const askRating = me?.last && !prefs.rated(me.last.code) && Date.now() - me.last.at < 3 * 24 * 3600_000 ? me.last : null;

  return (
    <main class="home">
      <header class="hero">
        <LangToggle />
        <p class="logo" aria-hidden="true">
          🥢
        </p>
        <h1>{t("title")}</h1>
        <p class="tagline">{t("tagline")}</p>
      </header>
      {me && <DemoBanner demo={me.demo} />}

      {askRating && (
        <a class="card nudge" href={`/r/${askRating.code}/rate`}>
          <span>{t("lastMeal", { name: askRating.name })}</span>
          <b>{t("rateIt")} →</b>
        </a>
      )}

      <section class="card">
        <h2>{t("startTable")}</h2>
        {mustLogin ? (
          <>
            <p class="muted small">{t("loginWhy")}</p>
            {inWeChat() ? <p class="warn">{t("wechatLogin")}</p> : <a class="btn primary wide" href={loginHref}>{t("login")}</a>}
          </>
        ) : (
          <>
            <label class="field">
              <span>{t("where")}</span>
              <select
                value={hood}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  if (v === "gps" && !gps) locate();
                  setHood(v);
                }}
              >
                <option value="gps">{t("myLocation")}</option>
                {NEIGHBOURHOODS.map((n) => (
                  <option key={n.en} value={n.en}>
                    {tx(n)}
                  </option>
                ))}
              </select>
            </label>
            <div class="field">
              <span>{t("range")}</span>
              <div class="seg">
                {(Object.keys(RANGES) as RangeId[]).map((r) => (
                  <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                    {tx(RANGES[r])}
                  </button>
                ))}
              </div>
            </div>
            <Btn kind="primary" wide disabled={busy || (hood === "gps" && !gps)} onClick={() => void create()}>
              {t("startTable")}
            </Btn>
          </>
        )}
      </section>

      <section class="card">
        <h2>{t("join")}</h2>
        <form
          class="joinrow"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <input
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
      </section>

      {err && (
        <p class="error" role="alert">
          {err}
        </p>
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
    </main>
  );
}
