import { useState, type ReactNode } from "react";
import { AV_COLORS, colorFor } from "../../account/Avatar";
import type { SeatView } from "../../shared/protocol";
import { useStore } from "../../store";
import { LimboScene, type Sway } from "./parts";
import { wants3d } from "./scene3d/gl";
import { Scene3D, type StageFigure } from "./scene3d/Scene3D";

export type { StageFigure } from "./scene3d/Scene3D";

/** Someone's colour, as their avatar and their drawn figure have it. */
export const seatColor = (seat: SeatView) => AV_COLORS[(seat.uid ? (seat.ac ?? 0) : colorFor(seat.id)) % AV_COLORS.length];
export const nameColor = (name: string) => AV_COLORS[colorFor(name) % AV_COLORS.length];

/**
 * The stage: the stands, the bar and the players, in 3D where the phone draws it (scene3d/), and
 * the drawn scene where it doesn't or can't keep up (`drawn`: what stands under the drawn bar).
 */
export function LimboStage({ angle, level, side = 0, sway, figures, drawn }: { angle: number; level: number; side?: number; sway?: Sway; figures: StageFigure[]; drawn?: ReactNode }) {
  const [three, setThree] = useState(() => wants3d());
  const { lang } = useStore();
  const zh = lang === "zh";
  const scene = (
    <LimboScene angle={angle} level={level} side={side} sway={sway}>
      {drawn}
    </LimboScene>
  );
  if (!three) return scene;
  const swaying = !!sway && sway.bar.kind === "moving";
  const label =
    (zh ? `第 ${level + 1} 杆，后仰 ${angle} 度` : `Bar ${level + 1}: lean back ${angle} degrees`) +
    (side ? (zh ? `，往${side > 0 ? "右" : "左"}歪 ${Math.abs(side)} 度` : `, tilt ${side > 0 ? "right" : "left"} ${Math.abs(side)} degrees`) : "") +
    (swaying ? (zh ? "，横杆上下浮动" : ", the bar floats up and down") : "");
  return <Scene3D angle={angle} side={side} sway={sway} figures={figures} label={label} onFail={() => setThree(false)} placeholder={scene} />;
}
