import { Check, ImageDown, PenLine, Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PACKS, deckFor, PACKS, TITLES, type Pack } from "../../data/superlatives";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import type { PenaltyCall } from "../../components/PenaltyStamp";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import { Deck } from "../../lib/random";
import { haptic, sfx } from "../../lib/sfx";
import { usePenaltyText, useStore } from "../../store";
import { NameFace, PassCurtain } from "../common";
import { flavorOf, mindReader } from "./flavor";
import { useFreshTapGuard, useTopOfMoment } from "./moment";
import { posterOf } from "./poster";
import { AV_COLORS, colorFor } from "../../account/Avatar";
import { PosterSheet } from "./PosterSheet";
import { AwardCard, AwardReveal, Ceremony, PackChips } from "./parts";
import "../../styles/party.css";

/** the drum roll plays out, then the winner's stamp; the trophies come out, then the table's toast */
const STAMP_MS = 2900;
const TOAST_MS = 3200;

type Mode = "secret" | "point";
type Phase = { k: "setup" } | { k: "pass"; i: number } | { k: "ballot"; i: number } | { k: "point" } | { k: "reveal"; winners: string[]; counts: Record<string, number> } | { k: "ceremony" };
type Kept = { mode: Mode; total: number; round: number; title: T; written?: boolean; packs?: Pack[]; hits?: Record<string, number>; streak?: { id: string; n: number } | null; phase: Phase; votes: Record<string, string>; picked: string[]; awards: Record<string, T[]>; cards: number[]; paid: boolean; advance: boolean };

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
  // the packs of titles in play (a game saved before the packs was dealt from every title, by place)
  const [packs, setPacks] = useState<Pack[]>(saved ? (saved.packs ?? [...PACKS]) : DEFAULT_PACKS);
  const [firstDeck] = useState(() => {
    const deck = new Deck<T>(deckFor(packs).map((i) => TITLES[i]));
    if (saved) deck.restore(saved.cards);
    return deck;
  });
  const deck = useRef(firstDeck);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "secret");
  const [total, setTotal] = useState(saved?.total ?? 8);
  const [round, setRound] = useState(saved?.round ?? 1);
  const [title, setTitle] = useState<T>(() => saved?.title ?? deck.current.draw().card);
  // (a title the table wrote itself, as the host can at an online table: shown in one language, not two)
  const [written, setWritten] = useState(saved?.written ?? false);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? { k: "setup" });
  const [votes, setVotes] = useState<Record<string, string>>(saved?.votes ?? {});
  // the voter's pick on the ballot, until "done": a slip of the thumb can still be moved
  const [pick, setPick] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(saved?.picked ?? []);
  const [awards, setAwards] = useState<Record<string, T[]>>(saved?.awards ?? {});
  // who voted with the room how often (the mind reader of the night), and the same winner again and again
  const [hits, setHits] = useState<Record<string, number>>(saved?.hits ?? {});
  const [streak, setStreak] = useState<{ id: string; n: number } | null>(saved?.streak ?? null);
  const [paid, setPaid] = useState(saved?.paid ?? false);
  const [poster, setPoster] = useState(false);
  const [advance, setAdvance] = useState(saved?.advance ?? false);
  const penalty = usePenalty();
  const pen = usePenaltyText();
  const ownPenalty = pen.isCustom;
  const name = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const face = (id: string) => (size: number) => <NameFace name={name[id] ?? "?"} size={size} />;
  // Hide private ballots again: a game picked up later starts that voter at the hand-over.
  const keptPhase: Phase = phase.k === "ballot" ? { k: "pass", i: phase.i } : phase;
  useKeepProgress<Kept>({ mode, total, round, title, written, packs, hits, streak, phase: keptPhase, votes, picked, awards, cards: deck.current.keep(), paid, advance }, phase.k !== "setup" && phase.k !== "ceremony");

  // each moment of the game starts at the top of the screen, and its first 350 ms belong to the moment before
  const moment = phase.k === "pass" || phase.k === "ballot" ? `${phase.k}:${phase.i}` : phase.k;
  const body = useRef<HTMLDivElement>(null);
  useTopOfMoment(moment, body);
  const { fresh, guard } = useFreshTapGuard(moment);

  const startRound = () => {
    setPaid(false);
    setAdvance(false);
    setVotes({});
    setPick(null);
    setPicked([]);
    setPhase(mode === "secret" ? { k: "pass", i: 0 } : { k: "point" });
  };

  /** Other packs at the setup: a new deck from them, and a new first title on the card. */
  const pickPacks = (next: Pack[]) => {
    setPacks(next);
    deck.current = new Deck<T>(deckFor(next).map((i) => TITLES[i]));
    setTitle(deck.current.draw().card);
  };

  /** The next title from the deck (fingers already counted for the old one don't carry over). */
  const draw = () => {
    setTitle(deck.current.draw().card);
    setWritten(false);
    setWriting(false);
    setPicked([]);
  };

  /** A title of the table's own, in place of the one drawn. */
  const write = (t: string) => {
    setTitle({ zh: t, en: t });
    setWritten(true);
    setWriting(false);
    setText("");
    setPicked([]);
  };

  /** The moment's stamp, waiting for it to play out: the winner's sip after the reveal, the table's toast at the ceremony. */
  const stamp = useRef<{ timer: number; call: PenaltyCall } | null>(null);
  useEffect(() => () => window.clearTimeout(stamp.current?.timer), []);
  const stampLater = (call: PenaltyCall, ms: number) => {
    const timer = window.setTimeout(() => {
      stamp.current = null;
      setPaid(true);
      penalty.show(call);
    }, ms);
    stamp.current = { timer, call };
  };
  /**
   * Moving on before the stamp landed: it comes now, and `then` after it (it used to land 2.9 s
   * later on top of the next award's ballot). True when there was one waiting.
   */
  const stampFirst = (then: () => void) => {
    const waiting = stamp.current;
    if (!waiting) return false;
    window.clearTimeout(waiting.timer);
    stamp.current = null;
    setPaid(true);
    setAdvance(true);
    penalty.show(waiting.call, then);
    return true;
  };

  const reveal = (winners: string[], counts: Record<string, number>, ballots: Record<string, string> = votes) => {
    setAwards((a) => {
      const next = { ...a };
      for (const w of winners) next[w] = [...(next[w] ?? []), title];
      return next;
    });
    // (pointing together casts no ballots: the mind reader is a secret-ballot thing)
    setHits((h) => {
      const next = { ...h };
      for (const [voter, target] of Object.entries(ballots)) if (winners.includes(target)) next[voter] = (next[voter] ?? 0) + 1;
      return next;
    });
    const one = winners.length === 1 ? winners[0] : null;
    setStreak((st) => (one ? { id: one, n: st?.id === one ? st.n + 1 : 1 } : null));
    setPhase({ k: "reveal", winners, counts });
    stampLater({ who: winners.map((w) => name[w]), kind: "sip", note: zh ? title.zh : title.en }, STAMP_MS);
  };

  /** The ceremony's toast for the whole table, as at an online table. */
  const toast = (): PenaltyCall => ({ who: [], kind: "everyone", note: pen.line({ zh: "颁奖典礼，全场干杯", en: "Awards night: everyone drinks" }, { zh: "颁奖典礼，全场一起来", en: "Awards night: everyone joins in" }) });

  /** The voter's pick is in: the phone goes to the next voter, or the last vote opens the envelope. */
  const castVote = (voter: string, target: string) => {
    const next = { ...votes, [voter]: target };
    setVotes(next);
    setPick(null);
    const i = players.findIndex((p) => p.id === voter);
    if (i + 1 < players.length) {
      setPhase({ k: "pass", i: i + 1 });
      return;
    }
    const counts: Record<string, number> = {};
    for (const t of Object.values(next)) counts[t] = (counts[t] ?? 0) + 1;
    const top = Math.max(...Object.values(counts));
    reveal(Object.keys(counts).filter((id) => counts[id] === top), counts, next);
  };

  const next = () => {
    if (stampFirst(next)) return;
    setAdvance(false);
    if (round >= total) {
      setPhase({ k: "ceremony" });
      sfx.win();
      stampLater(toast(), TOAST_MS);
      return;
    }
    setRound((r) => r + 1);
    draw();
    startRound();
  };

  const more = () => {
    if (stampFirst(more)) return;
    setAdvance(false);
    setTotal((n) => n + 5);
    setRound((r) => r + 1);
    draw();
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
      stampLater({ who: saved.phase.winners.map((id) => name[id]), kind: "sip", note: zh ? title.zh : title.en }, STAMP_MS);
    }
    // The restored reveal is initialized once; later reveals schedule their own stamp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rules = (
    <p>
      {ownPenalty
        ? zh
          ? "每轮一个称号。传手机投票：手机依次传给每个人，偷偷投给最配这个称号的人（不能投自己），全部投完揭晓。一起指：数到三大家同时指人，点一下被指最多的人。拿奖的人受罚，平票一起受罚。最后开颁奖典礼。称号不合适可以换一个，也可以自己出。"
          : "One award a round. Secret ballot: pass the phone round and everyone votes in private (not for themselves); the reveal comes when the last vote is in. Point together: count to three, everyone points, then tap whoever got the most fingers. The winner takes the penalty; ties all take it. An awards ceremony at the end. Swap a title that doesn't fit, or write your own."
        : zh
          ? "每轮一个称号。传手机投票：手机依次传给每个人，偷偷投给最配这个称号的人（不能投自己），全部投完揭晓。一起指：数到三大家同时指人，点一下被指最多的人。拿奖的人喝一口，平票一起喝。最后开颁奖典礼。称号不合适可以换一个，也可以自己出。"
          : "One award a round. Secret ballot: pass the phone round and everyone votes in private (not for themselves); the reveal comes when the last vote is in. Point together: count to three, everyone points, then tap whoever got the most fingers. The winner drinks; ties all drink. An awards ceremony at the end. Swap a title that doesn't fit, or write your own."}
    </p>
  );

  const voter = phase.k === "pass" || phase.k === "ballot" ? players[phase.i] : null;
  const lastVoter = phase.k === "ballot" && phase.i + 1 >= players.length;
  // the title can still change until the first vote is in (or, pointing together, until the award)
  const titleOpen = (phase.k === "pass" && Object.keys(votes).length === 0) || phase.k === "point";

  // (every button here is guarded: the slot keeps its place from one moment to the next, and a
  // quick second tap meant for the button before must not press the one that took its place)
  const actions =
    phase.k === "setup" ? (
      <button type="button" className="btn btn-primary btn-lg" aria-disabled={fresh} onClick={guard(startRound)}>
        {zh ? "开始颁奖" : "Start the awards"}
      </button>
    ) : phase.k === "pass" && voter ? (
      <button type="button" className="btn btn-primary btn-lg" aria-disabled={fresh} onClick={guard(() => setPhase({ k: "ballot", i: phase.i }))}>
        {zh ? `我是 ${voter.name}` : `I'm ${voter.name}`}
      </button>
    ) : phase.k === "ballot" && voter ? (
      <button type="button" className="btn btn-primary btn-lg" disabled={!pick} aria-disabled={fresh} onClick={guard(() => pick && castVote(voter.id, pick))}>
        {lastVoter ? (zh ? "投好了，揭晓" : "Done. Reveal") : zh ? "投好了，交给下一位" : "Done. Pass it on"}
      </button>
    ) : phase.k === "point" ? (
      <button type="button" className="btn btn-primary btn-lg" disabled={!picked.length} aria-disabled={fresh} onClick={guard(() => reveal(picked, Object.fromEntries(picked.map((id) => [id, 1])), {}))}>
        {zh ? "颁奖" : "Give the award"}
      </button>
    ) : phase.k === "reveal" ? (
      <button type="button" className="btn btn-primary btn-lg" aria-disabled={fresh} onClick={guard(next)}>
        {round >= total ? (zh ? "开颁奖典礼" : "On to the awards") : zh ? "下一个奖" : "Next award"}
      </button>
    ) : phase.k === "ceremony" ? (
      <button type="button" className="btn btn-primary btn-lg" aria-disabled={fresh} onClick={guard(more)}>
        {zh ? "再来五个奖" : "Five more awards"}
      </button>
    ) : undefined;

  return (
    <GameShell title={GAME_BY_ID.superlatives.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ turn: voter?.id }} status={{ kind: "round", current: phase.k === "setup" ? 1 : round, total }} actions={actions}>
      <div className="sup" ref={body}>
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
              <span className="field-label">{zh ? "题库" : "Title packs"}</span>
              <PackChips picked={packs} onChange={pickPacks} />
            </div>
          </div>
        )}

        {(phase.k === "pass" || phase.k === "ballot" || phase.k === "point") && <AwardCard title={title} round={round} total={total} custom={written} />}

        {/* swap the title or write one, as the host can online: under the card, until the first vote */}
        {titleOpen && (
          <div className="sup-tools">
            <button type="button" className="btn btn-ghost btn-sm" onClick={draw}>
              <Shuffle size={14} />
              {zh ? "换一个" : "Another one"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={writing} onClick={() => setWriting((w) => !w)}>
              <PenLine size={14} />
              {zh ? "自己出" : "Write one"}
            </button>
          </div>
        )}
        {titleOpen && writing && (
          <form
            className="field sup-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) write(text.trim());
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={30} aria-label={zh ? "自己出一个称号" : "Your own title"} placeholder={zh ? "比如：今晚最会点歌" : "e.g. Best playlist tonight"} autoFocus />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!text.trim()}>
              {zh ? "用这个" : "Use it"}
            </button>
          </form>
        )}

        {phase.k === "pass" && voter && (
          <PassCurtain name={voter.name} note={zh ? `第 ${phase.i + 1} 票，共 ${players.length} 票` : `Vote ${phase.i + 1} of ${players.length}`} />
        )}

        {phase.k === "ballot" && voter && (
          <>
            <p className="sup-ask">{pick ? (zh ? `投给 ${name[pick]}，点别人还能改` : `${name[pick]} it is. Tap someone else to change it.`) : zh ? `${voter.name}，这个奖给谁？` : `${voter.name}, who gets it?`}</p>
            <div className="ballot">
              {players
                .filter((p) => p.id !== voter.id)
                .map((p) => {
                  const on = pick === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`nominee ${on ? "is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => {
                        setPick(p.id);
                        sfx.tap();
                        haptic(8);
                      }}
                    >
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
              flavor={flavorOf({ winners: phase.winners, counts: phase.counts, voted: mode === "secret" ? Object.keys(votes) : [], streak: streak?.n ?? 0, name: (id) => name[id] ?? "?" })}
            />
          </>
        )}

        {phase.k === "ceremony" && (
          <>
            <Ceremony
              shelves={players.map((p) => ({ id: p.id, name: p.name, face: face(p.id), awards: awards[p.id] ?? [] }))}
              mind={(() => {
                const m = mindReader(hits, round);
                return m && { names: m.ids.map((id) => name[id] ?? "?"), hits: m.hits, of: m.of };
              })()}
            />
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setPoster(true)}>
              <ImageDown size={16} />
              {zh ? "颁奖海报" : "The awards poster"}
            </button>
            <PosterSheet open={poster} onClose={() => setPoster(false)} poster={() => posterOf({ lang: zh ? "zh" : "en", people: players.map((p) => ({ id: p.id, name: p.name, color: AV_COLORS[colorFor(p.name)] })), awards, hits, round })} />
          </>
        )}

      </div>
    </GameShell>
  );
}

