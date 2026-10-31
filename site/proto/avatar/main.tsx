/**
 * The avatar maker on its own page, to try on a phone before it goes into sign-up: make a look,
 * then see it the ways the site will show it (a profile, a chat list, a seat at the table).
 *
 *   node proto/avatar/build.mjs [outDir]   (one HTML page, plus the photo-reading kit in mp/)
 */
import "../../src/styles/global.css";
import "../../src/styles/components.css";
import "../../src/styles/account.css";
import "../../src/styles/avatar.css";
import "./preview.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AvatarArt } from "../../src/account/avatar/art";
import { AvatarMaker } from "../../src/account/avatar/Maker";
import { serveMatcherFrom } from "../../src/account/avatar/match";
import { BiTitle, LangTab } from "../../src/components/TopBar";
import { setLight } from "../../src/lib/anim";
import type { AvatarCfg } from "../../src/shared/avatar/cfg";
import { StoreProvider, useStore } from "../../src/store";

// (the preview's host serves text but not binary files, so the models ride along as base64)
serveMatcherFrom("mp", { packed: true });
setLight("#ff9cc5", 0);

const BACKS = ["#b072ff", "#4be38f", "#ffb82e", "#31b9ff", "#ff5fa2"];

function Preview() {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [cfg, setCfg] = useState<AvatarCfg | null>(null);
  const [open, setOpen] = useState(true);
  const [back, setBack] = useState(0);
  const av = { ["--av" as string]: BACKS[back] } as React.CSSProperties;

  return (
    <>
      <div className="room-light" />
      <div className="app pv">
        <header className="topbar">
          <div className="topbar-side" />
          <div className="topbar-title">
            <BiTitle name={{ zh: "头像小样", en: "Avatar preview" }} size="sm" />
          </div>
          <div className="topbar-side topbar-right">
            <LangTab />
          </div>
        </header>

        {cfg ? (
          <main className="pv-main">
            <section className="pv-profile panel" style={av}>
              <AvatarArt cfg={cfg} view="full" className="pv-full" label={zh ? "你的头像" : "Your avatar"} />
              <div className="pv-who">
                <AvatarArt cfg={cfg} view="head" className="avatar pv-round" style={{ ...av, width: 72, height: 72 }} />
                <div>
                  <p className="pv-name">{zh ? "你" : "You"}</p>
                  <p className="hint">Vancouver</p>
                </div>
              </div>
            </section>

            <p className="mk-label">{zh ? "头像底色" : "Backdrop"}</p>
            <div className="mk-colors" role="group" aria-label={zh ? "头像底色" : "Backdrop"}>
              {BACKS.map((c, i) => (
                <button key={c} className="mk-color" aria-pressed={back === i} aria-label={`${zh ? "底色" : "Backdrop"} ${i + 1}`} onClick={() => setBack(i)}>
                  <span style={{ background: c }} />
                </button>
              ))}
            </div>

            <p className="mk-label">{zh ? "在聊天和好友列表里" : "In chats and friends"}</p>
            <div className="panel pv-rows">
              {[0, 1].map((i) => (
                <div key={i} className="pv-row">
                  <AvatarArt cfg={cfg} view="head" className="avatar" style={{ ...av, width: 40, height: 40 }} />
                  <div className="pv-row-text">
                    <p className="pv-name-sm">{zh ? "你" : "You"}</p>
                    <p className="hint">{i === 0 ? (zh ? "今晚谁来？" : "Who's in tonight?") : zh ? "刚在到此一游里到了巴黎" : "Just landed in Paris in Been There"}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mk-label">{zh ? "坐在游戏桌上" : "At the table"}</p>
            <div className="pv-seats">
              {[56, 44, 32].map((s) => (
                <AvatarArt key={s} cfg={cfg} view="head" className="avatar pv-seat" style={{ ...av, width: s, height: s }} />
              ))}
            </div>
          </main>
        ) : (
          <main className="pv-main pv-empty">
            <p className="hint">{zh ? "点下面，做一个自己的头像。" : "Tap below to make your avatar."}</p>
          </main>
        )}

        <div className="pv-foot">
          <button className="btn btn-primary btn-lg btn-block" onClick={() => setOpen(true)}>
            {cfg ? (zh ? "再改改" : "Change it") : zh ? "做头像" : "Make my avatar"}
          </button>
          {cfg && (
            <button className="link-btn" onClick={() => setCfg(null)}>
              {zh ? "从头再来" : "Start over"}
            </button>
          )}
        </div>

        <AvatarMaker
          open={open}
          initial={cfg}
          onDone={(c) => {
            setCfg(c);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StoreProvider>
    <Preview />
  </StoreProvider>,
);
