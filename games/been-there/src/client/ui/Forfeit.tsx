// A party forfeit (派对惩罚) holds the game: a printed notice over every phone and the big screen,
// stamped "boarding paused", until the team has done it and taps Done (or the host skips it). Every
// clock stands still meanwhile, the server's and the countdowns on screen (see useCountdown).
import { useEffect } from "preact/hooks";
import { FORFEITS } from "../../room/party";
import type { RoomView } from "../../room/protocol";
import { BUZZ, buzz } from "../controls";
import { t, tx, type Key } from "../i18n";
import { sfx } from "../sound";
import { send } from "../store";
import { Btn, HapticBtn, SeatChip, seatName } from "./common";

export function ForfeitHold({ v, big }: { v: RoomView; big?: boolean }) {
  const g = v.game;
  const f = g && !g.s.over ? g.forfeit : null;
  const mine = !!f && !big && v.you.seats.includes(f.seat);
  // The team doing it hears it come up and feels it (the big screen sounds it for the room).
  useEffect(() => {
    if (!mine) return;
    sfx.alert();
    buzz(BUZZ.turn);
  }, [f?.id, mine]);
  if (!f) return null;
  const dare = FORFEITS[f.dare];
  const team = seatName(v, f.seat);
  const act = (op: "done" | "skip") => send({ t: "forfeit", id: f.id, op });
  return (
    <div class={`forfeit-hold${big ? " big" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`forfeit-${f.id}`} key={f.id}>
      <article class="forfeit-card">
        <p class="pass-strip">
          <span>{t("partyTitle")}</span>
          <span>{t(`party_${f.why}` as Key)}</span>
        </p>
        <div class="forfeit-who">
          <SeatChip v={v} seat={f.seat} />
        </div>
        <p class="forfeit-dare" id={`forfeit-${f.id}`}>
          {dare ? tx(dare.text) : t("partyOwnRules")}
        </p>
        <p class="forfeit-stamp" aria-hidden="true">
          <b>{t("forfeitStamp")}</b>
          <small>{t("forfeitStampSub")}</small>
        </p>
      </article>
      <div class="forfeit-acts">
        {mine ? (
          <>
            <p>{t("forfeitYours")}</p>
            <HapticBtn kind="primary" wide onClick={() => act("done")}>
              {t("forfeitDone")}
            </HapticBtn>
          </>
        ) : (
          <p>{t("forfeitWaitFor", { team })}</p>
        )}
        {!big && v.you.host && !mine && (
          <Btn kind="quiet" onClick={() => act("skip")}>
            {t("forfeitSkip")}
          </Btn>
        )}
        {f.waiting > 0 && <p class="forfeit-queue">{t(f.waiting === 1 ? "forfeitQueue" : "forfeitQueueMany", { n: f.waiting })}</p>}
      </div>
    </div>
  );
}
