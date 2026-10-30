import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { gsap, reduced } from "../../lib/anim";
import { beatIndexAt, curveAt, type BeatMap } from "../../lib/beats";
import "../../styles/party.css";

/**
 * The stage for Name That Tune: two little performers either side of the record. Whoever sings
 * the song sings (a man's song, he sings; a woman's, she does; a mixed group, both), and the
 * other one dances to the beat. The beats and the voice come from the preview itself
 * (lib/beats.ts), so every phone moves the same way at the same moment.
 */

export type StageTiming = { startPerf: number; offset: number };

type Kind = "m" | "f";
type Role = "sing" | "dance" | "idle";

/* ---------------- the rig: one body, two outfits ---------------- */

// Rest geometry: head centre (100,70) r34; shoulders y=122; hips (100,186). Chibi: short arms.
const S = { L: { x: 76, y: 122 }, R: { x: 124, y: 122 } };
const UPPER = 30, FORE = 24;
const pt = (s: { x: number; y: number }, len: number, ang: number) => ({ x: s.x + len * Math.cos((ang * Math.PI) / 180), y: s.y + len * Math.sin((ang * Math.PI) / 180) });
const EL = pt(S.L, UPPER, 100), HL = pt(EL, FORE, 100), ER = pt(S.R, UPPER, 80), HR = pt(ER, FORE, 80);
const f1 = (n: number) => n.toFixed(1);

const OUTFITS = {
  f: { skin: "#f6cfb0", hair: "#3b1f3a", outfit: "#ff5fa2", outfit2: "#ff9cc5", shoe: "#2c2955", rim: "#ff9cc5", lip: "#c2345f" },
  m: { skin: "#eec19d", hair: "#1c1836", outfit: "#31b9ff", outfit2: "#5b9bff", shoe: "#2c2955", rim: "#8ad8ff", lip: "#9d3a4a" },
};

function rigMarkup(kind: Kind) {
  const c = OUTFITS[kind];
  const legs = `
    <g class="legL"><rect x="86" y="184" width="14" height="66" rx="7" fill="${kind === "m" ? c.outfit2 : c.skin}"/><rect x="82" y="244" width="22" height="13" rx="6.5" fill="${c.shoe}"/><rect x="82" y="244" width="22" height="13" rx="6.5" fill="none" stroke="${c.rim}" stroke-opacity=".5"/></g>
    <g class="legR"><rect x="100" y="184" width="14" height="66" rx="7" fill="${kind === "m" ? c.outfit2 : c.skin}"/><rect x="96" y="244" width="22" height="13" rx="6.5" fill="${c.shoe}"/><rect x="96" y="244" width="22" height="13" rx="6.5" fill="none" stroke="${c.rim}" stroke-opacity=".5"/></g>`;
  const torso =
    kind === "f"
      ? `<path d="M74 118 Q100 110 126 118 L140 198 Q100 210 60 198 Z" fill="${c.outfit}"/>
       <path d="M86 150 Q100 146 114 150 L120 198 Q100 204 80 198 Z" fill="${c.outfit2}" opacity=".55"/>
       <path d="M74 118 Q100 110 126 118" fill="none" stroke="${c.rim}" stroke-width="2" stroke-opacity=".6"/>`
      : `<path d="M72 118 Q100 110 128 118 L132 190 Q100 196 68 190 Z" fill="${c.outfit}"/>
       <path d="M90 118 Q100 128 110 118 L110 140 Q100 150 90 140 Z" fill="${c.outfit2}" opacity=".55"/>
       <rect x="66" y="178" width="68" height="14" rx="4" fill="${c.outfit2}"/>
       <path d="M72 118 Q100 110 128 118" fill="none" stroke="${c.rim}" stroke-width="2" stroke-opacity=".6"/>`;
  const hairBack = kind === "f" ? `<path d="M64 74 Q60 30 100 30 Q140 30 136 74 L138 104 Q100 114 62 104 Z" fill="${c.hair}"/>` : "";
  const tail = kind === "f" ? `<g class="tail"><path d="M130 52 Q166 58 158 104 Q150 126 134 120 Q146 100 140 80 Q136 62 130 52 Z" fill="${c.hair}"/><circle cx="130" cy="52" r="6" fill="${c.outfit}"/></g>` : "";
  const hairFront =
    kind === "f"
      ? `<path d="M66 70 Q70 36 100 36 Q130 36 134 70 Q122 50 100 54 Q86 52 80 64 Q74 62 66 70 Z" fill="${c.hair}"/>`
      : `<path d="M66 66 Q66 36 100 34 Q134 34 134 64 Q126 46 110 48 Q98 46 92 56 Q84 50 78 60 Q70 60 66 66 Z" fill="${c.hair}"/>
       <path d="M86 50 Q100 30 124 44" fill="none" stroke="${c.hair}" stroke-width="9" stroke-linecap="round"/>`;
  const face = `
    <circle cx="100" cy="70" r="34" fill="${c.skin}"/>
    <path d="M68 76 A34 34 0 0 0 132 76" fill="none" stroke="${c.rim}" stroke-width="2" stroke-opacity=".45"/>
    <g class="eyesOpen"><ellipse cx="88" cy="72" rx="3.4" ry="5" fill="#1c1836"/><ellipse cx="112" cy="72" rx="3.4" ry="5" fill="#1c1836"/><circle cx="89.3" cy="70" r="1.1" fill="#fff"/><circle cx="113.3" cy="70" r="1.1" fill="#fff"/></g>
    <g class="eyesClosed" hidden><path d="M83 73 Q88 78 93 73" fill="none" stroke="#1c1836" stroke-width="2.2" stroke-linecap="round"/><path d="M107 73 Q112 78 117 73" fill="none" stroke="#1c1836" stroke-width="2.2" stroke-linecap="round"/></g>
    <ellipse cx="80" cy="84" rx="6" ry="3.2" fill="${c.outfit}" opacity=".35"/><ellipse cx="120" cy="84" rx="6" ry="3.2" fill="${c.outfit}" opacity=".35"/>
    <path class="smile" d="M90 92 Q100 101 110 92" fill="none" stroke="${c.lip}" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse class="mouthOpen" cx="100" cy="95" rx="7" ry="1.5" fill="${c.lip}" hidden/>`;
  const arm = (side: "L" | "R") => {
    const s = S[side], e = side === "L" ? EL : ER, h = side === "L" ? HL : HR;
    return `<g class="arm${side}"><path d="M${s.x} ${s.y} L${f1(e.x)} ${f1(e.y)}" stroke="${c.skin}" stroke-width="11" stroke-linecap="round"/>
      <g class="fore${side}"><path d="M${f1(e.x)} ${f1(e.y)} L${f1(h.x)} ${f1(h.y)}" stroke="${c.skin}" stroke-width="10" stroke-linecap="round"/><circle cx="${f1(h.x)}" cy="${f1(h.y)}" r="6.5" fill="${c.skin}"/></g></g>`;
  };
  // the singer's right arm: bent, elbow forward, mic at the mouth
  const micArm = `<g class="micArm" hidden>
      <path d="M${S.R.x} ${S.R.y} L136 148" stroke="${c.skin}" stroke-width="11" stroke-linecap="round"/>
      <path d="M136 148 L116 120" stroke="${c.skin}" stroke-width="10" stroke-linecap="round"/>
      <path d="M116 120 L106 105" stroke="#35325a" stroke-width="7" stroke-linecap="round"/>
      <circle cx="103" cy="101" r="7.5" fill="#b6b4d0"/><circle cx="103" cy="101" r="7.5" fill="none" stroke="#35325a" stroke-width="1.5"/>
      <circle cx="116" cy="120" r="6.5" fill="${c.skin}"/></g>`;
  return `<g class="rig">${legs}<g class="body">${hairBack}${torso}<g class="head">${tail}<rect x="94" y="104" width="12" height="14" rx="4" fill="${c.skin}"/>${face}${hairFront}</g>${arm("L")}${arm("R")}${micArm}</g></g>`;
}

type Parts = {
  kind: Kind;
  role: Role;
  body: Element; head: Element; tail: Element | null; armL: Element; armR: Element; foreL: Element; foreR: Element; legL: Element; legR: Element; micArm: Element;
  eyesOpen: Element; eyesClosed: Element; smile: Element; mouthOpen: SVGEllipseElement;
  freeArmUp: boolean; eyesShut: boolean; closedUntil: number; lastNote: number;
};

const show = (el: Element | null, on: boolean) => {
  if (!el) return;
  if (on) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
};

function bind(svg: SVGSVGElement, kind: Kind): Parts {
  const q = (s: string) => svg.querySelector(s) as Element;
  const p: Parts = {
    kind, role: "idle",
    body: q(".body"), head: q(".head"), tail: svg.querySelector(".tail"), armL: q(".armL"), armR: q(".armR"), foreL: q(".foreL"), foreR: q(".foreR"),
    legL: q(".legL"), legR: q(".legR"), micArm: q(".micArm"), eyesOpen: q(".eyesOpen"), eyesClosed: q(".eyesClosed"), smile: q(".smile"), mouthOpen: q(".mouthOpen") as SVGEllipseElement,
    freeArmUp: false, eyesShut: false, closedUntil: 0, lastNote: 0,
  };
  gsap.set(p.body, { svgOrigin: "100 186" });
  gsap.set(p.head, { svgOrigin: "100 108" });
  if (p.tail) gsap.set(p.tail, { svgOrigin: "130 52" });
  gsap.set(p.armL, { svgOrigin: `${S.L.x} ${S.L.y}` });
  gsap.set(p.armR, { svgOrigin: `${S.R.x} ${S.R.y}` });
  gsap.set(p.foreL, { svgOrigin: `${f1(EL.x)} ${f1(EL.y)}` });
  gsap.set(p.foreR, { svgOrigin: `${f1(ER.x)} ${f1(ER.y)}` });
  gsap.set(p.legL, { svgOrigin: "93 186" });
  gsap.set(p.legR, { svgOrigin: "107 186" });
  return p;
}

const limbs = (p: Parts) => [p.body, p.head, p.armL, p.armR, p.foreL, p.foreR, p.legL, p.legR, p.tail].filter(Boolean) as Element[];

function setRole(p: Parts, role: Role) {
  if (p.role === role) return;
  p.role = role;
  gsap.killTweensOf(limbs(p));
  show(p.micArm, role === "sing");
  show(p.armR, role !== "sing");
  show(p.smile, role !== "sing");
  show(p.mouthOpen, role === "sing");
  show(p.eyesOpen, true);
  show(p.eyesClosed, false);
  p.eyesShut = false;
  p.freeArmUp = false;
  const d = reduced() ? 0 : 0.45;
  if (role === "sing") {
    gsap.to(p.armL, { rotation: 8, duration: d });
    gsap.to(p.foreL, { rotation: -20, duration: d });
    gsap.to([p.body, p.head, p.armR, p.foreR], { rotation: 0, x: 0, y: 0, scaleX: 1, duration: d });
    gsap.to(p.legL, { rotation: -4, duration: d });
    gsap.to(p.legR, { rotation: 6, duration: d });
  } else {
    gsap.to([p.armL, p.armR, p.foreL, p.foreR, p.legL, p.legR, p.head, p.body], { rotation: 0, x: 0, y: 0, scaleX: 1, duration: d });
    if (role === "idle") gsap.to(p.body, { y: 2, duration: 1.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
}

/* ---------------- moves ---------------- */

type Move = Partial<Record<"body" | "head" | "armL" | "armR" | "foreL" | "foreR" | "legL" | "legR" | "tail", Record<string, number>>> & { spin?: boolean };
const MOVES: Move[] = [
  { body: { x: -7, y: 0, rotation: -5 }, head: { rotation: 7 }, armL: { rotation: 40 }, armR: { rotation: 28 }, foreL: { rotation: -30 }, foreR: { rotation: -40 }, legL: { rotation: 12 }, legR: { rotation: -4 }, tail: { rotation: 16 } },
  { body: { x: -3, y: 7, rotation: -2 }, head: { rotation: 2 }, armL: { rotation: 18 }, armR: { rotation: -18 }, foreL: { rotation: -60 }, foreR: { rotation: 60 }, legL: { rotation: 6 }, legR: { rotation: -6 }, tail: { rotation: -6 } },
  { body: { x: 7, y: 0, rotation: 5 }, head: { rotation: -7 }, armL: { rotation: -28 }, armR: { rotation: -40 }, foreL: { rotation: 40 }, foreR: { rotation: 30 }, legL: { rotation: 4 }, legR: { rotation: -12 }, tail: { rotation: 18 } },
  { body: { x: 3, y: 7, rotation: 2 }, head: { rotation: -2 }, armL: { rotation: 18 }, armR: { rotation: -150 }, foreL: { rotation: -60 }, foreR: { rotation: 20 }, legL: { rotation: 6 }, legR: { rotation: -6 }, tail: { rotation: -10 } },
  { body: { x: 0, y: -14, rotation: 0 }, head: { rotation: 0 }, armL: { rotation: 150 }, armR: { rotation: -150 }, foreL: { rotation: 20 }, foreR: { rotation: -20 }, legL: { rotation: 16 }, legR: { rotation: -16 }, tail: { rotation: 30 } },
  { body: { x: 0, y: 7, rotation: 0 }, head: { rotation: 0 }, armL: { rotation: 130 }, armR: { rotation: -130 }, foreL: { rotation: 40 }, foreR: { rotation: -40 }, legL: { rotation: 2 }, legR: { rotation: -2 }, tail: { rotation: -14 } },
  { spin: true, body: { x: 0, y: 0, rotation: 0 }, head: { rotation: 0 }, armL: { rotation: 80 }, armR: { rotation: -80 }, foreL: { rotation: 0 }, foreR: { rotation: 0 }, legL: { rotation: 0 }, legR: { rotation: 0 }, tail: { rotation: 40 } },
  { body: { x: 4, y: 0, rotation: 5 }, head: { rotation: -12 }, armL: { rotation: 55 }, armR: { rotation: -165 }, foreL: { rotation: -110 }, foreR: { rotation: 10 }, legL: { rotation: -4 }, legR: { rotation: 18 }, tail: { rotation: 10 } },
];
const scaled = (v: Record<string, number>, k: number) => Object.fromEntries(Object.entries(v).map(([key, n]) => [key, n * k]));

function danceBeat(p: Parts, beat: number, period: number, energy: number) {
  const m = MOVES[beat % 8];
  const k = (reduced() ? 0.45 : 1) * (0.7 + 0.5 * energy);
  const d = Math.min(0.42, period * 0.48);
  for (const part of ["body", "head", "armL", "armR", "foreL", "foreR", "legL", "legR", "tail"] as const) {
    const target = m[part], el = p[part];
    if (!target || !el) continue;
    if (part === "body" && m.spin) {
      gsap.timeline().to(el, { scaleX: -1, duration: d * 0.6, ease: "power1.inOut", x: 0, y: -4 * k }).to(el, { scaleX: 1, duration: d * 0.6, ease: "power1.inOut", y: 0 });
    } else if (part === "body" && target.y < 0) {
      gsap.timeline().to(el, { ...scaled(target, k), duration: d * 0.55, ease: "power2.out" }).to(el, { y: 6 * k, duration: d * 0.5, ease: "power2.in" });
    } else if (part === "tail") {
      gsap.to(el, { ...scaled(target, k), duration: d * 1.3, ease: "power2.out", delay: 0.06 });
    } else {
      gsap.to(el, { ...scaled(target, k), duration: d, ease: "power3.out" });
    }
  }
}

function singBeat(p: Parts, beat: number, period: number, energy: number) {
  const k = (reduced() ? 0.45 : 1) * (0.6 + 0.5 * energy);
  const d = Math.min(0.5, period * 0.9);
  const side = (beat >> 1) & 1 ? 1 : -1;
  gsap.to(p.body, { x: 4 * side * k, rotation: 3 * side * k, y: beat & 1 ? 3 * k : 0, duration: d, ease: "sine.inOut" });
  gsap.to(p.head, { rotation: -5 * side * k, duration: d, ease: "sine.inOut" });
  if (p.tail) gsap.to(p.tail, { rotation: 8 * side * k, duration: d * 1.2, ease: "sine.inOut", delay: 0.05 });
  gsap.to(p.legL, { rotation: -4 + 3 * side * k, duration: d });
  gsap.to(p.legR, { rotation: 6 + 3 * side * k, duration: d });
}

/** Mouth, eyes and the free hand follow the voice, frame by frame. */
function singFrame(p: Parts, voice: number, now: number, notes: SVGGElement | null, x: number) {
  const open = Math.max(0, voice - 0.1) / 0.9;
  p.mouthOpen.setAttribute("ry", (1.2 + 9 * open).toFixed(2));
  p.mouthOpen.setAttribute("rx", (6 + 2.5 * open).toFixed(2));
  if (open > 0.86 && now > p.closedUntil) {
    show(p.eyesClosed, true);
    show(p.eyesOpen, false);
    p.eyesShut = true;
    p.closedUntil = now + 600;
  }
  if (p.eyesShut && now > p.closedUntil) {
    show(p.eyesClosed, false);
    show(p.eyesOpen, true);
    p.eyesShut = false;
  }
  if (open > 0.7 && !p.freeArmUp) {
    p.freeArmUp = true;
    gsap.to(p.armL, { rotation: 125 * (reduced() ? 0.5 : 1), duration: 0.5, ease: "back.out(1.4)" });
    gsap.to(p.foreL, { rotation: 20, duration: 0.5 });
  }
  if (open < 0.3 && p.freeArmUp) {
    p.freeArmUp = false;
    gsap.to(p.armL, { rotation: 8, duration: 0.8, ease: "power2.inOut" });
    gsap.to(p.foreL, { rotation: -20, duration: 0.8 });
  }
  if (notes && open > 0.45 && now - p.lastNote > 420 && !reduced()) {
    p.lastNote = now;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.textContent = Math.random() < 0.5 ? "♪" : "♫";
    el.setAttribute("fill", p.kind === "f" ? "#ff9cc5" : "#8ad8ff");
    el.setAttribute("font-size", String(14 + Math.random() * 8));
    el.setAttribute("x", String(x + (Math.random() - 0.5) * 20));
    el.setAttribute("y", "40");
    notes.appendChild(el);
    gsap.to(el, { y: -50 - Math.random() * 30, x: `+=${(Math.random() - 0.5) * 30}`, opacity: 0, rotation: (Math.random() - 0.5) * 40, duration: 1.4, ease: "power1.out", onComplete: () => el.remove() });
  }
}

/* ---------------- the component ---------------- */

export function TuneStage({
  singer,
  playing,
  beats,
  timing,
  fallbackBpm = 100,
  children,
}: {
  /** 1 a man sings, 2 a woman, 3 both, 0 nobody knows (both dance) */
  singer: number;
  playing: boolean;
  beats: BeatMap | null;
  timing: StageTiming | null;
  fallbackBpm?: number;
  children?: ReactNode;
}) {
  const left = useRef<SVGSVGElement>(null);
  const right = useRef<SVGSVGElement>(null);
  const notes = useRef<SVGGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const parts = useRef<{ m: Parts; f: Parts } | null>(null);
  const mark = useMemo(() => ({ m: rigMarkup("m"), f: rigMarkup("f") }), []);

  useEffect(() => {
    if (!left.current || !right.current) return;
    parts.current = { m: bind(left.current, "m"), f: bind(right.current, "f") };
    return () => {
      if (parts.current) gsap.killTweensOf([...limbs(parts.current.m), ...limbs(parts.current.f)]);
      parts.current = null;
    };
  }, []);

  // roles follow the singer
  useEffect(() => {
    const p = parts.current;
    if (!p) return;
    const live = playing && timing;
    setRole(p.m, !live ? "idle" : singer === 1 || singer === 3 ? "sing" : "dance");
    setRole(p.f, !live ? "idle" : singer === 2 || singer === 3 ? "sing" : "dance");
  }, [singer, playing, timing]);

  // the loop: beats drive the dancer, the voice drives the singer
  useEffect(() => {
    const p = parts.current;
    if (!p || !playing || !timing) return;
    let raf = 0;
    let lastBeat = -1;
    const period = beats ? 60 / beats.bpm : 60 / fallbackBpm;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const pos = (now - timing.startPerf) / 1000 + timing.offset;
      if (pos < 0) return;
      const idx = beats ? beatIndexAt(beats.beats, pos) : Math.floor(pos / period);
      const drum = beats ? curveAt(beats.drum, beats.frame, pos) : 0.6;
      const voice = beats ? curveAt(beats.voice, beats.frame, pos) : 0.35 + 0.35 * Math.max(0, Math.sin(pos * 2.2));
      if (idx !== lastBeat) {
        if (lastBeat >= 0 || idx > 0) {
          for (const av of [p.m, p.f]) {
            if (av.role === "dance") danceBeat(av, idx, period, drum);
            else if (av.role === "sing") singBeat(av, idx, period, voice);
          }
          if (root.current) root.current.style.setProperty("--beat", "1");
          gsap.to(root.current, { "--beat": 0, duration: Math.min(0.5, period * 0.8), overwrite: true });
        }
        lastBeat = idx;
      }
      for (const av of [p.m, p.f]) if (av.role === "sing") singFrame(av, voice, now, notes.current, av.kind === "m" ? 60 : 340);
      if (root.current) {
        root.current.style.setProperty("--voice", voice.toFixed(2));
        root.current.style.setProperty("--drum", drum.toFixed(2));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timing, beats, fallbackBpm]);

  return (
    <div className={`tn-stage ${playing ? "is-live" : ""}`} ref={root} data-singer={singer} aria-hidden="true">
      <div className="tn-stage-lights" />
      <div className="tn-stage-floor" />
      <svg className="tn-avatar tn-avatar-m" viewBox="40 20 120 245" ref={left} dangerouslySetInnerHTML={{ __html: mark.m }} />
      <div className="tn-stage-mid">{children}</div>
      <svg className="tn-avatar tn-avatar-f" viewBox="40 20 120 245" ref={right} dangerouslySetInnerHTML={{ __html: mark.f }} />
      <svg className="tn-stage-notes" viewBox="0 0 400 60">
        <g ref={notes} />
      </svg>
    </div>
  );
}
