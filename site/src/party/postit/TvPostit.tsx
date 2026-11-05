import { Check, X } from "lucide-react";
import { deckName } from "../../data/postit";
import type { PostitReply, PostitView } from "../../shared/protocol";
import { Bi, DoneBadge, FacesIn, RoundTag, TvClock, TvLineup, TvShow, useArrivals, useLang, useSeats, type Person } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { SeatFace } from "../../online/People";
import "../../styles/tv-postit.css";

const WRITE_MS = 75_000;
const REPLIES: { r: PostitReply; zh: string; en: string }[] = [
  { r: "yes", zh: "是", en: "Yes" },
  { r: "no", zh: "不是", en: "No" },
  // (the same words as on the phones' buttons)
  { r: "maybe", zh: "不确定", en: "Not sure" },
];

/**
 * 额头便利贴 on the big screen. Everyone can read the TV, so a word still stuck on a forehead never
 * shows here: each note is a blank "?" until its owner has guessed it. What the room sees is the
 * game around the words: who has written, whose turn it is, their question and everyone's yes or
 * no, each guess and whether it was right, and how many have got theirs.
 */
export default function TvPostit({ v, sound }: TvViewProps<PostitView>) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const table = v.order.map((pid) => seat(pid)).filter((s): s is NonNullable<typeof s> => !!s);
  useArrivals(Object.keys(v.replies), sound);

  if (v.phase === "write") {
    const people: Person[] = table.map((s) => ({ seat: s, state: v.written.includes(s.id) ? "ready" : "idle", badge: v.written.includes(s.id) ? <DoneBadge /> : undefined }));
    return (
      <TvShow game="postit" className="tvp is-write" phase={v.phase} clock={<TvClock endsAt={v.endsAt} total={WRITE_MS} sound={sound} />}>
        <div className="tvp-top">
          <h1 className="tvp-head">
            <Bi t={{ zh: "写便利贴", en: "Write the notes" }} />
          </h1>
          <p className="tvp-line">{tx("每人给一个人写一个词，贴在他额头上：他自己看不到，这块屏幕也不显示", "Everyone writes a word for someone else's forehead: they can't see it, and neither can this screen")}</p>
          <p className="tvp-count tabular">{tx(`${v.written.length}/${table.length} 张写好了`, `${v.written.length} of ${table.length} written`)}</p>
          {v.pick && v.pick !== "mix" && <p className="tvp-line">{tx(`没写的随机发，从「${deckName(v.pick).zh}」里出`, `Notes nobody writes come from ${deckName(v.pick).en}`)}</p>}
        </div>
        <TvLineup people={people} big={250} className="tvp-row" />
      </TvShow>
    );
  }

  const done = v.phase === "end";
  // a note shows only once its owner has it (publicView keeps the rest blank as well)
  const note = (pid: string) => {
    const n = v.notes[pid];
    return n && (done || v.solved.includes(pid)) ? tr(n) : null;
  };
  const people: Person[] = table.map((s) => {
    const word = note(s.id);
    return {
      seat: s,
      // (at the end, only whoever drinks the glass has lost: not someone still guessing when the others went home)
      state: !done && s.id === v.turn ? "spot" : v.solved.includes(s.id) ? "win" : done && (v.last === undefined || v.last === s.id) ? "lose" : "idle",
      tag: <span className={`tvp-note ${word ? "is-open" : ""}`}>{word ?? "?"}</span>,
    };
  });
  const g = v.guess;
  const tag = <RoundTag>{tx(`猜出来了 ${v.solved.length}/${table.length}`, `${v.solved.length} of ${table.length} got theirs`)}</RoundTag>;

  return (
    <TvShow game="postit" className={`tvp is-${v.phase}`} phase={v.phase} round={tag}>
      <div className="tvp-board">
        {done ? (
          <h1 className="tvp-head">
            <Bi t={{ zh: "都揭晓了", en: "Every note, revealed" }} />
          </h1>
        ) : (
          <>
            <p className="tvp-turn">
              <SeatFace seat={seat(v.turn)} size={64} />
              {v.asking
                ? tx(`${name(v.turn)} 问：`, `${name(v.turn)} asks:`)
                : v.final
                  ? tx(`${name(v.turn)} 的最后一次机会：问一个是不是的问题，然后猜`, `${name(v.turn)}'s last chance: a yes-or-no question, then a guess`)
                  : tx(`轮到 ${name(v.turn)}：问一个是不是的问题，或者直接猜`, `${name(v.turn)}'s turn: ask a yes-or-no question, or guess`)}
            </p>
            {v.asking && <p className="tvp-question">{v.asking}</p>}
            {v.asking && (
              <ul className="tvp-replies">
                {REPLIES.map(({ r, zh, en }) => {
                  const who = Object.keys(v.replies).filter((pid) => v.replies[pid] === r);
                  return (
                    <li key={r} className={`is-${r}`}>
                      <b>{tx(zh, en)}</b>
                      <FacesIn seats={who.map((pid) => seat(pid))} size={48} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        {g && (
          <p className={`tvp-guess ${g.ok ? "is-ok" : "is-wrong"}`} key={g.at}>
            {g.ok ? <Check size={34} strokeWidth={3} aria-hidden="true" /> : <X size={34} strokeWidth={3} aria-hidden="true" />}
            {g.ok ? tx(`${name(g.by)} 猜中了：「${g.text}」`, `${name(g.by)} got it: "${g.text}"`) : tx(`${name(g.by)} 猜「${g.text}」，不对`, `${name(g.by)} guessed "${g.text}": no`)}
          </p>
        )}
      </div>
      <TvLineup people={people} big={250} className="tvp-row" />
    </TvShow>
  );
}
