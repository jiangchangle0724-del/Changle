// Rio's dance, taught: when a team says it will dance, every screen plays the same 10 s lesson from
// the server's moment (protocol TIMING.dance): a whistle counts in four beats, then twelve beats of
// samba's basic step at 100 a minute (Latin dance competitions dance samba at 50 bars a minute, in
// 2/4) and a pose. The teacher is a rubber-hose traveller in carnival feathers, drawn as a mirror:
// when the foot on the screen's right lights up, you move your right foot. A word is spoken at the
// start of each figure (the phone's own voice), a little ahead of the beat.
//
//   beats 0-3   count in: knees soft, nod to the drums          (5, 6, 7, 8)
//   beats 4-7   the basic step, "1 a 2": the leading foot forward (3/4 of a beat), the other foot
//               taps (1/4), the leading foot back (1 beat); right foot leads, then left
//   beats 8-11  the same, bouncing: the knees bend and straighten
//   beats 12-15 hands up, swaying, feet still going
//   beat 16     hand on hip, the other to the sky: hey
//
// The music plays on the big screen when there is one, otherwise on the dancing team's phone.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { Face, INK } from "../art/characters";
import { getLang, t } from "../i18n";
import { reducedMotion } from "../motion";
import { audioReady, samba } from "../sound";
import { serverNow } from "../store";
import { TEAM_COLORS, seatName, teamOf } from "./common";

/** The dance's first beat comes this long after the team says yes (time for every screen to get it). */
export const LEAD = 400;
export const BEAT = 600;
export const BEATS = 17;

export interface DanceClock {
  seat: number;
  /** Server time of beat 0. */
  beat0: number;
  /** Server time the judges' buttons light up. */
  end: number;
  over: boolean;
}

/** The dance on now (or just over: the judges are scoring it), from the room's view. */
export function useDanceClock(v: RoomView): DanceClock | null {
  const d = v.game?.dance ?? null;
  const [, tick] = useState(0);
  const end = d ? d.at + d.ms : 0;
  useEffect(() => {
    if (!d) return;
    const left = end - serverNow();
    if (left <= 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), left + 20);
    return () => clearTimeout(id);
  }, [d?.at]);
  if (!d) return null;
  return { seat: d.seat, beat0: d.at + LEAD, end, over: serverNow() >= end };
}

const out = (p: number) => 1 - Math.pow(1 - p, 3);

type P = [number, number];
interface Pose {
  bob: number;
  nod: number;
  /** Feet: screen left and right (the teacher is a mirror). */
  L: P;
  R: P;
  litL: boolean;
  litR: boolean;
  /** Elbow and hand of each arm, from the shoulders. */
  hands: [number, number, number, number][];
  ribbon: number;
}

const FOOT: { L: P; R: P } = { L: [102, 214], R: [138, 214] };

/** The teacher at beat `b` (fractional) of the lesson. */
export function poseAt(b: number): Pose {
  const P: Pose = { bob: 0, nod: 0, L: [...FOOT.L], R: [...FOOT.R], litL: false, litR: false, hands: [], ribbon: 0 };
  if (b < 4) {
    P.nod = 3 * Math.pow(Math.cos((b % 1) * Math.PI), 8);
    P.hands = [
      [92, 128, 96, 150],
      [148, 128, 144, 150],
    ];
    return P;
  }
  if (b >= 16) {
    P.L = [96, 214];
    P.R = [144, 214];
    P.hands = [
      [84, 120, 104, 140],
      [152, 78, 164, 44],
    ];
    return P;
  }
  const k = b - 4;
  const bar = Math.floor(k / 2);
  const p = k - bar * 2;
  const leadR = bar % 2 === 0;
  let fwd = 0;
  let tap = 0;
  if (p < 0.75) fwd = out(p / 0.75); // "1": the leading foot forward
  else if (p < 1) {
    fwd = 1; // "a": the other foot taps
    tap = Math.sin((Math.PI * (p - 0.75)) / 0.25);
  } else fwd = 1 - out(p - 1); // "2": back in place
  const lead = leadR ? "R" : "L";
  const other = leadR ? "L" : "R";
  const side = leadR ? 1 : -1;
  P[lead] = [FOOT[lead][0] + side * 5 * fwd, FOOT[lead][1] + 11 * fwd];
  P[other] = [FOOT[other][0], FOOT[other][1] - 7 * tap];
  if (lead === "R") {
    P.litR = fwd > 0.35;
    P.litL = tap > 0.3;
  } else {
    P.litL = fwd > 0.35;
    P.litR = tap > 0.3;
  }
  if (k >= 4) P.bob = 5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * k)); // the bounce: down between beats
  if (k < 8) {
    const sw = 14 * fwd * side; // arms swing against the feet
    P.hands = [
      [90, 120 + sw * 0.4, 84, 108 + sw],
      [150, 120 - sw * 0.4, 156, 108 - sw],
    ];
  } else {
    const sway = 10 * Math.sin(Math.PI * k);
    P.hands = [
      [92 + sway * 0.5, 82, 88 + sway, 50],
      [148 + sway * 0.5, 82, 152 + sway, 50],
    ];
    P.ribbon = Math.min(1, (k - 8) * 2) * Math.min(1, (12 - k) * 2);
  }
  return P;
}

/** What to say (and show) at the start of each figure. */
const CUES: Record<number, () => string> = {
  0: () => (getLang() === "zh" ? "五" : "Five"),
  1: () => (getLang() === "zh" ? "六" : "Six"),
  2: () => (getLang() === "zh" ? "七" : "Seven"),
  3: () => (getLang() === "zh" ? "八" : "Eight"),
  4: () => t("sambaRight"),
  6: () => t("sambaLeft"),
  8: () => t("sambaBounce"),
  12: () => t("sambaHands"),
  16: () => t("sambaHey"),
};

function cueAt(b: number): string {
  if (b < 0) return t("sambaReady");
  if (b < 4) return t("sambaNod");
  if (b < 8) return Math.floor((b - 4) / 2) % 2 ? t("sambaLeft") : t("sambaRight");
  if (b < 12) return t("sambaBounce");
  if (b < 16) return t("sambaHands");
  return t("sambaHey");
}

function countAt(b: number): string {
  if (b < 0) return "";
  if (b < 4) return String(5 + Math.floor(b));
  if (b >= 16) return t("sambaHey").replace(/[!！]/g, "");
  const p = (((b - 4) % 2) + 2) % 2;
  return p < 0.75 ? "1" : p < 1 ? "a" : "2";
}

/** Draw the teacher (SVG markup in a 240 × 240 box), in the dancing team's colour. */
function teacher(P: Pose, color: string, b: number): string {
  const hip = 150 + P.bob;
  const sh = 108 + P.bob;
  const head = 74 + P.bob + P.nod;
  const ink = `stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`;
  const leg = (hx: number, f: P, dir: number) =>
    `<path d="M${hx} ${hip.toFixed(1)}Q${((hx + f[0]) / 2 + dir * 10).toFixed(1)} ${((hip + f[1]) / 2 + 4).toFixed(1)} ${f[0].toFixed(1)} ${(f[1] - 6).toFixed(1)}" fill="none" ${ink} stroke-width="3.6"/>` +
    `<path d="M${f[0].toFixed(1)} ${f[1].toFixed(1)}h${dir * 13}a5 5 0 0 ${dir > 0 ? 0 : 1}-5-7h${-dir * 8}z" fill="${INK}"/>`;
  const arm = (sx: number, h: [number, number, number, number], side: number) =>
    `<path d="M${sx} ${sh.toFixed(1)}Q${h[0].toFixed(1)} ${(h[1] + P.bob).toFixed(1)} ${h[2].toFixed(1)} ${(h[3] + P.bob).toFixed(1)}" fill="none" ${ink} stroke-width="3.4"/>` +
    `<circle cx="${h[2].toFixed(1)}" cy="${(h[3] + P.bob).toFixed(1)}" r="6" fill="#fff" ${ink} stroke-width="2.4"/>` +
    (side ? "" : "");
  const sequins = [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${104 + i * 6.4}" cy="${(hip - 8 - (i % 2) * 4).toFixed(1)}" r="2.1" fill="#ffd36e"/>`).join("");
  const feathers = ["#ff4d6d", "#ffb82e", "#4be38f", "#56b4e9", "#cc79a7"]
    .map((c, i) => `<path d="M120 ${(head - 16).toFixed(1)}L${96 + i * 12} ${(head - 50 + Math.abs(i - 2) * 4).toFixed(1)}" stroke="${c}" stroke-width="5.5" stroke-linecap="round"/>`)
    .join("");
  const ribbons =
    P.ribbon > 0
      ? `<g fill="none" stroke-width="5" stroke-linecap="round" opacity="${P.ribbon.toFixed(2)}">` +
        [0, 1]
          .map((i) => {
            const h = P.hands[i];
            const dir = i ? 1 : -1;
            return `<path d="M${h[2].toFixed(1)} ${(h[3] + P.bob).toFixed(1)}q${dir * 18} ${(-12 + 8 * Math.sin(b * Math.PI)).toFixed(1)} ${dir * 36} 0t${dir * 34} 0" stroke="${i ? "#56b4e9" : "#ffb82e"}"/>`;
          })
          .join("") +
        `</g>`
      : "";
  return (
    `<g class="samba-legs">${leg(112, P.L, -1)}${leg(128, P.R, 1)}</g>` +
    `<path d="M96 ${(sh - 4).toFixed(1)}Q120 ${(sh - 13).toFixed(1)} 144 ${(sh - 4).toFixed(1)}L138 ${hip.toFixed(1)}Q120 ${(hip + 7).toFixed(1)} 102 ${hip.toFixed(1)}Z" fill="${color}" ${ink}/>` +
    sequins +
    `<g>${arm(98, P.hands[0], 0)}${arm(142, P.hands[1], 1)}</g>` +
    ribbons +
    `<g>${feathers}</g>` +
    `<circle cx="120" cy="${head.toFixed(1)}" r="23" fill="#f4ead5" ${ink}/>`
  );
}

/**
 * The lesson. `size`: "full" covers the dancing team's phone; "small" sits over another team's
 * judging buttons; "tv" fills the big screen's board.
 */
export function SambaLesson({ v, size }: { v: RoomView; size: "full" | "small" | "tv" }) {
  const clock = useDanceClock(v);
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGGElement>(null);
  const prints = useRef<SVGGElement>(null);
  const face = useRef<SVGGElement>(null);
  const [now, setNow] = useState(() => serverNow());
  const key = clock ? clock.beat0 : 0;
  const team = clock ? teamOf(v, clock.seat) : undefined;
  const color = team ? TEAM_COLORS[team.color] : "#ff8a6b";
  const reduced = reducedMotion();
  const screenOn = v.members.some((m) => m.role === "screen" && m.online);
  const speaker = !!clock && (v.you.role === "screen" || (!screenOn && v.you.seats.includes(clock.seat)));

  // The band and the spoken words, on the audio clock and timers from the server's beat 0.
  useEffect(() => {
    if (!clock || clock.over) return;
    const ahead = (clock.beat0 - serverNow()) / 1000;
    if (speaker && audioReady()) samba(ahead);
    const timers: number[] = [];
    const voice = typeof speechSynthesis !== "undefined" && speaker && audioReady();
    for (const [beat, say] of Object.entries(CUES)) {
      const at = clock.beat0 + Number(beat) * BEAT - 150 - serverNow();
      if (at < -100) continue;
      if (voice)
        timers.push(
          window.setTimeout(() => {
            try {
              const u = new SpeechSynthesisUtterance(say());
              u.lang = getLang() === "zh" ? "zh-CN" : "en-US";
              u.rate = 1.25;
              speechSynthesis.speak(u);
            } catch {
              // no voice on this device: the words are on screen
            }
          }, Math.max(0, at)),
        );
    }
    return () => {
      timers.forEach(clearTimeout);
      if (voice) speechSynthesis.cancel();
    };
  }, [key, speaker]);

  // The teacher, every frame (straight into the SVG: nothing else redraws).
  useLayoutEffect(() => {
    if (!clock) return;
    let raf = 0;
    let shownBeat = -99;
    let flashed = false;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const nowS = serverNow();
      const b = (nowS - clock.beat0) / BEAT;
      const bb = Math.max(0, Math.min(BEATS, b));
      // (with reduced motion the teacher stands; the footprints and the words do the teaching)
      const P = poseAt(reduced ? Math.floor(bb) + 0.4 : bb);
      const shown = reduced ? { ...P, bob: 0, nod: 0, ribbon: 0 } : P;
      if (svg.current) svg.current.innerHTML = teacher(shown, color, bb);
      face.current?.setAttribute("transform", `translate(120 ${(74 + shown.bob + shown.nod).toFixed(1)})`);
      if (prints.current) {
        const fp = (f: P, lit: boolean, flip: boolean) =>
          `<path transform="translate(${f[0].toFixed(1)} 226)${flip ? " scale(-1 1)" : ""}" d="M0 0c-7 0-11-9-9-18c2-7 13-7 14 0c1 9-1 18-5 18z" fill="${lit ? "var(--gel)" : "rgba(245,244,253,.16)"}"/>`;
        prints.current.innerHTML = fp(FOOT.L, P.litL, false) + fp(FOOT.R, P.litR, true);
      }
      if (Math.floor(b) !== shownBeat) {
        shownBeat = Math.floor(b);
        setNow(nowS);
      }
      if (b >= 16 && !flashed && !reduced) {
        flashed = true;
        root.current?.classList.add("hey");
      }
      if (nowS > clock.end + 1500) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [key, color, reduced]);

  if (!clock) return null;
  const b = (now - clock.beat0) / BEAT;
  if (size === "full" && now > clock.end + 600) return null;
  return (
    <div class={`samba samba-${size}${clock.over ? " over" : ""}`} ref={root} role="img" aria-label={t("sambaFollow")}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <ellipse cx="120" cy="226" rx="78" ry="10" fill="rgba(0,0,0,.35)" />
        <g ref={prints} />
        <g ref={svg} />
        <g ref={face} transform="translate(120 74)">
          <Face x={0} y={0} s={0.82} mood={b >= 16 ? "happy" : "idle"} />
        </g>
      </svg>
      <p class="samba-cue">{clock.over ? t("sambaDone") : cueAt(b)}</p>
      <p class="samba-count num">{clock.over ? "" : countAt(b)}</p>
      {size !== "small" && <p class="samba-who">{t("sambaWho", { team: seatName(v, clock.seat) })}</p>}
      {size === "full" && <p class="samba-tip">{t("sambaFollow")}</p>}
    </div>
  );
}
