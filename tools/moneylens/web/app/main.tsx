// 心里有数 · MoneyLens: the app's one page. Its script, styles and fonts come from this origin and
// nowhere else, and it talks to this origin's /api only (the page's content security policy,
// src/server/worker.ts).
import { render } from "preact";
import { App } from "./ui/App";

// A double tap never zooms. iPhone Safari honours touch-action (the stylesheet gives it to every
// element) only on a tap near something that listens for clicks, so the page itself listens.
document.documentElement.addEventListener("click", () => {});

render(<App />, document.getElementById("app")!);
