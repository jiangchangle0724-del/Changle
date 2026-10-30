import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "../../account/AccountContext";
import { Avatar } from "../../account/Avatar";
import { GameShell, usePenalty } from "../../games/GameShell";
import { GAME_BY_ID } from "../../games/registry";
import { haptic, sfx } from "../../lib/sfx";
import { applyMove, BOT_NAMES, botMove, collectTrick, newGame, nextHand, team, viewOf, type EMove, type EState } from "../../shared/euchre";
import type { EuchreSeatView } from "../../shared/protocol";
import { useStore } from "../../store";
import { BotFace, EuchreBoard, EuchreRules, type Who } from "./Board";
import "../../styles/party.css";

const BOT_MS = 850;
const TRICK_MS = 1300;
const SEATS: EuchreSeatView[] = [
  { pid: "me", bot: null },
  { pid: null, bot: BOT_NAMES[1] },
  { pid: null, bot: BOT_NAMES[2] },
  { pid: null, bot: BOT_NAMES[3] },
];
const POS = ["bottom", "left", "top", "right"] as const;

/** One phone: you and a computer partner against two computer players. */
export function Euchre({ onBack }: { onBack: () => void }) {
  const { lang, tr } = useStore();
  const { me: account } = useAccount();
  const zh = lang === "zh";
  const penalty = usePenalty();
  const [target, setTarget] = useState(10);
  const st = useRef<EState | null>(null);
  const [, setVer] = useState(0);
  const bump = () => setVer((n) => n + 1);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const myName = zh ? "你" : "You";

  const move = (seat: number, mv: EMove) => {
    const s = st.current;
    if (!s) return;
    const before = s.phase;
    if (!applyMove(s, seat, mv)) return;
    if (mv.t === "play" || mv.t === "discard") {
      sfx.cardSlide();
      later(() => sfx.flip(), 110);
    }
    if (mv.t === "order" || mv.t === "call") {
      sfx.woodblock(1.2, 0.8);
      later(() => sfx.pop(), 90);
    }
    if (before === "bid1" && s.phase === "bid2") sfx.shuffle();
    bump();
  };

  const collect = () => {
    const s = st.current;
    if (!s || s.phase !== "trick") return;
    collectTrick(s);
    // collectTrick moves the phase on; read it fresh
    const phase = s.phase as EState["phase"];
    const w = s.lastTrick?.winner;
    sfx.whoosh(0.3, false);
    if (w !== undefined && team(w) === 0) {
      later(() => sfx.pluck(7, 0.8), 180);
      if (w === 0) haptic([10, 30, 10]);
    }
    if (phase === "end") {
      if (s.winner === 0) later(() => sfx.win(), 300);
      else {
        later(() => sfx.sadTrombone(0.8), 300);
        later(() => penalty.show({ who: [myName], kind: "two", note: zh ? "尤克牌：输了这局" : "Euchre: lost the game" }), 1700);
      }
    } else if (phase === "hand" && s.result) {
      const r = s.result;
      if (r.euchre && r.makers === 0) {
        later(() => sfx.wrong(), 300);
        later(() => penalty.show({ who: [myName], kind: "sip", note: zh ? "尤克牌：被尤克了" : "Euchre: you got euchred" }), 1300);
      } else if (r.team === 0) later(() => sfx.correct(), 300);
    }
    bump();
  };

  // computer players move, and finished tricks are picked up, on their own clock
  const s = st.current;
  const clock = s ? `${s.handNo}-${s.phase}-${s.turn}-${s.trick.length}-${s.bids.length}` : "none";
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    let id = 0;
    if (s.phase === "trick") id = window.setTimeout(collect, TRICK_MS);
    else if ((s.phase === "bid1" || s.phase === "bid2" || s.phase === "discard" || s.phase === "play") && s.turn !== 0) {
      const seat = s.turn;
      id = window.setTimeout(() => move(seat, botMove(s, seat)), BOT_MS + Math.random() * 450);
    }
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  const start = () => {
    st.current = newGame(Math.random, Math.floor(Math.random() * 4), target);
    sfx.shuffle();
    bump();
  };

  const who = (seat: number): Who =>
    seat === 0
      ? { name: myName, face: (size) => (account ? <Avatar uid={account.id} name={account.name} av={account.av} ac={account.ac} size={size} /> : <Avatar name={myName} size={size} />), mine: true }
      : { name: tr(BOT_NAMES[seat]), face: (size) => <BotFace size={size} /> };

  const v = viewOf(st.current, 0, SEATS, target);

  return (
    <GameShell title={GAME_BY_ID.euchre.name} rules={<EuchreRules />} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      {v.phase === "setup" ? (
        <div className="eu eu-setup">
          <p className="eu-setup-lead">{zh ? "你和对面的电脑一队，对打左右两个电脑。" : "You and the bot across from you are a team, against the two bots on either side."}</p>
          <div className="eu-table is-setup">
            {[2, 1, -1, 3, 0].map((seat) =>
              seat < 0 ? (
                <div key="center" className="eu-center">
                  <span className="eu-deck" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              ) : (
                <div key={seat} className={`eu-seat eu-${POS[seat]} is-setup ${seat % 2 === 0 ? "is-us" : "is-them"} ${seat === 0 ? "is-me" : ""}`}>
                  <span className="eu-face">{who(seat).face(44)}</span>
                  <span className="eu-name">{who(seat).name}</span>
                  <span className={`eu-chip ${seat % 2 === 0 ? "is-ours" : ""}`}>{seat % 2 === 0 ? (zh ? "我们" : "Us") : zh ? "对方" : "Them"}</span>
                </div>
              ),
            )}
          </div>
          <div className="eu-setup-controls">
            <div className="seg seg-sm" role="group" aria-label={zh ? "几分赢" : "Points to win"}>
              {[5, 10].map((n) => (
                <button key={n} type="button" aria-pressed={target === n} onClick={() => setTarget(n)}>
                  {zh ? `先到 ${n} 分` : `First to ${n}`}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start}>
              <Play size={18} />
              {zh ? "发牌" : "Deal"}
            </button>
          </div>
        </div>
      ) : (
        <EuchreBoard
          v={v}
          who={who}
          onMove={(mv) => {
            haptic(8);
            move(0, mv);
          }}
          onNext={() => {
            const s = st.current;
            if (!s) return;
            if (s.phase === "end") start();
            else if (s.phase === "hand") {
              nextHand(s, Math.random);
              sfx.shuffle();
              bump();
            }
          }}
        />
      )}
    </GameShell>
  );
}
