// The game's own start page, only on a computer running it by itself (npm run dev, the browser
// tests). On changle.ca, /hide leads to the game's card and a game starts from a table.
import { useState } from "preact/hooks";
import { BASE } from "../base";
import { t } from "../i18n";
import { createRoom, roomInfo } from "../net";
import { savedName, saveName } from "../prefs";
import { BiTitle } from "./chrome";

export function HomePage() {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = (room: string) => location.assign(`${BASE}/r/${room}`);
  const create = async () => {
    if (!name.trim()) return setError(t("emptyName"));
    setBusy(true);
    setError("");
    saveName(name);
    try {
      enter(await createRoom());
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    if (!name.trim()) return setError(t("emptyName"));
    if (!/^\d{4}$/.test(code)) return setError(t("badCode"));
    setBusy(true);
    setError("");
    saveName(name);
    try {
      if (!(await roomInfo(code)).exists) setError(t("noRoom"));
      else enter(code);
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="page home">
      <div class="page-body">
        <h1 class="home-title">
          <BiTitle k="title" size="xl" />
        </h1>
        <p class="home-tagline">{t("tagline")}</p>
        <p class="hint">{t("standalone")}</p>
        <form
          class="panel home-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label class="field">
            <span class="field-label">{t("yourName")}</span>
            <input value={name} maxLength={16} autoComplete="nickname" onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <button type="submit" class="btn btn-primary btn-lg btn-block" disabled={busy}>
            {t("create")}
          </button>
          <label class="field">
            <span class="field-label">{t("roomCode")}</span>
            <input value={code} inputMode="numeric" maxLength={4} autoComplete="off" onInput={(event) => setCode((event.currentTarget as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4))} />
          </label>
          <button type="button" class="btn btn-quiet btn-block" disabled={busy} onClick={() => void join()}>
            {t("join")}
          </button>
          {error && (
            <p class="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
        <a class="btn btn-ghost btn-block" href={`${BASE}/practice`}>
          {t("practice")}
        </a>
      </div>
    </main>
  );
}
