import { useEffect, useRef, useState } from "react";
import type { T } from "../../i18n";
import { useRoom, useRoomEvent } from "../../online/RoomContext";
import { DJ_TIMES, SET_PHASES, type CrateSong, type DjPhase, type Mix, type Scale, type Source, type StyleId } from "../../shared/dj/types";
import { useStore } from "../../store";

const t = (zh: string, en: string): T => ({ zh, en });

export const PHASE_NAMES: Record<DjPhase, T> = {
  wait: t("等开场", "Doors open"),
  warm: t("暖场", "Warm-up"),
  build: t("推高", "Build"),
  peak: t("顶点", "Peak"),
  cool: t("收尾", "Wind-down"),
  end: t("今晚到此", "That's the night"),
};
export const phaseName = (p: DjPhase, zh: boolean) => (zh ? PHASE_NAMES[p].zh : PHASE_NAMES[p].en);

/** The 12 styles' names, as the plan has them. */
export const STYLE_NAMES: Record<StyleId, T> = {
  latin: t("拉丁", "Latin"),
  house: t("浩室", "House"),
  techno: t("科技", "Techno"),
  trance: t("迷幻", "Trance"),
  bass: t("低音", "Bass"),
  dnb: t("鼓打贝斯", "Drum & bass"),
  hiphop: t("说唱", "Hip-hop"),
  rnb: t("R&B", "R&B"),
  afro: t("非洲节拍", "Afrobeats"),
  kpop: t("韩流", "K-pop club"),
  cpop: t("华语夜店", "C-pop club"),
  bhangra: t("旁遮普", "Bhangra"),
};

/** Lyria's keys are pairs (a major and its relative minor); club music here sits in the minor. */
const MINOR: Record<Scale, string> = {
  C_MAJOR_A_MINOR: "A",
  D_FLAT_MAJOR_B_FLAT_MINOR: "B♭",
  D_MAJOR_B_MINOR: "B",
  E_FLAT_MAJOR_C_MINOR: "C",
  E_MAJOR_D_FLAT_MINOR: "C♯",
  F_MAJOR_D_MINOR: "D",
  G_FLAT_MAJOR_E_FLAT_MINOR: "E♭",
  G_MAJOR_E_MINOR: "E",
  A_FLAT_MAJOR_F_MINOR: "F",
  A_MAJOR_G_FLAT_MINOR: "F♯",
  B_FLAT_MAJOR_G_MINOR: "G",
  B_MAJOR_A_FLAT_MINOR: "G♯",
  SCALE_UNSPECIFIED: "",
};

export function mixLine(mix: Mix, zh: boolean) {
  const styles = Object.entries(mix.weights)
    .filter(([, w]) => (w ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([id]) => STYLE_NAMES[id as StyleId])
    .filter(Boolean)
    .map((n) => (zh ? n.zh : n.en));
  const key = MINOR[mix.scale];
  const parts = [styles.join(" × "), `${mix.bpm} BPM`];
  if (key) parts.push(zh ? `${key} 小调` : `${key} minor`);
  return parts.join(" · ");
}

export const sourceName = (s: Source, zh: boolean) => (s === "fake" ? (zh ? "试音版 DJ" : "Sound-check DJ") : s === "local" ? (zh ? "你的歌" : "Your songs") : zh ? "AI DJ · 实验" : "AI DJ · lab");

/** What's playing, in one line. */
export function NowPlaying({ v, song }: { v: { mix: Mix; source: Source }; song?: CrateSong | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <span className="dj-now">
      <span className="dj-now-src">{sourceName(v.source, zh)}</span>
      {/* the host's song on the air, or the styles the DJ plays */}
      <span className="dj-now-mix">{song ? `${song.a ? `${song.a} · ` : ""}${song.t} · ${Math.round(song.bpm)} BPM` : mixLine(v.mix, zh)}</span>
    </span>
  );
}

/** Minutes until the night moves on by itself, or what waits for the host. */
export function phaseHint(v: { phase: DjPhase; nextAt: number }, now: number, zh: boolean) {
  const mins = v.nextAt ? Math.max(1, Math.ceil((v.nextAt - now) / 60_000)) : 0;
  switch (v.phase) {
    case "wait":
      return zh ? "大屏上点「开始派对」就开场" : "Press Start the party on the big screen";
    case "warm":
      return zh ? `${mins} 分钟后推高` : `Build in ${mins} min`;
    case "build":
      return zh ? `${mins} 分钟后到顶点` : `Peak in ${mins} min`;
    case "peak":
      return zh ? "顶点：主人说了算什么时候收" : "The peak: the host says when to wind down";
    case "cool":
      return zh ? `${mins} 分钟后结束` : `Ends in ${mins} min`;
    case "end":
      return zh ? "主人可以再来一场" : "The host can start another set";
  }
}

/** The night in four stretches, the one we're in lit. */
export function NightCurve({ v, now }: { v: { phase: DjPhase; nextAt: number }; now: number }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const at = SET_PHASES.indexOf(v.phase as (typeof SET_PHASES)[number]);
  return (
    <div className="dj-curve">
      <ol className="dj-curve-steps">
        {SET_PHASES.map((p, k) => (
          <li key={p} className={`${k === at ? "is-on" : ""} ${at > k || v.phase === "end" ? "is-past" : ""}`} style={{ ["--h" as string]: [0.4, 0.65, 1, 0.45][k] }}>
            <span className="dj-curve-bar" />
            <span className="dj-curve-name">{phaseName(p, zh)}</span>
          </li>
        ))}
      </ol>
      <span className="dj-curve-hint">{phaseHint(v, now, zh)}</span>
    </div>
  );
}

/** How long each stretch lasts by itself, for the rules. */
export const TIMES_MIN = { warm: DJ_TIMES.warm / 60_000, build: DJ_TIMES.build / 60_000, cool: DJ_TIMES.cool / 60_000, cap: DJ_TIMES.cap / 3_600_000 };

/**
 * 🔥 in the last minute (counted as the presses arrive, so it isn't capped by the 40 the room
 * keeps), and who pressed how many all night (the room's count, sent with every press).
 */
export function useHeat(v: { fires: { pid: string; at: number }[]; total: Record<string, number> }) {
  const { now } = useRoom();
  // presses from before this screen was listening come from the room's list; after, as they arrive
  const since = useRef(now());
  const [heard, setHeard] = useState<number[]>([]);
  useRoomEvent((e) => {
    if (e.k !== "fx" || e.fx !== "fire" || !e.pid) return;
    const at = now();
    setHeard((list) => [...list.filter((x) => at - x < 60_000), at]);
  });
  const t = now();
  const minute = v.fires.filter((f) => f.at < since.current && t - f.at < 60_000).length + heard.filter((x) => t - x < 60_000).length;
  const total = (pid: string) => v.total[pid] ?? 0;
  const top = Object.keys(v.total).sort((a, b) => total(b) - total(a));
  return { minute, total, top };
}

/** The stretch of the night the speakers are sounding now, checked a few times a second. */
export function useHeardPhase(dj: { heardSection(): { phase: DjPhase } | null }, on: boolean): DjPhase | null {
  const [phase, setPhase] = useState<DjPhase | null>(null);
  useEffect(() => {
    if (!on) {
      setPhase(null);
      return;
    }
    const id = window.setInterval(() => setPhase(dj.heardSection()?.phase ?? null), 120);
    return () => window.clearInterval(id);
  }, [dj, on]);
  return phase;
}
