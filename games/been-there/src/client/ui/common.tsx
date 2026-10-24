import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { GROUPS, STYLES, type Shape } from "../../engine";
import type { RoomView, TeamView } from "../../room/protocol";
import { CharacterArt, type Mood } from "../art/characters";
import { money, t, type Key } from "../i18n";
import { serverNow } from "../store";

/** Mid-tone team colours that hold up on light and dark backgrounds; the letter is the real identifier. */
export const TEAM_COLORS = ["#4a6683", "#8a4fc4", "#c23a5e", "#178a7a", "#b8670a", "#3b6fd6"];
export const TEAM_LETTERS = "ABCDEF";

/** Group shapes, so colour is never the only cue (colour-blind friendly). */
export function ShapeIcon({ shape, color, size = 12 }: { shape: Shape; color: string; size?: number }) {
  const s = size;
  const c = s / 2;
  const common = { fill: color, stroke: "rgba(0,0,0,.55)", "stroke-width": 1 };
  let el;
  switch (shape) {
    case "triangle":
      el = <polygon points={`${c},1 ${s - 1},${s - 1} 1,${s - 1}`} {...common} />;
      break;
    case "circle":
      el = <circle cx={c} cy={c} r={c - 1} {...common} />;
      break;
    case "diamond":
      el = <polygon points={`${c},1 ${s - 1},${c} ${c},${s - 1} 1,${c}`} {...common} />;
      break;
    case "square":
      el = <rect x={1.5} y={1.5} width={s - 3} height={s - 3} {...common} />;
      break;
    case "star": {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? c * 0.45 : c - 0.5;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
      }).join(" ");
      el = <polygon points={pts} {...common} />;
      break;
    }
    case "hexagon": {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${c + (c - 1) * Math.cos(a)},${c + (c - 1) * Math.sin(a)}`;
      }).join(" ");
      el = <polygon points={pts} {...common} />;
      break;
    }
    case "plus":
      el = (
        <path
          d={`M${c - s * 0.16},1h${s * 0.32}v${c - 1 - s * 0.16}h${c - 1 - s * 0.16}v${s * 0.32}h-${c - 1 - s * 0.16}v${c - 1 - s * 0.16}h-${s * 0.32}v-${c - 1 - s * 0.16}h-${c - 1 - s * 0.16}v-${s * 0.32}h${c - 1 - s * 0.16}z`}
          {...common}
        />
      );
      break;
    case "wave":
      el = <path d={`M1,${c + 2} q${s / 4},-${s / 2} ${s / 2 - 1},0 t${s / 2 - 1},0 v${c - 3} h-${s - 2} z`} {...common} />;
      break;
  }
  return (
    <svg class="shape" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {el}
    </svg>
  );
}

export function GroupIcon({ group, size }: { group: number; size?: number }) {
  const g = GROUPS.find((x) => x.id === group)!;
  return <ShapeIcon shape={g.shape} color={g.color} size={size} />;
}

export const Money = ({ n }: { n: number }) => <span class="num">{money(n)}</span>;

export function teamOf(v: RoomView, seat: number): TeamView | undefined {
  const id = v.game?.seats[seat];
  return v.teams.find((x) => x.id === id);
}

export function teamLabel(team: TeamView | undefined): string {
  if (!team) return "?";
  if (team.bot) return t("botTeam", { style: t(`style_${team.bot}` as Key) });
  return team.name;
}

export const seatName = (v: RoomView, seat: number) => teamLabel(teamOf(v, seat));

/** A team's token character, small, for chips and lists. */
export function TeamFace({ color, size = 26, mood }: { color: number; size?: number; mood?: Mood }) {
  return (
    <svg class="face" width={size} height={size} viewBox="14 18 92 92" aria-hidden="true">
      <CharacterArt kind={color} mood={mood} mini />
    </svg>
  );
}

export function TeamChip({ team, small, mood }: { team: TeamView | undefined; small?: boolean; mood?: Mood }) {
  if (!team) return null;
  return (
    <span class={`chip${small ? " small" : ""}`} style={{ "--team": TEAM_COLORS[team.color] }}>
      <TeamFace color={team.color} size={small ? 24 : 28} mood={mood} />
      <b>{TEAM_LETTERS[team.color]}</b>
      {!small && <span>{teamLabel(team)}</span>}
    </span>
  );
}

export function SeatChip({ v, seat, small }: { v: RoomView; seat: number; small?: boolean }) {
  return <TeamChip team={teamOf(v, seat)} small={small} />;
}

/** Seconds left until a server time, re-rendering as it counts down. */
export function useCountdown(until: number | null | undefined): number | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.ceil((until - serverNow()) / 1000));
}

export function Countdown({ until, label }: { until: number | null | undefined; label?: Key }) {
  const s = useCountdown(until);
  if (s === null) return null;
  return <span class="countdown num">{label ? t(label, { n: s }) : t("secs", { n: s })}</span>;
}

export function Btn(props: {
  onClick?: () => void;
  children: ComponentChildren;
  kind?: "primary" | "quiet" | "danger";
  disabled?: boolean;
  wide?: boolean;
  title?: string;
  /** The safe "no thanks" answer for this decision. */
  def?: boolean;
}) {
  return (
    <button
      type="button"
      class={`btn ${props.kind ?? ""}${props.wide ? " wide" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      data-default={props.def ? "" : undefined}
    >
      {props.children}
    </button>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div class="sheet-bg" onClick={onClose}>
      <div class="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" class="x" aria-label={t("close")} onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export const styleName = (id: keyof typeof STYLES) => t(`style_${id}` as Key);
