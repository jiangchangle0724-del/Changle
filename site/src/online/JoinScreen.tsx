import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { LangTab, TopBar } from "../components/TopBar";
import { useStore } from "../store";
import { useAccount } from "../account/AccountContext";
import { Avatar } from "../account/Avatar";
import { fetchInfo, savedName, type RoomInfo } from "./config";
import { navigate } from "../routes";

/**
 * Arriving by link or QR: the table's place card, your name, one button to sit down.
 */
export function JoinScreen({ code, onJoin, onBack }: { code: string; onJoin: (name: string) => void; onBack: () => void }) {
  const { ui, lang } = useStore();
  const { me, status, openSignIn } = useAccount();
  const [name, setName] = useState(() => savedName() || me?.name.slice(0, 14) || "");
  useEffect(() => {
    if (me && !name) setName(me.name.slice(0, 14));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetchInfo(code, ctl.signal)
      .then(setInfo)
      .catch(() => {
        if (!ctl.signal.aborted) setFailed(true);
      });
    return () => ctl.abort();
  }, [code]);

  const gone = info && !info.exists;
  const full = info?.full;

  return (
    <div className="screen join-screen">
      <TopBar onBack={onBack} right={<LangTab />} />
      <motion.form
        className="porcelain join-card"
        initial={{ opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !gone && !full) onJoin(name.trim());
        }}
      >
        <h1 className="join-head">
          <span className={lang === "zh" ? "zh-display join-label" : "en-display join-label"}>{ui("tableCode")}</span>
          <span className="en-display join-code code-plaque">{code}</span>
        </h1>
        <p className="join-meta" aria-live="polite">
          {failed
            ? ui("errUnreachable")
            : !info
              ? `${ui("connecting")}…`
              : gone
                ? ui("errNoRoom")
                : full
                  ? ui("errFull")
                  : !info.seated
                    ? lang === "zh"
                      ? "大屏幕已经开好了。你第一个坐下，就由你来主持"
                      : "The big screen is ready. Sit down first and you're the host"
                    : lang === "zh"
                      ? `主人 ${info.host}，在座 ${info.seated} 人`
                      : `Host ${info.host}. ${info.seated} seated`}
        </p>

        <label className="field field-ink">
          {me && <Avatar uid={me.id} name={name || me.name} av={me.av} ac={me.ac} size={30} />}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ui("yourName")} maxLength={14} autoComplete="nickname" enterKeyHint="go" autoFocus={!name} />
        </label>
        {status === "out" && (
          <button type="button" className="link-btn face-signin" onClick={() => openSignIn()}>
            {lang === "zh" ? "登录以后，大家在桌上能看到你的头像" : "Sign in so the table sees your photo"}
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!name.trim() || !!gone || !!full}>
          {ui("takeSeat")}
        </button>
        {!gone && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate(`/tv/${code}`, { replace: true })}>
            {lang === "zh" ? "只看不玩（投到电视上）" : "Just watch (mirror it to a TV)"}
          </button>
        )}
        <p className="hint-ink join-foot">{ui("onlineVoice")}</p>
      </motion.form>
    </div>
  );
}
