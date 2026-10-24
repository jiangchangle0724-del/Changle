import { useEffect } from "preact/hooks";
import { installTextures } from "../art/texture";
import { has, t } from "../i18n";
import { useApp } from "../store";
import { Btn } from "./common";
import { Game, Over } from "./Game";
import { Lobby } from "./Lobby";
import { Screen } from "./Screen";

installTextures();

export function App({ home, demo }: { home: () => void; demo?: boolean }) {
  const st = useApp();
  const v = st.view;
  const screen = v ? `${v.you.role}:${v.phase}` : "";
  useEffect(() => window.scrollTo(0, 0), [screen]);
  let body;
  if (st.fatal)
    body = (
      <main class="center-msg">
        <p class="error">{has(st.fatal) ? t(st.fatal) : st.fatal}</p>
        <Btn kind="primary" onClick={home}>
          {t("title")}
        </Btn>
      </main>
    );
  else if (!v) body = <main class="center-msg">{st.status === "reconnecting" ? t("reconnecting") : t("connecting")}</main>;
  else if (v.you.role === "screen") body = <Screen v={v} />;
  else if (v.phase === "lobby") body = <Lobby v={v} demo={demo} />;
  else if (v.phase === "over") body = <Over v={v} />;
  else body = <Game v={v} />;
  return (
    <>
      {body}
      <div class="toasts" aria-live="assertive">
        {st.toasts.map((x) => (
          <p key={x.id}>{x.text}</p>
        ))}
      </div>
    </>
  );
}
