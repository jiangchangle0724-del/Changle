import { AnimatePresence, motion } from "motion/react";
import { Dices, Ear, PenLine, RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cloche } from "../../components/Cloche";
import { DareTimer } from "../../components/DareTimer";
import type { Limit } from "../../data/truthDare";
import { durationOf } from "../../lib/duration";
import { reduced } from "../../lib/motion";
import { UI } from "../../i18n";
import type { TruthView } from "../../shared/protocol";
import { useStore } from "../../store";
import { Button, Pill, Sheet } from "../../ui";
import { TruthBottle } from "../../games/TruthBottle";
import { TruthLimits, readLimits, writeLimits } from "../../games/TruthLimits";
import { TruthOwn } from "../../games/TruthOwn";
import { TruthRecap } from "../../games/TruthRecap";
import { WhisperCoin, WhisperNames } from "../../games/TruthWhisper";
import { fairSeats } from "../../games/truthRules";
import { NetFrame } from "../NetFrame";
import { useReached, useRoom } from "../RoomContext";
import { useNetSpin } from "../useNetSpin";
import { usePlayers } from "../players";
import { HostButton, HostRow, TurnLine, useYourTurn, Waiting } from "./common";
import { Moment } from "../../components/Figure";
import "../../games/TruthDare.css";

type Kind = NonNullable<TruthView["kind"]>;

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
          { spinner: v.spinner, picked: v.picked, away: (id) => !seats.find((s) => s.id === id)?.on },
        ),
      ),
    [seats, v.spinner, v.picked],
  );
  const mySpin = v.phase === "spin" && v.spinner === me;
  const { table, weak } = useNetSpin({ scope: "truth", count, canSpin: mySpin, rest, friction: 1.1, tick: 0.55, allow: (i) => fair.has(seats[i]?.id ?? "") });
  const landed = useReached(v.revealAt) && !table.spinning;
  const chosenMe = v.chosen === me;
  const chosenSeat = v.chosen ? seats.find((s) => s.id === v.chosen) : undefined;
  useYourTurn(mySpin);
  useYourTurn(v.phase === "choose" && landed && chosenMe);

  // 悄悄话: the one picked reads it alone; a name, then the coin (every phone sees it land at flipAt)
  const secret = v.kind === "secret";
  const coinDown = useReached(v.flipAt ?? 0);
  const coin = v.named && coinDown ? (v.coin ?? null) : null;
  useYourTurn(secret && coin === "hidden" && v.named === me);

  const [lid, setLid] = useState(false);
  useEffect(() => setLid(false), [v.prompt?.zh, v.phase]);
  // picked: the choices come into sight once the bottle lands (a short phone)
  const chooseBox = useRef<HTMLDivElement>(null);
  const choosing = v.phase === "choose" && landed && chosenMe;
  useEffect(() => {
    if (!choosing) return;
    const id = window.setTimeout(() => chooseBox.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 300);
    return () => window.clearTimeout(id);
  }, [choosing]);

  // once the lid is off (or a whisper moves on), what to do about it comes into sight
  const side = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lid && !v.named) return;
    const id = window.setTimeout(() => side.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 450);
    return () => window.clearTimeout(id);
  }, [lid, v.prompt?.zh, v.named, coin]);

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

  // my limits: kept on this phone, sent to the table whenever a game starts without them
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [mine, setMine] = useState<Limit[]>(() => readLimits().me ?? []);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !v.limits) return;
    sent.current = true;
    if (!v.limits.length && mine.length) g("limits", { list: mine });
  }, [v.limits, mine, g]);
  const setMyLimits = (list: Limit[]) => {
    setMine(list);
    writeLimits({ ...readLimits(), me: list });
    g("limits", { list });
  };

  const lit = (pid: string) => pid === v.chosen && (v.phase !== "choose" || landed);
  const kindName = (k: Kind | null) => (k === "dare" ? (zh ? "大冒险" : "Dare") : k === "secret" ? (zh ? "悄悄话" : "Whisper") : zh ? "真心话" : "Truth");
  const seconds = v.prompt && !secret ? durationOf(v.prompt) : null;
  const people = seats.map((s) => ({ id: s.id, name: s.name }));

  const rules = (
    <>
      <p>
        {zh
          ? "轮到谁，谁的手机上可以拨瓶子，所有人的手机上瓶子一起转。瓶口指到谁，谁在自己手机上选真心话或大冒险，也可以听天由命，点开念出来。不做就认罚。被指到的人下一轮转瓶子。每人每局可以换一次题。瓶子不会指不在线的人，也不会老指着那几个人。每个人都可以匿名出题，大家出的先抽。"
          : "Whoever's turn it is flicks the bottle on their phone; it spins on every phone at once. Whoever it points at picks truth or dare on their own phone, or leaves it to chance, then lifts the lid and reads it out. Refuse and take the penalty. The one it picked spins next. Everyone can swap one card a game. The bottle skips anyone offline, and won't keep picking the same few. Anyone can add cards without their name on them; those come up first."}
      </p>
      <p>
        {zh
          ? "悄悄话：被指到的人在自己手机上看一个关于在座的人的问题，别人看不到，然后大声说出一个名字，再点一下是谁。硬币正面，问题公开；反面，问题保密，被点名的人认罚就能看。"
          : "Whisper: whoever's picked reads a question about the people here on their own phone, unseen, says one name out loud and taps who. Heads, everyone sees the question; tails, it stays secret unless the one named takes a penalty to see it."}
      </p>
      <p>
        {zh
          ? "我的底线：不想被碰、不想动手机、不想聊感情，或者只要温和的题，在自己手机上选，抽到你时就跳过这些题，别人看不到。"
          : "My limits: if you'd rather skip touching, your phone, your love life, or anything spicy, switch it on on your own phone. Your cards steer clear, and nobody else sees."}
      </p>
    </>
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
              {v.phase === "spin" &&
                (mySpin ? (
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
                ))}
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
                    <div className="choose-more">
                      {v.tally && (
                        <Button tone="quiet" size="sm" icon={Ear} onClick={() => g("pick", { kind: "secret" })}>
                          {zh ? "悄悄话" : "Whisper"}
                        </Button>
                      )}
                      {v.rand !== undefined && (
                        <Button tone="quiet" size="sm" icon={Dices} onClick={() => g("pick", { kind: "random" })}>
                          {zh ? "听天由命" : "Surprise me"}
                        </Button>
                      )}
                    </div>
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
          (v.prompt || secret) && (
            <motion.div
              key={`card-${v.kind}-${secret && !chosenMe ? v.chosen : v.prompt?.zh}`}
              className="card-flow truth-flow"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
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

              {secret ? (
                v.named ? (
                  // named: every phone the same, the coin and then the question or its secret
                  coin === "open" && v.prompt ? (
                    <div className="prompt-card porcelain">
                      <p className="prompt-text">{tr(v.prompt)}</p>
                    </div>
                  ) : null
                ) : chosenMe && v.prompt ? (
                  <>
                    <p className="whisper-hint">
                      {lid
                        ? zh
                          ? "只有你看得到。大声说出一个在座的名字，再点一下是谁。"
                          : "Only you can see this. Say one name out loud, then tap who."
                        : zh
                          ? "一个关于在座的人的问题，只有你看得到。"
                          : "A question about the people here. Only you will see it."}
                    </p>
                    <Cloche open={lid} onOpen={() => setLid(true)} label={zh ? "只给你看" : "Eyes only: you"}>
                      <div className="prompt-card">
                        <p className="prompt-text">{tr(v.prompt)}</p>
                      </div>
                    </Cloche>
                  </>
                ) : (
                  <Waiting>
                    {zh ? `${nameOf(v.chosen)} 在看一个只有 TA 看得到的问题，等 TA 说出一个名字` : `${nameOf(v.chosen)} is reading a question only they can see. Wait for a name.`}
                  </Waiting>
                )
              ) : (
                v.prompt && (
                  <Cloche open={lid} onOpen={() => setLid(true)}>
                    <div className="prompt-card">
                      <p className="prompt-text">{v.own ? v.prompt.zh : tr(v.prompt)}</p>
                    </div>
                  </Cloche>
                )
              )}

              <div className="truth-side" ref={side}>
                {/* a dare that names a time: each phone can count it down on its own */}
                {lid && seconds !== null && v.prompt && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <DareTimer seconds={seconds} lang={lang} resetKey={v.prompt.zh} />
                  </motion.div>
                )}

                {secret && !v.named && chosenMe && lid && (
                  <WhisperNames people={people} lang={lang} ask={zh ? "你说的是谁？" : "Whom did you name?"} onPick={(who) => g("name", { who })} />
                )}
                {secret && v.named && (
                  <>
                    <p className="whisper-named">{zh ? `${nameOf(v.chosen)} 说的是 ${nameOf(v.named)}` : `${nameOf(v.chosen)} named ${nameOf(v.named)}`}</p>
                    <WhisperCoin landed={coin} lang={lang} />
                    {coin === "hidden" &&
                      (v.named === me ? (
                        <button type="button" className="btn btn-penalty btn-block" onClick={() => g("peek")}>
                          {zh ? "认罚看题" : "Pay to see it"}
                        </button>
                      ) : (
                        <Waiting>{zh ? `${nameOf(v.named)} 认罚就能看到问题` : `${nameOf(v.named)} can take a penalty to see it`}</Waiting>
                      ))}
                    {coin &&
                      (chosenMe ? (
                        <button type="button" className="btn btn-jade btn-block" onClick={() => g("done")}>
                          {zh ? "下一轮" : "Next round"}
                        </button>
                      ) : (
                        <Waiting>{zh ? `等 ${nameOf(v.chosen)} 开始下一轮` : `Waiting for ${nameOf(v.chosen)} to move on`}</Waiting>
                      ))}
                  </>
                )}

                <AnimatePresence>
                  {lid &&
                    !v.named &&
                    (chosenMe ? (
                      <motion.div key="mine" className="stack swap-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                        <div className="row" style={{ gap: 10 }}>
                          <button type="button" className="btn btn-penalty btn-block" onClick={() => g("pass")}>
                            {ui("pass")}
                          </button>
                          {!secret && (
                            <button type="button" className="btn btn-jade btn-block" onClick={() => g("done")}>
                              {v.kind === "truth" ? (zh ? "答完了" : "Answered") : zh ? "做完了" : "Done it"}
                            </button>
                          )}
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
                      !secret && (
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
                      )
                    ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {v.limits && (
        <div className="truth-more">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setLimitsOpen(true)}>
            <ShieldCheck aria-hidden="true" />
            {zh ? "我的底线" : "My limits"}
            {mine.length > 0 && <span className="own-badge">{mine.length}</span>}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRecapOpen(true)}>
            <Trophy aria-hidden="true" />
            {zh ? "这局小结" : "Recap"}
          </button>
        </div>
      )}

      <HostRow>
        {v.phase === "spin" && !mySpin && <HostButton onClick={() => g("skip", { at: `spin:${v.spinner}` })}>{ui("skip")}</HostButton>}
        {v.phase !== "spin" && !chosenMe && <HostButton onClick={() => g(v.phase === "card" ? "done" : "skip", { at: `${v.phase}:${v.chosen}` })}>{ui("skip")}</HostButton>}
      </HostRow>

      <TruthOwn
        open={ownOpen}
        onClose={() => setOwnOpen(false)}
        lang={lang}
        counts={slips}
        onAdd={(kind, text) => g("add", { kind, text })}
        onClear={isHost ? () => g("clearOwn") : undefined}
      />
      <TruthLimits open={limitsOpen} onClose={() => setLimitsOpen(false)} lang={lang} people={[{ id: "me" }]} limits={{ me: mine }} onChange={(_, list) => setMyLimits(list)} />
      <Sheet open={recapOpen} onClose={() => setRecapOpen(false)} lang={lang} title={zh ? "这局小结" : "This game so far"}>
        <TruthRecap lang={lang} people={people} picked={v.picked ?? {}} tally={v.tally ?? {}} penalties />
      </Sheet>
    </NetFrame>
  );
}
