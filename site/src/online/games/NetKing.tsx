import { Crown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { PorcelainDefs } from "../../components/Dish";
import { UI } from "../../i18n";
import { haptic, sfx } from "../../lib/sfx";
import type { KingView } from "../../shared/protocol";
import { useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useRoom } from "../RoomContext";
import { HostButton, HostRow, SeatPicker, useYourTurn, Waiting } from "./common";
import { Moment } from "../../components/Figure";

export function NetKing({ v, onLeave }: { v: KingView; onLeave: () => void }) {
  const { me, g, nameOf, room } = useRoom();
  const kingSeat = v.king ? room?.seats.find((s) => s.id === v.king) : undefined;
  const { ui, tr, lang } = useStore();
  const inRound = v.inRound.includes(me);
  const amKing = v.king === me;
  const ready = v.ready.includes(me);
  useYourTurn(v.phase === "crown" && amKing);

  // which stick this phone pulled, per round; everyone else's come out of the holder from the right
  const [myStick, setMyStick] = useState<{ round: number; i: number } | null>(null);
  const stickOf = useMemo(() => {
    const map = new Map<string, number>();
    const mine = myStick?.round === v.round ? myStick.i : null;
    if (mine !== null) map.set(me, mine);
    let next = v.count - 1;
    for (const pid of v.pulledIds) {
      if (pid === me && mine !== null) continue;
      while (next >= 0 && [...map.values()].includes(next)) next--;
      if (next < 0) break;
      map.set(pid, next);
      next--;
    }
    return map;
  }, [v.pulledIds, v.count, v.round, myStick, me]);

  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!v.pulled) {
      setRevealed(false);
      return;
    }
    // every stick sounds the same: nobody on the call hears who is king
    const id = window.setTimeout(() => {
      setRevealed(true);
      sfx.pluck(6, 0.8);
    }, 380);
    return () => window.clearTimeout(id);
  }, [v.pulled, v.round]);

  const [refusing, setRefusing] = useState(false);
  useEffect(() => setRefusing(false), [v.phase, v.round]);

  const sticks = useMemo(
    () => Array.from({ length: v.count }, (_, i) => ({ i, h: 150 + ((i * 37) % 5) * 6, x: 60 + (240 / Math.max(1, v.count - 1)) * i })),
    [v.count],
  );

  const pull = (i: number) => {
    if (v.phase !== "deal" || v.pulled || !inRound) return;
    setMyStick({ round: v.round, i });
    g("pull");
    sfx.woodblock(1.3, 0.7);
    sfx.whoosh(0.3, true);
    haptic(12);
  };

  const token = v.myToken;
  const tokenText = token === null ? "" : token === "K" ? (lang === "zh" ? "国王" : "King") : lang === "zh" ? `${token} 号` : `No. ${token}`;

  const rules = (
    <p>
      {lang === "zh"
        ? "每个人在自己的手机上抽一支签，只有自己能看到。一支是国王，其余是号码。国王现身后抽一张命令，命令只叫号码不叫名字：被叫到的人在手机上按一下站出来，然后照做。不做的，国王罚他喝。"
        : "Everyone draws a stick on their own phone, and only they see it. One is the king, the rest are numbers. The king draws a command that calls numbers, never names: whoever holds a called number taps to step forward, then does it. Refuse and the king makes you drink."}
    </p>
  );

  return (
    <NetFrame title={UI.gameKing} rules={rules} onLeave={onLeave}>
      {token !== null && (
        <p className="token-pill-row">
          <span className={`token-pill ${token === "K" ? "is-king" : ""}`}>
            {token === "K" && <Crown size={14} strokeWidth={2.6} />}
            {lang === "zh" ? `我是${tokenText}` : `I'm ${token === "K" ? "the King" : tokenText}`}
          </span>
          <span className="hint">{lang === "zh" ? "别说出来" : "Keep it to yourself"}</span>
        </p>
      )}

      <AnimatePresence mode="wait">
        {v.phase === "deal" && (
          <motion.div key={`deal-${v.round}`} className="stack" style={{ gap: 12 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <p className="hint" style={{ textAlign: "center" }}>
              {!inRound
                ? lang === "zh"
                  ? "这一轮发签时你还没入座，下一轮带上你"
                  : "You sat down after this round was dealt. Next round."
                : !v.pulled
                  ? lang === "zh"
                    ? "抽一支签，只有你看得到"
                    : "Draw a stick. Only you can see it."
                  : ready
                    ? ui("answeredN", { n: v.ready.length, m: v.count })
                    : "\u00a0"}
            </p>

            <svg viewBox="0 0 360 300" className="holder-svg">
              <PorcelainDefs />
              <ellipse cx={180} cy={170} rx={140} ry={16} fill="var(--dusk-3)" />
              <ellipse cx={180} cy={170} rx={132} ry={11} fill="var(--night)" />
              {sticks.map((s) => {
                const owner = [...stickOf.entries()].find(([, i]) => i === s.i)?.[0];
                const isMine = owner === me && v.pulled;
                const goneOther = !!owner && owner !== me;
                const canPull = inRound && !v.pulled && !owner;
                return (
                  <motion.g
                    key={s.i}
                    style={{ cursor: canPull ? "pointer" : "default" }}
                    initial={false}
                    animate={{ y: isMine ? -150 : goneOther ? -90 : 0, opacity: goneOther ? 0 : 1, rotate: isMine ? -3 : 0 }}
                    transition={{ type: "spring", stiffness: 220, damping: 20 }}
                    onClick={() => canPull && pull(s.i)}
                    role="button"
                    aria-label={`stick ${s.i + 1}`}
                    aria-disabled={!canPull}
                  >
                    <rect x={s.x - 5} y={170 - s.h} width={10} height={s.h + 110} rx={4} fill="url(#bamboo)" />
                    <AnimatePresence>
                      {isMine && revealed && token !== null && (
                        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <rect x={s.x - 9} y={170 + 60} width={18} height={46} rx={5} fill={token === "K" ? "var(--gel)" : "var(--moon)"} />
                          <text
                            x={s.x}
                            y={170 + 84}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={token === "K" ? 14 : 15}
                            fontWeight={800}
                            fill="var(--night)"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {token === "K" ? "♛" : token}
                          </text>
                        </motion.g>
                      )}
                    </AnimatePresence>
                  </motion.g>
                );
              })}
              <path d="M 40 170 L 320 170 L 300 290 L 60 290 Z" fill="url(#plate)" filter="url(#dishShadow)" />
              <path d="M 40 170 A 140 16 0 0 0 320 170" fill="var(--dusk-3)" />
              <path d="M 52 184 L 308 184" stroke="var(--gel)" strokeWidth={2} opacity={0.9} />
              <path d="M 56 196 L 304 196" stroke="var(--gel)" strokeWidth={1} opacity={0.5} />
              <path d="M 70 276 L 290 276" stroke="var(--line)" strokeWidth={1} opacity={0.7} />
            </svg>

            <AnimatePresence>
              {v.pulled && revealed && !ready && token !== null && (
                <motion.div key="tok" className="porcelain reveal-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <p className={`word-big ${token === "K" ? "zh-display king-red" : "en-display"}`}>{tokenText}</p>
                  <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => g("ready")}>
                    {lang === "zh" ? "记住了" : "Got it"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {ready && <Waiting>{lang === "zh" ? "等其他人看完自己的签" : "Waiting for everyone to check their stick"}</Waiting>}
          </motion.div>
        )}

        {v.phase === "crown" && v.king && (
          <motion.div key={`crown-${v.round}`} className="stack" style={{ gap: 16, alignItems: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {kingSeat && <Moment seat={kingSeat} kind="king" />}
            <div className="porcelain reveal-card crown-card">
              <p className="hint-ink">{amKing ? (lang === "zh" ? "你是" : "You are") : lang === "zh" ? "国王是" : "The king is"}</p>
              <p className={`word-big king-red ${lang === "zh" ? "zh-display" : "en-display"}`}>{amKing ? (lang === "zh" ? "国王" : "the King") : nameOf(v.king)}</p>
              <p className="hint-ink">{lang === "zh" ? "其他人记好自己的号码，别说出来。" : "Everyone else: keep your number to yourself."}</p>
            </div>
            {amKing ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("command")}>
                {lang === "zh" ? "国王抽命令" : "Draw a command"}
              </button>
            ) : (
              <Waiting>{lang === "zh" ? `等国王 ${nameOf(v.king)} 抽命令` : `Waiting for King ${nameOf(v.king)}`}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "command" && v.cmd && (
          <motion.div key={`cmd-${v.round}`} className="card-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="hint">{lang === "zh" ? "国王" : "King"}</span>
              <span className="turn-name">{amKing ? ui("you") : nameOf(v.king)}</span>
            </p>
            <div className="porcelain prompt-card">
              <p className="prompt-text">{tr(v.cmd.text)}</p>
              <p className="hint-ink prompt-other">{lang === "zh" ? v.cmd.text.en : v.cmd.text.zh}</p>
            </div>
            <div className="called-row">
              {v.cmd.nums.map((n) => {
                const who = v.stepped[String(n)];
                return (
                  <motion.span key={n} className={`called-chip ${who ? "is-out" : ""}`} layout>
                    <span className="en-display">{lang === "zh" ? `${n}号` : `No. ${n}`}</span>
                    {who && <span className="called-who">{who === me ? ui("you") : nameOf(who)}</span>}
                  </motion.span>
                );
              })}
            </div>
            {typeof token === "number" && v.cmd.nums.includes(token) && !v.stepped[String(token)] && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("step")}>
                {lang === "zh" ? `我是 ${token} 号，站出来` : `I'm No. ${token}. Step up`}
              </button>
            )}
            {amKing ? (
              refusing ? (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="hint">{lang === "zh" ? "谁不执行？点一下，他喝。" : "Who refused? Tap them. They drink."}</p>
                  <SeatPicker
                    exclude={[v.king ?? "", ...v.refused]}
                    onPick={(pid) => {
                      g("refuse", { target: pid });
                      setRefusing(false);
                    }}
                  />
                  <button type="button" className="btn btn-ghost" onClick={() => setRefusing(false)}>
                    {ui("close")}
                  </button>
                </div>
              ) : (
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="btn btn-penalty btn-block" onClick={() => setRefusing(true)}>
                    {lang === "zh" ? "有人不做" : "Someone refuses"}
                  </button>
                  <button type="button" className="btn btn-jade btn-block" onClick={() => g("next")}>
                    {lang === "zh" ? "执行完毕，下一轮" : "Done. Next round"}
                  </button>
                </div>
              )
            ) : (
              !(typeof token === "number" && v.cmd.nums.includes(token) && !v.stepped[String(token)]) && <Waiting>{lang === "zh" ? "国王看着呢" : "The king is watching"}</Waiting>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <HostRow>
        {v.phase === "deal" && <HostButton onClick={() => g("force")}>{ui("goNow")}</HostButton>}
        {v.phase === "crown" && !amKing && <HostButton onClick={() => g("command")}>{lang === "zh" ? "替国王抽命令" : "Draw for the king"}</HostButton>}
        {v.phase === "command" && !amKing && <HostButton onClick={() => g("next")}>{lang === "zh" ? "下一轮" : "Next round"}</HostButton>}
        {v.phase !== "deal" && <HostButton onClick={() => g("redeal")}>{lang === "zh" ? "重新发签" : "Redeal"}</HostButton>}
      </HostRow>
    </NetFrame>
  );
}
