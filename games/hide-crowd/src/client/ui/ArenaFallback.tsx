// The arena without WebGL (an old phone, a browser with it switched off, a lost GPU context): the
// same crowd, top-down, drawn with plain elements. Each place in the crowd keeps one of the three
// looks, as in 3D, and nothing marks a player but this phone's own "you".
import { useEffect, useRef, useState } from "preact/hooks";
import { PLAYER_ACCELERATION, PLAYER_BRAKING, steerVelocity, type ArenaId } from "../../engine";
import type { AvatarView } from "../../room/protocol";
import { t } from "../i18n";
import { reducedNow } from "../prefs";

interface VisualAvatar {
  x: number;
  y: number;
}

export function ArenaFallback(props: {
  avatars: AvatarView[];
  arena: ArenaId;
  drift: { x: number; y: number };
  localVector: { x: number; y: number };
  maxSpeed: number;
  receivedAt: number;
  impactId: number;
  impactType: "tag" | "foul" | "swing" | "hide" | "over";
}) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const avatarNodes = useRef<Array<HTMLDivElement | null>>([]);
  const turnNodes = useRef<Array<HTMLSpanElement | null>>([]);
  const avatarTargets = useRef(props.avatars);
  const vectorRef = useRef(props.localVector);
  const speedRef = useRef(props.maxSpeed);
  const driftRef = useRef(props.drift);
  const receivedAtRef = useRef(props.receivedAt);
  const visuals = useRef<VisualAvatar[]>([]);
  const [shaking, setShaking] = useState(false);
  avatarTargets.current = props.avatars;
  vectorRef.current = props.localVector;
  speedRef.current = props.maxSpeed;
  driftRef.current = props.drift;
  receivedAtRef.current = props.receivedAt;

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const arena = arenaRef.current;
      if (!arena || document.hidden) return;
      const width = arena.clientWidth;
      const height = arena.clientHeight;
      const delta = previous ? Math.min(50, time - previous) : 16;
      previous = time;
      const ease = reducedNow() ? 1 : 1 - Math.exp(-delta / 44);
      const snapshot = avatarTargets.current;
      const vector = vectorRef.current;
      const predictionMs = Math.min(125, Math.max(0, Date.now() - receivedAtRef.current));
      const predictionSeconds = predictionMs / 1000;
      for (let index = 0; index < snapshot.length; index++) {
        const avatar = snapshot[index];
        const node = avatarNodes.current[index];
        if (!node) continue;
        let targetX = avatar.x;
        let targetY = avatar.y;
        if (avatar.me && predictionMs > 0) {
          const top = speedRef.current;
          const predicted = steerVelocity(
            { x: avatar.vx, y: avatar.vy },
            { x: vector.x * top + driftRef.current.x, y: vector.y * top + driftRef.current.y },
            predictionSeconds,
            PLAYER_ACCELERATION,
            PLAYER_BRAKING
          );
          targetX += (avatar.vx + predicted.x) * 0.5 * predictionSeconds;
          targetY += (avatar.vy + predicted.y) * 0.5 * predictionSeconds;
        }
        targetX = Math.max(5, Math.min(95, targetX));
        targetY = Math.max(6, Math.min(52, targetY));
        const visual = visuals.current[index] ?? (visuals.current[index] = { x: targetX, y: targetY });
        visual.x += (targetX - visual.x) * ease;
        visual.y += (targetY - visual.y) * ease;
        node.style.transform = `translate3d(${(width * visual.x) / 100}px, ${(height * visual.y) / 58}px, 0) translate(-50%, -50%)`;
        // (only the figure turns: the "you" label stays upright)
        const turn = turnNodes.current[index];
        if (turn) turn.style.transform = `rotate(${avatar.f}rad)`;
        const depth = String(Math.round(avatar.y * 10));
        if (node.style.zIndex !== depth) node.style.zIndex = depth;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (props.impactId < 1 || props.impactType !== "tag" || reducedNow()) return;
    setShaking(false);
    const frame = requestAnimationFrame(() => setShaking(true));
    const timer = window.setTimeout(() => setShaking(false), 280);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [props.impactId, props.impactType]);

  return (
    <div ref={arenaRef} class={`flat-arena flat-arena--${props.arena}${shaking ? " is-hit" : ""}`} role="img" aria-label={t("arena")}>
      {props.arena === "metro" && (
        <div class={`flat-belt ${props.drift.x < 0 ? "is-left" : props.drift.x > 0 ? "is-right" : ""}`} aria-hidden="true" />
      )}
      {props.arena === "gallery" && <div class="flat-spotlight" aria-hidden="true" />}
      {props.avatars.map((avatar, index) => (
        <div
          key={index}
          class={`flat-avatar look-${index % 3} pose-${avatar.p}${avatar.me ? " is-me" : ""}`}
          ref={(node) => {
            avatarNodes.current[index] = node;
          }}
          aria-hidden="true"
        >
          <span class="flat-avatar__shadow" />
          <span
            class="flat-avatar__turn"
            ref={(node) => {
              turnNodes.current[index] = node;
            }}
          >
            <span class="flat-avatar__body" />
            <span class="flat-avatar__head" />
            <span class="flat-avatar__arm" />
          </span>
          {avatar.me && <span class="flat-avatar__you">{t("marker")}</span>}
        </div>
      ))}
    </div>
  );
}
