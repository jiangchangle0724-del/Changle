// 约时间 · When Works: the phone pages. One script for both: the home page at /when/, and a
// gathering's page at /when/<its 8-character code>.
import { render } from "preact";
import { BASE } from "../base";
import { CODE_RE } from "../engine/ids";
import { EventPage } from "./ui/Event";
import { Home } from "./ui/Home";

// A double tap never zooms. iPhone Safari honours touch-action (the stylesheet gives it to every
// element) only on a tap near something that listens for clicks, so the page itself listens.
document.documentElement.addEventListener("click", () => {});

const path = location.pathname.slice(BASE.length).replace(/^\/+|\/+$/g, "");
render(CODE_RE.test(path) ? <EventPage code={path} /> : <Home />, document.getElementById("app")!);
