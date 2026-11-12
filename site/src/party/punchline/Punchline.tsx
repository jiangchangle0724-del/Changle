import { PunchAction, PunchActionHost } from "./ShellActions";
import { Hand, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PUNCH_FINAL, PUNCH_PROMPTS, PUNCH_SAFETY } from "../../data/punchline";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import type { PenaltyCall } from "../../components/PenaltyStamp";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import { Deck, shuffle } from "../../lib/random";
import { holdBackground } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import type { PunchMatch, PunchView } from "../../shared/protocol";
import { countWriters, finalPoints, headToHeadPoints, MAX_WRITERS, nextWriters, presentMs, ROUNDS } from "../../shared/punchline";
import { usePenaltyText, useStore, type Player } from "../../store";
import { NameFace, PassCurtain } from "../common";
import { useWakeLock } from "../sensors";
import { PromptCard } from "./parts";
import { Stage, type Who } from "./show/Stage";
import "../../styles/party.css";

/** One matchup on this phone: who wrote it, what they wrote, and how the hands went. */
type LMatch = {
  prompt: T;
  authors: string[];
  answers: string[];
  safety: boolean[];
  /** display order: order[slot] is the author index shown in that slot */
  order: number[];
  counts: number[];
  points: number[];
  sweep: number | null;
};
type Step = "present" | "vote" | "result";
type Phase =
  | { k: "setup" }
  | { k: "pass"; i: number }
  | { k: "write"; i: number }
  | { k: "show"; m: number; step: Step; at: number }
  | { k: "scores"; at: number }
  | { k: "end"; at: number; winners: string[]; last: string[] };
type Draft = { texts: Record<number, string>; safe: Record<number, boolean> };
type Pending = { call: PenaltyCall; ms: number };
type Kept = { round: number; order: Player[]; matches: LMatch[]; phase: Phase; scores: Record<string, number>; before: Record<string, number>; tally: number[]; drafts: Record<string, Draft>; cards: number[]; finals: number[]; quips: number[]; pending: Pending | null; advancing: boolean; writers?: string[]; written?: Record<string, number> };

const SIDE = ["#e765f0", "#31b9ff"];
const FINAL_COLORS = ["#e765f0", "#31b9ff", "#ffb82e", "#4be38f", "#ff6b5e", "#8c86ff", "#2ed3d9", "#f5df3b"];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * One phone for the whole table. The phone goes round and everyone writes in private; then the
 * phone plays the same show the TV does (the prompt, the answers, the reveal, the score race),
 * and the table votes by show of hands while someone counts on the phone.
 */
export function Punchline({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="punchline" version={1}>
      {(saved) => <PunchGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function PunchGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, lang, sound } = useStore();
  const zh = lang === "zh";
  const [firstDecks] = useState(() => {
    const deck = new Deck<T>(PUNCH_PROMPTS), finals = new Deck<T>(PUNCH_FINAL), quips = new Deck<T>(PUNCH_SAFETY);
    if (saved) { deck.restore(saved.cards); finals.restore(saved.finals); quips.restore(saved.quips); }
    return { deck, finals, quips };
  });
  const deck = useRef(firstDecks.deck);
  const finals = useRef(firstDecks.finals);
  const quips = useRef(firstDecks.quips);
  // up to eight write; anyone else at the table is the audience, votes, and writes first next game
  // (before the first game, simply the first eight of the list, which can still change)
  const [writerIds, setWriterIds] = useState<string[] | null>(() => saved?.writers ?? saved?.order.map((p) => p.id) ?? null);
  const [written, setWritten] = useState<Record<string, number>>(saved?.written ?? {});
  const writers = useMemo(() => {
    const picked = writerIds ? players.filter((p) => writerIds.includes(p.id)) : [];
    return picked.length ? picked : players.slice(0, MAX_WRITERS);
  }, [players, writerIds]);
  const audience = useMemo(() => players.filter((p) => !writers.includes(p)), [players, writers]);
  /** A game starts with these writers (in list order), counted for who writes the one after. */
  const deal = (ids: string[], before: Record<string, number>) => {
    setWriterIds(ids);
    setWritten(countWriters(before, ids));
    setScores({});
    startRound(1, {}, players.filter((p) => ids.includes(p.id)));
  };
  const [round, setRound] = useState(saved?.round ?? 1);
  const [order, setOrder] = useState<Player[]>(saved?.order ?? writers);
  const [roundAt, setRoundAt] = useState(() => saved ? Date.now() : 0);
  const [matches, setMatches] = useState<LMatch[]>(saved?.matches ?? []);
  const [phase, setPhase] = useState<Phase>(() => saved ? ("at" in saved.phase ? { ...saved.phase, at: Date.now() } : saved.phase) : { k: "setup" });
  const [scores, setScores] = useState<Record<string, number>>(saved?.scores ?? {});
  const [before, setBefore] = useState<Record<string, number>>(saved?.before ?? {});
  const [tally, setTally] = useState<number[]>(saved?.tally ?? []);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(saved?.drafts ?? {});
  const [pending, setPending] = useState<Pending | null>(saved?.pending ?? null);
  const [advancing, setAdvancing] = useState(saved?.advancing ?? false);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  const final = round >= ROUNDS;
  const playing = phase.k !== "setup";
  useWakeLock(playing);
  // the show has its own music: keep the lounge loop off for the whole game, not just while the stage is up
  useEffect(() => (playing && sound ? holdBackground() : undefined), [playing, sound]);
  const name = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);

  const who: Who = useCallback(
    (pid: string) => {
      if (pid.startsWith("hand:")) return { name: "", face: (size: number) => <HandFace size={size} /> };
      const n = name[pid] ?? "?";
      return { name: n, face: (size: number) => <NameFace name={n} size={size} /> };
    },
    [name],
  );

  const startRound = (r: number, from: Record<string, number>, who: Player[] = writers) => {
    setDrafts({});
    const ord = shuffle(who);
    const n = ord.length;
    const blank = (prompt: T, authors: string[]): LMatch => ({
      prompt,
      authors,
      answers: authors.map(() => ""),
      safety: authors.map(() => false),
      order: shuffle(range(authors.length)),
      counts: authors.map(() => 0),
      points: authors.map(() => 0),
      sweep: null,
    });
    const ms = r < ROUNDS ? ord.map((_, k) => blank(deck.current.draw().card, [ord[k].id, ord[(k + 1) % n].id])) : [blank(finals.current.draw().card, ord.map((p) => p.id))];
    setRound(r);
    setOrder(ord);
    setMatches(ms);
    setBefore(from);
    setRoundAt(Date.now());
    setPhase({ k: "pass", i: 0 });
  };

  const mineIn = (pid: string) => matches.map((m, k) => ({ m, k })).filter(({ m }) => m.authors.includes(pid));

  const submit = (pid: string, texts: Record<number, { text: string; safety: boolean }>) => {
    setDrafts((d) => { const next = { ...d }; delete next[pid]; return next; });
    const next = matches.map((m, k) => {
      const t = texts[k];
      if (!t) return m;
      const i = m.authors.indexOf(pid);
      return { ...m, answers: m.answers.map((a, j) => (j === i ? t.text : a)), safety: m.safety.map((s, j) => (j === i ? t.safety : s)) };
    });
    setMatches(next);
    const i = order.findIndex((p) => p.id === pid);
    sfx.pop();
    if (i + 1 < order.length) setPhase({ k: "pass", i: i + 1 });
    else openShow(0, next);
  };

  const openShow = (m: number, ms = matches) => {
    setTally(range(ms[m].answers.length).map(() => 0));
    setPhase({ k: "show", m, step: "present", at: Date.now() });
  };

  // the answers go up one by one; then the vote opens by itself
  const showKey = phase.k === "show" && phase.step === "present" ? phase.at : 0;
  useEffect(() => {
    if (!showKey || phase.k !== "show") return;
    const ms = presentMs(matches[phase.m].answers.length, final);
    const id = window.setTimeout(() => setPhase((p) => (p.k === "show" && p.at === showKey ? { ...p, step: "vote", at: Date.now() } : p)), ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKey]);

  /**
   * A stamp that waits for the show to play out (the vote reveal, the final standings). Moving on
   * before it lands brings it first, then goes on: it used to land seconds later on top of the
   * next prompt, or of the next game.
   */
  const stamp = useRef<{ timer: number; call: PenaltyCall } | null>(null);
  useEffect(() => () => window.clearTimeout(stamp.current?.timer), []);
  const later = (call: PenaltyCall, ms: number) => {
    setPending({ call, ms });
    window.clearTimeout(stamp.current?.timer);
    const timer = window.setTimeout(() => {
      stamp.current = null;
      setPending(null);
      penalty.show(call);
    }, ms);
    stamp.current = { timer, call };
  };
  const stampFirst = (then: () => void, advance = false) => {
    const waiting = stamp.current;
    if (!waiting) return false;
    window.clearTimeout(waiting.timer);
    stamp.current = null;
    setPending(null);
    setAdvancing(advance);
    penalty.show(waiting.call, () => { setAdvancing(false); then(); });
    return true;
  };

  const reveal = () => {
    if (phase.k !== "show") return;
    const mi = phase.m;
    const m = matches[mi];
    const counts = m.authors.map(() => 0);
    m.order.forEach((ai, slot) => (counts[ai] = tally[slot] ?? 0));
    let points: number[];
    let sweep: number | null = null;
    if (final) points = finalPoints(counts, m.safety);
    else {
      const r = headToHeadPoints(counts, round, m.safety);
      points = r.points;
      sweep = r.sweep >= 0 ? r.sweep : null;
      if (r.winner >= 0) {
        const loser = m.authors[1 - r.winner];
        later({
          who: [name[loser]],
          kind: sweep !== null ? "two" : "sip",
          note:
            sweep !== null
              ? zh
                ? "神回复：一票都没有"
                : "Punchline: not a single vote"
              : custom
                ? zh
                  ? "神回复：票少的受罚"
                  : "Punchline: fewer votes takes the penalty"
                : zh
                  ? "神回复：票少的喝"
                  : "Punchline: fewer votes drinks",
        }, 5200);
      }
    }
    setMatches((ms) => ms.map((x, k) => (k === mi ? { ...x, counts, points, sweep } : x)));
    setScores((s) => {
      const next = { ...s };
      m.authors.forEach((pid, i) => (next[pid] = (next[pid] ?? 0) + points[i]));
      return next;
    });
    setPhase({ k: "show", m: mi, step: "result", at: Date.now() });
    haptic(12);
  };

  const afterResult = () => {
    if (phase.k !== "show") return;
    if (stampFirst(afterResult, true)) return;
    if (phase.m + 1 < matches.length) return openShow(phase.m + 1);
    if (!final) return setPhase({ k: "scores", at: Date.now() });
    const vals = writers.map((p) => scores[p.id] ?? 0);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    const winners = writers.filter((p) => (scores[p.id] ?? 0) === hi).map((p) => p.id);
    const last = lo < hi ? writers.filter((p) => (scores[p.id] ?? 0) === lo).map((p) => p.id) : [];
    setPhase({ k: "end", at: Date.now(), winners, last });
    if (last.length) later({ who: last.map((id) => name[id]), kind: "full", note: zh ? "神回复：最后一名" : "Punchline: last place" }, 6500);
  };

  const continued = useRef(false);
  useEffect(() => {
    if (saved?.advancing && !continued.current) {
      continued.current = true;
      setAdvancing(false);
      afterResult();
    } else if (saved?.pending) later(saved.pending.call, saved.pending.ms);
    // The restored show restarts its wait, but scores and landed penalties never replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rules = (
    <p>
      {custom
        ? zh
          ? "前两轮：手机传一圈，每人偷偷写两道题的答案（每道题有两个人写）。然后手机上一题一题亮出来，不显示是谁写的，没写这题的人举手投票，一个人在手机上数票。每道题按票数比例分 1000 分，赢的多拿 100，拿走所有票就是神回复，再加 250，第二轮翻倍。输的人受罚。最后一轮所有人写同一道题，每人举手选三个，按票数分 4000 分，总分最低的受罚。"
          : "Rounds one and two: the phone goes round and everyone privately answers two prompts (each prompt has two writers). Then the phone shows them one at a time, without names; everyone who didn't write that one votes by show of hands, and one person counts on the phone. Each prompt splits 1,000 points by votes, plus 100 for the winner; take every vote for a Punchline, 250 more. Round two doubles everything. The loser takes the penalty. Final round: everyone answers one prompt and raises a hand for three favorites, 4,000 points split by votes. Lowest total takes the penalty."
        : zh
          ? "前两轮：手机传一圈，每人偷偷写两道题的答案（每道题有两个人写）。然后手机上一题一题亮出来，不显示是谁写的，没写这题的人举手投票，一个人在手机上数票。每道题按票数比例分 1000 分，赢的多拿 100，拿走所有票就是神回复，再加 250，第二轮翻倍。输的人喝一口，被神回复的喝两口。最后一轮所有人写同一道题，每人举手选三个，按票数分 4000 分，总分最低的喝一杯。"
          : "Rounds one and two: the phone goes round and everyone privately answers two prompts (each prompt has two writers). Then the phone shows them one at a time, without names; everyone who didn't write that one votes by show of hands, and one person counts on the phone. Each prompt splits 1,000 points by votes, plus 100 for the winner; take every vote for a Punchline, 250 more. Round two doubles everything. The loser drinks a sip, two if swept. Final round: everyone answers one prompt and raises a hand for three favorites, 4,000 points split by votes. Lowest total drinks a full glass."}
    </p>
  );

  // what the show draws right now
  const v: PunchView | null = useMemo(() => {
    const ids = writers.map((p) => p.id);
    const base = {
      id: "punchline" as const,
      round,
      rounds: ROUNDS,
      endsAt: 0,
      step: 0,
      players: ids,
      audience: audience.map((p) => p.id),
      mine: [],
      writing: [] as string[],
      match: null as PunchMatch | null,
      scores: Object.fromEntries(ids.map((id) => [id, scores[id] ?? 0])),
      before: Object.fromEntries(ids.map((id) => [id, before[id] ?? 0])),
      winners: null as string[] | null,
      last: null as string[] | null,
    };
    if (phase.k === "pass") return { ...base, phase: "write", phaseAt: roundAt, writing: order.slice(phase.i).map((p) => p.id) };
    if (phase.k === "scores") return { ...base, phase: "scores", phaseAt: phase.at };
    if (phase.k === "end") return { ...base, phase: "end", phaseAt: phase.at, winners: phase.winners, last: phase.last };
    if (phase.k !== "show") return null;
    const m = matches[phase.m];
    const shown = phase.step === "result";
    return {
      ...base,
      phase: phase.step,
      phaseAt: phase.at,
      match: {
        k: phase.m,
        n: phase.m + 1,
        of: matches.length,
        final,
        prompt: m.prompt,
        answers: m.order.map((ai, slot) => ({
          text: m.answers[ai],
          by: shown ? m.authors[ai] : null,
          votes: shown ? m.counts[ai] : null,
          voters: shown ? range(m.counts[ai]).map((j) => `hand:${slot}:${j}`) : null,
          points: shown ? m.points[ai] : null,
          safety: shown ? m.safety[ai] : null,
        })),
        canVote: false,
        maxVotes: 0,
        myVotes: [],
        mine: null,
        voted: [],
        voters: 0,
        sweep: shown && m.sweep !== null ? m.order.indexOf(m.sweep) : null,
        forfeit: false,
      },
    };
  }, [phase, matches, order, roundAt, round, final, scores, before, writers, audience]);

  const writer = phase.k === "pass" || phase.k === "write" ? order[phase.i] : null;
  const show = v && <Stage v={v} who={who} now={Date.now} mode="phone" sound={sound} lang={lang} me={null} hands />;

  const [actionHost, setActionHost] = useState<HTMLDivElement | null>(null);
  const actions =
    phase.k === "setup" ? (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => deal(nextWriters(players.map((p) => p.id), null, {}), {})}
      >
        {zh ? "开始" : "Start"}
      </button>
    ) : phase.k === "pass" && writer ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase({ k: "write", i: phase.i })}>
        {zh ? `我是 ${writer.name}` : `I'm ${writer.name}`}
      </button>
    ) : phase.k === "write" ? (
      <div className="row" ref={setActionHost} />
    ) : phase.k === "show" && matches[phase.m] ? (
      phase.step === "present" ? (
        <button type="button" className="btn btn-lg btn-ghost" onClick={() => setPhase({ ...phase, step: "vote", at: Date.now() })}>
          {zh ? "念完了，开始举手" : "Done reading, hands up"}
        </button>
      ) : phase.step === "vote" ? (
        <button type="button" className="btn btn-primary btn-lg" onClick={reveal}>
          {zh ? "揭晓是谁写的" : "Reveal who wrote what"}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-lg" onClick={afterResult}>
          {phase.m + 1 < matches.length ? (zh ? "下一题" : "Next prompt") : final ? (zh ? "看最终名次" : "See who won") : zh ? "看分数" : "See the scores"}
        </button>
      )
    ) : phase.k === "scores" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => startRound(round + 1, scores)}>
        {zh ? "下一轮" : "Next round"}
      </button>
    ) : phase.k === "end" ? (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => {
          const again = () => deal(nextWriters(players.map((p) => p.id), writers.map((p) => p.id), written), written);
          if (!stampFirst(again)) again();
        }}
      >
        {zh ? "再来一局" : "Play again"}
      </button>
    ) : undefined;

  // Drafts are kept on every edit. Private writing returns behind its writer's curtain;
  // show clocks restart from the beginning of their step, with the answers and votes intact.
  const keptPhase: Phase = phase.k === "write" ? { k: "pass", i: phase.i } : "at" in phase ? { ...phase, at: 0 } : phase;
  useKeepProgress<Kept>({ round, order, matches, phase: keptPhase, scores, before, tally, drafts, cards: deck.current.keep(), finals: finals.current.keep(), quips: quips.current.keep(), pending, advancing, writers: writers.map((p) => p.id), written }, phase.k !== "setup" && phase.k !== "end");
  return (
    <PunchActionHost.Provider value={actionHost}>
      <GameShell
        title={GAME_BY_ID.punchline.name}
        rules={rules}
        onBack={onBack}
        penalty={penalty.call}
        onPenaltyDone={penalty.done}
        roster={{ turn: writer?.id }}
        status={playing ? { kind: "round", current: round, total: ROUNDS } : undefined}
        actions={actions}
      >
        <div className="pl">
          {phase.k === "setup" && (
            <div className="stack" style={{ gap: 16 }}>
              <PromptCard prompt={{ zh: "写最好笑的答案，大家投票", en: "Write the funniest answer. Everyone votes." }} kicker={zh ? `${players.length} 人，三轮` : `${players.length} players, three rounds`} />
              <p className="hint" style={{ textAlign: "center" }}>
                {zh
                  ? "手机会在大家手里传一圈，每人写自己的答案，别让别人看到。写完以后手机上开演，大家举手投票。"
                  : "The phone goes round the table and everyone writes their own answers. No peeking. Then the show plays on the phone and you vote by show of hands."}
              </p>
              {audience.length > 0 && (
                <p className="hint" style={{ textAlign: "center" }}>
                  {zh ? `超过 8 个人：${audience.map((p) => p.name).join("、")} 这局当观众，只投票，下一局先写。` : `More than eight: ${audience.map((p) => p.name).join(", ")} watch this one and vote, and write first next game.`}
                </p>
              )}
            </div>
          )}

          {phase.k === "pass" && writer && (
            <>
              {show}
              <PassCurtain name={writer.name} note={final ? (zh ? "写一个答案，写完交给下一个" : "Write one answer, then pass it on") : zh ? "写两个答案，写完交给下一个" : "Write two answers, then pass it on"} />
            </>
          )}

          {phase.k === "write" && writer && <SoloWrite key={`${round}-${writer.id}`} items={mineIn(writer.id)} who={writer.name} draft={drafts[writer.id] ?? { texts: {}, safe: {} }} onDraft={(draft) => setDrafts((d) => ({ ...d, [writer.id]: draft }))} quip={() => quips.current.draw().card} onDone={(texts) => submit(writer.id, texts)} />}

          {phase.k === "show" && matches[phase.m] && (
            <>
              {show}
              {phase.step === "vote" && <Tally m={matches[phase.m]} final={final} tally={tally} setTally={setTally} voters={final ? players.length : players.length - 2} />}
            </>
          )}

          {phase.k === "scores" && <>{show}</>}

          {phase.k === "end" && <>{show}</>}
        </div>
      </GameShell>
    </PunchActionHost.Provider>
  );
}

function HandFace({ size }: { size: number }) {
  return (
    <span className="pl-hand" style={{ width: size, height: size }}>
      <Hand size={Math.round(size * 0.58)} strokeWidth={2.2} />
    </span>
  );
}

/** Count the hands: one row per answer, plus and minus. */
function Tally({ m, final, tally, setTally, voters }: { m: LMatch; final: boolean; tally: number[]; setTally: (fn: (t: number[]) => number[]) => void; voters: number }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const total = tally.reduce((a, b) => a + b, 0);
  const colors = final ? FINAL_COLORS : SIDE;
  return (
    <div className="pl-tally">
      <p className="pl-tally-lead">
        {final
          ? zh
            ? "每人举手选三个，数一数每个答案有几只手"
            : "Everyone raises a hand for three. Count the hands for each answer."
          : zh
            ? "没写这题的人举手，数一数每边几只手"
            : "Everyone who didn't write this one raises a hand. Count each side."}
      </p>
      {m.order.map((ai, slot) => {
        const letter = String.fromCharCode(65 + slot);
        return (
          <div key={slot} className="pl-tally-row" style={{ ["--side" as string]: colors[slot % colors.length] } as React.CSSProperties}>
            <span className="pl-tally-letter" aria-hidden="true">
              {letter}
            </span>
            <span className="pl-tally-text">{m.answers[ai]}</span>
            <button type="button" className="icon-btn" aria-label={zh ? `${letter} 少一票` : `One less for ${letter}`} disabled={!tally[slot]} onClick={() => setTally((t) => t.map((x, i) => (i === slot ? Math.max(0, x - 1) : x)))}>
              <Minus size={18} />
            </button>
            <span className="pl-tally-n tabular" aria-live="polite">
              {tally[slot] ?? 0}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={zh ? `${letter} 多一票` : `One more for ${letter}`}
              onClick={() => {
                setTally((t) => t.map((x, i) => (i === slot ? x + 1 : x)));
                sfx.tap();
              }}
            >
              <Plus size={18} />
            </button>
          </div>
        );
      })}
      <p className="hint pl-progress tabular">
        {final ? (zh ? `数了 ${total} 票，${voters} 人每人最多三票` : `${total} counted. ${voters} people, up to three each.`) : zh ? `数了 ${total} 票，能投的有 ${voters} 人` : `${total} counted. ${voters} can vote.`}
      </p>
    </div>
  );
}

function SoloWrite({ items, who, draft, onDraft, quip, onDone }: { items: { m: LMatch; k: number }[]; who: string; draft: Draft; onDraft: (draft: Draft) => void; quip: () => T; onDone: (texts: Record<number, { text: string; safety: boolean }>) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const { texts, safe } = draft;
  const formId = useId();
  const ready = items.every(({ k }) => (texts[k] ?? "").trim());
  return (
    <form
      id={formId}
      className="pl-solo-write"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onDone(Object.fromEntries(items.map(({ k }) => [k, { text: texts[k].trim(), safety: !!safe[k] }])));
        haptic(10);
      }}
    >
      <p className="pl-round">{zh ? `${who} 在写` : `${who} is writing`}</p>
      {items.map(({ m, k }, i) => (
        <div key={k} className="pl-write">
          <PromptCard prompt={m.prompt} kicker={items.length > 1 ? (zh ? `第 ${i + 1} 题，共 ${items.length} 题` : `Prompt ${i + 1} of ${items.length}`) : zh ? "所有人写同一题" : "Everyone answers this one"} />
          <div className="field">
            <textarea
              rows={2}
              maxLength={80}
              value={texts[k] ?? ""}
              onChange={(e) => {
                onDraft({ texts: { ...texts, [k]: e.target.value }, safe: { ...safe, [k]: false } });
              }}
              placeholder={zh ? "写一个让大家笑出声的答案" : "Write something that gets a laugh"}
              aria-label={zh ? "你的答案" : "Your answer"}
            />
          </div>
          {!safe[k] && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                const q = quip();
                onDraft({ texts: { ...texts, [k]: zh ? q.zh : q.en }, safe: { ...safe, [k]: true } });
                sfx.pop();
              }}
            >
              {zh ? "想不出来？给我一个（分数减半）" : "Stuck? Give me one (half points)"}
            </button>
          )}
        </div>
      ))}
      <PunchAction>
        <button type="submit" form={formId} className="btn btn-primary btn-lg" disabled={!ready}>
          {zh ? "写好了，藏起来交给下一个" : "Done. Hide it and pass it on"}
        </button>
      </PunchAction>
    </form>
  );
}
