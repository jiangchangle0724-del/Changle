// Entry point for the online game: /, /r/1234 (a phone in room 1234), /tv/1234 (the big screen).
import { render } from "preact";
import { setLang, t } from "./i18n";
import { api, connectWs } from "./net";
import { identity, prefs } from "./prefs";
import { installAudioUnlock, setMuted } from "./sound";
import { onServer, setConn, update } from "./store";
import { App } from "./ui/App";
import { Home } from "./ui/Home";
import { setReduced, toggleMute } from "./ui/Settings";

setLang(prefs.lang);
setMuted(prefs.muted);
setReduced(prefs.reduced);
installAudioUnlock();
// iPhone Safari only shows a button pressed (:active) when the page listens for touches.
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) toggleMute();
});

const root = document.getElementById("app")!;

function go(path: string, replace = false) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  route();
}

async function route() {
  const path = location.pathname;
  const room = path.match(/^\/(r|tv)\/(\d{4})\/?$/);
  if (path === "/tv" || path === "/tv/") {
    // Open /tv on the TV: it makes a room and shows the QR code.
    const res = await api<{ code?: string }>("/api/rooms", { method: "POST", body: "{}" });
    if (res.ok && res.data.code) return go(`/tv/${res.data.code}`, true);
  }
  if (room) {
    const screen = room[1] === "tv";
    const { cid, key } = identity(screen ? ".tv" : "");
    update({ view: null, fatal: null, status: "connecting", saved: null });
    setConn(
      connectWs(
        room[2],
        { cid, key, name: prefs.name || (screen ? t("bigScreen") : ""), lang: prefs.lang, role: screen ? "screen" : "player" },
        { onMsg: onServer, onStatus: (status, why) => update(why ? { status, fatal: why } : { status }) },
      ),
    );
    document.title = `${t("title")} · ${room[2]}`;
    render(<App home={() => go("/")} />, root);
    return;
  }
  setConn(null);
  update({ view: null, fatal: null, status: "idle" });
  document.title = t("title");
  render(<Home go={go} />, root);
}

window.addEventListener("popstate", () => void route());
void route();
