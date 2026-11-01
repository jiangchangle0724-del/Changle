import { Check, Shuffle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { TITLES } from "../../data/superlatives";
import { GameShell, usePenalty } from "../../games/GameShell";
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

/** One phone: pass it round for a secret ballot, or count fingers and tap the winner. */
export function Superlatives({ onBack }: { onBack: () => void }) {
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const deck = useRef(new Deck<T>(TITLES));
  const [mode, setMode] = useState<Mode>("secret");
  const [total, setTotal] = useState(8);
  const [round, setRound] = useState(1);
  const [title, setTitle] = useState<T>(() => deck.current.draw().card);
  const [phase, setPhase] = useState<Phase>({ k: "setup" });
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [awards, setAwards] = useState<Record<string, T[]>>({});
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  const name = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const face = (id: string) => (size: number) => <NameFace name={name[id] ?? "?"} size={size} />;

  const startRound = () => {
    setVotes({});
    setPicked([]);
    setPhase(mode === "secret" ? { k: "pass", i: 0 } : { k: "point" });
  };

  const reveal = (winners: string[], counts: Record<string, number>) => {
    setAwards((a) => {
      const next = { ...a };
      for (const w of winners) next[w] = [...(next[w] ?? []), title];
      return next;
    });
    setPhase({ k: "reveal", winners, counts });
    window.setTimeout(() => penalty.show({ who: winners.map((w) => name[w]), kind: "sip", note: zh ? title.zh : title.en }), 2900);
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
    if (round >= total) {
      setPhase({ k: "ceremony" });
      sfx.win();
      return;
    }
    setRound((r) => r + 1);
    setTitle(deck.current.draw().card);
    startRound();
  };

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

  return (
    <GameShell title={GAME_BY_ID.superlatives.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
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
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={startRound}>
              {zh ? "开始颁奖" : "Start the awards"}
            </button>
          </div>
        )}

        {(phase.k === "pass" || phase.k === "ballot" || phase.k === "point") && <AwardCard title={title} round={round} total={total} />}

        {phase.k === "pass" && voter && (
          <PassCurtain name={voter.name} note={zh ? `第 ${phase.i + 1} 票，共 ${players.length} 票` : `Vote ${phase.i + 1} of ${players.length}`} onReady={() => setPhase({ k: "ballot", i: phase.i })} />
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
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!picked.length} onClick={() => reveal(picked, Object.fromEntries(picked.map((id) => [id, 1])))}>
              {zh ? "颁奖" : "Give the award"}
            </button>
          </>
        )}

        {phase.k === "reveal" && (
          <>
            <AwardReveal
              title={title}
              winners={phase.winners.map((id) => ({ id, name: name[id], face: face(id), count: phase.counts[id] ?? 0 }))}
              nominees={mode === "secret" ? Object.keys(phase.counts).map((id) => ({ id, name: name[id], face: face(id), count: phase.counts[id] })) : []}
            />
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={next}>
              {round >= total ? (zh ? "开颁奖典礼" : "On to the awards") : zh ? "下一个奖" : "Next award"}
            </button>
          </>
        )}

        {phase.k === "ceremony" && (
          <>
            <Ceremony shelves={players.map((p) => ({ id: p.id, name: p.name, face: face(p.id), awards: awards[p.id] ?? [] }))} />
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={() => {
                setTotal((n) => n + 5);
                setRound((r) => r + 1);
                setTitle(deck.current.draw().card);
                startRound();
              }}
            >
              {zh ? "再来五个奖" : "Five more awards"}
            </button>
          </>
        )}

        {(phase.k === "pass" || phase.k === "point") && Object.keys(votes).length === 0 && (
          <button type="button" className="link-btn sup-skip" onClick={() => setTitle(deck.current.draw().card)}>
            <Shuffle size={14} /> {zh ? "换一个称号" : "A different title"}
          </button>
        )}
      </div>
    </GameShell>
  );
}
