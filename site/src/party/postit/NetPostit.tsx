import { Dices, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { GAME_BY_ID } from "../../games/registry";
import { gsap, reduced } from "../../lib/anim";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useRoom } from "../../online/RoomContext";
import { useWatching } from "../../online/players";
import { HostButton, HostRow, TurnLine, useYourTurn, Waiting } from "../../online/games/common";
import type { PostitReply, PostitView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { Forehead, Sticky, tiltFor } from "./parts";
import "../../styles/party.css";
import "./net.css";
import { Figure } from "../../components/Figure";

const REPLY: Record<PostitReply, [string, string]> = { yes: ["是", "Yes"], no: ["不是", "No"], maybe: ["不确定", "Not sure"] };

export function NetPostit({ v, onLeave }: { v: PostitView; onLeave: () => void }) {
  const { room, me, g, nameOf } = useRoom();
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const mine = v.turn === me && v.phase === "play";
  const solvedMe = v.solved.includes(me);
  useYourTurn(mine);

  const rules = (
    <p>
      {zh
        ? `每个人给下一位写一张便利贴（一个人物、动物或东西），也可以让系统随机出。所有人都能看到别人额头上的字，只有自己的看不到。轮到你时，问一个只能回答是或不是的问题（说出来，或者打在手机上），其他人在手机上回答。然后可以猜，也可以跳过。${custom ? "猜错受罚，最后一个没猜出来的也受罚。" : "猜错喝一口，最后一个没猜出来的喝一杯。"}每个人的轮数一样：别人都猜出来了、你还少问一轮，就有最后一次机会。`
        : `Everyone writes a note for the next player: a person, an animal, a thing (or lets the deck pick). Every phone shows everyone's forehead except your own. On your turn, ask a yes-or-no question (out loud, or typed), and the others answer on their phones. Then guess, or pass. ${custom ? "A wrong guess takes the penalty, and so does the last one still guessing." : "A wrong guess is a sip; the last one still guessing drinks a full glass."} Everyone gets the same number of turns: if the others have theirs and you are a turn behind, you get a last chance.`}
    </p>
  );

  return (
    <NetFrame title={GAME_BY_ID.postit.name} rules={rules} onLeave={onLeave}>
      <div className={`pi ${v.phase === "write" ? "" : "is-table"}`}>
        {v.phase === "write" && <WritePhase v={v} />}

        {v.phase !== "write" && (
          <>
            {/* upright, the two halves are one column; on a phone held sideways the wall is on the left and the turn's business stays put on the right (net.css) */}
            <div className="pi-side">
              {v.phase === "play" &&
                (v.final ? (
                  <TurnLine pid={v.turn} lead={zh ? "最后一次机会" : "Last chance"} mineText={zh ? "你的最后一次机会" : "Your last chance"} />
                ) : (
                  <TurnLine pid={v.turn} lead={zh ? "现在提问" : "Asking now"} mineText={zh ? "轮到你提问" : "Your turn to ask"} />
                ))}
              {v.phase === "end" && <p className="pi-end">{zh ? "全部揭晓" : "All revealed"}</p>}
              <div className="forehead-wall">
                {v.order.map((id) => (
                  <Forehead
                    key={id}
                    figure={!!seat(id)}
                    face={seat(id) ? <Figure seat={seat(id)!} /> : <SeatFace seat={seat(id)} size={46} />}
                    name={id === me ? (zh ? "你" : "You") : nameOf(id)}
                    note={v.notes[id]}
                    tilt={tiltFor(id)}
                    turn={v.phase === "play" && v.turn === id}
                    solved={v.solved.includes(id)}
                  >
                    {v.phase === "play" && v.replies[id] && <span className={`pi-reply-tag is-${v.replies[id]}`}>{REPLY[v.replies[id]][zh ? 0 : 1]}</span>}
                  </Forehead>
                ))}
              </div>
            </div>

            <div className="pi-main">
              <GuessToast v={v} />

              {v.phase === "play" && (mine ? <AskPanel v={v} /> : <ReplyPanel v={v} />)}

              {v.phase === "play" && solvedMe && !mine && <p className="hint" style={{ textAlign: "center" }}>{zh ? "你已经猜出来了，帮大家回答问题" : "You got yours. Help the others by answering."}</p>}

              {v.phase === "end" && (
                <ol className="pi-order">
                  {v.solved.map((id, i) => (
                    <li key={id}>
                      <span className="tabular">{i + 1}</span>
                      <SeatFace seat={seat(id)} size={26} />
                      <strong>{nameOf(id)}</strong>
                      <small className="hint">{zh ? `猜了 ${v.tries[id] ?? 0} 次` : `${v.tries[id] ?? 0} ${v.tries[id] === 1 ? "guess" : "guesses"}`}</small>
                    </li>
                  ))}
                  {v.order
                    .filter((id) => !v.solved.includes(id))
                    .map((id) =>
                      // (`last` is who drinks the glass; a server not yet updated doesn't say, and there it was always the one left)
                      v.last === undefined || v.last === id ? (
                        <li key={id} className="is-last">
                          <span>!</span>
                          <SeatFace seat={seat(id)} size={26} />
                          <strong>{nameOf(id)}</strong>
                          <small>{custom ? (zh ? "最后一个，受罚" : "Last one: penalty") : zh ? "最后一个，喝一杯" : "Last one: a full glass"}</small>
                        </li>
                      ) : (
                        <li key={id}>
                          <span>-</span>
                          <SeatFace seat={seat(id)} size={26} />
                          <strong>{nameOf(id)}</strong>
                          <small className="hint">{zh ? "没猜完，大家先走了" : "Still guessing when the others left"}</small>
                        </li>
                      ),
                    )}
                </ol>
              )}

              <HostRow>
                {v.phase === "play" && v.guess && !v.guess.ok && !v.solved.includes(v.guess.by) && v.order.includes(v.guess.by) && <HostButton onClick={() => g("accept")}>{zh ? `算 ${nameOf(v.guess.by)} 猜对` : `Count ${nameOf(v.guess.by)} as right`}</HostButton>}
                {v.phase === "play" && !mine && <HostButton onClick={() => g("pass")}>{zh ? `跳过 ${nameOf(v.turn)}` : `Skip ${nameOf(v.turn)}`}</HostButton>}
                {v.phase === "end" && <HostButton onClick={() => g("again")}>{zh ? "再来一局" : "Play again"}</HostButton>}
              </HostRow>
            </div>
          </>
        )}
      </div>
    </NetFrame>
  );
}

function GuessToast({ v }: { v: PostitView }) {
  const { nameOf, me } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const ref = useRef<HTMLDivElement>(null);
  const at = v.guess?.at;
  useEffect(() => {
    if (!at || !ref.current || reduced()) return;
    gsap.fromTo(ref.current, { y: 12, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)", clearProps: "transform,opacity" });
  }, [at]);
  // (at the end too: the last guess of the game stays on show; not one by someone who has gone)
  if (!v.guess || v.phase === "write" || !v.order.includes(v.guess.by)) return null;
  const who = v.guess.by === me ? (zh ? "你" : "You") : nameOf(v.guess.by);
  return (
    <div className={`pi-toast ${v.guess.ok ? "is-ok" : "is-no"}`} ref={ref} role="status">
      <strong>{v.guess.ok ? (zh ? "猜对了！" : "Got it!") : zh ? "不对" : "Nope"}</strong>
      <span>{zh ? `${who} 猜「${v.guess.text}」` : `${who} guessed "${v.guess.text}"`}</span>
    </div>
  );
}

function WritePhase({ v }: { v: PostitView }) {
  const { room, g, nameOf, offset } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const seat = (id: string) => (room?.seats ?? []).find((s) => s.id === id);
  const [text, setText] = useState("");
  const target = v.myTarget;
  const done = !!target && v.written.includes(target);
  const myNote = target ? v.notes[target] : null;
  return (
    <>
      <div className="pl-head">
        <span className="pl-round">{zh ? `${v.written.length}/${v.order.length} 张写好了` : `${v.written.length} of ${v.order.length} notes ready`}</span>
        <TimerArc seconds={75} running endsAt={v.endsAt} offset={offset} size={52} resetKey="write" />
      </div>
      {target && (
        <div className="pi-write">
          <p className="pi-for">
            <SeatFace seat={seat(target)} size={36} />
            <span>{zh ? `给 ${nameOf(target)} 写一张便利贴` : `Write ${nameOf(target)}'s note`}</span>
          </p>
          {done && myNote ? (
            <div className="pi-written">
              <Sticky note={myNote} size="lg" tilt={-3} />
              <p className="hint">{zh ? "贴好了。可以重写，或者随机换一个。" : "Stuck on. Rewrite it, or let the deck pick another."}</p>
            </div>
          ) : (
            <p className="hint">{zh ? "一个人物、动物或东西，大家都知道的那种。别让 TA 看到。" : "A person, an animal or a thing everyone knows. Don't let them see."}</p>
          )}
          <form
            className="pi-note-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              g("write", { text: text.trim() });
              setText("");
              sfx.pop();
            }}
          >
            <input className="pi-note-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={24} placeholder={zh ? "比如：孙悟空" : "e.g. Pikachu"} aria-label={zh ? "便利贴上写什么" : "What the note says"} />
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => g("random")}>
                <Dices size={17} />
                {zh ? "随机来一个" : "Pick for me"}
              </button>
              <button type="submit" className="btn btn-primary btn-block" disabled={!text.trim()}>
                {zh ? "贴上去" : "Stick it on"}
              </button>
            </div>
          </form>
        </div>
      )}
      <HostRow>
        <HostButton onClick={() => g("begin")}>{zh ? "不等了，没写的随机" : "Start now, random for the rest"}</HostButton>
      </HostRow>
    </>
  );
}

function AskPanel({ v }: { v: PostitView }) {
  const { g } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const custom = usePenaltyText().isCustom;
  const [q, setQ] = useState("");
  const [guess, setGuess] = useState("");
  const counts = { yes: 0, no: 0, maybe: 0 } as Record<PostitReply, number>;
  for (const r of Object.values(v.replies)) counts[r]++;
  return (
    <div className="pi-panel">
      {v.final && (
        <p className="pi-last" role="status">
          {zh
            ? `别人都猜出来了，这是你最后一次机会：问完再猜。猜错或放弃，${custom ? "受罚" : "喝一杯"}。`
            : `Everyone else has theirs. This is your last chance: ask, then guess. Miss or give up, and ${custom ? "the penalty is yours" : "it's the full glass"}.`}
        </p>
      )}
      <form
        className="field pi-ask"
        onSubmit={(e) => {
          e.preventDefault();
          // (a second tap on send finds the box empty: the question already asked stays)
          const text = q.trim();
          if (!text) return;
          g("ask", { text });
          setQ("");
          sfx.pop();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder={zh ? "问一个是非题，比如：我是动物吗？" : "Ask yes or no: am I an animal?"} aria-label={zh ? "问题" : "Question"} />
        <button type="submit" className="btn btn-moon btn-sm" aria-label={zh ? "发问" : "Ask"} disabled={!q.trim()}>
          <Send size={15} />
        </button>
      </form>
      {v.asking && <p className="pi-question">{v.asking}</p>}
      <div className="pi-tally">
        {(["yes", "no", "maybe"] as const).map((r) => (
          <span key={r} className={`pi-tally-cell is-${r}`}>
            <strong className="tabular">{counts[r]}</strong>
            {REPLY[r][zh ? 0 : 1]}
          </span>
        ))}
      </div>
      <form
        className="pi-guess"
        onSubmit={(e) => {
          e.preventDefault();
          if (!guess.trim()) return;
          g("guess", { text: guess.trim() });
          setGuess("");
          haptic(10);
        }}
      >
        <div className="field">
          <input value={guess} onChange={(e) => setGuess(e.target.value)} maxLength={40} placeholder={zh ? "我是……" : "I am…"} aria-label={zh ? "猜一下" : "Your guess"} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => g("pass")}>
            {v.final ? (zh ? "放弃" : "Give up") : zh ? "先不猜，下一位" : "Pass for now"}
          </button>
          <button type="submit" className="btn btn-primary btn-block" disabled={!guess.trim()}>
            {zh ? "猜" : "Guess"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReplyPanel({ v }: { v: PostitView }) {
  const { room, me, g, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const my = v.replies[me];
  // (someone just watching hears the question, and leaves the answers to the players)
  const watching = useWatching();
  // what the question is about, beside the answers: at a long table the asker's forehead has
  // scrolled off the top by the time the buttons are in view
  const about = v.notes[v.turn];
  return (
    <div className="pi-panel">
      {about && (
        <p className="pi-about">
          <SeatFace seat={room?.seats.find((s) => s.id === v.turn)} size={28} />
          <span>{zh ? `${nameOf(v.turn)} 额头上是` : `On ${nameOf(v.turn)}'s forehead:`}</span>
          <Sticky note={about} size="chip" />
        </p>
      )}
      {v.asking ? <p className="pi-question">{v.asking}</p> : <Waiting>{zh ? `等 ${nameOf(v.turn)} 提问` : `Waiting for ${nameOf(v.turn)} to ask`}</Waiting>}
      {!watching && v.order.includes(me) && (
        <div className="pi-replies" role="group" aria-label={zh ? "回答" : "Answer"}>
          {(["yes", "no", "maybe"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`pi-reply is-${r}`}
              aria-pressed={my === r}
              onClick={() => {
                g("reply", { r });
                sfx.tap();
                haptic(6);
              }}
            >
              {REPLY[r][zh ? 0 : 1]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
