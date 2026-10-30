import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/figtree/wght.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/online.css";
import "./styles/home.css";
import "./styles/tools.css";
import "./styles/account.css";
import "./styles/landscape.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
