import { Clapperboard, Play, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Figure } from "../../components/Figure";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import { BRIEF_MS, drama as rules } from "../../shared/engine/games/drama";
import type { DramaView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NameFace, PassCurtain } from "../common";
import { useWakeLock } from "../sensors";
import { DramaActionHost, useSettle } from "./ShellActions";
import { seedOf, startAmbience, type Scape } from "./ambience";
import { useLocalGame, type LocalEvent, type LocalKept } from "./local";
import { loadLibrary, SceneWriter, TableScenes, type Draft } from "./writer";
import { Backdrop, BallotForm, Cast, Curtain, Finale, isKind, Marquee, Playbill, Reveal, RoleCard, Roster, Rules, SceneClock, SetupPanel, Slate, TwistBanner, type Actor, type Face } from "./parts";
import { dramaSfx } from "./sound";

/** Scenes written on this phone and not played yet: kept, so leaving the game doesn't lose them. */
const WAITING = "changle.drama.waiting";
type Waiting = { id: string; scene: Draft; by: string };
type Step = { k: "intro" } | { k: "pass"; i: number } | { k: "card"; i: number };
type DramaState = Parameters<typeof drama.act>[0];
type Kept = { local: LocalKept<DramaState>; step: Step; waiting: Waiting[] };

function keepDrama(raw: LocalKept<DramaState>): LocalKept<DramaState> {
  const state = { ...raw.state, endsAt: 0, twistAt: 0 };
  const pending = raw.pending.filter((p) => p.key.startsWith("pen:"));
  if (state.phase === "brief" || state.phase === "act") {
    if (state.phase === "act") { state.ready = []; state.twisted = false; }
    state.phase = "brief";
    pending.push({ key: "g:brief", wait: BRIEF_MS });
  } else if (state.phase === "vote") {
    const vote = raw.pending.find((p) => p.key === "g:vote");
    if (vote) pending.push(vote);
  }
  return { state, pending };
}

function restoreDrama(kept: LocalKept<DramaState>): LocalKept<DramaState> {
  const restored = JSON.parse(JSON.stringify(kept)) as LocalKept<DramaState>;
  const key = restored.state.phase === "brief" ? "g:brief" : "g:vote";
  const waiting = restored.pending.find((p) => p.key === key);
  if (waiting) restored.state.endsAt = Date.now() + waiting.wait;
  return restored;
}

function loadWaiting(): Waiting[] {
  try {
    const list = JSON.parse(localStorage.getItem(WAITING) ?? "[]") as Waiting[];
    if (!Array.isArray(list)) return [];
    return list.filter((w) => w && typeof w.by === "string" && w.scene && typeof w.scene.title === "string" && Array.isArray(w.scene.roles));
  } catch {
    return [];
  }
}

function saveWaiting(list: Waiting[]) {
  try {
    if (list.length) localStorage.setItem(WAITING, JSON.stringify(list));
    else localStorage.removeItem(WAITING);
  } catch {
    /* storage can be unavailable: the scene still plays tonight */
  }
}

/**
 * The rules as online but for the two clocks a table of phones needs: online everyone reads and
 * votes at once, and the clocks stop the night waiting on a phone that went to sleep. Here the one
 * phone goes round, so the act starts when the last actor has read their card and the reveal
 * comes when the last ballot is in, however long the phone takes to get round. The act's own
 * clock and the twist stay.
 */
const drama: typeof rules = {
  ...rules,
  timer: (s, key, data, api) => {
    if (key !== "brief" && key !== "vote") rules.timer?.(s, key, data, api);
  },
};

/**
 * One phone: the same rules as online, run on this phone. The phone goes round the actors so
 * each reads their card in private, sits on the table while they act, then goes round the
 * audience for a secret ballot.
 */
export function Drama({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="drama" version={1}>
      {(saved) => <DramaGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function DramaGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, lang, tr } = useStore();
  const zh = lang === "zh";
  const penalty = usePenalty();
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const name = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const nameOf = useCallback((pid: string) => name[pid] ?? "?", [name]);
  const host = ids[0] ?? "";

  const onEvent = useCallback(
    (e: LocalEvent) => {
      if (e.k !== "penalty") return;
      penalty.show({ who: e.p.who.map((pid) => name[pid] ?? "?"), kind: e.p.kind, note: e.p.note ? tr(e.p.note) : undefined, say: e.p.say ? tr(e.p.say) : undefined });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, tr],
  );
  const custom = usePenaltyText().isCustom;
  const [firstGame] = useState(() => saved ? restoreDrama(saved.local) : null);
  const game = useLocalGame<DramaState, DramaView>(drama, ids, onEvent, custom, firstGame);
  const v = game.view(host);
  const act = (pid: string, x: string, data: Record<string, unknown> = {}) => game.act(pid, { x, ...data });

  // a scene written here waits on the phone until it's played: leaving the game doesn't lose it
  const waiting = useRef<Waiting[]>(saved?.waiting ?? []);
  const write = (scene: Draft, by?: string) => {
    const who = by && ids.includes(by) ? by : host;
    const before = new Set(game.view(host).mine.map((w) => w.id));
    act(who, "write", { scene });
    const added = game.view(host).mine.find((w) => !before.has(w.id));
    if (!added) return;
    waiting.current = [...waiting.current, { id: added.id, scene, by: who }];
    saveWaiting(waiting.current);
  };
  // once there's a table: the scenes written last time and never played come back, first in line
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !host) return;
    restored.current = true;
    if (saved) { saveWaiting(waiting.current); return; }
    for (const w of loadWaiting()) write(w.scene, w.by);
    saveWaiting(waiting.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);
  // played, or taken back: no longer waiting
  const mineKey = v.mine.map((w) => `${w.id}${w.played ? "+" : ""}`).join(",");
  useEffect(() => {
    if (!restored.current) return;
    const mine = game.view(host).mine;
    const left = waiting.current.filter((w) => mine.some((m) => m.id === w.id && !m.played));
    if (left.length === waiting.current.length) return;
    waiting.current = left;
    saveWaiting(left);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineKey]);

  // who holds the phone right now, inside a phase: the card readers and the voters take turns
  const [step, setStep] = useState<Step>(saved?.step ?? { k: "intro" });
  const [slate, setSlate] = useState(false);
  const [writing, setWriting] = useState(false);
  const credit = v.credit?.pid ? nameOf(v.credit.pid) : (v.credit?.name ?? null);
  // a dozen scenes from the public library, whenever the setup screen has none
  const libAsked = useRef(-1);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  useEffect(() => {
    if (v.phase !== "setup" || v.lib > 0 || libAsked.current === v.round) return;
    libAsked.current = v.round;
    const ctl = new AbortController();
    let settled = false;
    setLibraryLoading(true);
    setLibraryFailed(false);
    void loadLibrary(zh ? "zh" : "en", [], ctl.signal).then(
      (chunks) => { if (!ctl.signal.aborted) chunks.forEach((scenes) => act(host, "lib", { scenes })); },
      () => { if (!ctl.signal.aborted) setLibraryFailed(true); },
    ).finally(() => { settled = true; if (!ctl.signal.aborted) setLibraryLoading(false); });
    return () => { ctl.abort(); if (!settled) libAsked.current = -1; setLibraryLoading(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, v.lib, v.round, libraryAttempt]);
  const tableScenes = <TableScenes v={v} me={host} isHost nameOf={nameOf} onWrite={() => setWriting(true)} onRemove={(id) => act(host, "unwrite", { id })} library={{ loading: libraryLoading, failed: libraryFailed, retry: () => { libAsked.current = -1; setLibraryAttempt((n) => n + 1); } }} />;
  const round = `${v.round}-${v.phase}`;
  const last = useRef(saved ? round : "");
  useEffect(() => {
    if (last.current === round) return;
    last.current = round;
    setStep({ k: "intro" });
    if (v.phase === "brief") {
      dramaSfx.chimes();
      dramaSfx.deal();
    }
    if (v.phase === "act") setSlate(true);
    if (v.phase === "vote") sfx.applause(1.8, 0.7);
    if (v.phase === "end") sfx.win();
  }, [round, v.phase]);
  useEffect(() => holdBackground(), []);
  // the phone lies on the table through the scene: the screen stays on until the curtain call
  useWakeLock(v.phase !== "setup" && v.phase !== "end");
  // the buttons all sit in one spot at the bottom: a double tap's second tap would press the next
  // screen's (the next actor's card, the vote before the scene, the next act before the reveal)
  const settle = useSettle(`${v.round}|${v.phase}|${step.k}|${"i" in step ? step.i : ""}|${v.ready.length}|${v.voted.length}|${v.cast.map((c) => c.pid).join(",")}`);
  // the house before the curtain, then the set itself
  const scape: Scape | null = v.phase === "brief" ? "foyer" : v.phase === "act" ? (v.mode === "pk" ? "pk" : isKind(v.scene?.kind) ? v.scene!.kind : null) : null;
  useEffect(() => {
    if (!scape) return;
    const from = v.phase === "act" ? v.endsAt - v.actMs : v.endsAt - BRIEF_MS;
    const a = startAmbience(scape, { startPerf: performance.now() - (Date.now() - from), seed: seedOf(`${v.round}|${v.scene?.id ?? ""}|${scape}`) });
    return () => a?.stop(0.8);
    // once per scene and phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scape, v.round]);

  const face: Face = (pid, size) => <NameFace name={nameOf(pid)} size={size} />;
  // a face on a little body, in the colour the player's face has everywhere else
  const actors: Actor[] = v.cast.map((c) => ({ pid: c.pid, role: c.role, name: nameOf(c.pid), face: (size: number) => face(c.pid, size), body: <Figure seat={{ id: nameOf(c.pid), name: nameOf(c.pid), on: true }} /> }));
  const audience = ids.filter((pid) => !v.cast.some((c) => c.pid === pid));

  const stage = (open: boolean, live: boolean, extra?: ReactNode) => (
    <div className="dm-stagebox">
      <Backdrop kind={v.scene?.kind} pk={v.mode === "pk"} live={live}>
        <Cast actors={actors} />
        <Curtain open={open} />
        {extra}
      </Backdrop>
    </div>
  );

  const [actionHost, setActionHost] = useState<HTMLDivElement | null>(null);
  const privateActions = <div className="row" style={{ gap: "var(--space-3)" }} ref={setActionHost} />;
  let body: ReactNode = null;
  let actions: ReactNode = null;
  let turn: string | undefined;
  if (v.phase === "setup") {
    actions = (
      <button type="button" className="btn btn-primary btn-lg" disabled={ids.length < 3} onClick={settle(() => act(host, "start"))}>
        <Play size={18} />
        {ids.length < 3 ? (zh ? "至少三个人才能开演（先加名字）" : "Needs at least three players (add names)") : zh ? "开演" : "Curtain up"}
      </button>
    );
    body = (
      <>
        <div className="dm-stagebox">
          <Marquee />
        </div>
        <SetupPanel cfg={v} onChange={(c) => act(host, "config", c)} />
        {tableScenes}
      </>
    );
  } else if (v.phase === "brief") {
    const readers = v.cast.map((c) => c.pid).filter((pid) => !v.ready.includes(pid));
    if (step.k === "intro") {
      actions = (
        <>
          <button type="button" className="btn btn-ghost btn-lg" onClick={settle(() => act(host, "skip"))}>
            <SkipForward size={14} />
            {zh ? "换个剧本" : "Another scene"}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={settle(() => setStep({ k: "pass", i: 0 }))}>
            {zh ? "发身份牌" : "Deal the cards"}
          </button>
        </>
      );
      body = (
        <>
          {stage(false, false)}
          <Playbill v={v} credit={credit} />
          <Roster v={v} nameOf={nameOf} face={face} />
        </>
      );
    } else {
      const pid = readers[0];
      const c = v.cast.find((x) => x.pid === pid);
      const card = pid ? game.view(pid).me : null;
      if (!pid || !c || !card) body = null;
      else {
        turn = pid;
        if (step.k === "pass") {
          actions = (
            <button type="button" className="btn btn-primary btn-lg" onClick={settle(() => setStep({ k: "card", i: step.i }))}>
              {zh ? `我是 ${nameOf(pid)}` : `I'm ${nameOf(pid)}`}
            </button>
          );
          body = <PassCurtain name={nameOf(pid)} note={zh ? "只有你能看，看完把手机交回桌上" : "For your eyes only. Then put the phone back on the table."} />;
        } else {
          actions = privateActions;
          body = (
            <RoleCard
              inShell
              key={`${v.round}-${pid}`}
              role={c.role}
              brief={c.brief}
              card={card}
              culprit={v.scene?.culprit ?? null}
              pk={v.mode === "pk"}
              line={v.pk?.line}
              onDone={() => {
                act(pid, "ready");
                setStep({ k: "pass", i: step.i + 1 });
              }}
              doneLabel={readers.length > 1 ? (zh ? "记住了，交给下一位" : "Got it. Pass it on") : zh ? "记住了，开演！" : "Got it. Action!"}
            />
          );
        }
      }
    }
  } else if (v.phase === "act") {
    actions = (
      <button type="button" className="btn btn-primary btn-lg" onClick={settle(() => act(host, "cut"))}>
        <Clapperboard size={18} />
        {zh ? "演完了，开始投票" : "That's a wrap: vote"}
      </button>
    );
    body = (
      <>
        {stage(
          true,
          true,
          <>
            <SceneClock endsAt={v.endsAt} total={v.actMs} now={Date.now} />
            {slate && <Slate onDone={() => setSlate(false)} />}
          </>,
        )}
        <TwistBanner twist={v.twist} />
        <Playbill v={v} credit={credit} />
        <p className="dm-wait-note">
          {v.mode === "show"
            ? zh
              ? "手机放桌上，演到一半会有剧情反转，大声念出来！"
              : "Phone on the table. Halfway through, a plot twist lands: read it out loud!"
            : zh
              ? "两人轮流用自己的状态说这句台词"
              : "Each says the line in their own style"}
        </p>
      </>
    );
  } else if (v.phase === "vote") {
    const left = audience.filter((pid) => !v.voted.includes(pid));
    const pid = left[0];
    if (step.k === "intro" || !pid) {
      actions = (
        <button type="button" className="btn btn-primary btn-lg" disabled={!pid} onClick={settle(() => setStep({ k: "pass", i: 0 }))}>
          {zh ? "传手机投票" : "Pass it round to vote"}
        </button>
      );
      body = (
        <>
          {stage(false, false)}
          <p className="dm-wait-note">{zh ? `轮到观众投票：谁是坏人？谁演得最像？（${v.voted.length}/${audience.length}）` : `The audience votes: who's the culprit, and who acted best? (${v.voted.length}/${audience.length})`}</p>
        </>
      );
    } else {
      turn = pid;
      if (step.k === "pass") {
        actions = (
          <button type="button" className="btn btn-primary btn-lg" onClick={settle(() => setStep({ k: "card", i: 0 }))}>
            {zh ? `我是 ${nameOf(pid)}` : `I'm ${nameOf(pid)}`}
          </button>
        );
        body = <PassCurtain name={nameOf(pid)} note={zh ? "偷偷投，别让人看到" : "Vote in secret"} />;
      } else {
        actions = privateActions;
        body = (
          <BallotForm
            inShell
            key={`${v.round}-${pid}`}
            v={game.view(pid)}
            actors={actors}
            onSubmit={(b) => {
              act(pid, "vote", b);
              setStep({ k: "pass", i: 0 });
            }}
          />
        );
      }
    }
  } else if (v.phase === "reveal" && v.result) {
    actions = (
      <button type="button" className="btn btn-primary btn-lg" onClick={settle(() => act(host, "next"))}>
        {v.round >= v.total ? (zh ? "颁奖" : "On to the awards") : zh ? "下一幕" : "Next act"}
      </button>
    );
    body = (
      <>
        <Reveal v={v} actors={actors} face={face} />
        {tableScenes}
      </>
    );
  } else if (v.phase === "end") {
    actions = (
      <>
        <button type="button" className="btn btn-lg btn-ghost" onClick={settle(() => game.reset())}>
          {zh ? "重新选剧本" : "Back to the setup"}
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={settle(() => act(host, "more"))}>
          {zh ? "再演三幕" : "Three more acts"}
        </button>
      </>
    );
    body = (
      <>
        <Finale v={v} ids={ids} nameOf={nameOf} face={face} />
      </>
    );
  }

  useKeepProgress<Kept>({ local: keepDrama(game.keep()), step: v.phase === "act" ? { k: "intro" } : step.k === "card" ? { k: "pass", i: step.i } : step, waiting: waiting.current }, v.phase !== "setup" && v.phase !== "end");
  return (
    <DramaActionHost.Provider value={actionHost}>
      <GameShell
        title={GAME_BY_ID.drama.name}
        rules={<Rules />}
        onBack={onBack}
        penalty={penalty.call}
        onPenaltyDone={penalty.done}
        roster={{ turn }}
        status={v.round > 0 ? { kind: "round", current: v.round, total: v.total } : undefined}
        actions={actions}
      >
        <div className="dm">{body}</div>
        <SceneWriter open={writing} onClose={() => setWriting(false)} level={v.level} writers={players.map((p) => ({ id: p.id, name: p.name }))} onAdd={write} />
      </GameShell>
    </DramaActionHost.Provider>
  );
}
