/**
 * 一本正经 · In All Seriousness on one phone, passed round the table. The pure engine
 * (src/shared/straightface) holds the game; this screen only dispatches events and renders what
 * `privateView` allows the phone's holder to see and what `publicView` allows the table to see.
 */
import { Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CARDS, defaultPacks, PACKS, type Pack } from "../../data/straightface";
import { GameShell, usePenalty } from "../../games/GameShell";
import { GAME_BY_ID } from "../../games/registry";
import { sfx } from "../../lib/sfx";
import { BACKDROP } from "./art";
import { cue } from "./sounds";
import { createGame, DEFAULT_OPTIONS, GameError, JUDGE_PROMPTS, leaderboard, MAX_PLAYERS, MIN_PLAYERS, nextJudge, privateView, publicView, reduce, type Deps } from "../../shared/straightface/engine";
import type { GameEvent, GameState, Level, PenaltyWhy } from "../../shared/straightface/types";
import { usePenaltyText, useStore } from "../../store";
import { Leaderboard, NameFace, PassCurtain } from "../common";
import { Deltas, HoldToPeek, Lines, OrderStrip, PackPicker, PickOne, RevealSequence, RoleArt, RoleCast, SpeakerRing, TermCard, useSay, type RevealItem } from "./parts";
import { S } from "./text";
import "../../styles/party.css";
import "./straightface.css";

const deps: Deps = { cards: CARDS };
const LEVELS: Level[] = [1, 2, 3];

export function StraightFace({ onBack }: { onBack: () => void }) {
  const { players, lang } = useStore();
  const say = useSay();
  const pen = usePenaltyText();
  const penalty = usePenalty();
  const n = players.length;

  // what the host chose before the first round
  const [level, setLevel] = useState<Level>(2);
  const [packs, setPacks] = useState<Pack[]>(() => defaultPacks(lang));
  const packsTouched = useRef(false);
  useEffect(() => {
    if (!packsTouched.current) setPacks(defaultPacks(lang));
  }, [lang]);
  const [seeds, setSeeds] = useState(true);
  const [bets, setBets] = useState(true);

  // the engine's state, in a ref too so two taps in one frame both see the newest game
  const gameRef = useRef<GameState | null>(null);
  const [game, setGameState] = useState<GameState | null>(null);
  const setGame = (g: GameState | null) => {
    gameRef.current = g;
    setGameState(g);
  };
  // the one-phone choreography around the engine: has the table seen the word, who the curtain is
  // waiting for, is the tag picker open, which three questions the judge sees
  const [termSeen, setTermSeen] = useState(false);
  const [curtainFor, setCurtainFor] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [askSet, setAskSet] = useState(0);
  const [revealShown, setRevealShown] = useState(false);
  const [masterFor, setMasterFor] = useState<string | null>(null);

  const names = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const nameOf = (id: string | null | undefined) => (id ? (names[id] ?? "?") : "");

  /** One event through the rules. A tap that came twice, or one the rules refuse, changes nothing. */
  const act = (ev: GameEvent): GameState | null => {
    const g = gameRef.current;
    if (!g) return null;
    try {
      const next = reduce(g, ev, deps);
      setGame(next);
      return next;
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      return null;
    }
  };

  const start = () => {
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) return;
    const g = createGame(
      players.map((p, i) => ({ id: p.id, name: p.name, seat: i })),
      { ...DEFAULT_OPTIONS, mode: "pass", bluffSeeds: seeds, sideBets: bets, packs: packs.length === PACKS.length ? [] : packs },
    );
    setGame(reduce(g, { type: "START_ROUND", level }, deps));
    setTermSeen(false);
    setCurtainFor(null);
    setRevealShown(false);
    setMasterFor(null);
    cue.deal();
    cue.termUp();
  };

  const startRound = () => {
    const next = act({ type: "START_ROUND", level });
    if (!next) return;
    setTermSeen(false);
    setCurtainFor(null);
    setRevealShown(false);
    setMasterFor(null);
    cue.deal();
    cue.termUp();
  };

  const pub = game ? publicView(game, deps) : null;
  const r = game?.current ?? null;
  const judgeId = r?.judgeId ?? null;
  const holder = pub?.phoneHolderId ?? null;
  const holderView = game && holder ? privateView(game, holder, deps) : null;

  // the phone moves: whoever should hold it next gets the curtain, the judge gets it back by name
  const handTo = (g: GameState) => {
    const next = publicView(g, deps).phoneHolderId;
    setCurtainFor(next);
    cue.handOff();
  };

  const peeked = () => {
    if (!holder) return;
    const next = act({ type: "PEEKED", playerId: holder });
    if (next) handTo(next);
  };

  const bet = (target: string) => {
    if (!holder) return;
    const next = act({ type: "BET", playerId: holder, targetId: target });
    if (!next) return;
    cue.bet(Object.keys(next.current?.bets ?? {}).length);
    handTo(next);
  };

  const nextSpeaker = () => {
    const next = act({ type: "NEXT_SPEAKER" });
    if (!next) return;
    setTagOpen(false);
    if (next.phase === "bets") handTo(next);
    else if (next.phase === "accuse") setCurtainFor(null);
    else cue.speakerUp();
  };

  const tag = (target: string) => {
    if (!judgeId) return;
    if (act({ type: "TAG_SUSPECT", byPlayerId: judgeId, targetId: target })) cue.tag();
    setTagOpen(false);
  };

  const accuse = (target: string) => {
    if (!judgeId) return;
    const next = act({ type: "ACCUSE", byPlayerId: judgeId, targetId: target });
    if (next) cue.accuse();
  };

  // penalties land one stamp after another; the master bluffer's is a pick first
  const stamp = (list: { who: string; why: PenaltyWhy }[]) => {
    const [first, ...rest] = list;
    if (!first) return;
    const note = first.why === "fooled" ? say(S.penFooled) : say(S.penCaught);
    penalty.show({ who: [nameOf(first.who)], kind: "sip", note }, () => stamp(rest));
  };
  const allShown = () => {
    if (revealShown || !r?.result) return;
    setRevealShown(true);
    const plain = r.result.penalties.filter((p) => p.why !== "master").map((p) => ({ who: p.playerId, why: p.why }));
    const master = r.result.penalties.find((p) => p.why === "master");
    setMasterFor(master?.playerId ?? null);
    if (master) window.setTimeout(() => cue.master(), 300);
    window.setTimeout(() => stamp(plain), 400);
  };
  const masterPick = (target: string) => {
    if (!masterFor) return;
    const by = nameOf(masterFor);
    setMasterFor(null);
    penalty.show({ who: [nameOf(target)], kind: "sip", note: say(S.penMaster, { name: by }) });
  };

  const nextRound = () => {
    const next = act({ type: "NEXT_ROUND" });
    if (next?.phase === "finished") cue.finale();
  };

  const levelLabel = (l: Level) => say(l === 1 ? S.level1 : l === 2 ? S.level2 : S.level3);
  const rules = (
    <p>
      {lang === "zh"
        ? `每轮一个裁判，一个冷门词。其他人里只有一个老实人看过真释义，剩下的人现编。大家轮流一本正经地解释这个词，裁判可以追问，可以给一个人贴「疑点」，最后指认谁是老实人。被指认的人得分，不管他是不是老实人；指对了裁判也得分。${pen.isCustom ? "裁判看走眼要受罚，被疑点抓包的也要受罚，骗到裁判的人可以指定一个人受罚。" : "裁判看走眼喝一口，被疑点抓包的喝一口，骗到裁判的人可以指定一个人喝。"}每人当一次裁判，分最高的赢，同分看谁骗到裁判的次数多。`
        : `Each round has a judge and an obscure word. Of the others, only one, the honest one, has read the real meaning; the rest make one up. Everyone explains the word with a straight face, the judge may ask questions, may tag one suspect, and finally names the honest one. Whoever is named scores, honest or not; if the judge is right the judge scores too. ${pen.isCustom ? "A fooled judge takes the penalty, so does a tagged bluffer, and the bluffer who fooled the judge picks someone to take it." : "A fooled judge drinks, a tagged bluffer drinks, and the bluffer who fooled the judge picks someone to drink."} Everyone judges once; most points wins, ties go to whoever fooled the judge more.`}
    </p>
  );

  /* ---------- what the phone shows ---------- */

  let body: React.ReactNode = null;
  let actions: React.ReactNode = undefined;
  let turn: string | undefined;

  if (!game || !pub || !r) {
    const bad = n < MIN_PLAYERS || n > MAX_PLAYERS;
    body = (
      <div className="stack sf-setup">
        <RoleCast />
        <div className="panel setup-panel">
          <span className="field-label">{say(S.level)}</span>
          <div className="seg" role="group" aria-label={say(S.level)}>
            {LEVELS.map((l) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
                {levelLabel(l)}
              </button>
            ))}
          </div>
          <span className="field-label">
            {say(S.packs)} <small className="sf-sub-inline">{say(S.packsPicked, { n: packs.length })}</small>
          </span>
          <PackPicker
            picked={packs}
            onChange={(next) => {
              packsTouched.current = true;
              setPacks(next);
            }}
          />
          <div className="settings-row ink">
            <span>
              {say(S.seedsOn)}
              <small className="sf-sub">{say(S.seedsHint)}</small>
            </span>
            <button type="button" className={`btn btn-sm ${seeds ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={seeds} onClick={() => setSeeds((v) => !v)}>
              {seeds ? (lang === "zh" ? "开" : "On") : lang === "zh" ? "关" : "Off"}
            </button>
          </div>
          {n >= 4 && (
            <div className="settings-row ink">
              <span>
                {say(S.betsOn)}
                <small className="sf-sub">{say(S.betsHint)}</small>
              </span>
              <button type="button" className={`btn btn-sm ${bets ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={bets} onClick={() => setBets((v) => !v)}>
                {bets ? (lang === "zh" ? "开" : "On") : lang === "zh" ? "关" : "Off"}
              </button>
            </div>
          )}
          <p className="hint-ink">
            {n > MAX_PLAYERS ? say(S.tooMany) : say(S.seated, { n, m: n * 3 })} {n < 4 && n >= MIN_PLAYERS && say(S.bestWith)}
          </p>
        </div>
      </div>
    );
    actions = (
      <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={bad}>
        {say(S.start)}
      </button>
    );
  } else if (r && pub.phase === "peek" && !termSeen) {
    // the word goes up for the whole table before the phone starts round
    turn = judgeId ?? undefined;
    body = (
      <div className="stack sf-stage">
        <TermCard term={pub.term!} pack={pub.pack} level={pub.level} lead={say(S.termUp)} big />
        <div className="sf-judge-line">
          <RoleArt role="judge" size={64} />
          <p className="hint">
            {say(S.judge)}: <strong>{nameOf(judgeId)}</strong> · {say(S.showTable)}
          </p>
        </div>
      </div>
    );
    actions = (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => {
          setTermSeen(true);
          handTo(game);
        }}
      >
        {say(S.startPassing)}
      </button>
    );
  } else if (curtainFor) {
    // "pass the phone to Amy": nothing private shows until Amy says it is her
    turn = curtainFor;
    const toJudge = curtainFor === judgeId;
    body = (
      <div className="stack sf-stage">
        {!toJudge && pub.term && <TermCard term={pub.term} pack={pub.pack} level={pub.level} />}
        <PassCurtain name={nameOf(curtainFor)} note={toJudge ? say(S.backToJudge) : pub.phase === "bets" ? say(S.betHint) : undefined} onReady={() => setCurtainFor(null)} />
      </div>
    );
  } else if (pub.phase === "peek" && holderView && holder) {
    turn = holder;
    body = (
      <div className="stack sf-stage">
        <TermCard term={pub.term!} pack={pub.pack} level={pub.level} />
        <HoldToPeek key={holder} name={nameOf(holder)} view={holderView} seconds={pub.timers.peek} onDone={peeked} />
      </div>
    );
  } else if (pub.phase === "explain") {
    const idx = r.speakerIdx;
    const speaking = pub.speakerId;
    turn = speaking ?? judgeId ?? undefined;
    const asks = [0, 1, 2].map((i) => JUDGE_PROMPTS[(askSet * 3 + i) % JUDGE_PROMPTS.length]);
    const tagged = r.suspectId;
    body = (
      <div className="stack sf-stage">
        <TermCard term={pub.term!} pack={pub.pack} level={pub.level} />
        {idx < 0 ? (
          <div className="panel sf-panel">
            <span className="field-label">{say(S.order)}</span>
            <OrderStrip order={pub.speakOrder} names={names} current={-1} />
            <p className="hint">{say(S.orderHint)}</p>
          </div>
        ) : (
          <>
            <SpeakerRing name={nameOf(speaking)} seconds={pub.timers.explain} resetKey={idx} index={idx} total={pub.speakOrder.length} />
            <OrderStrip order={pub.speakOrder} names={names} current={idx} />
            {tagOpen ? (
              <div className="panel sf-panel">
                <p className="hint">{say(S.tagWho)}</p>
                <PickOne people={pub.speakOrder.map((id) => ({ id, name: names[id] }))} onPick={tag} size={50} />
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
            )}
          </>
        )}
      </div>
    );
    actions =
      idx < 0 ? (
        <button type="button" className="btn btn-primary btn-lg" onClick={nextSpeaker}>
          {say(S.startSpeaking)}
        </button>
      ) : (
        <>
          <button type="button" className={`btn btn-lg ${tagged ? "btn-quiet" : "btn-ghost"}`} disabled={!!tagged || tagOpen} onClick={() => setTagOpen(true)}>
            <Tag size={18} /> {tagged ? say(S.tagged, { name: nameOf(tagged) }) : say(S.tag)}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={nextSpeaker}>
            {idx + 1 >= pub.speakOrder.length ? say(S.lastSpeaker) : say(S.nextSpeaker)}
          </button>
        </>
      );
  } else if (pub.phase === "bets" && holder && holderView?.canBet) {
    turn = holder;
    body = (
      <div className="stack sf-stage">
        <TermCard term={pub.term!} pack={pub.pack} level={pub.level} />
        <p className="sup-ask">{say(S.betWho, { name: nameOf(holder) })}</p>
        <PickOne people={pub.speakOrder.filter((id) => id !== holder).map((id) => ({ id, name: names[id] }))} onPick={bet} />
      </div>
    );
  } else if (pub.phase === "accuse" || (pub.phase === "bets" && holder === judgeId)) {
    turn = judgeId ?? undefined;
    const tagged = r.suspectId;
    body = (
      <div className="stack sf-stage">
        <TermCard term={pub.term!} pack={pub.pack} level={pub.level} />
        <div className="sf-judge-line">
          <RoleArt role="judge" size={64} />
          <p className="sup-ask">{say(S.accuseWho, { name: nameOf(judgeId) })}</p>
        </div>
        <p className="hint sf-center">{say(S.accuseHint)}</p>
        <PickOne
          people={pub.speakOrder.map((id) => ({ id, name: names[id] }))}
          onPick={accuse}
          disabled={tagged ? [tagged] : []}
          marks={tagged ? { [tagged]: say(S.taggedMark) } : {}}
        />
      </div>
    );
  } else if ((pub.phase === "reveal" || pub.phase === "between" || pub.phase === "finished") && pub.reveal) {
    const rv = pub.reveal;
    const res = rv.result;
    const items: RevealItem[] = [
      {
        key: "truth",
        node: (
          <TermCard term={pub.term!} pack={pub.pack} level={pub.level} lead={say(S.truth)}>
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
          </div>
        ),
      },
      { key: "pre", node: <Lines lines={res.preLines} className="sf-pre" /> },
      {
        key: "honest",
        node: (
          <div className="sf-honest">
            <RoleArt role="honest" size={96} />
            <span className="hint">{say(S.honestWas)}</span>
            <NameFace name={nameOf(rv.honestId)} size={64} />
            <strong>{nameOf(rv.honestId)}</strong>
          </div>
        ),
      },
      {
        key: "points",
        node: (
          <div className="panel sf-panel">
            <Lines lines={res.lines} />
            <Deltas deltas={res.deltas} names={names} />
          </div>
        ),
      },
    ];
    const finished = pub.phase === "finished";
    const between = pub.phase === "between";
    turn = judgeId ?? undefined;
    if (between || finished) {
      const board = leaderboard(game);
      const top = board.filter((b) => b.place === 1);
      body = (
        <div className="stack sf-stage">
          {finished && (
            <div className="sf-final">
              <p className="sf-final-title">{say(S.finished)}</p>
              <p className="sf-final-line">{top.length === 1 ? say(S.winner, { name: top[0].name }) : say(S.tie, { names: top.map((b) => b.name).join(lang === "zh" ? "、" : ", "), penalty: pen.isCustom ? say(S.penaltyWord) : say(S.drinkWord) })}</p>
            </div>
          )}
          <div className="panel sf-panel">
            <span className="field-label">{say(S.scores)}</span>
            <Leaderboard
              rows={board.map((b) => ({ id: b.id, name: b.name, score: b.score, face: <NameFace name={b.name} size={40} />, note: b.fooled === 1 ? say(S.fooledOnce) : b.fooled ? say(S.fooledTimes, { n: b.fooled }) : undefined }))}
              unit={say(S.points)}
            />
          </div>
          {!finished && (
            <div className="panel sf-panel">
              <span className="field-label">{say(S.nextJudge)}</span>
              <div className="row sf-next-judge">
                <NameFace name={nameOf(nextJudge(game))} size={44} />
                <strong>{nameOf(nextJudge(game))}</strong>
              </div>
              <span className="field-label">{say(S.level)}</span>
              <div className="seg" role="group" aria-label={say(S.level)}>
                {LEVELS.map((l) => (
                  <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {levelLabel(l)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {finished && (
            <div className="panel sf-panel">
              <span className="field-label">{say(S.learned, { n: game.rounds.length })}</span>
              <ul className="sf-learned">
                {game.rounds.map((rd) => {
                  const c = CARDS.find((x) => x.id === rd.cardId);
                  if (!c) return null;
                  return (
                    <li key={rd.cardId}>
                      <strong>{lang === "zh" ? c.term.zh : c.term.en}</strong>
                      <span>{lang === "zh" ? c.definition.zh : c.definition.en}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      );
      actions = finished ? (
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setGame(null)}>
          {say(S.playAgain)}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-lg" onClick={startRound}>
          {say(S.startRound, { n: game.rounds.length + 1 })}
        </button>
      );
    } else {
      body = (
        <div className="stack sf-stage">
          <RevealSequence
            key={r.index}
            items={items}
            onAllShown={allShown}
            onStep={(key) => {
              if (key === "honest") cue.verdict(res.outcome === "judge_right");
              else if (key === "points") cue.points();
              else if (key !== "truth") sfx.tap();
            }}
          />
          {revealShown && masterFor && (
            <div className="panel sf-panel sf-master">
              <RoleArt role="bluffer" size={80} className="sf-master-art" />
              <p className="sup-ask">{say(S.masterPicks, { name: nameOf(masterFor), penalty: pen.isCustom ? say(S.penaltyWord) : say(S.drinkWord) })}</p>
              <PickOne people={players.filter((p) => p.id !== masterFor).map((p) => ({ id: p.id, name: p.name }))} onPick={masterPick} size={50} />
            </div>
          )}
        </div>
      );
      const last = game.rounds.length + 1 >= game.roundsPlanned;
      actions = (
        <button type="button" className="btn btn-primary btn-lg" onClick={nextRound} disabled={!revealShown || !!masterFor || !!penalty.call}>
          {last ? say(S.seeResult) : say(S.nextRound)}
        </button>
      );
    }
  }

  const status = pub && pub.phase !== "lobby" ? ({ kind: "round", current: pub.roundNumber, total: pub.roundsPlanned } as const) : undefined;

  return (
    <GameShell title={GAME_BY_ID.straightface.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} status={status} roster={{ turn }} actions={actions}>
      <div className="sf">
        <div className="sf-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${BACKDROP})` }} />
        {body}
      </div>
    </GameShell>
  );
}
