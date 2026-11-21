import { render } from "preact";
import { App } from "./ui/App";

// A double tap never zooms. iPhone Safari honours touch-action (the stylesheet gives it to every
// element) only on a tap near something that listens for clicks, so the page itself listens.
document.documentElement.addEventListener("click", () => {});

const root = document.getElementById("app");
if (root) render(<App />, root);
