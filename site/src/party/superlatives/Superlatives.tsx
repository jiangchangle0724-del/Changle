import { Check, Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TITLES } from "../../data/superlatives";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import type { PenaltyCall } from "../../components/PenaltyStamp";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import { Deck } from "../../lib/random";
import { haptic, sfx } from "../../lib/sfx";
import { usePenaltyText, useStore } from "../../store";
import { NameFace, PassCurtain } from "../common";
import { AwardCard, AwardReveal, Ceremony } from "./parts";
import "../../styles/party.css";

type Mode = "secret" | "point";
type Phase = { k: "setup" } | { k: "pass"; i: number } | { k: "ballot"; i: number } | { k: "point" } | { k: "reveal"; winners: string[]; counts: Record<string, number> } | { k: "ceremony" };
type Kept = { mode: Mode; total: number; round: number; title: T; phase: Phase; votes: Record<string, string>; picked: string[]; awards: Record<string, T[]>; cards: number[]; paid: boolean; advance: boolean };

/** One phone: pass it round for a secret ballot, or count fingers and tap the winner. */
export function Superlatives({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="superlatives" version={1}>
      {(saved) => <SuperGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function SuperGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const [firstDeck] = useState(() => {
    const deck = new Deck<T>(TITLES);
    if (saved) deck.restore(saved.cards);
    return deck;
  });
  const deck = useRef(firstDeck);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "secret");
  const [total, setTotal] = useState(saved?.total ?? 8);
  const [round, setRound] = useState(saved?.round ?? 1);
  const [title, setTitle] = useState<T>(() => saved?.title ?? deck.current.draw().card);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? { k: "setup" });
  const [votes, setVotes] = useState<Record<string, string>>(saved?.votes ?? {});
  const [picked, setPicked] = useState<string[]>(saved?.picked ?? []);
  const [awards, setAwards] = useState<Record<string, T[]>>(saved?.awards ?? {});
  const [paid, setPaid] = useState(saved?.paid ?? false);
  const [advance, setAdvance] = useState(saved?.advance ?? false);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  const name = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const face = (id: string) => (size: number) => <NameFace name={name[id] ?? "?"} size={size} />;
  // Hide private ballots again; a vote in the 220 ms hand-off already belongs to the next voter.
  const keptPhase: Phase = phase.k === "ballot" ? { k: "pass", i: phase.i + (votes[players[phase.i].id] ? 1 : 0) } : phase;
  useKeepProgress<Kept>({ mode, total, round, title, phase: keptPhase, votes, picked, awards, cards: deck.current.keep(), paid, advance }, phase.k !== "setup" && phase.k !== "ceremony");

  const startRound = () => {
    setPaid(false);
    setAdvance(false);
    setVotes({});
    setPicked([]);
    setPhase(mode === "secret" ? { k: "pass", i: 0 } : { k: "point" });
  };

  /** The winner's stamp, waiting for the reveal to play out (2.9 s). */
  const stamp = useRef<{ timer: number; call: PenaltyCall } | null>(null);
  useEffect(() => () => window.clearTimeout(stamp.current?.timer), []);

  const reveal = (winners: string[], counts: Record<string, number>) => {
    setAwards((a) => {
      const next = { ...a };
      for (const w of winners) next[w] = [...(next[w] ?? []), title];
      return next;
    });
    setPhase({ k: "reveal", winners, counts });
    const call: PenaltyCall = { who: winners.map((w) => name[w]), kind: "sip", note: zh ? title.zh : title.en };
    const timer = window.setTimeout(() => {
      stamp.current = null;
      setPaid(true);
      penalty.show(call);
    }, 2900);
    stamp.current = { timer, call };
  };

  const castVote = (voter: string, target: string) => {
    const next = { ...votes, [voter]: target };
    setVotes(next);
    sfx.tap();
    haptic(8);
    const i = players.findIndex((p) => p.id === voter);
    if (i + 1 < players.length) {
      window.setTimeout(() => setPhase({ k: "pass", i: i + 1 }), 220);
      return;
    }
    const counts: Record<string, number> = {};
    for (const t of Object.values(next)) counts[t] = (counts[t] ?? 0) + 1;
    const top = Math.max(...Object.values(counts));
    reveal(Object.keys(counts).filter((id) => counts[id] === top), counts);
  };

  const next = () => {
    // moving on before the winner's stamp landed: it comes now, and the next award after it
    // (it used to land 2.9 s later on top of the next award's ballot)
    const waiting = stamp.current;
    if (waiting) {
      window.clearTimeout(waiting.timer);
      stamp.current = null;
      setPaid(true);
      setAdvance(true);
      penalty.show(waiting.call, next);
      return;
    }
    setAdvance(false);
    if (round >= total) {
      setPhase({ k: "ceremony" });
      sfx.win();
      return;
    }
    setRound((r) => r + 1);
    setTitle(deck.current.draw().card);
    startRound();
  };

  // Replay only the waiting step, never an award or a penalty that already landed.
  const advanced = useRef(false);
  useEffect(() => {
    if (saved?.advance && saved.paid) {
      if (advanced.current) return;
      advanced.current = true;
      next();
    } else if (saved?.phase.k === "reveal" && !saved.paid) {
      const call: PenaltyCall = { who: saved.phase.winners.map((id) => name[id]), kind: "sip", note: zh ? title.zh : title.en };
      const timer = window.setTimeout(() => {
        stamp.current = null;
        setPaid(true);
        penalty.show(call);
      }, 2900);
      stamp.current = { timer, call };
    }
    // The restored reveal is initialized once; later reveals schedule their own stamp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rules = (
    <p>
      {custom
        ? zh
          ? "每轮一个称号。传手机投票：手机依次传给每个人，偷偷投给最配这个称号的人（不能投自己），全部投完揭晓。一起指：数到三大家同时指人，点一下被指最多的人。拿奖的人受罚，平票一起受罚。最后开颁奖典礼。"
          : "One award a round. Secret ballot: pass the phone round and everyone votes in private (not for themselves); the reveal comes when the last vote is in. Point together: count to three, everyone points, then tap whoever got the most fingers. The winner takes the penalty; ties all take it. An awards ceremony at the end."
        : zh
          ? "每轮一个称号。传手机投票：手机依次传给每个人，偷偷投给最配这个称号的人（不能投自己），全部投完揭晓。一起指：数到三大家同时指人，点一下被指最多的人。拿奖的人喝一口，平票一起喝。最后开颁奖典礼。"
          : "One award a round. Secret ballot: pass the phone round and everyone votes in private (not for themselves); the reveal comes when the last vote is in. Point together: count to three, everyone points, then tap whoever got the most fingers. The winner drinks; ties all drink. An awards ceremony at the end."}
    </p>
  );

  const voter = phase.k === "pass" || phase.k === "ballot" ? players[phase.i] : null;

  const actions =
    phase.k === "setup" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={startRound}>
        {zh ? "开始颁奖" : "Start the awards"}
      </button>
    ) : phase.k === "pass" && voter ? (
      <>
        {Object.keys(votes).length === 0 && (
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => setTitle(deck.current.draw().card)}>
            <Shuffle size={14} /> {zh ? "换一个称号" : "A different title"}
          </button>
        )}
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase({ k: "ballot", i: phase.i })}>
          {zh ? `我是 ${voter.name}` : `I'm ${voter.name}`}
        </button>
      </>
    ) : phase.k === "point" ? (
      <>
        {Object.keys(votes).length === 0 && (
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => setTitle(deck.current.draw().card)}>
            <Shuffle size={14} /> {zh ? "换一个称号" : "A different title"}
          </button>
        )}
        <button type="button" className="btn btn-primary btn-lg" disabled={!picked.length} onClick={() => reveal(picked, Object.fromEntries(picked.map((id) => [id, 1])))}>
          {zh ? "颁奖" : "Give the award"}
        </button>
      </>
    ) : phase.k === "reveal" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={next}>
        {round >= total ? (zh ? "开颁奖典礼" : "On to the awards") : zh ? "下一个奖" : "Next award"}
      </button>
    ) : phase.k === "ceremony" ? (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => {
          setTotal((n) => n + 5);
          setRound((r) => r + 1);
          setTitle(deck.current.draw().card);
          startRound();
        }}
      >
        {zh ? "再来五个奖" : "Five more awards"}
      </button>
    ) : undefined;

  return (
    <GameShell title={GAME_BY_ID.superlatives.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ turn: voter?.id }} status={{ kind: "round", current: phase.k === "setup" ? 1 : round, total }} actions={actions}>
      <div className="sup">
        {phase.k === "setup" && (
          <div className="stack" style={{ gap: 16 }}>
            <AwardCard title={title} round={1} total={total} />
            <div className="panel setup-panel">
              <span className="field-label">{zh ? "怎么投票" : "How to vote"}</span>
              <div className="seg" role="group">
                <button type="button" aria-pressed={mode === "secret"} onClick={() => setMode("secret")}>
                  {zh ? "传手机投票" : "Secret ballot"}
                </button>
                <button type="button" aria-pressed={mode === "point"} onClick={() => setMode("point")}>
                  {zh ? "一起指" : "Point together"}
                </button>
              </div>
              <span className="field-label">{zh ? "几个奖" : "How many awards"}</span>
              <div className="seg" role="group">
                {[5, 8, 12].map((n) => (
                  <button key={n} type="button" aria-pressed={total === n} onClick={() => setTotal(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {(phase.k === "pass" || phase.k === "ballot" || phase.k === "point") && <AwardCard title={title} round={round} total={total} />}

        {phase.k === "pass" && voter && (
          <PassCurtain name={voter.name} note={zh ? `第 ${phase.i + 1} 票，共 ${players.length} 票` : `Vote ${phase.i + 1} of ${players.length}`} />
        )}

        {phase.k === "ballot" && voter && (
          <>
            <p className="sup-ask">{zh ? `${voter.name}，这个奖给谁？` : `${voter.name}, who gets it?`}</p>
            <div className="ballot">
              {players
                .filter((p) => p.id !== voter.id)
                .map((p) => (
                  <button key={p.id} type="button" className="nominee" onClick={() => castVote(voter.id, p.id)}>
                    <span className="nominee-face">
                      <NameFace name={p.name} size={58} />
                    </span>
                    <span className="nominee-name">{p.name}</span>
                  </button>
                ))}
            </div>
          </>
        )}

        {phase.k === "point" && (
          <>
            <p className="sup-ask">{zh ? "数到三，一起指！被指最多的是谁？" : "Count to three and point! Who got the most fingers?"}</p>
            <div className="ballot">
              {players.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <button key={p.id} type="button" className={`nominee ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => setPicked((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))}>
                    <span className="nominee-face">
                      <NameFace name={p.name} size={58} />
                      {on && (
                        <span className="nominee-check" aria-hidden="true">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="nominee-name">{p.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="hint" style={{ textAlign: "center" }}>
              {zh ? "平票就多选几个" : "A tie? Pick them all."}
            </p>
          </>
        )}

        {phase.k === "reveal" && (
          <>
            <AwardReveal
              title={title}
              winners={phase.winners.map((id) => ({ id, name: name[id], face: face(id), count: phase.counts[id] ?? 0 }))}
              nominees={mode === "secret" ? Object.keys(phase.counts).map((id) => ({ id, name: name[id], face: face(id), count: phase.counts[id] })) : []}
            />
          </>
        )}

        {phase.k === "ceremony" && (
          <>
            <Ceremony shelves={players.map((p) => ({ id: p.id, name: p.name, face: face(p.id), awards: awards[p.id] ?? [] }))} />
          </>
        )}

      </div>
    </GameShell>
  );
}

