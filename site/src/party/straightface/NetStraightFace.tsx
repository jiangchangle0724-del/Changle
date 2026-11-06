/**
 * 一本正经 · In All Seriousness online: every phone its own. The rooms server runs the one-phone game's
 * engine (src/shared/engine/games/straightface.ts); this screen renders this phone's own part (`v.me`)
 * and what the whole table may see (`v.table`), and sends what this player does. Someone who sat down
 * after the deal gets no part and watches the table's view.
 */
import { Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TimerArc } from "../../components/TimerArc";
import { defaultPacks, type Pack } from "../../data/straightfacePacks";
import { GAME_BY_ID } from "../../games/registry";
import { sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { usePlayers } from "../../online/players";
import { HostButton, HostRow, useYourTurn, Waiting } from "../../online/games/common";
import { JUDGE_PROMPTS, MAX_PLAYERS, MIN_PLAYERS } from "../../shared/straightface/engine";
import { roundLines } from "../../shared/straightface/scoring";
import type { Level, StraightFaceView } from "../../shared/straightface/types";
import { usePenaltyText, useStore } from "../../store";
import { Leaderboard } from "../common";
import { BACKDROP } from "./art";
import { CardNumbers, Deltas, HoldPart, Lines, MasterArt, OrderStrip, PackPicker, PackStrip, PickOne, RevealSequence, ReportCard, RoleArt, RoleCast, SpeakerRing, TermCard, useConfetti, useSay, Verdict, type RevealItem } from "./parts";
import { cardStats, markSeen, seenCards, sendRound } from "./feedback";
import { cue } from "./sounds";
import { S } from "./text";
import "../../styles/party.css";
import "./straightface.css";

const LEVELS: Level[] = [1, 2, 3];

export default function NetStraightFace({ v, onLeave }: { v: StraightFaceView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, offset } = useRoom();
  const { lang } = useStore();
  const say = useSay();
  const pen = usePenaltyText();
  const seated = usePlayers();
  const seats = room?.seats;
  const names = useMemo(() => Object.fromEntries((seats ?? []).map((s) => [s.id, s.name])), [seats]);
  const face = (id: string | null | undefined, size: number) => <SeatFace seat={seats?.find((s) => s.id === id)} size={size} />;
  const who = (id: string | null | undefined) => (id && id === me ? say(S.you) : nameOf(id));
  const t = v.table;
  const mine = v.me;
  const phase = v.phase;
  const judge = t?.judgeId ?? null;
  const amJudge = !!judge && judge === me;
  const penaltyWord = pen.isCustom ? say(S.penaltyWord) : say(S.drinkWord);
  const round = t?.roundNumber ?? 0;

  // what only this phone keeps: has it looked at its part yet, whom it bet on, the tag picker, the
  // judge's questions, how far the reveal has got
  const [looked, setLooked] = useState(false);
  const [myBet, setMyBet] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [askSet, setAskSet] = useState(0);
  const [revealDone, setRevealDone] = useState(-1);
  useEffect(() => {
    setLooked(false);
    setMyBet(null);
    setTagOpen(false);
    // (a round dealt again after someone left keeps its number, not its word)
  }, [round, phase === "setup", t?.term?.zh]);

  // how each card has played on changle, for the reveal
  const [stats, setStats] = useState<Record<string, [number, number]>>({});
  useEffect(() => {
    void cardStats().then(setStats);
  }, []);

  // before the deal, this phone hands in the cards it has played (the table deals others first)
  useEffect(() => {
    if (phase === "setup" && seated.some((s) => s.id === me)) {
      const ids = seenCards();
      if (ids.length) g("seen", { ids });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "setup"]);

  // at the reveal: the card counts as played on this phone, and the host's phone sends the round's
  // outcome for the card's numbers (once: one phone per table)
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (phase !== "reveal" || !v.cardId || !v.facts) return;
    markSeen(v.cardId);
    const key = `${room?.code}:${round}:${v.cardId}`;
    if (!isHost || sent.current.has(key)) return;
    sent.current.add(key);
    sendRound(v.cardId, v.facts.accusedId !== v.facts.honestId, v.players.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, v.cardId]);

  // the host's phone puts in the packs for its own language until the host picks
  useEffect(() => {
    if (isHost && phase === "setup" && v.setup.packs === null) g("config", { packs: defaultPacks(lang) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, phase, v.setup.packs, lang]);

  // the sounds of the night, on each phone
  useCue(phase === "peek", () => {
    cue.deal();
    cue.termUp();
  });
  useCue(phase === "reveal", () => cue.accuse());
  const { burst, layer } = useConfetti();
  useCue(phase === "finished", () => {
    cue.finale();
    window.setTimeout(() => burst({ y: 0.3, count: 220 }), 300);
  });
  const iSpeak = phase === "explain" && !!t?.speakerId && t.speakerId === me;
  useYourTurn(iSpeak);
  useYourTurn(!!mine?.canBet);
  useYourTurn(amJudge && phase === "accuse");
  const iPick = phase === "reveal" && v.master === me && revealDone === round;
  useCue(iPick, () => cue.master());

  const rules = (
    <p>
      {lang === "zh"
        ? `每轮一个裁判，一个冷门词。每个人在自己的手机上按住看身份：只有一个老实人看到真释义，其他人现编。大家轮流一本正经地解释这个词，裁判可以追问，可以给一个人贴「疑点」，最后在手机上指认谁是老实人。4 人以上时，解释完大家先在手机上押谁是老实人。被指认的人得分，不管他是不是老实人；指对了裁判也得分。${pen.isCustom ? "裁判看走眼要受罚，被疑点抓包的也要受罚，骗到裁判的人可以指定一个人受罚。" : "裁判看走眼喝一口，被疑点抓包的喝一口，骗到裁判的人可以指定一个人喝。"}每人当一次裁判，分最高的赢，同分看谁骗到裁判的次数多。`
        : `Each round has a judge and an obscure word. Everyone holds their phone to see their part: only the honest one sees the real meaning; the rest make one up. Everyone explains the word with a straight face, the judge may ask questions, may tag one suspect, and finally names the honest one on their phone. With 4 or more, everyone first bets on their phone on who is honest. Whoever is named scores, honest or not; if the judge is right the judge scores too. ${pen.isCustom ? "A fooled judge takes the penalty, so does a tagged bluffer, and the bluffer who fooled the judge picks someone to take it." : "A fooled judge drinks, a tagged bluffer drinks, and the bluffer who fooled the judge picks someone to drink."} Everyone judges once; most points wins, ties go to whoever fooled the judge more.`}
    </p>
  );

  const levelSeg = (level: Level) => (
    <div className="seg" role="group" aria-label={say(S.level)}>
      {LEVELS.map((l) => (
        <button key={l} type="button" aria-pressed={level === l} disabled={!isHost} onClick={() => g("config", { level: l })}>
          {say(l === 1 ? S.level1 : l === 2 ? S.level2 : S.level3)}
        </button>
      ))}
    </div>
  );
  const toggle = (label: string, hint: string, on: boolean, flip: () => void) => (
    <div className="settings-row ink">
      <span>
        {label}
        <small className="sf-sub">{hint}</small>
      </span>
      <button type="button" className={`btn btn-sm ${on ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={on} disabled={!isHost} onClick={flip}>
        {on ? (lang === "zh" ? "开" : "On") : lang === "zh" ? "关" : "Off"}
      </button>
    </div>
  );
  const term = t?.term ? <TermCard term={t.term} pack={t.pack} level={t.level} /> : null;
  // my part stays a press away all round (and looks the same for the honest one and a bluffer)
  const myPart = mine && mine.role && mine.role !== "judge" ? <HoldPart view={mine} compact /> : null;
  const late = !!t && !mine && seated.some((s) => s.id === me) ? <p className="hint sf-center">{say(S.lateJoin)}</p> : null;

  /** the scores, highest first; a tie goes to whoever fooled a judge more often, then shares the place */
  const board = () => {
    const rows = v.players
      .map((id) => ({ id, name: nameOf(id), score: t?.scores[id] ?? 0, fooled: v.fooled[id] ?? 0, place: 0 }))
      .sort((a, b) => b.score - a.score || b.fooled - a.fooled || a.name.localeCompare(b.name));
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.place = prev && prev.score === row.score && prev.fooled === row.fooled ? prev.place : i + 1;
    });
    return rows;
  };
  const scores = (rows: ReturnType<typeof board>) => (
    <div className="panel sf-panel">
      <span className="field-label">{say(S.scores)}</span>
      <Leaderboard
        rows={rows.map((b) => ({ id: b.id, name: who(b.id), score: b.score, face: face(b.id, 40), note: b.fooled === 1 ? say(S.fooledOnce) : b.fooled ? say(S.fooledTimes, { n: b.fooled }) : undefined }))}
        unit={say(S.points)}
        highlight={[me]}
      />
    </div>
  );

  let body: ReactNode = null;
  let actions: ReactNode = null;
  let host: ReactNode = null;

  if (phase === "setup") {
    const n = seated.length;
    const packs = (v.setup.packs ?? defaultPacks(lang)) as Pack[];
    body = (
      <div className="stack sf-setup">
        <RoleCast />
        <div className="panel setup-panel">
          <span className="field-label">{say(S.level)}</span>
          {levelSeg(v.setup.level)}
          <span className="field-label">
            {say(isHost ? S.packs : S.hostPicked)} <small className="sf-sub-inline">{say(S.packsPicked, { n: packs.length })}</small>
          </span>
          {isHost ? <PackPicker picked={packs} onChange={(next) => g("config", { packs: next })} /> : <PackStrip packs={packs} />}
          {toggle(say(S.seedsOn), say(S.seedsHint), v.setup.seeds, () => g("config", { seeds: !v.setup.seeds }))}
          {n >= 4 && toggle(say(S.betsOn), say(S.betsHint), v.setup.bets, () => g("config", { bets: !v.setup.bets }))}
          <p className="hint-ink">
            {n > MAX_PLAYERS ? say(S.tooManyOnline) : n < MIN_PLAYERS ? say(S.needThree, { n: MIN_PLAYERS - n }) : say(S.seatedOnline, { n, m: n * 3 })} {n === MIN_PLAYERS && say(S.bestWith)}
          </p>
        </div>
      </div>
    );
    actions = isHost ? (
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("deal")} disabled={n < MIN_PLAYERS || n > MAX_PLAYERS}>
        {say(S.deal)}
      </button>
    ) : (
      <Waiting>{say(S.waitDeal, { name: nameOf(room?.host) })}</Waiting>
    );
  } else if (phase === "peek" && t?.term) {
    // the word goes up on every phone; each player reads their own part, all at once
    const reading = !!mine && mine.role !== "judge" && mine.mayPeekNow;
    body = (
      <div className="stack sf-stage">
        <TermCard term={t.term} pack={t.pack} level={t.level} lead={say(S.termUp)} big deal />
        {mine && mine.role && mine.role !== "judge" ? (
          <HoldPart view={mine} onFirst={() => setLooked(true)} />
        ) : (
          <div className="sf-judge-line">
            <RoleArt role="judge" size={64} />
            <p className="hint">{amJudge ? <strong>{say(S.youJudge)}</strong> : say(S.judgeIs, { name: nameOf(judge) })}</p>
          </div>
        )}
        {late}
      </div>
    );
    const count = say(S.readyN, { n: t.peekedCount, m: t.peekTotal });
    actions = reading ? (
      looked && (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("peeked")}>
          {say(S.gotIt)}
        </button>
      )
    ) : (
      <Waiting>
        {mine && !amJudge ? say(S.waitOthers) : say(S.readingParts)} · {count}
      </Waiting>
    );
    if (t.peekedCount < t.peekTotal) host = <HostButton onClick={() => g("force")}>{say(S.startNow)}</HostButton>;
  } else if (phase === "explain" && t?.term) {
    const speaking = t.speakerId;
    const idx = speaking ? t.speakOrder.indexOf(speaking) : -1;
    const asks = [0, 1, 2].map((i) => JUDGE_PROMPTS[(askSet * 3 + i) % JUDGE_PROMPTS.length]);
    const tagged = mine?.suspectId ?? null;
    body = (
      <div className="stack sf-stage">
        {term}
        {myPart}
        {idx < 0 ? (
          <div className="panel sf-panel">
            <span className="field-label">{say(S.order)}</span>
            <OrderStrip order={t.speakOrder} names={names} current={-1} face={face} />
            <p className="hint">{say(S.orderHint)}</p>
          </div>
        ) : (
          <>
            <SpeakerRing
              name={iSpeak ? say(S.yourTurnExplain) : nameOf(speaking)}
              seconds={t.timers.explain}
              resetKey={`${round}-${idx}`}
              index={idx}
              total={t.speakOrder.length}
              endsAt={v.stepAt + t.timers.explain * 1000}
              offset={offset}
            />
            <OrderStrip order={t.speakOrder} names={names} current={idx} face={face} />
            {iSpeak && <p className="hint sf-center">{say(S.explainHint)}</p>}
            {amJudge &&
              (tagOpen ? (
                <div className="panel sf-panel">
                  <p className="hint">{say(S.tagWho)}</p>
                  <PickOne
                    people={t.speakOrder.map((id) => ({ id, name: nameOf(id) }))}
                    face={face}
                    size={50}
                    onPick={(id) => {
                      g("tag", { target: id });
                      cue.tag();
                      setTagOpen(false);
                    }}
                  />
                  <button type="button" className="link-btn sf-center" onClick={() => setTagOpen(false)}>
                    {say(S.tagCancel)}
                  </button>
                </div>
              ) : (
                <div className="panel sf-panel sf-asks">
                  <span className="field-label">{say(S.ask)}</span>
                  <ul>
                    {asks.map((a, i) => (
                      <li key={i}>{lang === "zh" ? a.zh : a.en}</li>
                    ))}
                  </ul>
                  <button type="button" className="link-btn" onClick={() => setAskSet((k) => k + 1)}>
                    {say(S.moreAsks)}
                  </button>
                </div>
              ))}
          </>
        )}
        {late}
      </div>
    );
    const next = () => g("next", { at: idx });
    if (idx < 0) {
      actions = amJudge ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={next}>
          {say(S.startSpeaking)}
        </button>
      ) : (
        <Waiting>{say(S.waitJudgeStart, { name: nameOf(judge) })}</Waiting>
      );
    } else if (amJudge) {
      actions = (
        <div className="sf-net-row">
          <button type="button" className={`btn btn-lg ${tagged ? "btn-quiet" : "btn-ghost"}`} disabled={!!tagged || tagOpen} onClick={() => setTagOpen(true)}>
            <Tag size={18} /> {tagged ? say(S.tagged, { name: nameOf(tagged) }) : say(S.tag)}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={next}>
            {idx + 1 >= t.speakOrder.length ? say(S.lastSpeaker) : say(S.nextSpeaker)}
          </button>
        </div>
      );
    } else if (iSpeak) {
      actions = (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={next}>
          {say(S.done)}
        </button>
      );
    } else {
      actions = <Waiting>{say(S.isExplaining, { name: nameOf(speaking) })}</Waiting>;
    }
    if (!amJudge && !iSpeak) host = <HostButton onClick={next}>{idx < 0 ? say(S.startSpeaking) : say(S.nextSpeaker)}</HostButton>;
  } else if (phase === "bets" && t?.term) {
    body = (
      <div className="stack sf-stage">
        {term}
        {myPart}
        {mine?.canBet ? (
          <>
            <p className="sup-ask">{say(S.betPick)}</p>
            <p className="hint sf-center">{say(S.betHint)}</p>
            <PickOne
              people={t.speakOrder.filter((id) => id !== me).map((id) => ({ id, name: nameOf(id) }))}
              face={face}
              onPick={(id) => {
                g("bet", { target: id });
                setMyBet(id);
                cue.bet(t.betsPlaced + 1);
              }}
            />
          </>
        ) : (
          <div className="sf-judge-line">
            <RoleArt role="judge" size={64} />
            <p className="sup-ask">{amJudge ? say(S.betsNow) : myBet ? say(S.betDone, { name: nameOf(myBet) }) : say(S.betsNow)}</p>
          </div>
        )}
        {late}
      </div>
    );
    const count = say(S.betsIn, { n: t.betsPlaced, m: t.betsExpected });
    actions = amJudge ? (
      <>
        <Waiting>{count}</Waiting>
        <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => g("close")}>
          {say(S.closeBets)}
        </button>
      </>
    ) : (
      !mine?.canBet && <Waiting>{count}</Waiting>
    );
    if (!amJudge) host = <HostButton onClick={() => g("close")}>{say(S.closeBets)}</HostButton>;
  } else if (phase === "accuse" && t?.term) {
    const tagged = mine?.suspectId ?? null;
    const clock = <TimerArc seconds={t.timers.accuse} running endsAt={v.stepAt + t.timers.accuse * 1000} offset={offset} size={56} resetKey={round} ticking={amJudge} />;
    body = amJudge ? (
      <div className="stack sf-stage">
        {term}
        <div className="sf-judge-line">
          <RoleArt role="judge" size={64} />
          <p className="sup-ask">{say(S.whoHonest)}</p>
          {clock}
        </div>
        <p className="hint sf-center">{say(S.accuseHint)}</p>
        <PickOne
          people={t.speakOrder.map((id) => ({ id, name: nameOf(id) }))}
          face={face}
          onPick={(id) => g("accuse", { target: id })}
          disabled={tagged ? [tagged] : []}
          marks={tagged ? { [tagged]: say(S.taggedMark) } : {}}
        />
      </div>
    ) : (
      <div className="stack sf-stage">
        {term}
        {myPart}
        <div className="sf-judge-line">
          <RoleArt role="judge" size={64} />
          <p className="sup-ask">{say(S.judgeDeciding, { name: nameOf(judge) })}</p>
          {clock}
        </div>
        {late}
      </div>
    );
  } else if (phase === "reveal" && t?.term && t.reveal && v.facts) {
    const rv = t.reveal;
    const f = v.facts;
    const said = roundLines(f, nameOf);
    const right = f.accusedId === f.honestId;
    const items: RevealItem[] = [
      {
        key: "truth",
        node: (
          <TermCard term={t.term} pack={t.pack} level={t.level} lead={say(S.truth)}>
            <p className="sf-def">{lang === "zh" ? rv.definition.zh : rv.definition.en}</p>
          </TermCard>
        ),
      },
      {
        key: "fact",
        node: (
          <div className="panel sf-panel sf-fact">
            <span className="field-label">{say(S.funFact)}</span>
            <p>{lang === "zh" ? rv.funFact.zh : rv.funFact.en}</p>
            <CardNumbers stats={v.cardId ? stats[v.cardId] : undefined} />
          </div>
        ),
      },
      { key: "pre", node: <Lines lines={said.preLines} className="sf-pre" /> },
      {
        key: "honest",
        node: <Verdict face={face(rv.honestId, 56)} name={who(rv.honestId)} right={right} onRight={() => burst({ x: 0.7, y: 0.55 })} />,
      },
      {
        key: "points",
        node: (
          <div className="panel sf-panel">
            <Lines lines={said.lines} />
            <Deltas deltas={rv.result.deltas} names={Object.fromEntries(Object.keys(rv.result.deltas).map((id) => [id, who(id)]))} />
          </div>
        ),
      },
    ];
    const shown = revealDone === round;
    body = (
      <div className="stack sf-stage">
        <RevealSequence
          key={round}
          items={items}
          onAllShown={() => setRevealDone(round)}
          onStep={(key) => {
            if (key === "honest") cue.verdict(right);
            else if (key === "points") cue.points();
            else if (key !== "truth") sfx.tap();
          }}
        />
        {shown && v.cardId && <ReportCard card={v.cardId} term={t.term} />}
        {shown && v.master === me && (
          <div className="panel sf-panel sf-master">
            <MasterArt size={88} />
            <p className="sup-ask">{say(S.youMaster, { penalty: penaltyWord })}</p>
            <PickOne people={v.players.filter((id) => id !== me).map((id) => ({ id, name: nameOf(id) }))} face={face} size={50} onPick={(id) => g("pick", { target: id })} />
          </div>
        )}
        {shown && v.master && v.master !== me && <Waiting>{say(S.masterPicking, { name: nameOf(v.master) })}</Waiting>}
        {shown && v.picked && <p className="hint sf-center">{say(S.masterPicked, { name: who(f.accusedId), target: who(v.picked) })}</p>}
      </div>
    );
    const last = round >= t.roundsPlanned;
    if (amJudge || isHost) {
      actions = !v.master && (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("round")} disabled={!shown}>
          {last ? say(S.seeResult) : say(S.nextRound)}
        </button>
      );
      if (v.master && v.master !== me) host = <HostButton onClick={() => g("round")}>{say(S.dontWait)}</HostButton>;
    } else if (shown && !v.master) {
      actions = <Waiting>{say(S.waitNext, { name: nameOf(judge) })}</Waiting>;
    }
  } else if (phase === "between" || phase === "lobby") {
    const nj = v.nextJudge;
    body = (
      <div className="stack sf-stage">
        {scores(board())}
        <div className="panel sf-panel">
          <span className="field-label">{say(S.nextJudge)}</span>
          <div className="row sf-next-judge">
            {face(nj, 44)}
            <strong>{nj === me ? say(S.youJudgeNext) : nameOf(nj)}</strong>
          </div>
          <span className="field-label">{say(S.level)}</span>
          {levelSeg(v.setup.level)}
        </div>
      </div>
    );
    actions =
      isHost || nj === me ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("start")}>
          {say(S.startRound, { n: round + 1 })}
        </button>
      ) : (
        <Waiting>{say(S.waitStart, { name: nameOf(nj) })}</Waiting>
      );
  } else if (phase === "finished") {
    const rows = board();
    const top = rows.filter((b) => b.place === 1);
    body = (
      <div className="stack sf-stage">
        <div className="sf-final">
          <p className="sf-final-title">{say(S.finished)}</p>
          {top.length > 0 && (
            <p className="sf-final-line">
              {top.length === 1 ? say(S.winner, { name: who(top[0].id) }) : say(S.tie, { names: top.map((b) => who(b.id)).join(lang === "zh" ? "、" : ", "), penalty: penaltyWord })}
            </p>
          )}
        </div>
        {scores(rows)}
        {v.learned && v.learned.length > 0 && (
          <div className="panel sf-panel">
            <span className="field-label">{say(S.learned, { n: v.learned.length })}</span>
            <ul className="sf-learned">
              {v.learned.map((l, i) => (
                <li key={i}>
                  <strong>{lang === "zh" ? l.term.zh : l.term.en}</strong>
                  <span>{lang === "zh" ? l.definition.zh : l.definition.en}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
    actions = isHost ? (
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("again")}>
        {say(S.playAgain)}
      </button>
    ) : (
      <Waiting>{say(S.waitAgain, { name: nameOf(room?.host) })}</Waiting>
    );
  }

  return (
    <NetFrame title={GAME_BY_ID.straightface.name} rules={rules} onLeave={onLeave}>
      <div className="sf sf-net">
        <div className="sf-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${BACKDROP})` }} />
        {t && phase !== "setup" && phase !== "finished" && (
          <p className="sf-net-round hint tabular">{say(S.round, { n: Math.max(1, phase === "between" || phase === "lobby" ? round + 1 : round) })} / {t.roundsPlanned}</p>
        )}
        <div className="sf-phase" key={`${phase}-${round}`}>
          {body}
        </div>
        {actions && <div className="sf-net-actions">{actions}</div>}
        <HostRow>{host}</HostRow>
        {layer}
      </div>
    </NetFrame>
  );
}
