import { Clapperboard, Play, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Figure } from "../../components/Figure";
import { GameShell, usePenalty } from "../../games/GameShell";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import { BRIEF_MS, drama } from "../../shared/engine/games/drama";
import type { DramaView } from "../../shared/protocol";
import { useStore } from "../../store";
import { NameFace, PassCurtain } from "../common";
import { seedOf, startAmbience, type Scape } from "./ambience";
import { useLocalGame, type LocalEvent } from "./local";
import { Backdrop, BallotForm, Cast, Curtain, Finale, isKind, Marquee, Playbill, Reveal, RoleCard, Roster, Rules, SceneClock, SetupPanel, Slate, TwistBanner, type Actor, type Face } from "./parts";
import { dramaSfx } from "./sound";

/**
 * One phone: the same rules as online, run on this phone. The phone goes round the actors so
 * each reads their card in private, sits on the table while they act, then goes round the
 * audience for a secret ballot.
 */
export function Drama({ onBack }: { onBack: () => void }) {
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
  const game = useLocalGame<unknown, DramaView>(drama, ids, onEvent);
  const v = game.view(host);
  const act = (pid: string, x: string, data: Record<string, unknown> = {}) => game.act(pid, { x, ...data });

  // who holds the phone right now, inside a phase: the card readers and the voters take turns
  const [step, setStep] = useState<{ k: "intro" } | { k: "pass"; i: number } | { k: "card"; i: number }>({ k: "intro" });
  const [slate, setSlate] = useState(false);
  const round = `${v.round}-${v.phase}`;
  const last = useRef("");
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

  let body: ReactNode = null;
  if (v.phase === "setup") {
    body = (
      <>
        <div className="dm-stagebox">
          <Marquee />
        </div>
        <SetupPanel cfg={v} onChange={(c) => act(host, "config", c)} />
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={ids.length < 3} onClick={() => act(host, "start")}>
          <Play size={18} />
          {ids.length < 3 ? (zh ? "至少三个人才能开演（先加名字）" : "Needs at least three players (add names)") : zh ? "开演" : "Curtain up"}
        </button>
      </>
    );
  } else if (v.phase === "brief") {
    const readers = v.cast.map((c) => c.pid).filter((pid) => !v.ready.includes(pid));
    if (step.k === "intro") {
      body = (
        <>
          {stage(false, false)}
          <Playbill v={v} />
          <Roster v={v} nameOf={nameOf} face={face} />
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setStep({ k: "pass", i: 0 })}>
            {zh ? "发身份牌" : "Deal the cards"}
          </button>
          <div className="dm-stage-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => act(host, "skip")}>
              <SkipForward size={14} />
              {zh ? "换个剧本" : "Another scene"}
            </button>
          </div>
        </>
      );
    } else {
      const pid = readers[0];
      const c = v.cast.find((x) => x.pid === pid);
      const card = pid ? game.view(pid).me : null;
      if (!pid || !c || !card) body = null;
      else if (step.k === "pass")
        body = <PassCurtain name={nameOf(pid)} note={zh ? "只有你能看，看完把手机交回桌上" : "For your eyes only. Then put the phone back on the table."} onReady={() => setStep({ k: "card", i: step.i })} />;
      else
        body = (
          <RoleCard
            key={`${v.round}-${pid}`}
            role={c.role}
            brief={c.brief}
            card={card}
            culprit={v.scene?.culprit ?? null}
            pk={v.mode === "pk"}
            onDone={() => {
              act(pid, "ready");
              setStep({ k: "pass", i: step.i + 1 });
            }}
            doneLabel={readers.length > 1 ? (zh ? "记住了，交给下一位" : "Got it. Pass it on") : zh ? "记住了，开演！" : "Got it. Action!"}
          />
        );
    }
  } else if (v.phase === "act") {
    body = (
      <>
        {stage(true, true, (
          <>
            <SceneClock endsAt={v.endsAt} total={v.actMs} now={Date.now} />
            {slate && <Slate onDone={() => setSlate(false)} />}
          </>
        ))}
        <TwistBanner twist={v.twist} />
        <Playbill v={v} />
        <p className="dm-wait-note">{v.mode === "show" ? (zh ? "手机放桌上，演到一半会有剧情反转，大声念出来！" : "Phone on the table. Halfway through, a plot twist lands: read it out loud!") : zh ? "两人轮流用自己的状态说这句台词" : "Each says the line in their own style"}</p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => act(host, "cut")}>
          <Clapperboard size={18} />
          {zh ? "演完了，开始投票" : "That's a wrap: vote"}
        </button>
      </>
    );
  } else if (v.phase === "vote") {
    const left = audience.filter((pid) => !v.voted.includes(pid));
    const pid = left[0];
    if (step.k === "intro" || !pid) {
      body = (
        <>
          {stage(false, false)}
          <p className="dm-wait-note">{zh ? `轮到观众投票：谁是坏人？谁演得最像？（${v.voted.length}/${audience.length}）` : `The audience votes: who's the culprit, and who acted best? (${v.voted.length}/${audience.length})`}</p>
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!pid} onClick={() => setStep({ k: "pass", i: 0 })}>
            {zh ? "传手机投票" : "Pass it round to vote"}
          </button>
        </>
      );
    } else if (step.k === "pass") {
      body = <PassCurtain name={nameOf(pid)} note={zh ? "偷偷投，别让人看到" : "Vote in secret"} onReady={() => setStep({ k: "card", i: 0 })} />;
    } else {
      body = (
        <BallotForm
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
  } else if (v.phase === "reveal" && v.result) {
    body = (
      <>
        <Reveal v={v} actors={actors} face={face} />
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => act(host, "next")}>
          {v.round >= v.total ? (zh ? "颁奖" : "On to the awards") : zh ? "下一幕" : "Next act"}
        </button>
      </>
    );
  } else if (v.phase === "end") {
    body = (
      <>
        <Finale v={v} ids={ids} nameOf={nameOf} face={face} />
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => act(host, "more")}>
          {zh ? "再演三幕" : "Three more acts"}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => game.reset()}>
          {zh ? "重新选剧本" : "Back to the setup"}
        </button>
      </>
    );
  }

  return (
    <GameShell title={GAME_BY_ID.drama.name} rules={<Rules />} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <div className="dm">{body}</div>
    </GameShell>
  );
}
