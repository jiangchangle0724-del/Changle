// Entry point for the online game, under /trip on changle.ca: /trip/r/1234 is a phone in room 1234,
// /trip/tv/1234 the big screen. A game is started from a changle.ca table, which sends everyone here;
// /trip on its own (the start page) only exists on a computer running the game by itself.
import { render } from "preact";
import { BASE, backToTable, onChangle, tableFrom } from "./base";
import { setLang, t } from "./i18n";
import { api, connectWs } from "./net";
import { identity, prefs, seenTrivia } from "./prefs";
import { installAudioUnlock, setMuted } from "./sound";
import { installKeyboard } from "./keyboard";
import { installReports } from "./report";
import { getState, onServer, send, setConn, update } from "./store";
import { App } from "./ui/App";
import { Home } from "./ui/Home";
import { setReduced, toggleMute } from "./ui/Settings";

setLang(prefs.lang);
setMuted(prefs.muted);
setReduced(prefs.reduced);
installAudioUnlock();
installKeyboard();
installReports(() => {
  const s = getState();
  const tv = s.view ? s.view.you.role === "screen" : /\/tv\//.test(location.pathname);
  const inRoom = !!s.view || /\/(r|tv)\/\d{4}/.test(location.pathname);
  return {
    screen: tv ? "tv" : inRoom ? "phone" : "start",
    phase: s.view?.phase,
    lang: prefs.lang,
    // (no room yet, or the room is gone: nothing to be out of touch with)
    online: s.status === "open" || s.status === "idle" || s.status === "fatal",
  };
});
// iPhone Safari only shows a button pressed (:active) when the page listens for touches.
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) toggleMute();
});

const root = document.getElementById("app")!;

/** Go to a page of the game; `path` is inside BASE ("/r/1234"). */
function go(path: string, replace = false) {
  if (replace) history.replaceState(null, "", BASE + path);
  else history.pushState(null, "", BASE + path);
  route();
}

/** Leave the game: back to the changle.ca table it came from, or to the start page. */
function leave(screen: boolean) {
  const table = tableFrom(getState().view);
  if (table) return backToTable(table, { screen });
  if (onChangle()) location.href = "/";
  else go("/");
}

async function route() {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) || "/" : location.pathname;
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
        {
          onMsg: onServer,
          onStatus: (status, why) => {
            update(why ? { status, fatal: why } : { status });
            // (a phone tells the room which quiz questions it has been asked before, each time it connects)
            if (status === "open" && !screen) send({ t: "seen", ids: seenTrivia() });
          },
        },
      ),
    );
    document.title = `${t("title")} · ${room[2]}`;
    tableFrom(null); // keep the table from the link for this visit
    render(<App home={() => leave(screen)} />, root);
    return;
  }
  setConn(null);
  update({ view: null, fatal: null, status: "idle" });
  document.title = t("title");
  render(<Home go={go} />, root);
}

window.addEventListener("popstate", () => void route());
void route();
