import { Check, Pencil, Star } from "lucide-react";
import { useEffect, useRef } from "react";
import { DRAW_ROUND_MS, type DrawView, type SeatView } from "../../shared/protocol";
import { Bi, FacesIn, RoundTag, TvBoard, TvClock, TvShow, useArrivals, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { NetPlate } from "../NetPlate";
import { SeatFace } from "../People";
import { hintBlanks, hintSay, hintZh } from "./drawHint";
import "../../styles/tv-draw.css";

/**
 * 你画我猜 on the big screen: the drawing, large, stroke by stroke as it's drawn; who's drawing, the
 * word's length, the clock, and every guess as it comes in (a right one says who, never what). The
 * word itself only goes up when the round is over, with the scores.
 */
export default function TvDraw({ v, sound }: TvViewProps<DrawView>) {
  const { zh, tx, tr, other } = useLang();
  const { seats, players, seat, name } = useSeats();
  // the seats as last seen: a drawer who walks off mid-round is still shown, by face and name
  const known = useRef(new Map<string, SeatView>());
  useEffect(() => {
    for (const s of seats) known.current.set(s.id, s);
  }, [seats]);
  // a pop for each wrong guess as it comes in (a right one gets the room's "correct" chime)
  useArrivals(
    v.guesses.flatMap((g, i) => (g.ok ? [] : [`${i}`])),
    sound,
  );
  const tag = <RoundTag>{tx(`第 ${v.round} 轮`, `Round ${v.round}`)}</RoundTag>;
  const drawer = seat(v.drawer);

  if (v.phase === "pick")
    return (
      <TvShow game="draw" className="tvdr is-pick" phase={v.phase} round={tag}>
        <div className="tvdr-pick">
          {drawer && <SeatFace seat={drawer} size={160} className="tvdr-face" />}
          <h1 className="tvdr-head">{tx(`轮到 ${name(v.drawer)} 画`, `${name(v.drawer)} draws next`)}</h1>
          <p className="tvdr-line">{tx("画的人在手机上挑难度，只有他的手机看得到词", "The drawer picks how hard on their phone; only their phone shows the word")}</p>
        </div>
      </TvShow>
    );

  const result = v.phase === "result";
  const rows = players.map((s) => ({ seat: s, score: v.scores[s.id] ?? 0, hot: v.solved.includes(s.id) }));
  // the drawer left before the round was over: `drawer` is already the next one, so say who left
  const left = result && !!v.left;
  const gone = result && v.left ? (seat(v.left) ?? known.current.get(v.left)) : undefined;
  const goneName = gone?.name ?? tx("画的人", "The drawer");
  const face = left ? gone : drawer;
  return (
    <TvShow game="draw" className={`tvdr is-${v.phase}`} phase={v.phase} round={tag} clock={!result ? <TvClock endsAt={v.endsAt} total={DRAW_ROUND_MS} sound={sound} /> : undefined}>
      <div className="tvdr-board">
        <NetPlate canDraw={false} />
      </div>
      <aside className="tvdr-side">
        <p className="tvdr-who">
          {face && <SeatFace seat={face} size={60} />}
          <Pencil size={30} strokeWidth={2.4} aria-hidden="true" />
          {/* (one line, as ever: the phones say there's no penalty) */}
          {left
            ? tx(`${goneName} 不画了`, `${goneName} stopped drawing`)
            : result && v.alone
              ? tx("没人猜了", "Nobody left to guess")
              : tx(`${name(v.drawer)} 在画`, `${name(v.drawer)} is drawing`)}
          <span className="tvdr-stars" aria-label={tx(`难度 ${v.d}`, `difficulty ${v.d}`)}>
            {[1, 2, 3].map((n) => (
              <Star key={n} size={26} strokeWidth={2.4} className={n <= v.d ? "is-on" : ""} aria-hidden="true" />
            ))}
          </span>
        </p>
        {result && v.word ? (
          <div className="tvdr-word" key="word">
            <p className="tvdr-word-main">{tr(v.word)}</p>
            <p className="tvdr-word-sub">{other(v.word)}</p>
          </div>
        ) : (
          v.hint &&
          (zh ? (
            <p className="tvdr-hint tabular">{hintZh(v.hint)}</p>
          ) : (
            <p className="tvdr-hint tabular" role="img" aria-label={hintSay(v.hint.en)}>
              {hintBlanks(v.hint.en)}
            </p>
          ))
        )}
        {result ? (
          <TvBoard rows={rows} unit={tx("分", "pts")} max={6} className="tvdr-scores" />
        ) : (
          <ol className="tvdr-guesses">
            {v.guesses.slice(-6).map((g, i) => (
              <li key={`${v.guesses.length - 6 + i}`} className={g.ok ? "is-ok" : ""}>
                <SeatFace seat={seat(g.pid)} size={44} />
                {g.ok ? (
                  <span>
                    <Check size={26} strokeWidth={3} aria-hidden="true" />
                    {tx(`${name(g.pid)} 猜中了！`, `${name(g.pid)} got it!`)}
                  </span>
                ) : (
                  <span className="tvdr-guess">{g.text}</span>
                )}
              </li>
            ))}
            {!v.guesses.length && <li className="is-empty">{tx("在手机上猜", "Guess on your phone")}</li>}
          </ol>
        )}
        {!result && v.solved.length > 0 && (
          <p className="tvdr-solved">
            <FacesIn seats={v.solved.map((pid) => seat(pid))} size={44} />
            <Bi t={{ zh: "猜中了", en: "got it" }} />
          </p>
        )}
      </aside>
    </TvShow>
  );
}
