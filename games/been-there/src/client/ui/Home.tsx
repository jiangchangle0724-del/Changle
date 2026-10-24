import { useState } from "preact/hooks";
import { CityPoster } from "../art/posters";
import { t } from "../i18n";
import { api } from "../net";
import { prefs } from "../prefs";
import { Btn } from "./common";
import { Credits } from "./Credits";
import { LangToggle } from "./Settings";

export function Home({ go }: { go: (path: string) => void }) {
  const [name, setName] = useState(prefs.name);
  const [code, setCode] = useState("");
  const [save, setSave] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const keepName = () => (prefs.name = name.trim());

  const create = async (tv: boolean) => {
    keepName();
    setBusy(true);
    const res = await api<{ code?: string }>("/api/rooms", { method: "POST", body: JSON.stringify({}) });
    setBusy(false);
    if (res.ok && res.data.code) go(`/${tv ? "tv" : "r"}/${res.data.code}`);
    else setErr(t("offline"));
  };
  const join = async () => {
    keepName();
    if (!/^\d{4}$/.test(code)) return setErr(t("noRoom"));
    setBusy(true);
    const res = await api<{ exists?: boolean }>(`/api/rooms/${code}`);
    setBusy(false);
    if (res.ok && res.data.exists) go(`/r/${code}`);
    else setErr(res.status === 0 ? t("offline") : t("noRoom"));
  };
  const load = async () => {
    keepName();
    setBusy(true);
    const res = await api<{ code?: string }>(`/api/saves/${save.trim().toUpperCase()}/load`, { method: "POST" });
    setBusy(false);
    if (res.ok && res.data.code) go(`/r/${res.data.code}`);
    else setErr(res.status === 0 ? t("offline") : t("noSave"));
  };

  return (
    <main class="home">
      <div class="home-posters" aria-hidden="true">
        {["venice", "tokyo", "rio"].map((id) => (
          <div key={id} class="poster">
            <CityPoster id={id} />
          </div>
        ))}
      </div>
      <header>
        <h1>{t("title")}</h1>
        <p class="muted">{t("tagline")}</p>
        <LangToggle />
      </header>
      <label class="field">
        <span>{t("yourName")}</span>
        <input value={name} maxLength={16} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={keepName} />
      </label>
      <Btn kind="primary" wide disabled={busy} onClick={() => create(false)}>
        {t("create")}
      </Btn>
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
          {t("joinGo")}
        </Btn>
      </form>
      {err && <p class="error" role="alert">{err}</p>}
      <details>
        <summary>{t("bigScreen")}</summary>
        <p class="muted">{t("bigScreenHint")}</p>
        <Btn disabled={busy} onClick={() => create(true)}>
          {t("bigScreen")}
        </Btn>
      </details>
      <details>
        <summary>{t("loadSave")}</summary>
        <form
          class="joinrow"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input maxLength={6} placeholder={t("saveCode")} aria-label={t("saveCode")} value={save} onInput={(e) => setSave((e.target as HTMLInputElement).value.toUpperCase())} />
          <Btn disabled={busy || save.trim().length !== 6} onClick={() => void load()}>
            {t("joinGo")}
          </Btn>
        </form>
      </details>
      <details>
        <summary>{t("credits")}</summary>
        <Credits />
      </details>
    </main>
  );
}
