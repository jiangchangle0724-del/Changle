import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/figtree/wght.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/online.css";
import "./styles/home.css";
import "./styles/tools.css";
import "./styles/account.css";
import "./styles/avatar.css";
import "./styles/figures.css";
import "./styles/landscape.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadNewVersion } from "./lib/freshness";

// A game's file failed to load: the site has been updated since this page opened. Open the new
// version. (Vite says so for every screen loaded on demand; ScreenGuard catches the rest.)
window.addEventListener("vite:preloadError", () => {
  loadNewVersion();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
