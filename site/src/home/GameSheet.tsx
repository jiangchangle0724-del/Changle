import { RadioTower, Smartphone, Sparkles, Tv, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "../components/Sheet";
import type { GameId, GameMeta } from "../games/registry";
import { go } from "../router";
import { ONLINE_GAMES } from "../shared/protocol";
import { usePenaltyText, useStore } from "../store";

/** A game's card: what it is, how many it takes, and the two ways to play it. */
export function GameSheet({
  game,
  need,
  onClose,
  onPlay,
  onOnline,
  onAddPeople,
  onWishlist,
}: {
  game: GameMeta | null;
  need: number;
  onClose: () => void;
  onPlay: (id: GameId) => void;
  onOnline: (id: GameId) => void;
  onAddPeople: () => void;
  onWishlist: () => void;
}) {
  const { ui, tr, lang } = useStore();
  // this phone's own penalty instead of drinking (settings): the card says so too
  const custom = usePenaltyText().isCustom;
  const g = game;
  const Icon = g?.icon;
  const [tvHelp, setTvHelp] = useState(false);
  useEffect(() => setTvHelp(false), [g?.id]);
  const zh = lang === "zh";
  // a computer (or a TV browser) can become the big screen right here; a phone gets told where to go
  const bigScreen = () => {
    const wide = window.matchMedia("(min-width: 900px) and (hover: hover)").matches;
    // a stage on its own Worker (一起跳) is a real page load, not a page of this site
    if (wide && g?.stage) window.location.assign(g.stage.screen);
    else if (wide && g) go({ kind: "tv", game: g.id }, true);
    else setTvHelp((x) => !x);
  };
  const where = g?.stage ? `${window.location.host}${g.stage.screen}` : g?.speaker ? `${window.location.host}${g.speaker}` : `${window.location.host}/tv`;
  return (
    // the card's own address (/g/<slug>) is its history entry, so the sheet adds none
    <Sheet open={!!g} onClose={onClose} gel={g?.gel} history={false} label={g ? (lang === "zh" ? g.name.zh : g.name.en) : undefined}>
      {g && Icon && (
        <div className="game-card" style={{ ["--gel" as string]: g.gel }}>
          <div className="game-card-head">
            <span className="game-card-icon" aria-hidden="true">
              <Icon size={34} strokeWidth={1.8} />
            </span>
            <div className="game-card-names">
              <h2 className={`game-card-title ${lang === "zh" ? "is-zh" : ""}`}>{lang === "zh" ? g.name.zh : g.name.en}</h2>
              <p className="game-card-sub">{lang === "zh" ? g.name.en : g.name.zh}</p>
            </div>
          </div>
          <p className="game-card-how">{tr(custom && g.howCustom ? g.howCustom : g.how)}</p>
          <p className="game-card-meta">
            {g.minPlayers === g.maxPlayers ? ui("playersExactly", { n: g.minPlayers }) : ui("playersRange", { min: g.minPlayers, max: g.maxPlayers })}
          </p>

          {g.ready && g.stage ? (
            // on its own Worker (一起跳): a TV or computer is the stage, phones join it there
            <div className="game-card-modes">
              <button type="button" className="mode-btn mode-primary" onClick={bigScreen} aria-expanded={tvHelp}>
                <Tv size={22} />
                <span>
                  <strong>{zh ? "电视或电脑当舞台" : "A TV or computer is the stage"}</strong>
                  <small>{zh ? "老师在那里教，大家拿着手机跟着跳" : "The coach teaches there. Everyone dances with their phone."}</small>
                </span>
              </button>
              {tvHelp && (
                <div className="mode-help">
                  <p>{zh ? `在电视或电脑的浏览器里打开 ${where}，点「开始」。屏幕上有二维码，大家扫码进来。` : `On the TV or computer, open ${where} in the browser and press Start. A QR code comes up; everyone scans it to join.`}</p>
                  <button type="button" className="btn btn-ghost btn-block" onClick={() => window.location.assign(g.stage!.screen)}>
                    {zh ? "就用这台设备当舞台" : "Use this device as the stage"}
                  </button>
                </div>
              )}
              <button type="button" className="mode-btn" onClick={() => window.location.assign(g.stage!.join)}>
                <Smartphone size={22} />
                <span>
                  <strong>{zh ? "用手机加入" : "Join from your phone"}</strong>
                  <small>{zh ? "舞台已经开了：扫码，或者输大屏上的 4 位房间码" : "The stage is up: scan in, or type the 4-character code on it"}</small>
                </span>
              </button>
            </div>
          ) : g.ready && g.speaker ? (
            // played from a big screen (the DJ booth): that screen first, then everyone's phone
            <div className="game-card-modes">
              <button type="button" className="mode-btn mode-primary" onClick={bigScreen} aria-expanded={tvHelp}>
                <Tv size={22} />
                <span>
                  <strong>{zh ? "电视或电脑当音箱" : "A TV or computer is the speaker"}</strong>
                  <small>{zh ? "音乐从那里放，大家用手机打碟" : "The music plays there. Everyone DJs from their phone."}</small>
                </span>
              </button>
              {tvHelp && (
                <div className="mode-help">
                  <p>{zh ? `在电视或电脑的浏览器里打开 ${where}，点「开始派对」。屏幕上有二维码，大家扫码进舞池。` : `On the TV or computer, open ${where} in the browser and press Start the party. A QR code comes up; everyone scans it to get on the floor.`}</p>
                  <button type="button" className="btn btn-ghost btn-block" onClick={() => go({ kind: "tv", game: g.id }, true)}>
                    {zh ? "就用这台设备当音箱" : "Use this device as the speaker"}
                  </button>
                </div>
              )}
              <button type="button" className="mode-btn" onClick={() => onOnline(g.id)}>
                <RadioTower size={22} />
                <span>
                  <strong>{ui("everyonePhone")}</strong>
                  <small>{ui("everyonePhoneHint")}</small>
                </span>
              </button>
            </div>
          ) : g.ready ? (
            <div className="game-card-modes">
              {need > 0 ? (
                <button type="button" className="mode-btn mode-primary" onClick={onAddPeople}>
                  <UserPlus size={22} />
                  <span>
                    <strong>{ui("needMore", { n: need })}</strong>
                    <small>{g.solo ? tr(g.solo.hint) : ui("onePhoneHint")}</small>
                  </span>
                </button>
              ) : (
                <button type="button" className="mode-btn mode-primary" onClick={() => onPlay(g.id)}>
                  <Smartphone size={22} />
                  <span>
                    <strong>{ui("onePhone")}</strong>
                    <small>{g.solo ? tr(g.solo.hint) : ui("onePhoneHint")}</small>
                  </span>
                </button>
              )}
              {/* a game the rooms server can't run yet (一本正经) is one phone only */}
              {(ONLINE_GAMES as readonly string[]).includes(g.id) && (
                <button type="button" className="mode-btn" onClick={() => onOnline(g.id)}>
                  <RadioTower size={22} />
                  <span>
                    <strong>{ui("everyonePhone")}</strong>
                    <small>{ui("everyonePhoneHint")}</small>
                  </span>
                </button>
              )}
              {g.id === "punchline" && (
                <button type="button" className="mode-btn" onClick={bigScreen} aria-expanded={tvHelp}>
                  <Tv size={22} />
                  <span>
                    <strong>{zh ? "电视当大屏幕" : "On a big screen"}</strong>
                    <small>{zh ? "电视或电脑放整场演出，大家用手机写和投票" : "A TV or computer runs the show. Phones write and vote."}</small>
                  </span>
                </button>
              )}
              {tvHelp && (
                <p className="mode-help">
                  {zh ? `在电视或电脑的浏览器里打开 ${where}，屏幕上会出现二维码，大家扫码入座。` : `On the TV or computer, open ${where} in the browser. A QR code comes up; everyone scans it to sit down.`}
                </p>
              )}
            </div>
          ) : (
            <div className="game-card-soon">
              <p>{ui("soonBody")}</p>
              <button type="button" className="btn btn-primary btn-block" onClick={onWishlist}>
                <Sparkles size={18} />
                {ui("toWishlist")}
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
