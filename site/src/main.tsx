import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/figtree/wght.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/online.css";
import "./styles/home.css";
import "./styles/account.css";
import "./styles/avatar.css";
import "./styles/figures.css";
import "./styles/landscape.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadNewVersion } from "./lib/freshness";

// A double tap never zooms. iPhone Safari honours touch-action (global.css gives it to every element)
// only on a tap near something that listens for clicks, so the page itself listens.
document.documentElement.addEventListener("click", () => {});

// A game's file failed to load: the site has been updated since this page opened. Open the new
// version. (Vite says so for every screen loaded on demand; ScreenGuard catches the rest.)
window.addEventListener("vite:preloadError", () => {
  loadNewVersion();
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const register = () => {
    // Installation is optional: a browser that cannot store an offline copy still opens the site.
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

// the owner's edits to the site's words (lib/copy.ts), in a file of their own beside the first download
void import("./lib/copy").then((m) => m.startCopy());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
