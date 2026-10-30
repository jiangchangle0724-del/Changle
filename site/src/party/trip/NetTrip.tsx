import { Luggage, Plane } from "lucide-react";
import { useEffect, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { NetFrame } from "../../online/NetFrame";
import { useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { TripView } from "../../shared/protocol";
import { useStore } from "../../store";
import { cameBackFromEnd, handOff, loadTrip, markWent, openTrip, tripPhase, tripUrl, wentTo } from "./link";
import "../../styles/trip.css";

/**
 * 到此一游 at the table. The game itself is at changle.ca/trip: the host opens a room there, and
 * every phone goes to it on its own, once. A phone that comes back finds the game still on (and can
 * go back in) or over (and the host takes everyone back to the lobby).
 */
export function NetTrip({ v, onLeave }: { v: TripView; onLeave: () => void }) {
  const { room, me, isHost, g, act, nameOf } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  const table = room?.code ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState("");
  const [state, setState] = useState<"going" | "back" | "over">("going");

  const go = (code: string) => {
    handOff(nameOf(me), lang, sound);
    markWent(code);
    window.location.assign(tripUrl(code, table));
  };

  useEffect(() => {
    if (!v.code || !table) return;
    if (cameBackFromEnd(v.code)) {
      // the game's last screen sent us back: the trip is over
      setState("over");
      if (isHost) act({ a: "end" });
      return;
    }
    if (!wentTo(v.code)) return go(v.code);
    setState("back");
    let live = true;
    void tripPhase(v.code).then((p) => live && (p === "over" || p === "gone") && setState("over"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.code, table]);

  const open = async (from?: string) => {
    if (busy || !table) return;
    setBusy(true);
    setError(null);
    const res = from ? await loadTrip(from, table) : await openTrip(table);
    setBusy(false);
    if ("code" in res) g("open", { code: res.code });
    else
      setError(
        res.error === "noSave" || res.error === "badCode"
          ? zh
            ? "没找到这个存档，检查一下六位存档码。"
            : "No save with that code. Check the six letters."
          : zh
            ? "开局没成功，网络好一点再试一次。"
            : "Couldn't open the game. Try again in a moment.",
      );
  };

  const rules = (
    <>
      <p>
        {zh
          ? "掷骰子绕地球一圈，停在城市上可以买下它，别人停到你的城就付租金。集齐一组可以盖民宿和酒店。每座城都有一条按它真实特点定的规则。"
          : "Roll your way round the world. Land on a city to buy it; anyone who lands on yours pays rent. Own a whole group to build guesthouses and hotels. Every city has a rule from a real fact about it."}
      </p>
      <p>
        {zh
          ? "2 到 6 队，每队 1 到 3 人，可以加电脑队。15 分钟快局、1 小时局，或者到目标线为止。队伍和时长在游戏里选。"
          : "2 to 6 teams of 1 to 3 people, with computer teams if you like. A 15-minute game, an hour, or play to the target. Teams and length are picked inside the game."}
      </p>
    </>
  );

  let body;
  if (!v.code)
    body = (
      <>
        <Pass table={table} />
        {isHost ? (
          <>
            <p className="hint trip-lead">{zh ? "开局以后，这桌的每个人和大屏都会跟着进去；队伍和时长在下一页选。" : "Everyone at this table, and the big screen, follows you in. Teams and length come next."}</p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void open()} disabled={busy}>
              <Plane size={20} strokeWidth={2.4} />
              {busy ? (zh ? "正在开局…" : "Opening…") : zh ? "开一局" : "Open a game"}
            </button>
            <form
              className="trip-save"
              onSubmit={(e) => {
                e.preventDefault();
                if (save.trim().length === 6) void open(save);
              }}
            >
              <label className="field-label" htmlFor="trip-save">
                {zh ? "接着玩上次的存档" : "Carry on a saved game"}
              </label>
              <div className="trip-save-row">
                <div className="field code-field">
                  <input
                    id="trip-save"
                    value={save}
                    onChange={(e) => setSave(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                    placeholder={zh ? "六位存档码" : "6-letter code"}
                    maxLength={6}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="code-input"
                  />
                </div>
                <button type="submit" className="btn btn-quiet" disabled={busy || save.length !== 6}>
                  {zh ? "继续" : "Continue"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <Waiting>{zh ? "等主人开局" : "Waiting for the host to open the game"}</Waiting>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  else if (state === "going")
    body = (
      <>
        <Pass table={table} />
        <Waiting>{zh ? "正在进入到此一游…" : "Boarding…"}</Waiting>
      </>
    );
  else if (state === "over")
    body = (
      <>
        <Pass table={table} stamped />
        <p className="trip-lead">{zh ? "这局玩完了。" : "That trip is over."}</p>
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
        <Pass table={table} />
        <p className="trip-lead">{zh ? "到此一游还在进行。" : "The trip is still on."}</p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => go(v.code!)}>
          {zh ? "回到这局" : "Back to the game"}
        </button>
        <HostRow>
          <HostButton onClick={() => act({ a: "end" })}>{zh ? "结束这局" : "End the game"}</HostButton>
        </HostRow>
      </>
    );

  return (
    <NetFrame title={GAME_BY_ID.trip.name} rules={rules} onLeave={onLeave}>
      <div className="trip">{body}</div>
    </NetFrame>
  );
}

/** The game's own object at the table: a boarding pass, printed on paper, for this table. */
export function Pass({ table, stamped }: { table: string; stamped?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="trip-pass" aria-hidden="true">
      <div className="trip-pass-main">
        <span className="trip-pass-kind">{zh ? "登机牌" : "Boarding pass"}</span>
        <strong className="trip-pass-name">{zh ? "到此一游" : "Been There, Bought That"}</strong>
        <span className="trip-pass-sub">{zh ? "Been There, Bought That" : "到此一游"}</span>
        <span className="trip-pass-route">{zh ? "22 座城 · 2 到 6 队" : "22 cities · 2 to 6 teams"}</span>
      </div>
      <div className="trip-pass-stub">
        <Luggage size={26} strokeWidth={2} />
        <span className="trip-pass-kind">{zh ? "桌号" : "Table"}</span>
        <b className="trip-pass-table">{table}</b>
      </div>
      {stamped && <span className="trip-pass-stamp">{zh ? "已到达" : "Arrived"}</span>}
    </div>
  );
}
