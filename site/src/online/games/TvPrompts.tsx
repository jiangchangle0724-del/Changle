import type { PromptsView } from "../../shared/protocol";
import { Bi, FacesIn, joinNames, RoundTag, TvBoard, TvClock, TvLineup, TvShow, useArrivals, useLang, useSeats, type Person } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import "../../styles/tv-prompts.css";

const ANSWER_MS = 30_000;

/**
 * 我从来没有 (and 谁最有可能) on the big screen: the card, large, who has answered (never what),
 * the clock; then, when every phone shows it, who has done it, or who the table thinks is the
 * most likely and by how many votes.
 */
export default function TvPrompts({ v, sound }: TvViewProps<PromptsView>) {
  const { zh, tx, tr, other } = useLang();
  const { players, seat, name } = useSeats();
  const never = v.mode === "never";
  useArrivals(v.answered, sound);
  const tag = <RoundTag>{never ? tx("我从来没有", "Never have I ever") : tx("谁最有可能", "Most likely to")}</RoundTag>;
  const reader = seat(v.reader);

  if (v.phase === "draw" || !v.card)
    return (
      <TvShow game="prompts" className="tvpr is-draw" phase={v.phase} round={tag}>
        <div className="tvpr-draw">
          <h1 className="tvpr-head">
            <Bi t={{ zh: "抽一张", en: "Draw a card" }} />
          </h1>
          {reader && <TvLineup people={[{ seat: reader, state: "speaking" }]} big={280} className="tvpr-who" />}
          <p className="tvpr-line">{tx(`轮到 ${name(v.reader)} 在手机上抽`, `${name(v.reader)} draws on their phone`)}</p>
          <p className="tvpr-note tabular">{tx(`还剩 ${v.left} 张`, `${v.left} cards left`)}</p>
        </div>
      </TvShow>
    );

  const card = (
    <div className={`tvpr-card ${v.phase === "reveal" ? "is-small" : ""}`}>
      <p className="tvpr-card-main">{tr(v.card)}</p>
      <p className="tvpr-card-sub">{other(v.card)}</p>
    </div>
  );

  if (v.phase === "answer")
    return (
      <TvShow game="prompts" className="tvpr is-answer" phase={v.phase} round={tag} clock={<TvClock endsAt={v.endsAt} total={ANSWER_MS} sound={sound} />}>
        <div className="tvpr-main">
          {card}
          <p className="tvpr-ask">{never ? tx("在手机上选：我做过，还是没做过", "On your phone: have you, or haven't you?") : tx("在手机上投：在座谁最有可能", "On your phone: who here is most likely to?")}</p>
          <p className="tvpr-answered">
            <FacesIn seats={v.answered.map((pid) => seat(pid))} size={64} />
            <span className="tabular">{tx(`${v.answered.length}/${players.length} 人答了`, `${v.answered.length} of ${players.length} in`)}</span>
          </p>
        </div>
      </TvShow>
    );

  // the reveal
  const r = v.result;
  if (never) {
    const yes = r?.yes ?? [];
    const people: Person[] = players.map((s) => ({ seat: s, state: yes.includes(s.id) ? "spot" : "dim", tag: yes.includes(s.id) ? <span className="tvpr-yes">{tx("做过", "Has")}</span> : undefined }));
    return (
      <TvShow game="prompts" className="tvpr is-reveal" phase={v.phase} round={tag}>
        <div className="tvpr-main">
          {card}
          <h1 className="tvpr-verdict">
            {yes.length
              ? tx(`${joinNames(yes.map((pid) => name(pid)), zh)} 做过！`, `${joinNames(yes.map((pid) => name(pid)), zh)}: guilty!`)
              : tx("谁都没做过", "Nobody has")}
          </h1>
        </div>
        <TvLineup people={people} big={230} className="tvpr-line-up" />
      </TvShow>
    );
  }
  const top = r?.top ?? [];
  const rows = players.map((s) => ({ seat: s, score: r?.counts?.[s.id] ?? 0, hot: top.includes(s.id) }));
  return (
    <TvShow game="prompts" className="tvpr is-reveal is-likely" phase={v.phase} round={tag}>
      <div className="tvpr-main is-split">
        <div className="tvpr-left">
          {card}
          <h1 className="tvpr-verdict">{top.length ? tx(`最有可能：${joinNames(top.map((pid) => name(pid)), zh)}`, `Most likely: ${joinNames(top.map((pid) => name(pid)), zh)}`) : tx("没人投票", "No votes")}</h1>
          {top.length > 0 && <TvLineup people={top.map((pid) => ({ seat: seat(pid)!, state: "spot" as const })).filter((p) => p.seat)} big={220} className="tvpr-top" />}
        </div>
        <TvBoard rows={rows} unit={tx("票", "votes")} title={<Bi t={{ zh: "票数", en: "Votes" }} />} className="tvpr-board" />
      </div>
    </TvShow>
  );
}
