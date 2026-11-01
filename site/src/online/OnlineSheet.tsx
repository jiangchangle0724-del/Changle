import { useEffect, useRef, useState } from "react";
import { Sheet } from "../components/Sheet";
import { GAME_BY_ID, type GameId } from "../games/registry";
import { useStore } from "../store";
import { useAccount } from "../account/AccountContext";
import { Avatar } from "../account/Avatar";
import { useCodeField } from "./codeField";
import { isCode, newCode, queueGame, saveName, savedName, setIntent } from "./config";

/** Open a table for everyone's phones (optionally with a game queued), or sit at a friend's. */
export function OnlineSheet({ open, onClose, game, focusCode }: { open: boolean; onClose: () => void; game?: GameId; focusCode?: boolean }) {
  const { ui, lang } = useStore();
  const { me, status, openSignIn } = useAccount();
  const [name, setName] = useState(() => savedName() || me?.name.slice(0, 14) || "");
  const { code, field: codeField } = useCodeField();
  const codeRef = useRef<HTMLInputElement>(null);
  const g = game ? GAME_BY_ID[game] : null;

  useEffect(() => {
    if (!open) return;
    setName((n) => n || savedName() || me?.name.slice(0, 14) || "");
    if (focusCode) window.setTimeout(() => codeRef.current?.focus(), 420);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusCode]);

  const go = (target: string, create: boolean) => {
    const n = name.trim();
    if (!n) return;
    saveName(n);
    setIntent({ code: target, create, name: n });
    if (create && game) queueGame(target, game);
    onClose();
    window.location.hash = `#/r/${target}`;
  };

  return (
    <Sheet open={open} onClose={onClose} title={ui("onlineTitle")} gel={g?.gel}>
      <p className="hint" style={{ marginBottom: 16, fontSize: 15 }}>
        {g ? (lang === "zh" ? `开一桌${g.name.zh}，每人用自己的手机入座。` : `Open a ${g.name.en} table. Everyone sits down on their own phone.`) : ui("onlineBlurb")}
      </p>
      <label className="field-label" htmlFor="online-name">
        {ui("yourName")}
      </label>
      <div className="field">
        {me && <Avatar uid={me.id} name={name || me.name} av={me.av} ac={me.ac} size={30} />}
        <input id="online-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={ui("yourName")} maxLength={14} autoComplete="nickname" enterKeyHint="done" />
      </div>
      {status === "out" && (
        <button type="button" className="link-btn face-signin" onClick={() => openSignIn()}>
          {lang === "zh" ? "登录以后，大家在桌上能看到你的头像" : "Sign in so the table sees your photo"}
        </button>
      )}
      <button type="button" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} disabled={!name.trim()} onClick={() => go(newCode(), true)}>
        {ui("openTable")}
      </button>

      <form
        className="stack join-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (isCode(code)) go(code, false);
        }}
      >
        <label className="field-label" htmlFor="online-code">
          {ui("haveCode")}
        </label>
        <div className="field code-field">
          <input
            id="online-code"
            ref={codeRef}
            {...codeField}
            placeholder={ui("codePlaceholder")}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="code-input"
          />
          <button type="submit" className="btn btn-moon btn-sm" disabled={!isCode(code) || !name.trim()}>
            {ui("takeSeat")}
          </button>
        </div>
      </form>
      <p className="hint" style={{ marginTop: 18 }}>
        {ui("onlineVoice")}
      </p>
    </Sheet>
  );
}
