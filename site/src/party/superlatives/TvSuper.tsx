import { Crown, PenLine, Trophy } from "lucide-react";
import { useRef } from "react";
import { Figure } from "../../components/Figure";
import { sfx } from "../../lib/sfx";
import { SeatFace } from "../../online/People";
import type { SeatView, SuperView } from "../../shared/protocol";
import { Bi, DoneBadge, RoundTag, TvClock, TvLineup, TvPodium, TvShow, useArrivals, useBeat, useConfetti, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import "../../styles/tv-superlatives.css";

const VOTE_MS = 45_000;

/**
 * 最佳称号 on the big screen: an awards night. The award on a gold plaque, everyone standing on
 * the stage and lighting up as they vote (never for whom); then the drum roll, the winner in the
 * spotlight with the sash, every nominee's votes; at the end the ceremony on the podium.
 */
export default function TvSuper({ v, sound }: TvViewProps<SuperView>) {
  const { zh } = useLang();
  const tag = (
    <RoundTag>
      {v.phase === "ceremony" ? (zh ? `${v.round} 个奖` : `${v.round} awards`) : zh ? `第 ${v.round} 个奖` : `Award ${v.round}`}
      {v.phase !== "ceremony" && <small>{zh ? ` / 共 ${v.total} 个` : ` of ${v.total}`}</small>}
    </RoundTag>
  );
  return (
    <TvShow game="superlatives" className="tvs" phase={v.phase} round={tag} clock={v.phase === "vote" ? <TvClock endsAt={v.endsAt} total={VOTE_MS} sound={sound} /> : null} set={<Glitter />}>
      {v.phase === "vote" && <Vote v={v} sound={sound} />}
      {v.phase === "reveal" && <Reveal v={v} sound={sound} />}
      {v.phase === "ceremony" && <Ceremony v={v} sound={sound} />}
    </TvShow>
  );
}

/** Gold dust drifting down the back wall. */
function Glitter() {
  return <i className="tvs-glitter" />;
}

/* ------------------------------------------------------------------ the vote */

function Vote({ v, sound }: { v: SuperView; sound: boolean }) {
  const { zh } = useLang();
  const { players } = useSeats();
  useArrivals(v.voted, sound);
  const voted = players.filter((s) => v.voted.includes(s.id)).length;
  return (
    <div className="tvs-vote">
      <Plaque v={v} sound={sound} />
      <p className="tvs-ask">
        <span>{zh ? "在手机上投票：这个奖该给谁？" : "Vote on your phone: who deserves it?"}</span>
        <span className="tvs-count tabular">
          <b>{voted}</b>/{players.length}
          <small>{zh ? " 人投了" : " voted"}</small>
        </span>
      </p>
      <TvLineup people={players.map((s) => ({ seat: s, state: v.voted.includes(s.id) ? "voted" : "idle", badge: v.voted.includes(s.id) ? <DoneBadge /> : undefined }))} big={230} />
    </div>
  );
}

/** The award up for grabs, on a gold plaque that swings in for every new title. */
function Plaque({ v, sound }: { v: SuperView; sound: boolean }) {
  const { zh } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useBeat(
    (tl, q) => {
      if (sound) tl.call(() => sfx.whoosh(0.35), [], 0);
      tl.fromTo(q(".tvs-plaque"), { rotateX: -80, y: 40, opacity: 0 }, { rotateX: 0, y: 0, opacity: 1, duration: 0.8, ease: "back.out(1.4)" }, 0);
      tl.fromTo(q(".tvs-trophy"), { scale: 0.3, rotate: -24 }, { scale: 1, rotate: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" }, 0.3);
    },
    ref,
    [v.title.zh, v.title.en, v.round],
  );
  return (
    <div className="tvs-plaque-wrap" ref={ref}>
      <div className="tvs-plaque">
        <span className="tvs-trophy" aria-hidden="true">
          <Trophy size={58} strokeWidth={1.9} />
        </span>
        {v.custom ? (
          <span className="tvx-bi">
            <span className={`tvx-bi-main ${zh ? "is-zh" : ""}`}>{zh ? v.title.zh : v.title.en}</span>
            <span className="tvs-own">
              <PenLine size={22} strokeWidth={2.4} />
              {zh ? "主人出的题" : "The host's own"}
            </span>
          </span>
        ) : (
          <Bi t={v.title} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ and the award goes to */

function Reveal({ v, sound }: { v: SuperView; sound: boolean }) {
  const { zh, tr } = useLang();
  const { seat } = useSeats();
  const root = useRef<HTMLDivElement>(null);
  const burst = useConfetti();
  const winners = v.winners.map((id) => seat(id)).filter((s): s is SeatView => !!s);
  const counts = v.counts ?? {};
  const rows = Object.keys(counts)
    .filter((id) => counts[id] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map((id) => ({ seat: seat(id), n: counts[id], win: v.winners.includes(id) }))
    .filter((r): r is { seat: SeatView; n: number; win: boolean } => !!r.seat);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const key = `${v.round}:${v.winners.join(",")}`;
  // the drum roll, then the name (the winner's penalty lands on the room's clock at 2.6 s)
  useBeat(
    (tl, q) => {
      const land = 1.05;
      if (sound) tl.call(() => sfx.drumroll(1.0), [], 0);
      tl.fromTo(q(".tvs-goes"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45 }, 0);
      tl.fromTo(q(".tvs-beam"), { opacity: 0, scaleX: 0.3 }, { opacity: 1, scaleX: 1, duration: 0.5, ease: "power2.out" }, 0.75);
      tl.fromTo(q(".tvs-winner"), { scale: 0.2, rotate: -12, opacity: 0, y: 60 }, { scale: 1, rotate: 0, opacity: 1, y: 0, duration: 0.8, ease: "back.out(1.9)", stagger: 0.12 }, land);
      tl.fromTo(q(".tvs-winner-name"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.12 }, land + 0.35);
      tl.fromTo(q(".tvs-title-won"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, land + 0.5);
      tl.fromTo(q(".tvs-vote-row"), { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.08 }, land + 0.6);
      tl.fromTo(q(".tvs-vote-fill"), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "power2.out", stagger: 0.08 }, land + 0.7);
      tl.call(() => burst({ x: 0.33, y: 0.62, count: 240, spread: 110, power: 26 }), [], land + 0.05);
      if (sound) {
        tl.call(() => sfx.crown(), [], land);
        tl.call(() => sfx.cheer(2.2), [], land + 0.15);
      }
    },
    root,
    [key],
  );
  const many = winners.length > 1;
  return (
    <div className="tvs-reveal" ref={root}>
      <p className="tvs-goes">{zh ? "获奖的是……" : "And the award goes to…"}</p>
      <div className={`tvs-spot n${Math.min(3, winners.length)} ${many ? "is-many" : ""}`}>
        <i className="tvs-beam" aria-hidden="true" />
        {winners.slice(0, 3).map((s) => (
          <div key={s.id} className="tvs-winner">
            <span className="tvs-winner-fig">
              <Figure seat={s} />
              <span className="tvs-sash" aria-hidden="true" />
              <span className="tvs-medal" aria-hidden="true" />
            </span>
            <span className="tvs-winner-name">
              <Crown size={many ? 30 : 40} strokeWidth={2.4} />
              {s.name}
            </span>
          </div>
        ))}
      </div>
      <p className="tvs-title-won">{zh ? `「${tr(v.title)}」` : `"${tr(v.title)}"`}</p>
      <aside className="tvs-votes">
        <h2>{zh ? "票数" : "The votes"}</h2>
        <ul>
          {rows.map((r) => (
            <li key={r.seat.id} className={`tvs-vote-row ${r.win ? "is-top" : ""}`}>
              <SeatFace seat={r.seat} size={50} />
              <span className="tvs-vote-name">{r.seat.name}</span>
              <span className="tvs-vote-track" aria-hidden="true">
                <span className="tvs-vote-fill" style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
              <span className="tvs-vote-n tabular">{r.n}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ the ceremony */

function Ceremony({ v, sound }: { v: SuperView; sound: boolean }) {
  const { zh, tr } = useLang();
  const { players, seat } = useSeats();
  // everyone who sat at the table tonight with a trophy, plus everyone still here
  const ids = [...new Set([...players.map((s) => s.id), ...Object.keys(v.awards)])];
  const people = ids.map((id) => seat(id)).filter((s): s is SeatView => !!s);
  const rows = people.map((s) => ({ seat: s, score: v.awards[s.id]?.length ?? 0 }));
  const shelf = people.filter((s) => (v.awards[s.id]?.length ?? 0) > 0).sort((a, b) => (v.awards[b.id]?.length ?? 0) - (v.awards[a.id]?.length ?? 0));
  return (
    <div className="tvs-ceremony">
      <h1 className="tvs-ceremony-title">
        <Bi t={{ zh: "颁奖典礼", en: "The Awards" }} />
      </h1>
      <TvPodium rows={rows} unit={zh ? "个奖" : "won"} sound={sound} className="tvs-podium" burstX={0.31} />
      <aside className="tvs-honours">
        <h2>{zh ? "今晚的奖" : "Tonight's awards"}</h2>
        <ul>
          {shelf.map((s) => (
            <li key={s.id}>
              <SeatFace seat={s} size={46} />
              <span className="tvs-honour-name">{s.name}</span>
              <span className="tvs-honour-list">
                {(v.awards[s.id] ?? []).map((a, i) => (
                  <span key={i} className="tvs-chip">
                    <Trophy size={18} strokeWidth={2.4} />
                    {tr(a)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
