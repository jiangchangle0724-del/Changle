import { Drama, Eye, Lock, Megaphone, Repeat2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MOODS } from "../../data/drama";
import { gsap, reduced } from "../../lib/anim";
import { haptic, sfx } from "../../lib/sfx";
import { CALL_GAP, CALLS_EACH } from "../../shared/engine/games/drama";
import type { DramaView } from "../../shared/protocol";
import { useStore } from "../../store";
import { MaskArt, type Actor } from "./parts";
import { dramaSfx } from "./sound";

/*
 * While a scene plays, the audience has something to do (Steve on Nov 26: borrow from the
 * open-source party games). Improv's "New choice!" and its emotional calls: anyone watching calls
 * out twice an act, 换个说法 or a mood for one actor. Spyfall's accusation: anyone watching can lock
 * in their guess before the scene is over; it's their vote's guess, and a right one scores one more.
 */

export type DramaCall = NonNullable<DramaView["calls"]>[number];

/** How long a call stays up: the banner a few seconds, a mood on its actor about twenty. */
export const BANNER_MS = 4_500;
export const MOOD_MS = 20_000;
const upFor = (c: DramaCall) => (c.kind === "mood" ? MOOD_MS : BANNER_MS);

/**
 * The calls still up on the room's clock (`live`), and the newest one still on its banner
 * (`fresh`); the screen redraws as each one comes down.
 */
export function useLiveCalls(calls: DramaCall[] | undefined, now: () => number): { live: DramaCall[]; fresh: DramaCall | null } {
  const [, redraw] = useState(0);
  const at = now();
  const live = (calls ?? []).filter((c) => at - c.at < upFor(c));
  const fresh = [...live].reverse().find((c) => at - c.at < BANNER_MS) ?? null;
  const ends = live.map((c) => c.at + upFor(c));
  if (fresh) ends.push(fresh.at + BANNER_MS);
  const next = ends.length ? Math.min(...ends) - at : 0;
  useEffect(() => {
    if (next <= 0) return;
    const id = window.setTimeout(() => redraw((n) => n + 1), next + 40);
    return () => window.clearTimeout(id);
  });
  return { live, fresh };
}

/** Each actor's mood called from the house while it lasts, for `Cast`'s tags (the latest wins). */
export function moodTags(live: DramaCall[], zh: boolean): Record<string, ReactNode> {
  const tags: Record<string, ReactNode> = {};
  for (const c of live) {
    const m = c.kind === "mood" && c.to ? MOODS[c.mood] : null;
    if (m && c.to) tags[c.to] = zh ? m.zh : m.en;
  }
  return tags;
}

/**
 * The newest call, slammed across the set: 换个说法 (whoever just spoke says it again, another
 * way) or a mood for one actor. It sounds where this screen plays the show; the actor it's for
 * feels it (on 换个说法, every actor).
 */
export function CallBanner({ call, nameOf, me, acting, sound = true }: { call: DramaCall | null; nameOf: (pid: string) => string; me?: string; acting?: boolean; sound?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    if (!call || shown.current === call.at) return;
    shown.current = call.at;
    if (sound) {
      if (call.kind === "again") dramaSfx.clapper();
      else sfx.pop();
    }
    if (call.kind === "mood" ? !!me && call.to === me : !!acting) haptic([20, 50, 20]);
    if (!ref.current || reduced()) return;
    gsap.fromTo(ref.current, { scale: 1.4, rotate: 5, opacity: 0 }, { scale: 1, rotate: 2, opacity: 1, duration: 0.45, ease: "back.out(2)" });
  }, [call, sound, me, acting]);
  if (!call) return null;
  const mood = call.kind === "mood" ? MOODS[call.mood] : null;
  const who = call.to === me ? (zh ? "你" : "You") : call.to ? nameOf(call.to) : "";
  const by = nameOf(call.by);
  return (
    <div className="dm-call" ref={ref} role="status">
      <span className="dm-call-label">{mood ? (zh ? `${who}：${mood.zh}！` : `${who}: ${mood.en}!`) : zh ? "换个说法！" : "New choice!"}</span>
      <small>
        {mood
          ? zh
            ? `${by} 喊的，接下来 20 秒这样演`
            : `${by} called it: play the next 20 seconds that way`
          : zh
            ? `${by} 喊的：刚才那句换个说法，再来一遍`
            : `${by} called it: say that last line again, another way`}
      </small>
    </div>
  );
}

/** How many watching have locked in a guess (never whom): the actors feel it, the house sees it. */
export function lockedText(n: number, zh: boolean, acting = false, short = false): string {
  if (short) return zh ? `${n} 人已锁定答案` : `${n} locked in`;
  if (acting) return zh ? `台下已经有 ${n} 个人锁定了答案` : `${n} in the audience ${n === 1 ? "has" : "have"} locked in a guess`;
  return zh ? `已经有 ${n} 个人锁定了答案` : `${n} ${n === 1 ? "has" : "have"} locked in a guess so far`;
}

type CallOut = { kind: "again" } | { kind: "mood"; to: string; mood: number };

/**
 * The audience's part while a scene plays: call out (twice an act, a few seconds after anyone's
 * last call), and lock in a guess before it's over (once: it becomes the vote's guess).
 */
export function FromTheHouse({ v, actors, me, now, onCall, onLock }: { v: DramaView; actors: Actor[]; me: string; now: () => number; onCall: (c: CallOut) => void; onLock: (guess: string) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const calls = v.calls ?? [];
  const left = Math.max(0, CALLS_EACH - calls.filter((c) => c.by === me).length);
  const last = calls[calls.length - 1];
  const wait = last ? last.at + CALL_GAP - now() : 0;
  const [, redraw] = useState(0);
  // the buttons come back once the last call's few seconds are up
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => redraw((n) => n + 1), wait + 40);
    return () => window.clearTimeout(id);
  }, [wait > 0, last?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const canCall = left > 0 && wait <= 0;
  const [picking, setPicking] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const target = actors.length === 1 ? actors[0].pid : to;
  const [locking, setLocking] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const options = v.options ?? null;
  const tx = (x: { zh: string; en: string }) => (zh ? x.zh : x.en);
  const guessName = (g: string) => {
    if (options) return `${String.fromCharCode(65 + Number(g))}. ${tx(options[Number(g)] ?? { zh: "", en: "" })}`;
    const a = actors.find((x) => x.pid === g);
    return a ? (zh ? `${tx(a.role)}（${a.name}）` : `${tx(a.role)} (${a.name})`) : "";
  };
  const call = (c: CallOut) => {
    onCall(c);
    haptic(10);
    setPicking(false);
    setTo(null);
  };

  return (
    <div className="dm-house">
      <section className="dm-house-box" aria-label={zh ? "台下喊一嗓子" : "Shout from the audience"}>
        <p className="dm-house-head">
          <Megaphone size={16} strokeWidth={2.4} aria-hidden="true" />
          <strong>{zh ? "台下喊一嗓子" : "Shout from the audience"}</strong>
          <span className="dm-house-left">{left ? (zh ? `还能喊 ${left} 次` : `${left} left`) : zh ? "这一幕喊完了" : "None left this act"}</span>
        </p>
        <div className="dm-house-row">
          <button type="button" className="btn btn-ghost dm-house-btn" disabled={!canCall} onClick={() => call({ kind: "again" })}>
            <Repeat2 size={18} aria-hidden="true" />
            {zh ? "换个说法！" : "New choice!"}
          </button>
          <button type="button" className={`btn btn-ghost dm-house-btn ${picking ? "is-on" : ""}`} disabled={!canCall} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            <Drama size={18} aria-hidden="true" />
            {zh ? "换个情绪" : "Change mood"}
          </button>
        </div>
        {left > 0 && wait > 0 && <p className="dm-house-note">{zh ? "刚有人喊过，等几秒再喊" : "Someone just called out. Give it a few seconds."}</p>}
        {picking && canCall && (
          <div className="dm-house-pick">
            {actors.length > 1 && (
              <div className="dm-house-who" role="radiogroup" aria-label={zh ? "给谁" : "For whom"}>
                {actors.map((a) => (
                  <button key={a.pid} type="button" role="radio" aria-checked={to === a.pid} className={`dm-house-chip ${to === a.pid ? "is-on" : ""}`} onClick={() => setTo(a.pid)}>
                    {a.face(28)}
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="dm-house-moods" role="group" aria-label={zh ? "什么情绪" : "Which mood"}>
              {MOODS.map((m, i) => (
                <button key={i} type="button" className="dm-house-mood" disabled={!target} onClick={() => target && call({ kind: "mood", to: target, mood: i })}>
                  {tx(m)}
                </button>
              ))}
            </div>
            {!target && <p className="dm-house-note">{zh ? "先点给谁，再点情绪" : "Pick an actor, then a mood"}</p>}
          </div>
        )}
      </section>

      <section className="dm-house-box" aria-label={zh ? "当场识破" : "Call it early"}>
        <p className="dm-house-head">
          <Eye size={16} strokeWidth={2.4} aria-hidden="true" />
          <strong>{zh ? "当场识破" : "Call it early"}</strong>
          {(v.locked ?? 0) > 0 && <span className="dm-house-left">{lockedText(v.locked ?? 0, zh)}</span>}
        </p>
        {v.myLock ? (
          <p className="dm-house-locked">
            <Lock size={15} aria-hidden="true" />
            <span>{zh ? `你锁定了：${guessName(v.myLock)}。投票就是它，揭晓前只有你知道。` : `Locked in: ${guessName(v.myLock)}. That's your vote's guess, and nobody else knows until the reveal.`}</span>
          </p>
        ) : !locking ? (
          <>
            <p className="dm-house-note">
              {options
                ? zh
                  ? "已经看出藏的是哪个秘密？现在锁定，猜对多得 1 分；锁了就不能改。"
                  : "Already know which secret it is? Lock it in now: right, and it's one more point. No changing it later."
                : zh
                  ? "已经看出谁是坏人？现在锁定，猜对多得 1 分；锁了就不能改。"
                  : "Already know who the culprit is? Lock it in now: right, and it's one more point. No changing it later."}
            </p>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setLocking(true)}>
              <Eye size={16} aria-hidden="true" />
              {zh ? "我看出来了" : "I've got it"}
            </button>
          </>
        ) : (
          <>
            {options ? (
              <div className="dm-secrets" role="radiogroup" aria-label={zh ? "藏的是哪个秘密" : "Which secret"}>
                {options.map((o, i) => (
                  <button key={i} type="button" role="radio" aria-checked={pick === String(i)} className={`dm-secret ${pick === String(i) ? "is-on" : ""}`} onClick={() => setPick(String(i))}>
                    <span className="dm-secret-mark" aria-hidden="true">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {tx(o)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="dm-suspects" role="radiogroup" aria-label={zh ? "谁是坏人" : "Who's the culprit"}>
                {actors.map((a) => (
                  <button key={a.pid} type="button" role="radio" aria-checked={pick === a.pid} className={`dm-suspect ${pick === a.pid ? "is-on" : ""}`} onClick={() => setPick(a.pid)}>
                    <span className="dm-suspect-face">
                      {a.face(48)}
                      {pick === a.pid && (
                        <span className="dm-suspect-mask" aria-hidden="true">
                          <MaskArt culprit />
                        </span>
                      )}
                    </span>
                    <strong>{tx(a.role)}</strong>
                    <small>{a.name}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="dm-house-row">
              <button
                type="button"
                className="btn btn-ghost dm-house-btn"
                onClick={() => {
                  setLocking(false);
                  setPick(null);
                }}
              >
                {zh ? "再想想" : "Not yet"}
              </button>
              <button
                type="button"
                className="btn btn-primary dm-house-btn"
                disabled={!pick}
                onClick={() => {
                  if (!pick) return;
                  onLock(pick);
                  sfx.stamp(0.7);
                  haptic([12, 30, 12]);
                  setLocking(false);
                }}
              >
                <Lock size={16} aria-hidden="true" />
                {zh ? "锁定" : "Lock it in"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
