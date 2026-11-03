import { Shuffle } from "lucide-react";
import { GAME_BY_ID } from "../../games/registry";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useRoom } from "../../online/RoomContext";
import { useWatching } from "../../online/players";
import { useYourTurn, Waiting } from "../../online/games/common";
import { team } from "../../shared/euchre";
import type { EuchreView } from "../../shared/protocol";
import { useStore } from "../../store";
import { BotFace, EuchreBoard, EuchreRules, type Who } from "./Board";
import "../../styles/party.css";
import { Moment } from "../../components/Figure";

export function NetEuchre({ v, onLeave }: { v: EuchreView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf } = useRoom();
  const { lang, tr } = useStore();
  const zh = lang === "zh";
  const seatOf = (pid: string) => room?.seats.find((s) => s.id === pid);
  // (just watching: not at the card table, whether or not a seat is free)
  const watching = useWatching();

  const who = (seat: number): Who => {
    const s = v.seats[seat];
    if (s?.pid) {
      const pid = s.pid;
      return { name: pid === me ? (zh ? "你" : "You") : nameOf(pid), face: (size) => <SeatFace seat={seatOf(pid)} size={size} />, mine: pid === me };
    }
    return { name: s?.bot ? tr(s.bot) : "?", face: (size) => <BotFace size={size} /> };
  };

  const acting = v.phase === "bid1" || v.phase === "bid2" || v.phase === "discard" || v.phase === "play";
  useYourTurn(v.mySeat !== null && v.turn === v.mySeat && acting);

  const onNext = isHost ? (v.phase === "hand" ? () => g("next") : v.phase === "end" ? () => g("again") : undefined) : undefined;
  const nextNote = v.phase === "hand" ? (zh ? "下一手马上发" : "Next hand coming up") : zh ? "等主人再开一局" : "Waiting for the host";

  return (
    <NetFrame title={GAME_BY_ID.euchre.name} rules={<EuchreRules />} onLeave={onLeave}>
      {v.phase === "setup" ? (
        <SeatMap v={v} who={who} />
      ) : (
        <>
          {v.mySeat === null && !watching && <p className="eu-watching">{zh ? "座位满了，你这局在旁边看" : "The seats are full. You're watching this game."}</p>}
          {v.phase === "end" && v.winner !== null && (
            <div className="moment-row">
              {[v.winner, v.winner + 2].map((i) => {
                const pid = v.seats[i]?.pid;
                const st = pid ? room?.seats.find((x) => x.id === pid) : undefined;
                return st ? <Moment key={i} seat={st} kind="winner" small /> : null;
              })}
            </div>
          )}
          <EuchreBoard
            v={v}
            who={who}
            onMove={(mv) => {
              g("move", { mv });
              haptic(8);
            }}
            onNext={onNext}
            nextNote={nextNote}
          />
        </>
      )}
    </NetFrame>
  );
}

const POS = ["bottom", "left", "top", "right"] as const;

/** Before the deal: who sits where. Partners sit across from each other. */
function SeatMap({ v, who }: { v: EuchreView; who: (seat: number) => Who }) {
  const { isHost, g } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const watching = useWatching();
  const base = v.mySeat ?? 0;
  const usTeam = team(base);
  const taken = v.seats.map((s, i) => (s.pid ? i : -1)).filter((i) => i >= 0);
  const humans = taken.length;
  const free = humans < 4;
  const together = humans === 2 && taken[0] % 2 === taken[1] % 2;

  const cell = (r: number) => {
    const seat = (base + r) % 4;
    const w = who(seat);
    const bot = !v.seats[seat].pid;
    const ours = team(seat) === usTeam;
    const side = v.mySeat === null ? (team(seat) === 0 ? (zh ? "A 队" : "Team A") : zh ? "B 队" : "Team B") : ours ? (zh ? "我们" : "Us") : zh ? "对方" : "Them";
    return (
      <div className={`eu-seat eu-${POS[r]} is-setup ${ours ? "is-us" : "is-them"} ${w.mine ? "is-me" : ""}`}>
        <span className="eu-face">{w.face(44)}</span>
        <span className="eu-name">{w.name}</span>
        <span className={`eu-chip ${ours && v.mySeat !== null ? "is-ours" : ""}`}>{side}</span>
        <span className="eu-sit-slot">
          {bot && !watching && (
            <button
              type="button"
              className="eu-sit"
              onClick={() => {
                g("sit", { seat });
                sfx.pop();
              }}
            >
              {v.mySeat === null ? (zh ? "坐这里" : "Sit here") : zh ? "换到这里" : "Move here"}
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="eu eu-setup">
      <p className="eu-setup-lead">{zh ? "对面坐的是队友。空位由电脑补上，点空位可以换座。" : "Partners sit across from each other. Bots fill the empty seats; tap one to sit there."}</p>
      <div className="eu-table is-setup">
        {cell(2)}
        {cell(1)}
        <div className="eu-center">
          <span className="eu-deck" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        {cell(3)}
        {cell(0)}
      </div>

      {v.mySeat === null && !free && <p className="eu-watching">{zh ? "四个座位都有人了，你这局在旁边看" : "All four seats are taken. You're watching this game."}</p>}

      {isHost ? (
        <div className="eu-setup-controls">
          {humans === 2 && (
            <div className="seg" role="group" aria-label={zh ? "两个人怎么坐" : "Two players"}>
              <button type="button" aria-pressed={together} onClick={() => g("seats", { mode: "partners" })}>
                {zh ? "我们一队" : "Partners"}
              </button>
              <button type="button" aria-pressed={!together} onClick={() => g("seats", { mode: "rivals" })}>
                {zh ? "我们对打" : "Rivals"}
              </button>
            </div>
          )}
          <div className="seg seg-sm" role="group" aria-label={zh ? "几分赢" : "Points to win"}>
            {[5, 10].map((n) => (
              <button key={n} type="button" aria-pressed={v.target === n} onClick={() => g("target", { n })}>
                {zh ? `先到 ${n} 分` : `First to ${n}`}
              </button>
            ))}
          </div>
          <div className="eu-choice">
            <button type="button" className="btn btn-ghost btn-lg" onClick={() => g("seats", { mode: "shuffle" })}>
              <Shuffle size={17} />
              {zh ? "打乱座位" : "Shuffle"}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => g("start")}>
              {zh ? "发牌" : "Deal"}
            </button>
          </div>
        </div>
      ) : (
        <Waiting>{zh ? `等主人发牌，先到 ${v.target} 分赢` : `Waiting for the host to deal. First to ${v.target}.`}</Waiting>
      )}
      {v.mySeat !== null && humans > 1 && (
        <button type="button" className="btn btn-ghost btn-sm eu-stand" onClick={() => g("stand")}>
          {zh ? "我不玩，在旁边看" : "Just watch"}
        </button>
      )}
    </div>
  );
}
