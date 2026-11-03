import { useEffect, useMemo, useRef } from "react";
import { PorcelainDefs } from "../../components/Dish";
import { sliceLabel } from "../../data/wheel";
import { polar } from "../../lib/geom";
import type { WheelSliceView, WheelView } from "../../shared/protocol";
import { usePenaltyText } from "../../store";
import { Bi, TvLineup, TvShow, useLang, useSeats, type PersonState } from "../../tv/show";
import { useScreenSpin } from "../../tv/spin";
import type { TvViewProps } from "../../tv/views";
import { useReached } from "../RoomContext";
import "../../styles/tv-wheel.css";

/** The wheel's slices, in turn round the wheel (the same colors the phones paint). */
const WEDGES = ["#ff5fa2", "#ffb82e", "#31b9ff", "#4be38f", "#b072ff", "#ff8c42", "#2ed3d9", "#f5df3b", "#8c86ff", "#ff6b5e"];

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * 命运转盘 on the big screen: the wheel, large, turning when the phone whose turn it is spins it
 * and stopping where every phone's wheel stops; beside it whose turn it is and what the slice
 * says. A truth or a dare it lands on is on every phone at once, so it's up here too.
 */
export default function TvWheel({ v, sound }: TvViewProps<WheelView>) {
  const { zh, tx, tr, other } = useLang();
  const { seat, name } = useSeats();
  const custom = usePenaltyText().isCustom;
  const label = (s: WheelSliceView) => sliceLabel(s, custom);
  const count = v.slices.length;

  const last = useRef(0);
  if (v.result !== null) last.current = v.result;
  const rest = Math.min(last.current, count - 1);
  const table = useScreenSpin({ scope: "wheel", count, rest, sound, friction: 1.2, tick: 0.7 });
  const landed = useReached(v.revealAt) && !table.spinning;

  const wheel = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => wheel.current?.setAttribute("transform", `rotate(${r} 180 180)`);
    apply(table.rotation.get());
    return table.rotation.on("change", apply);
  }, [table.rotation]);

  const step = 360 / Math.max(1, count);
  const wedges = useMemo(
    () =>
      v.slices.map((s, i) => {
        const R = 150;
        const a0 = 90 + i * step - step / 2;
        const p0 = polar(180, 180, R, a0);
        const p1 = polar(180, 180, R, a0 + step);
        return { s, i, d: `M 180 180 L ${p0.x} ${p0.y} A ${R} ${R} 0 ${step > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`, mid: 90 + i * step, color: WEDGES[i % WEDGES.length] };
      }),
    [v.slices, step],
  );

  const result = v.result !== null ? v.slices[v.result] : null;
  const shown = v.phase !== "spin" && v.phase !== "spinning" && landed && result;
  const color = v.result !== null ? WEDGES[v.result % WEDGES.length] : undefined;
  const who = seat(v.turn);
  const state: PersonState = !shown ? "speaking" : result.kind === "safe" ? "win" : result.kind === "again" ? "speaking" : "spot";

  let side;
  if (!shown)
    side = (
      <div className="tvw-side" key={`spin-${v.turn}`}>
        <h1 className="tvw-head">{v.phase === "spin" ? <Bi t={{ zh: "转转盘", en: "Spin the wheel" }} /> : <Bi t={{ zh: "转呀转……", en: "Round and round…" }} />}</h1>
        {who && <TvLineup people={[{ seat: who, state }]} big={240} className="tvw-who" />}
        <p className="tvw-line">{v.phase === "spin" ? tx(`${name(v.turn)} 在手机上转`, `${name(v.turn)} spins it on their phone`) : tx("指针停在哪一格，就是哪一格", "Wherever the pointer stops, that's it")}</p>
      </div>
    );
  else
    side = (
      <div className="tvw-side" key={`res-${v.turn}-${v.result}-${v.phase}`}>
        <p className="tvw-chip" style={{ background: color }}>
          <Bi t={label(result)} />
        </p>
        {v.phase === "prompt" && v.prompt ? (
          <div className="tvw-prompt">
            <p className="tvw-prompt-main">{tr(v.prompt)}</p>
            <p className="tvw-prompt-sub">{other(v.prompt)}</p>
          </div>
        ) : (
          who && <TvLineup people={[{ seat: who, state }]} big={240} className="tvw-who" />
        )}
        <p className="tvw-line">
          {v.phase === "pick"
            ? custom
              ? tx(`${name(v.turn)} 在挑谁受罚`, `${name(v.turn)} is choosing who takes the penalty`)
              : tx(`${name(v.turn)} 在挑谁喝`, `${name(v.turn)} is choosing who drinks`)
            : v.phase === "prompt"
              ? tx(`看 ${name(v.turn)} 做`, `Over to ${name(v.turn)}`)
              : result.kind === "safe"
                ? tx(`${name(v.turn)} 这次安全`, `${name(v.turn)} is safe this time`)
                : tx(`${name(v.turn)} 转到的`, `What ${name(v.turn)} spun`)}
        </p>
      </div>
    );

  return (
    <TvShow game="wheel" className={`tvw is-${v.phase}`} phase={v.phase}>
      <div className={`tvw-wheel ${shown ? "is-landed" : ""}`}>
        <svg viewBox="0 0 360 380" aria-hidden="true">
          <PorcelainDefs />
          <circle cx={180} cy={180} r={176} fill="url(#lampPool)" />
          <circle cx={180} cy={180} r={160} fill="var(--dusk-2)" filter="url(#dishShadow)" />
          <g ref={wheel}>
            {wedges.map((w) => {
              const right = Math.cos((w.mid * Math.PI) / 180) >= 0;
              return (
                <g key={w.s.id + w.i} className={`tvw-slice ${shown && w.i === v.result ? "is-hit" : ""}`}>
                  <path d={w.d} fill={w.color} stroke="var(--night)" strokeWidth={2.5} />
                  <text
                    transform={right ? `rotate(${w.mid} 180 180) translate(${180 + 50} 180)` : `rotate(${w.mid + 180} 180 180) translate(${180 - 50} 180)`}
                    textAnchor={right ? "start" : "end"}
                    dominantBaseline="central"
                    fontSize={zh ? (count > 10 ? 13 : 15.5) : count > 10 ? 11.5 : 13.5}
                    fontWeight={800}
                    fill="var(--night)"
                  >
                    {trim(tr(label(w.s)), zh ? (count > 10 ? 5 : 6) : count > 10 ? 10 : 12)}
                  </text>
                </g>
              );
            })}
          </g>
          <circle cx={180} cy={180} r={30} fill="url(#plate)" filter="url(#softShadow)" />
          <circle cx={180} cy={180} r={10} fill="var(--moon)" />
          <circle cx={180} cy={180} r={160} fill="none" stroke="var(--moon)" strokeWidth={3} opacity={0.9} />
          <path d="M 180 330 L 166 362 Q 180 356 194 362 Z" fill="var(--moon)" filter="url(#softShadow)" />
        </svg>
      </div>
      {side}
    </TvShow>
  );
}
