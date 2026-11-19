import { MonitorPlay } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { NetFrame } from "../../online/NetFrame";
import { useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { DanceView, HangOnView } from "../../shared/protocol";
import { useStore } from "../../store";
import { cameBackFromEnd, markWent, wentTo, type StageLink } from "./link";
import "../../styles/stage.css";

/** How long the other phones wait before following the table's host into a game whose host is whoever joins first. */
const HOST_FIRST_MS = 1200;

/**
 * A game with a stage of its own (一起跳, 抓紧了) at the table, the way 藏在人群里 is: the host's phone
 * opens a room there by itself, and every phone goes to it on its own, once. A seat that only
 * watches gets a button to the game's stage instead. A phone that comes back finds the game still
 * on (and can go back in) or over (and the host takes everyone back to the lobby).
 */
export function NetStage({ v, link, onLeave }: { v: DanceView | HangOnView; link: StageLink; onLeave: () => void }) {
  const { room, me, isHost, g, act, nameOf } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  const pick = (t: { zh: string; en: string }) => (zh ? t.zh : t.en);
  const name = pick(GAME_BY_ID[link.id].name);
  const stage = pick(link.stageName);
  const table = room?.code ?? "";
  const watching = !!room?.seats.find((s) => s.id === me)?.watch;
  // a phones-only room (抓紧了 opened with no big screen at the table): the host's phone is its stage
  const phone = v.id === "hangon" && v.phone;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"going" | "back" | "over">("going");
  const asked = useRef(false);

  const go = (code: string) => {
    link.handOff(code, nameOf(me), lang, sound);
    markWent(link.id, code);
    window.location.assign(link.phoneUrl(code, table, { host: isHost, phone }));
  };

  const open = async () => {
    if (opening || !table || !room) return;
    setOpening(true);
    setError(null);
    // the stage goes to a big screen when the table has one: a TV on /tv, or a phone that only watches
    const screen = room.screens > 0 || room.seats.some((s) => s.watch);
    const res = await link.open({ table, screen });
    setOpening(false);
    if ("code" in res) g("open", { code: res.code, phone: !!res.phone });
    else setError(zh ? "开局没成功，网络好一点再试一次。" : "Couldn't open the game. Try again in a moment.");
  };

  // the host's phone opens the game's room as soon as the game is picked (once)
  useEffect(() => {
    if (!isHost || v.code || asked.current || !table) return;
    asked.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, v.code, table]);

  useEffect(() => {
    if (!v.code || !table) return;
    // the game sent us back: it's over
    if (cameBackFromEnd(link.id, v.code)) return setState("over");
    // a seat that only watches stays here, with the way to the game's stage
    if (watching) return setState("back");
    if (wentTo(link.id, v.code)) return setState("back");
    // where the game's host is whoever joins first, the table's host goes first and the others a moment later
    if (link.hostFirst && !isHost) {
      const timer = window.setTimeout(() => go(v.code!), HOST_FIRST_MS);
      return () => window.clearTimeout(timer);
    }
    go(v.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.code, table, watching]);

  // A phone at the table while the game goes on keeps an eye on it, when the game's server can say.
  // (Neither can yet: then the host ends the game here once everyone is back.)
  useEffect(() => {
    const phase = link.phase;
    if (!v.code || state !== "back" || !phase) return;
    let live = true;
    const check = () => void phase(v.code!).then((p) => live && (p === "over" || p === "gone") && setState("over"));
    check();
    const timer = window.setInterval(check, 8_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [v.code, state, link]);

  // the game is over: the table's host, whoever that is now, brings everyone back to the lobby
  useEffect(() => {
    if (state === "over" && isHost) act({ a: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isHost]);

  const rules = (
    <>
      {link.rules.map((r, i) => (
        <p key={i}>{pick(r)}</p>
      ))}
    </>
  );

  const card = <StageCard link={link} table={table} />;
  let body;
  if (!v.code)
    body = (
      <>
        {card}
        {isHost ? (
          error ? (
            <>
              <p className="form-error" role="alert">
                {error}
              </p>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void open()} disabled={opening}>
                {zh ? "再试一次" : "Try again"}
              </button>
            </>
          ) : (
            <Waiting>{zh ? "正在开局…" : "Opening the game…"}</Waiting>
          )
        ) : (
          <Waiting>{zh ? "等主人开局" : "Waiting for the host to open the game"}</Waiting>
        )}
      </>
    );
  else if (watching && state !== "over")
    body = (
      <>
        {card}
        {phone ? (
          <p className="stage-lead">{zh ? `这局是在主人的手机上开的（桌上没有大屏）：主人的手机就是${stage}，大家都在自己手机上看。` : `This game was opened on the host's phone (no big screen at the table): the host's phone is the ${stage}, and everyone watches on their own phone.`}</p>
        ) : (
          <>
            <p className="stage-lead">
              <MonitorPlay size={16} aria-hidden="true" />
              {pick(link.stageLead)}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={() => {
                markWent(link.id, v.code!, true);
                window.location.assign(link.stageUrl(v.code!, table));
              }}
            >
              <MonitorPlay size={20} strokeWidth={2.2} />
              {zh ? `打开它的${stage}` : `Open its ${stage}`}
            </button>
          </>
        )}
      </>
    );
  else if (state === "going")
    body = (
      <>
        {card}
        <Waiting>{zh ? `正在进入${name}…` : "Going in…"}</Waiting>
      </>
    );
  else if (state === "over")
    body = (
      <>
        {card}
        <p className="stage-lead">{zh ? "这局玩完了。" : "That game is over."}</p>
        {isHost ? (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => act({ a: "end" })}>
            {zh ? "回到这桌的大厅" : "Back to the table's lobby"}
          </button>
        ) : (
          <Waiting>{zh ? "等主人回到大厅" : "Waiting for the host"}</Waiting>
        )}
      </>
    );
  else
    body = (
      <>
        {card}
        <p className="stage-lead">{zh ? `${name}还在进行。` : `${name} is still on.`}</p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => go(v.code!)}>
          {zh ? "回到这局" : "Back to the game"}
        </button>
        <HostRow>
          <HostButton onClick={() => act({ a: "end" })}>{zh ? "结束这局" : "End the game"}</HostButton>
        </HostRow>
      </>
    );

  return (
    <NetFrame title={GAME_BY_ID[link.id].name} rules={rules} onLeave={onLeave}>
      <div className="stage">{body}</div>
    </NetFrame>
  );
}

/** The game's card at the table: its name, who it's for, and this table's number. */
export function StageCard({ link, table }: { link: StageLink; table: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const meta = GAME_BY_ID[link.id];
  const Icon = link.icon;
  return (
    <div className="stage-card" aria-hidden="true">
      <span className="stage-card-icon">
        <Icon size={30} strokeWidth={1.9} />
      </span>
      <div className="stage-card-names">
        <strong>{zh ? meta.name.zh : meta.name.en}</strong>
        <span>{zh ? meta.name.en : meta.name.zh}</span>
        <small>{zh ? link.who.zh : link.who.en}</small>
      </div>
      <div className="stage-card-table">
        <span>{zh ? "桌号" : "Table"}</span>
        <b>{table}</b>
      </div>
    </div>
  );
}
