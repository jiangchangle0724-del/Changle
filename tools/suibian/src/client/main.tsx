// Entry point, under /eat on changle.ca: /eat/ (home), /eat/r/1234 (a phone at table 1234),
// /eat/r/1234/rate (after the meal).
import { render } from "preact";
import { BASE } from "../base";
import { setLang, t } from "./i18n";
import { api, connectWs } from "./net";
import { identity, prefs } from "./prefs";
import { onServer, setConn, update, useApp, type Me } from "./store";
import { Toasts } from "./ui/common";
import { Home } from "./ui/Home";
import { Rate } from "./ui/Rate";
import { Table } from "./ui/Table";

// A double tap never zooms. iPhone Safari honours touch-action (the stylesheet gives it to every
// element) only on a tap near something that listens for clicks, so the page itself listens.
document.documentElement.addEventListener("click", () => {});

setLang(prefs.lang);
const root = document.getElementById("app")!;

/** Go to a page of the app; `path` is inside BASE ("/r/1234"). */
function go(path: string, replace = false) {
  if (replace) history.replaceState(null, "", BASE + path);
  else history.pushState(null, "", BASE + path);
  route();
}

void api<Me>("/api/me").then((r) => r.ok && update({ me: r.data }));

function Shell({ children }: { children: preact.ComponentChildren }) {
  useApp();
  return (
    <>
      {children}
      <Toasts />
    </>
  );
}

/** The address the page was last drawn for. */
let routed = "";

function route() {
  routed = location.pathname;
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) || "/" : location.pathname;
  const table = path.match(/^\/r\/(\d{4})\/?$/);
  const rate = path.match(/^\/r\/(\d{4})\/rate\/?$/);
  if (table) {
    const { cid, key } = identity();
    update({ view: null, fatal: null, status: "connecting" });
    setConn(connectWs(table[1], { cid, key, name: prefs.name, lang: prefs.lang }, { onMsg: onServer, onStatus: (status, why) => update(why ? { status, fatal: why } : { status }) }));
    document.title = `${t("title")} · ${table[1]}`;
    render(
      <Shell>
        <Table home={() => go("/")} />
      </Shell>,
      root,
    );
    return;
  }
  setConn(null);
  update({ view: null, fatal: null, status: "idle" });
  document.title = "随便 · Whatever's Fine";
  const home = () => go("/");
  render(<Shell>{rate ? <Rate code={rate[1]} home={home} /> : <Home go={go} />}</Shell>, root);
}

// The back button only redraws the page when it changes the address. A sheet or an open group on
// round 1 adds a history entry at the same address (useBackCloses), and stepping back over it must
// not reconnect the table or reset the screen.
window.addEventListener("popstate", () => {
  if (location.pathname !== routed) route();
});
route();
