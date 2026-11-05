import { Flame } from "lucide-react";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { PorcelainDefs } from "../../components/Dish";
import { polar } from "../../lib/geom";
import type { TruthView } from "../../shared/protocol";
import { Bi, RoundTag, TvLineup, TvShow, useLang, useSeats } from "../../tv/show";
import { useScreenSpin } from "../../tv/spin";
import type { TvViewProps } from "../../tv/views";
import { SeatFace } from "../People";
import { useReached } from "../RoomContext";
import "../../styles/tv-truth.css";

/** The bottle's green glass, light to dark (the same bottle the phones spin). */
const GLASS = ["#0f7a55", "#3be0a4", "#1fb683", "#0b5a3f"];

/**
 * 真心话大冒险 on the big screen: the table from above with everyone around it and the bottle
 * spinning in the middle, the same spin every phone shows; beside it, whose turn it is, who the
 * bottle picked, and truth or dare. The card itself stays under its cover here: the one picked
 * lifts the lid on their own phone and reads it out, and the room hears it from them first.
 */
export default function TvTruth({ v, sound }: TvViewProps<TruthView>) {
  const { zh, tx } = useLang();
  const { players, seat, name } = useSeats();
  const count = Math.max(2, players.length);

  // the bottle rests where it last pointed
  const last = useRef(0);
  const chosenIndex = v.chosen ? players.findIndex((s) => s.id === v.chosen) : -1;
  if (chosenIndex >= 0) last.current = chosenIndex;
  const rest = Math.min(last.current, count - 1);
  const table = useScreenSpin({ scope: "truth", count, rest, sound, friction: 1.1, tick: 0.55 });
  const landed = useReached(v.revealAt) && !table.spinning;

  const bottle = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => bottle.current?.setAttribute("transform", `rotate(${-r} 180 180)`);
    apply(table.rotation.get());
    return table.rotation.on("change", apply);
  }, [table.rotation]);

  // everyone around the table, where the bottle can point at them
  const ring = useMemo(() => players.map((s, i) => ({ s, ...polar(50, 50, 43, -90 + i * (360 / count)) })), [players, count]);
  const picked = v.phase === "card" || (v.phase === "choose" && landed) ? v.chosen : null;
  const chosen = seat(v.chosen);
  const spinner = seat(v.spinner);

  let side;
  if (v.phase === "spin" || (v.phase === "choose" && !landed))
    side = (
      <div className="tvtd-side" key={`spin-${v.spinner}`}>
        <h1 className="tvtd-head">
          {v.phase === "spin" ? <Bi t={{ zh: "转瓶子", en: "Spin the bottle" }} /> : <Bi t={{ zh: "转呀转……", en: "Round and round…" }} />}
        </h1>
        {spinner && <TvLineup people={[{ seat: spinner, state: "speaking" }]} big={240} className="tvtd-who" />}
        <p className="tvtd-line">
          {v.phase === "spin" ? tx(`${name(v.spinner)} 在手机上拨瓶子`, `${name(v.spinner)} flicks the bottle on their phone`) : tx("瓶口指到谁，谁来", "Whoever it points at is up")}
        </p>
      </div>
    );
  else if (v.phase === "choose")
    side = (
      <div className="tvtd-side" key={`choose-${v.chosen}`}>
        <h1 className="tvtd-head tvtd-name">{zh ? `${name(v.chosen)}！` : `${name(v.chosen)}!`}</h1>
        {chosen && <SeatFace seat={chosen} size={150} className="tvtd-face" />}
        <div className="tvtd-pick">
          <span className="tvtd-kind is-truth">
            <Bi t={{ zh: "真心话", en: "Truth" }} />
          </span>
          <span className="tvtd-or">{tx("还是", "or")}</span>
          <span className="tvtd-kind is-dare">
            <Bi t={{ zh: "大冒险", en: "Dare" }} />
          </span>
        </div>
        <p className="tvtd-line">{tx("在自己的手机上选", "Picking on their own phone")}</p>
      </div>
    );
  else
    side = (
      <div className="tvtd-side" key={`card-${v.chosen}-${v.kind}`}>
        <p className={`tvtd-tag is-${v.kind}`}>{v.kind === "dare" ? <Bi t={{ zh: "大冒险", en: "Dare" }} /> : <Bi t={{ zh: "真心话", en: "Truth" }} />}</p>
        <Cover kind={v.kind ?? "truth"} />
        <p className="tvtd-line">
          <SeatFace seat={chosen} size={64} />
          {tx(`${name(v.chosen)} 掀开盖子，念出来`, `${name(v.chosen)} lifts the lid and reads it out`)}
        </p>
        <p className="tvtd-note">{tx("不做就认罚", "Refuse it and take the penalty")}</p>
      </div>
    );

  return (
    <TvShow
      game="truth"
      className={`tvtd is-${v.phase}`}
      phase={v.phase}
      round={
        <RoundTag>
          {v.heat === 2 ? <Flame size={26} strokeWidth={2.6} aria-hidden="true" /> : null}
          {v.heat === 2 ? tx("刺激", "Spicy") : tx("温和", "Mild")}
        </RoundTag>
      }
    >
      <div className="tvtd-table">
        <svg viewBox="0 0 360 360" aria-hidden="true">
          <PorcelainDefs />
          <defs>
            <linearGradient id="tvtdGlass" x1="0" y1="0" x2="1" y2="0">
              {GLASS.map((c, i) => (
                <stop key={c} offset={`${[0, 40, 60, 100][i]}%`} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <circle cx={180} cy={180} r={176} fill="url(#lampPool)" />
          <circle cx={180} cy={180} r={104} fill="url(#plate)" filter="url(#dishShadow)" />
          <circle cx={180} cy={180} r={96} fill="none" stroke="var(--line)" strokeWidth={1.6} opacity={0.9} />
          <g ref={bottle}>
            <g filter="url(#dishShadow)">
              <path d="M 164 236 L 164 152 C 164 134 170 130 174 118 L 174 98 L 186 98 L 186 118 C 190 130 196 134 196 152 L 196 236 Q 180 246 164 236 Z" fill="url(#tvtdGlass)" />
              <rect x={171} y={86} width={18} height={14} rx={3} fill="var(--moon)" />
              <rect x={168} y={166} width={24} height={42} rx={3} fill="var(--moon)" opacity={0.95} />
              <rect x={174} y={184} width={12} height={2} fill="var(--gel)" />
              <rect x={169} y={140} width={4} height={80} rx={2} fill="var(--moon)" opacity={0.35} />
            </g>
          </g>
        </svg>
        {ring.map(({ s, x, y }) => (
          <span key={s.id} className={`tvtd-seat ${s.id === picked ? "is-picked" : ""} ${s.id === v.spinner && v.phase === "spin" ? "is-turn" : ""} ${s.on ? "" : "is-away"}`} style={{ left: `${x}%`, top: `${y}%` } as CSSProperties}>
            <SeatFace seat={s} size={players.length > 8 ? 64 : 84} />
            <span className="tvtd-seat-name">{s.name}</span>
          </span>
        ))}
      </div>
      {side}
    </TvShow>
  );
}

/** The card under its silver cover: nothing of it shows until it's read out at the table. */
function Cover({ kind }: { kind: "truth" | "dare" }) {
  return (
    <div className={`tvtd-cover is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 300 170">
        <ellipse cx={150} cy={150} rx={140} ry={16} fill="var(--dusk-3)" />
        <path d="M 30 146 C 30 70 84 30 150 30 C 216 30 270 70 270 146 Z" fill="var(--haze)" />
        <path d="M 52 140 C 56 86 96 52 150 50" fill="none" stroke="var(--moon)" strokeWidth={8} strokeLinecap="round" opacity={0.75} />
        <rect x={136} y={16} width={28} height={16} rx={8} fill="var(--moon)" />
        <rect x={24} y={142} width={252} height={8} rx={4} fill="var(--fog)" />
      </svg>
    </div>
  );
}
