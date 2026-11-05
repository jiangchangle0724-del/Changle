import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { T } from "../../i18n";
import { gsap, reduced } from "../../lib/anim";
import { upOf } from "../sensors";
import "./heads.css";

/** How far the stage turns (degrees clockwise) so the word reads upright to the room. */
export type Turn = 0 | 90 | 180 | -90;

/**
 * Where "up" is, as the phone is held, measured clockwise from the phone's own top edge: 0 upright,
 * 90 on its side with the right edge up, -90 with the left edge up, 180 upside down. Null when the
 * screen is lying too flat to tell (mid-nod, or on the table).
 */
export function heldAt(beta: number, gamma: number): number | null {
  const [x, y, z] = upOf(beta, gamma);
  if (Math.abs(z) > 0.8) return null;
  return (Math.atan2(x, y) * 180) / Math.PI;
}

const QUARTERS: Turn[] = [0, 90, 180, -90];
/** The quarter turn within 35° of where up is (the 20° between two of them keep the last one). */
export function quarterOf(angle: number): Turn | null {
  for (const q of QUARTERS) if (Math.abs(((angle - q + 540) % 360) - 180) < 35) return q;
  return null;
}

/** How long the phone has to stay turned before the word follows: the browser turns the page itself, when it may, within about that. */
const SETTLE_MS = 500;

/**
 * The word on the forehead faces the room, so it turns with the phone: held sideways with the
 * screen's rotation locked, the page stays upright and the word lies on its side, unless the stage
 * turns it. When the page has turned by itself (a wide window), nothing more is needed.
 */
function useTurn(tilt: { beta: number; gamma: number } | null): { turn: Turn; w: number; h: number; stage: React.RefObject<HTMLDivElement | null> } {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [turn, setTurn] = useState<Turn>(0);
  const pending = useRef<{ q: Turn; since: number } | null>(null);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wide = box.w > box.h;
  useEffect(() => {
    // the page is wide: the browser has turned it with the phone already
    if (wide) {
      pending.current = null;
      setTurn(0);
      return;
    }
    if (!tilt) return;
    const at = heldAt(tilt.beta, tilt.gamma);
    const q = at === null ? null : quarterOf(at);
    if (q === null || q === turn) {
      pending.current = null;
      return;
    }
    const now = performance.now();
    if (!pending.current || pending.current.q !== q) pending.current = { q, since: now };
    else if (now - pending.current.since >= SETTLE_MS) {
      pending.current = null;
      setTurn(q);
    }
  }, [tilt, wide, turn]);

  const quarter = turn === 90 || turn === -90;
  return { turn, w: quarter ? box.h : box.w, h: quarter ? box.w : box.h, stage };
}

const WORD_MIN = 28;
/** the poster size's top (--text-poster), in px at the default 16px rem */
const WORD_MAX = 156;

/**
 * The biggest the word can be in `box` with every word in it whole (no Latin word or Chinese name
 * broken across two lines: .heads-w) and the other language under it, all inside the box. Sets
 * --word on the box, which both sizes follow (heads.css).
 */
export function fitWord(box: HTMLElement, main: HTMLElement) {
  const card = main.parentElement;
  const other = card?.querySelector("small");
  if (!card) return;
  const fits = (px: number) => {
    box.style.setProperty("--word", `${px}px`);
    const w = box.clientWidth + 0.5;
    return main.scrollWidth <= w && (!other || other.scrollWidth <= w) && card.offsetHeight <= box.clientHeight + 0.5;
  };
  if (!box.clientWidth || !box.clientHeight) return;
  let lo = WORD_MIN;
  let hi = WORD_MAX;
  if (fits(hi)) return;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  box.style.setProperty("--word", `${Math.floor(lo)}px`);
}

/** The words of a line, each to be kept whole, and the spaces between them where it may wrap. */
const pieces = (text: string) => text.split(/(\s+)/).filter(Boolean);

function Word({ word, zh }: { word: T; zh: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLSpanElement>(null);
  const shown = zh ? word.zh : word.en;
  const other = zh ? word.en : word.zh;

  useLayoutEffect(() => {
    const b = box.current;
    const m = main.current;
    if (!b || !m) return;
    const fit = () => fitWord(b, m);
    fit();
    // the display font may still be on its way: once it is in, the word is measured again
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [shown]);

  useEffect(() => {
    if (!main.current || reduced()) return;
    gsap.fromTo(main.current.parentElement, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)", clearProps: "transform,opacity" });
  }, [shown]);

  return (
    <div className="heads-middle" ref={box}>
      <span className="heads-word">
        <span ref={main} lang={zh ? "zh-CN" : "en"}>
          {pieces(shown).map((p, i) =>
            /\s/.test(p) ? (
              " "
            ) : (
              <span className="heads-w" key={i}>
                {p}
              </span>
            ),
          )}
        </span>
        {other !== shown && <small lang={zh ? "en" : "zh-CN"}>{other}</small>}
      </span>
    </div>
  );
}

/**
 * One phone, the forehead game while it plays: the whole screen is the card the room reads. The
 * countdown, then the clock, the score and the word, turned to read upright however the phone is
 * held. Tapping it stands in for the nod: the lower half is got it (like nodding down), the upper
 * half a pass (like tipping back), which reads the same for the one holding it, screen out, as for
 * the room.
 */
export function HeadsStage({
  count,
  word,
  zh,
  left,
  score,
  flash,
  tilt,
  onAnswer,
}: {
  /** 3, 2, 1 before the clock starts; null once it has */
  count: number | null;
  word: T | null;
  zh: boolean;
  left: number;
  score: number;
  flash: "ok" | "pass" | null;
  tilt: { beta: number; gamma: number } | null;
  onAnswer: (ok: boolean) => void;
}) {
  const { turn, w, h, stage } = useTurn(tilt);
  return (
    <div className={`heads-stage ${flash ? `is-${flash}` : ""}`} ref={stage}>
      <div className={`heads-turn is-turn-${turn < 0 ? "left" : turn}`} style={{ width: w || undefined, height: h || undefined, rotate: `${turn}deg` }} data-turn={turn}>
        {count !== null ? (
          <span className="heads-count tabular" key={count}>
            {count}
          </span>
        ) : (
          <>
            <div className="heads-top">
              <span className="heads-time tabular" aria-label={zh ? `还剩 ${left} 秒` : `${left} seconds left`}>
                {left}
              </span>
              <span className="heads-score tabular" aria-label={zh ? `猜对 ${score} 个` : `${score} right`}>
                <Check size={18} strokeWidth={3} aria-hidden="true" />
                {score}
              </span>
            </div>
            <span className="heads-hint is-pass" aria-hidden="true">
              <ArrowUp size={16} strokeWidth={2.6} />
              {zh ? "跳过" : "Pass"}
            </span>
            {flash ? <span className="heads-flash">{flash === "ok" ? (zh ? "对！" : "Got it!") : zh ? "跳过" : "Pass"}</span> : word && <Word word={word} zh={zh} />}
            <span className="heads-hint is-ok" aria-hidden="true">
              <ArrowDown size={16} strokeWidth={2.6} />
              {zh ? "猜对" : "Got it"}
            </span>
            <button type="button" className="heads-zone heads-pass" aria-label={zh ? "跳过" : "Pass"} disabled={!!flash} onClick={() => onAnswer(false)} />
            <button type="button" className="heads-zone heads-ok" aria-label={zh ? "猜对" : "Got it"} disabled={!!flash} onClick={() => onAnswer(true)} />
          </>
        )}
      </div>
    </div>
  );
}
