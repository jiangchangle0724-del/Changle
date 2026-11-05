import { Eye, MonitorPlay, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { NetFrame } from "../../online/NetFrame";
import { useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { HideView } from "../../shared/protocol";
import { useStore } from "../../store";
import { cameBackFromEnd, handOff, hidePhase, hideUrl, markWent, openHide, wentTo } from "./link";
import "../../styles/hide.css";

/**
 * 藏在人群里 · Hide in the Crowd at the table. The game itself is at changle.ca/hide: the host's phone
 * opens a room there by itself, and every phone goes to it on its own, once. A seat that only
 * watches gets a button to the game's big screen instead. A phone that comes back finds the game
 * still on (and can go back in) or over (and the host takes everyone back to the lobby).
 */
export function NetHide({ v, onLeave }: { v: HideView; onLeave: () => void }) {
  const { room, me, isHost, g, act, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const table = room?.code ?? "";
  const watching = !!room?.seats.find((s) => s.id === me)?.watch;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"going" | "back" | "over">("going");
  const asked = useRef(false);

  const go = (code: string) => {
    handOff(nameOf(me), lang);
    markWent(code);
    window.location.assign(hideUrl(code, table));
  };

  const open = async () => {
    if (opening || !table) return;
    setOpening(true);
    setError(null);
    const res = await openHide(table, room?.penalty ?? "");
    setOpening(false);
    if ("code" in res) g("open", { code: res.code });
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
    if (cameBackFromEnd(v.code)) return setState("over");
    // a seat that only watches stays here, with the way to the game's big screen
    if (watching) return setState("back");
    if (!wentTo(v.code)) return go(v.code);
    setState("back");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.code, table, watching]);

  // A phone at the table while the game goes on keeps an eye on it. (The table's host can change
  // meanwhile: the role passes to a seat still here when the host has been away for a while, and
  // then that seat is the one to end it.)
  useEffect(() => {
    if (!v.code || state !== "back") return;
    let live = true;
    const check = () => void hidePhase(v.code!).then((p) => live && (p === "over" || p === "gone") && setState("over"));
    check();
    const timer = window.setInterval(check, 8_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [v.code, state]);

  // the game is over: the table's host, whoever that is now, brings everyone back to the lobby
  useEffect(() => {
    if (state === "over" && isHost) act({ a: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isHost]);

  const rules = (
    <>
      <p>
        {zh
          ? "每人用自己的手机控制人群里的一个人，人群里还有 18 个电脑带着走的路人。走得像路人，别人就认不出你；认出对手就出拳，打中得 1 分，打到路人你会愣一下。"
          : "Everyone steers one person in the crowd from their own phone, among 18 passers-by the computer walks around. Walk like them and nobody can tell it's you. Spot a rival and punch: a hit scores, a passer-by stuns you."}
      </p>
      <p>
        {zh
          ? "先拿到 3 分的赢，或者 75 秒后分最多的赢。每局结束，被认出来次数最多的人受罚。大屏放在电视上看全场，但不会标出谁是真人。"
          : "First to 3 tags wins, or the most tags after 75 seconds. At the end of each round, whoever got spotted most takes the penalty. The big screen shows the whole crowd on a TV and never marks who's human."}
      </p>
    </>
  );

  const card = <Card table={table} />;
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
        <p className="hide-lead">
          <Eye size={16} aria-hidden="true" />
          {zh ? "藏在人群里有自己的大屏：整个人群，不标出谁是真人。打开它，这台设备就是大屏，可以投到电视上。" : "Hide in the Crowd has a big screen of its own: the whole crowd, never marking who's human. Open it and this device is the big screen, to mirror to a TV."}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          onClick={() => {
            markWent(v.code!, true);
            window.location.assign(hideUrl(v.code!, table, true));
          }}
        >
          <MonitorPlay size={20} strokeWidth={2.2} />
          {zh ? "打开它的大屏" : "Open its big screen"}
        </button>
      </>
    );
  else if (state === "going")
    body = (
      <>
        {card}
        <Waiting>{zh ? "正在进入藏在人群里…" : "Going in…"}</Waiting>
      </>
    );
  else if (state === "over")
    body = (
      <>
        {card}
        <p className="hide-lead">{zh ? "这局玩完了。" : "That game is over."}</p>
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
        <p className="hide-lead">{zh ? "藏在人群里还在进行。" : "Hide in the Crowd is still on."}</p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => go(v.code!)}>
          {zh ? "回到这局" : "Back to the game"}
        </button>
        <HostRow>
          <HostButton onClick={() => act({ a: "end" })}>{zh ? "结束这局" : "End the game"}</HostButton>
        </HostRow>
      </>
    );

  return (
    <NetFrame title={GAME_BY_ID.hide.name} rules={rules} onLeave={onLeave}>
      <div className="hide">{body}</div>
    </NetFrame>
  );
}

/** The game's card at the table: its name, who it's for, and this table's number. */
function Card({ table }: { table: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="hide-card" aria-hidden="true">
      <span className="hide-card-icon">
        <UsersRound size={30} strokeWidth={1.9} />
      </span>
      <div className="hide-card-names">
        <strong>{zh ? "藏在人群里" : "Hide in the Crowd"}</strong>
        <span>{zh ? "Hide in the Crowd" : "藏在人群里"}</span>
        <small>{zh ? "2 到 8 人 · 每人一部手机" : "2 to 8 players · a phone each"}</small>
      </div>
      <div className="hide-card-table">
        <span>{zh ? "桌号" : "Table"}</span>
        <b>{table}</b>
      </div>
    </div>
  );
}
