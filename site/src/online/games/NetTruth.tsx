import { AnimatePresence, motion } from "motion/react";
import { Dices, PenLine, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cloche } from "../../components/Cloche";
import { DareTimer } from "../../components/DareTimer";
import { durationOf } from "../../lib/duration";
import { reduced } from "../../lib/motion";
import { UI } from "../../i18n";
import type { TruthView } from "../../shared/protocol";
import { useStore } from "../../store";
import { Button, Pill } from "../../ui";
import { TruthBottle } from "../../games/TruthBottle";
import { TruthOwn } from "../../games/TruthOwn";
import { fairSeats } from "../../games/truthRules";
import { NetFrame } from "../NetFrame";
import { useReached, useRoom } from "../RoomContext";
import { useNetSpin } from "../useNetSpin";
import { usePlayers } from "../players";
import { HostButton, HostRow, TurnLine, useYourTurn, Waiting } from "./common";
import { Moment } from "../../components/Figure";
import "../../games/TruthDare.css";

export function NetTruth({ v, onLeave }: { v: TruthView; onLeave: () => void }) {
  const { me, isHost, g, nameOf } = useRoom();
  const { ui, tr, lang } = useStore();
  const zh = lang === "zh";
  // the ring is the players, slot for slot as the server counts them (someone just watching isn't on it)
  const seats = usePlayers();
  const count = Math.max(2, seats.length);

  // the bottle rests where it last pointed
  const last = useRef(0);
  const chosenIndex = v.chosen ? seats.findIndex((s) => s.id === v.chosen) : -1;
  if (chosenIndex >= 0) last.current = chosenIndex;
  const rest = Math.min(last.current, count - 1);

  // a fair bottle: never the one spinning, nobody away, nobody picked far more often than the rest
  const fair = useMemo(
    () =>
      new Set(
        fairSeats(
          seats.map((s) => s.id),
          {
            spinner: v.spinner,
            picked: v.picked,
            away: (id) => !seats.find((s) => s.id === id)?.on,
          },
        ),
      ),
    [seats, v.spinner, v.picked],
  );
  const mySpin = v.phase === "spin" && v.spinner === me;
  const { table, weak } = useNetSpin({
    scope: "truth",
    count,
    canSpin: mySpin,
    rest,
    friction: 1.1,
    tick: 0.55,
    allow: (i) => fair.has(seats[i]?.id ?? ""),
  });
  const landed = useReached(v.revealAt) && !table.spinning;
  const chosenMe = v.chosen === me;
  const chosenSeat = v.chosen ? seats.find((s) => s.id === v.chosen) : undefined;
  useYourTurn(mySpin);
  useYourTurn(v.phase === "choose" && landed && chosenMe);

  const [lid, setLid] = useState(false);
  useEffect(() => setLid(false), [v.prompt?.zh, v.phase]);
  // picked: truth, dare and 听天由命 come into sight once the bottle lands (a short phone)
  const chooseBox = useRef<HTMLDivElement>(null);
  const choosing = v.phase === "choose" && landed && chosenMe;
  useEffect(() => {
    if (!choosing) return;
    const id = window.setTimeout(() => chooseBox.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 300);
    return () => window.clearTimeout(id);
  }, [choosing]);

  // once the lid is off, what to do about the card comes into sight (a small phone, a phone on its side)
  const side = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lid) return;
    const id = window.setTimeout(
      () =>
        side.current?.scrollIntoView({
          block: "nearest",
          behavior: reduced() ? "auto" : "smooth",
        }),
      450,
    );
    return () => window.clearTimeout(id);
  }, [lid, v.prompt?.zh]);

  const [nudged, setNudged] = useState(false);
  useEffect(() => {
    if (!weak) return;
    setNudged(true);
    const id = window.setTimeout(() => setNudged(false), 1800);
    return () => window.clearTimeout(id);
  }, [weak]);

  const [ownOpen, setOwnOpen] = useState(false);
  const slips = v.slips ?? { truth: 0, dare: 0, mine: 0 };
  const waiting = slips.truth + slips.dare;

  const lit = (pid: string) => pid === v.chosen && (v.phase !== "choose" || landed);
  const kindName = (k: "truth" | "dare" | null) => (k === "dare" ? (zh ? "大冒险" : "Dare") : zh ? "真心话" : "Truth");
  const seconds = v.prompt ? durationOf(v.prompt) : null;

  const rules = (
    <p>
      {zh
        ? "轮到谁，谁的手机上可以拨瓶子，所有人的手机上瓶子一起转。瓶口指到谁，谁在自己手机上选真心话或大冒险，也可以听天由命，点开念出来。不做就认罚。被指到的人下一轮转瓶子。每人每局可以换一次题。瓶子不会指不在线的人，也不会老指着那几个人。每个人都可以匿名出题，大家出的先抽。"
        : "Whoever's turn it is flicks the bottle on their phone; it spins on every phone at once. Whoever it points at picks truth or dare on their own phone, or leaves it to chance, then lifts the lid and reads it out. Refuse and take the penalty. The one it picked spins next. Everyone can swap one card a game. The bottle skips anyone offline, and won't keep picking the same few. Anyone can add cards without their name on them; those come up first."}
    </p>
  );

  return (
    <NetFrame title={UI.gameTruth} rules={rules} onLeave={onLeave}>
      <div className="segmented-row truth-top">
        <span className="heat-group">
          <span className="hint">{ui("heat")}</span>
          {isHost ? (
            <span className="lang-tab heat-tab" role="group" aria-label={ui("heat")}>
              <button aria-pressed={v.heat === 1} onClick={() => g("heat", { heat: 1 })}>
                {ui("mild")}
              </button>
              <button aria-pressed={v.heat === 2} onClick={() => g("heat", { heat: 2 })} className="heat-spicy">
                {ui("spicy")}
              </button>
            </span>
          ) : (
            <Pill tone={v.heat === 2 ? "danger" : "neutral"}>{v.heat === 2 ? ui("spicy") : ui("mild")}</Pill>
          )}
        </span>
        {v.slips && (
          <button
            type="button"
            className="btn btn-quiet btn-sm own-open"
            onClick={() => setOwnOpen(true)}
            aria-label={(zh ? "自己出题" : "Your cards") + (waiting > 0 ? ` (${waiting})` : "")}
          >
            <PenLine aria-hidden="true" />
            <span className="own-open-label">{zh ? "自己出题" : "Your cards"}</span>
            {waiting > 0 && <span className="own-badge">{waiting}</span>}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {v.phase !== "card" ? (
          <motion.div key="bottle" className="bottle-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <TruthBottle seats={seats} count={count} rotation={table.rotation} lit={lit} me={me} grab={mySpin} handlers={table.handlers} />

            <div className="bottle-actions">
              {v.phase === "spin" && (
                <>
                  {mySpin ? (
                    <>
                      <button type="button" className="btn btn-primary btn-lg" onClick={() => table.flick()} disabled={table.spinning}>
                        {table.spinning ? ui("spinning") : zh ? "转瓶子" : "Spin the bottle"}
                      </button>
                      <p className="hint" aria-live="polite">
                        {nudged ? (zh ? "再用力一点" : "Harder than that") : zh ? "也可以直接用手拨" : "Or flick it with a finger"}
                      </p>
                    </>
                  ) : (
                    <>
                      <TurnLine pid={v.spinner} />
                      <Waiting>{zh ? `等 ${nameOf(v.spinner)} 转瓶子` : `Waiting for ${nameOf(v.spinner)} to spin`}</Waiting>
                    </>
                  )}
                </>
              )}
              {v.phase === "choose" &&
                (!landed ? (
                  <Waiting>{ui("spinning")}</Waiting>
                ) : chosenMe ? (
                  <motion.div ref={chooseBox} className="choose-box" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    {chosenSeat && <Moment seat={chosenSeat} kind="picked" small />}
                    <p className="choose-who">
                      <span className="turn-name">{ui("yourTurnNow")}</span>
                    </p>
                    <div className="row" style={{ gap: 10, width: "100%" }}>
                      <button type="button" className="btn btn-porcelain btn-lg btn-block" onClick={() => g("pick", { kind: "truth" })}>
                        {kindName("truth")}
                      </button>
                      <button type="button" className="btn btn-gold btn-lg btn-block" onClick={() => g("pick", { kind: "dare" })}>
                        {kindName("dare")}
                      </button>
                    </div>
                    {v.rand !== undefined && (
                      <Button tone="quiet" size="sm" icon={Dices} onClick={() => g("pick", { kind: "random" })}>
                        {zh ? "听天由命" : "Surprise me"}
                      </Button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div className="choose-box" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    {chosenSeat && <Moment seat={chosenSeat} kind="picked" small />}
                    <p className="choose-who">
                      <span className="turn-name">{nameOf(v.chosen)}</span>
                    </p>
                    <Waiting>{zh ? "正在选真心话还是大冒险" : "is choosing truth or dare"}</Waiting>
                  </motion.div>
                ))}
            </div>
          </motion.div>
        ) : (
          v.prompt && (
            <motion.div key={`card-${v.prompt.zh}`} className="card-flow truth-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="turn-line">
                <span className="turn-name">{chosenMe ? ui("yourTurnNow") : nameOf(v.chosen)}</span>
                <span className={`kind-tag ${v.kind}`}>{kindName(v.kind)}</span>
                {v.rand && (
                  <Pill icon={Dices} tone="neutral">
                    {zh ? "听天由命" : "Left to chance"}
                  </Pill>
                )}
                {v.own && <Pill tone="warning">{zh ? "大家出的" : "From the table"}</Pill>}
              </p>
              <Cloche open={lid} onOpen={() => setLid(true)}>
                <div className="prompt-card">
                  <p className="prompt-text">{v.own ? v.prompt.zh : tr(v.prompt)}</p>
                </div>
              </Cloche>
              <div className="truth-side" ref={side}>
                {/* a dare that names a time: each phone can count it down on its own */}
                {lid && seconds !== null && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <DareTimer seconds={seconds} lang={lang} resetKey={v.prompt.zh} />
                  </motion.div>
                )}
                <AnimatePresence>
                  {lid &&
                    (chosenMe ? (
                      <motion.div key="mine" className="stack swap-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                        <div className="row" style={{ gap: 10 }}>
                          <button type="button" className="btn btn-penalty btn-block" onClick={() => g("pass")}>
                            {ui("pass")}
                          </button>
                          <button type="button" className="btn btn-jade btn-block" onClick={() => g("done")}>
                            {v.kind === "truth" ? (zh ? "答完了" : "Answered") : zh ? "做完了" : "Done it"}
                          </button>
                        </div>
                        {v.swapLeft && (
                          <div className="swap-row">
                            <Button tone="quiet" size="sm" icon={RefreshCw} onClick={() => g("swap")}>
                              {zh ? "换一张（每局一次）" : "Swap it (once a game)"}
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="theirs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                        <Waiting>
                          {v.kind === "truth"
                            ? zh
                              ? `听 ${nameOf(v.chosen)} 说`
                              : `Over to ${nameOf(v.chosen)}`
                            : zh
                              ? `看 ${nameOf(v.chosen)} 做`
                              : `Over to ${nameOf(v.chosen)}`}
                        </Waiting>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      <HostRow>
        {v.phase === "spin" && !mySpin && <HostButton onClick={() => g("skip", { at: `spin:${v.spinner}` })}>{ui("skip")}</HostButton>}
        {v.phase !== "spin" && !chosenMe && (
          <HostButton
            onClick={() =>
              g(v.phase === "card" ? "done" : "skip", {
                at: `${v.phase}:${v.chosen}`,
              })
            }
          >
            {ui("skip")}
          </HostButton>
        )}
      </HostRow>

      <TruthOwn
        open={ownOpen}
        onClose={() => setOwnOpen(false)}
        lang={lang}
        counts={slips}
        onAdd={(kind, text) => g("add", { kind, text })}
        onClear={isHost ? () => g("clearOwn") : undefined}
      />
    </NetFrame>
  );
}
